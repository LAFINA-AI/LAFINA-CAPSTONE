import { NativeModules } from 'react-native';
import RNFS from 'react-native-fs';
import Tts from 'react-native-tts';

interface NativeAudioPlayerModule {
  playAudio?: (filePath: string) => Promise<boolean>;
  stopAudio?: () => Promise<boolean>;
}

export interface TtsVoice {
  id: string;
  name?: string;
  language: string;
  quality?: number;
  latency?: number;
  networkConnectionRequired?: boolean;
  notInstalled?: boolean;
}

/** AGY-PORT 10: the explicit local choice applied to react-native-tts. */
export interface TtsConfiguration {
  voiceId: string | null;
  rate: number;
  pitch: number;
}

export type TtsServiceState = 'ready' | 'unavailable' | 'timeout';
/** English readiness, separate from the service existing. */
export type TtsEnglishState = 'ready' | 'missing' | 'unknown';

export interface TtsReadiness {
  service: TtsServiceState;
  english: TtsEnglishState;
  /** Installed offline English voices whose metadata says so explicitly. */
  voices: TtsVoice[];
  activeVoiceId: string | null;
  /** The explicit voice could not be used; the automatic voice speaks instead. */
  selectedVoiceMissing: boolean;
}

export type OwnedSpeechOutcome = 'finished' | 'stopped' | 'failed';

export const TTS_INIT_TIMEOUT_MS = 5000;
export const TTS_VOICES_TIMEOUT_MS = 3000;
const TTS_SETTING_TIMEOUT_MS = 3000;

let ttsInitialized = false;
let ttsAvailable = false;
let lastInitTimedOut = false;
let initPromise: Promise<boolean> | null = null;
let initGeneration = 0;
let selectedVoiceId: string | null = null;
let automaticVoiceId: string | null = null;
let englishAccepted: boolean | null = null;
let desiredConfiguration: TtsConfiguration | null = null;
let appliedCustom = false;
let selectedVoiceMissing = false;
let configureChain: Promise<unknown> = Promise.resolve();

/** The utterance this module is currently speaking, and who asked for it. */
interface ActiveSpeech {
  token: number;
  owner: string;
  stop: () => void;
}
let activeSpeech: ActiveSpeech | null = null;
let speechSequence = 0;

const getNativeAudioPlayer = (): NativeAudioPlayerModule | null => {
  const mod = (NativeModules.LafinaAudioPlayer ?? NativeModules.LafinaTTS) as
    | NativeAudioPlayerModule
    | undefined;
  if (mod && typeof mod.playAudio === 'function') {
    return mod;
  }
  return null;
};

class TtsTimeoutError extends Error {
  constructor(what: string) {
    super(`${what} timed out.`);
    this.name = 'TtsTimeoutError';
  }
}

const bounded = <T>(work: Promise<T> | T, ms: number, what: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TtsTimeoutError(what)), ms);
    Promise.resolve(work).then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

const isEnglish = (voice: TtsVoice): boolean =>
  typeof voice.language === 'string' && voice.language.toLowerCase().startsWith('en');

/**
 * Selects the best installed offline voice for English playback via react-native-tts.
 * Never selects a voice with networkConnectionRequired === true for offline synthesis.
 * This is AGY's automatic default and is unchanged by AGY-PORT 10.
 */
