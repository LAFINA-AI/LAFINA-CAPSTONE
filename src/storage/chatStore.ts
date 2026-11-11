import {db} from './database';
import type {DatabaseTransaction} from './database';
import {generateId} from '../utils';
import {NEW_SESSION_GENERATION_SQL, ownedChatSessionId} from './chatOwnership';
import type {ChatMemoryChanges, RemovedChatMemory} from './chatMemoryStore';

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
  /** True for an assistant reply written on the device, not by DeepSeek. */
  localReply?: boolean;
  /** A live voice-conversation answer the student interrupted before it finished. */
  voiceInterrupted?: boolean;
  /** Memories this reply's exchange added or removed (shown with Undo). */
  memoryChanges?: ChatMemoryChanges | null;
  /** Durable insertion order; breaks ties between equal timestamps. */
  sequence?: number;
  createdAt: string;
  updatedAt: string;
}

export type ChatSessionKind = 'general' | 'ustp';

/** One row of the chat list, newest activity first. */
export interface ChatSummary {
  id: string;
  /** Whether this is a general assistant chat or a USTP Handbook RAG chat. */
  kind: ChatSessionKind;
  /** The student's own title, or the start of their first message. */
  title: string;
  /** True when the student renamed the chat. */
  customTitle: boolean;
  /** The latest message, shortened to one line. */
  preview: string;
  messageCount: number;
  lastMessageAt: string;
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
  /** Marks an on-device reply so it is never sent to DeepSeek as its own words. */
  localReply?: boolean;
  /** Saved from a live voice conversation and not heard to the end. */
  voiceInterrupted?: boolean;
  memoryChanges?: ChatMemoryChanges | null;
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
  /** A chat other than the current one (it must belong to the same account). */
  sessionId?: string | null;
}

export interface LegacyChatSummary {
  sessionCount: number;
  messageCount: number;
}

export const CHAT_PAGE_SIZE = 50;
/** local_settings key holding the chat the student has open. */
export const CURRENT_CHAT_KEY = 'chat.currentSession';
/** Ids of chats started with New chat; the first chat keeps its owner-bound id. */
export const NEW_CHAT_PREFIX = 'chat_session:';
/** Sub-prefix for dedicated USTP Student Handbook RAG chats. */
export const USTP_CHAT_PREFIX = `${NEW_CHAT_PREFIX}ustp_`;
export const isUstpSessionId = (sessionId?: string | null): boolean =>
  typeof sessionId === 'string' && sessionId.startsWith(USTP_CHAT_PREFIX);
export const MAX_CHAT_TITLE = 60;
const PLACEHOLDER_TITLES = ['Default Chat', 'New chat', 'Ask about USTP'];
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
    if (typeof value?.uri !== 'string' || typeof value.fileName !== 'string')
      return null;
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
    const value = JSON.parse(raw) as {handbookNote?: unknown};
    return typeof value?.handbookNote === 'string' && value.handbookNote
      ? value.handbookNote
      : null;
  } catch {
    return null;
  }
};

const parseFlag = (
  raw: unknown,
  flag: 'localReply' | 'voiceInterrupted',
): boolean => {
  if (typeof raw !== 'string' || !raw) return false;
  try {
    return (JSON.parse(raw) as Record<string, unknown> | null)?.[flag] === true;
  } catch {
    return false;
  }
};
const parseLocalReply = (raw: unknown): boolean => parseFlag(raw, 'localReply');

