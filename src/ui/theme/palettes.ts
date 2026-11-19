import type {
  ModernAiButtonDesignId,
  ModernThemeId,
} from '../../storage/modernThemeStore';
import type {UIVariant} from '../../storage/uiVariantStore';
import {DARK_STOPS, LIGHT_STOPS} from '../splash/synthWave';
import {mixColors} from './colorMix';

export type {ModernAiButtonDesignId, ModernThemeId};

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

export interface ModernThemeMeta {
  id: ModernThemeId;
  label: string;
  subtitle: string;
  previewLight: readonly [string, string, string];
  previewDark: readonly [string, string, string];
}

export interface ModernAiButtonDesignMeta {
  id: ModernAiButtonDesignId;
  label: string;
  subtitle: string;
}

export const MODERN_AI_BUTTON_DESIGNS: readonly ModernAiButtonDesignMeta[] = [
  {
    id: 'synth_orb',
    label: 'Synth Orb',
    subtitle: 'Harmonic wave & glass sphere',
  },
  {
    id: 'liquid_pearl',
    label: 'Liquid Pearl',
    subtitle: 'Pure 3D iridescent orb',
  },
  {
    id: 'eclipse_dial',
    label: 'Eclipse Dial',
    subtitle: 'Concentric halo & focal core',
  },
  {
    id: 'prism_lens',
    label: 'Prism Lens',
    subtitle: 'Faceted jewel & geometric mark',
  },
  {
    id: 'acoustic_core',
    label: 'Acoustic Core',
    subtitle: 'Sculpted voice cadence bars',
  },
] as const;

export const getModernAiButtonDesignMeta = (
  designId: ModernAiButtonDesignId = 'synth_orb',
): ModernAiButtonDesignMeta =>
  MODERN_AI_BUTTON_DESIGNS.find(design => design.id === designId) ??
  MODERN_AI_BUTTON_DESIGNS[0];

export interface ModernThemeExtras {
  shadowColor: string;
  heroBgColor: string;
  heroHighlightColor: string;
  chatBgStops: readonly [string, string, string];
  synthAvatarBg: string;
  synthWaveStops: ReadonlyArray<readonly [number, string]>;
}

interface ModeSeed {
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
  softTint: string;
  heroCardBg: string;
  heroCardSecondary: string;
  heroHighlight: string;
  shadowColor: string;
  authGradientBlue: string;
  switchTrackOff: string;
  textMuted: string;
  holiday: string;
  danger?: string;
  dangerSoft?: string;
  waveWarmStops: readonly [string, string, string, string];
}

interface ModernThemePresetSpec {
  meta: ModernThemeMeta;
  light: ModeSeed;
  dark: ModeSeed;
}

