import {localSettingsStore} from './localSettingsStore';
import {userStore} from './userStore';
import {GUEST_USER_ID} from '../constants';

export interface OnlineVoiceChoice {
  id: string;
  name: string;
}
export const DEFAULT_ONLINE_VOICE: OnlineVoiceChoice = {
  id: 'BtcCEANLn920ZIoN9grW',
  name: 'Camille',
};
export const ONLINE_VOICE_KEY = 'speech.onlineVoice.v1';
export const validOnlineVoiceId = (id: unknown): id is string =>
  typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);

export const onlineVoiceSettingsStore = {
  read(userId: string): OnlineVoiceChoice | null {
    const raw = localSettingsStore.get(userId, ONLINE_VOICE_KEY);
    if (raw === null) return DEFAULT_ONLINE_VOICE;
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as OnlineVoiceChoice | null;
      if (value === null) return null;
      if (
        validOnlineVoiceId(value.id) &&
        typeof value.name === 'string' &&
        value.name.trim()
      ) {
        return {id: value.id, name: value.name.slice(0, 160)};
      }
    } catch {
      /* Corrupt data never becomes a request path. */
    }
    throw new Error('Saved online voice is unavailable. Choose a voice again.');
  },
  save(userId: string, choice: OnlineVoiceChoice | null): void {
    if (
      userId === GUEST_USER_ID ||
      userStore.getActiveSessionToken().userId !== userId
    ) {
      throw new Error('Sign in to choose an online voice.');
    }
    if (
      choice &&
      (!validOnlineVoiceId(choice.id) ||
        !choice.name.trim() ||
        choice.name.length > 160)
    ) {
      throw new Error('Choose a valid online voice.');
    }
    if (
      !localSettingsStore.set(userId, ONLINE_VOICE_KEY, JSON.stringify(choice))
    ) {
      throw new Error('Could not save your voice. Try again.');
    }
  },
};