const parseMemoryChanges = (raw: unknown): ChatMemoryChanges | null => {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const value = (JSON.parse(raw) as {memoryChanges?: unknown} | null)
      ?.memoryChanges as Partial<ChatMemoryChanges> | undefined;
    if (!value || typeof value !== 'object') return null;
    const items = (list: unknown): RemovedChatMemory[] =>
      Array.isArray(list)
        ? list
            .filter(
              (item): item is {id: string; text: string} =>
                typeof item?.id === 'string' && typeof item?.text === 'string',
            )
            .map(item => {
              const extra = item as Record<string, unknown>;
              return {
                id: item.id,
                text: item.text,
                ...(extra.source === 'manual' || extra.source === 'chat'
                  ? {source: extra.source}
                  : {}),
                ...(typeof extra.sessionId === 'string' ||
                extra.sessionId === null
                  ? {sessionId: extra.sessionId}
                  : {}),
                ...(typeof extra.createdAt === 'string'
                  ? {createdAt: extra.createdAt}
                  : {}),
                ...(typeof extra.updatedAt === 'string'
                  ? {updatedAt: extra.updatedAt}
                  : {}),
                ...(typeof extra.rowId === 'number' &&
                Number.isSafeInteger(extra.rowId)
                  ? {rowId: extra.rowId}
                  : {}),
              };
            })
        : [];
    const changes: ChatMemoryChanges = {
      added: items(value.added),
      removed: items(value.removed),
    };
    if (value.undone === true) changes.undone = true;
    if (typeof value.revision === 'string') changes.revision = value.revision;
    return changes.added.length || changes.removed.length ? changes : null;
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
  localReply: parseLocalReply(row.metadata_json),
  voiceInterrupted: parseFlag(row.metadata_json, 'voiceInterrupted'),
  memoryChanges: parseMemoryChanges(row.metadata_json),
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
  const row = tx.executeSync(
    'SELECT user_id, generation FROM chat_sessions WHERE id = ?',
    [sessionId],
  ).rows[0];
  if (row?.user_id !== userId) {
    throw new Error(
      'Chat session ownership does not match the signed-in account.',
    );
  }
  return {sessionId, generation: String(row.generation ?? '')};
};

type Executor = Pick<DatabaseTransaction, 'executeSync'>;

/** A chat started with New chat, read only if this owner holds it (never a quarantined one). */
const ownedNewChat = (
  userId: string,
  sessionId: string,
  tx: Executor,
): OwnedSession | null => {
  if (!sessionId.startsWith(NEW_CHAT_PREFIX)) return null;
  const row = tx.executeSync(
    `SELECT user_id, generation FROM chat_sessions
     WHERE id = ? AND id NOT IN (SELECT session_id FROM chat_legacy_quarantine)`,
    [sessionId],
  ).rows[0];
  return row?.user_id === userId
    ? {sessionId, generation: String(row.generation ?? '')}
    : null;
};

