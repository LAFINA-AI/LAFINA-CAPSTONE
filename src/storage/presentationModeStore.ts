import {db} from './database';
import type {DatabaseTransaction} from './database';

export const PRESENTATION_MODE_KEY = 'presentation.mode.v1';
export const PRESENTATION_SNAPSHOT_KEY = 'presentation.snapshot.v1';

export interface PresentationModeState {
  version: 1;
  active: boolean;
  ownerId: string;
  activatedAt: string;
  lastRefreshedAt: string;
  syncWasSuppressed: boolean;
}

type Executor = Pick<DatabaseTransaction, 'executeSync'>;
type Listener = (userId: string) => void;

const listeners = new Set<Listener>();

const parseState = (
  raw: unknown,
  expectedOwnerId?: string,
): PresentationModeState | null => {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PresentationModeState>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.version !== 1 ||
      typeof parsed.active !== 'boolean' ||
      typeof parsed.ownerId !== 'string' ||
      !parsed.ownerId.trim()
    ) {
      return null;
    }
    if (expectedOwnerId && parsed.ownerId !== expectedOwnerId) {
      return null;
    }
    return {
      version: 1,
      active: parsed.active,
      ownerId: parsed.ownerId,
      activatedAt:
        typeof parsed.activatedAt === 'string' ? parsed.activatedAt : '',
      lastRefreshedAt:
        typeof parsed.lastRefreshedAt === 'string'
          ? parsed.lastRefreshedAt
          : typeof parsed.activatedAt === 'string'
          ? parsed.activatedAt
          : '',
      syncWasSuppressed: Boolean(parsed.syncWasSuppressed),
    };
  } catch {
    return null;
  }
};

const notifyListeners = (userId: string): void => {
  for (const listener of Array.from(listeners)) {
    try {
      listener(userId);
    } catch (error) {
      console.warn('[presentationModeStore] listener failed:', error);
    }
  }
};

export const presentationModeStore = {
  getState: (
    userId: string | null | undefined,
    executor: Executor = db,
  ): PresentationModeState | null => {
    if (!userId || db.isFallback()) return null;
    try {
      const row = executor.executeSync(
        'SELECT value FROM local_settings WHERE user_id = ? AND key = ? LIMIT 1',
        [userId, PRESENTATION_MODE_KEY],
      ).rows?.[0];
      return parseState(row?.value, userId);
    } catch {
      return null;
    }
  },

  isActive: (
    userId: string | null | undefined,
    executor: Executor = db,
  ): boolean => {
    const state = presentationModeStore.getState(userId, executor);
    return Boolean(state?.active);
  },

  findActiveOwner: (executor: Executor = db): string | null => {
    if (db.isFallback()) return null;
    try {
      const rows =
        executor.executeSync(
          'SELECT user_id, value FROM local_settings WHERE key = ?',
          [PRESENTATION_MODE_KEY],
        ).rows ?? [];
      for (const row of rows) {
        const ownerId =
          typeof row.user_id === 'string' ? row.user_id.trim() : '';
        if (!ownerId) continue;
        const parsed = parseState(row.value, ownerId);
        if (parsed?.active) return ownerId;
      }
      return null;
    } catch {
      return null;
    }
  },

  setState: (
    state: PresentationModeState,
    executor?: DatabaseTransaction,
  ): void => {
    const now = new Date().toISOString();
    const apply = (tx: DatabaseTransaction) => {
      tx.executeSync(
        `INSERT INTO local_settings (user_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [state.ownerId, PRESENTATION_MODE_KEY, JSON.stringify(state), now],
      );
      if (tx.afterCommit) {
        tx.afterCommit(() => notifyListeners(state.ownerId));
      }
    };
    if (executor) {
      apply(executor);
    } else {
      db.transactionSync(apply);
      notifyListeners(state.ownerId);
    }
  },

  clearState: (userId: string, executor?: DatabaseTransaction): void => {
    const apply = (tx: DatabaseTransaction) => {
      tx.executeSync(
        'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
        [userId, PRESENTATION_MODE_KEY],
      );
      if (tx.afterCommit) {
        tx.afterCommit(() => notifyListeners(userId));
      }
    };
    if (executor) {
      apply(executor);
    } else {
      db.transactionSync(apply);
      notifyListeners(userId);
    }
  },

  saveSnapshotJson: (
    userId: string,
    snapshotJson: string,
    executor: Executor = db,
  ): void => {
    const now = new Date().toISOString();
    executor.executeSync(
      `INSERT INTO local_settings (user_id, key, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [userId, PRESENTATION_SNAPSHOT_KEY, snapshotJson, now],
    );
  },

  readSnapshotJson: (
    userId: string,
    executor: Executor = db,
  ): string | null => {
    if (!userId || db.isFallback()) return null;
    try {
      const row = executor.executeSync(
        'SELECT value FROM local_settings WHERE user_id = ? AND key = ? LIMIT 1',
        [userId, PRESENTATION_SNAPSHOT_KEY],
      ).rows?.[0];
      return typeof row?.value === 'string' && row.value.length > 0
        ? row.value
        : null;
    } catch {
      return null;
    }
  },

  hasSnapshot: (userId: string, executor: Executor = db): boolean =>
    presentationModeStore.readSnapshotJson(userId, executor) !== null,

  clearSnapshotJson: (userId: string, executor: Executor = db): void => {
    executor.executeSync(
      'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
      [userId, PRESENTATION_SNAPSHOT_KEY],
    );
  },

  notify: (userId: string): void => {
    notifyListeners(userId);
  },

  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
