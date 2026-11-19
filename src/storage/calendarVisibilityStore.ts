import RNFS from 'react-native-fs';

export type CalendarVisibilityMap = Record<string, boolean>;

interface StoredUserVisibility {
  userId: string;
  visibility: CalendarVisibilityMap;
}

interface StoredVisibilityFile {
  version: 2;
  users: StoredUserVisibility[];
  legacyUnscoped?: CalendarVisibilityMap;
}

const VISIBILITY_FILE_PATH = `${RNFS.DocumentDirectoryPath}/calendar_visibility.json`;
const DEFAULT_VISIBILITY: CalendarVisibilityMap = { main: true };

let cachedFile: StoredVisibilityFile | null = null;

const cloneStoredFile = (file: StoredVisibilityFile): StoredVisibilityFile => ({
  version: 2,
  users: file.users.map((entry) => ({
    userId: entry.userId,
    visibility: { ...entry.visibility },
  })),
  ...(file.legacyUnscoped ? { legacyUnscoped: { ...file.legacyUnscoped } } : {}),
});

const parseVisibilityMap = (value: unknown): CalendarVisibilityMap | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.every(([, isVisible]) => typeof isVisible === 'boolean')) return null;
  return Object.fromEntries(entries) as CalendarVisibilityMap;
};

const parseStoredFile = (value: unknown): StoredVisibilityFile => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    if (row.version === 2 && Array.isArray(row.users)) {
      const users = row.users.flatMap((candidate): StoredUserVisibility[] => {
        if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
        const userRow = candidate as Record<string, unknown>;
        const visibility = parseVisibilityMap(userRow.visibility);
        return typeof userRow.userId === 'string' && visibility
          ? [{ userId: userRow.userId, visibility }]
          : [];
      });
      const legacyUnscoped = parseVisibilityMap(row.legacyUnscoped);
      return {
        version: 2,
        users,
        ...(legacyUnscoped ? { legacyUnscoped } : {}),
      };
    }
  }

  const legacyUnscoped = parseVisibilityMap(value);
  if (!legacyUnscoped) {
    throw new Error('Calendar visibility file has an invalid format.');
  }
  return { version: 2, users: [], legacyUnscoped };
};

const readStoredFile = async (): Promise<StoredVisibilityFile> => {
  const exists = await RNFS.exists(VISIBILITY_FILE_PATH);
  if (!exists) {
    const empty: StoredVisibilityFile = { version: 2, users: [] };
    cachedFile = cloneStoredFile(empty);
    return empty;
  }
  const content = await RNFS.readFile(VISIBILITY_FILE_PATH, 'utf8');
  if (!content || !content.trim()) {
    const empty: StoredVisibilityFile = { version: 2, users: [] };
    cachedFile = cloneStoredFile(empty);
    return empty;
  }
  const parsed = parseStoredFile(JSON.parse(content) as unknown);
  cachedFile = cloneStoredFile(parsed);
  return parsed;
};

/** Account-scoped persistence for calendar layer visibility. */
export const calendarVisibilityStore = {
  /** Drops the in-memory file cache (used after deleting the backing file on reset). */
  resetCache: (): void => {
    cachedFile = null;
  },

  /** Returns cached visibility map for one user synchronously when already loaded, or null before first read. */
  getCachedVisibilityMap: (userId: string): CalendarVisibilityMap | null => {
    if (cachedFile === null) return null;
    const visibility = cachedFile.users.find((entry) => entry.userId === userId)?.visibility;
    return visibility
      ? { main: true, ...visibility }
      : { ...DEFAULT_VISIBILITY };
  },

  /**
   * Retrieves one user's visibility map.
   * Legacy unscoped settings stay quarantined and are never assigned to an account.
   */
  getVisibilityMap: async (userId: string): Promise<CalendarVisibilityMap> => {
    try {
      const stored = await readStoredFile();
      const visibility = stored.users.find((entry) => entry.userId === userId)?.visibility;
      return visibility
        ? { main: true, ...visibility }
        : { ...DEFAULT_VISIBILITY };
    } catch (error) {
      console.error('Failed to load calendar visibility map:', error);
      return { ...DEFAULT_VISIBILITY };
    }
  },

  /** Sets one calendar layer for exactly one user while preserving all other accounts. */
  setVisibility: async (
    userId: string,
    calendarId: string,
    isVisible: boolean,
  ): Promise<void> => {
    try {
      const stored = await readStoredFile();
      const index = stored.users.findIndex((entry) => entry.userId === userId);
      const current = index === -1
        ? { ...DEFAULT_VISIBILITY }
        : { main: true, ...stored.users[index].visibility };
      const updated: StoredUserVisibility = {
        userId,
        visibility: { ...current, [calendarId]: isVisible },
      };
      if (index === -1) stored.users.push(updated);
      else stored.users[index] = updated;

      await RNFS.writeFile(VISIBILITY_FILE_PATH, JSON.stringify(stored, null, 2), 'utf8');
      cachedFile = cloneStoredFile(stored);
    } catch (error) {
      console.error('Failed to save calendar visibility:', error);
      throw error;
    }
  },
};
