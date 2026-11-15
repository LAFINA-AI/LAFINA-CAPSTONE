import type {DatabaseTransaction} from './database';

/**
 * Schema 27: LAFINA alarms (alarm plan A2).
 *
 * Device-local and never synchronized (owner decision 1, recommended option):
 * an alarm belongs to the phone that rings, the seven sync entities are
 * unchanged, and two devices never ring together. Native keeps its own copy
 * of the active owner's alarms (ADR-016), refreshed by `alarmService`.
 */
export const ALARMS_TABLE = 'alarms';

export const migrateAlarms = (
  tx: Pick<DatabaseTransaction, 'executeSync'>,
): void => {
  tx.executeSync(`CREATE TABLE IF NOT EXISTS alarms (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
    minute INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 59),
    repeat_days INTEGER NOT NULL DEFAULT 0 CHECK (repeat_days BETWEEN 0 AND 127),
    one_shot_date TEXT,
    label TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
    snooze_minutes INTEGER NOT NULL DEFAULT 9 CHECK (snooze_minutes BETWEEN 1 AND 30),
    vibrate INTEGER NOT NULL DEFAULT 1 CHECK (vibrate IN (0,1)),
    sound_uri TEXT,
    briefing INTEGER NOT NULL DEFAULT 0 CHECK (briefing IN (0,1)),
    generation INTEGER NOT NULL DEFAULT 1,
    next_trigger_at TEXT,
    last_fired_at TEXT,
    last_outcome TEXT,
    source_reminder_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_alarms_user ON alarms(user_id, hour, minute)',
  );
};
