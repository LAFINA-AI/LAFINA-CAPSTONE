import { NativeModules, Platform } from 'react-native';
import { OFFLINE_MODEL_CATALOG, getOfflineModelPreset } from './modelManager';
import type {
  DeviceAiRecommendation,
  DeviceHardwareSpecs,
  ModelStatus,
  OfflineModelFitAssessment,
  OfflineModelId,
  OfflineModelPreset,
} from './types';

export interface RawNativeDeviceSpecs {
  totalRamBytes?: number;
  availableRamBytes?: number;
  isLowRamDevice?: boolean;
  isLowMemoryNow?: boolean;
  cpuCores?: number;
  supports64Bit?: boolean;
  primaryAbi?: string;
  availableStorageBytes?: number;
  totalStorageBytes?: number;
  deviceLabel?: string;
  androidSdk?: number | null;
}

const BYTES_PER_MIB = 1024 * 1024;
const BYTES_PER_GIB = 1024 * 1024 * 1024;

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function classifyAdvertisedRamGb(totalRamBytes: number): number {
  if (!Number.isFinite(totalRamBytes) || totalRamBytes <= 0) {
    return 0;
  }
  const gib = totalRamBytes / BYTES_PER_GIB;
  if (gib >= 14.0) return 16;
  if (gib >= 10.0) return 12;
  if (gib >= 6.8) return 8;
  if (gib >= 4.95) return 6;
  if (gib >= 3.25) return 4;
  if (gib >= 2.25) return 3;
  if (gib >= 1.3) return 2;
  return Math.max(1, Math.round(gib));
}

export function formatStorageSpace(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 MB';
  }
  if (bytes >= BYTES_PER_GIB) {
    return `${(bytes / BYTES_PER_GIB).toFixed(1)} GB`;
  }
  return `${Math.max(1, Math.round(bytes / BYTES_PER_MIB))} MB`;
}

export function getRequiredStorageBytes(
  preset: OfflineModelPreset,
  alreadyDownloaded = false,
): number {
  if (preset.id === 'fast_path_only' || alreadyDownloaded) {
    return 0;
  }
  return Math.round(preset.approximateSizeBytes * 1.15) + 40 * BYTES_PER_MIB;
}

export function normalizeRawDeviceSpecs(
  raw: RawNativeDeviceSpecs | null | undefined,
): DeviceHardwareSpecs {
  const totalRamBytes = Math.max(0, Number(raw?.totalRamBytes ?? 0));
  const availableRamBytes = Math.max(0, Number(raw?.availableRamBytes ?? 0));
  const availableStorageBytes = Math.max(
    0,
    Number(raw?.availableStorageBytes ?? 0),
  );
  const totalStorageBytes = Math.max(0, Number(raw?.totalStorageBytes ?? 0));
  const cpuCores = Math.max(0, Math.round(Number(raw?.cpuCores ?? 0)));
  const isDetected = totalRamBytes > 0;

  return {
    isDetected,
    totalRamBytes,
    availableRamBytes,
    totalRamGb: isDetected ? roundOneDecimal(totalRamBytes / BYTES_PER_GIB) : 0,
    availableRamGb:
      availableRamBytes > 0
        ? roundOneDecimal(availableRamBytes / BYTES_PER_GIB)
        : 0,
    advertisedRamGb: classifyAdvertisedRamGb(totalRamBytes),
    isLowRamDevice: Boolean(raw?.isLowRamDevice),
    isLowMemoryNow: Boolean(raw?.isLowMemoryNow),
    cpuCores,
    supports64Bit: raw?.supports64Bit !== false,
    primaryAbi: typeof raw?.primaryAbi === 'string' ? raw.primaryAbi : '',
    availableStorageBytes,
    totalStorageBytes,
    deviceLabel:
      typeof raw?.deviceLabel === 'string' && raw.deviceLabel.trim().length > 0
        ? raw.deviceLabel.trim()
        : 'Android Device',
    androidSdk:
      typeof raw?.androidSdk === 'number' && Number.isFinite(raw.androidSdk)
        ? raw.androidSdk
        : null,
  };
}

