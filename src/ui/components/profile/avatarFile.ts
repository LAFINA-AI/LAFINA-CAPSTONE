import RNFS from 'react-native-fs';
import { pick, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { generateId } from '../../../utils';

export const AVATARS_DIR = `${RNFS.DocumentDirectoryPath}/avatars`;

const extensionOf = (name: string | null | undefined, fallback = 'jpg'): string => {
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(name ?? '');
  return match ? match[1].toLowerCase() : fallback;
};

const isCancellation = (error: unknown): boolean =>
  isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED;

export type PickAvatarResult =
  | { status: 'picked'; uri: string }
  | { status: 'cancelled' }
  | { status: 'failed' };

export const pickAvatarImage = async (): Promise<PickAvatarResult> => {
  let source: string;
  let fileName: string | null;
  try {
    const picked = await pick({ type: ['image/*'] });
    const file = picked?.[0];
    if (!file?.uri) return { status: 'cancelled' };
    source = file.uri;
    fileName = file.name ?? null;
  } catch (error) {
    if (isCancellation(error)) return { status: 'cancelled' };
    console.error('[Profile] Could not open the image picker:', error);
    return { status: 'failed' };
  }

  try {
    await RNFS.mkdir(AVATARS_DIR);
    const destination = `${AVATARS_DIR}/${generateId('avatar')}.${extensionOf(fileName)}`;
    await RNFS.copyFile(source, destination);
    return { status: 'picked', uri: destination };
  } catch (error) {
    console.error('[Profile] Could not store the chosen photo:', error);
    return { status: 'failed' };
  }
};

export const removeAvatarImage = async (uri: string | null): Promise<void> => {
  if (!uri) return;
  const path = uri.replace(/^file:\/\//, '');
  if (!path.startsWith(AVATARS_DIR)) return;
  try {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  } catch (error) {
    console.warn('[Profile] Could not delete the previous photo:', error);
  }
};

export const avatarSource = (uri: string | null): { uri: string } | null =>
  uri ? { uri: uri.startsWith('/') ? `file://${uri}` : uri } : null;
