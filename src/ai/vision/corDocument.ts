import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';

/**
 * The student's own COR file during review. The picked file is copied into
 * app-private storage (the same approach as chat files and avatars) so the
 * original stays viewable after the picker's grant expires or the app
 * restarts. The copy is removed when its draft is replaced or discarded.
 */
export const COR_DRAFT_DIR = `${RNFS.DocumentDirectoryPath}/cor_drafts`;

export interface PickedCorFile {
  uri: string;
  fileName: string;
  mimeType: string | null;
}

export type CorPickOutcome =
  | {status: 'picked'; file: PickedCorFile}
  | {status: 'cancelled'}
  | {status: 'failed'; message: string};

export const pickCorFile = async (): Promise<CorPickOutcome> => {
  try {
    const picked = await pick({type: [types.pdf, types.images]});
    const first = picked?.[0];
    if (!first?.uri) return {status: 'cancelled'};
    return {
      status: 'picked',
      file: {
        uri: first.uri,
        fileName: first.name || 'USTP COR',
        mimeType: first.type || null,
      },
    };
  } catch (error) {
    if (
      (isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED) ||
      /cancel/i.test(String((error as {message?: string})?.message ?? ''))
    ) {
      return {status: 'cancelled'};
    }
    return {
      status: 'failed',
      message:
        'That file could not be opened. Try choosing it from local storage.',
    };
  }
};

const extensionFor = (file: PickedCorFile): string => {
  const fromName = /\.([A-Za-z0-9]{2,5})$/.exec(file.fileName)?.[1];
  if (fromName) return fromName.toLowerCase();
  if (file.mimeType === 'application/pdf') return 'pdf';
  if (file.mimeType?.startsWith('image/')) return file.mimeType.slice(6);
  return 'bin';
};

/** Returns the app-private copy, or null when copying failed (review still works). */
export const retainCorCopy = async (
  file: PickedCorFile,
  draftId: string,
): Promise<string | null> => {
  try {
    await RNFS.mkdir(COR_DRAFT_DIR);
    const target = `${COR_DRAFT_DIR}/${draftId.replace(
      /[^A-Za-z0-9_-]/g,
      '_',
    )}.${extensionFor(file)}`;
    await RNFS.copyFile(file.uri, target);
    return target;
  } catch (error) {
    console.warn('[corDocument] Could not keep a copy of the COR:', error);
    return null;
  }
};

export const deleteCorCopy = async (
  path: string | null | undefined,
): Promise<void> => {
  if (!path || !path.startsWith(COR_DRAFT_DIR)) return;
  try {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  } catch (error) {
    console.warn('[corDocument] Could not remove a COR copy:', error);
  }
};

/** Opens the retained original with the phone's own viewer. Returns false if unavailable. */
export const openCorOriginal = async (
  path: string | null | undefined,
  mimeType: string | null | undefined,
): Promise<boolean> => {
  if (!path) return false;
  try {
    if (!(await RNFS.exists(path))) return false;
    await Share.open({
      url: `file://${path}`,
      type: mimeType || undefined,
      failOnCancel: false,
      showAppsToView: true,
    });
    return true;
  } catch (error) {
    console.warn('[corDocument] Could not open the COR original:', error);
    return false;
  }
};
