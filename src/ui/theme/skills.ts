import {useSchedulePalette} from '../screens/calendar/components/schedulePalette';
import {mixColors} from './colorMix';
import {useMemo} from 'react';

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
export function skillInk(color: string, background: string): string {
  if (skillContrast(color, background) >= 4.5) return color;
  const target = luminance(background) > 0.18 ? '#000000' : '#FFFFFF';
  for (let i = 1; i <= 20; i++) {
    const next = mixColors(target, color, i / 20);
    if (skillContrast(next, background) >= 4.5) return next;
  }
  return target;
}
export function useSkillsPalette() {
  const palette = useSchedulePalette();
  const {
    bg,
    card,
    surface,
    text,
    muted,
    accent,
    border,
    peach,
    mint,
    blueSoft,
    mintInk,
    peachInk,
    dangerSoft,
    danger,
    isDarkMode,
  } = palette;
  return useMemo(() => {
    const action = skillInk(accent, card);
    return {
      bg,
      card,
      surface,
      text,
      muted: skillInk(muted, card),
      accent: action,
      onAccent: skillContrast('#FFFFFF', action) >= 4.5 ? '#FFFFFF' : '#14142B',
      darkInkBtn: mixColors(accent, '#121022', 0.2),
      border,
      peach,
      mint,
      blueSoft,
      mintInk: skillInk(mintInk, card),
      peachInk: skillInk(peachInk, card),
      dangerSoft,
      danger: skillInk(danger, card),
      isDarkMode,
    };
  }, [
    bg,
    card,
    surface,
    text,
    muted,
    accent,
    border,
    peach,
    mint,
    blueSoft,
    mintInk,
    peachInk,
    dangerSoft,
    danger,
    isDarkMode,
  ]);
}
