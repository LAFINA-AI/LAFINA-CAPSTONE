import {cloudClient} from './cloudClient';
import {userStore} from '../storage/userStore';
import {localSettingsStore} from '../storage/localSettingsStore';
import {GUEST_USER_ID} from '../constants';
import {validOnlineVoiceId} from '../storage/onlineVoiceSettingsStore';
import type {OnlineVoiceChoice} from '../storage/onlineVoiceSettingsStore';

/** A catalogue entry: the saved choice plus labels used only for display. */
export interface OnlineVoiceOption extends OnlineVoiceChoice {
  /** ElevenLabs language label, e.g. "fil" for Filipino or "en". */
  language?: string;
  gender?: string;
}

const LABEL = /^[a-z][a-z_-]{0,23}$/;
const label = (value: unknown): string | undefined =>
  typeof value === 'string' && LABEL.test(value) ? value : undefined;

export const loadOnlineVoices = async (
  userId: string,
  signal: AbortSignal,
): Promise<OnlineVoiceOption[]> => {
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
    voices: OnlineVoiceOption[];
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
    .map(v => {
      const option: OnlineVoiceOption = {id: v.id, name: v.name.slice(0, 160)};
      const language = label(v.language);
      const gender = label(v.gender);
      if (language) option.language = language;
      if (gender) option.gender = gender;
      return option;
    });
};
