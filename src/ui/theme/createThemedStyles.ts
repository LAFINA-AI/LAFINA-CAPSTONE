import {useMemo} from 'react';
import {useTheme} from '../contexts/ThemeContext';
import type {ModernShadowSet} from './modern';
import type {ModernPalette, ModernThemeId, ThemeColors} from './palettes';

export interface ThemedStyleMeta {
  isModern: boolean;
  modernPalette: ModernPalette;
  modernTheme: ModernThemeId;
  modernShadows: ModernShadowSet;
}

/**
 * Builds the colour-dependent half of a component's styles, once per theme/variant.
 *
 * **The factory must be defined at module level.**
 */
export const useThemedStyles = <T extends Record<string, object>>(
  styleFactory: (
    colors: ThemeColors,
    isDarkMode: boolean,
    modern: ThemedStyleMeta,
  ) => T,
): T => {
  const {
    colors,
    isDarkMode,
    isModern,
    modernPalette,
    modernTheme,
    modernShadows,
  } = useTheme();
  return useMemo(
    () =>
      styleFactory(colors, isDarkMode, {
        isModern,
        modernPalette,
        modernTheme,
        modernShadows,
      }),
    [
      colors,
      isDarkMode,
      isModern,
      modernPalette,
      modernTheme,
      modernShadows,
      styleFactory,
    ],
  );
};

/** Re-export for backwards compatibility */
export {useThemedStyles as createThemedStyles};
