import { db } from './database';
import type { DatabaseTransaction } from './database';
import { generateId } from '../utils';
import { NEW_SESSION_GENERATION_SQL, ownedChatSessionId } from './chatOwnership';

export interface ChatAttachment {
  uri: string;
  fileName: string;
  format: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  sender: 'user' | 'assistant';
  content: string;
  attachment?: ChatAttachment | null;
  /** Handbook citation label persisted with the reply (schema 18+). */
  handbookNote?: string | null;
  /** Durable insertion order; breaks ties between equal timestamps. */
  sequence?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageMetadata {
  handbookNote?: string | null;
}

export interface ChatPage {
  /** Oldest first, ready to render. */
  items: ChatMessage[];
  /** Pass as `before` to load the previous page; null when there is none. */
  nextCursor: string | null;
}

export interface ChatPageQuery {
  limit?: number;
  before?: string | null;
}

export interface LegacyChatSummary {
  sessionCount: number;
  messageCount: number;
}

export const CHAT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const CURSOR_VERSION = 1;

/** Thrown for a malformed, tampered, stale or other-owner page cursor. */
export class InvalidChatCursorError extends Error {
  constructor() {
    super('This chat position is no longer valid. Reload the conversation.');
    this.name = 'InvalidChatCursorError';
  }
}

const parseAttachment = (raw: unknown): ChatAttachment | null => {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ChatAttachment>;
    if (typeof value?.uri !== 'string' || typeof value.fileName !== 'string') return null;
    return {
      uri: value.uri,
      fileName: value.fileName,
      format: typeof value.format === 'string' ? value.format : '',
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : '',
      sizeBytes: typeof value.sizeBytes === 'number' ? value.sizeBytes : 0,
    };
  } catch {
    return null;
  }
};

const parseHandbookNote = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const value = JSON.parse(raw) as { handbookNote?: unknown };
    return typeof value?.handbookNote === 'string' && value.handbookNote
      ? value.handbookNote
      : null;
  } catch {
    return null;
  }
};

const mapMessage = (row: Record<string, unknown>): ChatMessage => ({
  id: String(row.id),
  sessionId: String(row.session_id),
  sender: row.sender === 'assistant' ? 'assistant' : 'user',
  content: String(row.content ?? ''),
  attachment: parseAttachment(row.attachment_json),
  handbookNote: parseHandbookNote(row.metadata_json),
  sequence: Number(row.seq),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

/** Every owned read joins the session row so a message is only ever read by its owner. */
const OWNED_MESSAGES = `messages m JOIN chat_sessions s ON s.id = m.session_id
  WHERE m.session_id = ? AND s.user_id = ?`;

interface OwnedSession {
  sessionId: string;
  /** Changes whenever the session row is recreated, e.g. after guest linking. */
  generation: string;
}

const ensureOwnedSession = (
  userId: string,
  tx: Pick<DatabaseTransaction, 'executeSync'>,
): OwnedSession => {
  const sessionId = ownedChatSessionId(userId);
  const now = new Date().toISOString();
  tx.executeSync(
    `INSERT OR IGNORE INTO chat_sessions (id, user_id, title, created_at, updated_at, generation)
     VALUES (?, ?, ?, ?, ?, ${NEW_SESSION_GENERATION_SQL})`,
    [sessionId, userId, 'Default Chat', now, now],
  );
  const row = tx.executeSync('SELECT user_id, generation FROM chat_sessions WHERE id = ?', [
    sessionId,
  ]).rows[0];
  if (row?.user_id !== userId) {
    throw new Error('Chat session ownership does not match the signed-in account.');
  }
  return { sessionId, generation: String(row.generation ?? '') };
};

const encodeCursor = (
  userId: string,
  session: OwnedSession,
  row: Record<string, unknown>,
): string =>
  JSON.stringify([
    CURSOR_VERSION,
    userId,
    session.sessionId,
    session.generation,
    String(row.created_at),
    Number(row.seq),
  ]);

const decodeCursor = (
  raw: string,
  userId: string,
  session: OwnedSession,
): { createdAt: string; seq: number } => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new InvalidChatCursorError();
  }
  if (
    !Array.isArray(value) ||
    value.length !== 6 ||
    value[0] !== CURSOR_VERSION ||
    value[1] !== userId ||
    value[2] !== session.sessionId ||
    value[3] !== session.generation ||
    typeof value[4] !== 'string' ||
    !value[4] ||
    !Number.isSafeInteger(value[5]) ||
    (value[5] as number) < 1
  ) {
    throw new InvalidChatCursorError();
  }
  return { createdAt: value[4], seq: value[5] as number };
};

