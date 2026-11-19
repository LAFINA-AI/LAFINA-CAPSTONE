import {useThemedStyles} from './createThemedStyles';
import type {ThemedStyleMeta} from './createThemedStyles';
import type {ThemeColors} from './palettes';
import {mixColors} from './colorMix';

/** Reference dimensions are dp; colors follow the active app palette. */
export const SkillFonts = {
  body: 'Lexend400',
  medium: 'Lexend500',
  semibold: 'Lexend600',
  bold: 'Lexend700',
} as const;
export const SkillMotion = {
  entry: 450,
  hubEntry: 550,
  flip: 550,
  draw: 350,
  stagger: 30,
};
const luminance = (hex: string): number => {
  const digits = hex.replace('#', '');
  if (digits.length !== 6) return 0;
  const rgb = [0, 2, 4]
    .map(i => parseInt(digits.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
export const skillContrast = (a: string, b: string) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
export function skillInk(
  color: string,
  background: string | readonly string[],
): string {
  const backgrounds =
    typeof background === 'string' ? [background] : background;
  const readable = (ink: string) =>
    backgrounds.every(bg => skillContrast(ink, bg) >= 4.5);
  if (readable(color)) return color;
  const target = luminance(backgrounds[0]) > 0.18 ? '#000000' : '#FFFFFF';
  for (let i = 1; i <= 20; i++) {
    const next = mixColors(target, color, i / 20);
    if (readable(next)) return next;
  }
  return target;
}
function getSkillsStyles(
  colors: ThemeColors,
  isDarkMode: boolean,
  modern: ThemedStyleMeta,
) {
  const m = modern.modernPalette;
  const bg = modern.isModern ? m.bg : colors.background;
  const card = modern.isModern ? m.card : colors.cardBg;
  const surface = modern.isModern ? m.surface : colors.divider;
  const text = modern.isModern ? m.text : colors.textPrimary;
  const muted = modern.isModern ? m.muted : colors.textSecondary;
  const accent = modern.isModern ? m.accent : colors.primary;
  const border = modern.isModern ? m.border : colors.border;
  const peach = modern.isModern || !isDarkMode ? m.peach : colors.cardBg;
  const mint = modern.isModern || !isDarkMode ? m.mint : colors.cardBg;
  const blueSoft = modern.isModern || !isDarkMode ? m.blueSoft : colors.cardBg;
  const mintInk = m.mintInk,
    peachInk = m.peachInk;
  const dangerSoft = modern.isModern
    ? m.dangerSoft
    : isDarkMode
    ? colors.cardBg
    : m.dangerSoft;
  const danger = colors.error;

  const backgrounds = [card, surface, bg];
  const action = skillInk(accent, backgrounds);
  return {
    palette: {
      bg,
      card,
      surface,
      text: skillInk(text, backgrounds),
      muted: skillInk(muted, backgrounds),
      accent: action,
      onAccent: skillContrast('#FFFFFF', action) >= 4.5 ? '#FFFFFF' : '#14142B',
      darkInkBtn: mixColors(accent, '#121022', 0.2),
      border,
      peach,
      mint,
      blueSoft,
      mintInk: skillInk(mintInk, backgrounds),
      peachInk: skillInk(peachInk, backgrounds),
      dangerSoft,
      danger: skillInk(danger, backgrounds),
      isDarkMode,
    },
  };
}
export function useSkillsPalette() {
  return useThemedStyles(getSkillsStyles).palette;
}
