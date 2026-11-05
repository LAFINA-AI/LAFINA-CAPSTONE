const { NativeModules } = require('react-native');
NativeModules.LafinaReminder = {
  scheduleExactAlarm: jest.fn(() => Promise.resolve(true)),
  cancelAlarm: jest.fn(() => Promise.resolve(true)),
  consumePendingCall: jest.fn(() => Promise.resolve(null)),
  finishIncomingCall: jest.fn(() => Promise.resolve(true)),
  startActiveCall: jest.fn(() => Promise.resolve(true)),
  stopActiveCall: jest.fn(() => Promise.resolve(true)),
  getPermissionStatus: jest.fn(() =>
    Promise.resolve({
      canScheduleExactAlarms: true,
      canUseFullScreenIntent: true,
      notificationsEnabled: true,
    }),
  ),
  openExactAlarmSettings: jest.fn(() => Promise.resolve(true)),
  openFullScreenIntentSettings: jest.fn(() => Promise.resolve(true)),
  openNotificationSettings: jest.fn(() => Promise.resolve(true)),
  startRingtone: jest.fn(() => Promise.resolve(true)),
  stopRingtone: jest.fn(() => Promise.resolve(true)),
};

NativeModules.LafinaAudioPlayer = {
  playAudio: jest.fn(() => Promise.resolve(true)),
  stopAudio: jest.fn(() => Promise.resolve(true)),
};

NativeModules.LafinaSpeechToText = {
  startListening: jest.fn((options) =>
    Promise.resolve({
      captureId: options?.captureId || 'mock-cap',
      transcript: 'mock transcript',
      speechDetected: true,
      cancelled: false,
      captureDurationMs: 120,
      inferenceDurationMs: 60,
    }),
  ),
  transcribe: jest.fn((options) =>
    Promise.resolve({
      captureId: options?.captureId || 'mock-cap',
      transcript: 'mock transcript',
      speechDetected: true,
      cancelled: false,
      captureDurationMs: 120,
      inferenceDurationMs: 60,
    }),
  ),
  stopListening: jest.fn(() => Promise.resolve(true)),
  cancelListening: jest.fn(() => Promise.resolve(true)),
  isAvailable: jest.fn(() => Promise.resolve(true)),
  release: jest.fn(() => Promise.resolve(true)),
};

NativeModules.LafinaMeetingRecorder = {
  getAvailableStorageMB: jest.fn(() => Promise.resolve(2048)),
  startRecording: jest.fn((id) => Promise.resolve(id || 'mock-meeting')),
  pauseRecording: jest.fn(() => Promise.resolve(true)),
  resumeRecording: jest.fn(() => Promise.resolve(true)),
  stopRecording: jest.fn(() =>
    Promise.resolve({
      meetingId: 'mock-meeting',
      chunkFiles: ['/data/meetings/mock-meeting/chunk_0000.wav'],
      chunkDurationsMs: [30000],
    }),
  ),
  isRecording: jest.fn(() => Promise.resolve(false)),
  isPaused: jest.fn(() => Promise.resolve(false)),
  getRecoveryState: jest.fn(() => Promise.resolve(null)),
  clearRecoveryState: jest.fn(() => Promise.resolve(true)),
  transcribeChunkWithTimestamps: jest.fn((_path, offsetMs = 0) =>
    Promise.resolve([
      {
        start_ms: Number(offsetMs) + 1000,
        end_ms: Number(offsetMs) + 4500,
        text: 'Welcome to today lecture on operating systems.',
      },
    ]),
  ),
  deleteAudioFile: jest.fn(() => Promise.resolve(true)),
  importAudioFile: jest.fn((_fileUri, meetingId) =>
    Promise.resolve({
      meetingId: meetingId || 'imported-meeting-1',
      durationSeconds: 30,
      audioBytes: 960044,
      chunkFiles: [
        `/data/meetings/${meetingId || 'imported-meeting-1'}/chunk_000.wav`,
      ],
      chunkDurationsMs: [30000],
    }),
  ),
  listMeetingAudio: jest.fn(() =>
    Promise.resolve({
      chunks: [
        {
          path: '/data/meetings/mock-meeting/chunk_0000.wav',
          durationMs: 30000,
          sizeBytes: 960044,
        },
      ],
      totalBytes: 960044,
    }),
  ),
  deleteMeetingAudio: jest.fn(() => Promise.resolve(true)),
};

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        return function MockLucideIcon(props) {
          return React.createElement(View, { ...props, accessibilityLabel: String(prop) });
        };
      },
    },
  );
});

jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockDateTimePicker(props) {
    return React.createElement(View, { ...props, testID: 'datetimepicker' });
  };
});

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  isErrorWithCode: jest.fn(
    (err) => err && typeof err === 'object' && 'code' in err,
  ),
  errorCodes: {
    OPERATION_CANCELED: 'OPERATION_CANCELED',
    IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
    UNABLE_TO_OPEN_FILE_TYPE: 'UNABLE_TO_OPEN_FILE_TYPE',
    NULL_PRESENTER: 'NULL_PRESENTER',
  },
}));

jest.mock('react-native-fs', () => ({
  readFile: jest.fn(() => Promise.resolve('')),
  writeFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  exists: jest.fn(() => Promise.resolve(false)),
  mkdir: jest.fn(() => Promise.resolve()),
  copyFile: jest.fn(() => Promise.resolve()),
  TemporaryDirectoryPath: '/temp',
  DocumentDirectoryPath: '/documents',
  CachesDirectoryPath: '/cache',
}));

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: {
    open: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() =>
    Promise.resolve({
      isConnected: true,
      isInternetReachable: true,
    }),
  ),
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('react-native-tts', () => {
  const listeners = new Map();
  const mockTts = {
    getInitStatus: jest.fn(() => Promise.resolve('success')),
    voices: jest.fn(() =>
      Promise.resolve([
        {
          id: 'en-us-x-sfg-local',
          name: 'en-USOffline',
          language: 'en-US',
          quality: 400,
          networkConnectionRequired: false,
          notInstalled: false,
        },
      ]),
    ),
    setDefaultLanguage: jest.fn(() => Promise.resolve()),
    setDefaultRate: jest.fn(() => Promise.resolve()),
    setDefaultPitch: jest.fn(() => Promise.resolve()),
    setDefaultVoice: jest.fn(() => Promise.resolve()),
    addEventListener: jest.fn((event, handler) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(handler);
      return {
        remove: () => {
          listeners.get(event)?.delete(handler);
        },
      };
    }),
    speak: jest.fn(() => {
      setTimeout(() => {
        const handlers = listeners.get('tts-finish');
        if (handlers) {
          for (const fn of handlers) {
            fn();
          }
        }
      }, 5);
      return 'utterance-1';
    }),
    stop: jest.fn(() => Promise.resolve()),
  };
  return {
    __esModule: true,
    default: mockTts,
  };
});
