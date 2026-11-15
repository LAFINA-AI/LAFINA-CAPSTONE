import type {ViewStyle, TextStyle} from 'react-native';
import type {UIVariant} from '../../storage/uiVariantStore';
import {
  getModernPalette,
  getModernThemeExtras,
  getModernThemeMeta,
  MODERN_THEMES,
  modernDarkPalette,
  modernDarkThemeColors,
  modernLightPalette,
  modernLightThemeColors,
  type ModernPalette,
  type ModernThemeExtras,
  type ModernThemeId,
  type ModernThemeMeta,
} from './palettes';
import {Fonts} from './typography';

export type {
  ModernPalette,
  ModernThemeExtras,
  ModernThemeId,
  ModernThemeMeta,
  UIVariant,
};
export {
  getModernPalette,
  getModernThemeExtras,
  getModernThemeMeta,
  MODERN_THEMES,
  modernDarkPalette,
  modernDarkThemeColors,
  modernLightPalette,
  modernLightThemeColors,
};

/**
 * UniGuide-inspired Modern Design System tokens (audited from TeamOnlyPrompts/UniGuide-Mobile).
 * Preserves LAFINA's identity and semantics while providing light/dark pastel bento surfaces,
 * indigo/violet accents, 24px cards, 28px sheets, and 999px pills.
 *
 * Color palettes are sourced from `./palettes.ts`.
 */
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

export type ModernShadowSet = Record<'card' | 'floating' | 'subtle', ViewStyle>;

/** Builds elevation/shadow presets tinted to the active Modern color theme. */
export const getModernShadows = (
  shadowColor: string = '#4C379A',
): ModernShadowSet => ({
  card: {
    shadowColor,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  floating: {
    shadowColor,
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  subtle: {
    shadowColor,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
});

export const ModernShadows: ModernShadowSet = getModernShadows('#4C379A');

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
