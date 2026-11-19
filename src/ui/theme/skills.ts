import {useSchedulePalette} from '../screens/calendar/components/schedulePalette';

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
export const useSkillsPalette = useSchedulePalette;
