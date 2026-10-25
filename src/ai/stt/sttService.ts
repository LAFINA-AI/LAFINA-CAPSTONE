import {
  DeviceEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {
  startOfflineSpeechCapture,
  stopOfflineSpeechCapture,
  cancelOfflineSpeechCapture,
  hasOfflineSpeechCapture,
  getActiveOfflineCaptureId,
} from '../native/speechCapture';
import type {
  OfflineSpeechCaptureHandle,
  OfflineSpeechCaptureOptions,
  OfflineSpeechResult,
} from '../native/speechCapture';

export type {
  OfflineSpeechCaptureHandle,
  OfflineSpeechCaptureOptions,
  OfflineSpeechResult,
  OfflineSpeechCaptureMode,
} from '../native/speechCapture';

export interface SpeechEventListeners {
  onStarted?: (event: { captureId?: string }) => void;
  onPartialResult?: (event: { captureId?: string; transcript?: string }) => void;
  onFinalResult?: (event: { captureId?: string; transcript?: string }) => void;
}

/**
 * Checks whether offline Speech-to-Text native bridge and models are available.
 */
export const isSTTAvailable = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' && process.env.NODE_ENV !== 'test') return false;
  const nativeModule = NativeModules.LafinaSpeechToText;
  if (!nativeModule) return false;
  if (typeof nativeModule.isAvailable === 'function') {
    try {
      return Boolean(await nativeModule.isAvailable());
    } catch {
      return false;
    }
  }
  return hasOfflineSpeechCapture();
};

/**
 * Checks or requests Android microphone permission.
 */
export const ensureMicrophonePermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' && process.env.NODE_ENV !== 'test') return true;
  try {
    const hasPermission = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (hasPermission) return true;

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'LAFINA needs microphone access for offline speech-to-text.',
        buttonPositive: 'Allow',
        buttonNegative: 'Cancel',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn('[sttService] Error requesting microphone permission:', error);
    return false;
  }
};

/**
 * Starts push-to-talk manual speech capture.
 */
export const startListening = (
  options: Partial<OfflineSpeechCaptureOptions> = {},
): OfflineSpeechCaptureHandle => {
  const fullOptions: OfflineSpeechCaptureOptions = {
    mode: options.mode || 'manual',
    bargeIn: options.bargeIn ?? false,
    context: options.context || 'main_mic',
  };
  return startOfflineSpeechCapture(fullOptions);
};

/**
 * Stops an active speech capture and completes transcription.
 */
export const stopListening = async (captureId: string): Promise<boolean> => {
  return stopOfflineSpeechCapture(captureId);
};

/**
 * Cancels an active speech capture and discards recorded audio.
 */
export const cancelListening = async (captureId: string): Promise<boolean> => {
  return cancelOfflineSpeechCapture(captureId);
};

/**
 * High-level helper to capture and transcribe a single utterance with timeout.
 */
export const transcribeUtterance = async (
  options: Partial<OfflineSpeechCaptureOptions> & { timeoutMs?: number } = {},
): Promise<OfflineSpeechResult> => {
  const handle = startListening(options);
  const timeoutMs = options.timeoutMs ?? 10000;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(async () => {
      await cancelListening(handle.captureId).catch(() => undefined);
      reject(new Error(`Speech recognition timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([handle.result, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Subscribes to native speech events emitted during transcription.
 */
export const addSpeechListener = (listeners: SpeechEventListeners): (() => void) => {
  const subs: Array<{ remove: () => void }> = [];

  if (listeners.onStarted) {
    subs.push(DeviceEventEmitter.addListener('onSpeechStarted', listeners.onStarted));
  }
  if (listeners.onPartialResult) {
    subs.push(
      DeviceEventEmitter.addListener('onSpeechPartialResult', listeners.onPartialResult),
    );
  }
  if (listeners.onFinalResult) {
    subs.push(
      DeviceEventEmitter.addListener('onSpeechFinalResult', listeners.onFinalResult),
    );
  }

  return () => {
    subs.forEach((sub) => sub.remove());
  };
};

export const sttService = {
  isAvailable: isSTTAvailable,
  ensureMicrophonePermission,
  startListening,
  stopListening,
  cancelListening,
  transcribeUtterance,
  addSpeechListener,
  getActiveCaptureId: getActiveOfflineCaptureId,
};
