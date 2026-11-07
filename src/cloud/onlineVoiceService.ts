import {cloudClient} from './cloudClient';
import {userStore} from '../storage/userStore';
import {localSettingsStore} from '../storage/localSettingsStore';
import {GUEST_USER_ID} from '../constants';
import {validOnlineVoiceId} from '../storage/onlineVoiceSettingsStore';
import type {OnlineVoiceChoice} from '../storage/onlineVoiceSettingsStore';

export const loadOnlineVoices = async (
  userId: string,
  signal: AbortSignal,
): Promise<OnlineVoiceChoice[]> => {
  const isOwner = () =>
    userId !== GUEST_USER_ID &&
    userStore.getActiveSessionToken().userId === userId;
  const enabled = () =>
    localSettingsStore.get(userId, 'chat.onlineMode') === 'true';
  if (!isOwner()) throw new Error('Sign in to use online voices.');
  if (!enabled())
    throw new Error(
      'Enable Online Mode in Chat to load and preview ElevenLabs voices.',
    );
  if (!(await cloudClient.isOnline()))
    throw new Error('Connect to the internet, then tap Reload voices.');
  if (signal.aborted || !isOwner() || !enabled())
    throw new Error('Voice loading stopped.');
  const result = await cloudClient.request<{
    provider: string;
    voices: OnlineVoiceChoice[];
  }>('/v1/ai/tts/voices', {method: 'GET', signal}, true);
  if (signal.aborted || !isOwner() || !enabled())
    throw new Error('Voice loading stopped.');
  if (
    result.status !== 'success' ||
    result.data?.provider !== 'elevenlabs' ||
    !Array.isArray(result.data.voices)
  ) {
    throw new Error(
      result.error || 'Online voices are unavailable. Try Reload voices.',
    );
  }
  return result.data.voices
    .filter(
      v =>
        v &&
        validOnlineVoiceId(v.id) &&
        typeof v.name === 'string' &&
        v.name.trim(),
    )
    .slice(0, 500)
    .map(v => ({id: v.id, name: v.name.slice(0, 160)}));
};
