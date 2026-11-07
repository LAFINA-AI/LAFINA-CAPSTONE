import RNFS from 'react-native-fs';
import {cloudClient} from './cloudClient';
import {accountLinkService} from './accountLinkService';
import {userStore} from '../storage/userStore';
import {localSettingsStore} from '../storage/localSettingsStore';
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

interface TtsApiResponse {
  provider: 'elevenlabs';
  requestId: string;
  audioBase64: string;
  mimeType: string;
  model: string;
  voice: string;
  createdAt: string;
}

interface EntitlementSnapshot {
  role: string;
  entitled: boolean;
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
  providerOptions: {isOnlineMode?: () => boolean} = {},
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
  let roleRefreshAttempted = false;
  let cloudLinkAttempted = false;

  const normalizeText = (text: string): string => text.trim().substring(0, 512);

  const getEntitlementSnapshot = (): EntitlementSnapshot => {
    const localUser = userStore.getUserById(userId);
    const role = localUser?.role ?? 'unknown';
    return {
      role,
      entitled: localUser?.role === 'student_pro',
    };
  };

  const canUseElevenLabs = async (): Promise<boolean> => {
    if (disposed || !isOnlineMode()) return false;

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

    let entitlement = getEntitlementSnapshot();
    if (!entitlement.entitled && !roleRefreshAttempted) {
      roleRefreshAttempted = true;
      try {
        const refresh = await accountLinkService.refreshCloudProfile(userId);
        if (refresh.status === 'success') {
          entitlement = getEntitlementSnapshot();
        }
      } catch {
        // Ignore refresh error
      }
    }

    entitlement = getEntitlementSnapshot();
    return entitlement.entitled && isOnlineMode() && !disposed;
  };

