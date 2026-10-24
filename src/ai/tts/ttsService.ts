import { NativeModules } from 'react-native';
import RNFS from 'react-native-fs';
import Tts from 'react-native-tts';

interface NativeAudioPlayerModule {
  playAudio?: (filePath: string) => Promise<boolean>;
  stopAudio?: () => Promise<boolean>;
}

interface TtsVoice {
  id: string;
  name?: string;
  language: string;
  quality?: number;
  latency?: number;
  networkConnectionRequired?: boolean;
  notInstalled?: boolean;
}

let ttsInitialized = false;
let ttsAvailable = false;
let initPromise: Promise<boolean> | null = null;
let selectedVoiceId: string | null = null;

const getNativeAudioPlayer = (): NativeAudioPlayerModule | null => {
  const mod = (NativeModules.LafinaAudioPlayer ?? NativeModules.LafinaTTS) as
    | NativeAudioPlayerModule
    | undefined;
  if (mod && typeof mod.playAudio === 'function') {
    return mod;
  }
  return null;
};

/**
 * Selects the best installed offline voice for English playback via react-native-tts.
 * Never selects a voice with networkConnectionRequired === true for offline synthesis.
 */
export const selectOfflineVoice = (voices: TtsVoice[]): TtsVoice | null => {
  const offlineInstalled = voices.filter(
    (voice) =>
      voice.notInstalled !== true &&
      voice.networkConnectionRequired !== true &&
      typeof voice.language === 'string' &&
      voice.language.toLowerCase().startsWith('en'),
  );
  if (offlineInstalled.length === 0) {
    return null;
  }

  const sorted = [...offlineInstalled].sort((a, b) => {
    const aUs = a.language.toLowerCase().startsWith('en-us') ? 1 : 0;
    const bUs = b.language.toLowerCase().startsWith('en-us') ? 1 : 0;
    if (aUs !== bUs) return bUs - aUs;
    return (b.quality ?? 0) - (a.quality ?? 0);
  });

  return sorted[0] ?? null;
};

/**
 * Initializes react-native-tts and configures an installed offline voice.
 */
export const initTts = async (): Promise<boolean> => {
  if (ttsInitialized && ttsAvailable) {
    return true;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async (): Promise<boolean> => {
    try {
      await Tts.getInitStatus();
      try {
        await Tts.setDefaultLanguage('en-US');
      } catch {
        // Ignore if specific locale is unavailable; voice selection handles fallback
      }
      try {
        await Tts.setDucking(true);
      } catch {
        // Ducking is optional on some Android engines
      }

      try {
        const rawVoices = (await Tts.voices()) as TtsVoice[];
        if (Array.isArray(rawVoices)) {
          const preferred = selectOfflineVoice(rawVoices);
          if (preferred?.id) {
            await Tts.setDefaultVoice(preferred.id);
            selectedVoiceId = preferred.id;
          }
        }
      } catch {
        // Voice enumeration is optional on engines that only expose default voice
      }

      ttsInitialized = true;
      ttsAvailable = true;
      return true;
    } catch (error) {
      ttsInitialized = true;
      ttsAvailable = false;
      console.warn('[TTS] react-native-tts initialization failed:', error);
      return false;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
};

/**
 * Checks if react-native-tts is available (or has not yet failed initialization).
 */
export const isTtsAvailable = (): boolean => {
  return !ttsInitialized || ttsAvailable;
};

/**
 * Returns the currently selected offline voice ID, if any.
 */
export const getSelectedOfflineVoiceId = (): string | null => selectedVoiceId;

/**
 * Plays a previously downloaded WAV file (e.g., from optional Gemini cloud TTS).
 */
export const playSpeechFile = async (filePath: string): Promise<boolean> => {
  const nativeModule = getNativeAudioPlayer();
  if (!nativeModule?.playAudio) {
    throw new Error('Native audio player is not available.');
  }

  const exists = await RNFS.exists(filePath);
  if (!exists) {
    throw new Error(`TTS audio file does not exist: ${filePath}`);
  }

  return nativeModule.playAudio(filePath);
};

/**
 * Stops active react-native-tts speech and any native WAV playback.
 */
export const stopSpeechPlayback = async (): Promise<void> => {
  try {
    await Tts.stop();
  } catch {
    // Ignore stop errors when engine is idle
  }
  const nativeModule = getNativeAudioPlayer();
  if (nativeModule?.stopAudio) {
    try {
      await nativeModule.stopAudio();
    } catch {
      // Ignore native audio stop errors
    }
  }
};

/**
 * Speaks text aloud using react-native-tts (Android TextToSpeech engine).
 * Resolves when utterance finishes or is stopped, with a bounded timeout safety guard.
 */
export const speakTextWithTts = async (text: string): Promise<void> => {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  const ready = await initTts();
  if (!ready) {
    throw new Error('Offline TTS engine is unavailable on this device.');
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let finishSub: { remove?: () => void } | undefined;
    let cancelSub: { remove?: () => void } | undefined;
    let errorSub: { remove?: () => void } | undefined;

    const cleanup = () => {
      clearTimeout(timeoutId);
      finishSub?.remove?.();
      cancelSub?.remove?.();
      errorSub?.remove?.();
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const timeoutMs = Math.min(30000, Math.max(4000, trimmed.length * 120));
    const timeoutId = setTimeout(finish, timeoutMs);

    try {
      if (typeof Tts.addEventListener === 'function') {
        finishSub = Tts.addEventListener('tts-finish', finish) as unknown as {
          remove?: () => void;
        };
        cancelSub = Tts.addEventListener('tts-cancel', finish) as unknown as {
          remove?: () => void;
        };
        errorSub = Tts.addEventListener('tts-error', () =>
          fail(new Error('react-native-tts playback error')),
        ) as unknown as { remove?: () => void };
      }

      Tts.speak(trimmed);

      // In test environments where Tts.addEventListener does not fire events automatically,
      // resolve on the next microtask if addEventListener did not return a subscription.
      if (!finishSub) {
        finish();
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
};

/**
 * With react-native-tts, offline speech is synthesized directly by the Android OS engine
 * without slow ONNX pre-caching. Returns an empty string as a fast no-op.
 */
export const preCacheReminderAudio = async (
  _reminderId: string,
  _text: string,
): Promise<string> => {
  return '';
};

/**
 * Removes any legacy pre-cached reminder audio file if present.
 */
export const deletePreCachedReminderAudio = async (
  filePath: string | null,
): Promise<void> => {
  if (!filePath) return;
  try {
    if (await RNFS.exists(filePath)) {
      await RNFS.unlink(filePath);
    }
  } catch (error) {
    console.warn('[TTS Cache] Failed to delete reminder audio:', error);
  }
};

export const ttsService = {
  init: initTts,
  speak: speakTextWithTts,
  stop: stopSpeechPlayback,
  isAvailable: isTtsAvailable,
  getSelectedOfflineVoiceId,
};
