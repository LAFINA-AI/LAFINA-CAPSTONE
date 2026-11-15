import type {ViewStyle, TextStyle} from 'react-native';
import type {UIVariant} from '../../storage/uiVariantStore';
import type {ThemeColors} from '../contexts/ThemeContext';
import {Fonts} from './typography';

export type {UIVariant};

/**
 * UniGuide-inspired Modern Design System tokens (audited from TeamOnlyPrompts/UniGuide-Mobile).
 * Preserves LAFINA's identity and semantics while providing light/dark pastel bento surfaces,
 * indigo/violet accents, 24px cards, 28px sheets, and 999px pills.
 */
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
 * while leaving Classic `lightColors` / `darkColors` completely untouched.
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

export const ModernLayout = {
  borderRadiusCard: 24,
  borderRadiusSheet: 28,
  borderRadiusSubCard: 18,
  borderRadiusInput: 16,
  borderRadiusButton: 999,
  borderRadiusPill: 999,
  cardPadding: 18,
  screenPadding: 16,
  navbarContentHeight: 66,
  navbarTopRadius: 24,
  navbarNotchHalf: 46,
  navbarNotchDepth: 30,
  centerFabSize: 58,
} as const;

export const ModernShadows: Record<'card' | 'floating' | 'subtle', ViewStyle> =
  {
    card: {
      shadowColor: '#4C379A',
      shadowOffset: {width: 0, height: 8},
      shadowOpacity: 0.08,
      shadowRadius: 18,
      elevation: 3,
    },
    floating: {
      shadowColor: '#4C379A',
      shadowOffset: {width: 0, height: 10},
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 8,
    },
    subtle: {
      shadowColor: '#4C379A',
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 1,
    },
  };

export const ModernTypography: Record<
  | 'hero'
  | 'title'
  | 'sectionTitle'
  | 'cardTitle'
  | 'body'
  | 'caption'
  | 'overline',
  TextStyle
> = {
  hero: {
    fontFamily: Fonts.heading,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  cardTitle: {
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
    lineHeight: 20,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  caption: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  overline: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
};

export const getModernPalette = (isDarkMode: boolean): ModernPalette =>
  isDarkMode ? modernDarkPalette : modernLightPalette;
