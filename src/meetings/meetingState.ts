export type MeetingStatus =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'importing'
  | 'recording_complete'
  | 'transcribing'
  | 'transcription_complete'
  | 'generating_notes'
  | 'completed'
  | 'error'
  | 'cancelled';

export const STATUS_LABELS: Record<MeetingStatus, string> = {
  idle: 'Ready',
  recording: 'Recording',
  paused: 'Paused',
  importing: 'Preparing audio',
  recording_complete: 'Recorded',
  transcribing: 'Transcribing',
  transcription_complete: 'Transcribed',
  generating_notes: 'Writing notes',
  completed: 'Notes ready',
  error: 'Needs attention',
  cancelled: 'Cancelled',
};

const TRANSITIONS: Record<MeetingStatus, readonly MeetingStatus[]> = {
  idle: ['recording', 'importing'],
  recording: ['paused', 'recording_complete', 'error', 'cancelled'],
  paused: ['recording', 'recording_complete', 'error', 'cancelled'],
  importing: ['recording_complete', 'transcribing', 'error', 'cancelled'],
  recording_complete: ['transcribing', 'error', 'cancelled'],
  transcribing: ['transcription_complete', 'error', 'cancelled'],
  transcription_complete: ['generating_notes', 'transcribing', 'completed', 'error', 'cancelled'],
  generating_notes: ['completed', 'transcription_complete', 'error', 'cancelled'],
  completed: ['generating_notes', 'transcribing'],
  error: ['transcribing', 'generating_notes', 'recording_complete', 'transcription_complete'],
  cancelled: ['transcribing', 'generating_notes', 'recording_complete', 'transcription_complete'],
};

export const canTransition = (from: MeetingStatus, to: MeetingStatus): boolean =>
  from === to || TRANSITIONS[from].includes(to);

export const isBusy = (status: MeetingStatus): boolean =>
  status === 'recording' ||
  status === 'paused' ||
  status === 'importing' ||
  status === 'transcribing' ||
  status === 'generating_notes';

export const isInterruptible = (status: MeetingStatus): boolean =>
  status === 'importing' ||
  status === 'transcribing' ||
  status === 'generating_notes';

export interface MeetingFacts {
  hasAudio: boolean;
  hasTranscript: boolean;
  hasNotes: boolean;
}

export const recoveryStatus = (facts: MeetingFacts): MeetingStatus => {
  if (facts.hasNotes) return 'completed';
  if (facts.hasTranscript) return 'transcription_complete';
  if (facts.hasAudio) return 'recording_complete';
  return 'error';
};

export const PROCESSING_STAGES: ReadonlyArray<{ status: MeetingStatus; label: string }> = [
  { status: 'recording_complete', label: 'Audio saved on device' },
  { status: 'transcribing', label: 'Transcribing speech' },
  { status: 'transcription_complete', label: 'Transcript ready' },
  { status: 'generating_notes', label: 'Writing notes' },
  { status: 'completed', label: 'Notes ready' },
];

export const stageIndex = (status: MeetingStatus): number => {
  const idx = PROCESSING_STAGES.findIndex((stage) => stage.status === status);
  return idx >= 0 ? idx : 0;
};
