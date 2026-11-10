import type {DatabaseTransaction} from './database';

/**
 * Schema 25: several chats per account and on-device chat memories.
 *
 * `chat_sessions` already holds a title per row; this adds an owner index for
 * the chat list. `chat_memories` keeps the short facts LAFINA remembers about
 * a student (see `chatMemoryStore`). Rows are device-local and never synced.
 */
export const migrateChatMemories = (tx: Pick<DatabaseTransaction, 'executeSync'>): void => {
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
