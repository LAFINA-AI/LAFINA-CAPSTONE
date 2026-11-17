/**
 * Typed wrapper around the `LafinaFloatingAssistant` native module
 * (Floating LAFINA, ADR-036). Every call resolves to a safe default when the
 * module is missing (Jest, iOS, an older build) or throws, so callers never
 * crash on it and the rest of LAFINA keeps working.
 */
import {NativeModules, Platform} from 'react-native';

export interface FloatingAssistantStatus {
  /** False where the overlay permission cannot be granted (Android Go / low-RAM). */
  supported: boolean;
  overlayGranted: boolean;
  notificationsGranted: boolean;
  /** Native mirror of the per-user setting. */
  enabled: boolean;
  /** The service (and so the orb) is running. */
  running: boolean;
  /** Hidden with the drag target or the notification until LAFINA is opened. */
  hiddenUntilAppOpen: boolean;
  /** An orb tap once failed to open Quick Chat (OEM restriction). */
  launchBlockedSeen: boolean;
  lowRamDevice: boolean;
}

export const UNAVAILABLE_STATUS: FloatingAssistantStatus = Object.freeze({
  supported: false,
  overlayGranted: false,
  notificationsGranted: false,
  enabled: false,
  running: false,
  hiddenUntilAppOpen: false,
  launchBlockedSeen: false,
  lowRamDevice: false,
});

export type OrbStyle = 'handle' | 'bubble';
export type OrbSize = 'small' | 'medium' | 'large';
export type OrbSide = 'left' | 'right';

/** How the floating button looks and behaves (device-local, like its position). */
export interface OrbCustomization {
  style: OrbStyle;
  size: OrbSize;
  side: OrbSide;
  /** Opacity while idle, 20–100 percent. */
  idleOpacity: number;
  /** `'theme'` follows the app's colour; otherwise `#RRGGBB`. */
  color: string;
  /** Bubble only: slide half off the screen while idle. */
  tuckWhenIdle: boolean;
  lockPosition: boolean;
  /** Step aside while another app is full screen. */
  hideInFullscreen: boolean;
}

export const DEFAULT_ORB_CUSTOMIZATION: OrbCustomization = Object.freeze({
  style: 'handle',
  size: 'medium',
  side: 'right',
  idleOpacity: 60,
  color: 'theme',
  tuckWhenIdle: true,
  lockPosition: false,
  hideInFullscreen: true,
});

export const ORB_OPACITY_CHOICES = [30, 50, 75, 100] as const;

/** Colour swatches offered in settings (`theme` first). */
export const ORB_COLOR_CHOICES: ReadonlyArray<{value: string; label: string}> =
  [
    {value: 'theme', label: 'App theme'},
    {value: '#FFFFFF', label: 'White'},
    {value: '#9E9E9E', label: 'Grey'},
    {value: '#B8002E', label: 'LAFINA red'},
    {value: '#1E88E5', label: 'Blue'},
    {value: '#2E7D32', label: 'Green'},
    {value: '#7B1FA2', label: 'Purple'},
    {value: '#212121', label: 'Black'},
  ];

const STYLES: readonly OrbStyle[] = ['handle', 'bubble'];
const SIZES: readonly OrbSize[] = ['small', 'medium', 'large'];
const SIDES: readonly OrbSide[] = ['left', 'right'];
const HEX = /^#[0-9a-fA-F]{6}$/;

const validOpacity = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 20 &&
  value <= 100;

const validColor = (value: unknown): value is string =>
  value === 'theme' || (typeof value === 'string' && HEX.test(value));

/** Every field checked; anything missing or invalid takes the default. */
export const normalizeOrbCustomization = (
  raw: Partial<Record<keyof OrbCustomization, unknown>> | null | undefined,
): OrbCustomization => {
  const d = DEFAULT_ORB_CUSTOMIZATION;
  if (!raw || typeof raw !== 'object') return {...d};
  const pick = <T>(list: readonly T[], value: unknown, fallback: T): T =>
    list.includes(value as T) ? (value as T) : fallback;
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;
  return {
    style: pick(STYLES, raw.style, d.style),
    size: pick(SIZES, raw.size, d.size),
    side: pick(SIDES, raw.side, d.side),
    idleOpacity: validOpacity(raw.idleOpacity)
      ? Math.round(raw.idleOpacity)
      : d.idleOpacity,
    color: validColor(raw.color)
      ? raw.color === 'theme'
        ? 'theme'
        : raw.color.toUpperCase()
      : d.color,
    tuckWhenIdle: bool(raw.tuckWhenIdle, d.tuckWhenIdle),
    lockPosition: bool(raw.lockPosition, d.lockPosition),
    hideInFullscreen: bool(raw.hideInFullscreen, d.hideInFullscreen),
  };
};

/** True when every key in [changes] has a valid value. */
export const isValidOrbChange = (changes: Partial<OrbCustomization>): boolean =>
  Object.entries(changes).every(([key, value]) => {
    switch (key as keyof OrbCustomization) {
      case 'style':
        return STYLES.includes(value as OrbStyle);
      case 'size':
        return SIZES.includes(value as OrbSize);
      case 'side':
        return SIDES.includes(value as OrbSide);
      case 'idleOpacity':
        return validOpacity(value);
      case 'color':
        return validColor(value);
      case 'tuckWhenIdle':
      case 'lockPosition':
      case 'hideInFullscreen':
        return typeof value === 'boolean';
      default:
        return false;
    }
  });

