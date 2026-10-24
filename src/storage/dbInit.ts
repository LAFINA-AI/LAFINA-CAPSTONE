import { db } from './database';
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

const CURRENT_SCHEMA_VERSION = 17;

const tableHasColumn = (tableName: string, columnName: string): boolean => {
  const columnsResult = db.executeSync(`PRAGMA table_info(${tableName})`);
  return (columnsResult.rows || []).some(
    (column: Record<string, unknown>) => column.name === columnName,
  );
};

const addColumnIfMissing = (
  tableName: string,
  columnName: string,
  columnDefinition: string,
): void => {
  if (!tableHasColumn(tableName, columnName)) {
    db.executeSync(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`,
    );
  }
};

/**
 * Initializes the local SQLite database schema for LAFINA-CAPSTONE,
 * matching the personal entity schema of LAFINA and LAFINA-backend
 * (excluding business, Gmail, and study-tool tables).
 */
export const initDatabase = async (): Promise<void> => {
  if (db.isFallback()) {
    return;
  }

  try {
    db.executeSync('PRAGMA foreign_keys = ON;');

    const versionRes = db.executeSync('PRAGMA user_version');
    const currentVersion =
      versionRes.rows.length > 0 ? Number(versionRes.rows[0].user_version) : 0;

    db.executeSync(`
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

    db.executeSync(`
      CREATE TABLE IF NOT EXISTS remember_me (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 0,
        email TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL
      );
    `);

    db.executeSync(`
      CREATE TABLE IF NOT EXISTS active_session (
        user_id TEXT PRIMARY KEY,
        access_token TEXT,
        refresh_token TEXT,
        pending_cloud_credential TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.executeSync(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL UNIQUE,
        wake_time TEXT NOT NULL DEFAULT '${DEFAULT_WAKE_TIME}',
        sleep_time TEXT NOT NULL DEFAULT '${DEFAULT_SLEEP_TIME}',
        study_peak_hours TEXT NOT NULL DEFAULT '${JSON.stringify(DEFAULT_STUDY_PEAK_HOURS)}',
        busiest_day TEXT NOT NULL DEFAULT '${DEFAULT_BUSIEST_DAY}',
        reminder_lead_minutes INTEGER NOT NULL DEFAULT ${DEFAULT_REMINDER_LEAD},
        snooze_tendency TEXT NOT NULL DEFAULT '${DEFAULT_SNOOZE_TENDENCY}',
        weekly_class_count TEXT NOT NULL DEFAULT '${DEFAULT_CLASS_COUNT}',
        longest_class_gap TEXT NOT NULL DEFAULT '${DEFAULT_LONGEST_GAP}',
        enable_voice_calls INTEGER NOT NULL DEFAULT ${DEFAULT_VOICE_CALLS ? 1 : 0},
        enable_notifications INTEGER NOT NULL DEFAULT ${DEFAULT_NOTIFICATIONS ? 1 : 0},
        daily_digest INTEGER NOT NULL DEFAULT ${DEFAULT_DAILY_DIGEST ? 1 : 0},
        quiet_hours TEXT NOT NULL DEFAULT '${DEFAULT_QUIET_HOURS}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL DEFAULT 'local_guest_user',
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
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

    db.executeSync(`
      CREATE TABLE IF NOT EXISTS local_settings (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      );
    `);

    addColumnIfMissing('users', 'cloud_account_id', 'TEXT');
    addColumnIfMissing('users', 'cloud_linked', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('users', 'cloud_linked_at', 'TEXT');
    addColumnIfMissing('users', 'role', "TEXT NOT NULL DEFAULT 'student'");
    addColumnIfMissing('users', 'avatar_uri', 'TEXT');
    addColumnIfMissing('users', 'time_format_24h', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('users', 'week_starts_monday', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('users', 'dark_mode', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('users', 'product_tour_version', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('active_session', 'access_token', 'TEXT');
    addColumnIfMissing('active_session', 'refresh_token', 'TEXT');
    addColumnIfMissing('active_session', 'pending_cloud_credential', 'TEXT');
    addColumnIfMissing('custom_categories', 'updated_at', 'TEXT');
    addColumnIfMissing('custom_categories', 'deleted_at', 'TEXT');
    addColumnIfMissing('sync_state', 'server_entity_types', 'TEXT');
    addColumnIfMissing('sync_state', 'snapshot_entity_types', 'TEXT');
    addColumnIfMissing('messages', 'attachment_json', 'TEXT');

    db.executeSync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cloud_account_id ON users(cloud_account_id);',
    );
    db.executeSync(
      'CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, is_completed, due_date, due_time);',
    );
    db.executeSync(
      'CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, date, start_time);',
    );
    db.executeSync(
      'CREATE INDEX IF NOT EXISTS idx_time_blocks_user_date ON time_blocks(user_id, date, start_time);',
    );
    db.executeSync(
      'CREATE INDEX IF NOT EXISTS idx_notes_user_sort ON notes(user_id, is_pinned, sort_order, updated_at);',
    );
    db.executeSync(
      'CREATE INDEX IF NOT EXISTS idx_reminders_user_trigger ON reminders(user_id, status, trigger_at);',
    );
    db.executeSync(
      'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);',
    );
    db.executeSync(
      'CREATE INDEX IF NOT EXISTS idx_user_behavior_logs_user_type ON user_behavior_logs(user_id, event_type);',
    );
    db.executeSync(
      'CREATE INDEX IF NOT EXISTS idx_sync_outbox_user_scope_status_created ON sync_outbox(user_id, scope_type, scope_id, status, created_at);',
    );
    db.executeSync(
      'CREATE INDEX IF NOT EXISTS idx_sync_outbox_user_scope_entity ON sync_outbox(user_id, scope_type, scope_id, entity_type, entity_id, status);',
    );
    db.executeSync(
      'CREATE INDEX IF NOT EXISTS idx_sync_conflicts_unresolved ON sync_conflicts(user_id, scope_type, scope_id, resolved_at, updated_at);',
    );

    if (currentVersion < CURRENT_SCHEMA_VERSION) {
      db.executeSync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
    }
  } catch (error) {
    console.error('[Database] Failed to initialize database schema:', error);
    throw error;
  }
};