function createUndetectedRecommendation(
  specs: DeviceHardwareSpecs,
): DeviceAiRecommendation {
  const recommendedModelId: OfflineModelId = 'qwen2.5-0.5b';
  const assessments = {} as Record<OfflineModelId, OfflineModelFitAssessment>;

  for (const preset of OFFLINE_MODEL_CATALOG) {
    assessments[preset.id] = {
      modelId: preset.id,
      tier: preset.id === recommendedModelId ? 'recommended' : 'compatible',
      isRecommended: preset.id === recommendedModelId,
      hasEnoughRam: true,
      hasEnoughStorage: true,
      note:
        preset.id === recommendedModelId
          ? 'Balanced default offline model'
          : null,
    };
  }

  return {
    specs,
    recommendedModelId,
    headline: 'Recommended: Qwen2.5-0.5B-Instruct',
    reason:
      'Phone hardware stats are unavailable here. Qwen2.5-0.5B is the balanced default, or pick a smaller model for 3–4 GB RAM devices.',
    specSummary: 'Phone specs unavailable',
    assessments,
  };
}

function hasEnoughStorageForPreset(
  preset: OfflineModelPreset,
  specs: DeviceHardwareSpecs,
  alreadyDownloaded: boolean,
): boolean {
  const required = getRequiredStorageBytes(preset, alreadyDownloaded);
  if (required === 0) {
    return true;
  }
  if (specs.availableStorageBytes > 0) {
    return specs.availableStorageBytes >= required;
  }
  return specs.totalStorageBytes <= 0;
}

