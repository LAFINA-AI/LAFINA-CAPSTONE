import { compareVersions } from './updateManifest';
import type { UpdateState } from './updateService';

/**
 * When LAFINA checks GitHub by itself, when it offers an update, and when it
 * shows "What's new" after one. Pure rules; the app keeps the memory (see
 * src/ui/components/updates/updateMemory.ts) and the screens act on them.
 */

/** Checks on start and on return to the app, at most this often. */
export const AUTO_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
/** "Later" hides an offer of the same version for this long. */
export const SNOOZE_MS = 24 * 60 * 60 * 1000;

export interface WhatsNew {
  version: string;
  title: string | null;
  notes: string | null;
}

export interface UpdateMemory {
  lastAutoCheckAt: number | null;
  snoozedVersion: string | null;
  snoozedUntil: number | null;
  /** Notes kept from the update being applied, shown once it is running. */
  whatsNew: WhatsNew | null;
  /** The version the person last opened; null on a fresh install. */
  lastSeenVersion: string | null;
}

export const EMPTY_MEMORY: UpdateMemory = {
  lastAutoCheckAt: null,
  snoozedVersion: null,
  snoozedUntil: null,
  whatsNew: null,
  lastSeenVersion: null,
};

export interface NetworkKind {
  connected: boolean;
  /** Wi-Fi or Ethernet that the system does not mark as metered. */
  unmetered: boolean;
}

export const shouldAutoCheck = (memory: UpdateMemory, now: number): boolean =>
  memory.lastAutoCheckAt === null ||
  now - memory.lastAutoCheckAt >= AUTO_CHECK_INTERVAL_MS ||
  // A clock moved backwards must not stop checks for good.
  now < memory.lastAutoCheckAt;

export const isSnoozed = (memory: UpdateMemory, version: string | null, now: number): boolean =>
  version !== null &&
  memory.snoozedVersion === version &&
  memory.snoozedUntil !== null &&
  now < memory.snoozedUntil;

/**
 * Downloads by itself only on Wi-Fi: a JavaScript update is a few MB, a new
 * APK is ~140 MB, and many students pay for mobile data.
 */
export const shouldAutoDownload = (state: UpdateState, network: NetworkKind): boolean =>
  state.phase === 'available' && network.connected && network.unmetered;

/** Whether to bring the update sheet up without being asked. */
export const shouldPrompt = (state: UpdateState, memory: UpdateMemory, now: number): boolean => {
  if (isSnoozed(memory, state.version, now)) return false;
  return state.phase === 'available' || state.phase === 'ready' || state.phase === 'needs-install';
};

/** The notes to show once after an update, or null. */
export const whatsNewToShow = (memory: UpdateMemory, runningVersion: string): WhatsNew | null => {
  const saved = memory.whatsNew;
  if (!saved || saved.version !== runningVersion) return null;
  if (memory.lastSeenVersion && compareVersions(runningVersion, memory.lastSeenVersion) <= 0) {
    return null;
  }
  return saved;
};

/** Memory after this version has been opened (and its notes, if any, shown). */
export const markSeen = (memory: UpdateMemory, runningVersion: string): UpdateMemory => ({
  ...memory,
  lastSeenVersion: runningVersion,
  whatsNew:
    memory.whatsNew && compareVersions(memory.whatsNew.version, runningVersion) > 0
      ? memory.whatsNew
      : null,
  ...(memory.snoozedVersion &&
  compareVersions(memory.snoozedVersion, runningVersion) <= 0
    ? { snoozedVersion: null, snoozedUntil: null }
    : {}),
});

export const parseMemory = (raw: string | null): UpdateMemory => {
  if (!raw) return { ...EMPTY_MEMORY };
  try {
    const data = JSON.parse(raw) as Partial<UpdateMemory> | null;
    if (!data || typeof data !== 'object') return { ...EMPTY_MEMORY };
    const num = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;
    const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
    const whatsNew =
      data.whatsNew && typeof data.whatsNew === 'object' && str(data.whatsNew.version)
        ? {
            version: data.whatsNew.version,
            title: str(data.whatsNew.title),
            notes: str(data.whatsNew.notes),
          }
        : null;
    return {
      lastAutoCheckAt: num(data.lastAutoCheckAt),
      snoozedVersion: str(data.snoozedVersion),
      snoozedUntil: num(data.snoozedUntil),
      whatsNew,
      lastSeenVersion: str(data.lastSeenVersion),
    };
  } catch {
    return { ...EMPTY_MEMORY };
  }
};
