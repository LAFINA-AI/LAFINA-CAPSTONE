import {NativeModules, Platform} from 'react-native';

export type SoundPickerKind = 'alarm' | 'ringtone' | 'notification';

export interface BundledToneOption {
  id: string;
  rawName: string;
  label: string;
  uri: string;
}

export interface PickedToneResult {
  cancelled: boolean;
  uri: string | null;
  title: string;
}

interface LafinaSoundPickerNativeModule {
  listBundledTones?: () => Promise<BundledToneOption[]>;
  pickSystemTone?: (
    kind: SoundPickerKind,
    currentUri: string | null,
  ) => Promise<PickedToneResult>;
  resolveToneTitle?: (uri: string | null) => Promise<string>;
  previewTone?: (uri: string | null, kind: SoundPickerKind) => Promise<boolean>;
  stopPreview?: () => Promise<boolean>;
  openChannelNotificationSettings?: (
    channelId: string | null,
  ) => Promise<boolean>;
}

const native = (): LafinaSoundPickerNativeModule | null =>
  Platform.OS === 'android'
    ? ((NativeModules.LafinaSoundPicker as
        | LafinaSoundPickerNativeModule
        | undefined) ?? null)
    : null;

export const FALLBACK_BUNDLED_TONES: ReadonlyArray<BundledToneOption> = [
  {
    id: 'gentle',
    rawName: 'lafina_tone_gentle',
    label: 'Gentle Chime',
    uri: 'android.resource://com.lafina.capstone/raw/lafina_tone_gentle',
  },
  {
    id: 'chime',
    rawName: 'lafina_tone_chime',
    label: 'Academic Bell',
    uri: 'android.resource://com.lafina.capstone/raw/lafina_tone_chime',
  },
  {
    id: 'classic_ring',
    rawName: 'lafina_tone_classic_ring',
    label: 'Classic Ring',
    uri: 'android.resource://com.lafina.capstone/raw/lafina_tone_classic_ring',
  },
  {
    id: 'urgent',
    rawName: 'lafina_tone_urgent',
    label: 'Urgent Pulse',
    uri: 'android.resource://com.lafina.capstone/raw/lafina_tone_urgent',
  },
];

export const isSoundPickerAvailable = (): boolean => native() !== null;

export const defaultToneLabelForKind = (kind: SoundPickerKind): string => {
  switch (kind) {
    case 'ringtone':
      return 'Default ringtone';
    case 'notification':
      return 'Default notification sound';
    default:
      return 'Default alarm tone';
  }
};

export const listBundledTones = async (): Promise<BundledToneOption[]> => {
  const mod = native();
  if (!mod?.listBundledTones) return [...FALLBACK_BUNDLED_TONES];
  try {
    const items = await mod.listBundledTones();
    return Array.isArray(items) && items.length > 0
      ? items
      : [...FALLBACK_BUNDLED_TONES];
  } catch {
    return [...FALLBACK_BUNDLED_TONES];
  }
};

export const pickSystemTone = async (
  kind: SoundPickerKind,
  currentUri: string | null = null,
): Promise<PickedToneResult> => {
  const mod = native();
  if (!mod?.pickSystemTone) {
    return {cancelled: true, uri: null, title: ''};
  }
  return mod.pickSystemTone(kind, currentUri);
};

export const resolveToneTitle = async (
  uri: string | null | undefined,
  kind: SoundPickerKind = 'alarm',
): Promise<string> => {
  if (!uri) return defaultToneLabelForKind(kind);
  if (uri === 'silent') return 'Silent';
  const bundled = FALLBACK_BUNDLED_TONES.find(item =>
    uri.endsWith(`/raw/${item.rawName}`),
  );
  if (bundled) return bundled.label;
  const mod = native();
  if (!mod?.resolveToneTitle) return 'Custom tone';
  try {
    return await mod.resolveToneTitle(uri);
  } catch {
    return 'Custom tone';
  }
};

export const previewTone = async (
  uri: string | null,
  kind: SoundPickerKind,
): Promise<boolean> => {
  const mod = native();
  if (!mod?.previewTone) return false;
  try {
    return await mod.previewTone(uri, kind);
  } catch {
    return false;
  }
};

export const stopTonePreview = async (): Promise<void> => {
  const mod = native();
  if (!mod?.stopPreview) return;
  await mod.stopPreview().catch(() => undefined);
};

export const openChannelNotificationSettings = async (
  channelId: string | null = null,
): Promise<boolean> => {
  const mod = native();
  if (!mod?.openChannelNotificationSettings) return false;
  try {
    return await mod.openChannelNotificationSettings(channelId);
  } catch {
    return false;
  }
};
