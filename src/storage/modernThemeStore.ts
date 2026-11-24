import {DEVICE_SETTINGS_SCOPE} from './deviceScope';
import {localSettingsStore} from './localSettingsStore';

/** Curated color themes available when the Modern interface is active. */
export type ModernThemeId =
  | 'violet'
  | 'forest'
  | 'ocean'
  | 'rose'
  | 'sunset'
  | 'slate'
  | 'oled'
  | 'midnight'
  | 'cyber'
  | 'amber'
  | 'sakura'
  | 'matcha';

export const MODERN_THEME_IDS: readonly ModernThemeId[] = [
  'violet',
  'forest',
  'ocean',
  'rose',
  'sunset',
  'slate',
  'oled',
  'midnight',
  'cyber',
  'amber',
  'sakura',
  'matcha',
] as const;

export const MODERN_THEME_SETTING_KEY = 'modern_theme';
export const MODERN_THEME_DEVICE_SCOPE = DEVICE_SETTINGS_SCOPE;
export const DEFAULT_MODERN_THEME: ModernThemeId = 'violet';

const MODERN_THEME_SET: ReadonlySet<string> = new Set(MODERN_THEME_IDS);

export const normalizeModernTheme = (value: unknown): ModernThemeId =>
  typeof value === 'string' && MODERN_THEME_SET.has(value)
    ? (value as ModernThemeId)
    : DEFAULT_MODERN_THEME;

/** Selectable center AI circle button designs available in Modern mode. */
export type ModernAiButtonDesignId =
  | 'synth_orb'
  | 'liquid_pearl'
  | 'eclipse_dial'
  | 'prism_lens'
  | 'acoustic_core'
  | 'neural_mesh'
  | 'pulse_wave'
  | 'orbital_rings'
  | 'aurora_breathe'
  | 'equalizer_live'
  | 'celestial_spin'
  | 'quantum_sweep';

export const MODERN_AI_BUTTON_DESIGN_IDS: readonly ModernAiButtonDesignId[] = [
  'synth_orb',
  'liquid_pearl',
  'eclipse_dial',
  'prism_lens',
  'acoustic_core',
  'neural_mesh',
  'pulse_wave',
  'orbital_rings',
  'aurora_breathe',
  'equalizer_live',
  'celestial_spin',
  'quantum_sweep',
] as const;

export const MODERN_AI_BUTTON_DESIGN_SETTING_KEY = 'modern_ai_button_design';
export const DEFAULT_MODERN_AI_BUTTON_DESIGN: ModernAiButtonDesignId =
  'synth_orb';

const MODERN_AI_BUTTON_DESIGN_SET: ReadonlySet<string> = new Set(
  MODERN_AI_BUTTON_DESIGN_IDS,
);

export const normalizeModernAiButtonDesign = (
  value: unknown,
): ModernAiButtonDesignId =>
  typeof value === 'string' && MODERN_AI_BUTTON_DESIGN_SET.has(value)
    ? (value as ModernAiButtonDesignId)
    : DEFAULT_MODERN_AI_BUTTON_DESIGN;

const getScopedSetting = <T extends string>(
  userId: string | null | undefined,
  key: string,
  fallback: T,
  normalize: (value: unknown) => T,
): T => {
  try {
    if (userId) {
      const userValue = localSettingsStore.get(userId, key, '');
      if (userValue) {
        return normalize(userValue);
      }
    }
    const deviceValue = localSettingsStore.get(
      MODERN_THEME_DEVICE_SCOPE,
      key,
      fallback,
    );
    return normalize(deviceValue);
  } catch {
    return fallback;
  }
};

const saveScopedSetting = <T extends string>(
  userId: string | null | undefined,
  key: string,
  value: T,
  normalize: (raw: unknown) => T,
): void => {
  const safeValue = normalize(value);
  try {
    localSettingsStore.set(MODERN_THEME_DEVICE_SCOPE, key, safeValue);
  } catch {
    // Keep runtime preference change responsive even if SQLite is temporarily locked.
  }
  if (!userId) return;
  try {
    localSettingsStore.set(userId, key, safeValue);
  } catch {
    // Non-fatal; device scope was already updated above.
  }
};

export const getSavedModernTheme = (userId?: string | null): ModernThemeId =>
  getScopedSetting(
    userId,
    MODERN_THEME_SETTING_KEY,
    DEFAULT_MODERN_THEME,
    normalizeModernTheme,
  );

export const saveModernTheme = (
  userId: string | null | undefined,
  themeId: ModernThemeId,
): void =>
  saveScopedSetting(
    userId,
    MODERN_THEME_SETTING_KEY,
    themeId,
    normalizeModernTheme,
  );

export const getSavedModernAiButtonDesign = (
  userId?: string | null,
): ModernAiButtonDesignId =>
  getScopedSetting(
    userId,
    MODERN_AI_BUTTON_DESIGN_SETTING_KEY,
    DEFAULT_MODERN_AI_BUTTON_DESIGN,
    normalizeModernAiButtonDesign,
  );

export const saveModernAiButtonDesign = (
  userId: string | null | undefined,
  designId: ModernAiButtonDesignId,
): void =>
  saveScopedSetting(
    userId,
    MODERN_AI_BUTTON_DESIGN_SETTING_KEY,
    designId,
    normalizeModernAiButtonDesign,
  );
