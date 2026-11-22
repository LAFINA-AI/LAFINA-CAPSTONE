import {db} from './database';
import type {DatabaseTransaction} from './database';
import {generateId} from '../utils';
import {isValidChatOwner} from './chatOwnership';

/**
 * Chat memory: facts LAFINA keeps about a student between sessions in a
 * tiered local SQLite store (`core` identity/academic, `preference` slot-based
 * habits, and `episodic` chat-learned context). Stored only on this device
 * (never synced). Online chat/voice sends prioritized active memories, suggests
 * additions/removals after exchanges, supports per-turn Undo, and exposes
 * editing/pinning/categorization in Profile.
 */

export type MemoryTier = 'core' | 'preference' | 'episodic';

export type MemoryCategory =
  | 'identity'
  | 'academic'
  | 'study'
  | 'goal'
  | 'routine'
  | 'general';

export interface ChatMemory {
  id: string;
  text: string;
  /** `chat`: learned from a conversation. `manual`: typed or setup in Profile/Onboarding. */
  source: 'chat' | 'manual';
  sessionId: string | null;
  createdAt: string;
  tier: MemoryTier;
  category: MemoryCategory;
  isPinned: boolean;
  slotKey: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface AddMemoryOptions {
  tier?: MemoryTier;
  category?: MemoryCategory;
  isPinned?: boolean;
  slotKey?: string | null;
  expiresAt?: string | null;
}

export interface AddMemoryChangeInput extends AddMemoryOptions {
  text: string;
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
  tier?: MemoryTier;
  category?: MemoryCategory;
  isPinned?: boolean;
  slotKey?: string | null;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
}

export interface ChatMemoryChanges {
  added: {id: string; text: string}[];
  removed: RemovedChatMemory[];
  /** Owner-local state after this change; stale Undo must not restore forgotten data. */
  revision?: string;
  /** The student tapped Undo. */
  undone?: boolean;
}

export interface MemoryGrowthStats {
  total: number;
  pinned: number;
  byTier: Record<MemoryTier, number>;
  byCategory: Record<MemoryCategory, number>;
}

export const MEMORY_ENABLED_KEY = 'memory.enabled';
const MEMORY_REVISION_KEY = 'memory.revision';
/** Oldest unpinned non-core memories are dropped past this many. */
export const MAX_STORED_MEMORIES = 100;
/** How many prioritized active memories go with an AI exchange. */
export const MAX_PROMPT_MEMORIES = 40;
export const MAX_MEMORY_TEXT = 200;

const VALID_TIERS: ReadonlySet<string> = new Set([
  'core',
  'preference',
  'episodic',
]);
const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  'identity',
  'academic',
  'study',
  'goal',
  'routine',
  'general',
]);

const normalizeTier = (raw: unknown): MemoryTier =>
  typeof raw === 'string' && VALID_TIERS.has(raw)
    ? (raw as MemoryTier)
    : 'episodic';

const normalizeCategory = (raw: unknown): MemoryCategory =>
  typeof raw === 'string' && VALID_CATEGORIES.has(raw)
    ? (raw as MemoryCategory)
    : 'general';

const requireOwner = (userId: string): void => {
  if (!isValidChatOwner(userId))
    throw new Error('A valid memory owner is required.');
};

const cleanText = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().slice(0, MAX_MEMORY_TEXT).trim();

/** Case-insensitive duplicate comparison ignoring trailing sentence punctuation. */
export const normalizeMemoryTextKey = (text: string): string =>
  cleanText(text)
    .replace(/[.!?…]+$/, '')
    .trim()
    .toLowerCase();

