import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { DEVICE_SETTINGS_SCOPE } from '../../storage/deviceScope';
import { localSettingsStore } from '../../storage/localSettingsStore';
import type {
  DownloadableOfflineModelId,
  ModelDownloadProgress,
  ModelStatus,
  OfflineModelId,
  OfflineModelPreset,
  OfflinePromptFormat,
} from './types';

export const SETTING_KEY_OFFLINE_AI_MODEL = 'offline_ai_model_id';
const DEVICE_SETTINGS_OWNER = DEVICE_SETTINGS_SCOPE;
/** Where earlier builds of this branch kept the device-wide model choice. */
const LEGACY_DEVICE_SETTINGS_OWNER = '__device__';
const DEFAULT_SELECTED_MODEL_ID: OfflineModelId = 'qwen2.5-0.5b';

export const QWEN_MODEL_INFO = {
  name: 'Qwen2.5-0.5B-Instruct',
  filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
  // Official Hugging Face direct download endpoint
  url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  approximateSizeBytes: 397800000, // ~398 MB
};

export const OFFLINE_MODEL_CATALOG: readonly OfflineModelPreset[] = [
  {
    id: 'fast_path_only',
    name: 'Fast-Path Only (Built-in)',
    shortLabel: 'Fast-Path Only',
    filename: null,
    url: null,
    approximateSizeBytes: 0,
    minValidSizeBytes: 0,
    promptFormat: 'chatml',
    recommendedRamGb: 2,
    description:
      'Instant (<5ms) deterministic command & schedule parser with zero storage or RAM overhead.',
  },
  {
    id: 'smollm2-135m',
    name: 'SmolLM2-135M-Instruct',
    shortLabel: 'SmolLM2 135M',
    filename: 'SmolLM2-135M-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf',
    approximateSizeBytes: 105000000,
    minValidSizeBytes: 40000000,
    promptFormat: 'chatml',
    recommendedRamGb: 3,
    description:
      'Ultra-lightweight on-device NLU model (~105 MB) ideal for 3–4 GB RAM phones.',
  },
  {
    id: 'gemma-3-270m',
    name: 'Gemma-3-270M-Instruct',
    shortLabel: 'Gemma 3 270M',
    filename: 'gemma-3-270m-it-Q4_K_M.gguf',
    url: 'https://huggingface.co/ggml-org/gemma-3-270m-it-GGUF/resolve/main/gemma-3-270m-it-Q4_K_M.gguf',
    approximateSizeBytes: 185000000,
    minValidSizeBytes: 80000000,
    promptFormat: 'gemma',
    recommendedRamGb: 4,
    description:
      'Fast Google Gemma 3 270M model (~185 MB) for accurate title distillation and schedule phrasing.',
  },
  {
    id: 'qwen2.5-0.5b',
    name: QWEN_MODEL_INFO.name,
    shortLabel: 'Qwen 2.5 0.5B',
    filename: QWEN_MODEL_INFO.filename,
    url: QWEN_MODEL_INFO.url,
    approximateSizeBytes: QWEN_MODEL_INFO.approximateSizeBytes,
    minValidSizeBytes: 100000000,
    promptFormat: 'chatml',
    recommendedRamGb: 4,
    description:
      'Balanced 500M multilingual NLU model (~398 MB) for conversational English and Taglish commands.',
  },
  {
    id: 'gemma-3-1b',
    name: 'Gemma-3-1B-Instruct',
    shortLabel: 'Gemma 3 1B',
    filename: 'gemma-3-1b-it-Q4_K_M.gguf',
    url: 'https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf',
    approximateSizeBytes: 806000000,
    minValidSizeBytes: 300000000,
    promptFormat: 'gemma',
    recommendedRamGb: 6,
    description:
      'High-precision Google Gemma 3 1B model (~806 MB) for complex phrasing (6 GB+ RAM recommended).',
  },
];

let selectedModelIdCache: OfflineModelId = DEFAULT_SELECTED_MODEL_ID;
let lastPersistFailed = false;

export const OFFLINE_ENGINE_UNAVAILABLE_MESSAGE =
  'On-device AI models need the llama engine, which is not included in this build of LAFINA. The built-in Fast-Path parser handles offline commands.';

/**
 * Whether this native build can run a downloaded GGUF model (audit H4). The
 * `lafina_llama` JNI library is optional; without it every "model" answer
 * would really be the Kotlin regex fallback. Older native builds that lack
 * `isEngineAvailable` are treated as having no engine.
 */
