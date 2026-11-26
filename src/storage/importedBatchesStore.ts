import RNFS from 'react-native-fs';
import {generateId} from '../utils';

export interface ImportBatch {
  id: string;
  userId: string;
  timestamp: string;
  fileName: string;
  events: string[];
  blocks: string[];
  tasks: string[];
}

interface StoredImportBatch {
  id: string;
  userId?: string;
  timestamp: string;
  fileName: string;
  events: string[];
  blocks: string[];
  tasks: string[];
}

const BATCHES_FILE_PATH = `${RNFS.DocumentDirectoryPath}/imported_batches.json`;

let cachedBatches: StoredImportBatch[] | null = null;

const cloneBatch = (batch: StoredImportBatch): StoredImportBatch => ({
  ...batch,
  events: [...batch.events],
  blocks: [...batch.blocks],
  tasks: [...batch.tasks],
});

const isStringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')
);

const parseStoredBatch = (value: unknown): StoredImportBatch | null => {
  if (value === null || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string'
    || typeof row.timestamp !== 'string'
    || typeof row.fileName !== 'string'
    || !isStringArray(row.events)
    || !isStringArray(row.blocks)
    || !isStringArray(row.tasks)
    || (row.userId !== undefined && typeof row.userId !== 'string')
  ) {
    return null;
  }
  return {
    id: row.id,
    userId: row.userId,
    timestamp: row.timestamp,
    fileName: row.fileName,
    events: [...row.events],
    blocks: [...row.blocks],
    tasks: [...row.tasks],
  };
};

const readStoredBatches = async (): Promise<StoredImportBatch[]> => {
  const exists = await RNFS.exists(BATCHES_FILE_PATH);
  if (!exists) {
    cachedBatches = [];
    return [];
  }
  const content = await RNFS.readFile(BATCHES_FILE_PATH, 'utf8');
  if (!content || !content.trim()) {
    cachedBatches = [];
    return [];
  }
  const parsed = JSON.parse(content) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Imported calendar batch file must contain an array.');
  }
  const next = parsed.map(parseStoredBatch).filter((batch): batch is StoredImportBatch => batch !== null);
  cachedBatches = next.map(cloneBatch);
  return next;
};

/** Account-scoped store for imported calendar batch metadata. */
export const importedBatchesStore = {
  /** Drops the in-memory batch cache (used after deleting the backing file on reset). */
  resetCache: (): void => {
    cachedBatches = null;
  },

  /** Returns cached batches for one user synchronously when already loaded, or null before first read. */
  getCachedImportedBatches: (userId: string): ImportBatch[] | null => {
    if (cachedBatches === null) return null;
    return cachedBatches
      .filter((batch): batch is ImportBatch => batch.userId === userId)
      .map(cloneBatch) as ImportBatch[];
  },

  /**
   * Retrieves batches owned by one local user, newest first.
   * Legacy batches without an owner remain quarantined and are never exposed to an account.
   */
  getImportedBatches: async (userId: string): Promise<ImportBatch[]> => {
    try {
      const batches = await readStoredBatches();
      return batches.filter((batch): batch is ImportBatch => batch.userId === userId);
    } catch (error) {
      console.error('Failed to load imported batches:', error);
      return [];
    }
  },

  /** Saves a new imported batch under exactly one local user. */
  saveImportedBatch: async (
    userId: string,
    fileName: string,
    eventIds: string[],
    blockIds: string[],
    taskIds: string[],
  ): Promise<void> => {
    try {
      const batches = await readStoredBatches();
      const newBatch: ImportBatch = {
        id: generateId('batch'),
        userId,
        timestamp: new Date().toISOString(),
        fileName,
        events: [...eventIds],
        blocks: [...blockIds],
        tasks: [...taskIds],
      };
      batches.unshift(newBatch);
      await RNFS.writeFile(BATCHES_FILE_PATH, JSON.stringify(batches, null, 2), 'utf8');
      cachedBatches = batches.map(cloneBatch);
    } catch (error) {
      console.error('Failed to save imported batch:', error);
      throw error;
    }
  },

  /** Removes batch metadata only when both its ID and owner match. */
  deleteImportedBatch: async (userId: string, batchId: string): Promise<ImportBatch | null> => {
    try {
      const batches = await readStoredBatches();
      const index = batches.findIndex((batch) => batch.id === batchId && batch.userId === userId);
      if (index === -1) return null;

      const [removed] = batches.splice(index, 1);
      await RNFS.writeFile(BATCHES_FILE_PATH, JSON.stringify(batches, null, 2), 'utf8');
      cachedBatches = batches.map(cloneBatch);
      return removed as ImportBatch;
    } catch (error) {
      console.error('Failed to delete imported batch:', error);
      throw error;
    }
  },

  /** Removes all imported calendar batch records owned by one user (Clear All Data). */
  clearForUser: async (userId: string): Promise<void> => {
    try {
      const batches = await readStoredBatches();
      const remaining = batches.filter(batch => batch.userId !== userId);
      if (remaining.length === batches.length) return;
      await RNFS.writeFile(
        BATCHES_FILE_PATH,
        JSON.stringify(remaining, null, 2),
        'utf8',
      );
      cachedBatches = remaining.map(cloneBatch);
    } catch (error) {
      console.warn('Failed to clear imported batches for user:', error);
    }
  },

  /** Moves guest imported calendar batches to the upgraded account. */
  transferFromGuest: async (
    fromUserId: string,
    toUserId: string,
  ): Promise<void> => {
    if (fromUserId === toUserId) return;
    try {
      const batches = await readStoredBatches();
      let changed = false;
      const next = batches.map(batch => {
        if (batch.userId !== fromUserId) return batch;
        changed = true;
        return {...batch, userId: toUserId};
      });
      if (!changed) return;
      await RNFS.writeFile(
        BATCHES_FILE_PATH,
        JSON.stringify(next, null, 2),
        'utf8',
      );
      cachedBatches = next.map(cloneBatch);
    } catch (error) {
      console.warn('Failed to transfer imported batches from guest:', error);
    }
  },
};
