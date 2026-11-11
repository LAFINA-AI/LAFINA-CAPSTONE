/**
 * Call Lafina 2.0 Personalized Voice, Language & Interaction Settings Store (Phase 12).
 *
 * Implements:
 * - ElevenLabs voice selection and validated provider voice ID (F-050, P12-01).
 * - Preferred language selection (English, Filipino, Taglish, Cebuano) (F-051, F-052, P12-04).
 * - Spoken response style, verbosity, and pacing preferences (P12-03).
 * - Caption size and accessibility options (F-053, P12-06).
 * - Call connected and call end haptic feedback toggles (F-067).
 * - Optional subtle tool-call audio cue toggle (F-070, P12-07).
 */

import {localSettingsStore} from '../../storage/localSettingsStore';
import {db} from '../../storage/database';
import {
  onlineVoiceSettingsStore,
  validOnlineVoiceId,
} from '../../storage/onlineVoiceSettingsStore';

export type CallLafinaLanguage = 'en' | 'fil' | 'taglish' | 'ceb';
export type CallLafinaVerbosity = 'brief' | 'detailed';
export type CallLafinaPacing = 'normal' | 'slow';
export type CallLafinaCaptionSize = 'standard' | 'large' | 'extra_large';

export interface CallLafinaSettings {
  voiceId: string | null;
  voiceName: string | null;
  language: CallLafinaLanguage;
  verbosity: CallLafinaVerbosity;
  pacing: CallLafinaPacing;
  captionSize: CallLafinaCaptionSize;
  callConnectedHaptics: boolean;
  callEndHaptics: boolean;
  toolAudioCue: boolean;
  startWithCallLafina: boolean;
}

export const CALL_LAFINA_SETTINGS_KEYS = {
  VOICE_ID: 'callLafina.voiceId',
  VOICE_NAME: 'callLafina.voiceName',
  LANGUAGE: 'callLafina.language',
  VERBOSITY: 'callLafina.verbosity',
  PACING: 'callLafina.pacing',
  CAPTION_SIZE: 'callLafina.captionSize',
  CONNECTED_HAPTICS: 'callLafina.callConnectedHaptics',
  END_HAPTICS: 'callLafina.callEndHaptics',
  TOOL_AUDIO_CUE: 'callLafina.toolAudioCue',
  START_WITH_CALL: 'callLafina.startWithCallLafina',
} as const;

export const DEFAULT_CALL_LAFINA_SETTINGS: CallLafinaSettings = {
  voiceId: null,
  voiceName: null,
  language: 'en',
  verbosity: 'brief',
  pacing: 'normal',
  captionSize: 'standard',
  callConnectedHaptics: true,
  callEndHaptics: true,
  toolAudioCue: false,
  startWithCallLafina: false,
};

export const LANGUAGE_LABELS: Record<CallLafinaLanguage, string> = {
  en: 'English',
  fil: 'Filipino (Tagalog)',
  taglish: 'Taglish',
  ceb: 'Cebuano (Bisaya)',
};

/**
 * Returns prompt instructions tailored to the chosen language (P12-04, F-051).
 */
export function getLanguageInstruction(language: CallLafinaLanguage): string {
  switch (language) {
    case 'fil':
      return 'Respond primarily in clear, natural Filipino (Tagalog). Use polite student-friendly phrasing.';
    case 'taglish':
      return 'Respond in conversational Taglish (a natural code-switch between English and Tagalog commonly used by Filipino university students).';
    case 'ceb':
      return 'Respond in natural Bisaya/Cebuano, maintaining clear, concise student-friendly language.';
    case 'en':
    default:
      return 'Respond in clear, natural English.';
  }
}

/**
 * Reads user's Call Lafina settings from local persistent storage with fallbacks.
 */
