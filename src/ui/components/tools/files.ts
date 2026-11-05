import { errorCodes, isErrorWithCode, pick } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';

export const MIME_PDF = 'application/pdf';
export const MIME_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MIME_PPTX =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export interface PickedDocument {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export type PickOutcome =
  | { status: 'picked'; file: PickedDocument }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export const pickDocument = async (types: string[]): Promise<PickOutcome> => {
  try {
    const picked = await pick({ type: types });
    const first = picked?.[0];
    if (!first || !first.uri) {
      return { status: 'cancelled' };
    }
    return {
      status: 'picked',
      file: {
        uri: first.uri,
        name: first.name || 'document',
        mimeType: first.type || 'application/octet-stream',
        sizeBytes: typeof first.size === 'number' ? first.size : 0,
      },
    };
  } catch (error) {
    if (
      isErrorWithCode(error) &&
      error.code === errorCodes.OPERATION_CANCELED
    ) {
      return { status: 'cancelled' };
    }
    return {
      status: 'failed',
      message: 'Could not open that file. Try choosing it from local storage.',
    };
  }
};

export type ShareOutcome = 'shared' | 'failed';

export const shareTextFile = async (params: {
  fileName: string;
  contents: string;
  mimeType?: string;
  title?: string;
}): Promise<ShareOutcome> => {
  const safeName =
    params.fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'export.txt';
  const dir = `${RNFS.CachesDirectoryPath}/tool_exports`;
  const path = `${dir}/${Date.now()}_${safeName}`;
  try {
    if (!(await RNFS.exists(dir))) {
      await RNFS.mkdir(dir);
    }
    await RNFS.writeFile(path, params.contents, 'utf8');
    await Share.open({
      url: `file://${path}`,
      type: params.mimeType || 'text/plain',
      filename: safeName,
      title: params.title || safeName,
      failOnCancel: false,
    });
    return 'shared';
  } catch (error) {
    console.warn('[Tools] Failed to share text file:', error);
    return 'failed';
  } finally {
    RNFS.unlink(path).catch(() => undefined);
  }
};
