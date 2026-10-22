import type {LocalSqlConnection} from './preferencesRepository';

const SCHEMA_VERSION = 2;
const activeTransactions = new WeakSet<LocalSqlConnection>();
const failedConnections = new WeakSet<LocalSqlConnection>();

export function assertDatabaseUsable(db: LocalSqlConnection): void {
  if (failedConnections.has(db)) {
    throw new Error(
      'Restart the app before retrying storage. The previous transaction could not be rolled back.',
    );
  }
}

/** The callback must finish synchronously, before this connection can be reused. */
export function inTransaction<T>(db: LocalSqlConnection, callback: () => T): T {
  assertDatabaseUsable(db);
  if (Object.prototype.toString.call(callback) === '[object AsyncFunction]') {
    throw new Error('SQLite transactions require a synchronous callback.');
  }
  if (activeTransactions.has(db)) {
    throw new Error('Nested SQLite transactions are not supported.');
  }
  db.execute('BEGIN IMMEDIATE');
  activeTransactions.add(db);
  try {
    const result = callback();
    if (
      result !== null &&
      (typeof result === 'object' || typeof result === 'function') &&
      typeof (result as {then?: unknown}).then === 'function'
    ) {
      // Observe a rejected promise as well as refusing it; never commit async work.
      void Promise.resolve(result).catch(() => undefined);
      throw new Error('SQLite transactions require a synchronous callback.');
    }
    db.execute('COMMIT');
    return result;
  } catch (error) {
    try {
      db.execute('ROLLBACK');
    } catch {
      // Never let a later one-statement preference write appear durable inside
      // a transaction whose rollback failed. All shared-connection access stops.
      failedConnections.add(db);
      throw new Error(
        'SQLite rollback failed. Restart the app before retrying.',
      );
    }
    throw error;
  } finally {
    activeTransactions.delete(db);
  }
}

const versionOneStatements = [
  `CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL
  )`,
  `CREATE TABLE local_profile (
    id TEXT PRIMARY KEY NOT NULL CHECK (id = 'local'),
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE tasks (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    notes TEXT NOT NULL,
    due_at TEXT,
    due_date TEXT,
    reminder_lead_minutes INTEGER CHECK (reminder_lead_minutes IS NULL OR (typeof(reminder_lead_minutes)='integer' AND reminder_lead_minutes BETWEEN 0 AND 120)),
    timezone TEXT NOT NULL CHECK (length(trim(timezone)) > 0),
    status TEXT NOT NULL CHECK (status IN ('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK (due_at IS NULL OR due_date IS NULL)
  )`,
  `CREATE TABLE events (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    notes TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    timezone TEXT NOT NULL CHECK (length(trim(timezone)) > 0),
    recurrence TEXT,
    reminder_lead_minutes INTEGER CHECK (reminder_lead_minutes IS NULL OR (typeof(reminder_lead_minutes)='integer' AND reminder_lead_minutes BETWEEN 0 AND 120)),
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CANCELLED')),
    version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK (end_at > start_at)
  )`,
  `CREATE TABLE reminders (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    occurrence_key TEXT NOT NULL CHECK (length(occurrence_key) > 0),
    scheduled_at TEXT NOT NULL,
    lead_minutes INTEGER NOT NULL CHECK (typeof(lead_minutes) = 'integer' AND lead_minutes >= 0),
    status TEXT NOT NULL CHECK (status IN ('SCHEDULED', 'RINGING', 'ACKNOWLEDGED', 'SNOOZED', 'MISSED', 'CANCELLED')),
    version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version >= 1),
    last_outcome_at TEXT,
    UNIQUE (task_id, occurrence_key),
    UNIQUE (event_id, occurrence_key),
    CHECK ((task_id IS NOT NULL AND event_id IS NULL) OR (task_id IS NULL AND event_id IS NOT NULL))
  )`,
  `CREATE TABLE reminder_jobs (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    reminder_id TEXT NOT NULL UNIQUE REFERENCES reminders(id) ON DELETE CASCADE,
    occurrence_key TEXT NOT NULL CHECK (length(occurrence_key) > 0),
    run_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'RINGING', 'ACKNOWLEDGED', 'MISSED', 'CANCELLED')),
    generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation >= 0),
    attempt_count INTEGER NOT NULL CHECK (typeof(attempt_count) = 'integer' AND attempt_count >= 0),
    delivery_state TEXT NOT NULL DEFAULT 'UNAVAILABLE' CHECK (delivery_state IN ('UNAVAILABLE', 'PENDING', 'REGISTERED', 'FAILED')),
    delivery_reason TEXT
  )`,
  `CREATE TABLE operation_receipts (
    token TEXT PRIMARY KEY NOT NULL CHECK (length(trim(token)) > 0),
    fingerprint TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    created_at TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    text TEXT NOT NULL,
    action_id TEXT
  )`,
  'CREATE INDEX tasks_upcoming ON tasks (status, due_at, id)',
  'CREATE INDEX tasks_due_date ON tasks (status, due_date, id)',
  'CREATE INDEX events_upcoming ON events (status, start_at, id)',
  'CREATE INDEX reminders_pending ON reminders (status, scheduled_at, id)',
  'CREATE INDEX reminder_jobs_pending ON reminder_jobs (status, run_at, id)',
  'CREATE INDEX chat_messages_recent ON chat_messages (created_at, id)',
];

