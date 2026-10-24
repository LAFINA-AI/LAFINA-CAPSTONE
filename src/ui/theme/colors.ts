/**
 * Brand color palette — these are constants, not theme-dependent.
 * Theme-dependent colors are defined in ThemeContext.tsx as ThemeColors.
 */
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
