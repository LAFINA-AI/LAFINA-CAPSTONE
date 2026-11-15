import type {UIVariant} from '../../storage/uiVariantStore';

/**
 * Single Source of Truth for LAFINA brand, Classic, Modern, and category palettes.
 * Updating any token here propagates across Light/Dark and Classic/Modern modes.
 */

/** Base brand constants shared across static defaults and theme mappings. */
export const Colors = {
  yellow: '#C8A800',
  red: '#F75A5A',
  blue: '#E6003A',
  deepIndigo: '#1E006A',
  darkBg: '#000000',
  cardBg: '#FFFFFF',
  cardBgDark: '#1C1C1E',
  textDark: '#1A1A1A',
  textLight: '#FFFFFF',
  textMuted: '#7A7A7A',
  textMutedLight: '#A0A0A0',
  border: '#E5E5E5',
  borderDark: '#2C2C2E',
  success: '#2ECC71',
  warning: '#F4A100',
  error: '#FF3B30',
  shadowColor: 'rgba(0,0,0,0.08)',

  // Gradient stops
  gradientRed: '#FF4D00',
  gradientMagenta: '#C2006A',
  gradientPurple: '#6B00C9',
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  cardBg: string;
  inputBg: string;
  divider: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  statusBarStyle: 'dark-content' | 'light-content';
  primary: string;
  textOnPrimary: string;
  red: string;
  blue: string;
  yellow: string;
  success: string;
  warning: string;
  error: string;
  white: string;
  black: string;
  overlay: string;
  chipActiveText: string;
  switchTrackOff: string;
  switchThumb: string;
  placeholder: string;
  iconMuted: string;
  eventIconBg: string;
  bannerBg: string;
  noteHighlightBg: string;
  noteHighlightText: string;
  proGradientStart: string;
  proGradientMid: string;
  proGradientEnd: string;
  authGradientYellow: string;
  authGradientCrimson: string;
  authGradientBlue: string;
  authVeil: string;
  holiday: string;
}

export interface ModernPalette {
  bg: string;
  card: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentDeep: string;
  periwinkle: string;
  periwinkleSoft: string;
  darkInkBtn: string;
  border: string;
  softViolet: string;
  mint: string;
  mintInk: string;
  blueSoft: string;
  blueInk: string;
  peach: string;
  peachInk: string;
  lilac: string;
  lilacInk: string;
  cream: string;
  creamInk: string;
  danger: string;
  dangerSoft: string;
  heroCardBg: string;
  heroCardSecondary: string;
  heroText: string;
  heroMutedText: string;
  heroPillBg: string;
}

export const classicLightColors: ThemeColors = {
  background: '#FAF9F6',
  surface: Colors.cardBg,
  cardBg: Colors.cardBg,
  inputBg: '#FAF9F6',
  divider: '#F0F0F0',
  textPrimary: Colors.textDark,
  textSecondary: Colors.textMuted,
  textMuted: Colors.textMutedLight,
  border: Colors.border,
  statusBarStyle: 'dark-content',
  primary: Colors.red,
  textOnPrimary: '#FFFFFF',
  red: Colors.red,
  blue: Colors.blue,
  yellow: Colors.yellow,
  success: Colors.success,
  warning: Colors.warning,
  error: Colors.error,
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.5)',
  chipActiveText: '#FFFFFF',
  switchTrackOff: '#767577',
  switchThumb: '#FFF',
  placeholder: '#888',
  iconMuted: '#AAA',
  eventIconBg: '#F0F0FF',
  bannerBg: '#FCE4D6',
  noteHighlightBg: '#FFF3A3',
  noteHighlightText: Colors.textDark,
  proGradientStart: Colors.gradientRed,
  proGradientMid: Colors.gradientMagenta,
  proGradientEnd: Colors.gradientPurple,
  authGradientYellow: '#F8E81C',
  authGradientCrimson: '#D8163F',
  authGradientBlue: '#2A10F0',
  authVeil: 'rgba(255, 255, 255, 0.12)',
  holiday: '#0B8043',
};