const setCurrentChat = (
  userId: string,
  sessionId: string | null,
  tx: Executor,
): void => {
  if (sessionId === null || sessionId === ownedChatSessionId(userId)) {
    tx.executeSync('DELETE FROM local_settings WHERE user_id = ? AND key = ?', [
      userId,
      CURRENT_CHAT_KEY,
    ]);
    return;
  }
  tx.executeSync(
    `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [userId, CURRENT_CHAT_KEY, sessionId, new Date().toISOString()],
  );
};

/** The chat the student has open: a New chat they started, or their first chat. */
const currentSession = (
  userId: string,
  tx: DatabaseTransaction,
): OwnedSession => {
  ownedChatSessionId(userId); // validates the owner before any read
  const saved = tx.executeSync(
    'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
    [userId, CURRENT_CHAT_KEY],
  ).rows[0]?.value;
  if (typeof saved === 'string') {
    const chosen = ownedNewChat(userId, saved, tx);
    if (chosen) return chosen;
  }
  return ensureOwnedSession(userId, tx);
};

/** `sessionId` when given (owner-checked), else the current chat. */
const sessionFor = (
  userId: string,
  tx: DatabaseTransaction,
  sessionId?: string | null,
): OwnedSession => {
  if (sessionId === undefined || sessionId === null)
    return currentSession(userId, tx);
  if (sessionId === ownedChatSessionId(userId))
    return ensureOwnedSession(userId, tx);
  const chosen = ownedNewChat(userId, sessionId, tx);
  if (!chosen)
    throw new Error('This chat does not belong to the signed-in account.');
  return chosen;
};

/** Every chat of this owner: the first chat plus New chats, never quarantined history. */
const OWNED_SESSIONS = `SELECT id FROM chat_sessions
  WHERE user_id = ? AND (id = ? OR substr(id, 1, ${NEW_CHAT_PREFIX.length}) = '${NEW_CHAT_PREFIX}')
    AND id NOT IN (SELECT session_id FROM chat_legacy_quarantine)`;

const ownedSessionParams = (userId: string): string[] => [
  userId,
  ownedChatSessionId(userId),
];

const messageCount = (sessionId: string, tx: Executor): number =>
  Number(
    tx.executeSync(
      'SELECT COUNT(*) AS count FROM messages WHERE session_id = ?',
      [sessionId],
    ).rows[0]?.count ?? 0,
  );

/** Empty New chats left behind are removed, except `keep`. */
const dropEmptyNewChats = (
  userId: string,
  keep: string | null,
  tx: Executor,
): void => {
  tx.executeSync(
    `DELETE FROM chat_sessions
     WHERE user_id = ? AND substr(id, 1, ${NEW_CHAT_PREFIX.length}) = '${NEW_CHAT_PREFIX}'
       AND id <> ?
       AND id NOT IN (SELECT session_id FROM chat_legacy_quarantine)
       AND NOT EXISTS (SELECT 1 FROM messages WHERE session_id = chat_sessions.id)`,
    [userId, keep ?? ''],
  );
};

const oneLine = (text: string, max: number): string => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};

const escapeLike = (text: string): string =>
  text.replace(/[\\%_]/g, c => `\\${c}`);

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
): {createdAt: string; seq: number} => {
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
  return {createdAt: value[4], seq: value[5] as number};
};

export const chatStore = {
  /** The caller's first chat id, created on first use. Throws for an invalid owner. */
  ensureDefaultSession: (userId: string): string =>
    db.transactionSync(tx => ensureOwnedSession(userId, tx)).sessionId,

  /** The chat the student has open (their first chat until they start another). */
  currentSessionId: (userId: string): string =>
    db.transactionSync(tx => currentSession(userId, tx)).sessionId,

  /**
   * The account's chats that have messages, most recent activity first.
   * `search` matches the title or any message (case-insensitive).
   */
  listSessions: (
    userId: string,
    search = '',
    kindFilter: ChatSessionKind | 'all' = 'all',
  ): ChatSummary[] => {
    const params: unknown[] = ownedSessionParams(userId);
    let filter = '';
    if (kindFilter === 'ustp') {
      filter += `AND substr(s.id, 1, ${USTP_CHAT_PREFIX.length}) = '${USTP_CHAT_PREFIX}' `;
    } else if (kindFilter === 'general') {
      filter += `AND substr(s.id, 1, ${USTP_CHAT_PREFIX.length}) <> '${USTP_CHAT_PREFIX}' `;
    }
    const query = search.trim();
    if (query) {
      const pattern = `%${escapeLike(query)}%`;
      filter += `AND (s.title LIKE ? ESCAPE '\\' OR EXISTS (
        SELECT 1 FROM messages f WHERE f.session_id = s.id AND f.content LIKE ? ESCAPE '\\'))`;
      params.push(pattern, pattern);
    }
    const rows = db.executeSync(
      `SELECT s.id, s.title,
         (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count,
         (SELECT MAX(m.created_at) FROM messages m WHERE m.session_id = s.id) AS last_at,
         (SELECT m.content FROM messages m WHERE m.session_id = s.id AND m.sender = 'user'
            ORDER BY m.created_at, m.seq LIMIT 1) AS first_user,
         (SELECT m.content FROM messages m WHERE m.session_id = s.id
            ORDER BY m.created_at DESC, m.seq DESC LIMIT 1) AS last_content
       FROM chat_sessions s
       WHERE s.id IN (${OWNED_SESSIONS})
         AND EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id)
         ${filter}
       ORDER BY last_at DESC, s.id`,
      params,
    ).rows;
    return rows.map(row => {
      const stored = typeof row.title === 'string' ? row.title.trim() : '';
      const customTitle =
        stored.length > 0 && !PLACEHOLDER_TITLES.includes(stored);
      const firstUser =
        typeof row.first_user === 'string' ? row.first_user : '';
      const id = String(row.id);
      return {
        id,
        kind: isUstpSessionId(id) ? 'ustp' : 'general',
        title: customTitle
          ? stored
          : firstUser.trim()
          ? oneLine(firstUser, MAX_CHAT_TITLE)
          : 'New chat',
        customTitle,
        preview: oneLine(String(row.last_content ?? ''), 90),
        messageCount: Number(row.message_count ?? 0),
        lastMessageAt: String(row.last_at ?? ''),
      };
    });
  },

  /** Opens one of the account's chats. Throws for a chat it does not own. */
  openSession: (userId: string, sessionId: string): void => {
    db.transactionSync(tx => {
      const chosen = sessionFor(userId, tx, sessionId);
      setCurrentChat(userId, chosen.sessionId, tx);
      dropEmptyNewChats(userId, chosen.sessionId, tx);
    });
  },

  /** The title of the session, matching the sidebar title rules. */
  getSessionTitle: (userId: string, sessionId?: string | null): string =>
    db.transactionSync(tx => {
      const chosen = sessionFor(userId, tx, sessionId);
      const rows = tx.executeSync(
        `SELECT s.title,
           (SELECT m.content FROM messages m WHERE m.session_id = s.id AND m.sender = 'user'
            ORDER BY m.created_at ASC, m.id ASC LIMIT 1) AS first_user
         FROM chat_sessions s
         WHERE s.id = ?`,
        [chosen.sessionId],
      ).rows;
      const fallback = isUstpSessionId(chosen.sessionId)
        ? 'Ask about USTP'
        : 'New chat';
      if (!rows.length) return fallback;
      const row = rows[0];
      const stored = typeof row.title === 'string' ? row.title.trim() : '';
      const customTitle =
        stored.length > 0 && !PLACEHOLDER_TITLES.includes(stored);
      if (customTitle) return stored;
      const firstUser =
        typeof row.first_user === 'string' ? row.first_user : '';
      if (firstUser.trim()) return oneLine(firstUser, MAX_CHAT_TITLE);
      return fallback;
    }),

  /**
   * Starts an empty chat and opens it. If the open chat is still empty it is
   * reused, so tapping New chat twice does not leave empty chats behind.
   */
  startNewChat: (userId: string, kind: ChatSessionKind = 'general'): string =>
    db.transactionSync(tx => {
      const open = currentSession(userId, tx);
      const openIsUstp = isUstpSessionId(open.sessionId);
      if (kind === 'ustp') {
        if (messageCount(open.sessionId, tx) === 0 && openIsUstp) {
          dropEmptyNewChats(userId, open.sessionId, tx);
          return open.sessionId;
        }
        const next = `${USTP_CHAT_PREFIX}${generateId('chat')}`;
        const now = new Date().toISOString();
        tx.executeSync(
          `INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at, generation)
           VALUES (?, ?, 'Ask about USTP', ?, ?, ${NEW_SESSION_GENERATION_SQL})`,
          [next, userId, now, now],
        );
        setCurrentChat(userId, next, tx);
        dropEmptyNewChats(userId, next, tx);
        return next;
      }
      if (messageCount(open.sessionId, tx) === 0 && !openIsUstp) {
        dropEmptyNewChats(userId, open.sessionId, tx);
        return open.sessionId;
      }
      const first = ensureOwnedSession(userId, tx);
      let next = first.sessionId;
      if (messageCount(first.sessionId, tx) > 0) {
        next = `${NEW_CHAT_PREFIX}${generateId('chat')}`;
        const now = new Date().toISOString();
        tx.executeSync(
          `INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at, generation)
           VALUES (?, ?, 'New chat', ?, ?, ${NEW_SESSION_GENERATION_SQL})`,
          [next, userId, now, now],
        );
      }
      setCurrentChat(userId, next, tx);
      dropEmptyNewChats(userId, next, tx);
      return next;
    }),

  /** Starts a dedicated empty USTP Student Handbook RAG chat and opens it. */
  startNewUstpChat: (userId: string): string =>
    chatStore.startNewChat(userId, 'ustp'),

  /** Renames one of the account's chats; an empty title goes back to the automatic one. */
  renameSession: (userId: string, sessionId: string, title: string): void => {
    const clean = title
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_CHAT_TITLE)
      .trim();
    db.transactionSync(tx => {
      const chosen = sessionFor(userId, tx, sessionId);
      tx.executeSync(
        'UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        [
          clean ||
            (isUstpSessionId(chosen.sessionId) ? 'Ask about USTP' : 'New chat'),
          new Date().toISOString(),
          chosen.sessionId,
          userId,
        ],
      );
    });
  },

  /**
   * Deletes one chat and its messages. Returns the attachment files it held so
   * the caller can remove them. Deleting the open chat opens an empty one.
   */
  deleteSession: (
    userId: string,
    sessionId: string,
  ): {attachmentUris: string[]} =>
    db.transactionSync(tx => {
      const chosen = sessionFor(userId, tx, sessionId);
      const wasOpen = currentSession(userId, tx).sessionId === chosen.sessionId;
      const attachmentUris = tx
        .executeSync(
          'SELECT attachment_json FROM messages WHERE session_id = ? AND attachment_json IS NOT NULL',
          [chosen.sessionId],
        )
        .rows.map(row => parseAttachment(row.attachment_json)?.uri)
        .filter(
          (uri): uri is string => typeof uri === 'string' && uri.length > 0,
        );
      tx.executeSync('DELETE FROM messages WHERE session_id = ?', [
        chosen.sessionId,
      ]);
      if (chosen.sessionId === ownedChatSessionId(userId)) {
        // The first chat keeps its owner-bound row; a new generation retires old cursors.
        tx.executeSync(
          `UPDATE chat_sessions SET title = 'Default Chat', generation = ${NEW_SESSION_GENERATION_SQL}
           WHERE id = ? AND user_id = ?`,
          [chosen.sessionId, userId],
        );
      } else {
        tx.executeSync(
          'DELETE FROM chat_sessions WHERE id = ? AND user_id = ?',
          [chosen.sessionId, userId],
        );
      }
      if (wasOpen) {
        if (isUstpSessionId(chosen.sessionId)) {
          const next = `${USTP_CHAT_PREFIX}${generateId('chat')}`;
          const now = new Date().toISOString();
          tx.executeSync(
            `INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at, generation)
             VALUES (?, ?, 'Ask about USTP', ?, ?, ${NEW_SESSION_GENERATION_SQL})`,
            [next, userId, now, now],
          );
          setCurrentChat(userId, next, tx);
        } else {
          setCurrentChat(userId, null, tx);
          const first = ensureOwnedSession(userId, tx);
          if (messageCount(first.sessionId, tx) > 0) {
            const next = `${NEW_CHAT_PREFIX}${generateId('chat')}`;
            const now = new Date().toISOString();
            tx.executeSync(
              `INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at, generation)
               VALUES (?, ?, 'New chat', ?, ?, ${NEW_SESSION_GENERATION_SQL})`,
              [next, userId, now, now],
            );
            setCurrentChat(userId, next, tx);
          }
        }
      }
      return {attachmentUris};
    }),

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
    const session = db.transactionSync(tx =>
      sessionFor(userId, tx, query.sessionId),
    );
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
        rows.length > limit && oldest
          ? encodeCursor(userId, session, oldest)
          : null,
    };
  },

  /** The latest `count` messages of a chat (default: the open one), oldest first. Read failures throw. */
  getRecentMessages: (
    userId: string,
    count: number,
    sessionId?: string | null,
  ): ChatMessage[] =>
    chatStore.getMessagesPage(userId, {limit: count, sessionId}).items,

  /**
   * A whole chat (default: the open one), oldest first. Unbounded: use only
   * for an explicit export; screens use `getMessagesPage`.
   */
  getMessages: (userId: string, sessionId?: string | null): ChatMessage[] => {
    try {
      const session = db.transactionSync(tx =>
        sessionFor(userId, tx, sessionId),
      );
      return db
        .executeSync(
          `SELECT m.* FROM ${OWNED_MESSAGES} ORDER BY m.created_at ASC, m.seq ASC`,
          [session.sessionId, userId],
        )
        .rows.map(mapMessage);
    } catch (error) {
      console.error('Error fetching chat messages:', error);
      return [];
    }
  },

  /** Adds to `sessionId` (owner-checked) or, by default, the open chat. */
  addMessage: (
    userId: string,
    sender: 'user' | 'assistant',
    content: string,
    attachment?: ChatAttachment | null,
    metadata?: ChatMessageMetadata | null,
    sessionId?: string | null,
    executor?: DatabaseTransaction,
  ): ChatMessage => {
    const id = generateId('msg');
    const write = (tx: DatabaseTransaction): ChatMessage => {
      const session = sessionFor(userId, tx, sessionId);
      return chatStore.insertMessage(
        {
          id,
          sessionId: session.sessionId,
          sender,
          content,
          attachment,
          metadata,
        },
        userId,
        tx,
      );
    };
    return executor ? write(executor) : db.transactionSync(write);
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
    const write = (
      tx: Pick<DatabaseTransaction, 'executeSync'>,
    ): ChatMessage => {
      const owner = tx.executeSync(
        'SELECT user_id FROM chat_sessions WHERE id = ?',
        [msg.sessionId],
      ).rows[0]?.user_id;
      const ownedId =
        msg.sessionId === ownedChatSessionId(userId) ||
        ownedNewChat(userId, msg.sessionId, tx) !== null;
      if (owner !== userId || !ownedId) {
        throw new Error('Chat message owner does not match its session.');
      }
      const now = new Date().toISOString();
      const metadataValue = {
        ...(msg.metadata?.handbookNote
          ? {handbookNote: msg.metadata.handbookNote}
          : {}),
        ...(msg.metadata?.localReply ? {localReply: true} : {}),
        ...(msg.metadata?.voiceInterrupted ? {voiceInterrupted: true} : {}),
        ...(msg.metadata?.memoryChanges
          ? {memoryChanges: msg.metadata.memoryChanges}
          : {}),
      };
      const metadataJson = Object.keys(metadataValue).length
        ? JSON.stringify(metadataValue)
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
      tx.executeSync('UPDATE chat_sessions SET updated_at = ? WHERE id = ?', [
        now,
        msg.sessionId,
      ]);
      const row = tx.executeSync('SELECT seq FROM messages WHERE id = ?', [
        msg.id,
      ]).rows[0];
      return {
        id: msg.id,
        sessionId: msg.sessionId,
        sender: msg.sender,
        content: msg.content,
        attachment: msg.attachment || null,
        handbookNote: msg.metadata?.handbookNote || null,
        localReply: msg.metadata?.localReply === true,
        voiceInterrupted: msg.metadata?.voiceInterrupted === true,
        memoryChanges: msg.metadata?.memoryChanges ?? null,
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

  /** Undefined when the reply was removed or is not owned; null when it has no memory notice. */
  getMemoryChanges: (
    userId: string,
    messageId: string,
    executor: Executor = db,
    sessionId?: string,
  ): ChatMemoryChanges | null | undefined => {
    const row = executor.executeSync(
      `SELECT m.metadata_json FROM messages m JOIN chat_sessions s ON s.id = m.session_id
       WHERE m.id = ? AND m.sender = 'assistant' AND s.user_id = ? AND s.id IN (${OWNED_SESSIONS})
       ${sessionId === undefined ? '' : 'AND m.session_id = ?'}`,
      [
        messageId,
        userId,
        ...ownedSessionParams(userId),
        ...(sessionId === undefined ? [] : [sessionId]),
      ],
    ).rows[0];
    return row ? parseMemoryChanges(row.metadata_json) : undefined;
  },

  /**
   * Records the memory changes an exchange made on its reply (or clears them
   * with null), so Chat can show them with Undo. Only the owner's message.
   */
  setMemoryChanges: (
    userId: string,
    messageId: string,
    changes: ChatMemoryChanges | null,
    executor?: Executor,
  ): boolean => {
    const write = (tx: Executor): boolean => {
      const row = tx.executeSync(
        `SELECT m.metadata_json FROM messages m JOIN chat_sessions s ON s.id = m.session_id
         WHERE m.id = ? AND m.sender = 'assistant' AND s.user_id = ? AND s.id IN (${OWNED_SESSIONS})`,
        [messageId, userId, ...ownedSessionParams(userId)],
      ).rows[0];
      if (!row) return false;
      let metadata: Record<string, unknown> = {};
      try {
        const parsed: unknown = row.metadata_json
          ? JSON.parse(String(row.metadata_json))
          : {};
        if (parsed && typeof parsed === 'object')
          metadata = parsed as Record<string, unknown>;
      } catch {
        metadata = {};
      }
      if (changes) metadata.memoryChanges = changes;
      else delete metadata.memoryChanges;
      tx.executeSync(
        'UPDATE messages SET metadata_json = ?, updated_at = ? WHERE id = ?',
        [
          Object.keys(metadata).length ? JSON.stringify(metadata) : null,
          new Date().toISOString(),
          messageId,
        ],
      );
      return true;
    };
    return executor ? write(executor) : db.transactionSync(write);
  },

  /**
   * File locations attached to the caller's own chats: every chat by default,
   * or one chat. With `executor` it reads inside the caller's transaction
   * (Clear All Data, ADR-026).
   */
  getAttachmentUris: (
    userId: string,
    executor?: DatabaseTransaction,
    sessionId?: string | null,
  ): string[] => {
    const read = (tx: DatabaseTransaction): string[] => {
      const scope = sessionId
        ? {
            sql: 'm.session_id = ?',
            params: [sessionFor(userId, tx, sessionId).sessionId],
          }
        : {
            sql: `m.session_id IN (${OWNED_SESSIONS})`,
            params: ownedSessionParams(userId),
          };
      return tx
        .executeSync(
          `SELECT m.attachment_json FROM messages m JOIN chat_sessions s ON s.id = m.session_id
           WHERE ${scope.sql} AND s.user_id = ? AND m.attachment_json IS NOT NULL`,
          [...scope.params, userId],
        )
        .rows.map(row => parseAttachment(row.attachment_json)?.uri)
        .filter(
          (uri): uri is string => typeof uri === 'string' && uri.length > 0,
        );
    };
    return executor ? read(executor) : db.transactionSync(read);
  },

  /** Access check for opening/sharing a file: the URI must be in one of the caller's own chats. */
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
   * Deletes every chat of the caller (their first chat is kept, empty).
   * Quarantined legacy history is untouched. With `executor` it runs inside
   * the caller's transaction.
   */
  clearHistory: (userId: string, executor?: DatabaseTransaction): void => {
    const clear = (tx: DatabaseTransaction) => {
      const {sessionId} = ensureOwnedSession(userId, tx);
      tx.executeSync(
        `DELETE FROM messages WHERE session_id IN (${OWNED_SESSIONS})`,
        ownedSessionParams(userId),
      );
      tx.executeSync(
        `DELETE FROM chat_sessions WHERE id IN (${OWNED_SESSIONS}) AND id <> ?`,
        [...ownedSessionParams(userId), sessionId],
      );
      tx.executeSync(
        `UPDATE chat_sessions SET title = 'Default Chat' WHERE id = ?`,
        [sessionId],
      );
      setCurrentChat(userId, null, tx);
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
      return {sessionCount: 0, messageCount: 0};
    }
  },
};
