export {
  isSTTAvailable,
  ensureMicrophonePermission,
  startListening,
  stopListening,
  cancelListening,
  transcribeUtterance,
  addSpeechListener,
  sttService,
} from './sttService';

export type {
  OfflineSpeechCaptureHandle,
  OfflineSpeechCaptureOptions,
  OfflineSpeechResult,
  OfflineSpeechCaptureMode,
  SpeechEventListeners,
} from './sttService';
