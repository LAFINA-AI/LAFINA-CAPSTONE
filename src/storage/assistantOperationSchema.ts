import type {DatabaseTransaction} from './database';

/**
 * Schema 20 (AGY-PORT 04): local entity revisions and assistant operation
 * receipts. See ADR-018.
 *
 * `entity_local_revisions` holds one counter per task, event, time block, note
 * and reminder row. SQLite triggers bump it on every insert, update and delete,
 * so every writer is covered without having to remember it: manual screens,
 * reviewed assistant commands, sync pulls, guest rekeys, cascades and raw SQL.
 * A missing row means revision 0. A reviewed command captures the revision of
 * each row it will touch and refuses to apply if any of them moved.
 *
 * An update counts only when a tracked column really changes value (`OLD` and
 * `NEW` compared with `IS NOT`). So a sync echo that rewrites identical values,
 * an `updated_at`-only touch, or the background speech cache
 * (`precast_audio_path`) never makes an open review stale. `created_at` and
 * `updated_at` are not tracked.
 *
 * `assistant_operation_receipts` records each applied reviewed command once, by
 * operation ID, so a repeated Confirm returns the same result instead of
 * writing again. It is bounded like the delivery event log.
 *
 * Both tables are device-local. The triggers write only `entity_local_revisions`
 * (never the personal tables or `sync_outbox`), and nothing here is part of any
 * sync payload, so the seven wire formats are unchanged.
 */

export const RECEIPT_RETENTION = 500;

export const REVISION_TRACKED_TABLES = {
  task: 'tasks',
  event: 'events',
  time_block: 'time_blocks',
  note: 'notes',
  reminder: 'reminders',
} as const;

export type RevisionEntityType = keyof typeof REVISION_TRACKED_TABLES;

/** Columns whose change is a change the student could see. */
export const REVISION_TRACKED_COLUMNS: Readonly<
  Record<RevisionEntityType, readonly string[]>
> = {
  task: [
    'id',
    'user_id',
    'title',
    'due_date',
    'due_time',
    'is_completed',
    'priority',
    'category',
    'notes',
    'recurrence_rule',
    'deleted_at',
  ],
  event: [
    'id',
    'user_id',
    'title',
    'date',
    'start_time',
    'end_time',
    'location',
    'linked_calendar_block',
    'recurrence_rule',
    'deleted_at',
  ],
  time_block: [
    'id',
    'user_id',
    'title',
    'date',
    'start_time',
    'end_time',
    'color',
    'category',
    'notes',
    'recurrence_rule',
    'deleted_at',
  ],
  note: [
    'id',
    'user_id',
    'title',
    'body',
    'is_pinned',
    'tags',
    'category',
    'is_voice_transcribed',
    'image_uri',
    'sort_order',
    'deleted_at',
  ],
  reminder: [
    'id',
    'user_id',
    'task',
    'description',
    'scheduled_at',
    'trigger_at',
    'status',
    'snooze_count',
    'deleted_at',
  ],
};

export const ASSISTANT_OPERATION_TABLES = [
  'entity_local_revisions',
  'assistant_operation_receipts',
] as const;

const bumpSql = (type: RevisionEntityType, row: 'NEW' | 'OLD'): string =>
  `INSERT INTO entity_local_revisions (entity_type, entity_id, revision)
     VALUES ('${type}', ${row}.id, 1)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET revision = revision + 1;`;

/** The three trigger names for one tracked table. */
export const revisionTriggerNames = (type: RevisionEntityType): string[] => [
  `local_revision_${type}_insert`,
  `local_revision_${type}_update`,
  `local_revision_${type}_delete`,
];

export const migrateAssistantOperations = (tx: DatabaseTransaction): void => {
  tx.executeSync(`CREATE TABLE IF NOT EXISTS entity_local_revisions (
    entity_type TEXT NOT NULL
      CHECK (entity_type IN ('task','event','time_block','note','reminder')),
    entity_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    PRIMARY KEY (entity_type, entity_id)
  )`);

  for (const [type, table] of Object.entries(REVISION_TRACKED_TABLES) as Array<
    [RevisionEntityType, string]
  >) {
    const [insertName, updateName, deleteName] = revisionTriggerNames(type);
    const columns = REVISION_TRACKED_COLUMNS[type];
    const changed = columns
      .map(column => `OLD.${column} IS NOT NEW.${column}`)
      .join(' OR ');
    tx.executeSync(`CREATE TRIGGER IF NOT EXISTS ${insertName}
      AFTER INSERT ON ${table} BEGIN ${bumpSql(type, 'NEW')} END`);
    tx.executeSync(`CREATE TRIGGER IF NOT EXISTS ${updateName}
      AFTER UPDATE OF ${columns.join(', ')} ON ${table}
      WHEN ${changed} BEGIN ${bumpSql(type, 'NEW')} END`);
    tx.executeSync(`CREATE TRIGGER IF NOT EXISTS ${deleteName}
      AFTER DELETE ON ${table} BEGIN ${bumpSql(type, 'OLD')} END`);
  }

  tx.executeSync(`CREATE TABLE IF NOT EXISTS assistant_operation_receipts (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    intent TEXT NOT NULL,
    operation TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    reminder_id TEXT,
    reply TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_assistant_receipts_owner ON assistant_operation_receipts(user_id, seq)',
  );
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS assistant_operation_receipts_bound
    AFTER INSERT ON assistant_operation_receipts BEGIN
      DELETE FROM assistant_operation_receipts
       WHERE seq <= NEW.seq - ${RECEIPT_RETENTION};
    END`);
};
