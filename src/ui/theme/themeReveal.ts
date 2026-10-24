import { NativeModules } from 'react-native';

/**
 * Circular reveal for theme changes, as on the desktop app: the new theme
 * wipes in as a growing circle from the control that was tapped.
 */

export interface ThemeRevealOrigin {
  x: number;
  y: number;
}

interface LafinaThemeRevealModule {
  capture: (x: number, y: number) => Promise<boolean>;
  reveal: () => Promise<boolean>;
}

const nativeReveal = (): LafinaThemeRevealModule | null => {
  const module = NativeModules.LafinaThemeReveal as
    | Partial<LafinaThemeRevealModule>
    | undefined;
  return module?.capture && module.reveal
    ? (module as LafinaThemeRevealModule)
    : null;
};

/** False in an APK without the native side, and in tests: the theme then simply switches. */
export const isThemeRevealAvailable = (): boolean => nativeReveal() !== null;

/**
 * Covers the window with a picture of the current theme.
 */
export const captureForReveal = async (
  origin?: ThemeRevealOrigin | null,
): Promise<boolean> => {
  const module = nativeReveal();
  if (!module) return false;
  const usable = origin && Number.isFinite(origin.x) && Number.isFinite(origin.y);
  try {
    return await module.capture(usable ? origin.x : -1, usable ? origin.y : -1);
  } catch {
    return false;
  }
};

/** Opens the circle from the captured origin, uncovering the new theme. */
export const revealNewTheme = (): void => {
  void nativeReveal()
    ?.reveal()
    .catch(() => undefined);
};
