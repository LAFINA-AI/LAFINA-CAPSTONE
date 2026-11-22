import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import type {ChatAttachment} from '../../../storage';
import type {GeneratedDocument} from '../../../skills/documentSkill';
import {CHAT_FILES_SUBDIR} from '../../../storage/attachmentCleanup';

const getChatFilesDir = (): string =>
  `${RNFS.DocumentDirectoryPath}/${CHAT_FILES_SUBDIR}`;

export const saveGeneratedFile = async (
  doc: GeneratedDocument,
): Promise<ChatAttachment> => {
  const dir = getChatFilesDir();
  if (!(await RNFS.exists(dir))) {
    await RNFS.mkdir(dir);
  }
  const uniqueName = `${Date.now()}_${doc.fileName}`;
  const path = `${dir}/${uniqueName}`;
  await RNFS.writeFile(path, doc.contentBase64, 'base64');
  return {
    uri: `file://${path}`,
    fileName: doc.fileName,
    format: doc.format,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
  };
};

const toLocalPath = (uri: string): string =>
  uri.startsWith('file://') ? uri.slice('file://'.length) : uri;

const SHARE_CACHE_TTL_MS = 10 * 60 * 1000;

const pruneStaleShareCache = async (shareDir: string): Promise<void> => {
  try {
    if (typeof RNFS.readDir !== 'function') return;
    const entries = await RNFS.readDir(shareDir);
    const cutoff = Date.now() - SHARE_CACHE_TTL_MS;
    await Promise.all(
      entries.map(async entry => {
        if (!entry.isFile()) return;
        const mtimeMs = entry.mtime ? new Date(entry.mtime).getTime() : 0;
        if (mtimeMs > 0 && mtimeMs < cutoff) {
          await RNFS.unlink(entry.path).catch(() => undefined);
        }
      }),
    );
  } catch {
    // Best-effort cache cleanup; sharing continues even if pruning fails.
  }
};

export const shareAttachment = async (
  attachment: ChatAttachment,
): Promise<'shared' | 'cancelled' | 'Unavailable' | 'failed'> => {
  try {
    const localPath = toLocalPath(attachment.uri);
    const exists = await RNFS.exists(localPath);
    if (!exists) {
      return 'Unavailable';
    }
    let sharePath = localPath;
    if (RNFS.CachesDirectoryPath) {
      try {
        const shareDir = `${RNFS.CachesDirectoryPath}/chat_share`;
        if (!(await RNFS.exists(shareDir))) {
          await RNFS.mkdir(shareDir);
        } else {
          await pruneStaleShareCache(shareDir);
        }
        const targetPath = `${shareDir}/${attachment.fileName}`;
        if (await RNFS.exists(targetPath)) {
          await RNFS.unlink(targetPath);
        }
        await RNFS.copyFile(localPath, targetPath);
        sharePath = targetPath;
      } catch (copyError) {
        console.warn(
          '[ChatFiles] Could not stage attachment into cache:',
          copyError,
        );
        return 'failed';
      }
    }
    const shareUrl = sharePath.startsWith('file://')
      ? sharePath
      : `file://${sharePath}`;
    const outcome = (await Share.open({
      url: shareUrl,
      type: attachment.mimeType,
      filename: attachment.fileName,
      title: attachment.fileName,
      failOnCancel: false,
    })) as {dismissedAction?: boolean; success?: boolean} | undefined;
    if (outcome?.dismissedAction === true) {
      return 'cancelled';
    }
    return 'shared';
  } catch (error) {
    console.warn('[ChatFiles] Failed to share attachment:', error);
    return 'failed';
  }
};

export const removeAttachmentFiles = async (uris: string[]): Promise<void> => {
  await Promise.all(
    uris.map(async uri => {
      try {
        const path = toLocalPath(uri);
        if (await RNFS.exists(path)) {
          await RNFS.unlink(path);
        }
      } catch {
        // Best-effort cleanup of local files when chat history is cleared.
      }
    }),
  );
};