export const chatStore = {
  /** The caller's own session id, created on first use. Throws for an invalid owner. */
  ensureDefaultSession: (userId: string): string =>
    db.transactionSync((tx) => ensureOwnedSession(userId, tx)).sessionId,

  /**
   * Newest page first (default 50), or the page before an owner/session-bound
   * cursor. Ordered by timestamp then durable insertion order, so a user message
   * stays before the reply written in the same millisecond.
   */
  getMessagesPage: (userId: string, query: ChatPageQuery = {}): ChatPage => {
    const limit = query.limit ?? CHAT_PAGE_SIZE;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw new Error(`Chat page size must be between 1 and ${MAX_PAGE_SIZE}.`);
    }
    const session = db.transactionSync((tx) => ensureOwnedSession(userId, tx));
    let where = OWNED_MESSAGES;
    const params: unknown[] = [session.sessionId, userId];
    if (query.before !== undefined && query.before !== null) {
      const cursor = decodeCursor(query.before, userId, session);
      where += ' AND (m.created_at < ? OR (m.created_at = ? AND m.seq < ?))';
      params.push(cursor.createdAt, cursor.createdAt, cursor.seq);
    }
    const rows = db.executeSync(
      `SELECT m.* FROM ${where} ORDER BY m.created_at DESC, m.seq DESC LIMIT ?`,
      [...params, limit + 1],
    ).rows;
    const kept = rows.slice(0, limit);
    const oldest = kept[kept.length - 1];
    return {
      items: kept.map(mapMessage).reverse(),
      nextCursor:
        rows.length > limit && oldest ? encodeCursor(userId, session, oldest) : null,
    };
  },

  /** The latest `count` messages, oldest first. Read failures throw. */
  getRecentMessages: (userId: string, count: number): ChatMessage[] =>
    chatStore.getMessagesPage(userId, { limit: count }).items,

  /**
   * The whole owned conversation, oldest first. Unbounded: use only for an
   * explicit export; screens use `getMessagesPage`.
   */
  getMessages: (userId: string): ChatMessage[] => {
    try {
      const sessionId = chatStore.ensureDefaultSession(userId);
      return db
        .executeSync(
          `SELECT m.* FROM ${OWNED_MESSAGES} ORDER BY m.created_at ASC, m.seq ASC`,
          [sessionId, userId],
        )
        .rows.map(mapMessage);
    } catch (error) {
      console.error('Error fetching chat messages:', error);
      return [];
    }
  },

  addMessage: (
    userId: string,
    sender: 'user' | 'assistant',
    content: string,
    attachment?: ChatAttachment | null,
    metadata?: ChatMessageMetadata | null,
  ): ChatMessage => {
    const id = generateId('msg');
    return db.transactionSync((tx) => {
      const { sessionId } = ensureOwnedSession(userId, tx);
      return chatStore.insertMessage(
        { id, sessionId, sender, content, attachment, metadata },
        userId,
        tx,
      );
    });
  },

  /** Inserts into a session only after checking that `userId` owns it. */
  insertMessage: (
    msg: {
      id: string;
      sessionId: string;
      sender: 'user' | 'assistant';
      content: string;
      attachment?: ChatAttachment | null;
      metadata?: ChatMessageMetadata | null;
    },
    userId: string,
    executor?: Pick<DatabaseTransaction, 'executeSync'>,
  ): ChatMessage => {
    const write = (tx: Pick<DatabaseTransaction, 'executeSync'>): ChatMessage => {
      const owner = tx.executeSync('SELECT user_id FROM chat_sessions WHERE id = ?', [
        msg.sessionId,
      ]).rows[0]?.user_id;
      if (owner !== userId || msg.sessionId !== ownedChatSessionId(userId)) {
        throw new Error('Chat message owner does not match its session.');
      }
      const now = new Date().toISOString();
      const metadataJson = msg.metadata?.handbookNote
        ? JSON.stringify({ handbookNote: msg.metadata.handbookNote })
        : null;
      tx.executeSync(
        `INSERT INTO messages (id, session_id, sender, content, attachment_json, metadata_json, seq, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM messages), ?, ?)`,
        [
          msg.id,
          msg.sessionId,
          msg.sender,
          msg.content,
          msg.attachment ? JSON.stringify(msg.attachment) : null,
          metadataJson,
          now,
          now,
        ],
      );
      const row = tx.executeSync('SELECT seq FROM messages WHERE id = ?', [msg.id]).rows[0];
      return {
        id: msg.id,
        sessionId: msg.sessionId,
        sender: msg.sender,
        content: msg.content,
        attachment: msg.attachment || null,
        handbookNote: msg.metadata?.handbookNote || null,
        sequence: Number(row?.seq),
        createdAt: now,
        updatedAt: now,
      };
    };
    try {
      return executor ? write(executor) : db.transactionSync(write);
    } catch (error) {
      console.error('Error inserting chat message:', error);
      throw error;
    }
  },

  /**
   * File locations attached to the caller's own conversation. With `executor`
   * it reads inside the caller's transaction (Clear All Data, ADR-026).
   */
  getAttachmentUris: (userId: string, executor?: DatabaseTransaction): string[] => {
    const sessionId = executor
      ? ensureOwnedSession(userId, executor).sessionId
      : chatStore.ensureDefaultSession(userId);
    return (executor ?? db)
      .executeSync(
        `SELECT m.attachment_json FROM ${OWNED_MESSAGES} AND m.attachment_json IS NOT NULL`,
        [sessionId, userId],
      )
      .rows.map((row) => parseAttachment(row.attachment_json)?.uri)
      .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
  },

  /** Access check for opening/sharing a file: the URI must be in the caller's own messages. */
  hasAttachment: (userId: string, uri: string): boolean => {
    if (!uri) return false;
    try {
      return chatStore.getAttachmentUris(userId).includes(uri);
    } catch (error) {
      console.error('Error checking chat attachment access:', error);
      return false;
    }
  },

  /**
   * Deletes only the caller's own messages. Quarantined legacy history is
   * untouched. With `executor` it runs inside the caller's transaction.
   */
  clearHistory: (userId: string, executor?: DatabaseTransaction): void => {
    const clear = (tx: DatabaseTransaction) => {
      const { sessionId } = ensureOwnedSession(userId, tx);
      tx.executeSync(
        `DELETE FROM messages WHERE session_id = ?
           AND EXISTS (SELECT 1 FROM chat_sessions s WHERE s.id = messages.session_id AND s.user_id = ?)`,
        [sessionId, userId],
      );
    };
    try {
      if (executor) clear(executor);
      else db.transactionSync(clear);
    } catch (error) {
      console.error('Error clearing chat history:', error);
      throw error;
    }
  },

  /**
   * Counts only. Legacy history that could not be matched to one account stays
   * on the device, hidden from every account; its content is never returned.
   */
  getLegacyQuarantineSummary: (): LegacyChatSummary => {
    try {
      const row = db.executeSync(
        `SELECT COUNT(*) AS sessions,
                COALESCE(SUM((SELECT COUNT(*) FROM messages m WHERE m.session_id = q.session_id)), 0) AS messages
         FROM chat_legacy_quarantine q`,
      ).rows[0];
      return {
        sessionCount: Number(row?.sessions ?? 0),
        messageCount: Number(row?.messages ?? 0),
      };
    } catch {
      return { sessionCount: 0, messageCount: 0 };
    }
  },
};
