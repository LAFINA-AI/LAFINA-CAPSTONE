import RNFS from 'react-native-fs';
import type { ModelDownloadProgress, ModelStatus } from './types';

export const QWEN_MODEL_INFO = {
  name: 'Qwen2.5-0.5B-Instruct',
  filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
  // Official Hugging Face direct download endpoint
  url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  approximateSizeBytes: 397800000, // ~398 MB
};

let currentDownloadJobId: number | null = null;

/** Returns the local directory where dynamic models are stored. */
export function getModelsDirectory(): string {
  return `${RNFS.DocumentDirectoryPath}/models`;
}

/** Returns the full local file path to the Qwen2.5 GGUF model file. */
export function getQwenModelPath(): string {
  return `${getModelsDirectory()}/${QWEN_MODEL_INFO.filename}`;
}

/** Checks whether the Qwen model is currently downloaded and ready for inference. */
export async function isQwenModelReady(): Promise<boolean> {
  try {
    const path = getQwenModelPath();
    const exists = await RNFS.exists(path);
    if (!exists) return false;
    const stat = await RNFS.stat(path);
    // Verify file is not empty or partially aborted (< 100MB)
    return Number(stat.size) > 100000000;
  } catch {
    return false;
  }
}

/** Returns the status and size of the on-device model. */
export async function getModelStatus(): Promise<ModelStatus> {
  const filePath = getQwenModelPath();
  try {
    const exists = await RNFS.exists(filePath);
    if (!exists) {
      return {
        isDownloaded: false,
        filePath,
        fileSizeBytes: 0,
        modelName: QWEN_MODEL_INFO.name,
      };
    }
    const stat = await RNFS.stat(filePath);
    const size = Number(stat.size);
    return {
      isDownloaded: size > 100000000,
      filePath,
      fileSizeBytes: size,
      modelName: QWEN_MODEL_INFO.name,
    };
  } catch {
    return {
      isDownloaded: false,
      filePath,
      fileSizeBytes: 0,
      modelName: QWEN_MODEL_INFO.name,
    };
  }
}

/** Downloads the Qwen2.5 GGUF model dynamically with progress callbacks. */
export async function downloadQwenModel(
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<string> {
  const dir = getModelsDirectory();
  const dirExists = await RNFS.exists(dir);
  if (!dirExists) {
    await RNFS.mkdir(dir);
  }

  const destinationPath = getQwenModelPath();
  const tempPath = `${destinationPath}.tmp`;

  // Clean up any stale temp file
  if (await RNFS.exists(tempPath)) {
    await RNFS.unlink(tempPath).catch(() => {});
  }

  return new Promise((resolve, reject) => {
    const download = RNFS.downloadFile({
      fromUrl: QWEN_MODEL_INFO.url,
      toFile: tempPath,
      progressInterval: 250,
      progressDivider: 1,
      progress: (res) => {
        const total = res.contentLength > 0 ? res.contentLength : QWEN_MODEL_INFO.approximateSizeBytes;
        const percent = Math.min(100, Math.round((res.bytesWritten / total) * 100));
        onProgress?.({
          bytesWritten: res.bytesWritten,
          contentLength: total,
          percent,
          status: 'downloading',
        });
      },
    });

    currentDownloadJobId = download.jobId;

    download.promise
      .then(async (result) => {
        currentDownloadJobId = null;
        if (result.statusCode === 200 || result.statusCode === 206) {
          // Rename temp file to final destination
          if (await RNFS.exists(destinationPath)) {
            await RNFS.unlink(destinationPath).catch(() => {});
          }
          await RNFS.moveFile(tempPath, destinationPath);
          onProgress?.({
            bytesWritten: QWEN_MODEL_INFO.approximateSizeBytes,
            contentLength: QWEN_MODEL_INFO.approximateSizeBytes,
            percent: 100,
            status: 'ready',
          });
          resolve(destinationPath);
        } else {
          await RNFS.unlink(tempPath).catch(() => {});
          const errorMsg = `Download failed with HTTP status ${result.statusCode}`;
          onProgress?.({
            bytesWritten: 0,
            contentLength: 0,
            percent: 0,
            status: 'error',
            error: errorMsg,
          });
          reject(new Error(errorMsg));
        }
      })
      .catch(async (err) => {
        currentDownloadJobId = null;
        await RNFS.unlink(tempPath).catch(() => {});
        onProgress?.({
          bytesWritten: 0,
          contentLength: 0,
          percent: 0,
          status: 'error',
          error: err.message,
        });
        reject(err);
      });
  });
}

/** Cancels an ongoing model download. */
export async function cancelModelDownload(): Promise<void> {
  if (currentDownloadJobId !== null) {
    RNFS.stopDownload(currentDownloadJobId);
    currentDownloadJobId = null;
  }
  const tempPath = `${getQwenModelPath()}.tmp`;
  if (await RNFS.exists(tempPath)) {
    await RNFS.unlink(tempPath).catch(() => {});
  }
}

/** Deletes the downloaded Qwen model file from storage to free up space. */
export async function deleteQwenModel(): Promise<void> {
  const path = getQwenModelPath();
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path);
  }
  const tempPath = `${path}.tmp`;
  if (await RNFS.exists(tempPath)) {
    await RNFS.unlink(tempPath).catch(() => {});
  }
}