export function recommendOfflineModelForSpecs(
  specs: DeviceHardwareSpecs,
  options?: { downloadedModelIds?: Iterable<OfflineModelId> },
): DeviceAiRecommendation {
  if (!specs.isDetected) {
    return createUndetectedRecommendation(specs);
  }

  const downloadedSet = new Set<OfflineModelId>(
    options?.downloadedModelIds ?? [],
  );

  const meetsRam = (preset: OfflineModelPreset): boolean => {
    if (preset.id === 'fast_path_only') {
      return true;
    }
    return (
      !specs.isLowRamDevice &&
      specs.supports64Bit &&
      specs.advertisedRamGb >= preset.recommendedRamGb
    );
  };

  let priorityOrder: OfflineModelId[];
  if (
    specs.isLowRamDevice ||
    specs.advertisedRamGb <= 2 ||
    !specs.supports64Bit
  ) {
    priorityOrder = ['fast_path_only'];
  } else if (
    specs.advertisedRamGb >= 6 &&
    specs.cpuCores >= 6 &&
    !specs.isLowMemoryNow &&
    (specs.availableRamBytes === 0 || specs.availableRamGb >= 1.2)
  ) {
    priorityOrder = [
      'gemma-3-1b',
      'qwen2.5-0.5b',
      'gemma-3-270m',
      'smollm2-135m',
      'fast_path_only',
    ];
  } else if (specs.advertisedRamGb >= 5) {
    priorityOrder = [
      'qwen2.5-0.5b',
      'gemma-3-270m',
      'smollm2-135m',
      'fast_path_only',
    ];
  } else if (specs.advertisedRamGb === 4) {
    priorityOrder = ['gemma-3-270m', 'qwen2.5-0.5b', 'smollm2-135m', 'fast_path_only'];
  } else {
    priorityOrder = ['smollm2-135m', 'fast_path_only'];
  }

  let recommendedModelId: OfflineModelId = 'fast_path_only';
  for (const candidateId of priorityOrder) {
    const preset = getOfflineModelPreset(candidateId);
    if (
      meetsRam(preset) &&
      hasEnoughStorageForPreset(preset, specs, downloadedSet.has(candidateId))
    ) {
      recommendedModelId = candidateId;
      break;
    }
  }

  const recommendedPreset = getOfflineModelPreset(recommendedModelId);
  const specParts = [`${specs.advertisedRamGb} GB RAM`];
  if (specs.cpuCores > 0) {
    specParts.push(`${specs.cpuCores} cores`);
  }
  if (specs.availableStorageBytes > 0) {
    specParts.push(`${formatStorageSpace(specs.availableStorageBytes)} free`);
  }
  const specSummary = specParts.join(' · ');

  let reason: string;
  if (!specs.supports64Bit) {
    reason =
      'Detected a 32-bit Android CPU ABI; built-in Fast-Path gives instant (<5ms) offline scheduling without 64-bit memory limits.';
  } else if (specs.isLowRamDevice || specs.advertisedRamGb <= 2) {
    reason = `Detected ${specs.advertisedRamGb} GB RAM (low-memory device); built-in Fast-Path keeps LAFINA responsive with zero storage or RAM overhead.`;
  } else if (recommendedModelId === 'fast_path_only') {
    reason = `Free storage is low (${formatStorageSpace(specs.availableStorageBytes)} free); Fast-Path Only works reliably with zero extra storage.`;
  } else if (recommendedModelId === 'gemma-3-1b') {
    reason = `Your ${specs.advertisedRamGb} GB RAM and ${specs.cpuCores}-core CPU can comfortably run Gemma 3 1B for highest offline accuracy.`;
  } else if (recommendedModelId === 'qwen2.5-0.5b') {
    if (specs.advertisedRamGb >= 6) {
      reason = specs.isLowMemoryNow || (specs.availableRamBytes > 0 && specs.availableRamGb < 1.2)
        ? `Free RAM is tight right now (${specs.availableRamGb.toFixed(1)} GB free); Qwen2.5-0.5B fits safer than Gemma 3 1B while keeping strong Taglish support.`
        : `Free storage (${formatStorageSpace(specs.availableStorageBytes)}) or CPU headroom favors Qwen2.5-0.5B over Gemma 3 1B (~806 MB).`;
    } else {
      reason = `Balanced match for ${specs.advertisedRamGb} GB RAM with strong English and Taglish support.`;
    }
  } else if (recommendedModelId === 'gemma-3-270m') {
    reason = `Best balance of speed and accuracy for ${specs.advertisedRamGb} GB RAM (${formatStorageSpace(specs.availableStorageBytes)} free).`;
  } else {
    reason = `Ultra-lightweight (~105 MB) match for ${specs.advertisedRamGb} GB RAM without crowding background apps.`;
  }

  const assessments = {} as Record<OfflineModelId, OfflineModelFitAssessment>;
  for (const preset of OFFLINE_MODEL_CATALOG) {
    const isRecommended = preset.id === recommendedModelId;
    const isDownloaded = downloadedSet.has(preset.id);
    const hasEnoughRam = meetsRam(preset);
    const hasEnoughStorage = hasEnoughStorageForPreset(
      preset,
      specs,
      isDownloaded,
    );

    let tier: OfflineModelFitAssessment['tier'] = 'compatible';
    let note: string | null = null;

    if (preset.id === 'fast_path_only') {
      tier = isRecommended ? 'recommended' : 'compatible';
      note = isRecommended ? 'Best match for your phone' : null;
    } else if (!specs.supports64Bit) {
      tier = 'unsupported';
      note = 'Requires 64-bit Android';
    } else if (!hasEnoughStorage) {
      tier = 'unsupported';
      const needed = formatStorageSpace(getRequiredStorageBytes(preset, false));
      note = `Needs ${needed} free storage`;
    } else if (!hasEnoughRam) {
      if (!specs.isLowRamDevice && specs.advertisedRamGb + 1 >= preset.recommendedRamGb) {
        tier = 'tight_fit';
        note = `May lag (${preset.recommendedRamGb}GB+ RAM rec.)`;
      } else {
        tier = 'unsupported';
        note = `Needs ${preset.recommendedRamGb}GB+ RAM`;
      }
    } else if (isRecommended) {
      tier = 'recommended';
      note = 'Best match for your phone';
    } else if (
      preset.id === 'qwen2.5-0.5b' &&
      recommendedModelId === 'gemma-3-270m'
    ) {
      tier = 'compatible';
      note = 'Great for Taglish · heavier on 4 GB';
    }

    assessments[preset.id] = {
      modelId: preset.id,
      tier,
      isRecommended,
      hasEnoughRam,
      hasEnoughStorage,
      note,
    };
  }

  return {
    specs,
    recommendedModelId,
    headline: `Recommended: ${recommendedPreset.name}`,
    reason,
    specSummary,
    assessments,
  };
}

export async function getDeviceHardwareSpecs(): Promise<DeviceHardwareSpecs> {
  if (Platform.OS !== 'android') {
    return normalizeRawDeviceSpecs(null);
  }
  const extractor = NativeModules.LafinaIntentExtractor;
  if (!extractor || typeof extractor.getDeviceSpecs !== 'function') {
    return normalizeRawDeviceSpecs(null);
  }
  try {
    const raw = (await extractor.getDeviceSpecs()) as RawNativeDeviceSpecs;
    return normalizeRawDeviceSpecs(raw);
  } catch {
    return normalizeRawDeviceSpecs(null);
  }
}

export async function getDeviceAiRecommendation(
  modelsStatus?: ModelStatus[],
): Promise<DeviceAiRecommendation> {
  const specs = await getDeviceHardwareSpecs();
  const downloadedIds: OfflineModelId[] = (modelsStatus ?? [])
    .filter(item => item.isDownloaded && item.modelId)
    .map(item => item.modelId as OfflineModelId);
  return recommendOfflineModelForSpecs(specs, {
    downloadedModelIds: downloadedIds,
  });
}