export const classicDarkColors: ThemeColors = {
  background: '#121212',
  surface: Colors.cardBgDark,
  cardBg: Colors.cardBgDark,
  inputBg: '#2C2C2E',
  divider: '#3A3A3C',
  textPrimary: Colors.textLight,
  textSecondary: Colors.textMutedLight,
  textMuted: '#666666',
  border: Colors.borderDark,
  statusBarStyle: 'light-content',
  primary: Colors.red,
  textOnPrimary: '#FFFFFF',
  red: Colors.red,
  blue: Colors.blue,
  yellow: Colors.yellow,
  success: Colors.success,
  warning: Colors.warning,
  error: Colors.error,
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.5)',
  chipActiveText: '#FFFFFF',
  switchTrackOff: '#767577',
  switchThumb: '#FFF',
  placeholder: '#666',
  iconMuted: '#666',
  eventIconBg: '#1E1E3F',
  bannerBg: '#2C1B18',
  noteHighlightBg: '#6B5D1F',
  noteHighlightText: Colors.textLight,
  proGradientStart: Colors.gradientRed,
  proGradientMid: Colors.gradientMagenta,
  proGradientEnd: Colors.gradientPurple,
  authGradientYellow: '#E8A812',
  authGradientCrimson: '#B80E36',
  authGradientBlue: '#2410C8',
  authVeil: 'rgba(10, 6, 28, 0.22)',
  holiday: '#0B8043',
};

export const modernLightPalette: ModernPalette = {
  bg: '#FCFBFF',
  card: '#FFFFFF',
  surface: '#F4F2FA',
  text: '#151327',
  muted: '#6E6B7B',
  accent: '#5945EB',
  accentDeep: '#4734D4',
  periwinkle: '#8FA8FF',
  periwinkleSoft: '#EEF1FF',
  darkInkBtn: '#151327',
  border: '#EEEDF4',
  softViolet: '#F2EFFF',
  mint: '#E5F8F0',
  mintInk: '#2D8A65',
  blueSoft: '#EAF1FF',
  blueInk: '#4A6EC7',
  peach: '#FFF0E8',
  peachInk: '#C96F4B',
  lilac: '#F2E9FA',
  lilacInk: '#7C4DA6',
  cream: '#FFF3CA',
  creamInk: '#856404',
  danger: '#C94035',
  dangerSoft: '#FDECEC',
  heroCardBg: '#5945EB',
  heroCardSecondary: '#4734D4',
  heroText: '#FFFFFF',
  heroMutedText: 'rgba(255, 255, 255, 0.84)',
  heroPillBg: 'rgba(255, 255, 255, 0.2)',
};

export const modernDarkPalette: ModernPalette = {
  bg: '#11101E',
  card: '#1B192E',
  surface: '#24213C',
  text: '#F7F6FF',
  muted: '#A39FB8',
  accent: '#7C6BFF',
  accentDeep: '#5945EB',
  periwinkle: '#6E7FF3',
  periwinkleSoft: '#272548',
  darkInkBtn: '#5945EB',
  border: '#2C2847',
  softViolet: '#252142',
  mint: '#183028',
  mintInk: '#6EE7B7',
  blueSoft: '#1D253E',
  blueInk: '#93B4FF',
  peach: '#33221D',
  peachInk: '#FFAE92',
  lilac: '#2A213D',
  lilacInk: '#D3B8F8',
  cream: '#2E281B',
  creamInk: '#FFD43B',
  danger: '#FFB3A9',
  dangerSoft: '#3A1D24',
  heroCardBg: '#4734D4',
  heroCardSecondary: '#3626A7',
  heroText: '#FFFFFF',
  heroMutedText: 'rgba(247, 246, 255, 0.86)',
  heroPillBg: 'rgba(255, 255, 255, 0.18)',
};

/**
 * Maps UniGuide Modern palette tokens onto LAFINA's `ThemeColors` contract so every
 * existing screen, modal, form, and sheet harmonizes automatically in Modern mode
 * while leaving Classic `classicLightColors` / `classicDarkColors` completely untouched.
 */