const versionTwoStatements = [
  'ALTER TABLE reminder_jobs ADD COLUMN ringing_deadline TEXT',
  'ALTER TABLE reminder_jobs ADD COLUMN notified_at TEXT',
  `CREATE TABLE native_delivery_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    full_screen INTEGER NOT NULL DEFAULT 0 CHECK (full_screen IN (0, 1))
  )`,
  'INSERT INTO native_delivery_settings (id, enabled, full_screen) VALUES (1, 0, 0)',
  // Derived registrations outlive source deletion until Android cancellation succeeds.
  `CREATE TABLE native_alarm_registrations (
    job_id TEXT PRIMARY KEY NOT NULL,
    generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation >= 1),
    occurrence_key TEXT NOT NULL,
    run_at TEXT NOT NULL,
    precision TEXT NOT NULL CHECK (precision IN ('EXACT', 'INEXACT')),
    scheduled_at TEXT NOT NULL
  )`,
  `CREATE TABLE native_alarm_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation >= 1),
    event TEXT NOT NULL,
    at_utc TEXT NOT NULL,
    planned_at TEXT,
    detail TEXT
  )`,
];

/** Migrates only capstone data. Unsupported future schemas are never rewritten. */
export function initializePlannerDatabase(
  db: LocalSqlConnection,
  nowUtc = new Date().toISOString(),
): void {
  db.execute('PRAGMA foreign_keys = ON');
  db.execute('PRAGMA busy_timeout = 5000');
  const version = db.execute('PRAGMA user_version')[0]?.user_version;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new Error('Unable to read the capstone database schema version.');
  }
  if (version > SCHEMA_VERSION || version < 0) {
    throw new Error('This database requires a newer supported app version.');
  }
  if (version === SCHEMA_VERSION) {
    return;
  }
  if (!Number.isFinite(Date.parse(nowUtc))) {
    throw new Error('Invalid migration timestamp.');
  }
  inTransaction(db, () => {
    if (version === 0) {
      for (const statement of versionOneStatements) {
        db.execute(statement);
      }
      db.execute('INSERT INTO local_profile (id, created_at) VALUES (?, ?)', [
        'local',
        nowUtc,
      ]);
      db.execute('PRAGMA user_version = 1');
    }
    for (const statement of versionTwoStatements) {
      db.execute(statement);
    }
    if (version === 1) {
      // Phase 02 rings were data simulations with no Android notification or
      // deadline. End those paired simulations rather than inventing delivery.
      db.execute(
        "UPDATE reminder_jobs SET status='MISSED',delivery_state='UNAVAILABLE',delivery_reason='LEGACY_SIMULATION_ENDED' WHERE status='RINGING' AND reminder_id IN (SELECT id FROM reminders WHERE status='RINGING')",
      );
      db.execute(
        "UPDATE reminders SET status='MISSED',version=version+1,last_outcome_at=COALESCE(last_outcome_at,?) WHERE status='RINGING' AND id IN (SELECT reminder_id FROM reminder_jobs WHERE status='MISSED' AND delivery_reason='LEGACY_SIMULATION_ENDED')",
        [nowUtc],
      );
    }
    // The version is committed with all DDL and data, so a retry sees no half migration.
    db.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
