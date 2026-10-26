import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, PermissionsAndroid, Platform} from 'react-native';
import type {
  SpeechInputCapabilities,
  SpeechInputClient,
  SpeechInputEnginePreference,
  SpeechInputEvent,
  SpeechInputLanguage,
} from '../../core/native/speechToText';

export interface MicrophonePermission {
  check(): Promise<boolean>;
  request(): Promise<'granted' | 'denied' | 'blocked'>;
}
export const microphonePermission: MicrophonePermission = {
  async check() {
    return (
      Platform.OS === 'android' &&
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
    );
  },
  async request() {
    if (Platform.OS !== 'android') return 'denied';
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED
      ? 'granted'
      : result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      ? 'blocked'
      : 'denied';
  },
};
type Phase = 'idle' | 'permission' | 'preparing' | 'recording' | 'transcribing';
type Active = {id: string; phase: Exclude<Phase, 'idle'>; generation: number};
let sequence = 0;
const nothingToStop = async () => undefined;
const failed =
  'Speech input could not finish. Your typed text remains available. Release the microphone button and try another hold or keep typing.';

function failure(reason?: string): string {
  switch (reason) {
    case 'PERMISSION_DENIED':
    case 'PERMISSION_REQUIRED':
    case 'PERMISSION_REVOKED':
    case 'MIC_PERMISSION_DENIED':
      return 'Microphone access is not allowed. You can enable it in Android app settings or continue typing.';
    case 'NO_SPEECH':
    case 'NO_AUDIO_SIGNAL':
    case 'SPEECH_TIMEOUT':
      return 'No speech was recognized. Release, hold again and speak after the recording message, or type your draft.';
    case 'MIC_BUSY':
    case 'BUSY':
    case 'RECOGNIZER_BUSY':
    case 'TOO_MANY_REQUESTS':
      return 'The microphone or speech engine is busy. Release and try again when the other recording has stopped. Typing remains available.';
    case 'LANGUAGE_UNAVAILABLE':
    case 'LANGUAGE_NOT_SUPPORTED':
    case 'LANGUAGE_UNSUPPORTED':
      return 'This offline engine cannot recognize the selected language right now. Try another available engine or continue typing. No voice data is downloaded here.';
    case 'NO_OFFLINE_ENGINE':
    case 'OFFLINE_ENGINE_UNAVAILABLE':
    case 'ANDROID_11_REQUIRES_WHISPER':
    case 'ON_DEVICE_UNAVAILABLE':
    case 'MODEL_UNAVAILABLE':
    case 'NATIVE_UNAVAILABLE':
      return 'An offline speech engine is unavailable on this device. Check Android speech settings or use a build with the verified local model. You can keep typing.';
    case 'PREPARATION_TIMEOUT':
    case 'RECOGNITION_TIMEOUT':
    case 'TRANSCRIPTION_TIMEOUT':
      return 'Offline speech took too long and was stopped. Your draft remains available; release and try a shorter hold or type instead.';
    case 'AUDIO_INTERRUPTED':
    case 'FOCUS_LOST':
    case 'FOCUS_DENIED':
      return 'Speech input was interrupted by another audio owner. Nothing will restart automatically. Release and hold again when ready, or keep typing.';
    default:
      return failed;
  }
}

