import {NativeModules} from 'react-native';

export type OfflineSpeechCaptureMode = 'manual' | 'automatic';

export interface OfflineSpeechCaptureOptions {
  mode: OfflineSpeechCaptureMode;
  bargeIn: boolean;
  context: 'main_mic' | 'reminder_call';
}

export interface OfflineSpeechResult {
  captureId: string;
  transcript: string;
  speechDetected: boolean;
  cancelled: boolean;
  captureDurationMs: number;
  inferenceDurationMs: number;
}

export interface OfflineSpeechCaptureHandle {
  captureId: string;
  result: Promise<OfflineSpeechResult>;
}

interface OfflineSpeechNativeModule {
  startListening: (
    options: OfflineSpeechCaptureOptions & {captureId: string},
  ) => Promise<OfflineSpeechResult>;
  stopListening: (captureId: string) => Promise<boolean>;
  cancelListening: (captureId: string) => Promise<boolean>;
  warmup?: () => Promise<boolean>;
}

/**
 * Native rejection codes meaning "someone else owns the microphone right now"
 * (AGY-PORT 05). `MIC_IN_USE`: a meeting recording (or the other recorder) holds the
 * token-fenced lease. `CAPTURE_BUSY`: an earlier capture is still finishing.
 * Both are recoverable; typing keeps working and no recording is stopped.
 */
export const MICROPHONE_BUSY_CODES: readonly string[] = [
  'MIC_IN_USE',
  'CAPTURE_BUSY',
];

/** Thrown by `startOfflineSpeechCapture` when this JS side already owns the capture slot. */
export class MicrophoneBusyError extends Error {
  readonly code = 'CAPTURE_BUSY';
  constructor(message = 'Another offline speech capture is already active.') {
    super(message);
    this.name = 'MicrophoneBusyError';
  }
}

/** Whether an error says the microphone is owned elsewhere (not a broken recognizer). */
export const isMicrophoneBusyError = (error: unknown): boolean => {
  if (error instanceof MicrophoneBusyError) return true;
  const code = (error as {code?: unknown} | null)?.code;
  return typeof code === 'string' && MICROPHONE_BUSY_CODES.includes(code);
};

/**
 * Hard ceiling on how long one capture may own the JavaScript capture slot
 * (donor `speechCapture.ts`, blob e8103725). A native result that never settles
 * (killed audio HAL, wedged inference) would otherwise block every later capture
 * until the app restarts. The native lease is separate: it stays with the native
 * worker until that worker really returns.
 */
export const MAX_CAPTURE_DURATION_MS = 90_000;

let captureSequence = 0;
let activeCaptureId: string | null = null;
let activeCancellation: {captureId: string; settle: () => void} | null = null;

const getNativeModule = (): OfflineSpeechNativeModule | null => {
  const module = NativeModules.LafinaSpeechToText as
    | OfflineSpeechNativeModule
    | undefined;
  return module?.startListening ? module : null;
};

const cancelNativeQuietly = (
  module: OfflineSpeechNativeModule,
  captureId: string,
): void => {
  try {
    void module.cancelListening(captureId).catch((error: unknown) => {
      console.warn(
        '[SpeechCapture] Could not cancel the timed-out capture:',
        error,
      );
    });
  } catch (error) {
    console.warn(
      '[SpeechCapture] Could not cancel the timed-out capture:',
      error,
    );
  }
};

/**
 * Returns whether the shared on-device Silero VAD and Whisper.cpp bridge is linked.
 */
export const hasOfflineSpeechCapture = (): boolean =>
  getNativeModule() !== null;

/**
 * Preloads the Whisper model in the background. Fire-and-forget: a failed or missing
 * warmup just means the next capture loads the model itself, as before.
 */
export const warmupOfflineSpeech = (): void => {
  getNativeModule()?.warmup?.().catch(() => undefined);
};

/**
 * Atomically starts the single shared offline speech capture.
 *
 * @throws When the native runtime is unavailable, or `MicrophoneBusyError` when
 * another capture owns the slot.
 */
export const startOfflineSpeechCapture = (
  options: OfflineSpeechCaptureOptions,
): OfflineSpeechCaptureHandle => {
  const module = getNativeModule();
  if (!module) {
    throw new Error('Offline speech recognition is unavailable.');
  }
  if (activeCaptureId !== null) {
    throw new MicrophoneBusyError();
  }

  captureSequence += 1;
  const captureId = `${options.context}-${Date.now()}-${captureSequence}`;
  activeCaptureId = captureId;

  let nativeResult: Promise<OfflineSpeechResult>;
  try {
    nativeResult = module.startListening({...options, captureId});
  } catch (error) {
    activeCaptureId = null;
    throw error;
  }

  // A cancel settles the result at once; the late native result is discarded.
  const cancellation = new Promise<OfflineSpeechResult>(resolve => {
    activeCancellation = {
      captureId,
      settle: () =>
        resolve({
          captureId,
          transcript: '',
          speechDetected: false,
          cancelled: true,
          captureDurationMs: 0,
          inferenceDurationMs: 0,
        }),
    };
  });

  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const captureTimeout = new Promise<never>((_resolve, reject) => {
    watchdog = setTimeout(() => {
      watchdog = null;
      cancelNativeQuietly(module, captureId);
      reject(
        new Error(
          `Offline speech capture exceeded ${MAX_CAPTURE_DURATION_MS}ms and was stopped.`,
        ),
      );
    }, MAX_CAPTURE_DURATION_MS);
  });

  const result = Promise.race([
    nativeResult.then(value => {
      if (!value || value.captureId !== captureId) {
        throw new Error(
          'Offline speech result did not match the active capture owner.',
        );
      }
      return value;
    }),
    captureTimeout,
    cancellation,
  ]).finally(() => {
    // Exactly once: the watchdog is cleared here or already fired.
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
    if (activeCaptureId === captureId) activeCaptureId = null;
    if (activeCancellation?.captureId === captureId) activeCancellation = null;
  });
  // A held button can fail (for example "microphone busy") before release attaches
  // its consumer. Keep the rejection for that consumer without an unhandled warning.
  result.catch(() => undefined);
  return {captureId, result};
};

/**
 * Ends a matching manual capture and preserves its recorded audio for Whisper.
 */
export const stopOfflineSpeechCapture = async (
  captureId: string,
): Promise<boolean> => {
  const module = getNativeModule();
  if (!module) return false;
  return module.stopListening(captureId);
};

/**
 * Cancels a matching capture and discards its recorded audio and late result.
 * The JS result settles as cancelled at once; the native worker keeps the
 * microphone lease until it actually returns.
 */
export const cancelOfflineSpeechCapture = async (
  captureId: string,
): Promise<boolean> => {
  if (activeCancellation?.captureId === captureId) {
    activeCancellation.settle();
    activeCancellation = null;
  }
  const module = getNativeModule();
  if (!module) {
    if (activeCaptureId === captureId) activeCaptureId = null;
    return false;
  }

  try {
    return await module.cancelListening(captureId);
  } finally {
    if (activeCaptureId === captureId) activeCaptureId = null;
  }
};

/**
 * Returns the JavaScript-side owner of the shared capture slot for diagnostics.
 */
export const getActiveOfflineCaptureId = (): string | null => activeCaptureId;
