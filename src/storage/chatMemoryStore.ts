import {db} from './database';
import type {DatabaseTransaction} from './database';
import {generateId} from '../utils';
import {isValidChatOwner} from './chatOwnership';

/**
 * Chat memory: short facts LAFINA keeps about a student between chats, such
 * as their program, routine or how they like answers. They live only in this
 * phone's database (never synced). Online chat sends them with each message,
 * and after a reply the server suggests what to add or forget; the student
 * sees every change in Chat (with Undo) and can edit the list in Profile.
 */

export interface ChatMemory {
  id: string;
  text: string;
  /** `chat`: learned from a conversation. `manual`: typed in Profile. */
  source: 'chat' | 'manual';
  sessionId: string | null;
  createdAt: string;
}

/** What one exchange changed, kept on the reply so Chat can show and undo it. */
export interface RemovedChatMemory {
  id: string;
  text: string;
  source?: ChatMemory['source'];
  sessionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  rowId?: number;
}

export interface ChatMemoryChanges {
  added: {id: string; text: string}[];
  removed: RemovedChatMemory[];
  /** Owner-local state after this change; stale Undo must not restore forgotten data. */
  revision?: string;
  /** The student tapped Undo. */
  undone?: boolean;
}

export const MEMORY_ENABLED_KEY = 'memory.enabled';
const MEMORY_REVISION_KEY = 'memory.revision';
/** Oldest memories are dropped past this many. */
export const MAX_STORED_MEMORIES = 100;
/** How many (newest first) go with a chat message. */
export const MAX_PROMPT_MEMORIES = 40;
export const MAX_MEMORY_TEXT = 200;

const requireOwner = (userId: string): void => {
  if (!isValidChatOwner(userId))
    throw new Error('A valid memory owner is required.');
};

const cleanText = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().slice(0, MAX_MEMORY_TEXT).trim();

const mapMemory = (row: Record<string, unknown>): ChatMemory => ({
  id: String(row.id),
  text: String(row.text ?? ''),
  source: row.source === 'manual' ? 'manual' : 'chat',
  sessionId: typeof row.session_id === 'string' ? row.session_id : null,
  createdAt: String(row.created_at),
});

type Executor = Pick<DatabaseTransaction, 'executeSync'>;