const MODERN_THEME_SPECS: ReadonlyArray<ModernThemePresetSpec> = [
  {
    meta: {
      id: 'forest',
      label: 'Forest',
      subtitle: 'Botanical sage & emerald',
      previewLight: ['#1B7A56', '#63B891', '#E6F3EC'],
      previewDark: ['#259163', '#57B88F', '#193125'],
    },
    light: {
      bg: '#F6FAF7',
      card: '#FFFFFF',
      surface: '#EDF4EF',
      text: '#102119',
      muted: '#5B6E64',
      accent: '#1B7A56',
      accentDeep: '#125E41',
      periwinkle: '#63B891',
      periwinkleSoft: '#E2F3EA',
      darkInkBtn: '#102119',
      border: '#E2ECE5',
      softTint: '#E6F4EC',
      heroCardBg: '#1B7A56',
      heroCardSecondary: '#125E41',
      heroHighlight: '#56B88D',
      shadowColor: '#124833',
      authGradientBlue: '#B4E3C9',
      switchTrackOff: '#C2D4C9',
      textMuted: '#7E9186',
      holiday: '#15803D',
      waveWarmStops: ['#D4B118', '#52B788', '#2D9B72', '#1F8865'],
    },
    dark: {
      bg: '#0E1411',
      card: '#151E19',
      surface: '#1C2721',
      text: '#F2F9F5',
      muted: '#9AB0A3',
      accent: '#259163',
      accentDeep: '#186E4B',
      periwinkle: '#57B88F',
      periwinkleSoft: '#193429',
      darkInkBtn: '#186E4B',
      border: '#25342C',
      softTint: '#182F24',
      heroCardBg: '#166B49',
      heroCardSecondary: '#11543A',
      heroHighlight: '#4EA881',
      shadowColor: '#0E3B29',
      authGradientBlue: '#193429',
      switchTrackOff: '#364F41',
      textMuted: '#7D9487',
      holiday: '#34D399',
      waveWarmStops: ['#F2E68C', '#74D3A5', '#52C293', '#49B592'],
    },
  },
  {
    meta: {
      id: 'ocean',
      label: 'Ocean',
      subtitle: 'Coastal cerulean & mist',
      previewLight: ['#0E6BA8', '#59A6E8', '#E4F0FC'],
      previewDark: ['#2B83CE', '#63B0EE', '#152A3F'],
    },
    light: {
      bg: '#F5F9FD',
      card: '#FFFFFF',
      surface: '#EAF2FA',
      text: '#0F1C2E',
      muted: '#5A6B82',
      accent: '#0E6BA8',
      accentDeep: '#095082',
      periwinkle: '#59A6E8',
      periwinkleSoft: '#E2EFFC',
      darkInkBtn: '#0F1C2E',
      border: '#DFEAF5',
      softTint: '#E6F1FC',
      heroCardBg: '#0E6BA8',
      heroCardSecondary: '#095082',
      heroHighlight: '#5BB0EE',
      shadowColor: '#0B4B75',
      authGradientBlue: '#B7DAFA',
      switchTrackOff: '#C2D1E2',
      textMuted: '#7C8CA3',
      holiday: '#0D9488',
      waveWarmStops: ['#E5AF20', '#5EC0D6', '#3B9ED8', '#2283C9'],
    },
    dark: {
      bg: '#0D131A',
      card: '#141D28',
      surface: '#1B2634',
      text: '#F1F7FF',
      muted: '#94A6BE',
      accent: '#2B83CE',
      accentDeep: '#105E96',
      periwinkle: '#63B0EE',
      periwinkleSoft: '#162E45',
      darkInkBtn: '#105E96',
      border: '#243346',
      softTint: '#15293E',
      heroCardBg: '#11639D',
      heroCardSecondary: '#0B4B78',
      heroHighlight: '#4A9EE2',
      shadowColor: '#093D63',
      authGradientBlue: '#162E45',
      switchTrackOff: '#364A63',
      textMuted: '#7B8FA8',
      holiday: '#2DD4BF',
      waveWarmStops: ['#F7DE88', '#7AD8E6', '#61BEEF', '#4AA4E6'],
    },
  },
  {
    meta: {
      id: 'rose',
      label: 'Rose',
      subtitle: 'Warm berry & petal blush',
      previewLight: ['#C0265E', '#EA7CA4', '#FAE8EF'],
      previewDark: ['#DC457B', '#EE7CA6', '#331A26'],
    },
    light: {
      bg: '#FCF7F9',
      card: '#FFFFFF',
      surface: '#F7ECF1',
      text: '#26121B',
      muted: '#7B616C',
      accent: '#C0265E',
      accentDeep: '#981A49',
      periwinkle: '#EA7CA4',
      periwinkleSoft: '#FCE5EE',
      darkInkBtn: '#26121B',
      border: '#EFE1E7',
      softTint: '#FAE9F0',
      heroCardBg: '#C0265E',
      heroCardSecondary: '#981A49',
      heroHighlight: '#EE7CA7',
      shadowColor: '#851A43',
      authGradientBlue: '#F5C2D7',
      switchTrackOff: '#DFC5D0',
      textMuted: '#997E8A',
      holiday: '#15803D',
      danger: '#B93815',
      dangerSoft: '#FDEEE8',
      waveWarmStops: ['#E5B01C', '#EC856B', '#DF5B85', '#CD3D76'],
    },
    dark: {
      bg: '#160F13',
      card: '#20151B',
      surface: '#291C23',
      text: '#FFF5F9',
      muted: '#B89CA8',
      accent: '#DC457B',
      accentDeep: '#AD2258',
      periwinkle: '#EE7CA6',
      periwinkleSoft: '#361C29',
      darkInkBtn: '#AD2258',
      border: '#382630',
      softTint: '#321925',
      heroCardBg: '#AD2258',
      heroCardSecondary: '#861844',
      heroHighlight: '#E96E9B',
      shadowColor: '#75153B',
      authGradientBlue: '#361C29',
      switchTrackOff: '#593B4A',
      textMuted: '#9C7F8C',
      holiday: '#34D399',
      danger: '#FDBA74',
      dangerSoft: '#3A2318',
      waveWarmStops: ['#FBE490', '#F7AD92', '#F188AE', '#E46A99'],
    },
  },
  {
    meta: {
      id: 'sunset',
      label: 'Sunset',
      subtitle: 'Terracotta & warm amber',
      previewLight: ['#C24B14', '#F0975C', '#FBEDE3'],
      previewDark: ['#D55E22', '#F29A63', '#332016'],
    },
    light: {
      bg: '#FCF8F4',
      card: '#FFFFFF',
      surface: '#F6EEE5',
      text: '#241810',
      muted: '#7A685B',
      accent: '#C24B14',
      accentDeep: '#9A370B',
      periwinkle: '#F0975C',
      periwinkleSoft: '#FCEBE0',
      darkInkBtn: '#241810',
      border: '#EFE4D8',
      softTint: '#FBEDE3',
      heroCardBg: '#C84E15',
      heroCardSecondary: '#9A370B',
      heroHighlight: '#F49B5E',
      shadowColor: '#8A320A',
      authGradientBlue: '#F8CCA8',
      switchTrackOff: '#DFCEBE',
      textMuted: '#988577',
      holiday: '#15803D',
      danger: '#B91C1C',
      dangerSoft: '#FEECEC',
      waveWarmStops: ['#D9A408', '#EB7C2A', '#E05E34', '#CC4B24'],
    },
    dark: {
      bg: '#15110E',
      card: '#201914',
      surface: '#29201A',
      text: '#FFF8F2',
      muted: '#B8A699',
      accent: '#D55E22',
      accentDeep: '#B44312',
      periwinkle: '#F29A63',
      periwinkleSoft: '#372216',
      darkInkBtn: '#B44312',
      border: '#392C23',
      softTint: '#321F15',
      heroCardBg: '#B84511',
      heroCardSecondary: '#8E330A',
      heroHighlight: '#EE8D52',
      shadowColor: '#7A2B08',
      authGradientBlue: '#372216',
      switchTrackOff: '#5A4435',
      textMuted: '#9B897C',
      holiday: '#34D399',
      danger: '#FCA5A5',
      dangerSoft: '#3A1D20',
      waveWarmStops: ['#FCEC95', '#FAB87A', '#F4926C', '#EA784C'],
    },
  },
  {
    meta: {
      id: 'slate',
      label: 'Slate',
      subtitle: 'Crisp graphite & steel mist',
      previewLight: ['#334B68', '#7490B2', '#E8EDF3'],
      previewDark: ['#6480A3', '#8CA5C4', '#212B38'],
    },
    light: {
      bg: '#F7F8FA',
      card: '#FFFFFF',
      surface: '#ECEFF4',
      text: '#131A24',
      muted: '#5E6B7C',
      accent: '#334B68',
      accentDeep: '#22354C',
      periwinkle: '#7490B2',
      periwinkleSoft: '#E4EAF2',
      darkInkBtn: '#131A24',
      border: '#E2E7EE',
      softTint: '#E9EEF4',
      heroCardBg: '#37506E',
      heroCardSecondary: '#22354C',
      heroHighlight: '#7490B2',
      shadowColor: '#1E2D3E',
      authGradientBlue: '#BFCDE0',
      switchTrackOff: '#C5CDD8',
      textMuted: '#7F8C9D',
      holiday: '#15803D',
      waveWarmStops: ['#CFA81E', '#74A6BA', '#5680A8', '#3F6388'],
    },
    dark: {
      bg: '#0F1319',
      card: '#181E26',
      surface: '#202833',
      text: '#F3F6FA',
      muted: '#99A7BA',
      accent: '#6480A3',
      accentDeep: '#3A5270',
      periwinkle: '#8CA5C4',
      periwinkleSoft: '#222D3C',
      darkInkBtn: '#3A5270',
      border: '#2B3646',
      softTint: '#1F2835',
      heroCardBg: '#374E6B',
      heroCardSecondary: '#26384F',
      heroHighlight: '#6E8AAD',
      shadowColor: '#16212E',
      authGradientBlue: '#222D3C',
      switchTrackOff: '#3D4B5E',
      textMuted: '#7E8CA0',
      holiday: '#34D399',
      waveWarmStops: ['#F4E492', '#8FC6D6', '#7CA3CA', '#6B8FB8'],
    },
  },
];