export async function isOfflineModelEngineAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const extractor = NativeModules.LafinaIntentExtractor;
  if (!extractor || typeof extractor.isEngineAvailable !== 'function') {
    return false;
  }
  try {
    return (await extractor.isEngineAvailable()) === true;
  } catch {
    return false;
  }
}

/** The one model download that may run at a time, shared by every screen. */
export interface ActiveModelDownload {
  modelId: DownloadableOfflineModelId;
  progress: ModelDownloadProgress;
}

interface DownloadJob extends ActiveModelDownload {
  jobId: number | null;
  cancelled: boolean;
  tempPath: string;
}

let activeDownload: DownloadJob | null = null;
const downloadListeners = new Set<
  (download: ActiveModelDownload | null) => void
>();

function publishDownload(): void {
  const snapshot = getActiveModelDownload();
  for (const listener of downloadListeners) {
    try {
      listener(snapshot);
    } catch {
      // A screen's listener must never break the download.
    }
  }
}

export function getActiveModelDownload(): ActiveModelDownload | null {
  return activeDownload
    ? {modelId: activeDownload.modelId, progress: {...activeDownload.progress}}
    : null;
}

/** Follows the shared download so a screen reopened mid-download shows it. */
export function subscribeModelDownload(
  listener: (download: ActiveModelDownload | null) => void,
): () => void {
  downloadListeners.add(listener);
  return () => {
    downloadListeners.delete(listener);
  };
}

/** Free space needed for a download: the file plus 15 % and 40 MB of headroom. */
export function requiredFreeBytesFor(approximateSizeBytes: number): number {
  return Math.round(approximateSizeBytes * 1.15) + 40_000_000;
}

export interface ActiveOfflineModelConfig {
  modelId: DownloadableOfflineModelId;
  modelPath: string;
  promptFormat: OfflinePromptFormat;
  minValidSizeBytes: number;
  modelName: string;
}

function unloadNativeModelIfAvailable(): void {
  if (Platform.OS !== 'android') {
    return;
  }
  const extractor = NativeModules.LafinaIntentExtractor;
  if (extractor && typeof extractor.unloadModel === 'function') {
    try {
      void Promise.resolve(extractor.unloadModel()).catch(() => {});
    } catch {
      // Ignore native unload errors
    }
  }
}

export function isValidOfflineModelId(
  value: string | null | undefined,
): value is OfflineModelId {
  return Boolean(value && OFFLINE_MODEL_CATALOG.some((preset) => preset.id === value));
}

export function getOfflineModelPreset(modelId: OfflineModelId): OfflineModelPreset {
  return (
    OFFLINE_MODEL_CATALOG.find((preset) => preset.id === modelId) ||
    OFFLINE_MODEL_CATALOG.find((preset) => preset.id === DEFAULT_SELECTED_MODEL_ID)!
  );
}

export function getSelectedOfflineModelId(userId?: string): OfflineModelId {
  try {
    if (userId) {
      const userStored = localSettingsStore.get(
        userId,
        SETTING_KEY_OFFLINE_AI_MODEL,
        null,
      );
      if (isValidOfflineModelId(userStored)) {
        selectedModelIdCache = userStored;
        lastPersistFailed = false;
        return userStored;
      }
    }
    const deviceStored =
      localSettingsStore.get(
        DEVICE_SETTINGS_OWNER,
        SETTING_KEY_OFFLINE_AI_MODEL,
        null,
      ) ??
      localSettingsStore.get(
        LEGACY_DEVICE_SETTINGS_OWNER,
        SETTING_KEY_OFFLINE_AI_MODEL,
        null,
      );
    if (isValidOfflineModelId(deviceStored)) {
      selectedModelIdCache = deviceStored;
      lastPersistFailed = false;
      return deviceStored;
    }
  } catch {
    return selectedModelIdCache;
  }

  if (lastPersistFailed) {
    return selectedModelIdCache;
  }

  selectedModelIdCache = DEFAULT_SELECTED_MODEL_ID;
  return DEFAULT_SELECTED_MODEL_ID;
}

