import type {DatabaseTransaction} from './database';

/**
 * Before schema 18 every account wrote to one shared `default_chat_session`.
 * Each owner now has exactly one deterministic session id.
 */
export const LEGACY_SHARED_SESSION_ID = 'default_chat_session';
const OWNED_SESSION_PREFIX = 'default_chat_session:';
const MAX_OWNER_ID_LENGTH = 256;
/** A fresh random token per session row; page cursors are bound to it. */
export const NEW_SESSION_GENERATION_SQL = 'lower(hex(randomblob(8)))';

export const isValidChatOwner = (userId: unknown): userId is string =>
  typeof userId === 'string' &&
  userId.trim().length > 0 &&
  userId.length <= MAX_OWNER_ID_LENGTH;

/** Deterministic, owner-bound session id. Throws for an invalid owner. */
export const ownedChatSessionId = (userId: string): string => {
  if (!isValidChatOwner(userId)) {
    throw new Error('A valid Chat owner is required.');
  }
  return `${OWNED_SESSION_PREFIX}${encodeURIComponent(userId)}`;
};

export type LegacyChatDecision = 'adopted' | 'quarantined' | 'empty';

export interface LegacyChatOutcome {
  sessionId: string;
  decision: LegacyChatDecision;
  recordedOwner: string | null;
  messageCount: number;
}

/**
 * Schema 18. Adds a durable insertion order (`seq`), per-message metadata (the
 * Handbook citation label), a per-session `generation` that page cursors are
 * bound to, and resolves legacy shared sessions.
 *
 * Ownership of a legacy session is only adopted when durable evidence leaves
 * no doubt: the session's recorded owner is the only local account that
 * already existed when the newest legacy message was written.
 * The recorded owner is just whoever opened Chat first, so with any other
 * account present the history is quarantined: the rows stay where they are,
 * untouched, and no account can read, clear or share them.
 */
