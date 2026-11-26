export interface SyncSchedulerOptions {
  runPass: () => Promise<boolean>;
  onRemoteChanges: () => void;
  debounceMs?: number;
  intervalMs?: number;
  getBackoffAttempt?: () => number;
}

export interface SyncScheduler {
  schedule: () => void;
  runNow: () => Promise<void>;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

export const DEFAULT_SYNC_DEBOUNCE_MS = 800;
export const DEFAULT_SYNC_INTERVAL_MS = 30 * 1000;
const MAX_SYNC_BACKOFF_MS = 5 * 60 * 1000;

export const createSyncScheduler = (
  options: SyncSchedulerOptions,
): SyncScheduler => {
  const debounceMs = options.debounceMs ?? DEFAULT_SYNC_DEBOUNCE_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  let disposed = false;

  const clearDebounce = (): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const clearIntervalTimer = (): void => {
    if (intervalTimer !== null) {
      clearTimeout(intervalTimer);
      intervalTimer = null;
    }
  };

  const nextIntervalDelay = (): number => {
    const attempt = Math.max(0, options.getBackoffAttempt?.() ?? 0);
    if (attempt <= 0) return intervalMs;
    return Math.min(intervalMs * Math.pow(2, attempt), MAX_SYNC_BACKOFF_MS);
  };

  const scheduleNextInterval = (): void => {
    clearIntervalTimer();
    if (!started || disposed) return;
    intervalTimer = setTimeout(() => {
      intervalTimer = null;
      if (!started || disposed) return;
      void runNow();
    }, nextIntervalDelay());
  };

  const stopInterval = (): void => {
    started = false;
    clearDebounce();
    clearIntervalTimer();
  };

  const runNow = async (): Promise<void> => {
    if (disposed) return;
    clearDebounce();
    clearIntervalTimer();
    try {
      if (await options.runPass()) options.onRemoteChanges();
    } catch {
      // The sync worker records its own failures in the sync state.
    } finally {
      if (started && !disposed) {
        scheduleNextInterval();
      }
    }
  };

  return {
    schedule: () => {
      if (disposed) return;
      clearDebounce();
      const attempt = Math.max(0, options.getBackoffAttempt?.() ?? 0);
      const delay =
        attempt > 0
          ? Math.min(debounceMs * Math.pow(2, attempt), MAX_SYNC_BACKOFF_MS)
          : debounceMs;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void runNow();
      }, delay);
    },
    runNow,
    start: () => {
      if (disposed || started) return;
      started = true;
      scheduleNextInterval();
    },
    stop: stopInterval,
    dispose: () => {
      disposed = true;
      clearDebounce();
      stopInterval();
    },
  };
};
