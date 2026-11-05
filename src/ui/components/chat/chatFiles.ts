import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import type { ChatAttachment } from '../../../storage';
import type { GeneratedDocument } from '../../../skills/documentSkill';

const CHAT_FILES_SUBDIR = 'chat_files';

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

export const shareAttachment = async (
  attachment: ChatAttachment,
): Promise<'shared' | 'Unavailable' | 'failed'> => {
  try {
    const localPath = toLocalPath(attachment.uri);
    const exists = await RNFS.exists(localPath);
    if (!exists) {
      return 'Unavailable';
    }
    const shareUrl = attachment.uri.startsWith('file://')
      ? attachment.uri
      : `file://${localPath}`;
    await Share.open({
      url: shareUrl,
      type: attachment.mimeType,
      filename: attachment.fileName,
      title: attachment.fileName,
      failOnCancel: false,
    });
    return 'shared';
  } catch (error) {
    console.warn('[ChatFiles] Failed to share attachment:', error);
    return 'failed';
  }
};

export const removeAttachmentFiles = async (uris: string[]): Promise<void> => {
  await Promise.all(
    uris.map(async (uri) => {
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
