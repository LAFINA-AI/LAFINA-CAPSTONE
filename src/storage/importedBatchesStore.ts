import RNFS from 'react-native-fs';

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
        id: 'batch_' + Math.random().toString(36).substring(2, 9),
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
};
