import { speechSettingsStore } from '../../storage/speechSettingsStore';
import {
  configureTts,
  initTts,
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

export type PreviewRefusal =
  | 'speech_busy'
  | 'microphone_busy'
  | 'recording'
  | 'owner_changed'
  | 'cancelled';

export interface PreviewHandle {
  result: Promise<OwnedSpeechOutcome>;
  /** Stops this preview only; another session's speech is never stopped. */
  stop: () => Promise<void>;
}

/**
 * Final audit F1: one Preview's admission ticket, created when Preview is
 * pressed and carried through every awaited startup step. Cancelling it (Stop,
 * sheet close, app background, unmount) before playback means the Preview
 * never starts; after playback began it stops this Preview only.
 */
export class PreviewTicket {
  private cancelledFlag = false;
  private token: number | null = null;

  constructor(readonly userId: string) {}

  get cancelled(): boolean {
    return this.cancelledFlag;
  }

  cancel = async (): Promise<void> => {
    this.cancelledFlag = true;
    const token = this.token;
    this.token = null;
    if (token !== null) await stopOwnedSpeech(token);
  };

  /** Playback started with this token; a ticket already cancelled stops it at once. */
  attach = async (token: number): Promise<void> => {
    this.token = token;
    if (this.cancelledFlag) await this.cancel();
  };
}

export const createPreviewTicket = (userId: string): PreviewTicket => new PreviewTicket(userId);

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
 * The synchronous admission conditions. `applied`: the owner's choice was
 * applied, so a later apply for someone else also means the owner changed.
 */
const admissionRefusal = (ticket: PreviewTicket, applied: boolean): PreviewRefusal | null => {
  if (ticket.cancelled) return 'cancelled';
  if (!speechSettingsStore.isActive(ticket.userId)) return 'owner_changed';
  if (applied && appliedOwner !== ticket.userId) return 'owner_changed';
  if (isSpeechBusy()) return 'speech_busy';
  if (getActiveOfflineCaptureId() !== null) return 'microphone_busy';
  if (meetingRecorder.isRecordingClaimed()) return 'recording';
  return null;
};

/**
 * Plays the Preview for the signed-in owner, with that owner's saved choice
 * already applied. Refused while anything else speaks, while the microphone
 * is held, or while a meeting is recording (a timed-out check counts as
 * recording), so a Preview never interrupts or is captured by another session.
 *
 * Final audit F1: the conditions are checked again after every awaited step
 * (recording check, applying the choice, starting the engine) and one last
 * time synchronously immediately before Tts.speak. A handle is returned only
 * once playback really started; until then `ticket.cancel()` is the Stop.
 */
export const startVoicePreview = async (
  userId: string,
  ticket: PreviewTicket = createPreviewTicket(userId),
): Promise<PreviewHandle | PreviewRefusal> => {
  if (ticket.userId !== userId) return 'owner_changed';
  let refusal = admissionRefusal(ticket, false);
  if (refusal) return refusal;
  if (await meetingRecording()) return ticket.cancelled ? 'cancelled' : 'recording';
  refusal = admissionRefusal(ticket, false);
  if (refusal) return refusal;

  await applySpeechPreferences(userId);
  refusal = admissionRefusal(ticket, true);
  if (refusal) return refusal;

  const ready = await initTts();
  refusal = admissionRefusal(ticket, true);
  if (refusal) return refusal;
  if (!ready) {
    // As before: the sheet says Preview could not play; text still works.
    return {result: Promise.resolve('failed'), stop: ticket.cancel};
  }
  if (await meetingRecording()) return ticket.cancelled ? 'cancelled' : 'recording';

  let late: PreviewRefusal | null = null;
  const work = startOwnedSpeech(PREVIEW_TEXT, `preview:${userId}`, () => {
    late = admissionRefusal(ticket, true);
    return late === null;
  });
  const token = await work.token;
  if (token === null) {
    const outcome = await work.result;
    if (outcome === 'refused') return late ?? 'cancelled';
    return {result: Promise.resolve(outcome), stop: ticket.cancel};
  }
  await ticket.attach(token);
  return {result: work.result, stop: ticket.cancel};
};
