import {db} from '../storage/database';
import {deliveryStore} from '../storage/deliveryStore';
import {remindersStore} from '../storage/remindersStore';
import {alertSuppression} from '../storage/sourceReminders';
import {callLifecycle} from './callLifecycle';
import type {CallRequest} from './callAdmission';
import {finishNativeIncomingCall, scheduleReminderAlarm} from './reminderAlarm';
import {createNextRecurringReminder} from './reminderActions';
import {getReminderPreferences} from './userPreferences';

/** Native may have auto-snoozed while JS was absent. Adopt once before admission. */
export const recoverNativeCall = (
  request: CallRequest,
  owner: string,
): CallRequest | null => {
  const count = request.timeoutCount ?? 0;
  if (!count) return request;
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    !Number.isFinite(request.retryAtMs)
  )
    return null;
  const reminder = remindersStore.getReminderById(request.reminderId);
  const fence = deliveryStore.checkFence(
    request.reminderId,
    owner,
    request.generation,
  );
  if (
    !reminder ||
    reminder.userId !== owner ||
    !fence.ok ||
    alertSuppression(db, reminder)
  ) {
    void finishNativeIncomingCall(
      request.reminderId,
      request.ownerId ?? owner,
      request.generation,
    );
    return null;
  }
  const preferences = getReminderPreferences(owner);
  const remaining = Math.max(
    0,
    preferences.maxSnoozeCount - reminder.snoozeCount,
  );
  const missed = count > remaining;
  const ringing = !missed && request.action !== 'timeout';
  const triggerAt = new Date(request.retryAtMs!).toISOString();
  let next: {id: string; task: string; triggerAt: string} | null = null;
  let adopted: CallRequest | null = null;
  db.transactionSync(tx => {
    remindersStore.adoptCallTimeout(
      reminder.id,
      missed ? 'missed' : ringing ? 'triggered' : 'snoozed',
      triggerAt,
      reminder.snoozeCount + Math.min(count, remaining),
      transaction =>
        deliveryStore.assertFence(
          transaction,
          reminder.id,
          owner,
          request.generation,
        ),
      tx,
    );
    const entries = callLifecycle
      .list(owner)
      .filter(entry => entry.request.reminderId !== reminder.id);
    if (ringing) {
      adopted = {
        ...request,
        timeoutCount: 0,
        generation: deliveryStore.get(reminder.id)?.generation,
        action: 'call',
      };
      entries.push({
        request: adopted,
        receivedAt: Date.now(),
        deadline: Date.now() + 45_000,
        state: 'queued',
      });
    }
    callLifecycle.write(owner, entries);
    if (missed)
      next = createNextRecurringReminder(reminder, owner, tx, new Date());
  });
  // A replay sees a different/retired SQLite generation and cannot increment again.
  void finishNativeIncomingCall(reminder.id, owner, request.generation);
  const future = next as {id: string; task: string; triggerAt: string} | null;
  if (future)
    void scheduleReminderAlarm(future.id, future.task, future.triggerAt).catch(
      () => undefined,
    );
  if (!missed && !ringing && request.retryAtMs! > Date.now())
    void scheduleReminderAlarm(reminder.id, reminder.task, triggerAt).catch(
      () => undefined,
    );
  return adopted;
};