export function setSelectedOfflineModelId(
  modelId: OfflineModelId,
  userId?: string,
): void {
  selectedModelIdCache = modelId;
  try {
    const persistedDevice = localSettingsStore.set(
      DEVICE_SETTINGS_OWNER,
      SETTING_KEY_OFFLINE_AI_MODEL,
      modelId,
    );
    const persistedUser = userId
      ? localSettingsStore.set(userId, SETTING_KEY_OFFLINE_AI_MODEL, modelId)
      : true;
    lastPersistFailed = !persistedDevice || !persistedUser;
  } catch {
    lastPersistFailed = true;
  }
  unloadNativeModelIfAvailable();
}

/** Returns the local directory where dynamic models are stored. */
export function getModelsDirectory(): string {
  return `${RNFS.DocumentDirectoryPath}/models`;
}

/** Returns the full local file path for a specific curated offline model preset. */
export function getModelPathForId(modelId: OfflineModelId): string {
  const preset = getOfflineModelPreset(modelId);
  if (!preset.filename) {
    return '';
  }
  return `${getModelsDirectory()}/${preset.filename}`;
}

/** Returns the full local file path to the Qwen2.5 GGUF model file. */
export function getQwenModelPath(): string {
  return getModelPathForId('qwen2.5-0.5b');
}

/** Checks whether a specific offline model preset is downloaded and valid for inference. */
export async function isModelReadyById(modelId: OfflineModelId): Promise<boolean> {
  if (modelId === 'fast_path_only') {
    return true;
  }
  try {
    const preset = getOfflineModelPreset(modelId);
    const path = getModelPathForId(modelId);
    if (!path) return false;
    const exists = await RNFS.exists(path);
    if (!exists) return false;
    const stat = await RNFS.stat(path);
    return Number(stat.size) > preset.minValidSizeBytes;
  } catch {
    return false;
  }
}

/** Checks whether the Qwen model is currently downloaded and ready for inference. */
export async function isQwenModelReady(): Promise<boolean> {
  return isModelReadyById('qwen2.5-0.5b');
}

/** Returns the status and size of a specific curated offline model preset. */
export async function getModelStatusById(
  modelId: OfflineModelId,
  userId?: string,
): Promise<ModelStatus> {
  const preset = getOfflineModelPreset(modelId);
  const selectedId = getSelectedOfflineModelId(userId);
  const filePath = getModelPathForId(modelId);

  if (modelId === 'fast_path_only') {
    return {
      isDownloaded: true,
      filePath: '',
      fileSizeBytes: 0,
      modelName: preset.name,
      modelId: preset.id,
      shortLabel: preset.shortLabel,
      approximateSizeBytes: preset.approximateSizeBytes,
      recommendedRamGb: preset.recommendedRamGb,
      description: preset.description,
      isSelected: selectedId === preset.id,
    };
  }

  try {
    const exists = await RNFS.exists(filePath);
    if (!exists) {
      return {
        isDownloaded: false,
        filePath,
        fileSizeBytes: 0,
        modelName: preset.name,
        modelId: preset.id,
        shortLabel: preset.shortLabel,
        approximateSizeBytes: preset.approximateSizeBytes,
        recommendedRamGb: preset.recommendedRamGb,
        description: preset.description,
        isSelected: selectedId === preset.id,
      };
    }
    const stat = await RNFS.stat(filePath);
    const size = Number(stat.size);
    return {
      isDownloaded: size > preset.minValidSizeBytes,
      filePath,
      fileSizeBytes: size,
      modelName: preset.name,
      modelId: preset.id,
      shortLabel: preset.shortLabel,
      approximateSizeBytes: preset.approximateSizeBytes,
      recommendedRamGb: preset.recommendedRamGb,
      description: preset.description,
      isSelected: selectedId === preset.id,
    };
  } catch {
    return {
      isDownloaded: false,
      filePath,
      fileSizeBytes: 0,
      modelName: preset.name,
      modelId: preset.id,
      shortLabel: preset.shortLabel,
      approximateSizeBytes: preset.approximateSizeBytes,
      recommendedRamGb: preset.recommendedRamGb,
      description: preset.description,
      isSelected: selectedId === preset.id,
    };
  }
}

/** Returns the status of all curated offline AI models in the catalog. */
export async function getAllModelsStatus(userId?: string): Promise<ModelStatus[]> {
  return Promise.all(
    OFFLINE_MODEL_CATALOG.map((preset) => getModelStatusById(preset.id, userId)),
  );
}

