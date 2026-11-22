/**
 * Which Call Lafina a new call uses.
 *
 * Online (ElevenLabs + DeepSeek) whenever it can run: a signed-in account,
 * an internet connection, and the student has not chosen Offline Mode in
 * Chat's engine picker. Otherwise the on-device call (whisper.cpp speech
 * recognition, the deterministic planner parser and react-native-tts).
 *
 * Decided when a call starts; a running call never switches by itself.
 */
import {GUEST_USER_ID} from '../../constants';
import {cloudClient} from '../../cloud/cloudClient';
import {isGuestAccount} from '../../cloud/entitlements';
import {localSettingsStore} from '../../storage/localSettingsStore';
import {userStore} from '../../storage/userStore';

/** Chat's Online/Offline switch; Call Lafina follows the same choice. */
const ONLINE_MODE_KEY = 'chat.onlineMode';

export type CallMode = 'online' | 'offline';

export type CallModeReason =
  /** Signed in, connected, and Offline Mode was not chosen. */
  | 'online'
  /** The student chose Offline Mode in Chat. */
  | 'chose_offline'
  /** A guest, or the cloud sign-in is not this account. */
  | 'signed_out'
  /** No internet connection. */
  | 'no_internet'
  /** The online call could not start or dropped; the student continued offline. */
  | 'online_unavailable';

export interface CallModeDecision {
  mode: CallMode;
  reason: CallModeReason;
}

/** Offline Mode was picked explicitly in Chat (not merely never turned on). */
export const choseOfflineMode = (userId: string): boolean =>
  localSettingsStore.get(userId, ONLINE_MODE_KEY, null) === 'false';

const isSignedInOwner = (userId: string): boolean => {
  if (!userId || userId === GUEST_USER_ID || isGuestAccount(userId))
    return false;
  try {
    return userStore.getActiveSessionToken().userId === userId;
  } catch {
    return false;
  }
};

/**
 * The decision from what is known right now. `connected` null means the
 * connection is not known yet; the call is then expected to go online and
 * `resolveCallMode` checks again when it starts.
 */
export const predictCallMode = (
  userId: string,
  connected: boolean | null,
): CallModeDecision => {
  if (!isSignedInOwner(userId)) return {mode: 'offline', reason: 'signed_out'};
  if (choseOfflineMode(userId))
    return {mode: 'offline', reason: 'chose_offline'};
  if (connected === false) return {mode: 'offline', reason: 'no_internet'};
  return {mode: 'online', reason: 'online'};
};

/** The decision at the moment a call starts, with a fresh connection check. */
export const resolveCallMode = async (
  userId: string,
): Promise<CallModeDecision> => {
  const predicted = predictCallMode(userId, null);
  if (predicted.mode === 'offline') return predicted;
  const online = await cloudClient.isOnline().catch(() => false);
  return online ? predicted : {mode: 'offline', reason: 'no_internet'};
};

/** One short line for the call screen saying why the call is offline. */
export const offlineReasonText = (reason: CallModeReason): string => {
  switch (reason) {
    case 'chose_offline':
      return 'Offline call: you chose Offline Mode in Chat.';
    case 'signed_out':
      return 'Offline call: sign in to use the online voice.';
    case 'no_internet':
      return 'Offline call: no internet connection.';
    case 'online_unavailable':
      return 'Offline call: the online voice is not available right now.';
    default:
      return 'Offline call.';
  }
};
