/**
 * Production wiring for the offline call: the native whisper.cpp + Silero VAD
 * capture, react-native-tts, and this account's Chat history.
 */
import {DeviceEventEmitter} from 'react-native';
import {chatStore} from '../../storage/chatStore';
import {callGreetingFor} from '../callGreetings';
import {
  clearCallUstpSources,
  consumeCallUstpCitation,
} from '../voiceActions/callUstpCitations';
import {
  cancelOfflineSpeechCapture,
  isMicrophoneBusyError,
  startOfflineSpeechCapture,
} from '../native/speechCapture';
import {ensureMicrophonePermission, isSTTAvailable} from '../stt/sttService';
import {initTts, startOwnedSpeech, stopOwnedSpeech} from '../tts/ttsService';
import {
  OFFLINE_CALL_END_SILENCE_MS,
  OFFLINE_CALL_LEAD_IN_IGNORE_MS,
} from './offlineCallController';
import type {OfflineCallDeps} from './offlineCallController';

export const defaultOfflineCallDeps = (
  userId: string,
  respond: OfflineCallDeps['respond'],
): OfflineCallDeps => ({
  respond,
  greeting: () => callGreetingFor(userId, 'offline'),
  speech: {
    isAvailable: isSTTAvailable,
    ensurePermission: ensureMicrophonePermission,
    start: startOfflineSpeechCapture,
    cancel: cancelOfflineSpeechCapture,
    isBusyError: isMicrophoneBusyError,
    onSpeechStarted: listener => {
      const subscription = DeviceEventEmitter.addListener(
        'onSpeechStarted',
        (event: {captureId?: string}) => {
          if (event?.captureId) listener(event.captureId);
        },
      );
      return () => subscription.remove();
    },
    onCaptureEnded: listener => {
      const subscription = DeviceEventEmitter.addListener(
        'onSpeechCaptureEnded',
        (event: {captureId?: string; speechDetected?: boolean}) => {
          if (event?.captureId)
            listener(event.captureId, event.speechDetected === true);
        },
      );
      return () => subscription.remove();
    },
  },
  // A shorter end-of-turn pause, and the first moments after LAFINA spoke
  // ignored so her own voice in the room is not heard as the student.
  capture: {
    endSilenceMs: OFFLINE_CALL_END_SILENCE_MS,
    leadInIgnoreMs: OFFLINE_CALL_LEAD_IN_IGNORE_MS,
  },
  voice: {
    ready: initTts,
    speak: (text, admit) => startOwnedSpeech(text, 'offline-call', admit),
    stop: stopOwnedSpeech,
  },
  // Offline turns go to this account's general Chat, like an online call's.
  persistence: {
    onReset: () => {
      clearCallUstpSources(userId);
    },
    userTurn: text => {
      clearCallUstpSources(userId);
      chatStore.addGeneralMessage(userId, 'user', text);
    },
    assistantTurn: (text, heard) => {
      const citation = consumeCallUstpCitation(userId, text);
      chatStore.addGeneralMessage(userId, 'assistant', text, {
        voiceInterrupted: heard === 'interrupted',
        ...(citation ? citation : {}),
      });
    },
  },
  // Timings and outcomes only (never the student's words), for logcat.
  log: line => console.log(line),
});