/** Owns one visible hold; a delayed permission or preparation result cannot start a new hold. */
export function useSpeechInputSession({
  client,
  permission,
  language,
  engine,
  onBeforeCapture = nothingToStop,
}: {
  client: SpeechInputClient;
  permission: MicrophonePermission;
  language: SpeechInputLanguage;
  engine: SpeechInputEnginePreference;
  onBeforeCapture?: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState(
    'Hold the microphone button to prepare offline speech. Recording starts only while you keep holding.',
  );
  const [error, setError] = useState(false);
  const [capabilities, setCapabilities] =
    useState<SpeechInputCapabilities | null>(null);
  const [checking, setChecking] = useState(true);
  const [capabilityError, setCapabilityError] = useState('');
  const [transcript, setTranscript] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<SpeechInputEvent | null>(null);
  const mounted = useRef(false);
  const visible = useRef(true);
  const active = useRef<Active | null>(null);
  const generation = useRef(0);
  const refreshGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const serial = ++refreshGeneration.current;
    setChecking(true);
    setCapabilityError('');
    try {
      const result = await client.capabilities();
      if (mounted.current && serial === refreshGeneration.current) {
        setCapabilities(result);
      }
    } catch {
      if (mounted.current && serial === refreshGeneration.current) {
        setCapabilities(null);
        setCapabilityError(
          'Offline speech options could not be checked. Refresh them or continue typing.',
        );
      }
    } finally {
      if (mounted.current && serial === refreshGeneration.current) {
        setChecking(false);
      }
    }
  }, [client]);

  const cancel = useCallback(
    (
      reason = 'user_cancelled',
      message = 'Speech input cancelled. Your typed draft remains available.',
    ) => {
      const previous = active.current;
      active.current = null;
      const serial = ++generation.current;
      if (mounted.current) {
        setPhase('idle');
        setNotice(message);
        setError(false);
      }
      if (previous) {
        void client.cancel(previous.id, reason).catch(() => {
          if (mounted.current && generation.current === serial) {
            setError(true);
            setNotice(failed);
          }
        });
      }
    },
    [client],
  );

  useEffect(() => {
    mounted.current = true;
    generation.current++;
    visible.current =
      AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive';
    const unsubscribe = client.subscribe(event => {
      const current = active.current;
      if (!mounted.current || !current || event.sessionId !== current.id)
        return;
      if (event.type === 'preparing') {
        current.phase = 'preparing';
        setPhase('preparing');
        setNotice(
          'Preparing offline speech. Keep holding; the microphone has not reported recording yet.',
        );
      } else if (event.type === 'recording') {
        current.phase = 'recording';
        setPhase('recording');
        setNotice(
          'Recording now. Keep holding to speak; release to transcribe. Recording is limited to 15 seconds.',
        );
      } else if (event.type === 'transcribing') {
        current.phase = 'transcribing';
        setPhase('transcribing');
        setNotice(
          'Recording stopped. Transcribing on this device… You can still type your draft.',
        );
      } else {
        active.current = null;
        setPhase('idle');
        setMeasurement(event);
        if (event.type === 'result' && event.transcript?.trim()) {
          setTranscript(event.transcript);
          setError(false);
          setNotice(
            'Speech recognized. Review the words below before replacing or confirming your draft. Nothing has been scheduled.',
          );
        } else {
          setError(event.type !== 'cancelled');
          setNotice(
            event.type === 'cancelled'
              ? 'Speech input stopped. Your typed draft remains available.'
              : failure(event.reason),
          );
        }
      }
    });
    const background = AppState.addEventListener('change', state => {
      visible.current = state === 'active';
      if (!visible.current) {
        cancel(
          'app_backgrounded',
          'Speech input stopped while the app was hidden. Hold again when you return; your typed draft remains available.',
        );
        void client.dispose().catch(() => undefined);
      }
    });
    void refresh();
    return () => {
      mounted.current = false;
      visible.current = false;
      const previous = active.current;
      active.current = null;
      unsubscribe();
      background.remove();
      // Queue cancellation/disposal immediately, before another visible owner starts.
      if (previous)
        void client
          .cancel(previous.id, 'panel_unmounted')
          .catch(() => undefined);
      void client.dispose().catch(() => undefined);
    };
  }, [cancel, client, refresh]);

  async function begin() {
    if (active.current || !visible.current || checking) return;
    const current: Active = {
      id: `hold_${Date.now().toString(36)}_${sequence++}`,
      phase: 'permission',
      generation: ++generation.current,
    };
    active.current = current;
    setPhase('permission');
    setError(false);
    setNotice(
      'Checking microphone permission. Keep holding; recording has not started.',
    );
    const stillHeld = () =>
      mounted.current &&
      visible.current &&
      active.current === current &&
      generation.current === current.generation;
    try {
      const allowed = await permission.check();
      if (!stillHeld()) return;
      if (!allowed) {
        const result = await permission.request();
        if (!stillHeld()) return;
        // The OS dialog can consume the release gesture. Never capture on its grant.
        active.current = null;
        setPhase('idle');
        setError(result !== 'granted');
        setNotice(
          result === 'granted'
            ? 'Microphone access allowed. Release the button, then hold again to record.'
            : result === 'blocked'
            ? 'Microphone access is blocked. Enable it in Android app settings or keep typing. Nothing was recorded.'
            : 'Microphone access was not granted. Nothing was recorded; typing remains available.',
        );
        void refresh();
        return;
      }
      await onBeforeCapture();
      if (!stillHeld()) return;
      current.phase = 'preparing';
      setPhase('preparing');
      setNotice(
        'Preparing offline speech. Keep holding until recording starts.',
      );
      const result = await client.start(current.id, language, engine);
      if (!stillHeld()) {
        if (result.accepted)
          void client
            .cancel(current.id, 'hold_no_longer_active')
            .catch(() => undefined);
        return;
      }
      if (!result.accepted) {
        active.current = null;
        setPhase('idle');
        setError(true);
        setNotice(failure(result.reason));
      }
    } catch {
      if (stillHeld()) {
        active.current = null;
        setPhase('idle');
        setError(true);
        setNotice(failed);
        void client
          .cancel(current.id, 'preparation_failed')
          .catch(() => undefined);
      }
    }
  }

  function release() {
    const current = active.current;
    if (!current || current.phase === 'transcribing') return;
    if (current.phase !== 'recording') {
      cancel(
        'released_before_recording',
        'Hold released before recording was ready. Nothing will start later; hold again when you are ready.',
      );
      return;
    }
    current.phase = 'transcribing';
    setPhase('transcribing');
    setNotice(
      'Recording stopped. Transcribing on this device… You can still type your draft.',
    );
    void client
      .stop(current.id)
      .then(result => {
        if (
          mounted.current &&
          active.current === current &&
          !result.accepted &&
          result.reason !== 'ALREADY_TRANSCRIBING'
        ) {
          cancel('stop_not_accepted', failure(result.reason));
          setError(true);
        }
      })
      .catch(() => {
        if (mounted.current && active.current === current) {
          cancel('stop_failed', failed);
          setError(true);
        }
      });
  }

  return {
    phase,
    notice,
    error,
    checking,
    capabilities,
    capabilityError,
    transcript,
    setTranscript,
    measurement,
    busy: phase !== 'idle',
    begin: () => {
      void begin();
    },
    release,
    cancel: () => cancel(),
    refresh: () => {
      void refresh();
    },
  };
}
