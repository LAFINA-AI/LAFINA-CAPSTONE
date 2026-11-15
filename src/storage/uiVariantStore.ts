import {localSettingsStore} from './localSettingsStore';

/**
 * Persisted UI appearance variant (`modern` UniGuide-inspired vs `classic` original LAFINA).
 * Stored locally via `local_settings` without altering user data, auth, or scheduling.
 */
export type UIVariant = 'modern' | 'classic';

export const UI_VARIANT_SETTING_KEY = 'ui_variant';
export const UI_VARIANT_DEVICE_SCOPE = '__device_default__';
export const DEFAULT_UI_VARIANT: UIVariant = 'modern';

export const normalizeUIVariant = (value: unknown): UIVariant => {
  if (value === 'classic') return 'classic';
  if (value === 'modern') return 'modern';
  return DEFAULT_UI_VARIANT;
};

/**
 * Reads the persisted UI variant for a user, falling back to the last
 * device-level selection (for unauthenticated screens / cold starts) and
 * finally defaulting to `'modern'` unless an explicit `'classic'` preference exists.
 */
export const getSavedUIVariant = (userId?: string | null): UIVariant => {
  try {
    if (userId) {
      const userSaved = localSettingsStore.get(
        userId,
        UI_VARIANT_SETTING_KEY,
        '',
      );
      if (userSaved === 'modern' || userSaved === 'classic') {
        return userSaved;
      }
    }

    const deviceSaved = localSettingsStore.get(
      UI_VARIANT_DEVICE_SCOPE,
      UI_VARIANT_SETTING_KEY,
      '',
    );
    if (deviceSaved === 'modern' || deviceSaved === 'classic') {
      return deviceSaved;
    }
  } catch {
    // Database may not be initialized in early test mounts; fall back safely.
  }
  return DEFAULT_UI_VARIANT;
};

/**
 * Persists the UI variant for both the active user scope and the device
 * fallback scope so auth screens and cold starts preserve the user's choice.
 */
export const saveUIVariant = (
  userId: string | null | undefined,
  variant: UIVariant,
): boolean => {
  const safeVariant = normalizeUIVariant(variant);
  let ok = localSettingsStore.set(
    UI_VARIANT_DEVICE_SCOPE,
    UI_VARIANT_SETTING_KEY,
    safeVariant,
  );
  if (userId) {
    ok =
      localSettingsStore.set(userId, UI_VARIANT_SETTING_KEY, safeVariant) && ok;
  }
  return ok;
};