export const inferMemoryCategory = (text: string): MemoryCategory => {
  const lower = text.toLowerCase();
  if (
    /^(?:prefers to be called\b|student'?s preferred name\b|prefers a (?:casual|professional) conversational tone\b|wants replies\b|my name is\b)/.test(
      lower,
    ) ||
    /\b(?:tone|concise|brief|detailed replies|preferred name)\b/.test(lower)
  ) {
    return 'identity';
  }
  if (
    /^(?:ustp student|academic profile|cor subject|enrolled\b|student no)/.test(
      lower,
    ) ||
    /\b(?:semester|curriculum|enrolled|enrolled in|program|major|year level|credit units?|cor\b|bsit|bsce|bsee|bsme|bscs)\b/.test(
      lower,
    )
  ) {
    return 'academic';
  }
  if (
    /\b(?:goal|aiming|main focus|focus is|target|dean'?s list)\b/.test(lower)
  ) {
    return 'goal';
  }
  if (
    /\b(?:study|studying|review|exam|quiz|pomodoro|flashcard|quiet library|notes?)\b/.test(
      lower,
    )
  ) {
    return 'study';
  }
  if (
    /\b(?:wake|sleep|morning|evening|night|routine|busiest day|commute|coffee)\b/.test(
      lower,
    )
  ) {
    return 'routine';
  }
  return 'general';
};

export const inferMemoryTier = (
  text: string,
  options?: AddMemoryOptions,
): MemoryTier => {
  if (options?.tier) return options.tier;
  if (options?.isPinned) return 'core';
  const lower = text.toLowerCase();
  if (
    /^(?:prefers studying\b|prefers to be called\b|prefers a \w+ conversational tone\b|wants replies\b|student'?s main focus\b|prefers )/.test(
      lower,
    )
  ) {
    return 'preference';
  }
  return 'episodic';
};

const isNotExpired = (
  expiresAt: string | null | undefined,
  nowIso: string,
): boolean => !expiresAt || expiresAt > nowIso;

const mapMemory = (row: Record<string, unknown>): ChatMemory => ({
  id: String(row.id),
  text: String(row.text ?? ''),
  source: row.source === 'manual' ? 'manual' : 'chat',
  sessionId: typeof row.session_id === 'string' ? row.session_id : null,
  createdAt: String(row.created_at),
  tier: normalizeTier(row.tier),
  category: normalizeCategory(row.category),
  isPinned: Number(row.is_pinned ?? 0) === 1,
  slotKey:
    typeof row.slot_key === 'string' && row.slot_key ? row.slot_key : null,
  lastUsedAt:
    typeof row.last_used_at === 'string' && row.last_used_at
      ? row.last_used_at
      : null,
  expiresAt:
    typeof row.expires_at === 'string' && row.expires_at
      ? row.expires_at
      : null,
});

type Executor = Pick<DatabaseTransaction, 'executeSync'>;

const evictOverflow = (tx: Executor, userId: string): void => {
  // Evict oldest unpinned, non-core memories first so identity/COR/pinned facts survive chatter.
  tx.executeSync(
    `DELETE FROM chat_memories
     WHERE user_id = ?
       AND id NOT IN (
         SELECT id FROM chat_memories
         WHERE user_id = ?
         ORDER BY
           CASE
             WHEN is_pinned = 1 THEN 3
             WHEN tier = 'core' THEN 2
             WHEN tier = 'preference' THEN 1
             ELSE 0
           END DESC,
           created_at DESC,
           rowid DESC
         LIMIT ?
       )`,
    [userId, userId, MAX_STORED_MEMORIES],
  );
};

const insert = (
  tx: Executor,
  userId: string,
  memory: {
    id?: string;
    text: string;
    source: ChatMemory['source'];
    sessionId?: string | null;
    tier?: MemoryTier;
    category?: MemoryCategory;
    isPinned?: boolean;
    slotKey?: string | null;
    expiresAt?: string | null;
  },
): ChatMemory | null => {
  const text = cleanText(memory.text);
  if (text.length < 2) return null;
  const now = new Date().toISOString();
  // Clean up expired memories on write so slots and cap stay accurate.
  tx.executeSync(
    'DELETE FROM chat_memories WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at <= ?',
    [userId, now],
  );

  const isPinned = Boolean(memory.isPinned);
  const tier = inferMemoryTier(text, memory);
  const category = memory.category ?? inferMemoryCategory(text);
  const slotKey =
    typeof memory.slotKey === 'string' && memory.slotKey.trim()
      ? memory.slotKey.trim().slice(0, 80)
      : null;
  const expiresAt =
    typeof memory.expiresAt === 'string' && memory.expiresAt.trim()
      ? memory.expiresAt.trim()
      : null;
  const normalizedTarget = normalizeMemoryTextKey(text);

  if (slotKey) {
    const existingSlot = tx.executeSync(
      'SELECT * FROM chat_memories WHERE user_id = ? AND slot_key = ?',
      [userId, slotKey],
    ).rows[0];
    if (existingSlot) {
      const mapped = mapMemory(existingSlot);
      if (
        normalizeMemoryTextKey(mapped.text) === normalizedTarget &&
        mapped.tier === tier &&
        mapped.category === category &&
        mapped.isPinned === isPinned &&
        mapped.expiresAt === expiresAt
      ) {
        return null;
      }
      tx.executeSync(
        'DELETE FROM chat_memories WHERE user_id = ? AND slot_key = ?',
        [userId, slotKey],
      );
    }
  }

  const existingRows = tx.executeSync(
    'SELECT id, text FROM chat_memories WHERE user_id = ?',
    [userId],
  ).rows;
  const duplicate = existingRows.find(
    row => normalizeMemoryTextKey(String(row.text ?? '')) === normalizedTarget,
  );
  if (duplicate) {
    if (!slotKey) return null;
    // Claim the un-slotted duplicate so slot replacement never creates a twin row.
    tx.executeSync('DELETE FROM chat_memories WHERE user_id = ? AND id = ?', [
      userId,
      String(duplicate.id),
    ]);
  }

  const id = memory.id ?? generateId('mem');
  tx.executeSync(
    `INSERT INTO chat_memories (
       id, user_id, text, source, session_id, created_at, updated_at,
       tier, category, is_pinned, slot_key, last_used_at, expires_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      text,
      memory.source,
      memory.sessionId ?? null,
      now,
      now,
      tier,
      category,
      isPinned ? 1 : 0,
      slotKey,
      null,
      expiresAt,
    ],
  );
  evictOverflow(tx, userId);
  return {
    id,
    text,
    source: memory.source,
    sessionId: memory.sessionId ?? null,
    createdAt: now,
    tier,
    category,
    isPinned,
    slotKey,
    lastUsedAt: null,
    expiresAt,
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
    .rows.map(row => {
      const base = mapMemory(row);
      return {
        ...base,
        updatedAt: String(row.updated_at),
        rowId: Number(row.memory_rowid),
      };
    });

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

  /** Newest first, excluding expired episodic entries. Read failures throw. */
  list: (userId: string, executor: Executor = db): ChatMemory[] => {
    requireOwner(userId);
    const nowIso = new Date().toISOString();
    return executor
      .executeSync(
        `SELECT * FROM chat_memories
         WHERE user_id = ?
           AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY created_at DESC, rowid DESC`,
        [userId, nowIso],
      )
      .rows.map(mapMemory);
  },

  /**
   * What goes with an online AI exchange: none when memory is off.
   * Prioritizes pinned & core facts, then active preferences, then newest episodic items.
   */
  forPrompt: (userId: string): {id: string; text: string}[] => {
    if (!chatMemoryStore.isEnabled(userId)) return [];
    try {
      const nowIso = new Date().toISOString();
      const active = chatMemoryStore
        .list(userId)
        .filter(m => isNotExpired(m.expiresAt, nowIso));
      const pinned: ChatMemory[] = [];
      const core: ChatMemory[] = [];
      const preference: ChatMemory[] = [];
      const episodic: ChatMemory[] = [];
      for (const m of active) {
        if (m.isPinned === true) pinned.push(m);
        else if (m.tier === 'core') core.push(m);
        else if (m.tier === 'preference') preference.push(m);
        else episodic.push(m);
      }
      return [...pinned, ...core, ...preference, ...episodic]
        .slice(0, MAX_PROMPT_MEMORIES)
        .map(({id, text}) => ({id, text}));
    } catch {
      return [];
    }
  },

  add: (
    userId: string,
    text: string,
    options?: AddMemoryOptions,
  ): ChatMemory | null => {
    requireOwner(userId);
    return db.transactionSync(tx => {
      const saved = insert(tx, userId, {
        text,
        source: 'manual',
        ...options,
      });
      if (saved) bumpRevision(userId, tx);
      return saved;
    });
  },

  update: (
    userId: string,
    memoryId: string,
    patch: {
      text?: string;
      isPinned?: boolean;
      category?: MemoryCategory;
      tier?: MemoryTier;
      expiresAt?: string | null;
    },
  ): ChatMemory | null => {
    requireOwner(userId);
    return db.transactionSync(tx => {
      const currentRow = tx.executeSync(
        'SELECT * FROM chat_memories WHERE user_id = ? AND id = ?',
        [userId, memoryId],
      ).rows[0];
      if (!currentRow) return null;
      const current = mapMemory(currentRow);
      const nextText =
        patch.text !== undefined ? cleanText(patch.text) : current.text;
      if (nextText.length < 2) return null;
      if (patch.text !== undefined) {
        const key = normalizeMemoryTextKey(nextText);
        const others = tx.executeSync(
          'SELECT id, text FROM chat_memories WHERE user_id = ? AND id != ?',
          [userId, memoryId],
        ).rows;
        if (
          others.some(r => normalizeMemoryTextKey(String(r.text ?? '')) === key)
        ) {
          throw new Error('A matching memory is already saved.');
        }
      }
      const nextPinned = patch.isPinned ?? current.isPinned;
      const nextTier = patch.tier ?? current.tier;
      const nextCategory = patch.category ?? current.category;
      const nextExpiresAt =
        patch.expiresAt !== undefined ? patch.expiresAt : current.expiresAt;
      const now = new Date().toISOString();
      tx.executeSync(
        `UPDATE chat_memories
         SET text = ?, tier = ?, category = ?, is_pinned = ?, expires_at = ?, updated_at = ?
         WHERE user_id = ? AND id = ?`,
        [
          nextText,
          nextTier,
          nextCategory,
          nextPinned ? 1 : 0,
          nextExpiresAt,
          now,
          userId,
          memoryId,
        ],
      );
      bumpRevision(userId, tx);
      return {
        ...current,
        text: nextText,
        tier: nextTier,
        category: nextCategory,
        isPinned: nextPinned,
        expiresAt: nextExpiresAt,
      };
    });
  },

  markUsed: (userId: string, memoryIds: readonly string[]): void => {
    if (!memoryIds.length || !isValidChatOwner(userId)) return;
    try {
      const now = new Date().toISOString();
      db.transactionSync(tx => {
        for (const id of memoryIds.slice(0, MAX_PROMPT_MEMORIES)) {
          tx.executeSync(
            'UPDATE chat_memories SET last_used_at = ? WHERE user_id = ? AND id = ?',
            [now, userId, id],
          );
        }
      });
    } catch {
      // Usage timestamp is purely informational.
    }
  },

  stats: (userId: string, executor: Executor = db): MemoryGrowthStats => {
    const items = chatMemoryStore.list(userId, executor);
    const byTier: Record<MemoryTier, number> = {
      core: 0,
      preference: 0,
      episodic: 0,
    };
    const byCategory: Record<MemoryCategory, number> = {
      identity: 0,
      academic: 0,
      study: 0,
      goal: 0,
      routine: 0,
      general: 0,
    };
    let pinned = 0;
    for (const item of items) {
      if (item.isPinned) pinned += 1;
      byTier[item.tier] += 1;
      byCategory[item.category] += 1;
    }
    return {
      total: items.length,
      pinned,
      byTier,
      byCategory,
    };
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
    change: {
      add: Array<string | AddMemoryChangeInput>;
      remove: string[];
      clearAll?: boolean;
    },
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
      for (const entry of change.add) {
        if (typeof entry === 'string') {
          insert(tx, userId, {text: entry, source: 'chat', sessionId});
        } else {
          insert(tx, userId, {
            ...entry,
            source: 'chat',
            sessionId,
          });
        }
      }
      const after = snapshots(userId, tx);
      const beforeIds = new Set(before.map(m => m.id));
      const afterIds = new Set(after.map(m => m.id));
      // Comparing the actual rows also records storage-limit evictions and slot replacements.
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
          `INSERT INTO chat_memories (
             rowid, id, user_id, text, source, session_id, created_at, updated_at,
             tier, category, is_pinned, slot_key, last_used_at, expires_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rowId,
            memory.id,
            userId,
            memory.text,
            memory.source ?? 'chat',
            memory.sessionId ?? null,
            memory.createdAt ?? now,
            memory.updatedAt ?? now,
            normalizeTier(memory.tier),
            normalizeCategory(memory.category),
            memory.isPinned ? 1 : 0,
            memory.slotKey ?? null,
            memory.lastUsedAt ?? null,
            memory.expiresAt ?? null,
          ],
        );
      }
      bumpRevision(userId, tx);
    };
    if (executor) undo(executor);
    else db.transactionSync(undo);
  },

  /**
   * Guest linking: move unique memories and inherit an explicit opt-out when the
   * cloud account does not have a setting yet, deduplicating by text and slot_key.
   */
  transferFromGuest: (
    tx: Executor,
    fromUserId: string,
    toUserId: string,
  ): void => {
    if (fromUserId === toUserId) return;
    const guestEnabledRow = tx.executeSync(
      'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
      [fromUserId, MEMORY_ENABLED_KEY],
    ).rows[0];
    const destEnabledRow = tx.executeSync(
      'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
      [toUserId, MEMORY_ENABLED_KEY],
    ).rows[0];
    if (guestEnabledRow && !destEnabledRow) {
      tx.executeSync(
        'UPDATE OR IGNORE local_settings SET user_id = ? WHERE user_id = ? AND key = ?',
        [toUserId, fromUserId, MEMORY_ENABLED_KEY],
      );
    }
    tx.executeSync('DELETE FROM local_settings WHERE user_id = ? AND key = ?', [
      fromUserId,
      MEMORY_ENABLED_KEY,
    ]);

    const destRows = tx.executeSync(
      'SELECT text, slot_key FROM chat_memories WHERE user_id = ?',
      [toUserId],
    ).rows;
    const destTexts = new Set(
      destRows.map(r => normalizeMemoryTextKey(String(r.text ?? ''))),
    );
    const destSlots = new Set(
      destRows
        .map(r => (typeof r.slot_key === 'string' ? r.slot_key : null))
        .filter((s): s is string => Boolean(s)),
    );
    const guestRows = tx.executeSync(
      'SELECT id, text, slot_key FROM chat_memories WHERE user_id = ? ORDER BY created_at DESC, rowid DESC',
      [fromUserId],
    ).rows;
    for (const row of guestRows) {
      const id = String(row.id);
      const key = normalizeMemoryTextKey(String(row.text ?? ''));
      const slot = typeof row.slot_key === 'string' ? row.slot_key : null;
      if (destTexts.has(key) || (slot && destSlots.has(slot))) {
        tx.executeSync(
          'DELETE FROM chat_memories WHERE id = ? AND user_id = ?',
          [id, fromUserId],
        );
      } else {
        destTexts.add(key);
        if (slot) destSlots.add(slot);
        tx.executeSync(
          'UPDATE chat_memories SET user_id = ? WHERE id = ? AND user_id = ?',
          [toUserId, id, fromUserId],
        );
      }
    }
    evictOverflow(tx, toUserId);
    bumpRevision(fromUserId, tx);
    bumpRevision(toUserId, tx);
  },
};
