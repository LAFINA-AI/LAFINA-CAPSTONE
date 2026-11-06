/**
 * AGY-PORT 05: shared offline capture slot, bounded watchdog and "microphone busy".
 *
 * Adapted from the LAFINA donor `__tests__/ai/speechCaptureWatchdog.test.ts`
 * (blob 6c7259cf). Jest mocks the native module; nothing here proves real
 * microphone, AudioRecord or Whisper behaviour on a phone.
 */
import {NativeModules} from 'react-native';
import {
  cancelOfflineSpeechCapture,
  getActiveOfflineCaptureId,
  isMicrophoneBusyError,
  MAX_CAPTURE_DURATION_MS,
  MicrophoneBusyError,
  startOfflineSpeechCapture,
  stopOfflineSpeechCapture,
} from '../../src/ai/native/speechCapture';
import type {OfflineSpeechResult} from '../../src/ai/native/speechCapture';
import {transcribeUtterance} from '../../src/ai/stt/sttService';

const original = NativeModules.LafinaSpeechToText;

const nativeResult = (
  captureId: string,
  transcript = 'snooze',
): OfflineSpeechResult => ({
  captureId,
  transcript,
  speechDetected: true,
  cancelled: false,
  captureDurationMs: 1_200,
  inferenceDurationMs: 400,
});

const busyError = (code: string) =>
  Object.assign(
    new Error('Microphone is currently in use by meeting recorder.'),
    {
      code,
    },
  );

const opts = {
  mode: 'manual' as const,
  bargeIn: false,
  context: 'main_mic' as const,
};