export const MODERN_THEMES: readonly ModernThemeMeta[] = [
  {
    id: 'violet',
    label: 'Violet',
    subtitle: 'Iris & soft lavender',
    previewLight: ['#5945EB', '#8FA8FF', '#F2EFFF'],
    previewDark: ['#7C6BFF', '#6E7FF3', '#252142'],
  },
  ...MODERN_THEME_SPECS.map(spec => spec.meta),
];

const buildPaletteFromSeed = (
  seed: ModeSeed,
  isDarkMode: boolean,
): ModernPalette => ({
  bg: seed.bg,
  card: seed.card,
  surface: seed.surface,
  text: seed.text,
  muted: seed.muted,
  accent: seed.accent,
  accentDeep: seed.accentDeep,
  periwinkle: seed.periwinkle,
  periwinkleSoft: seed.periwinkleSoft,
  darkInkBtn: seed.darkInkBtn,
  border: seed.border,
  softViolet: seed.softTint,
  mint: isDarkMode
    ? mixColors('#183028', seed.card, 0.2)
    : mixColors('#E5F8F0', seed.surface, 0.14),
  mintInk: isDarkMode ? '#6EE7B7' : '#247B58',
  blueSoft: isDarkMode
    ? mixColors('#1D253E', seed.card, 0.2)
    : mixColors('#EAF1FF', seed.surface, 0.14),
  blueInk: isDarkMode ? '#93B4FF' : '#3B62BA',
  peach: isDarkMode
    ? mixColors('#33221D', seed.card, 0.2)
    : mixColors('#FFF0E8', seed.surface, 0.14),
  peachInk: isDarkMode ? '#FFAE92' : '#B85D3B',
  lilac: isDarkMode
    ? mixColors(seed.softTint, '#2A213D', 0.5)
    : mixColors(seed.softTint, '#F2E9FA', 0.45),
  lilacInk: isDarkMode
    ? mixColors(seed.periwinkle, '#FFFFFF', 0.45)
    : seed.accentDeep,
  cream: isDarkMode
    ? mixColors('#2E281B', seed.card, 0.2)
    : mixColors('#FFF3CA', seed.surface, 0.14),
  creamInk: isDarkMode ? '#FFD43B' : '#7E5E06',
  danger: seed.danger ?? (isDarkMode ? '#FFB3A9' : '#C94035'),
  dangerSoft: seed.dangerSoft ?? (isDarkMode ? '#3A1D24' : '#FDECEC'),
  heroCardBg: seed.heroCardBg,
  heroCardSecondary: seed.heroCardSecondary,
  heroText: '#FFFFFF',
  heroMutedText: isDarkMode
    ? 'rgba(247, 246, 255, 0.86)'
    : 'rgba(255, 255, 255, 0.86)',
  heroPillBg: isDarkMode
    ? 'rgba(255, 255, 255, 0.18)'
    : 'rgba(255, 255, 255, 0.2)',
});

