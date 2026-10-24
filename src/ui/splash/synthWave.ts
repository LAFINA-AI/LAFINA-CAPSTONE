/**
 * The splash's voice: the LAFINA mark, synthesised live.
 */

export interface SplashTiming {
  introMs: number;
  minVoiceMs: number;
  settleMs: number;
  releaseMs: number;
}

export const SPLASH_TIMING: SplashTiming = {
  introMs: 480,
  minVoiceMs: 620,
  settleMs: 300,
  releaseMs: 340,
};

export const REDUCED_MOTION_TIMING: SplashTiming = {
  introMs: 0,
  minVoiceMs: 350,
  settleMs: 0,
  releaseMs: 200,
};

export type SplashPhase = 'intro' | 'voice' | 'settle' | 'release' | 'done';

export interface SplashMoment {
  phase: SplashPhase;
  progress: number;
}

export const splashExitStart = (
  readyAtMs: number | null,
  timing: SplashTiming = SPLASH_TIMING,
): number | null =>
  readyAtMs === null
    ? null
    : Math.max(readyAtMs, timing.introMs + timing.minVoiceMs);

export const splashDoneAt = (
  readyAtMs: number | null,
  timing: SplashTiming = SPLASH_TIMING,
): number | null => {
  const exit = splashExitStart(readyAtMs, timing);
  return exit === null ? null : exit + timing.settleMs + timing.releaseMs;
};

export const splashMomentAt = (
  elapsedMs: number,
  readyAtMs: number | null,
  timing: SplashTiming = SPLASH_TIMING,
): SplashMoment => {
  const elapsed = Math.max(0, elapsedMs);
  if (elapsed < timing.introMs) {
    return { phase: 'intro', progress: elapsed / timing.introMs };
  }
  const exit = splashExitStart(readyAtMs, timing);
  if (exit === null || elapsed < exit) return { phase: 'voice', progress: 0 };
  const since = elapsed - exit;
  if (since < timing.settleMs) {
    return { phase: 'settle', progress: since / timing.settleMs };
  }
  if (since < timing.settleMs + timing.releaseMs) {
    return {
      phase: 'release',
      progress: (since - timing.settleMs) / timing.releaseMs,
    };
  }
  return { phase: 'done', progress: 1 };
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
export const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;
export const easeInOutCubic = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

export interface SplashLook {
  reveal: number;
  amplitude: number;
  stretch: number;
  opacity: number;
}

export const splashLookAt = ({ phase, progress }: SplashMoment): SplashLook => {
  switch (phase) {
    case 'intro':
      return {
        reveal: easeOutCubic(progress / 0.7),
        amplitude: easeOutCubic((progress - 0.3) / 0.7),
        stretch: 1,
        opacity: 1,
      };
    case 'voice':
      return { reveal: 1, amplitude: 1, stretch: 1, opacity: 1 };
    case 'settle':
      return {
        reveal: 1,
        amplitude: 1 - easeInOutCubic(progress),
        stretch: 1,
        opacity: 1,
      };
    case 'release':
      return {
        reveal: 1,
        amplitude: 0,
        stretch: 1 + 1.6 * easeInOutCubic(progress),
        opacity: 1 - easeInOutCubic(progress),
      };
    default:
      return { reveal: 1, amplitude: 0, stretch: 2.6, opacity: 0 };
  }
};

const TAU = Math.PI * 2;
export const VOICE_FLOOR = 0.38;
export const VOICE_BREATH_AFTER_S = 2.4;
const HEIGHT_GAIN = 1.15;

export const voiceLevelAt = (seconds: number): number => {
  const syllables =
    0.74 +
    0.2 * Math.sin(TAU * 3.1 * seconds) +
    0.13 * Math.sin(TAU * 5.3 * seconds + 1.2) +
    0.09 * Math.sin(TAU * 1.7 * seconds + 0.4);
  const breath =
    seconds > VOICE_BREATH_AFTER_S && Math.sin(TAU * 0.43 * seconds + 0.9) < -0.9
      ? 0.55
      : 1;
  const vibrato = 1 + 0.035 * Math.sin(TAU * 6.4 * seconds);
  return Math.min(1, Math.max(VOICE_FLOOR, syllables * breath * vibrato));
};

const bump = (x: number, centre: number, width: number): number =>
  Math.exp(-(((x - centre) / width) ** 2));

export const envelopeAt = (x: number, seconds: number): number => {
  if (x <= 0 || x >= 1) return 0;
  const pinch = Math.sin(Math.PI * x) ** 1.4;
  const vowel = 0.5 + 0.5 * Math.sin(TAU * 0.9 * seconds + 0.7);
  const low = bump(x, 0.36 + 0.07 * Math.sin(TAU * 0.37 * seconds), 0.13);
  const high = bump(
    x,
    0.67 + 0.06 * Math.sin(TAU * 0.53 * seconds + 2.1),
    0.11,
  );
  const body = bump(x, 0.5, 0.24);
  const shaped =
    (0.45 + 0.55 * vowel) * low + (1 - 0.45 * vowel) * high + 0.3 * body;
  return pinch * Math.min(1, shaped);
};

export const STRAND_COUNT = 18;

export const strandHeightAt = (
  x: number,
  strand: number,
  seconds: number,
  amplitude: number,
): number => {
  if (amplitude <= 0) return 0;
  const phase = TAU * 7.2 * x - TAU * 1.6 * seconds;
  const turn = TAU * 1.4 * x + TAU * 0.35 * seconds;
  const offset = strand * Math.sin(turn) * 0.95;
  const carrier =
    (Math.sin(phase + offset) +
      0.28 * Math.sin(2 * phase + 0.9 + offset * 1.6) +
      0.06 * Math.sin(3.1 * phase + 2.2)) /
    1.34;
  const edge = 1 - 0.18 * strand * strand;
  const loudness = amplitude * voiceLevelAt(seconds);
  const envelope = envelopeAt(x, seconds);
  const fan = strand * 0.075 * envelope * Math.cos(turn);
  const height = loudness * (HEIGHT_GAIN * envelope * carrier * edge + fan);
  return Math.max(-1, Math.min(1, height));
};

export const DARK_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0.0, '#fbf295'],
  [0.22, '#fbdb8c'],
  [0.4, '#f39397'],
  [0.5, '#f1788b'],
  [0.6, '#e9bccd'],
  [0.72, '#d2a9dc'],
  [0.84, '#bcaff0'],
  [1.0, '#7360f4'],
];

export const LIGHT_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0.0, '#d9b400'],
  [0.22, '#ee9a1c'],
  [0.4, '#e8505f'],
  [0.5, '#de3a6d'],
  [0.6, '#c35aa6'],
  [0.72, '#9d63d6'],
  [0.84, '#7b5ee8'],
  [1.0, '#4b34e0'],
];
