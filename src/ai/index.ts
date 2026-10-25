export {
  initTts,
  initTTS,
  isTtsAvailable,
  isTTSAvailable,
  getSelectedOfflineVoiceId,
  selectOfflineVoice,
  playSpeechFile,
  stopSpeechPlayback,
  stopSpeaking,
  speakTextWithTts,
  speakText,
  preCacheReminderAudio,
  deletePreCachedReminderAudio,
  ttsService,
} from './tts/ttsService';

export {
  isSTTAvailable,
  ensureMicrophonePermission,
  startListening,
  stopListening,
  cancelListening,
  transcribeUtterance,
  addSpeechListener,
  sttService,
} from './stt';

export type {
  OfflineSpeechCaptureHandle,
  OfflineSpeechCaptureOptions,
  OfflineSpeechResult,
  OfflineSpeechCaptureMode,
  SpeechEventListeners,
} from './stt';

export {
  startOfflineSpeechCapture,
  stopOfflineSpeechCapture,
  cancelOfflineSpeechCapture,
  hasOfflineSpeechCapture,
  getActiveOfflineCaptureId,
} from './native/speechCapture';
