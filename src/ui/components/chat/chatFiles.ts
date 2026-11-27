import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import type {ChatAttachment} from '../../../storage';
import type {GeneratedDocument} from '../../../skills/documentSkill';
import {
  attachmentCleanupTarget,
  CHAT_FILES_SUBDIR,
} from '../../../storage/attachmentCleanup';

const getChatFilesDir = (): string =>
  `${RNFS.DocumentDirectoryPath}/${CHAT_FILES_SUBDIR}`;

const sanitizeFileName = (rawName: string, fallbackExt = 'bin'): string => {
  const base = (rawName || '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/\0/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .trim();
  if (!cleaned) return `document.${fallbackExt}`;
  return /\.[A-Za-z0-9]{1,10}$/.test(cleaned)
    ? cleaned
    : `${cleaned}.${fallbackExt}`;
};

export const saveGeneratedFile = async (
  doc: GeneratedDocument,
): Promise<ChatAttachment> => {
  const dir = getChatFilesDir();
  if (!(await RNFS.exists(dir))) {
    await RNFS.mkdir(dir);
  }
  const safeName = sanitizeFileName(doc.fileName, doc.format || 'bin');
  const uniqueName = `${Date.now()}_${safeName}`;
  const path = `${dir}/${uniqueName}`;
  await RNFS.writeFile(path, doc.contentBase64, 'base64');
  return {
    uri: `file://${path}`,
    fileName: safeName,
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
        const safeFileName = sanitizeFileName(attachment.fileName);
        const targetPath = `${shareDir}/${safeFileName}`;
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
        const path = attachmentCleanupTarget(uri);
        if (!path) return;
        if (!(await RNFS.exists(path))) return;
        if (typeof RNFS.stat === 'function') {
          const info = await RNFS.stat(path);
          if (info && typeof info.isFile === 'function' && !info.isFile()) {
            return;
          }
        }
        await RNFS.unlink(path);
      } catch {
        // Best-effort cleanup of local files when chat history is deleted.
      }
    }),
  );
};