export const migrateChatOwnership = (
  tx: DatabaseTransaction,
  now: string = new Date().toISOString(),
): LegacyChatOutcome[] => {
  const columns = tx
    .executeSync('PRAGMA table_info(messages)')
    .rows.map(column => String(column.name));
  if (!columns.includes('seq')) {
    tx.executeSync('ALTER TABLE messages ADD COLUMN seq INTEGER');
  }
  if (!columns.includes('metadata_json')) {
    tx.executeSync('ALTER TABLE messages ADD COLUMN metadata_json TEXT');
  }
  // rowid is the existing insertion order; copying it makes the order durable
  // even if a later VACUUM renumbers rowids.
  tx.executeSync('UPDATE messages SET seq = rowid WHERE seq IS NULL');
  const sessionColumns = tx
    .executeSync('PRAGMA table_info(chat_sessions)')
    .rows.map(column => String(column.name));
  if (!sessionColumns.includes('generation')) {
    tx.executeSync('ALTER TABLE chat_sessions ADD COLUMN generation TEXT');
  }
  tx.executeSync(
    `UPDATE chat_sessions SET generation = ${NEW_SESSION_GENERATION_SQL} WHERE generation IS NULL`,
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_messages_session_order ON messages(session_id, created_at, seq)',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_messages_seq ON messages(seq)',
  );
  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS chat_legacy_quarantine (
      session_id TEXT PRIMARY KEY NOT NULL,
      recorded_owner TEXT,
      message_count INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  const userIds = tx
    .executeSync('SELECT id FROM users')
    .rows.map(row => String(row.id));
  const legacySessions = tx.executeSync(
    `SELECT id, user_id FROM chat_sessions
     WHERE substr(id, 1, ?) <> ?
       AND id NOT IN (SELECT session_id FROM chat_legacy_quarantine)
     ORDER BY id`,
    [OWNED_SESSION_PREFIX.length, OWNED_SESSION_PREFIX],
  ).rows;

  const outcomes: LegacyChatOutcome[] = [];
  for (const session of legacySessions) {
    const sessionId = String(session.id);
    const recordedOwner =
      typeof session.user_id === 'string' ? session.user_id : null;
    const messageCount = Number(
      tx.executeSync(
        'SELECT COUNT(*) AS count FROM messages WHERE session_id = ?',
        [sessionId],
      ).rows[0]?.count ?? 0,
    );
    if (messageCount === 0) {
      outcomes.push({
        sessionId,
        decision: 'empty',
        recordedOwner,
        messageCount,
      });
      continue;
    }

    // An account whose local row was created after the newest message cannot
    // have written any of it (for example the guest row that is recreated on
    // demand), so only accounts that existed by then are possible authors.
    const newestMessageAt = String(
      tx.executeSync(
        'SELECT MAX(created_at) AS newest FROM messages WHERE session_id = ?',
        [sessionId],
      ).rows[0]?.newest ?? '',
    );
    const possibleAuthors = tx
      .executeSync('SELECT id FROM users WHERE created_at <= ?', [
        newestMessageAt,
      ])
      .rows.map(row => String(row.id));
    const soleOwner =
      recordedOwner !== null &&
      isValidChatOwner(recordedOwner) &&
      possibleAuthors.length === 1 &&
      possibleAuthors[0] === recordedOwner;

    if (soleOwner) {
      const ownedId = ownedChatSessionId(recordedOwner);
      tx.executeSync(
        `INSERT OR IGNORE INTO chat_sessions (id, user_id, title, created_at, updated_at, generation)
         VALUES (?, ?, 'Default Chat', ?, ?, ${NEW_SESSION_GENERATION_SQL})`,
        [ownedId, recordedOwner, now, now],
      );
      tx.executeSync(
        'UPDATE messages SET session_id = ? WHERE session_id = ?',
        [ownedId, sessionId],
      );
      outcomes.push({
        sessionId,
        decision: 'adopted',
        recordedOwner,
        messageCount,
      });
      continue;
    }

    tx.executeSync(
      `INSERT INTO chat_legacy_quarantine (session_id, recorded_owner, message_count, reason, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        sessionId,
        recordedOwner,
        messageCount,
        userIds.length === 0 || !userIds.includes(recordedOwner ?? '')
          ? 'recorded_owner_missing'
          : 'multiple_local_accounts',
        now,
      ],
    );
    outcomes.push({
      sessionId,
      decision: 'quarantined',
      recordedOwner,
      messageCount,
    });
  }
  return outcomes;
};

/**
 * Moves one owner's conversation to another inside the caller's transaction
 * (guest linking). Existing destination history is kept; messages interleave by
 * timestamp and insertion order. Quarantined legacy sessions never move, and
 * any page cursor issued to the old owner stops matching.
 */
export const transferChatOwnership = (
  tx: DatabaseTransaction,
  fromUserId: string,
  toUserId: string,
  now: string = new Date().toISOString(),
): void => {
  if (fromUserId === toUserId) return;
  const fromSession = ownedChatSessionId(fromUserId);
  const toSession = ownedChatSessionId(toUserId);
  tx.executeSync(
    `INSERT OR IGNORE INTO chat_sessions (id, user_id, title, created_at, updated_at, generation)
     VALUES (?, ?, 'Default Chat', ?, ?, ${NEW_SESSION_GENERATION_SQL})`,
    [toSession, toUserId, now, now],
  );
  const destinationOwner = tx.executeSync(
    'SELECT user_id FROM chat_sessions WHERE id = ?',
    [toSession],
  ).rows[0]?.user_id;
  if (destinationOwner !== toUserId) {
    throw new Error('Destination Chat session belongs to another account.');
  }
  tx.executeSync(
    `UPDATE messages SET session_id = ?
     WHERE session_id = ?
       AND EXISTS (SELECT 1 FROM chat_sessions WHERE id = ? AND user_id = ?)`,
    [toSession, fromSession, fromSession, fromUserId],
  );
  tx.executeSync(
    `DELETE FROM chat_sessions WHERE id = ? AND user_id = ?
       AND NOT EXISTS (SELECT 1 FROM messages WHERE session_id = ?)`,
    [fromSession, fromUserId, fromSession],
  );
  tx.executeSync(
    `UPDATE chat_sessions SET user_id = ?
     WHERE user_id = ?
       AND id NOT IN (SELECT session_id FROM chat_legacy_quarantine)`,
    [toUserId, fromUserId],
  );
};
