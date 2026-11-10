/**
 * Synthetic AGY schema-17 database built from the frozen `agySchema17.sql`.
 * Every row is invented; tokens are harmless placeholders. It covers what an
 * upgrade must never lose: guest and two accounts, all seven sync types, soft
 * deletes, pending/failed outbox, conflicts, cited and attached messages, and
 * meetings.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {SqliteTestConnection} from './sqliteFile';

const NOW = '2026-11-06T00:00:00.000Z';
const GUEST = 'local_guest_user';
const ACCOUNT_A = 'fixture-account-a';
const ACCOUNT_B = 'fixture-account-b';

export const SCHEMA_17_BODY_SHA256 =
  '14c0411be8c6433052ad24a7b71a7178bdf54325648c717b3fe277808bed385c';

const readFrozenSchema = (): string => {
  const raw = readFileSync(
    resolve(__dirname, 'agySchema17.sql'),
    'utf8',
  ).replace(/\r\n/g, '\n');
  return raw.slice(raw.indexOf('\n') + 1);
};

type Row = readonly [sql: string, params: readonly unknown[]];

const user = (id: string, role: string, cloudId: string | null): Row => [
  `INSERT INTO users (id, username, email, role, is_new_user, cloud_account_id, cloud_linked, created_at, updated_at)
   VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
  [
    id,
    id,
    cloudId ? `${id}@example.invalid` : null,
    role,
    cloudId,
    cloudId ? 1 : 0,
    NOW,
    NOW,
  ],
];

const task = (id: string, owner: string, deletedAt: string | null): Row => [
  `INSERT INTO tasks (id, user_id, title, due_date, due_time, is_completed, priority, category, notes, recurrence_rule, created_at, updated_at, deleted_at)
   VALUES (?, ?, ?, '2026-11-10', '09:00', 0, 'High', 'General', 'n', NULL, ?, ?, ?)`,
  [id, owner, `Task ${id}`, NOW, NOW, deletedAt],
];

const event = (id: string, owner: string, deletedAt: string | null): Row => [
  `INSERT INTO events (id, user_id, title, date, start_time, end_time, location, linked_calendar_block, recurrence_rule, created_at, updated_at, deleted_at)
   VALUES (?, ?, ?, '2026-11-10', '22:00', '23:00', 'Room 1', NULL, NULL, ?, ?, ?)`,
  [id, owner, `Event ${id}`, NOW, NOW, deletedAt],
];

const block = (id: string, owner: string, deletedAt: string | null): Row => [
  `INSERT INTO time_blocks (id, user_id, title, date, start_time, end_time, color, category, notes, recurrence_rule, created_at, updated_at, deleted_at)
   VALUES (?, ?, ?, '2026-11-10', '12:00', '13:00', '#E6003A', 'personal', NULL, 'FREQ=WEEKLY', ?, ?, ?)`,
  [id, owner, `Block ${id}`, NOW, NOW, deletedAt],
];

const reminder = (
  id: string,
  owner: string,
  status: string,
  deletedAt: string | null,
): Row => [
  `INSERT INTO reminders (id, user_id, task, description, scheduled_at, trigger_at, status, precast_audio_path, snooze_count, created_at, updated_at, deleted_at)
   VALUES (?, ?, ?, 'd', ?, ?, ?, NULL, 1, ?, ?, ?)`,
  [id, owner, `Reminder ${id}`, NOW, NOW, status, NOW, NOW, deletedAt],
];

const note = (id: string, owner: string, deletedAt: string | null): Row => [
  `INSERT INTO notes (id, user_id, title, body, is_pinned, tags, category, is_voice_transcribed, image_uri, sort_order, created_at, updated_at, deleted_at)
   VALUES (?, ?, ?, ?, 1, '["a","b"]', 'General', 1, 'file:///fixture.png', 3, ?, ?, ?)`,
  [
    id,
    owner,
    `Note ${id}`,
    '**bold**\n- [x] done\n- [ ] open',
    NOW,
    NOW,
    deletedAt,
  ],
];

const category = (id: string, owner: string, deletedAt: string | null): Row => [
  `INSERT INTO custom_categories (id, user_id, name, color, created_at, updated_at, deleted_at)
   VALUES (?, ?, ?, '#112233', ?, ?, ?)`,
  [id, owner, `Cat ${id}`, NOW, NOW, deletedAt],
];

const outbox = (
  id: string,
  owner: string,
  entityType: string,
  entityId: string,
  status: string,
  attempts: number,
): Row => [
  `INSERT INTO sync_outbox (id, user_id, scope_type, scope_id, entity_type, entity_id, operation, payload, base_version, created_at, updated_at, status, attempts)
   VALUES (?, ?, 'account', ?, ?, ?, 'update', '{"title":"t"}', 2, ?, ?, ?, ?)`,
  [id, owner, owner, entityType, entityId, NOW, NOW, status, attempts],
];

const ROWS: readonly Row[] = [
  user(GUEST, 'guest', null),
  user(ACCOUNT_A, 'student', 'cloud-a'),
  user(ACCOUNT_B, 'student_pro', 'cloud-b'),

  [
    `INSERT INTO active_session (user_id, access_token, refresh_token, pending_cloud_credential, created_at, updated_at)
     VALUES (?, 'fixture-access', 'fixture-refresh', NULL, ?, ?)`,
    [ACCOUNT_A, NOW, NOW],
  ],
  [
    `INSERT INTO remember_me (id, enabled, email, created_at, updated_at) VALUES (1, 1, ?, ?, ?)`,
    ['fixture-account-a@example.invalid', NOW, NOW],
  ],
  [
    `INSERT INTO user_preferences (id, user_id, wake_time, sleep_time, reminder_lead_minutes, created_at, updated_at)
     VALUES ('pref-a', ?, '06:30', '22:30', 25, ?, ?)`,
    [ACCOUNT_A, NOW, NOW],
  ],

  task('t-guest', GUEST, null),
  task('t-a', ACCOUNT_A, null),
  task('t-a-deleted', ACCOUNT_A, NOW),
  task('t-b', ACCOUNT_B, null),
  event('e-guest', GUEST, null),
  event('e-a', ACCOUNT_A, null),
  event('e-a-deleted', ACCOUNT_A, NOW),
  event('e-b', ACCOUNT_B, null),
  block('b-a', ACCOUNT_A, null),
  block('b-a-deleted', ACCOUNT_A, NOW),
  block('b-b', ACCOUNT_B, null),
  reminder('r-a', ACCOUNT_A, 'pending', null),
  reminder('r-a-ack', ACCOUNT_A, 'acknowledged', null),
  reminder('r-a-deleted', ACCOUNT_A, 'pending', NOW),
  reminder('r-b', ACCOUNT_B, 'snoozed', null),
  note('n-guest', GUEST, null),
  note('n-a', ACCOUNT_A, null),
  note('n-a-deleted', ACCOUNT_A, NOW),
  note('n-b', ACCOUNT_B, null),
  category('c-a', ACCOUNT_A, null),
  category('c-a-deleted', ACCOUNT_A, NOW),
  category('c-b', ACCOUNT_B, null),

  outbox('o-a-pending', ACCOUNT_A, 'task', 't-a', 'pending', 0),
  outbox('o-a-event', ACCOUNT_A, 'event', 'e-a', 'pending', 0),
  outbox('o-a-block', ACCOUNT_A, 'time_block', 'b-a', 'pending', 0),
  outbox('o-a-reminder', ACCOUNT_A, 'reminder', 'r-a', 'pending', 0),
  outbox('o-a-note', ACCOUNT_A, 'note', 'n-a', 'failed', 3),
  outbox('o-a-cat', ACCOUNT_A, 'custom_category', 'c-a', 'pending', 0),
  outbox('o-a-profile', ACCOUNT_A, 'profile', 'profile', 'in_progress', 1),
  outbox('o-b-task', ACCOUNT_B, 'task', 't-b', 'failed', 2),
  [
    `INSERT INTO sync_metadata (user_id, scope_type, scope_id, entity_type, entity_id, version, change_id, created_at, updated_at)
     VALUES (?, 'account', ?, 'task', 't-a', 2, 11, ?, ?)`,
    [ACCOUNT_A, ACCOUNT_A, NOW, NOW],
  ],
  [
    `INSERT INTO sync_state (user_id, scope_type, scope_id, cursor, last_synced_at, status, error_message, server_entity_types, snapshot_entity_types, created_at, updated_at)
     VALUES (?, 'account', ?, 5, ?, 'Synced', NULL, '["task"]', '["task"]', ?, ?)`,
    [ACCOUNT_A, ACCOUNT_A, NOW, NOW, NOW],
  ],
  [
    `INSERT INTO sync_control (user_id, scope_type, scope_id, suppress, created_at, updated_at)
     VALUES (?, 'account', ?, 0, ?, ?)`,
    [ACCOUNT_A, ACCOUNT_A, NOW, NOW],
  ],
  [
    `INSERT INTO sync_conflicts (user_id, scope_type, scope_id, mutation_id, entity_type, entity_id, operation, reason, local_payload, base_version, server_version, server_payload, created_at, updated_at, resolved_at)
     VALUES (?, 'account', ?, 'm-conflict', 'note', 'n-a', 'update', 'version_mismatch', '{"title":"l"}', 1, 2, '{"title":"s"}', ?, ?, NULL)`,
    [ACCOUNT_A, ACCOUNT_A, NOW, NOW],
  ],

  [
    `INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at)
     VALUES ('default_chat_session', ?, 'Default Chat', ?, ?)`,
    [ACCOUNT_A, NOW, NOW],
  ],
  [
    `INSERT INTO messages (id, session_id, sender, content, attachment_json, created_at, updated_at)
     VALUES ('m-user', 'default_chat_session', 'user', 'What is the grading policy?', NULL, ?, ?)`,
    [NOW, NOW],
  ],
  [
    `INSERT INTO messages (id, session_id, sender, content, attachment_json, created_at, updated_at)
     VALUES ('m-cited', 'default_chat_session', 'assistant', 'Per the handbook. Referenced USTP Student Handbook (p. 12)', NULL, ?, ?)`,
    [NOW, NOW],
  ],
  [
    `INSERT INTO messages (id, session_id, sender, content, attachment_json, created_at, updated_at)
     VALUES ('m-doc', 'default_chat_session', 'assistant', 'Your PDF is ready.', ?, ?, ?)`,
    [
      JSON.stringify({
        uri: 'file:///documents/fixture.pdf',
        fileName: 'fixture.pdf',
        format: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
      }),
      NOW,
      NOW,
    ],
  ],

  [
    `INSERT INTO recorded_meetings (id, user_id, title, status, started_at, duration_seconds, audio_bytes, transcript_json, notes_json, notes_edited, source, source_file_name, has_audio, created_at, updated_at, deleted_at)
     VALUES ('meet-a', ?, 'Lecture', 'ready', ?, 60, 0, '[{"start_ms":0,"text":"hi"}]', '{"summary":"s"}', 1, 'import', 'lecture.wav', 0, ?, ?, NULL)`,
    [ACCOUNT_A, NOW, NOW, NOW],
  ],
  [
    `INSERT INTO recorded_meetings (id, user_id, title, status, started_at, created_at, updated_at, deleted_at)
     VALUES ('meet-b-deleted', ?, 'Old', 'ready', ?, ?, ?, ?)`,
    [ACCOUNT_B, NOW, NOW, NOW, NOW],
  ],

  [
    `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, 'chat.useHandbook', 'false', ?)`,
    [ACCOUNT_A, NOW],
  ],
  [
    `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, 'ustp_handbook_enabled', 'false', ?)`,
    [ACCOUNT_A, NOW],
  ],
  [
    `INSERT INTO user_behavior_logs (id, user_id, event_type, event_key, event_value, created_at, updated_at)
     VALUES ('log-a', ?, 'onboarding', 'k', 'v', ?, ?)`,
    [ACCOUNT_A, NOW, NOW],
  ],
  [
    `INSERT INTO ml_feature_snapshots (id, user_id, feature_type, feature_vector, computed_at, created_at, updated_at)
     VALUES ('ml-a', ?, 'f', '[1]', ?, ?, ?)`,
    [ACCOUNT_A, NOW, NOW, NOW],
  ],
  [
    `INSERT INTO job_queue_items (id, user_id, reminder_id, job_type, payload, status, created_at, updated_at)
     VALUES ('job-a', ?, 'r-a', 'precast', '{}', 'queued', ?, ?)`,
    [ACCOUNT_A, NOW, NOW],
  ],
];

/** SHA-256 of the frozen schema plus the row inserts; changes mean a new fixture. */
export const schema17FixtureFingerprint = (): string =>
  createHash('sha256')
    .update(readFrozenSchema())
    .update(JSON.stringify(ROWS))
    .digest('hex');