export function getCallLafinaSettings(userId: string): CallLafinaSettings {
  let voiceId: string | null = null;
  let voiceName: string | null = null;
  try {
    const choice = onlineVoiceSettingsStore.read(userId);
    voiceId = choice?.id || null;
    voiceName = choice?.name || null;
  } catch {
    /* Call start reports corrupt authoritative state. */
  }

  const rawLang = localSettingsStore.get(
    userId,
    CALL_LAFINA_SETTINGS_KEYS.LANGUAGE,
  );
  const language: CallLafinaLanguage =
    rawLang === 'fil' ||
    rawLang === 'taglish' ||
    rawLang === 'ceb' ||
    rawLang === 'en'
      ? rawLang
      : DEFAULT_CALL_LAFINA_SETTINGS.language;

  const rawVerb = localSettingsStore.get(
    userId,
    CALL_LAFINA_SETTINGS_KEYS.VERBOSITY,
  );
  const verbosity: CallLafinaVerbosity =
    rawVerb === 'detailed' || rawVerb === 'brief'
      ? rawVerb
      : DEFAULT_CALL_LAFINA_SETTINGS.verbosity;

  const rawPacing = localSettingsStore.get(
    userId,
    CALL_LAFINA_SETTINGS_KEYS.PACING,
  );
  const pacing: CallLafinaPacing =
    rawPacing === 'slow' || rawPacing === 'normal'
      ? rawPacing
      : DEFAULT_CALL_LAFINA_SETTINGS.pacing;

  const rawCaption = localSettingsStore.get(
    userId,
    CALL_LAFINA_SETTINGS_KEYS.CAPTION_SIZE,
  );
  const captionSize: CallLafinaCaptionSize =
    rawCaption === 'large' ||
    rawCaption === 'extra_large' ||
    rawCaption === 'standard'
      ? rawCaption
      : DEFAULT_CALL_LAFINA_SETTINGS.captionSize;

  const rawConnHaptics = localSettingsStore.get(
    userId,
    CALL_LAFINA_SETTINGS_KEYS.CONNECTED_HAPTICS,
  );
  const callConnectedHaptics =
    rawConnHaptics === null ? true : rawConnHaptics === 'true';

  const rawEndHaptics = localSettingsStore.get(
    userId,
    CALL_LAFINA_SETTINGS_KEYS.END_HAPTICS,
  );
  const callEndHaptics =
    rawEndHaptics === null ? true : rawEndHaptics === 'true';

  const rawToolAudio = localSettingsStore.get(
    userId,
    CALL_LAFINA_SETTINGS_KEYS.TOOL_AUDIO_CUE,
  );
  const toolAudioCue = rawToolAudio === 'true';

  const rawStartWithCall = localSettingsStore.get(
    userId,
    CALL_LAFINA_SETTINGS_KEYS.START_WITH_CALL,
  );
  const startWithCallLafina = rawStartWithCall === 'true';

  return {
    voiceId,
    voiceName,
    language,
    verbosity,
    pacing,
    captionSize,
    callConnectedHaptics,
    callEndHaptics,
    toolAudioCue,
    startWithCallLafina,
  };
}

/**
 * Updates user's Call Lafina settings in persistent local storage.
 */
export function saveCallLafinaSettings(
  userId: string,
  patch: Partial<CallLafinaSettings>,
): CallLafinaSettings {
  const persist = (key: string, value: string) => {
    if (!localSettingsStore.set(userId, key, value))
      throw new Error('Could not save call settings.');
  };
  db.transactionSync(() => {
    if (patch.voiceId !== undefined) {
      const validId =
        patch.voiceId && validOnlineVoiceId(patch.voiceId) ? patch.voiceId : '';
      onlineVoiceSettingsStore.save(
        userId,
        validId
          ? {id: validId, name: patch.voiceName || 'Selected voice'}
          : null,
      );
      persist(CALL_LAFINA_SETTINGS_KEYS.VOICE_ID, validId);
    }

    if (patch.voiceName !== undefined) {
      persist(CALL_LAFINA_SETTINGS_KEYS.VOICE_NAME, patch.voiceName || '');
    }

    if (patch.language !== undefined) {
      persist(CALL_LAFINA_SETTINGS_KEYS.LANGUAGE, patch.language);
    }

    if (patch.verbosity !== undefined) {
      persist(CALL_LAFINA_SETTINGS_KEYS.VERBOSITY, patch.verbosity);
    }

    if (patch.pacing !== undefined) {
      persist(CALL_LAFINA_SETTINGS_KEYS.PACING, patch.pacing);
    }

    if (patch.captionSize !== undefined) {
      persist(CALL_LAFINA_SETTINGS_KEYS.CAPTION_SIZE, patch.captionSize);
    }

    if (patch.callConnectedHaptics !== undefined) {
      persist(
        CALL_LAFINA_SETTINGS_KEYS.CONNECTED_HAPTICS,
        patch.callConnectedHaptics ? 'true' : 'false',
      );
    }

    if (patch.callEndHaptics !== undefined) {
      persist(
        CALL_LAFINA_SETTINGS_KEYS.END_HAPTICS,
        patch.callEndHaptics ? 'true' : 'false',
      );
    }

    if (patch.toolAudioCue !== undefined) {
      persist(
        CALL_LAFINA_SETTINGS_KEYS.TOOL_AUDIO_CUE,
        patch.toolAudioCue ? 'true' : 'false',
      );
    }

    if (patch.startWithCallLafina !== undefined) {
      persist(
        CALL_LAFINA_SETTINGS_KEYS.START_WITH_CALL,
        patch.startWithCallLafina ? 'true' : 'false',
      );
    }
  });

  return getCallLafinaSettings(userId);
}
