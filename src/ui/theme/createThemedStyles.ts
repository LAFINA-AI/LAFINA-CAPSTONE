import {useMemo} from 'react';
import {useTheme} from '../contexts/ThemeContext';
import type {ModernPalette, ThemeColors} from './palettes';

export interface ThemedStyleMeta {
  isModern: boolean;
  modernPalette: ModernPalette;
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
  const {colors, isDarkMode, isModern, modernPalette} = useTheme();
  return useMemo(
    () => styleFactory(colors, isDarkMode, {isModern, modernPalette}),
    [colors, isDarkMode, isModern, modernPalette, styleFactory],
  );
};

/** Re-export for backwards compatibility */
export {useThemedStyles as createThemedStyles};
