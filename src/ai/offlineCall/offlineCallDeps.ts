/**
 * Production wiring for the offline call: the native whisper.cpp + Silero VAD
 * capture, react-native-tts, and this account's Chat history.
 */
import {DeviceEventEmitter} from 'react-native';
import {chatStore} from '../../storage/chatStore';
import {studentFirstName} from '../localConversation';
import {
  cancelOfflineSpeechCapture,
  isMicrophoneBusyError,
  startOfflineSpeechCapture,
} from '../native/speechCapture';
import {ensureMicrophonePermission, isSTTAvailable} from '../stt/sttService';
import {initTts, startOwnedSpeech, stopOwnedSpeech} from '../tts/ttsService';
import type {OfflineCallDeps} from './offlineCallController';
import {offlineGreeting} from './spokenReplies';

export const defaultOfflineCallDeps = (
  userId: string,
  respond: OfflineCallDeps['respond'],
): OfflineCallDeps => ({
  respond,
  greeting: () => offlineGreeting(studentFirstName(userId)),
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
  voice: {
    ready: initTts,
    speak: text => startOwnedSpeech(text, 'offline-call'),
    stop: stopOwnedSpeech,
  },
  // Offline turns go to this account's general Chat, like an online call's.
  persistence: {
    userTurn: text => {
      chatStore.addGeneralMessage(userId, 'user', text);
    },
    assistantTurn: (text, heard) => {
      chatStore.addGeneralMessage(userId, 'assistant', text, {
        voiceInterrupted: heard === 'interrupted',
      });
    },
  },
  // Timings and outcomes only (never the student's words), for logcat.
  log: line => console.log(line),
});
