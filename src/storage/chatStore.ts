import { db } from './database';

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

const DEFAULT_SESSION_ID = 'default_chat_session';

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

export const chatStore = {
  ensureDefaultSession: (userId: string): string => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `INSERT OR IGNORE INTO chat_sessions (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [DEFAULT_SESSION_ID, userId, 'Default Chat', now, now],
      );
      return DEFAULT_SESSION_ID;
    } catch (error) {
      console.error('Error ensuring default chat session:', error);
      return DEFAULT_SESSION_ID;
    }
  },

  getMessages: (userId: string): ChatMessage[] => {
    try {
      const sessionId = chatStore.ensureDefaultSession(userId);
      const result = db.executeSync(
        `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`,
        [sessionId],
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        sessionId: row.session_id,
        sender: row.sender as 'user' | 'assistant',
        content: row.content,
        attachment: parseAttachment(row.attachment_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      console.error('Error fetching chat messages:', error);
      return [];
    }
  },

  insertMessage: (msg: {
    id: string;
    sessionId: string;
    sender: 'user' | 'assistant';
    content: string;
    attachment?: ChatAttachment | null;
  }): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `INSERT INTO messages (id, session_id, sender, content, attachment_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          msg.id,
          msg.sessionId,
          msg.sender,
          msg.content,
          msg.attachment ? JSON.stringify(msg.attachment) : null,
          now,
          now,
        ],
      );
    } catch (error) {
      console.error('Error inserting chat message:', error);
      throw error;
    }
  },

  getAttachmentUris: (userId: string): string[] =>
    chatStore
      .getMessages(userId)
      .map((message) => message.attachment?.uri)
      .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0),

  clearHistory: (userId: string): void => {
    const sessionId = chatStore.ensureDefaultSession(userId);
    try {
      db.executeSync(`DELETE FROM messages WHERE session_id = ?`, [sessionId]);
    } catch (error) {
      console.error('Error clearing chat history:', error);
      throw error;
    }
  },
};