const buildThemeColorsFromPalette = (
  palette: ModernPalette,
  seed: ModeSeed,
  isDarkMode: boolean,
): ThemeColors => ({
  background: palette.bg,
  surface: palette.surface,
  cardBg: palette.card,
  inputBg: palette.surface,
  divider: palette.border,
  textPrimary: palette.text,
  textSecondary: palette.muted,
  textMuted: seed.textMuted,
  border: palette.border,
  statusBarStyle: isDarkMode ? 'light-content' : 'dark-content',
  primary: palette.accent,
  textOnPrimary: '#FFFFFF',
  red: palette.accent,
  blue: palette.accent,
  yellow: palette.creamInk,
  success: isDarkMode ? '#34D399' : '#2E9D70',
  warning: isDarkMode ? '#FBBF24' : '#D97706',
  error: isDarkMode && !seed.danger ? '#F87171' : palette.danger,
  white: '#FFFFFF',
  black: isDarkMode ? '#000000' : palette.text,
  overlay: isDarkMode ? 'rgba(10, 9, 20, 0.72)' : 'rgba(15, 20, 28, 0.45)',
  chipActiveText: '#FFFFFF',
  switchTrackOff: seed.switchTrackOff,
  switchThumb: '#FFFFFF',
  placeholder: seed.textMuted,
  iconMuted: seed.textMuted,
  eventIconBg: palette.softViolet,
  bannerBg: palette.peach,
  noteHighlightBg: palette.cream,
  noteHighlightText: palette.text,
  proGradientStart: palette.accent,
  proGradientMid: isDarkMode ? palette.accentDeep : palette.periwinkle,
  proGradientEnd: palette.accentDeep,
  authGradientYellow: isDarkMode ? palette.softViolet : palette.periwinkleSoft,
  authGradientCrimson: isDarkMode ? palette.card : palette.softViolet,
  authGradientBlue: seed.authGradientBlue,
  authVeil: isDarkMode ? 'rgba(15, 16, 24, 0.56)' : 'rgba(252, 252, 253, 0.52)',
  holiday: seed.holiday,
});