  const executeNativeTtsFallback = async (
    text: string,
    fallbackAudioPath: string | null | undefined,
    owner: number,
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
            return {source: 'native_tts'};
          }
        }
      } catch {
        // Fall through to react-native-tts synthesis
      }
    }
    if (disposed || owner !== cancellationSequence)
      return {source: 'cancelled'};
    await speakTextWithTts(text);
    return {source: 'native_tts'};
  };

  const requestElevenLabsAudio = async (
    text: string,
    controller: AbortController,
    timeoutMs: number,
  ): Promise<string | null> => {
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let audioPath: string | null = null;
    let callerOwnsFile = false;

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
        if (controller.signal.aborted || disposed || !isOnlineMode())
          return null;
        elevenlabsAvailable =
          capability.status === 'success' &&
          capability.data?.provider === 'elevenlabs' &&
          capability.data.enabled === true;
        // A temporary outage must not disable online voice for the lifetime of Chat.
        capabilityChecked = elevenlabsAvailable;
      }
      // Never invoke the retired Gemini endpoint on an old/unmigrated server.
      if (
        !elevenlabsAvailable ||
        controller.signal.aborted ||
        disposed ||
        !isOnlineMode()
      )
        return null;
      const cacheDir = `${RNFS.CachesDirectoryPath}/elevenlabs_tts`;
      await RNFS.mkdir(cacheDir).catch(() => undefined);

      const requestId = `tts_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;
      audioPath = `${cacheDir}/elevenlabs_${safeUserId}_${requestId}.mp3`;
      const result = await cloudClient.request<TtsApiResponse>(
        '/v1/ai/tts',
        {
          method: 'POST',
          body: JSON.stringify({requestId, text, provider: 'elevenlabs'}),
          signal: controller.signal,
        },
        true,
      );

      if (controller.signal.aborted || disposed || !isOnlineMode()) return null;

      if (
        result.status !== 'success' ||
        result.data?.provider !== 'elevenlabs' ||
        result.data.mimeType !== 'audio/mpeg' ||
        typeof result.data.audioBase64 !== 'string' ||
        !result.data.audioBase64 ||
        result.data.audioBase64.length > 2666668 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(result.data.audioBase64)
      ) {
        return null;
      }

      await RNFS.writeFile(audioPath, result.data.audioBase64, 'base64');
      if (controller.signal.aborted || disposed || !isOnlineMode()) return null;
      callerOwnsFile = true;
      return audioPath;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
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
    return {source: 'native_tts'};
  };

  const prepareText = async (text: string): Promise<void> => {
    const normalizedText = normalizeText(text);
    if (!normalizedText || disposed || preparedAudioPaths.has(normalizedText)) {
      return;
    }

    const existingPreparation = preparations.get(normalizedText);
    if (existingPreparation) {
      await existingPreparation;
      return;
    }

    const preparation = (async (): Promise<string | null> => {
      if (!(await canUseElevenLabs()) || disposed) return null;

      const controller = new AbortController();
      preparationControllers.add(controller);
      try {
        const audioPath = await requestElevenLabsAudio(
          normalizedText,
          controller,
          PREPARATION_REQUEST_TIMEOUT_MS,
        );
        if (!audioPath) return null;
        if (disposed || controller.signal.aborted || !isOnlineMode()) {
          RNFS.unlink(audioPath).catch(() => undefined);
          return null;
        }
        preparedAudioPaths.set(normalizedText, audioPath);
        return audioPath;
      } finally {
        preparationControllers.delete(controller);
      }
    })();

    preparations.set(normalizedText, preparation);
    try {
      await preparation;
    } finally {
      if (preparations.get(normalizedText) === preparation) {
        preparations.delete(normalizedText);
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

  const speakText = async (
    text: string,
    options?: {fallbackAudioPath?: string | null},
  ): Promise<CallSpeechResult> => {
    const normalizedText = normalizeText(text);
    if (disposed || !normalizedText) return {source: 'cancelled'};
    // A new visible read request replaces the previous owner, including pending network work.
    cancellationSequence += 1;
    const operationSequence = cancellationSequence;
    activePlaybackController?.abort();
    activePlaybackController = null;
    await Promise.resolve(stopSpeechPlayback()).catch(() => undefined);
    if (disposed || operationSequence !== cancellationSequence)
      return {source: 'cancelled'};
    if (!normalizedText || !(await canUseElevenLabs())) {
      if (disposed || operationSequence !== cancellationSequence)
        return {source: 'cancelled'};
      return executeNativeTtsFallback(
        text,
        options?.fallbackAudioPath,
        operationSequence,
      );
    }
    if (operationSequence !== cancellationSequence || disposed) {
      return {source: 'cancelled'};
    }

    let preparedPath = preparedAudioPaths.get(normalizedText) || null;
    if (!preparedPath) {
      const preparation = preparations.get(normalizedText);
      if (preparation) {
        const preparedResult = await waitForPreparation(preparation);
        if (operationSequence !== cancellationSequence || disposed) {
          return {source: 'cancelled'};
        }
        if (preparedResult === undefined || preparedResult === null) {
          if (disposed || operationSequence !== cancellationSequence)
            return {source: 'cancelled'};
          return executeNativeTtsFallback(
            text,
            options?.fallbackAudioPath,
            operationSequence,
          );
        }
        preparedPath = preparedResult;
      }
    }

    if (preparedPath) {
      const playable = await RNFS.exists(preparedPath).catch(() => false);
      if (playable) {
        return playElevenLabsAudio(preparedPath, text, operationSequence);
      }
      preparedAudioPaths.delete(normalizedText);
    }

    const controller = new AbortController();
    activePlaybackController = controller;
    let audioPath: string | null = null;
    try {
      audioPath = await requestElevenLabsAudio(
        normalizedText,
        controller,
        PLAYBACK_REQUEST_TIMEOUT_MS,
      );
      if (
        operationSequence !== cancellationSequence ||
        controller.signal.aborted ||
        disposed
      ) {
        return {source: 'cancelled'};
      }
      if (!audioPath) {
        if (disposed || operationSequence !== cancellationSequence)
          return {source: 'cancelled'};
        return executeNativeTtsFallback(
          text,
          options?.fallbackAudioPath,
          operationSequence,
        );
      }
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

  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    cancellationSequence += 1;
    activePlaybackController?.abort();
    activePlaybackController = null;
    for (const controller of preparationControllers) controller.abort();
    await Promise.resolve(stopSpeechPlayback()).catch(() => undefined);
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
