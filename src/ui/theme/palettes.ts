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
  badge?: string;
  previewLight: readonly [string, string, string];
  previewDark: readonly [string, string, string];
}

export interface ModernAiButtonDesignMeta {
  id: ModernAiButtonDesignId;
  label: string;
  subtitle: string;
  animated?: boolean;
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
  {
    id: 'neural_mesh',
    label: 'Neural Mesh',
    subtitle: 'Synaptic nodes & luminous core',
  },
  {
    id: 'pulse_wave',
    label: 'Pulse Wave',
    subtitle: 'Flowing live harmonic waves',
    animated: true,
  },
  {
    id: 'orbital_rings',
    label: 'Orbital Rings',
    subtitle: 'Rotating halo & twin satellites',
    animated: true,
  },
  {
    id: 'aurora_breathe',
    label: 'Aurora Breathe',
    subtitle: 'Breathing iridescent plasma glow',
    animated: true,
  },
  {
    id: 'equalizer_live',
    label: 'Live Equalizer',
    subtitle: 'Dancing voice cadence bars',
    animated: true,
  },
  {
    id: 'celestial_spin',
    label: 'Celestial Spin',
    subtitle: 'Twinkling star & orbiting ring',
    animated: true,
  },
  {
    id: 'quantum_sweep',
    label: 'Quantum Sweep',
    subtitle: 'Sweeping luminous sonar halo',
    animated: true,
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
  chatBgStops?: readonly [string, string, string];
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
  {
    meta: {
      id: 'oled',
      label: 'OLED',
      subtitle: 'True pitch black & cobalt',
      badge: 'OLED',
      previewLight: ['#1D4ED8', '#60A5FA', '#EAF0FF'],
      previewDark: ['#000000', '#2D6EF7', '#0A0B0F'],
    },
    light: {
      bg: '#FAFAFC',
      card: '#FFFFFF',
      surface: '#F0F2F7',
      text: '#090B10',
      muted: '#555D6E',
      accent: '#1D4ED8',
      accentDeep: '#163B9E',
      periwinkle: '#60A5FA',
      periwinkleSoft: '#E5EEFF',
      darkInkBtn: '#090B10',
      border: '#E4E7F0',
      softTint: '#EAF0FF',
      heroCardBg: '#1D4ED8',
      heroCardSecondary: '#163B9E',
      heroHighlight: '#60A5FA',
      shadowColor: '#133185',
      authGradientBlue: '#C0D7FF',
      switchTrackOff: '#C4CAD8',
      textMuted: '#757E91',
      holiday: '#15803D',
      waveWarmStops: ['#E2B21E', '#5EB4F5', '#3B82F6', '#2563EB'],
    },
    dark: {
      bg: '#000000',
      card: '#090A0E',
      surface: '#12141C',
      text: '#F8FAFF',
      muted: '#94A0B8',
      accent: '#2D6EF7',
      accentDeep: '#1B4ED8',
      periwinkle: '#6EA8FF',
      periwinkleSoft: '#0E1930',
      darkInkBtn: '#1B4ED8',
      border: '#1F2330',
      softTint: '#0C1426',
      heroCardBg: '#1B4ED8',
      heroCardSecondary: '#1338A6',
      heroHighlight: '#5A95FF',
      shadowColor: '#000000',
      authGradientBlue: '#0E1930',
      switchTrackOff: '#2B3142',
      textMuted: '#76829A',
      holiday: '#34D399',
      chatBgStops: ['#050811', '#020307', '#000000'],
      waveWarmStops: ['#F5E48A', '#7CC4FF', '#5496FF', '#3B78F5'],
    },
  },
  {
    meta: {
      id: 'midnight',
      label: 'Midnight',
      subtitle: 'Deep aurora & icy cyan',
      previewLight: ['#0E7490', '#38BDF8', '#E2F4F8'],
      previewDark: ['#1289A7', '#4ACCE5', '#0E2633'],
    },
    light: {
      bg: '#F4FAFB',
      card: '#FFFFFF',
      surface: '#E6F3F6',
      text: '#0D1E26',
      muted: '#526A75',
      accent: '#0E7490',
      accentDeep: '#0A556B',
      periwinkle: '#38BDF8',
      periwinkleSoft: '#DFF3F8',
      darkInkBtn: '#0D1E26',
      border: '#D9EBEF',
      softTint: '#E2F4F8',
      heroCardBg: '#0E7490',
      heroCardSecondary: '#0A556B',
      heroHighlight: '#47C4DF',
      shadowColor: '#0A4E61',
      authGradientBlue: '#B2E4F2',
      switchTrackOff: '#BFD4DC',
      textMuted: '#738C98',
      holiday: '#0F766E',
      waveWarmStops: ['#DFB41C', '#4FD1C5', '#22B8CF', '#0E95B0'],
    },
    dark: {
      bg: '#081018',
      card: '#0F1B26',
      surface: '#162533',
      text: '#EFFAFF',
      muted: '#8DA9BA',
      accent: '#1289A7',
      accentDeep: '#0B637A',
      periwinkle: '#4ACCE5',
      periwinkleSoft: '#102B38',
      darkInkBtn: '#0B637A',
      border: '#1E3445',
      softTint: '#0E2633',
      heroCardBg: '#0C6D87',
      heroCardSecondary: '#084F63',
      heroHighlight: '#38B8D4',
      shadowColor: '#073C4D',
      authGradientBlue: '#102B38',
      switchTrackOff: '#2C4659',
      textMuted: '#738FA1',
      holiday: '#2DD4BF',
      waveWarmStops: ['#F5E48C', '#7AE8DF', '#52D4EA', '#2EB4CE'],
    },
  },
  {
    meta: {
      id: 'cyber',
      label: 'Neon Pulse',
      subtitle: 'Electric orchid & ultraviolet',
      previewLight: ['#9C1CB5', '#D972F0', '#F7E7FD'],
      previewDark: ['#BE34D8', '#E082F5', '#291538'],
    },
    light: {
      bg: '#FCF7FE',
      card: '#FFFFFF',
      surface: '#F4E9FA',
      text: '#21102A',
      muted: '#725B7E',
      accent: '#9C1CB5',
      accentDeep: '#76118C',
      periwinkle: '#D972F0',
      periwinkleSoft: '#F6E2FC',
      darkInkBtn: '#21102A',
      border: '#ECDCF4',
      softTint: '#F7E7FD',
      heroCardBg: '#9C1CB5',
      heroCardSecondary: '#76118C',
      heroHighlight: '#DE7AF5',
      shadowColor: '#69127D',
      authGradientBlue: '#E7B8F7',
      switchTrackOff: '#D7C0E2',
      textMuted: '#90779E',
      holiday: '#15803D',
      waveWarmStops: ['#E3A81E', '#F071A8', '#D946EF', '#B128CC'],
    },
    dark: {
      bg: '#0E0914',
      card: '#171022',
      surface: '#211730',
      text: '#FCF5FF',
      muted: '#B09BC0',
      accent: '#BE34D8',
      accentDeep: '#8E1CA8',
      periwinkle: '#E082F5',
      periwinkleSoft: '#2E183D',
      darkInkBtn: '#8E1CA8',
      border: '#322245',
      softTint: '#291538',
      heroCardBg: '#8E1CA8',
      heroCardSecondary: '#6B1280',
      heroHighlight: '#D466EB',
      shadowColor: '#5B1070',
      authGradientBlue: '#2E183D',
      switchTrackOff: '#4D3666',
      textMuted: '#947DA6',
      holiday: '#34D399',
      waveWarmStops: ['#FBE592', '#F79BD0', '#EA78FA', '#CC4CE8'],
    },
  },
  {
    meta: {
      id: 'amber',
      label: 'Honey Gold',
      subtitle: 'Warm saffron & espresso',
      previewLight: ['#9A5B06', '#E5A93B', '#FAF1DC'],
      previewDark: ['#B56D0A', '#EDB54B', '#2E210E'],
    },
    light: {
      bg: '#FDFBF5',
      card: '#FFFFFF',
      surface: '#F5EFE0',
      text: '#241B0D',
      muted: '#736551',
      accent: '#9A5B06',
      accentDeep: '#754303',
      periwinkle: '#E5A93B',
      periwinkleSoft: '#FBF0D6',
      darkInkBtn: '#241B0D',
      border: '#ECE3CE',
      softTint: '#FAF1DC',
      heroCardBg: '#9E5E06',
      heroCardSecondary: '#754303',
      heroHighlight: '#E6AA3C',
      shadowColor: '#6B3E05',
      authGradientBlue: '#F3D698',
      switchTrackOff: '#DACCB2',
      textMuted: '#91826C',
      holiday: '#15803D',
      waveWarmStops: ['#E8BA24', '#E59B28', '#CC7E18', '#B26A0C'],
    },
    dark: {
      bg: '#14100A',
      card: '#1F1910',
      surface: '#2A2216',
      text: '#FFF9EE',
      muted: '#B8A88E',
      accent: '#B56D0A',
      accentDeep: '#8C5205',
      periwinkle: '#EDB54B',
      periwinkleSoft: '#332410',
      darkInkBtn: '#8C5205',
      border: '#3B2F1D',
      softTint: '#2E210E',
      heroCardBg: '#945706',
      heroCardSecondary: '#6E3F04',
      heroHighlight: '#E0A136',
      shadowColor: '#5C3504',
      authGradientBlue: '#332410',
      switchTrackOff: '#57462E',
      textMuted: '#9A8A70',
      holiday: '#34D399',
      waveWarmStops: ['#FFF0A6', '#FAD06E', '#F0B64A', '#D68E22'],
    },
  },
  {
    meta: {
      id: 'sakura',
      label: 'Sakura',
      subtitle: 'Cherry blossom & plum ink',
      previewLight: ['#AD246E', '#F28EC3', '#FBEAF3'],
      previewDark: ['#C9418B', '#F28EC3', '#31192A'],
    },
    light: {
      bg: '#FEF8FB',
      card: '#FFFFFF',
      surface: '#F9ECF3',
      text: '#261320',
      muted: '#7A6071',
      accent: '#AD246E',
      accentDeep: '#841853',
      periwinkle: '#F28EC3',
      periwinkleSoft: '#FCE5F1',
      darkInkBtn: '#261320',
      border: '#F0DFE9',
      softTint: '#FBEAF3',
      heroCardBg: '#AD246E',
      heroCardSecondary: '#841853',
      heroHighlight: '#F088BF',
      shadowColor: '#78164B',
      authGradientBlue: '#F7C1DE',
      switchTrackOff: '#DEC3D3',
      textMuted: '#997D8F',
      holiday: '#15803D',
      danger: '#B93815',
      dangerSoft: '#FDEEE8',
      waveWarmStops: ['#E8B426', '#F492A8', '#E663A0', '#C93E83'],
    },
    dark: {
      bg: '#150E14',
      card: '#20151F',
      surface: '#2A1C29',
      text: '#FFF5FB',
      muted: '#BA9CB1',
      accent: '#C9418B',
      accentDeep: '#992063',
      periwinkle: '#F28EC3',
      periwinkleSoft: '#361B2E',
      darkInkBtn: '#992063',
      border: '#3A2636',
      softTint: '#31192A',
      heroCardBg: '#9C2265',
      heroCardSecondary: '#78174D',
      heroHighlight: '#E873B2',
      shadowColor: '#691342',
      authGradientBlue: '#361B2E',
      switchTrackOff: '#573B51',
      textMuted: '#9C7E93',
      holiday: '#34D399',
      danger: '#FDBA74',
      dangerSoft: '#3A2318',
      waveWarmStops: ['#FCE694', '#FBB5CB', '#F48FC2', '#DE60A3'],
    },
  },
  {
    meta: {
      id: 'matcha',
      label: 'Matcha',
      subtitle: 'Ceremonial tea & warm moss',
      previewLight: ['#46701E', '#8FBF5E', '#ECF5E1'],
      previewDark: ['#598A2B', '#95C765', '#1B2914'],
    },
    light: {
      bg: '#F8FAF4',
      card: '#FFFFFF',
      surface: '#EEF3E6',
      text: '#162012',
      muted: '#5F6E58',
      accent: '#46701E',
      accentDeep: '#335414',
      periwinkle: '#8FBF5E',
      periwinkleSoft: '#E8F3DC',
      darkInkBtn: '#162012',
      border: '#E2EBD6',
      softTint: '#ECF5E1',
      heroCardBg: '#46701E',
      heroCardSecondary: '#335414',
      heroHighlight: '#8BBD5A',
      shadowColor: '#2E4C12',
      authGradientBlue: '#C7E3A8',
      switchTrackOff: '#C6D4B8',
      textMuted: '#7E8F77',
      holiday: '#15803D',
      waveWarmStops: ['#D8B41C', '#9AC958', '#73AD3C', '#568B26'],
    },
    dark: {
      bg: '#0F140D',
      card: '#171F14',
      surface: '#202B1C',
      text: '#F5FAF1',
      muted: '#9EB096',
      accent: '#598A2B',
      accentDeep: '#3E6619',
      periwinkle: '#95C765',
      periwinkleSoft: '#1E2E16',
      darkInkBtn: '#3E6619',
      border: '#2B3B24',
      softTint: '#1B2914',
      heroCardBg: '#41691C',
      heroCardSecondary: '#2F4F12',
      heroHighlight: '#7EB34E',
      shadowColor: '#243D0E',
      authGradientBlue: '#1E2E16',
      switchTrackOff: '#3E5235',
      textMuted: '#81947A',
      holiday: '#34D399',
      waveWarmStops: ['#F4E890', '#B3DF7A', '#8ECA56', '#72AA3D'],
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
    chatBgStops:
      seed.chatBgStops ??
      (isDarkMode
        ? [
            mixColors(palette.softViolet, palette.bg, 0.35),
            mixColors(palette.surface, palette.bg, 0.72),
            palette.bg,
          ]
        : [
            mixColors(palette.softViolet, palette.bg, 0.15),
            mixColors(palette.softViolet, palette.bg, 0.65),
            palette.bg,
          ]),
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