export const selectOfflineVoice = (voices: TtsVoice[]): TtsVoice | null => {
  const offlineInstalled = voices.filter(
    (voice) =>
      voice.notInstalled !== true &&
      voice.networkConnectionRequired !== true &&
      isEnglish(voice),
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
 * AGY-PORT 10: voices a student may choose explicitly. The engine must say,
 * positively, that the voice is installed and needs no network. Missing
 * metadata is unknown, never assumed offline.
 */
export const eligibleOfflineVoices = (voices: unknown): TtsVoice[] => {
  if (!Array.isArray(voices)) return [];
  return (voices as TtsVoice[])
    .filter(
      voice =>
        !!voice &&
        typeof voice.id === 'string' &&
        voice.id.length > 0 &&
        voice.notInstalled === false &&
        voice.networkConnectionRequired === false &&
        isEnglish(voice),
    )
    .sort((a, b) => a.language.localeCompare(b.language) || a.id.localeCompare(b.id));
};

const readVoices = async (): Promise<TtsVoice[] | null> => {
  try {
    const raw = await bounded(Tts.voices() as Promise<TtsVoice[]>, TTS_VOICES_TIMEOUT_MS, 'Voice list');
    return Array.isArray(raw) ? raw : null;
  } catch {
    return null;
  }
};

const setting = async (work: () => unknown, what: string): Promise<boolean> => {
  try {
    await bounded(work() as Promise<unknown>, TTS_SETTING_TIMEOUT_MS, what);
    return true;
  } catch (error) {
    console.warn(`[TTS] ${what} failed:`, error);
    return false;
  }
};

/**
 * Applies the desired explicit configuration, or returns to the automatic
 * default when there is none. Rate and pitch are only ever sent when a choice
 * was made here (or to undo one), so an untouched install keeps the engine's
 * own speed and pitch.
 */
const applyConfiguration = async (voices: TtsVoice[] | null): Promise<void> => {
  const desired = desiredConfiguration;
  if (!desired) {
    if (!appliedCustom) {
      selectedVoiceMissing = false;
      return;
    }
    await setting(() => Tts.setDefaultRate(1, true), 'Neutral speed');
    await setting(() => Tts.setDefaultPitch(1), 'Neutral pitch');
    if (automaticVoiceId && (await setting(() => Tts.setDefaultVoice(automaticVoiceId!), 'Automatic voice'))) {
      selectedVoiceId = automaticVoiceId;
    }
    appliedCustom = false;
    selectedVoiceMissing = false;
    return;
  }
  appliedCustom = true;
  // Rate goes to Android setSpeechRate unchanged (skipTransform): 1.0 is normal.
  await setting(() => Tts.setDefaultRate(desired.rate, true), 'Speed');
  await setting(() => Tts.setDefaultPitch(desired.pitch), 'Pitch');
  if (desired.voiceId) {
    const eligible = eligibleOfflineVoices(voices ?? []);
    const found = eligible.some(voice => voice.id === desired.voiceId);
    if (found && (await setting(() => Tts.setDefaultVoice(desired.voiceId!), 'Voice'))) {
      selectedVoiceId = desired.voiceId;
      selectedVoiceMissing = false;
      return;
    }
    selectedVoiceMissing = true;
  } else {
    selectedVoiceMissing = false;
  }
  if (automaticVoiceId && selectedVoiceId !== automaticVoiceId) {
    if (await setting(() => Tts.setDefaultVoice(automaticVoiceId!), 'Automatic voice')) {
      selectedVoiceId = automaticVoiceId;
    }
  }
};

/**
 * Initializes react-native-tts and configures an installed offline voice.
 * Bounded: an engine that never answers counts as unavailable for this call,
 * and its late answer is ignored. A later call tries again.
 */
export const initTts = async (): Promise<boolean> => {
  if (ttsInitialized && ttsAvailable) {
    return true;
  }
  if (initPromise) {
    return initPromise;
  }

  const generation = ++initGeneration;
  initPromise = (async (): Promise<boolean> => {
    try {
      await bounded(Tts.getInitStatus(), TTS_INIT_TIMEOUT_MS, 'Speech engine start');
      if (generation !== initGeneration) return false;
      try {
        await bounded(Tts.setDefaultLanguage('en-US'), TTS_SETTING_TIMEOUT_MS, 'English');
        englishAccepted = true;
      } catch {
        // Ignore if specific locale is unavailable; voice selection handles fallback
        englishAccepted = false;
      }
      try {
        await Tts.setDucking(true);
      } catch {
        // Ducking is optional on some Android engines
      }

      const rawVoices = await readVoices();
      if (rawVoices) {
        const preferred = selectOfflineVoice(rawVoices);
        if (preferred?.id) {
          try {
            await bounded(Tts.setDefaultVoice(preferred.id), TTS_SETTING_TIMEOUT_MS, 'Voice');
            selectedVoiceId = preferred.id;
            automaticVoiceId = preferred.id;
          } catch {
            // Voice selection is optional on engines that only expose default voice
          }
        }
      }
      if (generation !== initGeneration) return false;

      ttsInitialized = true;
      ttsAvailable = true;
      lastInitTimedOut = false;
      await applyConfiguration(rawVoices);
      return true;
    } catch (error) {
      if (generation === initGeneration) {
        ttsInitialized = true;
        ttsAvailable = false;
        lastInitTimedOut = error instanceof TtsTimeoutError;
        // Retire this attempt: a late engine answer cannot mark it ready.
        initGeneration += 1;
      }
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
 * Sets the explicit local choice (null = AGY's automatic default) and applies
 * it once the engine is ready. Calls are serialized; the last one wins.
 */
export const configureTts = (configuration: TtsConfiguration | null): Promise<void> => {
  desiredConfiguration = configuration ? { ...configuration } : null;
  const run = async () => {
    if (!(ttsInitialized && ttsAvailable)) {
      // initTts applies the desired configuration when it succeeds.
      if (desiredConfiguration || appliedCustom) await initTts();
      return;
    }
    await applyConfiguration(desiredConfiguration?.voiceId ? await readVoices() : null);
  };
  configureChain = configureChain.then(run, run);
  return configureChain.then(
    () => undefined,
    () => undefined,
  );
};

/**
 * AGY-PORT 10: whether the engine exists, separately from whether English
 * offline speech is ready. Bounded; never starts speech or downloads.
 */
export const readTtsReadiness = async (): Promise<TtsReadiness> => {
  const ready = await initTts();
  if (!ready) {
    return {
      service: lastInitTimedOut ? 'timeout' : 'unavailable',
      english: 'unknown',
      voices: [],
      activeVoiceId: null,
      selectedVoiceMissing: false,
    };
  }
  const raw = await readVoices();
  const voices = eligibleOfflineVoices(raw ?? []);
  let english: TtsEnglishState;
  if (voices.length > 0) english = 'ready';
  else if (raw && raw.length > 0) english = 'missing';
  else english = englishAccepted === false ? 'missing' : 'unknown';
  return {
    service: 'ready',
    english,
    voices,
    activeVoiceId: selectedVoiceId,
    selectedVoiceMissing,
  };
};

/** True while this module is speaking an utterance it started. */
export const isSpeechBusy = (): boolean => activeSpeech !== null;

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
 * This is the existing app-wide stop (calls, voice sheet, chat).
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
 * Stops speech only when the utterance being spoken is the caller's own.
 * Returns false (and stops nothing) when another session is speaking.
 */
export const stopOwnedSpeech = async (token: number): Promise<boolean> => {
  if (!activeSpeech || activeSpeech.token !== token) return false;
  activeSpeech.stop();
  try {
    await Tts.stop();
  } catch {
    // Ignore stop errors when engine is idle
  }
  return true;
};

const normalizeUtterance = (text: string): string =>
  // Avoid capitalizing LAFINA so Android TTS pronounces it as a word ("lah-fee-nah")
  // rather than spelling out individual letters ("L-A-F-I-N-A").
  text
    .replace(/\bL[.-]?A[.-]?F[.-]?I[.-]?N[.-]?A\b/gi, 'lafina')
    .replace(/\bLAFINA\b/g, 'lafina')
    .trim();

const eventUtteranceId = (event: unknown): string | null => {
  if (typeof event === 'string') return event;
  const id = (event as { utteranceId?: unknown } | null)?.utteranceId;
  return typeof id === 'string' ? id : null;
};

/**
 * Speaks one utterance and reports how it ended. Engine events are matched
 * to this utterance's id when the engine reports one, so a late event from an
 * earlier utterance cannot end this one.
 */
const speakOwned = (
  trimmed: string,
  owner: string,
  onToken?: (token: number) => void,
): Promise<OwnedSpeechOutcome> =>
  new Promise<OwnedSpeechOutcome>((resolve, reject) => {
    const token = ++speechSequence;
    let settled = false;
    let ownId: string | null = null;
    let idKnown = false;
    const early: Array<{ kind: OwnedSpeechOutcome; id: string | null }> = [];
    let finishSub: { remove?: () => void } | undefined;
    let cancelSub: { remove?: () => void } | undefined;
    let errorSub: { remove?: () => void } | undefined;

    const cleanup = () => {
      clearTimeout(timeoutId);
      finishSub?.remove?.();
      cancelSub?.remove?.();
      errorSub?.remove?.();
      if (activeSpeech?.token === token) activeSpeech = null;
    };

    const settle = (outcome: OwnedSpeechOutcome, error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(outcome);
    };

    const handle = (kind: OwnedSpeechOutcome, event: unknown) => {
      const id = eventUtteranceId(event);
      if (!idKnown && id !== null) {
        early.push({ kind, id });
        return;
      }
      if (id !== null && ownId !== null && id !== ownId) return;
      if (kind === 'failed') settle('failed', new Error('react-native-tts playback error'));
      else settle(kind);
    };

    const timeoutMs = Math.min(30000, Math.max(4000, trimmed.length * 120));
    const timeoutId = setTimeout(() => settle('finished'), timeoutMs);
    activeSpeech = { token, owner, stop: () => settle('stopped') };
    onToken?.(token);

    try {
      if (typeof Tts.addEventListener === 'function') {
        finishSub = Tts.addEventListener('tts-finish', (event: unknown) =>
          handle('finished', event),
        ) as unknown as { remove?: () => void };
        cancelSub = Tts.addEventListener('tts-cancel', (event: unknown) =>
          handle('stopped', event),
        ) as unknown as { remove?: () => void };
        errorSub = Tts.addEventListener('tts-error', (event: unknown) =>
          handle('failed', event),
        ) as unknown as { remove?: () => void };
      }

      const started = Tts.speak(trimmed) as unknown;
      const onId = (id: unknown) => {
        idKnown = true;
        ownId = typeof id === 'string' ? id : null;
        for (const item of early.splice(0)) handle(item.kind, item.id);
      };
      if (started && typeof (started as Promise<unknown>).then === 'function') {
        (started as Promise<unknown>).then(onId, (error: unknown) =>
          settle('failed', error instanceof Error ? error : new Error(String(error))),
        );
      } else {
        onId(started);
      }

      // In test environments where Tts.addEventListener does not fire events automatically,
      // resolve on the next microtask if addEventListener did not return a subscription.
      if (!finishSub) {
        settle('finished');
      }
    } catch (error) {
      settle('failed', error instanceof Error ? error : new Error(String(error)));
    }
  });

/**
 * Speaks text aloud using react-native-tts (Android TextToSpeech engine).
 * Resolves when utterance finishes or is stopped, with a bounded timeout safety guard.
 */
export const speakTextWithTts = async (text: string): Promise<void> => {
  const trimmed = normalizeUtterance(text);
  if (!trimmed) {
    return;
  }

  const ready = await initTts();
  if (!ready) {
    throw new Error('Offline TTS engine is unavailable on this device.');
  }

  await speakOwned(trimmed, 'app');
};

/**
 * AGY-PORT 10: an owned utterance (Preview). The token stops only this
 * utterance; the result never rejects.
 */
export const startOwnedSpeech = (
  text: string,
  owner: string,
): { token: Promise<number | null>; result: Promise<OwnedSpeechOutcome> } => {
  let reportToken: (token: number | null) => void = () => undefined;
  const token = new Promise<number | null>(resolve => {
    reportToken = resolve;
  });
  const result = (async (): Promise<OwnedSpeechOutcome> => {
    const trimmed = normalizeUtterance(text);
    if (!trimmed || !(await initTts())) {
      reportToken(null);
      return 'failed';
    }
    try {
      return await speakOwned(trimmed, owner, reportToken);
    } catch {
      return 'failed';
    } finally {
      reportToken(null);
    }
  })();
  return { token, result };
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

/** Test-only: forget engine state between cases. */
export const __resetTtsForTests = (): void => {
  ttsInitialized = false;
  ttsAvailable = false;
  lastInitTimedOut = false;
  initPromise = null;
  initGeneration += 1;
  selectedVoiceId = null;
  automaticVoiceId = null;
  englishAccepted = null;
  desiredConfiguration = null;
  appliedCustom = false;
  selectedVoiceMissing = false;
  configureChain = Promise.resolve();
  activeSpeech = null;
};

export const initTTS = initTts;
export const speakText = speakTextWithTts;
export const stopSpeaking = stopSpeechPlayback;
export const isTTSAvailable = isTtsAvailable;

export const ttsService = {
  init: initTts,
  initTTS: initTts,
  speak: speakTextWithTts,
  speakText: speakTextWithTts,
  stop: stopSpeechPlayback,
  stopSpeaking: stopSpeechPlayback,
  isAvailable: isTtsAvailable,
  isTTSAvailable: isTtsAvailable,
  getSelectedOfflineVoiceId,
  selectOfflineVoice,
  preCacheReminderAudio,
  deletePreCachedReminderAudio,
  playSpeechFile,
};
