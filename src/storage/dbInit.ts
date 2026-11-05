import {db, storageErrorMessage, StorageUnavailableError} from './database';
import type {
  DatabaseService,
  DatabaseTransaction,
  StorageFailureReason,
} from './database';
import {
  DEFAULT_WAKE_TIME,
  DEFAULT_SLEEP_TIME,
  DEFAULT_STUDY_PEAK_HOURS,
  DEFAULT_BUSIEST_DAY,
  DEFAULT_REMINDER_LEAD,
  DEFAULT_SNOOZE_TENDENCY,
  DEFAULT_CLASS_COUNT,
  DEFAULT_LONGEST_GAP,
  DEFAULT_VOICE_CALLS,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_DAILY_DIGEST,
  DEFAULT_QUIET_HOURS,
} from '../constants';

export interface SchemaMigration {
  /** The `user_version` this step produces. */
  version: number;
  description: string;
  /** Runs inside the single upgrade transaction; must be synchronous and additive. */
  up: (tx: DatabaseTransaction) => void;
}

/** Every database at or above this version already has the baseline tables. */
const BASELINE_SCHEMA_VERSION = 17;

/**
 * Ordered upgrade steps after the AGY baseline. To change the schema, append one
 * step whose `version` is the next integer; `CURRENT_SCHEMA_VERSION` follows.
 */
export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [];

const targetVersionOf = (migrations: readonly SchemaMigration[]): number =>
  migrations.length > 0
    ? migrations[migrations.length - 1].version
    : BASELINE_SCHEMA_VERSION;

export const CURRENT_SCHEMA_VERSION = targetVersionOf(SCHEMA_MIGRATIONS);

/** Rejects a developer error (gap, duplicate, reorder) before anything runs. */
export const validateMigrationSequence = (
  migrations: readonly SchemaMigration[],
): void => {
  migrations.forEach((migration, index) => {
    const expected = BASELINE_SCHEMA_VERSION + index + 1;
    if (migration.version !== expected) {
      throw new Error(
        `Schema migration ${index} has version ${migration.version}; expected ${expected}.`,
      );
    }
  });
};

const tableHasColumn = (
  tx: DatabaseTransaction,
  tableName: string,
  columnName: string,
): boolean => {
  const columnsResult = tx.executeSync(`PRAGMA table_info(${tableName})`);
  return (columnsResult.rows || []).some(
    (column: Record<string, unknown>) => column.name === columnName,
  );
};