/** Returns the status and size of the selected (or specified) on-device model. */
export async function getModelStatus(modelId?: OfflineModelId): Promise<ModelStatus> {
  return getModelStatusById(modelId ?? getSelectedOfflineModelId());
}

/**
 * Returns the active downloadable offline model configuration if the user has selected
 * an on-device GGUF preset and it is downloaded and valid on disk; otherwise returns null.
 */
export async function getActiveOfflineModelReadyConfig(
  userId?: string,
): Promise<ActiveOfflineModelConfig | null> {
  const selectedId = getSelectedOfflineModelId(userId);
  if (selectedId === 'fast_path_only') {
    return null;
  }
  if (!(await isOfflineModelEngineAvailable())) {
    return null;
  }
  const ready = await isModelReadyById(selectedId);
  if (!ready) {
    return null;
  }
  const preset = getOfflineModelPreset(selectedId);
  const modelPath = getModelPathForId(selectedId);
  if (!modelPath) {
    return null;
  }
  return {
    modelId: selectedId,
    modelPath,
    promptFormat: preset.promptFormat,
    minValidSizeBytes: preset.minValidSizeBytes,
    modelName: preset.name,
  };
}

/** Downloads a curated offline GGUF model dynamically with progress callbacks and selects it on completion. */
export async function downloadOfflineModel(
  modelId: DownloadableOfflineModelId,
  onProgress?: (progress: ModelDownloadProgress) => void,
  userId?: string,
): Promise<string> {
  const preset = getOfflineModelPreset(modelId);
  if (!preset.url || !preset.filename) {
    throw new Error(`Model ${modelId} is built-in and does not require downloading.`);
  }
  // Never download hundreds of MB that this build cannot load (audit H4).
  if (!(await isOfflineModelEngineAvailable())) {
    throw new Error(OFFLINE_ENGINE_UNAVAILABLE_MESSAGE);
  }
  // One download at a time across every screen (audit M3).
  if (activeDownload) {
    throw new Error(
      `${getOfflineModelPreset(activeDownload.modelId).name} is already downloading. Wait for it to finish or cancel it first.`,
    );
  }

  const destinationPath = getModelPathForId(modelId);
  const tempPath = `${destinationPath}.tmp`;
  const job: DownloadJob = {
    modelId,
    jobId: null,
    cancelled: false,
    tempPath,
    progress: {
      bytesWritten: 0,
      contentLength: preset.approximateSizeBytes,
      percent: 0,
      status: 'downloading',
    },
  };
  // Claimed before the first await so a second tap cannot start a twin.
  activeDownload = job;

  const report = (progress: ModelDownloadProgress): void => {
    job.progress = progress;
    if (activeDownload === job) {
      publishDownload();
    }
    onProgress?.(progress);
  };
  const fail = async (message: string): Promise<never> => {
    if (activeDownload === job) {
      activeDownload = null;
    }
    await RNFS.unlink(tempPath).catch(() => {});
    report({
      bytesWritten: 0,
      contentLength: 0,
      percent: 0,
      status: 'error',
      error: message,
    });
    publishDownload();
    throw new Error(message);
  };

  try {
    const dir = getModelsDirectory();
    if (!(await RNFS.exists(dir))) {
      await RNFS.mkdir(dir);
    }

    // Free-space check at download time, not only the advisory tier.
    if (typeof RNFS.getFSInfo === 'function') {
      try {
        const info = await RNFS.getFSInfo();
        const needed = requiredFreeBytesFor(preset.approximateSizeBytes);
        if (Number(info.freeSpace) > 0 && Number(info.freeSpace) < needed) {
          const neededMb = Math.ceil(needed / (1024 * 1024));
          return await fail(
            `Not enough free storage for ${preset.name}. About ${neededMb} MB is needed.`,
          );
        }
      } catch (error) {
        if (error instanceof Error && /Not enough free storage/.test(error.message)) {
          throw error;
        }
        // Storage info unavailable: the size check after download still applies.
      }
    }

    // Clean up a stale temp file for this model only.
    if (await RNFS.exists(tempPath)) {
      await RNFS.unlink(tempPath).catch(() => {});
    }
  } catch (error) {
    if (activeDownload === job) {
      activeDownload = null;
      publishDownload();
    }
    throw error;
  }

  publishDownload();
  let expectedBytes = 0;

  return new Promise((resolve, reject) => {
    const download = RNFS.downloadFile({
      fromUrl: preset.url!,
      toFile: tempPath,
      progressInterval: 250,
      progressDivider: 1,
      begin: (res: { contentLength?: number }) => {
        if (Number(res?.contentLength) > 0) {
          expectedBytes = Number(res.contentLength);
        }
      },
      progress: (res) => {
        if (res.contentLength > 0) {
          expectedBytes = res.contentLength;
        }
        const total =
          res.contentLength > 0 ? res.contentLength : preset.approximateSizeBytes;
        const percent = Math.min(100, Math.round((res.bytesWritten / total) * 100));
        report({
          bytesWritten: res.bytesWritten,
          contentLength: total,
          percent,
          status: 'downloading',
        });
      },
    });

    job.jobId = download.jobId;

    download.promise
      .then(async (result) => {
        if (job.cancelled) {
          if (activeDownload === job) activeDownload = null;
          await RNFS.unlink(tempPath).catch(() => {});
          publishDownload();
          reject(new Error('Download cancelled.'));
          return;
        }
        if (result.statusCode !== 200 && result.statusCode !== 206) {
          await fail(`Download failed with HTTP status ${result.statusCode}`);
          return;
        }
        // Integrity: the file must be complete, not merely "big enough"
        // (audit M3). The server's Content-Length is the reference.
        let size = 0;
        try {
          size = Number((await RNFS.stat(tempPath)).size);
        } catch {
          size = 0;
        }
        if (expectedBytes > 0 && size !== expectedBytes) {
          await fail(
            `The ${preset.name} download was incomplete (${size} of ${expectedBytes} bytes). Please try again.`,
          );
          return;
        }
        if (size <= preset.minValidSizeBytes) {
          await fail(`The ${preset.name} download is too small to be a valid model.`);
          return;
        }
        if (await RNFS.exists(destinationPath)) {
          await RNFS.unlink(destinationPath).catch(() => {});
        }
        await RNFS.moveFile(tempPath, destinationPath);
        if (activeDownload === job) activeDownload = null;
        // Selected for the student who started it, unless they cancelled.
        if (!job.cancelled) {
          setSelectedOfflineModelId(modelId, userId);
        }
        report({
          bytesWritten: size,
          contentLength: size,
          percent: 100,
          status: 'ready',
        });
        publishDownload();
        resolve(destinationPath);
      })
      .catch(async (err) => {
        if (job.cancelled) {
          if (activeDownload === job) activeDownload = null;
          await RNFS.unlink(tempPath).catch(() => {});
          publishDownload();
          reject(new Error('Download cancelled.'));
          return;
        }
        const errorMessage = err instanceof Error ? err.message : String(err);
        try {
          await fail(errorMessage);
        } catch (failure) {
          reject(failure);
        }
      })
      .catch(reject);
  });
}

