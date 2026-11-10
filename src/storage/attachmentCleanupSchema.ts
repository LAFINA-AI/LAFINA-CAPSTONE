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

/**
 * Schema 24 (attachment-cleanup audit C2; ADR-026): each obligation's turn in
 * its owner's cleanup queue. A pass takes the lowest turns; every attempt
 * moves that obligation to the back, so obligations that keep failing can no
 * longer hold the front of the queue. Additive: one column with a default.
 * Rows saved before it take their attempt count as their turn, so an
 * obligation that the earlier oldest-first order never reached goes first.
 */
export const ATTACHMENT_CLEANUP_QUEUE_COLUMN = 'queue_order';

export const migrateAttachmentCleanupQueue = (tx: DatabaseTransaction): void => {
  const columns = tx.executeSync(`PRAGMA table_info(${ATTACHMENT_CLEANUP_TABLE})`).rows ?? [];
  if (columns.some(column => column.name === ATTACHMENT_CLEANUP_QUEUE_COLUMN)) return;
  tx.executeSync(
    `ALTER TABLE ${ATTACHMENT_CLEANUP_TABLE} ADD COLUMN ${ATTACHMENT_CLEANUP_QUEUE_COLUMN} INTEGER NOT NULL DEFAULT 0`,
  );
  tx.executeSync(`UPDATE ${ATTACHMENT_CLEANUP_TABLE} SET ${ATTACHMENT_CLEANUP_QUEUE_COLUMN} = attempts`);
};
