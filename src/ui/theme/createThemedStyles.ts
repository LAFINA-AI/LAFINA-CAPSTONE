import { useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';

/**
 * Builds the colour-dependent half of a component's styles, once per theme.
 *
 * **The factory must be defined at module level.**
 */
export const useThemedStyles = <T extends Record<string, object>>(
  styleFactory: (colors: ThemeColors, isDarkMode: boolean) => T,
): T => {
  const { colors, isDarkMode } = useTheme();
  return useMemo(
    () => styleFactory(colors, isDarkMode),
    [colors, isDarkMode, styleFactory],
  );
};

/** Re-export for backwards compatibility */
export { useThemedStyles as createThemedStyles };
