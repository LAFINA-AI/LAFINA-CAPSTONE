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

export const createCallSpeechProvider = (
  userId: string,
  providerOptions: {
    isOnlineMode?: () => boolean;
    getVoiceId?: () => string | null;
  } = {},
): CallSpeechProvider => {
  const isOnlineMode =
    providerOptions.isOnlineMode ??
    (() => localSettingsStore.get(userId, 'chat.onlineMode', null) === 'true');
  let capabilityChecked = false;
  let elevenlabsAvailable = false;
  const preparedAudioPaths = new Map<string, string>();
  const preparations = new Map<string, Promise<string | null>>();
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
      preparationControllers.add(controller);
      try {
        const audioPath = await requestElevenLabsAudio(
          normalizedText,
          controller,
          PREPARATION_REQUEST_TIMEOUT_MS,
          voiceId,
          {},
        );
        if (!audioPath) return null;
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
              : 'Online voice could not be prepared. Try again.';
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

  const speakText = async (
    text: string,
    options?: {fallbackAudioPath?: string | null},
  ): Promise<CallSpeechResult> => {
    activeSpeechOperations += 1;
    try {
      return await runSpeakText(text, options);
    } finally {
      activeSpeechOperations -= 1;
    }
  };

  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
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
  };

  return {
    speakText,
    stopSpeech,
    prepareText,
    dispose,
  };
};
