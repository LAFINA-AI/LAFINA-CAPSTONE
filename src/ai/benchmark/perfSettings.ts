import {localSettingsStore} from '../../storage/localSettingsStore';
import {DEVICE_SETTINGS_OWNER} from '../../cloud/backendSelection';

/** Device-wide Developer Mode switch (5 taps on App Version). */
export const DEVELOPER_MODE_KEY = 'debug.developer_mode';
/** Device-wide switch for per-message chat timing; off unless turned on in the hub. */
export const PERF_TRACKING_KEY = 'debug.perf_tracking';

let cached: boolean | null = null;
const listeners = new Set<(enabled: boolean) => void>();

const readFlag = (key: string): boolean =>
  localSettingsStore.get(DEVICE_SETTINGS_OWNER, key) === 'true';

/**
 * Timing is recorded only while BOTH Developer Mode and performance tracking
 * are on. Everything else in the app skips the instrumentation entirely.
 */
export const isPerfTrackingEnabled = (): boolean => {
  if (cached === null) {
    try {
      cached = readFlag(DEVELOPER_MODE_KEY) && readFlag(PERF_TRACKING_KEY);
    } catch {
      cached = false;
    }
  }
  return cached;
};

/** The stored tracking switch on its own (shown in the hub). */
export const isPerfTrackingSwitchOn = (): boolean => {
  try {
    return readFlag(PERF_TRACKING_KEY);
  } catch {
    return false;
  }
};

export const setPerfTrackingEnabled = (enabled: boolean): boolean => {
  const saved = localSettingsStore.set(
    DEVICE_SETTINGS_OWNER,
    PERF_TRACKING_KEY,
    enabled ? 'true' : 'false',
  );
  refreshPerfTrackingCache();
  return saved;
};

/** Re-reads the switches (call after Developer Mode changes). */
export const refreshPerfTrackingCache = (): void => {
  cached = null;
  const now = isPerfTrackingEnabled();
  for (const listener of listeners) {
    try {
      listener(now);
    } catch {
      // A listener's failure never affects the setting.
    }
  }
};

export const subscribePerfTracking = (
  listener: (enabled: boolean) => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
