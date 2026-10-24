import RNFS from 'react-native-fs';
import { cloudClient } from './cloudClient';
import { accountLinkService } from './accountLinkService';
import { userStore } from '../storage/userStore';
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
  new Promise((resolve) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      settled = true;
      resolve(undefined);
    }, PLAYBACK_REQUEST_TIMEOUT_MS);

    void preparation
      .then((path) => {
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
): CallSpeechProvider => {
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

  const canUseGemini = async (): Promise<boolean> => {
    if (disposed) return false;

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
    return entitlement.entitled;
  };

  const executeNativeTtsFallback = async (
    text: string,
    fallbackAudioPath?: string | null,
  ): Promise<CallSpeechResult> => {
    if (fallbackAudioPath) {
      try {
        const playable = await RNFS.exists(fallbackAudioPath);
        if (playable) {
          const success = await playSpeechFile(fallbackAudioPath);
          if (success) {
            return { source: 'native_tts' };
          }
        }
      } catch {
        // Fall through to react-native-tts synthesis
      }
    }
    await speakTextWithTts(text);
    return { source: 'native_tts' };
  };

  const requestGeminiAudio = async (
    text: string,
    controller: AbortController,
    timeoutMs: number,
  ): Promise<string | null> => {
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let wavPath: string | null = null;
    let callerOwnsFile = false;

    try {
      const cacheDir = `${RNFS.CachesDirectoryPath}/gemini_tts`;
      await RNFS.mkdir(cacheDir).catch(() => undefined);

      const requestId = `tts_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;
      wavPath = `${cacheDir}/gemini_${safeUserId}_${requestId}.wav`;
      const result = await cloudClient.request<TtsApiResponse>(
        '/v1/ai/tts',
        {
          method: 'POST',
          body: JSON.stringify({ requestId, text }),
          signal: controller.signal,
        },
        true,
      );

      if (controller.signal.aborted || disposed) return null;

      if (result.status !== 'success' || !result.data?.audioBase64) {
        return null;
      }

      await RNFS.writeFile(wavPath, result.data.audioBase64, 'base64');
      if (controller.signal.aborted || disposed) return null;
      callerOwnsFile = true;
      return wavPath;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
      if (!callerOwnsFile && wavPath) {
        RNFS.unlink(wavPath).catch(() => undefined);
      }
    }
  };

  const playGeminiAudio = async (
    wavPath: string,
    fallbackText: string,
  ): Promise<CallSpeechResult> => {
    try {
      const playbackFinished = await playSpeechFile(wavPath);
      if (playbackFinished) {
        return { source: 'gemini' };
      }
    } catch {
      // If native WAV player is unavailable, speak via react-native-tts
    }
    await speakTextWithTts(fallbackText);
    return { source: 'native_tts' };
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
      if (!(await canUseGemini()) || disposed) return null;

      const controller = new AbortController();
      preparationControllers.add(controller);
      try {
        const wavPath = await requestGeminiAudio(
          normalizedText,
          controller,
          PREPARATION_REQUEST_TIMEOUT_MS,
        );
        if (!wavPath) return null;
        if (disposed) {
          RNFS.unlink(wavPath).catch(() => undefined);
          return null;
        }
        preparedAudioPaths.set(normalizedText, wavPath);
        return wavPath;
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
    await Promise.resolve(stopSpeechPlayback()).catch(() => undefined);
  };

  const speakText = async (
    text: string,
    options?: { fallbackAudioPath?: string | null },
  ): Promise<CallSpeechResult> => {
    const operationSequence = cancellationSequence;
    const normalizedText = normalizeText(text);
    if (disposed) return { source: 'gemini' };
    if (!normalizedText || !(await canUseGemini())) {
      return executeNativeTtsFallback(text, options?.fallbackAudioPath);
    }
    if (operationSequence !== cancellationSequence || disposed) {
      return { source: 'gemini' };
    }

    let preparedPath = preparedAudioPaths.get(normalizedText) || null;
    if (!preparedPath) {
      const preparation = preparations.get(normalizedText);
      if (preparation) {
        const preparedResult = await waitForPreparation(preparation);
        if (operationSequence !== cancellationSequence || disposed) {
          return { source: 'gemini' };
        }
        if (preparedResult === undefined || preparedResult === null) {
          return executeNativeTtsFallback(text, options?.fallbackAudioPath);
        }
        preparedPath = preparedResult;
      }
    }

    if (preparedPath) {
      const playable = await RNFS.exists(preparedPath).catch(() => false);
      if (playable) {
        return playGeminiAudio(preparedPath, text);
      }
      preparedAudioPaths.delete(normalizedText);
    }

    const controller = new AbortController();
    activePlaybackController = controller;
    let wavPath: string | null = null;
    try {
      wavPath = await requestGeminiAudio(
        normalizedText,
        controller,
        PLAYBACK_REQUEST_TIMEOUT_MS,
      );
      if (
        operationSequence !== cancellationSequence ||
        controller.signal.aborted ||
        disposed
      ) {
        return { source: 'gemini' };
      }
      if (!wavPath) {
        return executeNativeTtsFallback(text, options?.fallbackAudioPath);
      }
      return await playGeminiAudio(wavPath, text);
    } finally {
      if (activePlaybackController === controller) {
        activePlaybackController = null;
      }
      if (wavPath) {
        RNFS.unlink(wavPath).catch(() => undefined);
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
      [...preparedAudioPaths.values()].map((path) =>
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
