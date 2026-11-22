import type {DatabaseTransaction} from './database';

/**
 * Schema 25: several chats per account and on-device chat memories.
 *
 * `chat_sessions` already holds a title per row; this adds an owner index for
 * the chat list. `chat_memories` keeps the short facts LAFINA remembers about
 * a student (see `chatMemoryStore`). Rows are device-local and never synced.
 */
export const migrateChatMemories = (
  tx: Pick<DatabaseTransaction, 'executeSync'>,
): void => {
  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS chat_memories (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_chat_memories_owner ON chat_memories(user_id, created_at)',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_chat_sessions_owner ON chat_sessions(user_id, updated_at)',
  );
};

const tableHasColumn = (
  tx: Pick<DatabaseTransaction, 'executeSync'>,
  tableName: string,
  columnName: string,
): boolean => {
  const result = tx.executeSync(`PRAGMA table_info('${tableName}')`);
  return result.rows.some(row => String(row.name) === columnName);
};

const hasTable = (
  tx: Pick<DatabaseTransaction, 'executeSync'>,
  tableName: string,
): boolean =>
  tx.executeSync(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName],
  ).rows.length > 0;

/**
 * Schema 30: Tiered, pinnable, slot-replaceable memories + behavior/snapshot indexes.
 * Idempotent so standalone schema tests remain safe.
 */
export const migrateChatMemoriesV2 = (
  tx: Pick<DatabaseTransaction, 'executeSync'>,
): void => {
  if (!hasTable(tx, 'chat_memories')) return;
  const columns: ReadonlyArray<[string, string]> = [
    ['tier', "TEXT NOT NULL DEFAULT 'episodic'"],
    ['category', "TEXT NOT NULL DEFAULT 'general'"],
    ['is_pinned', 'INTEGER NOT NULL DEFAULT 0'],
    ['slot_key', 'TEXT'],
    ['last_used_at', 'TEXT'],
    ['expires_at', 'TEXT'],
  ];
  for (const [column, definition] of columns) {
    if (!tableHasColumn(tx, 'chat_memories', column)) {
      tx.executeSync(
        `ALTER TABLE chat_memories ADD COLUMN ${column} ${definition}`,
      );
    }
  }
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_chat_memories_owner_tier ON chat_memories(user_id, is_pinned DESC, tier, created_at DESC)',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_chat_memories_slot ON chat_memories(user_id, slot_key)',
  );
  if (hasTable(tx, 'user_behavior_logs')) {
    tx.executeSync(
      'CREATE INDEX IF NOT EXISTS idx_behavior_logs_owner_event_time ON user_behavior_logs(user_id, event_type, created_at ASC)',
    );
  }
  if (hasTable(tx, 'ml_feature_snapshots')) {
    tx.executeSync(
      'CREATE INDEX IF NOT EXISTS idx_ml_snapshots_owner_time ON ml_feature_snapshots(user_id, computed_at DESC)',
    );
  }
};