const addColumnIfMissing = (
  tx: DatabaseTransaction,
  tableName: string,
  columnName: string,
  columnDefinition: string,
): void => {
  if (!tableHasColumn(tx, tableName, columnName)) {
    tx.executeSync(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`,
    );
  }
};

/**
 * The idempotent AGY baseline: every table, column and index up to schema 17.
 * It is additive, so it also completes databases from older AGY builds.
 */
const applyBaselineSchema = (tx: DatabaseTransaction): void => {
  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'student',
      is_new_user INTEGER NOT NULL DEFAULT 1,
      time_format_24h INTEGER NOT NULL DEFAULT 0,
      week_starts_monday INTEGER NOT NULL DEFAULT 0,
      dark_mode INTEGER NOT NULL DEFAULT 0,
      cloud_account_id TEXT UNIQUE,
      cloud_linked INTEGER NOT NULL DEFAULT 0,
      cloud_linked_at TEXT,
      avatar_uri TEXT,
      product_tour_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS remember_me (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS active_session (
      user_id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      pending_cloud_credential TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      wake_time TEXT NOT NULL DEFAULT '${DEFAULT_WAKE_TIME}',
      sleep_time TEXT NOT NULL DEFAULT '${DEFAULT_SLEEP_TIME}',
      study_peak_hours TEXT NOT NULL DEFAULT '${JSON.stringify(
        DEFAULT_STUDY_PEAK_HOURS,
      )}',
      busiest_day TEXT NOT NULL DEFAULT '${DEFAULT_BUSIEST_DAY}',
      reminder_lead_minutes INTEGER NOT NULL DEFAULT ${DEFAULT_REMINDER_LEAD},
      snooze_tendency TEXT NOT NULL DEFAULT '${DEFAULT_SNOOZE_TENDENCY}',
      weekly_class_count TEXT NOT NULL DEFAULT '${DEFAULT_CLASS_COUNT}',
      longest_class_gap TEXT NOT NULL DEFAULT '${DEFAULT_LONGEST_GAP}',
      enable_voice_calls INTEGER NOT NULL DEFAULT ${
        DEFAULT_VOICE_CALLS ? 1 : 0
      },
      enable_notifications INTEGER NOT NULL DEFAULT ${
        DEFAULT_NOTIFICATIONS ? 1 : 0
      },
      daily_digest INTEGER NOT NULL DEFAULT ${DEFAULT_DAILY_DIGEST ? 1 : 0},
      quiet_hours TEXT NOT NULL DEFAULT '${DEFAULT_QUIET_HOURS}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'local_guest_user',
      title TEXT NOT NULL,
      due_date TEXT,
      due_time TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Medium',
      category TEXT NOT NULL DEFAULT 'General',
      notes TEXT,
      recurrence_rule TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'local_guest_user',
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      location TEXT,
      linked_calendar_block TEXT,
      recurrence_rule TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS time_blocks (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'local_guest_user',
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#E6003A',
      category TEXT NOT NULL DEFAULT 'personal',
      notes TEXT,
      recurrence_rule TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'local_guest_user',
      task TEXT NOT NULL,
      description TEXT,
      scheduled_at TEXT NOT NULL,
      trigger_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      precast_audio_path TEXT,
      snooze_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS job_queue_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      reminder_id TEXT,
      job_type TEXT NOT NULL,
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'local_guest_user',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL DEFAULT 'General',
      is_voice_transcribed INTEGER NOT NULL DEFAULT 0,
      image_uri TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS custom_categories (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'local_guest_user',
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'local_guest_user',
      title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      attachment_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS user_behavior_logs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_key TEXT NOT NULL,
      event_value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS ml_feature_snapshots (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      feature_type TEXT NOT NULL,
      feature_vector TEXT NOT NULL,
      computed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      scope_type TEXT NOT NULL DEFAULT 'account',
      scope_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      base_version INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS sync_metadata (
      user_id TEXT NOT NULL,
      scope_type TEXT NOT NULL DEFAULT 'account',
      scope_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      change_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, scope_type, scope_id, entity_type, entity_id)
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS sync_state (
      user_id TEXT NOT NULL,
      scope_type TEXT NOT NULL DEFAULT 'account',
      scope_id TEXT NOT NULL,
      cursor INTEGER NOT NULL DEFAULT 0,
      last_synced_at TEXT,
      status TEXT NOT NULL DEFAULT 'Local only',
      error_message TEXT,
      server_entity_types TEXT,
      snapshot_entity_types TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, scope_type, scope_id)
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS sync_control (
      user_id TEXT NOT NULL,
      scope_type TEXT NOT NULL DEFAULT 'account',
      scope_id TEXT NOT NULL,
      suppress INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, scope_type, scope_id)
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      user_id TEXT NOT NULL,
      scope_type TEXT NOT NULL DEFAULT 'account',
      scope_id TEXT NOT NULL,
      mutation_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      reason TEXT NOT NULL,
      local_payload TEXT NOT NULL,
      base_version INTEGER,
      server_version INTEGER,
      server_payload TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      PRIMARY KEY (user_id, scope_type, scope_id, mutation_id)
    );
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS local_settings (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );
  `);

  addColumnIfMissing(tx, 'users', 'cloud_account_id', 'TEXT');
  addColumnIfMissing(tx, 'users', 'cloud_linked', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(tx, 'users', 'cloud_linked_at', 'TEXT');
  addColumnIfMissing(tx, 'users', 'role', "TEXT NOT NULL DEFAULT 'student'");
  addColumnIfMissing(tx, 'users', 'avatar_uri', 'TEXT');
  addColumnIfMissing(
    tx,
    'users',
    'time_format_24h',
    'INTEGER NOT NULL DEFAULT 0',
  );
  addColumnIfMissing(
    tx,
    'users',
    'week_starts_monday',
    'INTEGER NOT NULL DEFAULT 0',
  );
  addColumnIfMissing(tx, 'users', 'dark_mode', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(
    tx,
    'users',
    'product_tour_version',
    'INTEGER NOT NULL DEFAULT 0',
  );
  addColumnIfMissing(tx, 'active_session', 'access_token', 'TEXT');
  addColumnIfMissing(tx, 'active_session', 'refresh_token', 'TEXT');
  addColumnIfMissing(tx, 'active_session', 'pending_cloud_credential', 'TEXT');
  addColumnIfMissing(tx, 'custom_categories', 'updated_at', 'TEXT');
  addColumnIfMissing(tx, 'custom_categories', 'deleted_at', 'TEXT');
  addColumnIfMissing(tx, 'sync_state', 'server_entity_types', 'TEXT');
  addColumnIfMissing(tx, 'sync_state', 'snapshot_entity_types', 'TEXT');
  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS recorded_meetings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'recording',
      error_code TEXT,
      error_detail TEXT,
      started_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      audio_bytes INTEGER NOT NULL DEFAULT 0,
      microphone_label TEXT,
      whisper_model TEXT,
      transcription_device TEXT,
      language TEXT,
      transcript_json TEXT,
      notes_json TEXT,
      notes_edited INTEGER NOT NULL DEFAULT 0,
      section_cache_json TEXT NOT NULL DEFAULT '{}',
      recovered INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'recording',
      source_file_name TEXT,
      has_audio INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id)
    );
  `);

  addColumnIfMissing(
    tx,
    'recorded_meetings',
    'source',
    "TEXT NOT NULL DEFAULT 'recording'",
  );
  addColumnIfMissing(tx, 'recorded_meetings', 'source_file_name', 'TEXT');
  addColumnIfMissing(
    tx,
    'recorded_meetings',
    'has_audio',
    'INTEGER NOT NULL DEFAULT 1',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_recorded_meetings_user ON recorded_meetings (user_id, started_at);',
  );
  addColumnIfMissing(tx, 'messages', 'attachment_json', 'TEXT');

  tx.executeSync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cloud_account_id ON users(cloud_account_id);',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, is_completed, due_date, due_time);',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, date, start_time);',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_time_blocks_user_date ON time_blocks(user_id, date, start_time);',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_notes_user_sort ON notes(user_id, is_pinned, sort_order, updated_at);',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_reminders_user_trigger ON reminders(user_id, status, trigger_at);',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_user_behavior_logs_user_type ON user_behavior_logs(user_id, event_type);',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_sync_outbox_user_scope_status_created ON sync_outbox(user_id, scope_type, scope_id, status, created_at);',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_sync_outbox_user_scope_entity ON sync_outbox(user_id, scope_type, scope_id, entity_type, entity_id, status);',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_sync_conflicts_unresolved ON sync_conflicts(user_id, scope_type, scope_id, resolved_at, updated_at);',
  );
};

/**
 * Settings for this connection only. They do not touch the file, so they are safe
 * before the version check, and `foreign_keys` is ignored inside a transaction.
 * See ADR-016.
 */
const applySessionPragmas = (database: DatabaseService): void => {
  database.executeSync('PRAGMA busy_timeout = 5000');
  database.executeSync('PRAGMA foreign_keys = ON');
};

const readInstalledVersion = (database: DatabaseService): number => {
  const raw: unknown = database.executeSync('PRAGMA user_version').rows[0]
    ?.user_version;
  const version = raw === undefined || raw === null ? 0 : Number(raw);
  if (!Number.isInteger(version) || version < 0) {
    throw new StorageUnavailableError('malformed_version');
  }
  return version;
};

/**
 * Bounded structural probe: `quick_check(1)` stops at the first problem and skips
 * the index cross-check of `integrity_check`. A missing verdict is not evidence of
 * damage, so only an explicit non-ok verdict refuses the file.
 */
const assertFileIsUsable = (database: DatabaseService): void => {
  const row = database.executeSync('PRAGMA quick_check(1)').rows[0];
  const verdict = row ? String(Object.values(row)[0] ?? '') : '';
  if (verdict && verdict.toLowerCase() !== 'ok') {
    throw new StorageUnavailableError('integrity_failed');
  }
};

const selectDurabilityProtocol = (database: DatabaseService): void => {
  // Neither can change inside a transaction. Both read the file and the journal
  // change may write to it, so they follow the refusals.
  database.executeSync('PRAGMA synchronous = FULL');
  database.executeSync('PRAGMA journal_mode = DELETE');
  const row = database.executeSync('PRAGMA journal_mode').rows[0];
  const mode = row ? String(Object.values(row)[0] ?? '').toLowerCase() : '';
  if (mode && mode !== 'delete' && mode !== 'memory') {
    console.warn(`[Database] Journal mode stayed ${mode}.`);
  }
};

const failureReasonFor = (
  error: unknown,
  database: DatabaseService,
): StorageFailureReason => {
  if (error instanceof StorageUnavailableError) return error.reason;
  const current = database.getHealth().reason;
  if (current) return current;
  return /not a database|malformed/i.test(storageErrorMessage(error))
    ? 'unreadable'
    : 'migration_failed';
};

/**
 * Prepares local storage for use. Everything that can change the file happens in
 * one transaction, including `user_version`, so a failure at any point leaves the
 * previous version and all data in place and the next launch simply retries.
 *
 * Files this build cannot trust are refused before any write. Failures leave the
 * service unavailable rather than letting the app write to an unprepared schema.
 */
export const initDatabase = async (
  database: DatabaseService = db,
  migrations: readonly SchemaMigration[] = SCHEMA_MIGRATIONS,
): Promise<void> => {
  if (database.isFallback()) {
    return;
  }

  validateMigrationSequence(migrations);
  const targetVersion = targetVersionOf(migrations);

  try {
    applySessionPragmas(database);

    const installedVersion = readInstalledVersion(database);
    if (installedVersion > targetVersion) {
      throw new StorageUnavailableError('future_schema');
    }
    assertFileIsUsable(database);
    selectDurabilityProtocol(database);

    database.transactionSync(tx => {
      applyBaselineSchema(tx);
      for (const migration of migrations) {
        if (migration.version > installedVersion) {
          migration.up(tx);
        }
      }
      if (installedVersion < targetVersion) {
        tx.executeSync(`PRAGMA user_version = ${targetVersion}`);
      }
    });
  } catch (error) {
    console.error('[Database] Failed to initialize database schema:', error);
    const reason = failureReasonFor(error, database);
    if (database.getHealth().reason !== reason) {
      database.requireRecovery(reason);
    }
    throw reason === 'unreadable' ? new StorageUnavailableError(reason) : error;
  }
};
