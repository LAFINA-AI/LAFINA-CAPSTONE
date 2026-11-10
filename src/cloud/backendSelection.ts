/**
 * Debug and test builds only: choose which LAFINA server the app talks to,
 * the hosted Vercel backend or a backend on the developer's computer
 * (reached from the phone through `adb reverse tcp:8000 tcp:8000`).
 *
 * The choice is one device-wide row in `local_settings` (never synced). Release
 * builds compile the switch out natively (`ENABLE_BACKEND_SWITCH` is false), so
 * a saved row there is ignored and the production server is always used.
 */
import {NativeModules} from 'react-native';
import {localSettingsStore} from '../storage/localSettingsStore';
import {
  CLOUD_API_BASE_URL,
  LOCAL_API_BASE_URL,
  cloudClient,
} from './cloudClient';

export type BackendChoice = 'vercel' | 'local';

/** Device-wide settings owner; not an account. */
export const DEVICE_SETTINGS_OWNER = '__device__';
export const BACKEND_CHOICE_KEY = 'debug.api_backend';

export const BACKEND_LABELS: Record<BackendChoice, string> = {
  vercel: 'Vercel (Singapore)',
  local: 'Local computer (127.0.0.1:8000)',
};

export const backendUrlFor = (choice: BackendChoice): string =>
  choice === 'local' ? LOCAL_API_BASE_URL : CLOUD_API_BASE_URL;

const isChoice = (value: unknown): value is BackendChoice =>
  value === 'vercel' || value === 'local';

export const backendSelection = {
  /** True only in builds compiled with the debug server switch. */
  isAvailable: (): boolean =>
    (
      NativeModules.CapstoneBuild as
        | {backendSwitchEnabled?: unknown}
        | undefined
    )?.backendSwitchEnabled === true,

  /** The server requests go to first, as a choice, or null for any other server. */
  current: (): BackendChoice | null => {
    const url = cloudClient.getBaseUrl();
    if (url === CLOUD_API_BASE_URL) return 'vercel';
    if (url === LOCAL_API_BASE_URL) return 'local';
    return null;
  },

  /** Call once after the database opens. Returns the choice applied, if any. */
  applySaved: (): BackendChoice | null => {
    if (!backendSelection.isAvailable()) return null;
    const saved = localSettingsStore.get(
      DEVICE_SETTINGS_OWNER,
      BACKEND_CHOICE_KEY,
    );
    if (!isChoice(saved)) return null;
    cloudClient.setBaseUrl(backendUrlFor(saved));
    return saved;
  },

  /**
   * Switches now and remembers it for later launches. Returns false (and
   * changes nothing) when the build has no switch. A failed save still switches
   * this run; the result's `saved` says whether it will last.
   */
  select: (choice: BackendChoice): {switched: boolean; saved: boolean} => {
    if (!backendSelection.isAvailable() || !isChoice(choice)) {
      return {switched: false, saved: false};
    }
    cloudClient.setBaseUrl(backendUrlFor(choice));
    const saved = localSettingsStore.set(
      DEVICE_SETTINGS_OWNER,
      BACKEND_CHOICE_KEY,
      choice,
    );
    return {switched: true, saved};
  },
};
