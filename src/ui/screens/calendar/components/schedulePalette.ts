import {Platform} from 'react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {ModernShadows} from '../../../theme';

export interface SchedulePalette {
  bg: string;
  card: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  darkInkBtn: string;
  border: string;
  peach: string;
  mint: string;
  blueSoft: string;
  mintInk: string;
  peachInk: string;
  dangerSoft: string;
  danger: string;
  isDarkMode: boolean;
}

export function useSchedulePalette(): SchedulePalette {
  const {colors, isDarkMode, isModern, modernPalette} = useTheme();

  if (isModern) {
    return {
      bg: modernPalette.bg,
      card: modernPalette.card,
      surface: modernPalette.surface,
      text: modernPalette.text,
      muted: modernPalette.muted,
      accent: modernPalette.accent,
      darkInkBtn: modernPalette.darkInkBtn,
      border: modernPalette.border,
      peach: modernPalette.peach,
      mint: modernPalette.mint,
      blueSoft: modernPalette.blueSoft,
      mintInk: modernPalette.mintInk,
      peachInk: modernPalette.peachInk,
      dangerSoft: modernPalette.dangerSoft,
      danger: colors.error,
      isDarkMode,
    };
  }

  return {
    bg: colors.background,
    card: colors.cardBg,
    surface: colors.divider,
    text: colors.textPrimary,
    muted: colors.textSecondary,
    accent: colors.primary,
    darkInkBtn: colors.textPrimary,
    border: colors.border,
    peach: isDarkMode ? colors.cardBg : modernPalette.peach,
    mint: isDarkMode ? colors.cardBg : modernPalette.mint,
    blueSoft: isDarkMode ? colors.cardBg : modernPalette.blueSoft,
    mintInk: modernPalette.mintInk,
    peachInk: modernPalette.peachInk,
    dangerSoft: isDarkMode ? colors.cardBg : modernPalette.dangerSoft,
    danger: colors.error,
    isDarkMode,
  };
}

export const scheduleCardShadow = Platform.select({
  ios: ModernShadows.card,
  android: {
    elevation: 2,
    shadowColor: '#000000',
  },
  default: ModernShadows.card,
});
