import { speechSettingsStore } from '../../storage/speechSettingsStore';
import {
  configureTts,
  isSpeechBusy,
  startOwnedSpeech,
  stopOwnedSpeech,
} from './ttsService';
import type { OwnedSpeechOutcome } from './ttsService';
import { getActiveOfflineCaptureId } from '../native/speechCapture';
import { meetingRecorder } from '../native/meetingRecorder';

/**
 * AGY-PORT 10: applies one account's explicit offline voice choice to the
 * shared react-native-tts engine. No account, no choice, or an unreadable
 * choice all mean AGY's automatic default.
 */
let appliedOwner: string | null = null;

export const applySpeechPreferences = async (userId: string | null): Promise<void> => {
  appliedOwner = userId;
  let configuration = null;
  if (userId) {
    try {
      const saved = speechSettingsStore.read(userId);
      if (saved.explicit) {
        configuration = { voiceId: saved.voiceId, rate: saved.rate, pitch: saved.pitch };
      }
    } catch (error) {
      console.warn('[Speech] Saved voice settings unavailable; using the default:', error);
    }
  }
  // A newer owner applied meanwhile: its call wins.
  if (appliedOwner !== userId) return;
  await configureTts(configuration);
};

export const getAppliedSpeechOwner = (): string | null => appliedOwner;

export type PreviewRefusal = 'speech_busy' | 'microphone_busy' | 'recording' | 'owner_changed';

export interface PreviewHandle {
  result: Promise<OwnedSpeechOutcome>;
  /** Stops this preview only; another session's speech is never stopped. */
  stop: () => Promise<void>;
}

const MEETING_CHECK_TIMEOUT_MS = 1500;

const meetingRecording = async (): Promise<boolean> => {
  try {
    return await new Promise<boolean>(resolve => {
      const timer = setTimeout(() => resolve(true), MEETING_CHECK_TIMEOUT_MS);
      meetingRecorder.isRecording().then(
        value => {
          clearTimeout(timer);
          resolve(Boolean(value));
        },
        () => {
          clearTimeout(timer);
          // No recorder in this build: nothing is recording.
          resolve(false);
        },
      );
    });
  } catch {
    return false;
  }
};

export const PREVIEW_TEXT = 'Hello. This is lafina, reading with your selected offline voice.';

/**
 * Plays the Preview for the signed-in owner, with that owner's saved choice
 * already applied. Refused while anything else speaks, while the microphone
 * is held, or while a meeting is recording (a timed-out check counts as
 * recording), so a Preview never interrupts or is captured by another session.
 */
export const startVoicePreview = async (
  userId: string,
): Promise<PreviewHandle | PreviewRefusal> => {
  if (!speechSettingsStore.isActive(userId)) return 'owner_changed';
  if (isSpeechBusy()) return 'speech_busy';
  if (getActiveOfflineCaptureId() !== null) return 'microphone_busy';
  if (await meetingRecording()) return 'recording';
  if (!speechSettingsStore.isActive(userId)) return 'owner_changed';
  await applySpeechPreferences(userId);
  if (isSpeechBusy()) return 'speech_busy';
  const work = startOwnedSpeech(PREVIEW_TEXT, `preview:${userId}`);
  return {
    result: work.result,
    stop: async () => {
      const token = await work.token;
      if (token !== null) await stopOwnedSpeech(token);
    },
  };
};
