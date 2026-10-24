export interface SyncSchedulerOptions {
  runPass: () => Promise<boolean>;
  onRemoteChanges: () => void;
  debounceMs?: number;
  intervalMs?: number;
}

export interface SyncScheduler {
  schedule: () => void;
  runNow: () => Promise<void>;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

export const DEFAULT_SYNC_DEBOUNCE_MS = 3000;
export const DEFAULT_SYNC_INTERVAL_MS = 2 * 60 * 1000;

export const createSyncScheduler = (options: SyncSchedulerOptions): SyncScheduler => {
  const debounceMs = options.debounceMs ?? DEFAULT_SYNC_DEBOUNCE_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;

  const clearDebounce = (): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const stopInterval = (): void => {
    if (intervalTimer !== null) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }
  };

  const runNow = async (): Promise<void> => {
    clearDebounce();
    try {
      if (await options.runPass()) options.onRemoteChanges();
    } catch {
      // The sync worker records its own failures in the sync state.
    }
  };

  return {
    schedule: () => {
      clearDebounce();
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void runNow();
      }, debounceMs);
    },
    runNow,
    start: () => {
      if (intervalTimer !== null) return;
      intervalTimer = setInterval(() => {
        void runNow();
      }, intervalMs);
    },
    stop: stopInterval,
    dispose: () => {
      clearDebounce();
      stopInterval();
    },
  };
};