describe('AGY-PORT 05 offline capture ownership', () => {
  afterEach(() => {
    NativeModules.LafinaSpeechToText = original;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('cancel settles at once, discards the late native result and clears the watchdog', async () => {
    jest.useFakeTimers();
    let resolveNative!: (value: OfflineSpeechResult) => void;
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn(
        () =>
          new Promise<OfflineSpeechResult>(
            resolve => (resolveNative = resolve),
          ),
      ),
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening: jest.fn().mockResolvedValue(true),
    };
    const capture = startOfflineSpeechCapture(opts);
    await cancelOfflineSpeechCapture(capture.captureId);
    await expect(capture.result).resolves.toMatchObject({
      captureId: capture.captureId,
      cancelled: true,
      transcript: '',
    });
    expect(jest.getTimerCount()).toBe(0);
    expect(getActiveOfflineCaptureId()).toBeNull();
    // The native worker returns later with text: nobody sees it.
    resolveNative(nativeResult(capture.captureId, 'delete everything'));
    await expect(capture.result).resolves.toMatchObject({transcript: ''});
  });

  test('a stale cancel for an earlier capture never touches the current one', async () => {
    const cancelListening = jest.fn().mockResolvedValue(false);
    let resolveSecond!: (value: OfflineSpeechResult) => void;
    let calls = 0;
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn((options: {captureId: string}) => {
        calls += 1;
        if (calls === 1)
          return Promise.resolve(nativeResult(options.captureId));
        return new Promise<OfflineSpeechResult>(
          resolve => (resolveSecond = resolve),
        );
      }),
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening,
    };
    const first = startOfflineSpeechCapture(opts);
    await first.result;
    const second = startOfflineSpeechCapture(opts);
    await cancelOfflineSpeechCapture(first.captureId);
    expect(getActiveOfflineCaptureId()).toBe(second.captureId);
    resolveSecond(nativeResult(second.captureId, 'add task'));
    await expect(second.result).resolves.toMatchObject({
      transcript: 'add task',
    });
  });

  test('a second capture while one is active is a recoverable busy error, not a release', () => {
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn(() => new Promise(() => undefined)),
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening: jest.fn().mockResolvedValue(true),
    };
    const active = startOfflineSpeechCapture(opts);
    let thrown: unknown;
    try {
      startOfflineSpeechCapture(opts);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MicrophoneBusyError);
    expect(isMicrophoneBusyError(thrown)).toBe(true);
    expect(getActiveOfflineCaptureId()).toBe(active.captureId);
    void cancelOfflineSpeechCapture(active.captureId);
  });

  test('native MIC_IN_USE and CAPTURE_BUSY rejections are classified as busy', async () => {
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn(() => Promise.reject(busyError('MIC_IN_USE'))),
      stopListening: jest.fn().mockResolvedValue(false),
      cancelListening: jest.fn().mockResolvedValue(false),
    };
    const capture = startOfflineSpeechCapture(opts);
    const error = await capture.result.catch((e: unknown) => e);
    expect(isMicrophoneBusyError(error)).toBe(true);
    expect(getActiveOfflineCaptureId()).toBeNull();
    expect(isMicrophoneBusyError(busyError('CAPTURE_BUSY'))).toBe(true);
    expect(isMicrophoneBusyError(busyError('OFFLINE_STT_ERROR'))).toBe(false);
    expect(isMicrophoneBusyError(new Error('MIC_IN_USE'))).toBe(false);
  });

  test('synchronous native start failure releases the slot without leaving a timer', () => {
    jest.useFakeTimers();
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn(() => {
        throw new Error('audio unavailable');
      }),
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening: jest.fn().mockResolvedValue(true),
    };
    expect(() => startOfflineSpeechCapture(opts)).toThrow('audio unavailable');
    expect(getActiveOfflineCaptureId()).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('the watchdog is bounded, fires once, cancels natively and frees the slot', async () => {
    jest.useFakeTimers();
    const cancelListening = jest.fn().mockResolvedValue(true);
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn(() => new Promise(() => undefined)),
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening,
    };
    const stuck = startOfflineSpeechCapture({
      ...opts,
      mode: 'automatic',
      context: 'reminder_call',
    });
    const settled = stuck.result.catch((error: Error) => error);
    await jest.advanceTimersByTimeAsync(MAX_CAPTURE_DURATION_MS - 1);
    expect(getActiveOfflineCaptureId()).toBe(stuck.captureId);
    await jest.advanceTimersByTimeAsync(1);
    const error = await settled;
    expect((error as Error).message).toContain('exceeded');
    expect(cancelListening).toHaveBeenCalledTimes(1);
    expect(cancelListening).toHaveBeenCalledWith(stuck.captureId);
    expect(getActiveOfflineCaptureId()).toBeNull();
    expect(jest.getTimerCount()).toBe(0);

    NativeModules.LafinaSpeechToText.startListening = jest.fn(
      (options: {captureId: string}) =>
        Promise.resolve(nativeResult(options.captureId, 'acknowledge')),
    );
    const recovered = startOfflineSpeechCapture(opts);
    await expect(recovered.result).resolves.toMatchObject({
      transcript: 'acknowledge',
    });
  });

  test('a capture that finishes in budget clears its watchdog exactly once', async () => {
    jest.useFakeTimers();
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn((options: {captureId: string}) =>
        Promise.resolve(nativeResult(options.captureId)),
      ),
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening: jest.fn().mockResolvedValue(true),
    };
    const capture = startOfflineSpeechCapture(opts);
    await capture.result;
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a mismatched native owner is rejected rather than accepted', async () => {
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn(() =>
        Promise.resolve(nativeResult('someone-else')),
      ),
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening: jest.fn().mockResolvedValue(true),
    };
    const capture = startOfflineSpeechCapture(opts);
    await expect(capture.result).rejects.toThrow('did not match');
    expect(getActiveOfflineCaptureId()).toBeNull();
  });

  test('stop forwards only the matching capture id', async () => {
    const stopListening = jest.fn().mockResolvedValue(true);
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn(() => new Promise(() => undefined)),
      stopListening,
      cancelListening: jest.fn().mockResolvedValue(true),
    };
    const capture = startOfflineSpeechCapture(opts);
    await stopOfflineSpeechCapture(capture.captureId);
    expect(stopListening).toHaveBeenCalledWith(capture.captureId);
    await cancelOfflineSpeechCapture(capture.captureId);
  });

  test('transcribeUtterance still reports a timeout even though cancel settles at once', async () => {
    jest.useFakeTimers();
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn(() => new Promise(() => undefined)),
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening: jest.fn().mockResolvedValue(true),
    };
    const pending = transcribeUtterance({timeoutMs: 1_000}).catch(
      (e: Error) => e,
    );
    await jest.advanceTimersByTimeAsync(1_000);
    const error = await pending;
    expect((error as Error).message).toContain('timed out');
    expect(getActiveOfflineCaptureId()).toBeNull();
  });
});
