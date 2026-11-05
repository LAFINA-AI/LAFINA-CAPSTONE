-- Frozen AGY schema 17 captured from initDatabase() at b9433dc (synthetic, no data). Do not edit.
CREATE TABLE active_session (
      user_id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      pending_cloud_credential TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE chat_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL DEFAULT 'local_guest_user',
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

CREATE TABLE custom_categories (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL DEFAULT 'local_guest_user',
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT
      );

CREATE TABLE events (
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

CREATE TABLE job_queue_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        reminder_id TEXT,
        job_type TEXT NOT NULL,
        payload TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

CREATE TABLE local_settings (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      );

CREATE TABLE messages (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        attachment_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

CREATE TABLE ml_feature_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        feature_type TEXT NOT NULL,
        feature_vector TEXT NOT NULL,
        computed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

CREATE TABLE notes (
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

CREATE TABLE recorded_meetings (
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

CREATE TABLE remember_me (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 0,
        email TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL
      );

CREATE TABLE reminders (
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

CREATE TABLE sync_conflicts (
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

CREATE TABLE sync_control (
        user_id TEXT NOT NULL,
        scope_type TEXT NOT NULL DEFAULT 'account',
        scope_id TEXT NOT NULL,
        suppress INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, scope_type, scope_id)
      );

CREATE TABLE sync_metadata (
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

CREATE TABLE sync_outbox (
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

CREATE TABLE sync_state (
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

CREATE TABLE tasks (
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

CREATE TABLE time_blocks (
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

CREATE TABLE user_behavior_logs (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_key TEXT NOT NULL,
        event_value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

CREATE TABLE user_preferences (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL UNIQUE,
        wake_time TEXT NOT NULL DEFAULT '07:00',
        sleep_time TEXT NOT NULL DEFAULT '23:00',
        study_peak_hours TEXT NOT NULL DEFAULT '["morning"]',
        busiest_day TEXT NOT NULL DEFAULT 'Monday',
        reminder_lead_minutes INTEGER NOT NULL DEFAULT 15,
        snooze_tendency TEXT NOT NULL DEFAULT 'snooze_once',
        weekly_class_count TEXT NOT NULL DEFAULT '4-6',
        longest_class_gap TEXT NOT NULL DEFAULT '1 hour',
        enable_voice_calls INTEGER NOT NULL DEFAULT 1,
        enable_notifications INTEGER NOT NULL DEFAULT 1,
        daily_digest INTEGER NOT NULL DEFAULT 0,
        quiet_hours TEXT NOT NULL DEFAULT '22:00-07:00',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

CREATE TABLE users (
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

CREATE INDEX idx_events_user_date ON events(user_id, date, start_time);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);

CREATE INDEX idx_notes_user_sort ON notes(user_id, is_pinned, sort_order, updated_at);

CREATE INDEX idx_recorded_meetings_user ON recorded_meetings (user_id, started_at);

CREATE INDEX idx_reminders_user_trigger ON reminders(user_id, status, trigger_at);

CREATE INDEX idx_sync_conflicts_unresolved ON sync_conflicts(user_id, scope_type, scope_id, resolved_at, updated_at);

CREATE INDEX idx_sync_outbox_user_scope_entity ON sync_outbox(user_id, scope_type, scope_id, entity_type, entity_id, status);

CREATE INDEX idx_sync_outbox_user_scope_status_created ON sync_outbox(user_id, scope_type, scope_id, status, created_at);

CREATE INDEX idx_tasks_user_due ON tasks(user_id, is_completed, due_date, due_time);

CREATE INDEX idx_time_blocks_user_date ON time_blocks(user_id, date, start_time);

CREATE INDEX idx_user_behavior_logs_user_type ON user_behavior_logs(user_id, event_type);

CREATE UNIQUE INDEX idx_users_cloud_account_id ON users(cloud_account_id);
