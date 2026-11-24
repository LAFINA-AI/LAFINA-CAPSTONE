import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

export interface MeetingRecordingResult {
  meetingId: string;
  chunkFiles: string[];
  chunkDurationsMs: number[];
}

export interface MeetingRecoveryState {
  meetingId: string;
  title: string;
  status: 'recording' | 'paused' | 'stopped';
  updatedAt: number;
  chunkFiles: string[];
  chunkDurationsMs: number[];
}

export interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface MeetingAudioChunk {
  path: string;
  durationMs: number;
  sizeBytes: number;
}

export interface MeetingAudioListing {
  chunks: MeetingAudioChunk[];
  totalBytes: number;
}

export interface ImportedAudioResult {
  meetingId: string;
  durationSeconds: number;
  audioBytes: number;
  chunkFiles: string[];
  chunkDurationsMs: number[];
}

interface LafinaMeetingRecorderNative {
  getAvailableStorageMB(): Promise<number>;
  startRecording(meetingId: string, title: string): Promise<string>;
  pauseRecording(): Promise<boolean>;
  resumeRecording(): Promise<boolean>;
  stopRecording(): Promise<MeetingRecordingResult>;
  stopRecordingForMeeting?(meetingId: string): Promise<MeetingRecordingResult>;
  isRecording(): Promise<boolean>;
  isPaused(): Promise<boolean>;
  getRecoveryState(): Promise<MeetingRecoveryState | null>;
  clearRecoveryState(): Promise<boolean>;
  transcribeChunkWithTimestamps(
    audioPath: string,
    chunkOffsetMs: number,
  ): Promise<TranscriptSegment[]>;
  deleteAudioFile(path: string): Promise<boolean>;
  listMeetingAudio(meetingId: string): Promise<MeetingAudioListing>;
  deleteMeetingAudio(meetingId: string): Promise<boolean>;
  importAudioFile(
    fileUri: string,
    meetingId: string,
  ): Promise<ImportedAudioResult>;
  cancelAudioImport?: () => Promise<boolean>;
}

const getNative = (): LafinaMeetingRecorderNative | null => {
  if (Platform.OS !== 'android') return null;
  const mod = NativeModules?.LafinaMeetingRecorder as
    | LafinaMeetingRecorderNative
    | undefined;
  return mod && typeof mod.startRecording === 'function' ? mod : null;
};

/**
 * Final audit F1: set synchronously when this app asks the recorder to start,
 * cleared when that start fails or a stop returns. Lets a check that cannot
 * wait for the native isRecording() answer (Preview admission, immediately
 * before playback) still see a recording this app is starting or running.
 * isRecording() stays the native truth.
 */
let recordingClaimed = false;
let claimedMeetingId: string | null = null;

export const meetingRecorder = {
  isAvailable: (): boolean => getNative() !== null,

  /** True from this app's start request until its stop returns (final audit F1). */
  isRecordingClaimed: (): boolean => recordingClaimed,

  requestPermission: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message:
            'LAFINA needs microphone access to record and transcribe your lecture or study session on-device.',
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  },

  getAvailableStorageMB: async (): Promise<number> => {
    const mod = getNative();
    if (!mod) return 0;
    return mod.getAvailableStorageMB();
  },

  start: async (meetingId: string, title: string): Promise<string> => {
    const mod = getNative();
    if (!mod) throw new Error('Meeting recorder unavailable on this platform');
    recordingClaimed = true;
    claimedMeetingId = meetingId;
    try {
      return await mod.startRecording(meetingId, title);
    } catch (error) {
      if (claimedMeetingId === meetingId) {
        recordingClaimed = false;
        claimedMeetingId = null;
      }
      throw error;
    }
  },

  pause: async (): Promise<boolean> => {
    const mod = getNative();
    if (!mod) return false;
    return mod.pauseRecording();
  },

  resume: async (): Promise<boolean> => {
    const mod = getNative();
    if (!mod) return false;
    return mod.resumeRecording();
  },

  stop: async (meetingId?: string): Promise<MeetingRecordingResult> => {
    const mod = getNative();
    if (!mod) {
      recordingClaimed = false;
      return {meetingId: '', chunkFiles: [], chunkDurationsMs: []};
    }
    let stopped = false;
    try {
      if (meetingId && mod.stopRecordingForMeeting) {
        const result = await mod.stopRecordingForMeeting(meetingId);
        stopped = true;
        return result;
      }
      // Older installed native versions cannot stop another meeting by accident.
      if (
        meetingId &&
        (await mod.getRecoveryState())?.meetingId !== meetingId
      ) {
        return {meetingId, chunkFiles: [], chunkDurationsMs: []};
      }
      const result = await mod.stopRecording();
      stopped = true;
      return result;
    } finally {
      if (stopped && (!meetingId || claimedMeetingId === meetingId)) {
        recordingClaimed = false;
        claimedMeetingId = null;
      }
    }
  },

  isRecording: async (): Promise<boolean> => {
    const mod = getNative();
    if (!mod) return false;
    return mod.isRecording();
  },

  isPaused: async (): Promise<boolean> => {
    const mod = getNative();
    if (!mod) return false;
    return mod.isPaused();
  },

  getRecoveryState: async (): Promise<MeetingRecoveryState | null> => {
    const mod = getNative();
    if (!mod) return null;
    return mod.getRecoveryState();
  },

  clearRecoveryState: async (): Promise<boolean> => {
    const mod = getNative();
    if (!mod) return false;
    return mod.clearRecoveryState();
  },

  transcribeChunk: async (
    audioPath: string,
    chunkOffsetMs: number,
  ): Promise<TranscriptSegment[]> => {
    const mod = getNative();
    if (!mod) return [];
    return mod.transcribeChunkWithTimestamps(audioPath, chunkOffsetMs);
  },

  deleteAudioFile: async (path: string): Promise<boolean> => {
    const mod = getNative();
    if (!mod) return false;
    return mod.deleteAudioFile(path);
  },

  listMeetingAudio: async (meetingId: string): Promise<MeetingAudioListing> => {
    const mod = getNative();
    if (!mod || typeof mod.listMeetingAudio !== 'function') {
      return {chunks: [], totalBytes: 0};
    }
    return mod.listMeetingAudio(meetingId);
  },

  deleteMeetingAudio: async (meetingId: string): Promise<boolean> => {
    const mod = getNative();
    if (!mod || typeof mod.deleteMeetingAudio !== 'function') return false;
    return mod.deleteMeetingAudio(meetingId);
  },

  importAudioFile: async (
    fileUri: string,
    meetingId: string,
  ): Promise<ImportedAudioResult> => {
    const mod = getNative();
    if (!mod || typeof mod.importAudioFile !== 'function') {
      throw new Error('Audio import is not available in this build');
    }
    return mod.importAudioFile(fileUri, meetingId);
  },

  cancelAudioImport: async (): Promise<boolean> => {
    const mod = getNative();
    if (!mod || typeof mod.cancelAudioImport !== 'function') return false;
    return mod.cancelAudioImport();
  },
};
