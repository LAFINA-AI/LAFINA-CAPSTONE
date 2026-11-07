import type {DatabaseTransaction} from './database';

/**
 * Schema 23 (clear-data audit C1; ADR-026): durable, owner-bound obligations
 * to remove chat attachment files.
 *
 * Clear All Data deletes the chat messages that are the only reference to a
 * generated document's file. Each such file is recorded here in the same
 * transaction as that delete, so the reference is never lost before the
 * obligation to remove the file is saved. A row stays until its file is
 * removed or confirmed absent; the primary key makes repeated or duplicate
 * recording idempotent. Rows are device-local and never synced.
 */
export const ATTACHMENT_CLEANUP_TABLE = 'attachment_cleanup';

export const migrateAttachmentCleanup = (tx: DatabaseTransaction): void => {
  tx.executeSync(`CREATE TABLE IF NOT EXISTS ${ATTACHMENT_CLEANUP_TABLE} (
    user_id TEXT NOT NULL,
    path TEXT NOT NULL CHECK (length(path) BETWEEN 2 AND 1024),
    recorded_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    PRIMARY KEY (user_id, path)
  )`);
};
