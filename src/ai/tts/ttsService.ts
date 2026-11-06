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
/**
 * English readiness, separate from the service existing. `ready` only when a
 * voice the engine positively reports as installed and offline is selected;
 * `unconfirmed` when such a voice is listed but could not be selected.
 */
export type TtsEnglishState = 'ready' | 'missing' | 'unknown' | 'unconfirmed';

export interface TtsReadiness {
  service: TtsServiceState;
  english: TtsEnglishState;
  /** Installed offline English voices whose metadata says so explicitly. */
  voices: TtsVoice[];
  /** The positively offline voice local speech uses; null = local speech is off. */
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
let automaticVoiceId: string | null = null;
/**
 * Codex audit A1: the voice local speech is allowed to use. Set only after the
 * engine accepted a voice whose metadata positively says installed + offline;
 * cleared when a selection fails or the voice stops being listed that way.
 * While null, local playback reports unavailable and callers show text.
 */
let offlineVoiceId: string | null = null;
let establishPromise: Promise<void> | null = null;
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

/** The engine positively reports this voice as installed and needing no network. */
const isPositivelyOffline = (voice: TtsVoice): boolean =>
  !!voice &&
  typeof voice.id === 'string' &&
  voice.id.length > 0 &&
  voice.notInstalled === false &&
  voice.networkConnectionRequired === false &&
  isEnglish(voice);

/**
 * Selects the best installed offline voice for English playback via react-native-tts:
 * AGY's automatic default (en-US first, then quality). Codex audit A1: missing
 * metadata is unknown and is never treated as offline.
 */
export const selectOfflineVoice = (voices: TtsVoice[]): TtsVoice | null => {
  const offlineInstalled = (Array.isArray(voices) ? voices : []).filter(isPositivelyOffline);
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
    .filter(isPositivelyOffline)
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

const isListedOffline = (voices: TtsVoice[], id: string): boolean =>
  eligibleOfflineVoices(voices).some(voice => voice.id === id);

/** Selects a positively offline voice; a failed selection leaves the engine's voice unknown. */
const selectVoice = async (id: string, what: string): Promise<boolean> => {
  if (offlineVoiceId === id) return true;
  if (await setting(() => Tts.setDefaultVoice(id), what)) {
    offlineVoiceId = id;
    return true;
  }
  offlineVoiceId = null;
  return false;
};

/**
 * Applies the desired explicit configuration, or returns to the automatic
 * default when there is none, and makes sure local speech uses a positively
 * offline voice. `voices` null = the engine did not list voices this time.
 * Rate and pitch are only ever sent when a choice was made here (or to undo
 * one), so an untouched install keeps the engine's own speed and pitch.
 */
const applyConfiguration = async (voices: TtsVoice[] | null): Promise<void> => {
  const desired = desiredConfiguration;
  if (voices) {
    automaticVoiceId = selectOfflineVoice(voices)?.id ?? null;
    // A voice that is no longer listed as installed + offline is not used.
    if (offlineVoiceId && !isListedOffline(voices, offlineVoiceId)) offlineVoiceId = null;
  }
  if (!desired) {
    selectedVoiceMissing = false;
    if (appliedCustom) {
      await setting(() => Tts.setDefaultRate(1, true), 'Neutral speed');
      await setting(() => Tts.setDefaultPitch(1), 'Neutral pitch');
      appliedCustom = false;
      if (offlineVoiceId !== automaticVoiceId) offlineVoiceId = null;
    }
  } else {
    appliedCustom = true;
    // Rate goes to Android setSpeechRate unchanged (skipTransform): 1.0 is normal.
    await setting(() => Tts.setDefaultRate(desired.rate, true), 'Speed');
    await setting(() => Tts.setDefaultPitch(desired.pitch), 'Pitch');
    if (
      desired.voiceId &&
      voices &&
      isListedOffline(voices, desired.voiceId) &&
      (await selectVoice(desired.voiceId, 'Voice'))
    ) {
      selectedVoiceMissing = false;
      return;
    }
    selectedVoiceMissing = !!desired.voiceId;
    if (offlineVoiceId !== automaticVoiceId) offlineVoiceId = null;
  }
  // Without a fresh list nothing new can be confirmed; an earlier confirmation stands.
  if (!offlineVoiceId && voices && automaticVoiceId) {
    await selectVoice(automaticVoiceId, 'Automatic voice');
  }
};

/** Retries confirming an offline voice (for example after one was installed). */
const establishOfflineVoice = (): Promise<void> => {
  if (!establishPromise) {
    establishPromise = (async () => {
      try {
        await applyConfiguration(await readVoices());
      } finally {
        establishPromise = null;
      }
    })();
  }
  return establishPromise;
};

/**
 * Starts the react-native-tts engine once. Bounded: an engine that never
 * answers counts as unavailable for this call, and its late answer is
 * ignored. A later call tries again.
 */
const startEngine = async (): Promise<boolean> => {
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
 * Initializes react-native-tts and confirms an installed offline English
 * voice. True only when local speech may play: the engine started and a voice
 * it positively reports as installed and offline is selected (codex audit A1).
 */
export const initTts = async (): Promise<boolean> => {
  if (!(await startEngine())) return false;
  if (!offlineVoiceId) await establishOfflineVoice();
  return offlineVoiceId !== null;
};

/**
 * Checks if react-native-tts is available (or has not yet failed initialization).
 */
export const isTtsAvailable = (): boolean => {
  return !ttsInitialized || (ttsAvailable && offlineVoiceId !== null);
};

/**
 * Returns the currently selected offline voice ID, if any.
 */
export const getSelectedOfflineVoiceId = (): string | null => offlineVoiceId;

/**
 * Sets the explicit local choice (null = AGY's automatic default) and applies
 * it once the engine is ready. Calls are serialized; the last one wins.
 */
export const configureTts = (configuration: TtsConfiguration | null): Promise<void> => {
  desiredConfiguration = configuration ? { ...configuration } : null;
  const run = async () => {
    if (!(ttsInitialized && ttsAvailable)) {
      // The engine start applies the desired configuration when it succeeds.
      if (desiredConfiguration || appliedCustom) await startEngine();
      return;
    }
    await applyConfiguration(await readVoices());
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
  const ready = await startEngine();
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
  // Re-check against the fresh list: a removed voice stops being used.
  if (raw && (!offlineVoiceId || !isListedOffline(raw, offlineVoiceId))) {
    await applyConfiguration(raw);
  }
  const voices = eligibleOfflineVoices(raw ?? []);
  let english: TtsEnglishState;
  if (offlineVoiceId) english = 'ready';
  else if (voices.length > 0) english = 'unconfirmed';
  else if (raw && raw.length > 0) english = 'missing';
  else english = englishAccepted === false ? 'missing' : 'unknown';
  return {
    service: 'ready',
    english,
    voices,
    activeVoiceId: offlineVoiceId,
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
  automaticVoiceId = null;
  offlineVoiceId = null;
  establishPromise = null;
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
