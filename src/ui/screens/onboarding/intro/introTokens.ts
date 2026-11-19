import type {TextStyle} from 'react-native';
import {Fonts} from '../../../theme';

/**
 * Values for the introduction, copied from the design prototype
 * (docs/design/onboarding/LAFINA Introduction.html, a 390×844 frame).
 * CSS px are used 1:1 as dp. The app's own font families are kept:
 * weight 400 uses the body family, 500–700 the heading family.
 */
export const IntroColors = {
  brand: '#5442E0',
  brandDeep: '#3B2CB8',
  brandInk: '#4433C9',
  orbitFill: '#6A5AE8',
  ink: '#14142B',
  muted: '#626277',
  body: '#5E5E73',
  bg: '#FAFAFD',
  paper: '#FFFFFF',
  line: '#ECEBF4',
  rail: '#E4E2F0',
  divider: '#F0EFF6',
  chip: '#F2F1F9',
  lavender: '#EEECFD',
  lilac: '#C9C2F7',
  teal: '#0F8A7C',
  green: '#1F8A5B',
  greenInk: '#1A7550',
  greenSoft: '#E5F5EC',
  phoneEdge: '#DAD9E6',
  dashed: '#B9B8CC',
  cloud: '#7A7A90',
  march: '#A9A8BE',
  dotDone: '#B7AEF5',
  dotTodo: '#DCDCE6',
  white: '#FFFFFF',
  whiteLine: 'rgba(255,255,255,.35)',
  whiteSoft: 'rgba(255,255,255,.16)',
  whiteText: 'rgba(255,255,255,.9)',
  highlight: 'rgba(255,255,255,.28)',
} as const;

/** CSS box-shadow strings, passed to React Native's `boxShadow` style. */
export const IntroShadows = {
  card: '0 16px 40px rgba(38,28,120,.08)',
  cardStrong: '0 16px 40px rgba(38,28,120,.1)',
  doc: '0 12px 28px rgba(38,28,120,.08)',
  phone: '0 18px 40px rgba(38,28,120,.10)',
  drop: '0 18px 40px rgba(38,28,120,.14)',
  // Slide 1's notification is light (owner request), so it uses a brand-tinted shadow.
  notice: '0 14px 32px rgba(38,28,120,.14)',
  darkPill: '0 10px 24px rgba(20,20,43,.25)',
  lightPill: '0 8px 20px rgba(38,28,120,.08)',
  cta: '0 8px 20px rgba(84,66,224,.28)',
  halo: '0 0 0 4px #FFFFFF',
  scan: '0 0 12px 2px rgba(84,66,224,.45)',
} as const;

type Weight = 400 | 500 | 600 | 700;

/** Font size + weight using the app's existing families. */
export const introFont = (size: number, weight: Weight = 400): TextStyle =>
  weight === 400
    ? {fontFamily: Fonts.body, fontSize: size}
    : {
        fontFamily: Fonts.heading,
        fontSize: size,
        fontWeight: String(weight) as TextStyle['fontWeight'],
      };

/** CSS `em` letter-spacing → dp. */
export const em = (size: number, value: number): number =>
  Math.round(size * value * 100) / 100;

/** Design frame (px = dp). */
export const FRAME_WIDTH = 390;
export const WELCOME_HERO_HEIGHT = 430;
export const SLIDE_STAGE_HEIGHT = 380;

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "Thursday · Nov 20" for the phone's current date. */
export const formatIntroToday = (now: Date = new Date()): string =>
  `${WEEKDAYS[now.getDay()]} · ${MONTHS[now.getMonth()]} ${now.getDate()}`;

/** Weekday name for the sample deadline, two days from today. */
export const introDeadlineWeekday = (now: Date = new Date()): string =>
  WEEKDAYS[(now.getDay() + 2) % 7];