const insert = (
  tx: Executor,
  userId: string,
  memory: {
    id?: string;
    text: string;
    source: ChatMemory['source'];
    sessionId?: string | null;
  },
): ChatMemory | null => {
  const text = cleanText(memory.text);
  if (text.length < 2) return null;
  const duplicate = tx.executeSync(
    'SELECT id FROM chat_memories WHERE user_id = ? AND lower(text) = lower(?)',
    [userId, text],
  ).rows[0];
  if (duplicate) return null;
  const now = new Date().toISOString();
  const id = memory.id ?? generateId('mem');
  tx.executeSync(
    `INSERT INTO chat_memories (id, user_id, text, source, session_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, text, memory.source, memory.sessionId ?? null, now, now],
  );
  // Keep the newest MAX_STORED_MEMORIES.
  tx.executeSync(
    `DELETE FROM chat_memories WHERE user_id = ? AND id NOT IN (
       SELECT id FROM chat_memories WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
    [userId, userId, MAX_STORED_MEMORIES],
  );
  return {
    id,
    text,
    source: memory.source,
    sessionId: memory.sessionId ?? null,
    createdAt: now,
  };
};

const bumpRevision = (userId: string, tx: Executor): string => {
  const revision = generateId('memory_revision');
  tx.executeSync(
    `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [userId, MEMORY_REVISION_KEY, revision, new Date().toISOString()],
  );
  return revision;
};

const snapshots = (userId: string, tx: Executor): RemovedChatMemory[] =>
  tx
    .executeSync(
      'SELECT rowid AS memory_rowid, * FROM chat_memories WHERE user_id = ? ORDER BY created_at, rowid',
      [userId],
    )
    .rows.map(row => ({
      id: String(row.id),
      text: String(row.text),
      source: row.source === 'manual' ? 'manual' : 'chat',
      sessionId: typeof row.session_id === 'string' ? row.session_id : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      rowId: Number(row.memory_rowid),
    }));

export const chatMemoryStore = {
  /** Persisted guard for async extraction and Undo, including clears of an empty list. */
  revision: (userId: string, executor: Executor = db): string => {
    requireOwner(userId);
    return String(
      executor.executeSync(
        'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
        [userId, MEMORY_REVISION_KEY],
      ).rows[0]?.value ?? '',
    );
  },
  /** On unless the student turned memory off in Profile. */
  isEnabled: (userId: string, executor: Executor = db): boolean => {
    try {
      const row = executor.executeSync(
        'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
        [userId, MEMORY_ENABLED_KEY],
      ).rows[0];
      return row?.value !== 'false';
    } catch {
      return false;
    }
  },

  setEnabled: (userId: string, enabled: boolean): boolean => {
    try {
      requireOwner(userId);
      db.transactionSync(tx => {
        tx.executeSync(
          `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [
            userId,
            MEMORY_ENABLED_KEY,
            enabled ? 'true' : 'false',
            new Date().toISOString(),
          ],
        );
        bumpRevision(userId, tx);
      });
      return true;
    } catch (error) {
      console.error('Error saving the memory setting:', error);
      return false;
    }
  },

  /** Newest first. Read failures throw. */
  list: (userId: string, executor: Executor = db): ChatMemory[] => {
    requireOwner(userId);
    return executor
      .executeSync(
        'SELECT * FROM chat_memories WHERE user_id = ? ORDER BY created_at DESC, rowid DESC',
        [userId],
      )
      .rows.map(mapMemory);
  },

  /** What goes with an online chat message: none when memory is off. */
  forPrompt: (userId: string): {id: string; text: string}[] => {
    if (!chatMemoryStore.isEnabled(userId)) return [];
    try {
      return chatMemoryStore
        .list(userId)
        .slice(0, MAX_PROMPT_MEMORIES)
        .map(({id, text}) => ({id, text}));
    } catch {
      return [];
    }
  },

  /** A memory the student typed. Returns null for an empty or duplicate one. */
  add: (userId: string, text: string): ChatMemory | null => {
    requireOwner(userId);
    return db.transactionSync(tx => {
      const saved = insert(tx, userId, {text, source: 'manual'});
      if (saved) bumpRevision(userId, tx);
      return saved;
    });
  },

  remove: (userId: string, memoryId: string): boolean => {
    requireOwner(userId);
    db.transactionSync(tx => {
      tx.executeSync('DELETE FROM chat_memories WHERE user_id = ? AND id = ?', [
        userId,
        memoryId,
      ]);
      bumpRevision(userId, tx);
    });
    return true;
  },

  clear: (userId: string, executor?: Executor): void => {
    requireOwner(userId);
    const clear = (tx: Executor) => {
      tx.executeSync('DELETE FROM chat_memories WHERE user_id = ?', [userId]);
      bumpRevision(userId, tx);
    };
    if (executor) clear(executor);
    else db.transactionSync(clear);
  },

  /**
   * Applies what the server suggested after one exchange, in one transaction.
   * Only this owner's memories can be removed. Returns what actually changed.
   */
  applyChanges: (
    userId: string,
    change: {add: string[]; remove: string[]; clearAll?: boolean},
    sessionId: string | null,
    executor?: Executor,
  ): ChatMemoryChanges => {
    requireOwner(userId);
    const apply = (tx: Executor): ChatMemoryChanges => {
      const before = snapshots(userId, tx);
      if (change.clearAll) {
        tx.executeSync('DELETE FROM chat_memories WHERE user_id = ?', [userId]);
      } else {
        for (const id of change.remove) {
          tx.executeSync(
            'DELETE FROM chat_memories WHERE user_id = ? AND id = ?',
            [userId, id],
          );
        }
      }
      for (const text of change.add)
        insert(tx, userId, {text, source: 'chat', sessionId});
      const after = snapshots(userId, tx);
      const beforeIds = new Set(before.map(m => m.id));
      const afterIds = new Set(after.map(m => m.id));
      // Comparing the actual rows also records storage-limit evictions.
      const removed = before.filter(m => !afterIds.has(m.id));
      const added = after
        .filter(m => !beforeIds.has(m.id))
        .map(({id, text}) => ({id, text}));
      const revision =
        added.length || removed.length || change.clearAll
          ? bumpRevision(userId, tx)
          : chatMemoryStore.revision(userId, tx);
      return {added, removed, revision};
    };
    return executor ? apply(executor) : db.transactionSync(apply);
  },

  /** Restore the complete removal snapshots, only while the recorded state is current. */
  undoChanges: (
    userId: string,
    changes: ChatMemoryChanges,
    executor?: Executor,
  ): void => {
    requireOwner(userId);
    const undo = (tx: Executor) => {
      if (
        !changes.revision ||
        changes.revision !== chatMemoryStore.revision(userId, tx)
      ) {
        throw new Error(
          'Memories have changed since this reply. Review them in Profile.',
        );
      }
      for (const memory of changes.added) {
        tx.executeSync(
          'DELETE FROM chat_memories WHERE user_id = ? AND id = ?',
          [userId, memory.id],
        );
      }
      for (const memory of changes.removed) {
        const now = new Date().toISOString();
        const rowId =
          memory.rowId &&
          !tx.executeSync('SELECT id FROM chat_memories WHERE rowid = ?', [
            memory.rowId,
          ]).rows.length
            ? memory.rowId
            : null;
        tx.executeSync(
          `INSERT INTO chat_memories (rowid, id, user_id, text, source, session_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rowId,
            memory.id,
            userId,
            memory.text,
            memory.source ?? 'chat',
            memory.sessionId ?? null,
            memory.createdAt ?? now,
            memory.updatedAt ?? now,
          ],
        );
      }
      bumpRevision(userId, tx);
    };
    if (executor) undo(executor);
    else db.transactionSync(undo);
  },

  /** Guest linking: the new account keeps the guest's memories (inside the caller's transaction). */
  transferFromGuest: (
    tx: Executor,
    fromUserId: string,
    toUserId: string,
  ): void => {
    if (fromUserId === toUserId) return;
    bumpRevision(fromUserId, tx);
    bumpRevision(toUserId, tx);
    tx.executeSync('UPDATE chat_memories SET user_id = ? WHERE user_id = ?', [
      toUserId,
      fromUserId,
    ]);
  },
};
