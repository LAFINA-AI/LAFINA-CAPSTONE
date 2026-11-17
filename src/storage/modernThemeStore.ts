import {DEVICE_SETTINGS_SCOPE} from './deviceScope';
import {localSettingsStore} from './localSettingsStore';

/** Curated color themes available when the Modern interface is active. */
export type ModernThemeId =
  | 'violet'
  | 'forest'
  | 'ocean'
  | 'rose'
  | 'sunset'
  | 'slate';

export const MODERN_THEME_IDS: readonly ModernThemeId[] = [
  'violet',
  'forest',
  'ocean',
  'rose',
  'sunset',
  'slate',
] as const;

export const MODERN_THEME_SETTING_KEY = 'modern_theme';
export const MODERN_THEME_DEVICE_SCOPE = DEVICE_SETTINGS_SCOPE;
export const DEFAULT_MODERN_THEME: ModernThemeId = 'violet';

const MODERN_THEME_SET: ReadonlySet<string> = new Set(MODERN_THEME_IDS);

export const normalizeModernTheme = (value: unknown): ModernThemeId =>
  typeof value === 'string' && MODERN_THEME_SET.has(value)
    ? (value as ModernThemeId)
    : DEFAULT_MODERN_THEME;

export const getSavedModernTheme = (userId?: string | null): ModernThemeId => {
  try {
    if (userId) {
      const userValue = localSettingsStore.get(
        userId,
        MODERN_THEME_SETTING_KEY,
        '',
      );
      if (userValue) {
        return normalizeModernTheme(userValue);
      }
    }
    const deviceValue = localSettingsStore.get(
      MODERN_THEME_DEVICE_SCOPE,
      MODERN_THEME_SETTING_KEY,
      DEFAULT_MODERN_THEME,
    );
    return normalizeModernTheme(deviceValue);
  } catch {
    return DEFAULT_MODERN_THEME;
  }
};

export const saveModernTheme = (
  userId: string | null | undefined,
  themeId: ModernThemeId,
): void => {
  const safeTheme = normalizeModernTheme(themeId);
  try {
    localSettingsStore.set(
      MODERN_THEME_DEVICE_SCOPE,
      MODERN_THEME_SETTING_KEY,
      safeTheme,
    );
  } catch {
    // Keep runtime theme change responsive even if SQLite is temporarily locked.
  }
  if (!userId) return;
  try {
    localSettingsStore.set(userId, MODERN_THEME_SETTING_KEY, safeTheme);
  } catch {
    // Non-fatal; device scope was already updated above.
  }
};
