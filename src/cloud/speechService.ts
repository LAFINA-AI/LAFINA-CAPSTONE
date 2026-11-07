import RNFS from 'react-native-fs';
import {cloudClient} from './cloudClient';
import {accountLinkService} from './accountLinkService';
import {userStore} from '../storage/userStore';
import {localSettingsStore} from '../storage/localSettingsStore';
import {onlineVoiceSettingsStore} from '../storage/onlineVoiceSettingsStore';
import {GUEST_USER_ID} from '../constants';
import {
  playSpeechFile,
  speakTextWithTts,
  stopSpeechPlayback,
} from '../ai/tts/ttsService';
import type {
  CallSpeechProvider,
  CallSpeechResult,
  SpeechStream,
} from '../scheduler/speechProvider';

const PLAYBACK_REQUEST_TIMEOUT_MS = 17_000;
const PREPARATION_REQUEST_TIMEOUT_MS = 22_000;
const TIMEOUT_REASON =
  'ElevenLabs took too long to respond, so the device voice was used.';

interface TtsApiResponse {
  provider: 'elevenlabs';
  requestId: string;
  audioBase64: string;
  mimeType: string;
  model: string;
  voice: string;
  createdAt: string;
}

const waitForPreparation = async (
  preparation: Promise<string | null>,
): Promise<string | null | undefined> =>
  new Promise(resolve => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      settled = true;
      resolve(undefined);
    }, PLAYBACK_REQUEST_TIMEOUT_MS);

    void preparation
      .then(path => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(path);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(null);
      });
  });

/** The online speech request accepts at most 512 characters per piece. */
export const SPEECH_CHUNK_CHARS = 500;

/**
 * What a reply should sound like: markdown emphasis, headings, list markers
 * and code ticks are written for the screen, not to be read out.
 */
