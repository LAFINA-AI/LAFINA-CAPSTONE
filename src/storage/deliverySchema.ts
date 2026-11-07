import type {DatabaseTransaction} from './database';

/**
 * Schema 19 (AGY-PORT 03): device-local reminder delivery jobs.
 *
 * One job row per reminder, derived from the authoritative `reminders` row by
 * SQLite triggers, so every writer (manual UI, assistant, sync pull, guest
 * rekey, task/time-block cascades, raw cleanup) keeps the job consistent inside
 * its own transaction. The triggers write only these local tables: never
 * `sync_outbox`, never `reminders`, so they cannot echo or double-enqueue, and
 * the job owner always equals the reminder owner.
 *
 * Generation is the delivery identity. It increments when the alarm instant,
 * owner or deletion changes, or when a reminder is re-armed after ringing or
 * closing. pending -> triggered keeps the generation, so the identity captured
 * by the ringing call still matches when the student answers. Terminal
 * statuses retire the job without a bump; a retired job refuses identity-bound
 * actions.
 *
 * Nothing here is synchronized: the seven wire payloads are unchanged.
 */

const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Job state for a reminders row alias (`NEW`, `OLD` or a table alias). */
const jobStateSql = (row: string): string =>
  `(CASE WHEN ${row}.deleted_at IS NOT NULL THEN 'retired'
     WHEN ${row}.status IN ('pending','snoozed') THEN 'armed'
     WHEN ${row}.status = 'triggered' THEN 'ringing'
     ELSE 'retired' END)`;

const BUMP_SQL = `(OLD.user_id IS NOT NEW.user_id
   OR OLD.trigger_at IS NOT NEW.trigger_at
   OR ((OLD.deleted_at IS NULL) <> (NEW.deleted_at IS NULL))
   OR (${jobStateSql('OLD')} <> 'armed' AND ${jobStateSql('NEW')} = 'armed'))`;

export const DELIVERY_EVENT_RETENTION = 500;

export const DELIVERY_TABLES = [
  'reminder_delivery_jobs',
  'reminder_delivery_events',
] as const;

export const DELIVERY_TRIGGERS = [
  'reminder_delivery_after_insert',
  'reminder_delivery_after_update',
  'reminder_delivery_after_delete',
  'reminder_delivery_events_bound',
] as const;

export const migrateReminderDelivery = (tx: DatabaseTransaction): void => {
  tx.executeSync(`CREATE TABLE IF NOT EXISTS reminder_delivery_jobs (
    reminder_id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK (generation >= 1),
    state TEXT NOT NULL CHECK (state IN ('armed','ringing','retired')),
    trigger_at TEXT NOT NULL,
    registration_state TEXT NOT NULL DEFAULT 'unregistered'
      CHECK (registration_state IN ('unregistered','registered','failed','suppressed','idle')),
    registered_generation INTEGER NOT NULL DEFAULT 0,
    registration_error TEXT,
    registration_attempts INTEGER NOT NULL DEFAULT 0,
    source_type TEXT CHECK (source_type IS NULL OR source_type IN ('task','event','time_block')),
    source_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_delivery_jobs_owner ON reminder_delivery_jobs(user_id, state, trigger_at)',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_delivery_jobs_source ON reminder_delivery_jobs(user_id, source_type, source_id)',
  );
  // Redacted evidence: identifiers and codes only, never reminder text.
  tx.executeSync(`CREATE TABLE IF NOT EXISTS reminder_delivery_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    generation INTEGER NOT NULL,
    event TEXT NOT NULL,
    code TEXT,
    origin TEXT NOT NULL CHECK (origin IN ('js','native')),
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_delivery_events_reminder ON reminder_delivery_events(reminder_id, id)',
  );
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS reminder_delivery_events_bound
    AFTER INSERT ON reminder_delivery_events BEGIN
      DELETE FROM reminder_delivery_events
       WHERE id <= NEW.id - ${DELIVERY_EVENT_RETENTION};
    END`);

  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS reminder_delivery_after_insert
    AFTER INSERT ON reminders BEGIN
      INSERT INTO reminder_delivery_jobs (
        reminder_id, user_id, generation, state, trigger_at,
        registration_state, created_at, updated_at
      ) VALUES (
        NEW.id, NEW.user_id, 1, ${jobStateSql('NEW')}, NEW.trigger_at,
        CASE WHEN ${jobStateSql(
          'NEW',
        )} = 'armed' THEN 'unregistered' ELSE 'idle' END,
        ${NOW_SQL}, ${NOW_SQL}
      )
      ON CONFLICT(reminder_id) DO UPDATE SET
        generation = generation + 1,
        user_id = excluded.user_id,
        state = excluded.state,
        trigger_at = excluded.trigger_at,
        registration_state = excluded.registration_state,
        registration_error = NULL,
        updated_at = excluded.updated_at;
    END`);

  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS reminder_delivery_after_update
    AFTER UPDATE OF user_id, trigger_at, status, deleted_at, task ON reminders
    WHEN OLD.user_id IS NOT NEW.user_id
      OR OLD.trigger_at IS NOT NEW.trigger_at
      OR OLD.status IS NOT NEW.status
      OR OLD.deleted_at IS NOT NEW.deleted_at
      OR OLD.task IS NOT NEW.task
    BEGIN
      INSERT INTO reminder_delivery_jobs (
        reminder_id, user_id, generation, state, trigger_at,
        registration_state, created_at, updated_at
      ) VALUES (
        NEW.id, NEW.user_id, 1, ${jobStateSql('NEW')}, NEW.trigger_at,
        CASE WHEN ${jobStateSql(
          'NEW',
        )} = 'armed' THEN 'unregistered' ELSE 'idle' END,
        ${NOW_SQL}, ${NOW_SQL}
      )
      ON CONFLICT(reminder_id) DO UPDATE SET
        generation = generation + CASE WHEN ${BUMP_SQL} THEN 1 ELSE 0 END,
        user_id = excluded.user_id,
        state = excluded.state,
        trigger_at = excluded.trigger_at,
        registration_state = CASE
          WHEN excluded.state <> 'armed' THEN 'idle'
          WHEN ${BUMP_SQL} OR OLD.task IS NOT NEW.task THEN 'unregistered'
          ELSE registration_state END,
        registration_error = CASE
          WHEN excluded.state <> 'armed' OR ${BUMP_SQL} OR OLD.task IS NOT NEW.task
          THEN NULL ELSE registration_error END,
        updated_at = excluded.updated_at;
    END`);

  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS reminder_delivery_after_delete
    AFTER DELETE ON reminders BEGIN
      UPDATE reminder_delivery_jobs
         SET generation = generation + 1, state = 'retired',
             registration_state = 'idle', registration_error = NULL,
             updated_at = ${NOW_SQL}
       WHERE reminder_id = OLD.id;
    END`);

  // Backfill every existing reminder. Old Android registrations carry no
  // generation; the native cutover adopts them as generation 0 until the JS
  // reconcile replaces them with these identities.
  tx.executeSync(`INSERT OR IGNORE INTO reminder_delivery_jobs (
      reminder_id, user_id, generation, state, trigger_at,
      registration_state, created_at, updated_at
    )
    SELECT r.id, r.user_id, 1, ${jobStateSql('r')}, r.trigger_at,
      CASE WHEN ${jobStateSql(
        'r',
      )} = 'armed' THEN 'unregistered' ELSE 'idle' END,
      ${NOW_SQL}, ${NOW_SQL}
    FROM reminders r`);
};