export const modernLightThemeColors: ThemeColors = {
  background: modernLightPalette.bg,
  surface: modernLightPalette.surface,
  cardBg: modernLightPalette.card,
  inputBg: modernLightPalette.surface,
  divider: modernLightPalette.border,
  textPrimary: modernLightPalette.text,
  textSecondary: modernLightPalette.muted,
  textMuted: '#8B879B',
  border: modernLightPalette.border,
  statusBarStyle: 'dark-content',
  primary: modernLightPalette.accent,
  textOnPrimary: '#FFFFFF',
  red: modernLightPalette.accent,
  blue: modernLightPalette.accent,
  yellow: modernLightPalette.creamInk,
  success: '#2E9D70',
  warning: '#D97706',
  error: modernLightPalette.danger,
  white: '#FFFFFF',
  black: '#151327',
  overlay: 'rgba(21, 19, 39, 0.45)',
  chipActiveText: '#FFFFFF',
  switchTrackOff: '#C9C6DA',
  switchThumb: '#FFFFFF',
  placeholder: '#8B879B',
  iconMuted: '#8B879B',
  eventIconBg: modernLightPalette.softViolet,
  bannerBg: modernLightPalette.peach,
  noteHighlightBg: modernLightPalette.cream,
  noteHighlightText: modernLightPalette.text,
  proGradientStart: '#5945EB',
  proGradientMid: '#6E7FF3',
  proGradientEnd: '#4734D4',
  authGradientYellow: '#EEF1FF',
  authGradientCrimson: '#F2EFFF',
  authGradientBlue: '#C7CEFF',
  authVeil: 'rgba(252, 251, 255, 0.52)',
  holiday: '#2D8A65',
};

export const modernDarkThemeColors: ThemeColors = {
  background: modernDarkPalette.bg,
  surface: modernDarkPalette.surface,
  cardBg: modernDarkPalette.card,
  inputBg: modernDarkPalette.surface,
  divider: modernDarkPalette.border,
  textPrimary: modernDarkPalette.text,
  textSecondary: modernDarkPalette.muted,
  textMuted: '#8B86A3',
  border: modernDarkPalette.border,
  statusBarStyle: 'light-content',
  primary: modernDarkPalette.accent,
  textOnPrimary: '#FFFFFF',
  red: modernDarkPalette.accent,
  blue: modernDarkPalette.accent,
  yellow: modernDarkPalette.creamInk,
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(10, 9, 20, 0.72)',
  chipActiveText: '#FFFFFF',
  switchTrackOff: '#433E68',
  switchThumb: '#FFFFFF',
  placeholder: '#8B86A3',
  iconMuted: '#8B86A3',
  eventIconBg: modernDarkPalette.softViolet,
  bannerBg: modernDarkPalette.peach,
  noteHighlightBg: modernDarkPalette.cream,
  noteHighlightText: modernDarkPalette.text,
  proGradientStart: '#7C6BFF',
  proGradientMid: '#5945EB',
  proGradientEnd: '#4734D4',
  authGradientYellow: '#252142',
  authGradientCrimson: '#1B192E',
  authGradientBlue: '#272548',
  authVeil: 'rgba(17, 16, 30, 0.56)',
  holiday: '#34D399',
};

export const getModernPalette = (isDarkMode: boolean): ModernPalette =>
  isDarkMode ? modernDarkPalette : modernLightPalette;

export const getThemeColors = (
  uiVariant: UIVariant,
  isDarkMode: boolean,
): ThemeColors => {
  if (uiVariant === 'classic') {
    return isDarkMode ? classicDarkColors : classicLightColors;
  }
  return isDarkMode ? modernDarkThemeColors : modernLightThemeColors;
};

/** Default category color assignments shared by Notes, To-Dos, and Calendar. */
export const CATEGORY_COLOR_DEFAULTS: Record<string, string> = {
  work: Colors.blue,
  personal: Colors.yellow,
  health: Colors.success,
  learning: '#9B59B6',
};

export const DEFAULT_CATEGORY_COLOR = '#9E9E9E';

/** Preset swatch picker colors when creating or editing custom categories. */
export const CUSTOM_CATEGORY_SWATCHES: readonly string[] = [
  '#3498DB', // Blue
  '#2ECC71', // Green
  '#C8A800', // Yellow
  '#9B59B6', // Purple
  '#F75A5A', // Red
  '#E67E22', // Orange
  '#E91E63', // Pink
  '#1ABC9C', // Teal
];

/** Preset badge colors hashed to imported .ics calendar layers. */
export const CALENDAR_LAYER_SWATCHES: readonly string[] = [
  '#F44336',
  '#E91E63',
  '#9C27B0',
  '#673AB7',
  '#3F51B5',
  '#2196F3',
  '#03A9F4',
  '#00BCD4',
  '#009688',
  '#4CAF50',
  '#8BC34A',
  '#FF9800',
  '#FF5722',
  '#795548',
];

/** Distinct preset swatches for calendar time blocks (safe across Light/Dark & Classic/Modern). */
export const TIME_BLOCK_SWATCHES: readonly string[] = [
  Colors.blue,
  Colors.red,
  Colors.yellow,
  Colors.success,
  Colors.gradientPurple,
];