export const speakableText = (text: string): string =>
  text
    .replace(/\*\*|__|`+/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

/**
 * Splits text into pieces of at most SPEECH_CHUNK_CHARS, at sentence ends
 * where possible, then at spaces; nothing is dropped.
 */
export const splitForSpeech = (
  text: string,
  limit: number = SPEECH_CHUNK_CHARS,
): string[] => {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];
  const sentences = clean.match(/[^.!?\n]+(?:[.!?]+|\n|$)/g) ?? [clean];
  const chunks: string[] = [];
  let current = '';
  const push = (piece: string) => {
    const trimmed = piece.trim();
    if (trimmed) chunks.push(trimmed);
  };
  for (const raw of sentences) {
    let sentence = raw.trim();
    if (!sentence) continue;
    while (sentence.length > limit) {
      // One very long sentence: cut at the last space that fits.
      push(current);
      current = '';
      const cut = sentence.lastIndexOf(' ', limit);
      const at = cut > limit / 2 ? cut : limit;
      push(sentence.slice(0, at));
      sentence = sentence.slice(at).trim();
    }
    if (!current) current = sentence;
    else if (current.length + 1 + sentence.length <= limit) {
      current = `${current} ${sentence}`;
    } else {
      push(current);
      current = sentence;
    }
  }
  push(current);
  return chunks;
};

/** The first spoken piece is one short sentence, so the voice starts quickly. */
export const FIRST_SEGMENT_MIN_CHARS = 12;
/** A first sentence longer than this is cut at a comma or space instead. */
export const FIRST_SEGMENT_MAX_CHARS = 160;

/** Ends of sentences (followed by a space) and line ends. */
const SENTENCE_END = /[.!?…]+["'”’)\]]*(?=\s)|\n/g;

/**
 * The next piece of a reply that is still being written, starting at
 * `consumed` in the speakable text. The first piece is one sentence so the
 * voice starts early; later pieces take every sentence finished so far (up
 * to the request limit), so a reply needs few speech requests. Unfinished
 * sentences wait unless the reply is `final`. Returns null when nothing is
 * ready yet.
 */
export const takeSpeechSegment = (
  spoken: string,
  consumed: number,
  options: {first: boolean; final: boolean},
  limit: number = SPEECH_CHUNK_CHARS,
): {text: string; end: number} | null => {
  const rest = spoken.slice(consumed);
  const lead = rest.length - rest.trimStart().length;
  if (!rest.trim()) return null;
  const finish = (cut: number) => {
    const text = rest.slice(0, cut).trim();
    return text ? {text, end: consumed + cut} : null;
  };
  const cutAtSpace = (max: number) => {
    const window = rest.slice(0, max + 1);
    const comma = window.lastIndexOf(', ');
    const space = window.lastIndexOf(' ');
    const at = comma > max / 2 ? comma + 1 : space > lead ? space : max;
    return finish(at);
  };
  const ends: number[] = [];
  for (const match of rest.matchAll(SENTENCE_END)) {
    ends.push((match.index ?? 0) + match[0].length);
  }
  if (options.first) {
    const end = ends.find(e => rest.slice(0, e).trim().length >= FIRST_SEGMENT_MIN_CHARS);
    if (end !== undefined && end <= FIRST_SEGMENT_MAX_CHARS) return finish(end);
    if (rest.length > FIRST_SEGMENT_MAX_CHARS) return cutAtSpace(FIRST_SEGMENT_MAX_CHARS);
    return options.final ? finish(Math.min(rest.length, limit)) : null;
  }
  if (options.final && rest.length <= limit) return finish(rest.length);
  const within = ends.filter(e => e <= limit);
  if (within.length) return finish(within[within.length - 1]);
  if (rest.length > limit) return cutAtSpace(limit);
  return options.final ? finish(rest.length) : null;
};

export const createCallSpeechProvider = (
  userId: string,
  providerOptions: {
    isOnlineMode?: () => boolean;
    getVoiceId?: () => string | null;
    /**
     * 'low' asks the server for its fastest voice model (a conversation);
     * 'standard' for its most expressive one.
     */
    latency?: 'low' | 'standard';
  } = {},
): CallSpeechProvider => {
  const isOnlineMode =
    providerOptions.isOnlineMode ??
    (() => localSettingsStore.get(userId, 'chat.onlineMode', null) === 'true');
  let capabilityChecked = false;
  let elevenlabsAvailable = false;
  const preparedAudioPaths = new Map<string, string>();
  const preparations = new Map<string, Promise<string | null>>();
  /** Why a preparation failed, so the fallback notice gives the real reason. */
  const preparationFailures = new Map<string, string>();
  const preparationControllers = new Set<AbortController>();
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  let activePlaybackController: AbortController | null = null;
  let cancellationSequence = 0;
  let disposed = false;
  // Speech operations this provider started that may still own native playback.
  let activeSpeechOperations = 0;
  const getVoiceId =
    providerOptions.getVoiceId ??
    (() => onlineVoiceSettingsStore.read(userId)?.id ?? null);
  const currentOwner = () =>
    userStore.getActiveSessionToken().userId === userId;
  const voiceStillCurrent = (voiceId: string | null) => {
    try {
      return currentOwner() && getVoiceId() === voiceId;
    } catch {
      return false;
    }
  };
  /** Per-operation outcome so overlapping requests never share an error. */
  interface RequestOutcome {
    reason?: string;
  }
  const withReason = (
    result: CallSpeechResult,
    outcome: RequestOutcome,
  ): CallSpeechResult =>
    result.source === 'native_tts' && outcome.reason
      ? {...result, fallbackReason: outcome.reason}
      : result;
  let cloudLinkAttempted = false;

  const normalizeText = (text: string): string => text.trim().substring(0, 512);

  const canUseElevenLabs = async (): Promise<boolean> => {
    if (
      disposed ||
      !isOnlineMode() ||
      userId === GUEST_USER_ID ||
      !currentOwner()
    )
      return false;

    let online = false;
    try {
      online = await cloudClient.isOnline();
    } catch {
      online = false;
    }
    if (!online) {
      return false;
    }

    let activeSessionToken = userStore.getActiveSessionToken();
    if (activeSessionToken.userId !== userId) {
      return false;
    }
    let hasToken =
      !!cloudClient.getAccessToken() || !!activeSessionToken.accessToken;
    if (!hasToken && !cloudLinkAttempted) {
      cloudLinkAttempted = true;
      try {
        await accountLinkService.completeDeferredCloudLink(userId);
        activeSessionToken = userStore.getActiveSessionToken();
        hasToken =
          !!cloudClient.getAccessToken() || !!activeSessionToken.accessToken;
      } catch {
        // Ignore link error and fall back to local TTS
      }
    }
    if (!hasToken) {
      return false;
    }

    return hasToken && currentOwner() && isOnlineMode() && !disposed;
  };

  const executeNativeTtsFallback = async (
    text: string,
    fallbackAudioPath: string | null | undefined,
    owner: number,
    outcome: RequestOutcome,
  ): Promise<CallSpeechResult> => {
    if (disposed || owner !== cancellationSequence)
      return {source: 'cancelled'};
    if (fallbackAudioPath) {
      try {
        const playable = await RNFS.exists(fallbackAudioPath);
        if (disposed || owner !== cancellationSequence)
          return {source: 'cancelled'};
        if (playable) {
          const success = await playSpeechFile(fallbackAudioPath);
          if (success) {
            return withReason({source: 'native_tts'}, outcome);
          }
        }
      } catch {
        // Fall through to react-native-tts synthesis
      }
    }
    if (disposed || owner !== cancellationSequence)
      return {source: 'cancelled'};
    await speakTextWithTts(text);
    return withReason({source: 'native_tts'}, outcome);
  };

  const requestElevenLabsAudio = async (
    text: string,
    controller: AbortController,
    timeoutMs: number,
    voiceId: string | null,
    outcome: RequestOutcome,
  ): Promise<string | null> => {
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    let audioPath: string | null = null;
    let callerOwnsFile = false;
    const stillWanted = () =>
      !controller.signal.aborted &&
      !disposed &&
      isOnlineMode() &&
      voiceStillCurrent(voiceId);

    try {
      if (!capabilityChecked) {
        const capability = await cloudClient.request<{
          provider: string;
          enabled: boolean;
        }>(
          '/v1/ai/tts/capabilities',
          {method: 'GET', signal: controller.signal},
          true,
        );
        if (!stillWanted()) return null;
        elevenlabsAvailable =
          capability.status === 'success' &&
          capability.data?.provider === 'elevenlabs' &&
          capability.data.enabled === true;
        // A temporary outage must not disable online voice for the lifetime of Chat.
        capabilityChecked = elevenlabsAvailable;
        if (!elevenlabsAvailable)
          outcome.reason =
            capability.error || 'ElevenLabs is unavailable on the server.';
      }
      // Never invoke the retired Gemini endpoint on an old/unmigrated server.
      if (!elevenlabsAvailable || !stillWanted()) return null;
      const cacheDir = `${RNFS.CachesDirectoryPath}/elevenlabs_tts`;
      await RNFS.mkdir(cacheDir).catch(() => undefined);
      // Recheck before the paid request: Stop, mode or voice may have changed.
      if (!stillWanted()) return null;

      const requestId = `tts_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;
      audioPath = `${cacheDir}/elevenlabs_${safeUserId}_${requestId}.mp3`;
      const result = await cloudClient.request<TtsApiResponse>(
        '/v1/ai/tts',
        {
          method: 'POST',
          body: JSON.stringify({
            requestId,
            text,
            provider: 'elevenlabs',
            ...(voiceId ? {voiceId} : {}),
            ...(providerOptions.latency === 'low' ? {latency: 'low'} : {}),
          }),
          signal: controller.signal,
        },
        true,
      );

      if (!stillWanted()) {
        if (timedOut) outcome.reason = TIMEOUT_REASON;
        return null;
      }

      if (
        result.status !== 'success' ||
        result.data?.provider !== 'elevenlabs' ||
        (voiceId !== null && result.data?.voice !== voiceId) ||
        result.data.mimeType !== 'audio/mpeg' ||
        typeof result.data.audioBase64 !== 'string' ||
        !result.data.audioBase64 ||
        result.data.audioBase64.length > 2666668 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(result.data.audioBase64)
      ) {
        outcome.reason =
          result.status !== 'success' && result.error
            ? result.error
            : 'ElevenLabs returned invalid audio.';
        return null;
      }

      await RNFS.writeFile(audioPath, result.data.audioBase64, 'base64');
      if (!stillWanted()) return null;
      callerOwnsFile = true;
      return audioPath;
    } catch {
      outcome.reason = timedOut
        ? TIMEOUT_REASON
        : 'Online voice could not connect. Try again.';
      return null;
    } finally {
      clearTimeout(timeoutId);
      if (timedOut && !outcome.reason) outcome.reason = TIMEOUT_REASON;
      if (!callerOwnsFile && audioPath) {
        RNFS.unlink(audioPath).catch(() => undefined);
      }
    }
  };

  const playElevenLabsAudio = async (
    audioPath: string,
    fallbackText: string,
    owner: number,
  ): Promise<CallSpeechResult> => {
    if (disposed || owner !== cancellationSequence || !isOnlineMode())
      return {source: 'cancelled'};
    try {
      const playbackFinished = await playSpeechFile(audioPath);
      if (playbackFinished && owner === cancellationSequence && !disposed) {
        return {source: 'elevenlabs'};
      }
    } catch {
      // If native audio player is unavailable, speak via react-native-tts
    }
    if (disposed || owner !== cancellationSequence)
      return {source: 'cancelled'};
    await speakTextWithTts(fallbackText);
    return {
      source: 'native_tts',
      fallbackReason:
        'Online audio could not play. Check media volume or try another voice.',
    };
  };

  const prepareText = async (text: string): Promise<void> => {
    const normalizedText = normalizeText(text);
    let voiceId: string | null;
    try {
      voiceId = getVoiceId();
    } catch {
      return;
    }
    const cacheKey = JSON.stringify([voiceId, normalizedText]);
    if (!normalizedText || disposed || preparedAudioPaths.has(cacheKey)) {
      return;
    }

    const existingPreparation = preparations.get(cacheKey);
    if (existingPreparation) {
      await existingPreparation;
      return;
    }

    const preparation = (async (): Promise<string | null> => {
      if (!(await canUseElevenLabs())) return null;
      const controller = new AbortController();
      const failure: RequestOutcome = {};
      preparationFailures.delete(cacheKey);
      preparationControllers.add(controller);
      try {
        const audioPath = await requestElevenLabsAudio(
          normalizedText,
          controller,
          PREPARATION_REQUEST_TIMEOUT_MS,
          voiceId,
          failure,
        );
        if (!audioPath) {
          if (failure.reason) preparationFailures.set(cacheKey, failure.reason);
          return null;
        }
        if (
          disposed ||
          controller.signal.aborted ||
          !isOnlineMode() ||
          !voiceStillCurrent(voiceId)
        ) {
          RNFS.unlink(audioPath).catch(() => undefined);
          return null;
        }
        preparedAudioPaths.set(cacheKey, audioPath);
        return audioPath;
      } finally {
        preparationControllers.delete(controller);
      }
    })();

    preparations.set(cacheKey, preparation);
    try {
      await preparation;
    } finally {
      if (preparations.get(cacheKey) === preparation) {
        preparations.delete(cacheKey);
      }
    }
  };

  const stopSpeech = async (): Promise<void> => {
    speechChain += 1;
    wakeStreams();
    cancellationSequence += 1;
    activePlaybackController?.abort();
    activePlaybackController = null;
    for (const controller of preparationControllers) controller.abort();
    await Promise.resolve(stopSpeechPlayback()).catch(() => undefined);
  };

  const runSpeakText = async (
    text: string,
    options?: {fallbackAudioPath?: string | null},
  ): Promise<CallSpeechResult> => {
    const normalizedText = normalizeText(text);
    if (disposed || !normalizedText) return {source: 'cancelled'};
    const outcome: RequestOutcome = {};
    // Offline speech must never depend on reading the online preference.
    let voiceId: string | null = null;
    let voiceReadable = true;
    try {
      voiceId = getVoiceId();
    } catch {
      voiceReadable = false;
    }
    const cacheKey = JSON.stringify([voiceId, normalizedText]);
    // A new visible read request replaces the previous owner, including pending network work.
    cancellationSequence += 1;
    const operationSequence = cancellationSequence;
    // Guests and alarm-launched calls may have no session row; offline speech
    // only requires that the active session did not change mid-operation.
    const initialSession = userStore.getActiveSessionToken().userId;
    const stillOwner = () =>
      !disposed &&
      operationSequence === cancellationSequence &&
      userStore.getActiveSessionToken().userId === initialSession;
    activePlaybackController?.abort();
    activePlaybackController = null;
    await Promise.resolve(stopSpeechPlayback()).catch(() => undefined);
    if (!stillOwner()) return {source: 'cancelled'};
    const fallback = () =>
      executeNativeTtsFallback(
        text,
        options?.fallbackAudioPath,
        operationSequence,
        outcome,
      );
    const online = await canUseElevenLabs();
    if (!stillOwner()) return {source: 'cancelled'};
    if (!online) return fallback();
    if (!voiceReadable) {
      outcome.reason = 'Choose an online voice again in Profile.';
      return fallback();
    }
    if (!voiceStillCurrent(voiceId)) return {source: 'cancelled'};

    let preparedPath = preparedAudioPaths.get(cacheKey) || null;
    if (!preparedPath) {
      const preparation = preparations.get(cacheKey);
      if (preparation) {
        const preparedResult = await waitForPreparation(preparation);
        if (!stillOwner() || !voiceStillCurrent(voiceId)) {
          return {source: 'cancelled'};
        }
        if (preparedResult === undefined || preparedResult === null) {
          outcome.reason =
            preparedResult === undefined
              ? TIMEOUT_REASON
              : preparationFailures.get(cacheKey) ??
                'Online voice could not be prepared. Try again.';
          preparationFailures.delete(cacheKey);
          return fallback();
        }
        preparedPath = preparedResult;
      }
    }

    if (preparedPath) {
      const playable = await RNFS.exists(preparedPath).catch(() => false);
      if (!stillOwner()) return {source: 'cancelled'};
      if (playable && voiceStillCurrent(voiceId)) {
        return playElevenLabsAudio(preparedPath, text, operationSequence);
      }
      preparedAudioPaths.delete(cacheKey);
    }

    const controller = new AbortController();
    activePlaybackController = controller;
    let audioPath: string | null = null;
    try {
      audioPath = await requestElevenLabsAudio(
        normalizedText,
        controller,
        PLAYBACK_REQUEST_TIMEOUT_MS,
        voiceId,
        outcome,
      );
      // Explicit Stop, a newer request, disposal or an account/voice change
      // cancels silently. A timeout alone still falls back to the device voice.
      if (!stillOwner() || !voiceStillCurrent(voiceId)) {
        return {source: 'cancelled'};
      }
      if (!audioPath) return fallback();
      return await playElevenLabsAudio(audioPath, text, operationSequence);
    } finally {
      if (activePlaybackController === controller) {
        activePlaybackController = null;
      }
      if (audioPath) {
        RNFS.unlink(audioPath).catch(() => undefined);
      }
    }
  };

  /** Bumped by each new speakText and by Stop, so a long reply stops between chunks. */
  let speechChain = 0;
  /** Streams waiting for more reply text; Stop wakes them so they can end. */
  const streamWakers = new Set<() => void>();
  function wakeStreams() {
    for (const wake of [...streamWakers]) wake();
  }

  /** A chunk is spoken once; its prepared audio is not kept for replay. */
  const releasePrepared = (chunk: string) => {
    let voiceId: string | null;
    try {
      voiceId = getVoiceId();
    } catch {
      return;
    }
    const key = JSON.stringify([voiceId, normalizeText(chunk)]);
    const path = preparedAudioPaths.get(key);
    if (path) {
      preparedAudioPaths.delete(key);
      RNFS.unlink(path).catch(() => undefined);
    }
  };

  const speakChunks = async (chunks: string[]): Promise<CallSpeechResult> => {
    const chain = ++speechChain;
    const current = () => chain === speechChain && !disposed;
    let fallbackReason: string | undefined;
    for (let index = 0; index < chunks.length; index += 1) {
      if (!current()) return {source: 'cancelled'};
      // Fetch the next piece while this one plays, so there is no gap.
      const next = chunks[index + 1];
      if (next) void prepareText(next).catch(() => undefined);
      const result = await runSpeakText(chunks[index]);
      releasePrepared(chunks[index]);
      if (result.source === 'cancelled' || !current()) {
        return {source: 'cancelled'};
      }
      if (result.source === 'native_tts') {
        // Online speech failed: read the rest with the device voice at once
        // instead of retrying ElevenLabs for every remaining piece.
        fallbackReason = result.fallbackReason;
        const rest = chunks.slice(index + 1).join(' ');
        if (rest) await speakTextWithTts(rest);
        if (!current()) return {source: 'cancelled'};
        return {
          source: 'native_tts',
          ...(fallbackReason ? {fallbackReason} : {}),
        };
      }
    }
    return {source: 'elevenlabs'};
  };

  const speakText = async (
    text: string,
    options?: {fallbackAudioPath?: string | null},
  ): Promise<CallSpeechResult> => {
    activeSpeechOperations += 1;
    try {
      const spoken = speakableText(text);
      const chunks = splitForSpeech(spoken);
      if (chunks.length <= 1 || options?.fallbackAudioPath) {
        speechChain += 1;
        return await runSpeakText(spoken || text, options);
      }
      return await speakChunks(chunks);
    } finally {
      activeSpeechOperations -= 1;
    }
  };

  const startSpeechStream = (): SpeechStream => {
    const chain = ++speechChain;
    const current = () => chain === speechChain && !disposed;
    let latest = '';
    let finished = false;
    let consumed = 0;
    let first = true;
    let wake: (() => void) | null = null;
    const notify = () => {
      const resolve = wake;
      wake = null;
      resolve?.();
    };

    /** The next piece to speak, waiting for more text when none is ready. */
    const nextSegment = async (): Promise<string | null> => {
      for (;;) {
        if (!current()) return null;
        const piece = takeSpeechSegment(speakableText(latest), consumed, {
          first,
          final: finished,
        });
        if (piece) {
          consumed = piece.end;
          first = false;
          return piece.text;
        }
        if (finished) return null;
        await new Promise<void>(resolve => {
          wake = resolve;
          streamWakers.add(notify);
        });
        streamWakers.delete(notify);
      }
    };

    let markComplete: () => void = () => undefined;
    const replyComplete = new Promise<void>(resolve => {
      markComplete = resolve;
    });
    let started = false;
    let resolveDone: (result: CallSpeechResult) => void = () => undefined;
    const done = new Promise<CallSpeechResult>(resolve => {
      resolveDone = resolve;
    });

    const run = async (): Promise<CallSpeechResult> => {
      activeSpeechOperations += 1;
      let fallbackReason: string | undefined;
      let deviceVoice = false;
      let spokeOnline = false;
      try {
        let upcoming = nextSegment();
        for (;;) {
          const piece = await upcoming;
          if (!piece || !current()) break;
          if (deviceVoice) {
            // Online speech already failed: the device voice reads the rest.
            upcoming = nextSegment();
            await speakTextWithTts(piece);
            continue;
          }
          // Synthesize this piece. The next one is cut once this audio exists
          // (taking every sentence written meanwhile, so fewer requests) or as
          // soon as the whole reply has arrived, whichever comes first.
          await Promise.race([
            prepareText(piece).catch(() => undefined),
            replyComplete,
          ]);
          if (!current()) break;
          upcoming = nextSegment();
          void upcoming
            .then(next => (next && current() ? prepareText(next) : undefined))
            .catch(() => undefined);
          const result = await runSpeakText(piece);
          releasePrepared(piece);
          if (result.source === 'cancelled' || !current()) {
            return {source: 'cancelled'};
          }
          if (result.source === 'native_tts') {
            deviceVoice = true;
            fallbackReason = result.fallbackReason;
          } else {
            spokeOnline = true;
          }
        }
        if (!current()) return {source: 'cancelled'};
        if (deviceVoice || !spokeOnline) {
          return {
            source: 'native_tts',
            ...(fallbackReason ? {fallbackReason} : {}),
          };
        }
        return {source: 'elevenlabs'};
      } catch {
        return {source: 'cancelled'};
      } finally {
        activeSpeechOperations -= 1;
      }
    };

    const begin = () => {
      if (started) return;
      started = true;
      void run().then(resolveDone);
    };

    return {
      update: (replySoFar: string) => {
        if (finished || !current()) return;
        latest = replySoFar;
        begin();
        notify();
      },
      finish: (finalReply: string) => {
        if (!finished && current()) {
          // Keep what was already spoken when the saved reply differs only in
          // letter case (lafina's name) or adds a note at the end.
          const said = speakableText(latest).slice(0, consumed).toLowerCase();
          if (
            consumed === 0 ||
            speakableText(finalReply).toLowerCase().startsWith(said)
          ) {
            latest = finalReply;
          }
          finished = true;
          markComplete();
          begin();
          notify();
        }
        if (!started) resolveDone({source: 'cancelled'});
        return done;
      },
      cancel: () => {
        if (!current()) return;
        finished = true;
        markComplete();
        void stopSpeech();
        if (!started) resolveDone({source: 'cancelled'});
      },
    };
  };

  const warmUp = async (): Promise<void> => {
    if (capabilityChecked || !(await canUseElevenLabs())) return;
    const capability = await cloudClient.request<{
      provider: string;
      enabled: boolean;
    }>('/v1/ai/tts/capabilities', {method: 'GET'}, true);
    if (
      !capabilityChecked &&
      capability.status === 'success' &&
      capability.data?.provider === 'elevenlabs' &&
      capability.data.enabled === true
    ) {
      elevenlabsAvailable = true;
      capabilityChecked = true;
    }
  };

  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    wakeStreams();
    cancellationSequence += 1;
    activePlaybackController?.abort();
    activePlaybackController = null;
    for (const controller of preparationControllers) controller.abort();
    // Only silence native playback this provider may own; disposing an idle
    // provider (for example a closed preview sheet) must not stop other speech.
    if (activeSpeechOperations > 0) {
      await Promise.resolve(stopSpeechPlayback()).catch(() => undefined);
    }
    await Promise.allSettled([...preparations.values()]);
    await Promise.all(
      [...preparedAudioPaths.values()].map(path =>
        RNFS.unlink(path).catch(() => undefined),
      ),
    );
    preparedAudioPaths.clear();
    preparations.clear();
    preparationFailures.clear();
  };

  return {
    speakText,
    stopSpeech,
    prepareText,
    startSpeechStream,
    warmUp,
    dispose,
  };
};
