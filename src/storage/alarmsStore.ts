import {db} from './database';
import type {DatabaseTransaction} from './database';
import {generateId} from '../utils';
import {oneShotDateFor} from '../scheduler/alarmSchedule';

/** A LAFINA alarm (alarm plan A2). Device-local; never synced. */
export interface Alarm {
  id: string;
  userId: string;
  hour: number;
  minute: number;
  /** Mon=1 … Sun=64; 0 = one-shot. */
  repeatDays: number;
  /** yyyy-MM-dd for a one-shot alarm. */
  oneShotDate: string | null;
  label: string;
  enabled: boolean;
  snoozeMinutes: number;
  vibrate: boolean;
  soundUri: string | null;
  /** Read today's schedule aloud after Dismiss (offline TTS). */
  briefing: boolean;
  generation: number;
  nextTriggerAt: string | null;
  lastFiredAt: string | null;
  lastOutcome: string | null;
  sourceReminderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlarmInput {
  hour: number;
  minute: number;
  repeatDays?: number;
  oneShotDate?: string | null;
  label?: string;
  enabled?: boolean;
  snoozeMinutes?: number;
  vibrate?: boolean;
  soundUri?: string | null;
  briefing?: boolean;
  sourceReminderId?: string | null;
}

export const ALARM_LABEL_MAX = 60;
export const DEFAULT_SNOOZE_MINUTES = 9;
export const MAX_ALARMS_PER_OWNER = 50;

type Executor = Pick<DatabaseTransaction, 'executeSync'> & {
  afterCommit?: (callback: () => void) => void;
};

type Row = Record<string, unknown>;

const listeners = new Set<(userId: string) => void>();

/** Called after any change is durable (alarmService re-books native alarms). */
export const onAlarmsChanged = (listener: (userId: string) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notify = (userId: string, executor?: Executor): void => {
  const run = () => {
    for (const listener of Array.from(listeners)) {
      try {
        listener(userId);
      } catch (error) {
        console.warn('[alarmsStore] change listener failed:', error);
      }
    }
  };
  if (executor?.afterCommit) executor.afterCommit(run);
  else run();
};

const fromRow = (row: Row): Alarm => ({
  id: String(row.id),
  userId: String(row.user_id),
  hour: Number(row.hour),
  minute: Number(row.minute),
  repeatDays: Number(row.repeat_days),
  oneShotDate: (row.one_shot_date as string | null) ?? null,
  label: String(row.label ?? ''),
  enabled: Number(row.enabled) === 1,
  snoozeMinutes: Number(row.snooze_minutes),
  vibrate: Number(row.vibrate) === 1,
  soundUri: (row.sound_uri as string | null) ?? null,
  briefing: Number(row.briefing) === 1,
  generation: Number(row.generation),
  nextTriggerAt: (row.next_trigger_at as string | null) ?? null,
  lastFiredAt: (row.last_fired_at as string | null) ?? null,
  lastOutcome: (row.last_outcome as string | null) ?? null,
  sourceReminderId: (row.source_reminder_id as string | null) ?? null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

/** Checks and normalizes the fields a student or the assistant can set. */
export const validateAlarmInput = (
  input: AlarmInput,
): {ok: true} | {ok: false; error: string} => {
  if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23)
    return {ok: false, error: 'Pick an hour between 0 and 23.'};
  if (!Number.isInteger(input.minute) || input.minute < 0 || input.minute > 59)
    return {ok: false, error: 'Pick a minute between 0 and 59.'};
  const days = input.repeatDays ?? 0;
  if (!Number.isInteger(days) || days < 0 || days > 127)
    return {ok: false, error: 'Invalid repeat days.'};
  if (
    input.oneShotDate != null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(input.oneShotDate)
  )
    return {ok: false, error: 'Invalid alarm date.'};
  if ((input.label ?? '').trim().length > ALARM_LABEL_MAX)
    return {
      ok: false,
      error: `Keep the label under ${ALARM_LABEL_MAX} characters.`,
    };
  const snooze = input.snoozeMinutes ?? DEFAULT_SNOOZE_MINUTES;
  if (!Number.isInteger(snooze) || snooze < 1 || snooze > 30)
    return {ok: false, error: 'Snooze must be 1 to 30 minutes.'};
  return {ok: true};
};

const nowIso = (): string => new Date().toISOString();

export const alarmsStore = {
  list(userId: string, executor: Executor = db): Alarm[] {
    return (
      executor.executeSync(
        'SELECT * FROM alarms WHERE user_id = ? ORDER BY hour, minute, created_at',
        [userId],
      ).rows ?? []
    ).map(row => fromRow(row as Row));
  },

  get(id: string, userId: string, executor: Executor = db): Alarm | null {
    const row = executor.executeSync(
      'SELECT * FROM alarms WHERE id = ? AND user_id = ?',
      [id, userId],
    ).rows?.[0];
    return row ? fromRow(row as Row) : null;
  },

  /**
   * Saves a new alarm. A one-shot alarm without a date rings the next time
   * that clock time comes (today if still ahead, else tomorrow).
   */
  create(
    userId: string,
    input: AlarmInput,
    executor: Executor = db,
    now: Date = new Date(),
  ): Alarm {
    const check = validateAlarmInput(input);
    if (!check.ok) throw new Error(check.error);
    const count = Number(
      executor.executeSync(
        'SELECT COUNT(*) AS n FROM alarms WHERE user_id = ?',
        [userId],
      ).rows?.[0]?.n ?? 0,
    );
    if (count >= MAX_ALARMS_PER_OWNER)
      throw new Error(`You can keep up to ${MAX_ALARMS_PER_OWNER} alarms.`);
    const repeatDays = input.repeatDays ?? 0;
    const oneShotDate =
      repeatDays === 0
        ? input.oneShotDate ?? oneShotDateFor(input.hour, input.minute, now)
        : null;
    const at = nowIso();
    const id = generateId('alarm');
    executor.executeSync(
      `INSERT INTO alarms (id, user_id, hour, minute, repeat_days, one_shot_date, label, enabled,
        snooze_minutes, vibrate, sound_uri, briefing, generation, source_reminder_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        id,
        userId,
        input.hour,
        input.minute,
        repeatDays,
        oneShotDate,
        (input.label ?? '').trim(),
        input.enabled === false ? 0 : 1,
        input.snoozeMinutes ?? DEFAULT_SNOOZE_MINUTES,
        input.vibrate === false ? 0 : 1,
        input.soundUri ?? null,
        input.briefing ? 1 : 0,
        input.sourceReminderId ?? null,
        at,
        at,
      ],
    );
    notify(userId, executor);
    return alarmsStore.get(id, userId, executor) as Alarm;
  },

  /** Changes an alarm; every change bumps the generation so a stale booking never rings. */
  update(
    id: string,
    userId: string,
    patch: Partial<AlarmInput>,
    executor: Executor = db,
    now: Date = new Date(),
  ): Alarm | null {
    const current = alarmsStore.get(id, userId, executor);
    if (!current) return null;
    const merged: AlarmInput = {
      hour: patch.hour ?? current.hour,
      minute: patch.minute ?? current.minute,
      repeatDays: patch.repeatDays ?? current.repeatDays,
      oneShotDate:
        patch.oneShotDate !== undefined
          ? patch.oneShotDate
          : current.oneShotDate,
      label: patch.label ?? current.label,
      enabled: patch.enabled ?? current.enabled,
      snoozeMinutes: patch.snoozeMinutes ?? current.snoozeMinutes,
      vibrate: patch.vibrate ?? current.vibrate,
      soundUri:
        patch.soundUri !== undefined ? patch.soundUri : current.soundUri,
      briefing: patch.briefing ?? current.briefing,
    };
    const check = validateAlarmInput(merged);
    if (!check.ok) throw new Error(check.error);
    const repeatDays = merged.repeatDays ?? 0;
    // A one-shot whose time or switch changed rings at the next such time again.
    const timeChanged =
      merged.hour !== current.hour || merged.minute !== current.minute;
    const reEnabled = merged.enabled && !current.enabled;
    const oneShotDate =
      repeatDays !== 0
        ? null
        : patch.oneShotDate !== undefined && patch.oneShotDate !== null
        ? patch.oneShotDate
        : timeChanged || reEnabled || !current.oneShotDate
        ? oneShotDateFor(merged.hour, merged.minute, now)
        : current.oneShotDate;
    executor.executeSync(
      `UPDATE alarms SET hour = ?, minute = ?, repeat_days = ?, one_shot_date = ?, label = ?, enabled = ?,
        snooze_minutes = ?, vibrate = ?, sound_uri = ?, briefing = ?, generation = generation + 1, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        merged.hour,
        merged.minute,
        repeatDays,
        oneShotDate,
        (merged.label ?? '').trim(),
        merged.enabled ? 1 : 0,
        merged.snoozeMinutes ?? DEFAULT_SNOOZE_MINUTES,
        merged.vibrate ? 1 : 0,
        merged.soundUri ?? null,
        merged.briefing ? 1 : 0,
        nowIso(),
        id,
        userId,
      ],
    );
    notify(userId, executor);
    return alarmsStore.get(id, userId, executor);
  },

  setEnabled(
    id: string,
    userId: string,
    enabled: boolean,
    executor: Executor = db,
  ): Alarm | null {
    return alarmsStore.update(id, userId, {enabled}, executor);
  },

  remove(id: string, userId: string, executor: Executor = db): boolean {
    const result = executor.executeSync(
      'DELETE FROM alarms WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    const removed = Number(result.rowsAffected ?? 0) > 0;
    if (removed) notify(userId, executor);
    return removed;
  },

  /** Clear All Data: every alarm of this owner. */
  clear(userId: string, executor: Executor = db): void {
    executor.executeSync('DELETE FROM alarms WHERE user_id = ?', [userId]);
    notify(userId, executor);
  },

  /**
   * Native rang a one-shot alarm and switched its copy off; JS mirrors that
   * only for the same generation (a newer edit wins).
   */
  markOneShotDone(id: string, generation: number): void {
    db.executeSync(
      'UPDATE alarms SET enabled = 0, next_trigger_at = NULL, updated_at = ? WHERE id = ? AND generation = ? AND repeat_days = 0',
      [nowIso(), id, generation],
    );
  },

  recordOutcome(id: string, outcome: string, atIso: string): void {
    if (outcome === 'fired')
      db.executeSync(
        'UPDATE alarms SET last_fired_at = ?, last_outcome = ? WHERE id = ?',
        [atIso, outcome, id],
      );
    else
      db.executeSync('UPDATE alarms SET last_outcome = ? WHERE id = ?', [
        outcome,
        id,
      ]);
  },

  setNextTrigger(id: string, nextIso: string | null): void {
    db.executeSync('UPDATE alarms SET next_trigger_at = ? WHERE id = ?', [
      nextIso,
      id,
    ]);
  },
};
