import {db} from '../storage/database';
import type {DatabaseTransaction} from '../storage/database';
import type {CallRequest} from './callAdmission';
import {remindersStore} from '../storage/remindersStore';
import {deliveryStore} from '../storage/deliveryStore';
import {createNextRecurringReminder} from './reminderActions';
import {scheduleReminderAlarm} from './reminderAlarm';

const KEY = 'reminder.callQueue.v1';
export const ANSWERED_CALL_LIMIT_MS = 10 * 60_000;
export const QUEUED_CALL_LIMIT_MS = 15 * 60_000;
export interface CallLease {
  request: CallRequest;
  receivedAt: number;
  deadline: number;
  state: 'queued' | 'ringing' | 'answered';
  dueAt?: number;
}
export const sameCall = (a: CallRequest, b: CallRequest): boolean =>
  a.reminderId === b.reminderId &&
  a.ownerId === b.ownerId &&
  a.generation === b.generation;

/** Local-only metadata in lafina.db, never an eighth sync entity. */
export const callLifecycle = {
  list(owner: string): CallLease[] {
    const row = db.executeSync(
      'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
      [owner, KEY],
    ).rows[0];
    const entries: unknown = row ? JSON.parse(String(row.value)) : [];
    if (!Array.isArray(entries)) throw new Error('Unsupported reminder queue');
    return (entries as CallLease[]).sort(
      (a, b) =>
        (a.dueAt ?? a.receivedAt) - (b.dueAt ?? b.receivedAt) ||
        a.receivedAt - b.receivedAt,
    );
  },
  write(owner: string, entries: CallLease[]): void {
    db.executeSync(
      `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [owner, KEY, JSON.stringify(entries), new Date().toISOString()],
    );
  },
  put(
    owner: string,
    request: CallRequest,
    state: CallLease['state'] = 'queued',
    executor?: DatabaseTransaction,
  ): void {
    const save = () => {
      const entries = this.list(owner);
      const existing = entries.find(entry => sameCall(entry.request, request));
      if (existing) {
        if (state !== 'queued') {
          existing.state = state;
          existing.deadline =
            Date.now() +
            (state === 'answered' ? ANSWERED_CALL_LIMIT_MS : 45_000);
        }
      } else {
        entries.push({
          request: {...request, task: undefined},
          receivedAt: Date.now(),
          dueAt:
            Date.parse(
              remindersStore.getReminderById(request.reminderId)?.triggerAt ??
                '',
            ) || Date.now(),
          deadline:
            Date.now() +
            (state === 'queued'
              ? QUEUED_CALL_LIMIT_MS
              : state === 'answered'
              ? ANSWERED_CALL_LIMIT_MS
              : 45_000),
          state,
        });
      }
      this.write(owner, entries);
    };
    if (executor) save();
    else db.transactionSync(save);
  },
  remove(owner: string, request: CallRequest): void {
    this.write(
      owner,
      this.list(owner).filter(entry => !sameCall(entry.request, request)),
    );
  },
  expire(owner: string, request: CallRequest): void {
    const reminder = remindersStore.getReminderById(request.reminderId);
    if (
      reminder &&
      deliveryStore.checkFence(reminder.id, owner, request.generation).ok
    ) {
      db.transactionSync(tx => {
        remindersStore.updateReminderStatus(
          reminder.id,
          'missed',
          guard =>
            deliveryStore.assertFence(
              guard,
              reminder.id,
              owner,
              request.generation,
            ),
          tx,
        );
        const next = createNextRecurringReminder(
          reminder,
          owner,
          tx,
          new Date(),
        );
        if (next)
          tx.afterCommit?.(() => {
            void scheduleReminderAlarm(
              next.id,
              next.task,
              next.triggerAt,
            ).catch(() => undefined);
          });
        this.remove(owner, request);
      });
    } else this.remove(owner, request);
  },
  protects(owner: string, id: string, generation: number | undefined): boolean {
    return this.list(owner).some(
      entry =>
        entry.request.reminderId === id &&
        entry.request.generation === generation &&
        entry.deadline > Date.now(),
    );
  },
};