const buildExtrasFromSeed = (
  palette: ModernPalette,
  seed: ModeSeed,
  isDarkMode: boolean,
): ModernThemeExtras => {
  const [w0, w1, w2, w3] = seed.waveWarmStops;
  return {
    shadowColor: seed.shadowColor,
    heroBgColor: seed.heroCardBg,
    heroHighlightColor: seed.heroHighlight,
    chatBgStops: isDarkMode
      ? [
          mixColors(palette.softViolet, palette.bg, 0.35),
          mixColors(palette.surface, palette.bg, 0.72),
          palette.bg,
        ]
      : [
          mixColors(palette.softViolet, palette.bg, 0.15),
          mixColors(palette.softViolet, palette.bg, 0.65),
          palette.bg,
        ],
    synthAvatarBg: mixColors(palette.surface, palette.bg, 0.45),
    synthWaveStops: [
      [0.0, w0],
      [0.22, w1],
      [0.4, w2],
      [0.5, w3],
      [0.6, mixColors(palette.periwinkle, w3, 0.35)],
      [0.72, palette.periwinkle],
      [0.84, palette.accent],
      [1.0, palette.accentDeep],
    ],
  };
};

interface ResolvedModernTheme {
  lightPalette: ModernPalette;
  darkPalette: ModernPalette;
  lightThemeColors: ThemeColors;
  darkThemeColors: ThemeColors;
  lightExtras: ModernThemeExtras;
  darkExtras: ModernThemeExtras;
}

const VIOLET_THEME_RESOLVED: ResolvedModernTheme = {
  lightPalette: modernLightPalette,
  darkPalette: modernDarkPalette,
  lightThemeColors: modernLightThemeColors,
  darkThemeColors: modernDarkThemeColors,
  lightExtras: {
    shadowColor: '#4C379A',
    heroBgColor: '#6C4DFF',
    heroHighlightColor: '#95AEFF',
    chatBgStops: ['#EDE8FC', '#F7F5FD', '#F8F9FA'],
    synthAvatarBg: '#F6F3FC',
    synthWaveStops: LIGHT_STOPS,
  },
  darkExtras: {
    shadowColor: '#4C379A',
    heroBgColor: '#4734D4',
    heroHighlightColor: '#6E7FF3',
    chatBgStops: ['#1A162B', '#13121A', '#101014'],
    synthAvatarBg: '#14121E',
    synthWaveStops: DARK_STOPS,
  },
};

const MODERN_THEME_REGISTRY: Record<ModernThemeId, ResolvedModernTheme> = {
  violet: VIOLET_THEME_RESOLVED,
  ...(Object.fromEntries(
    MODERN_THEME_SPECS.map(spec => {
      const lightPalette = buildPaletteFromSeed(spec.light, false);
      const darkPalette = buildPaletteFromSeed(spec.dark, true);
      return [
        spec.meta.id,
        {
          lightPalette,
          darkPalette,
          lightThemeColors: buildThemeColorsFromPalette(
            lightPalette,
            spec.light,
            false,
          ),
          darkThemeColors: buildThemeColorsFromPalette(
            darkPalette,
            spec.dark,
            true,
          ),
          lightExtras: buildExtrasFromSeed(lightPalette, spec.light, false),
          darkExtras: buildExtrasFromSeed(darkPalette, spec.dark, true),
        },
      ];
    }),
  ) as Record<Exclude<ModernThemeId, 'violet'>, ResolvedModernTheme>),
};

const resolveThemeEntry = (
  modernTheme: ModernThemeId = 'violet',
): ResolvedModernTheme =>
  MODERN_THEME_REGISTRY[modernTheme] ?? MODERN_THEME_REGISTRY.violet;

export const getModernThemeMeta = (
  modernTheme: ModernThemeId = 'violet',
): ModernThemeMeta =>
  MODERN_THEMES.find(theme => theme.id === modernTheme) ?? MODERN_THEMES[0];

export const getModernThemeExtras = (
  isDarkMode: boolean,
  modernTheme: ModernThemeId = 'violet',
): ModernThemeExtras => {
  const resolved = resolveThemeEntry(modernTheme);
  return isDarkMode ? resolved.darkExtras : resolved.lightExtras;
};

export const getModernPalette = (
  isDarkMode: boolean,
  modernTheme: ModernThemeId = 'violet',
): ModernPalette => {
  const resolved = resolveThemeEntry(modernTheme);
  return isDarkMode ? resolved.darkPalette : resolved.lightPalette;
};

export const getThemeColors = (
  uiVariant: UIVariant,
  isDarkMode: boolean,
  modernTheme: ModernThemeId = 'violet',
): ThemeColors => {
  if (uiVariant === 'classic') {
    return isDarkMode ? classicDarkColors : classicLightColors;
  }
  const resolved = resolveThemeEntry(modernTheme);
  return isDarkMode ? resolved.darkThemeColors : resolved.lightThemeColors;
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
