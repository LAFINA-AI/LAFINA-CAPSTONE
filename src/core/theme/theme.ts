import type {Preferences} from '../domain/preferences';

const light = {
  // Warm canvas and neutral cards adapted from the incoming LAFINA UI.
  // Retain accessible foreground/accent pairs rather than its low-contrast red.
  background: '#FAF9F7',
  surface: '#FFFFFF',
  text: '#252329',
  muted: '#615D66',
  primary: '#CC3747',
  onPrimary: '#FFFFFF',
  border: '#D7D1D4',
  selected: '#FCE6EB',
  danger: '#A6142B',
  field: '#FFFFFF',
  disabled: '#EBE6E8',
  accent: '#F75A5A',
  brand: '#E6003A',
  onBrand: '#FFFFFF',
  shadow: '#000000',
  timeline: '#FCF5F2',
  timelineLine: '#ECE6E3',
  subtle: '#F0F0F0',
  profileStart: '#FFE082',
  profileMid: '#FF8B80',
  profileEnd: '#C66BB2',
};
const dark: typeof light = {
  background: '#121212',
  surface: '#1C1C1E',
  text: '#F9F5F7',
  muted: '#C3BDC6',
  primary: '#FF9AB0',
  onPrimary: '#3C0011',
  border: '#665D68',
  selected: '#4C2431',
  danger: '#FFB0B8',
  field: '#1C1C1E',
  disabled: '#37313A',
  accent: '#FF8F96',
  brand: '#E6003A',
  onBrand: '#FFFFFF',
  shadow: '#000000',
  timeline: '#211B1D',
  timelineLine: '#363034',
  subtle: '#29272C',
  profileStart: '#B77B2B',
  profileMid: '#B73F61',
  profileEnd: '#884895',
};
export const spacing = {xs: 4, sm: 8, md: 16, lg: 24, xl: 32} as const;
export const typography = {
  body: 16,
  small: 14,
  title: 28,
  heading: 20,
  section: 18,
  label: 16,
  caption: 12,
  display: 32,
} as const;
export const dimensions = {
  control: 48,
  radius: 12,
  navigationRadius: 36,
  border: 1,
  contentMax: 640,
  tabBarHeight: 76,
  microphone: 64,
  cardRadius: 20,
} as const;

export interface Theme {
  dark: boolean;
  colors: typeof light;
}
export function resolveTheme(
  preference: Preferences['theme'],
  system: string | null | undefined,
): Theme {
  const isDark =
    preference === 'dark' || (preference === 'system' && system === 'dark');
  return {dark: isDark, colors: isDark ? dark : light};
}