export const schema17BodySha256 = (): string =>
  createHash('sha256').update(readFrozenSchema()).digest('hex');

/** Creates the frozen schema and rows in an empty database at `user_version` 17. */
export const buildSchema17Database = (
  connection: SqliteTestConnection,
): void => {
  connection.exec('PRAGMA foreign_keys = ON;');
  connection.exec(readFrozenSchema());
  connection.exec('BEGIN;');
  for (const [sql, params] of ROWS) {
    connection.executeSync(sql, [...params]);
  }
  connection.exec('COMMIT;');
  connection.exec('PRAGMA user_version = 17;');
  connection.statements.length = 0;
};

/** Every row of every table, sorted, for exact before/after comparison. */
export const snapshotAllRows = (
  connection: SqliteTestConnection,
): Record<string, string[]> => {
  const tables = connection
    .executeSync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .rows.map(row => String(row.name));
  const snapshot: Record<string, string[]> = {};
  for (const table of tables) {
    snapshot[table] = connection
      .executeSync(`SELECT * FROM ${table}`)
      .rows.map(row => JSON.stringify(row))
      .sort();
  }
  return snapshot;
};

export const readUserVersion = (connection: SqliteTestConnection): number =>
  Number(connection.executeSync('PRAGMA user_version').rows[0].user_version);

export const FIXTURE_ACCOUNT_A = ACCOUNT_A;
export const FIXTURE_ACCOUNT_B = ACCOUNT_B;
export const FIXTURE_GUEST = GUEST;
