import { DatabaseTransaction } from '../storage/database';
import { syncStateStore } from '../storage/syncStateStore';
import { PersistedSyncStatus } from '../storage/syncTypes';

export type SyncStatusState = PersistedSyncStatus;

export interface SyncStateData {
  status: SyncStatusState;
  cursor: number;
  lastSyncedAt: string | null;
  errorMessage: string | null;
}

type SyncStateListener = (state: SyncStateData) => void;

const localOnlyState = (
  status: SyncStatusState = 'Local only',
  errorMessage: string | null = null,
): SyncStateData => ({
  status,
  cursor: 0,
  lastSyncedAt: null,
  errorMessage,
});

let activeLocalUserId: string | null = null;
let currentState: SyncStateData = localOnlyState();
const listeners: Set<SyncStateListener> = new Set();

const publish = (state: SyncStateData): SyncStateData => {
  currentState = { ...state };
  const snapshot = { ...currentState };
  listeners.forEach((listener) => listener(snapshot));
  return snapshot;
};

const loadPersisted = (localUserId: string): SyncStateData => {
  const persisted = syncStateStore.load(localUserId);
  return {
    status: persisted.status,
    cursor: persisted.cursor,
    lastSyncedAt: persisted.lastSyncedAt,
    errorMessage: persisted.errorMessage,
  };
};

export const syncState = {
  activate: (localUserId: string): SyncStateData => {
    activeLocalUserId = localUserId;
    return publish(loadPersisted(localUserId));
  },

  reload: (localUserId: string): SyncStateData => {
    activeLocalUserId = localUserId;
    return publish(loadPersisted(localUserId));
  },

  deactivate: (
    status: SyncStatusState = 'Local only',
    errorMessage: string | null = null,
  ): void => {
    activeLocalUserId = null;
    publish(localOnlyState(status, errorMessage));
  },

  getState: (): SyncStateData => ({ ...currentState }),

  setStatus: (
    localUserId: string,
    status: SyncStatusState,
    errorMessage: string | null = null,
  ): void => {
    const previous =
      activeLocalUserId === localUserId
        ? currentState
        : loadPersisted(localUserId);
    const next: SyncStateData = {
      ...previous,
      status,
      errorMessage,
    };
    syncStateStore.save(localUserId, next);
    activeLocalUserId = localUserId;
    publish(next);
  },

  saveProgress: (
    localUserId: string,
    cursor: number,
    lastSyncedAt: string | null,
    status: SyncStatusState,
    errorMessage: string | null,
    executor?: DatabaseTransaction,
  ): void => {
    const next: SyncStateData = {
      cursor,
      lastSyncedAt,
      status,
      errorMessage,
    };
    syncStateStore.save(
      localUserId,
      next,
      'account',
      localUserId,
      executor,
    );
    if (!executor) {
      activeLocalUserId = localUserId;
      publish(next);
    }
  },

  subscribe: (listener: SyncStateListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