/** Downloads the Qwen2.5 GGUF model dynamically with progress callbacks. */
export async function downloadQwenModel(
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<string> {
  return downloadOfflineModel('qwen2.5-0.5b', onProgress);
}

/**
 * Cancels the active model download and removes only its own partial file
 * (audit M3: it used to delete every preset's temp file).
 */
export async function cancelModelDownload(): Promise<void> {
  const job = activeDownload;
  if (!job) {
    return;
  }
  job.cancelled = true;
  activeDownload = null;
  if (job.jobId !== null) {
    try {
      RNFS.stopDownload(job.jobId);
    } catch {
      // Already finished.
    }
  }
  if (await RNFS.exists(job.tempPath)) {
    await RNFS.unlink(job.tempPath).catch(() => {});
  }
  publishDownload();
}

/** Deletes a downloaded curated model file from storage to free up space. */
export async function deleteOfflineModel(
  modelId: DownloadableOfflineModelId,
  userId?: string,
): Promise<void> {
  const path = getModelPathForId(modelId);
  if (path && (await RNFS.exists(path))) {
    await RNFS.unlink(path);
  }
  const tempPath = `${path}.tmp`;
  if (path && (await RNFS.exists(tempPath))) {
    await RNFS.unlink(tempPath).catch(() => {});
  }
  if (userId && getSelectedOfflineModelId(userId) === modelId) {
    setSelectedOfflineModelId('fast_path_only', userId);
  }
  unloadNativeModelIfAvailable();
}

/** Deletes the downloaded Qwen model file from storage to free up space. */
export async function deleteQwenModel(): Promise<void> {
  return deleteOfflineModel('qwen2.5-0.5b');
}