interface NativeFloatingAssistant {
  getOrbCustomization?: () => Promise<Partial<OrbCustomization> | null>;
  setOrbCustomization?: (
    changes: Partial<OrbCustomization>,
  ) => Promise<Partial<OrbCustomization> | null>;
  resetOrbCustomization?: () => Promise<Partial<OrbCustomization> | null>;
  getStatus?: () => Promise<Partial<FloatingAssistantStatus> | null>;
  openOverlaySettings?: () => Promise<void> | void;
  openAppDetailsSettings?: () => Promise<void> | void;
  setEnabled?: (
    enabled: boolean,
    ownerId: string | null,
  ) => Promise<Partial<FloatingAssistantStatus> | null>;
  setOrbAppearance?: (appearance: {color: string}) => Promise<void> | void;
  resetOrbPosition?: () => Promise<void> | void;
  closeQuickChat?: () => Promise<void> | void;
  openMainApp?: () => Promise<void> | void;
}

const getModule = (): NativeFloatingAssistant | null => {
  if (Platform.OS !== 'android') return null;
  const module = (NativeModules as Record<string, unknown>)
    .LafinaFloatingAssistant as NativeFloatingAssistant | undefined;
  return module ?? null;
};

const toStatus = (
  raw: Partial<FloatingAssistantStatus> | null | undefined,
): FloatingAssistantStatus => {
  if (!raw || typeof raw !== 'object') return {...UNAVAILABLE_STATUS};
  const flag = (key: keyof FloatingAssistantStatus): boolean =>
    raw[key] === true;
  return {
    supported: flag('supported'),
    overlayGranted: flag('overlayGranted'),
    notificationsGranted: flag('notificationsGranted'),
    enabled: flag('enabled'),
    running: flag('running'),
    hiddenUntilAppOpen: flag('hiddenUntilAppOpen'),
    launchBlockedSeen: flag('launchBlockedSeen'),
    lowRamDevice: flag('lowRamDevice'),
  };
};

/** Calls a void native method. False when it is missing or fails. */
const invoke = async (
  name: keyof NativeFloatingAssistant,
  ...args: unknown[]
): Promise<boolean> => {
  const module = getModule();
  const method = module?.[name] as
    | ((...methodArgs: unknown[]) => unknown)
    | undefined;
  if (!module || typeof method !== 'function') return false;
  try {
    await method.apply(module, args);
    return true;
  } catch (error) {
    console.warn(`[floatingAssistant] ${name} failed:`, error);
    return false;
  }
};

export const floatingAssistantNative = {
  /** True when the native module exists in this build. */
  isAvailable(): boolean {
    return getModule() !== null;
  },

  async getStatus(): Promise<FloatingAssistantStatus> {
    const module = getModule();
    if (!module?.getStatus) return {...UNAVAILABLE_STATUS};
    try {
      return toStatus(await module.getStatus());
    } catch (error) {
      console.warn('[floatingAssistant] getStatus failed:', error);
      return {...UNAVAILABLE_STATUS};
    }
  },

  /** Starts or stops the orb. Starting only works while LAFINA is visible. */
  async setEnabled(
    enabled: boolean,
    ownerId: string | null,
  ): Promise<FloatingAssistantStatus> {
    const module = getModule();
    if (!module?.setEnabled) return {...UNAVAILABLE_STATUS};
    try {
      return toStatus(await module.setEnabled(enabled, ownerId));
    } catch (error) {
      console.warn('[floatingAssistant] setEnabled failed:', error);
      return floatingAssistantNative.getStatus();
    }
  },

  /** Android's "Display over other apps" list (the user finds LAFINA there). */
  openOverlaySettings(): Promise<boolean> {
    return invoke('openOverlaySettings');
  },

  openAppDetailsSettings(): Promise<boolean> {
    return invoke('openAppDetailsSettings');
  },

  /** `#RRGGBB` or `#RRGGBBAA`; anything else is ignored. */
  setOrbAppearance(color: string): Promise<boolean> {
    if (!/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(color)) {
      return Promise.resolve(false);
    }
    return invoke('setOrbAppearance', {color});
  },

  resetOrbPosition(): Promise<boolean> {
    return invoke('resetOrbPosition');
  },

  /** The saved look; the defaults when the module is missing or fails. */
  async getOrbCustomization(): Promise<OrbCustomization> {
    const module = getModule();
    if (!module?.getOrbCustomization) return {...DEFAULT_ORB_CUSTOMIZATION};
    try {
      return normalizeOrbCustomization(await module.getOrbCustomization());
    } catch (error) {
      console.warn('[floatingAssistant] getOrbCustomization failed:', error);
      return {...DEFAULT_ORB_CUSTOMIZATION};
    }
  },

  /**
   * Saves the given fields and returns the saved look, or null when the
   * change is invalid, the module is missing or saving failed.
   */
  async setOrbCustomization(
    changes: Partial<OrbCustomization>,
  ): Promise<OrbCustomization | null> {
    if (!isValidOrbChange(changes)) return null;
    const module = getModule();
    if (!module?.setOrbCustomization) return null;
    try {
      return normalizeOrbCustomization(
        await module.setOrbCustomization(changes),
      );
    } catch (error) {
      console.warn('[floatingAssistant] setOrbCustomization failed:', error);
      return null;
    }
  },

  async resetOrbCustomization(): Promise<OrbCustomization | null> {
    const module = getModule();
    if (!module?.resetOrbCustomization) return null;
    try {
      return normalizeOrbCustomization(await module.resetOrbCustomization());
    } catch (error) {
      console.warn('[floatingAssistant] resetOrbCustomization failed:', error);
      return null;
    }
  },

  closeQuickChat(): Promise<boolean> {
    return invoke('closeQuickChat');
  },

  openMainApp(): Promise<boolean> {
    return invoke('openMainApp');
  },
};
