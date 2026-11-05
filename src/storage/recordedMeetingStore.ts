import { db, DatabaseTransaction } from './database';
import type { MeetingStatus } from '../meetings/meetingState';
import type { MeetingErrorCode } from '../meetings/meetingErrors';
import type { TranscriptSegment } from '../meetings/transcript';
import { normalizeNotes, type MeetingNotes } from '../meetings/meetingNotes';

export const SYNCED_MEETING_STATUSES: readonly MeetingStatus[] = [
  'transcription_complete',
  'completed',
];

export interface RecordedMeeting {
  id: string;
  userId: string;
  title: string;
  status: MeetingStatus;
  errorCode: MeetingErrorCode | null;
  errorDetail: string | null;
  startedAt: string;
  durationSeconds: number;
  audioBytes: number;
  microphoneLabel: string | null;
  whisperModel: string | null;
  transcriptionDevice: 'cpu' | 'gpu' | null;
  language: string | null;
  transcript: TranscriptSegment[] | null;
  notes: MeetingNotes | null;
  notesEdited: boolean;
  sectionCache: Record<string, MeetingNotes>;
  recovered: boolean;
  source: 'recording' | 'upload';
  sourceFileName: string | null;
  hasAudio: boolean;
  createdAt: string;
  updatedAt: string;
}

type Row = Record<string, unknown>;

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const mapRow = (row: Row): RecordedMeeting => {
  const transcript = parseJson<unknown>(row.transcript_json, null);
  const notes = parseJson<unknown>(row.notes_json, null);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: String(row.title ?? 'Meeting'),
    status: String(row.status) as MeetingStatus,
    errorCode: typeof row.error_code === 'string' ? (row.error_code as MeetingErrorCode) : null,
    errorDetail: typeof row.error_detail === 'string' ? row.error_detail : null,
    startedAt: String(row.started_at),
    durationSeconds: Number(row.duration_seconds) || 0,
    audioBytes: Number(row.audio_bytes) || 0,
    microphoneLabel: typeof row.microphone_label === 'string' ? row.microphone_label : null,
    whisperModel: typeof row.whisper_model === 'string' ? row.whisper_model : null,
    transcriptionDevice:
      row.transcription_device === 'gpu'
        ? 'gpu'
        : row.transcription_device === 'cpu'
        ? 'cpu'
        : null,
    language: typeof row.language === 'string' ? row.language : null,
    transcript: Array.isArray(transcript)
      ? (transcript as TranscriptSegment[]).filter(
          (segment) => segment && typeof segment.text === 'string',
        )
      : null,
    notes: notes && typeof notes === 'object' ? normalizeNotes(notes) : null,
    notesEdited: row.notes_edited === 1,
    sectionCache: parseJson<Record<string, MeetingNotes>>(row.section_cache_json, {}),
    recovered: row.recovered === 1,
    source: row.source === 'upload' ? 'upload' : 'recording',
    sourceFileName: typeof row.source_file_name === 'string' ? row.source_file_name : null,
    hasAudio: row.has_audio !== 0,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
};

export interface MeetingPatch {
  title?: string;
  status?: MeetingStatus;
  errorCode?: MeetingErrorCode | null;
  errorDetail?: string | null;
  durationSeconds?: number;
  audioBytes?: number;
  whisperModel?: string | null;
  transcriptionDevice?: 'cpu' | 'gpu' | null;
  language?: string | null;
  transcript?: TranscriptSegment[] | null;
  notes?: MeetingNotes | null;
  notesEdited?: boolean;
  sectionCache?: Record<string, MeetingNotes>;
  recovered?: boolean;
}

const COLUMNS: Record<
  keyof MeetingPatch,
  { column: string; encode: (value: never) => unknown }
> = {
  title: { column: 'title', encode: (value: string) => value.slice(0, 160) || 'Meeting' },
  status: { column: 'status', encode: (value: string) => value },
  errorCode: { column: 'error_code', encode: (value: string | null) => value },
  errorDetail: {
    column: 'error_detail',
    encode: (value: string | null) => (value ? value.slice(0, 1_000) : null),
  },
  durationSeconds: { column: 'duration_seconds', encode: (value: number) => value },
  audioBytes: { column: 'audio_bytes', encode: (value: number) => value },
  whisperModel: { column: 'whisper_model', encode: (value: string | null) => value },
  transcriptionDevice: {
    column: 'transcription_device',
    encode: (value: string | null) => value,
  },
  language: { column: 'language', encode: (value: string | null) => value },
  transcript: {
    column: 'transcript_json',
    encode: (value: unknown) => (value ? JSON.stringify(value) : null),
  },
  notes: {
    column: 'notes_json',
    encode: (value: unknown) => (value ? JSON.stringify(value) : null),
  },
  notesEdited: { column: 'notes_edited', encode: (value: boolean) => (value ? 1 : 0) },
  sectionCache: {
    column: 'section_cache_json',
    encode: (value: unknown) => JSON.stringify(value ?? {}),
  },
  recovered: { column: 'recovered', encode: (value: boolean) => (value ? 1 : 0) },
};

export const recordedMeetingStore = {
  create: (input: {
    id: string;
    userId: string;
    title: string;
    microphoneLabel?: string | null;
    upload?: { fileName: string };
  }): void => {
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO recorded_meetings (
         id, user_id, title, status, started_at, microphone_label, source, source_file_name, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.userId,
        input.title.slice(0, 160) || 'Meeting',
        input.upload ? 'importing' : 'recording',
        now,
        input.microphoneLabel ?? null,
        input.upload ? 'upload' : 'recording',
        input.upload ? input.upload.fileName.slice(0, 260) : null,
        now,
        now,
      ],
    );
  },

  get: (id: string): RecordedMeeting | null => {
    try {
      const row = db.executeSync(
        'SELECT * FROM recorded_meetings WHERE id = ? AND deleted_at IS NULL',
        [id],
      ).rows?.[0];
      return row ? mapRow(row) : null;
    } catch (error) {
      console.error('Error loading meeting:', error);
      return null;
    }
  },

  list: (userId: string): RecordedMeeting[] => {
    try {
      return (
        db.executeSync(
          `SELECT * FROM recorded_meetings WHERE user_id = ? AND deleted_at IS NULL
            ORDER BY started_at DESC, rowid DESC`,
          [userId],
        ).rows ?? []
      ).map(mapRow);
    } catch (error) {
      console.error('Error loading meetings:', error);
      return [];
    }
  },

  update: (id: string, patch: MeetingPatch): void => {
    const sets: string[] = [];
    const values: unknown[] = [];
    (Object.keys(patch) as Array<keyof MeetingPatch>).forEach((key) => {
      const spec = COLUMNS[key];
      if (!spec || patch[key] === undefined) return;
      sets.push(`${spec.column} = ?`);
      values.push(spec.encode(patch[key] as never));
    });
    if (!sets.length) return;
    sets.push('updated_at = ?');
    values.push(new Date().toISOString(), id);
    db.transactionSync((tx: DatabaseTransaction) => {
      tx.executeSync(`UPDATE recorded_meetings SET ${sets.join(', ')} WHERE id = ?`, values);
    });
  },

  remove: (id: string): void => {
    db.transactionSync((tx: DatabaseTransaction) => {
      const row = tx.executeSync(
        'SELECT user_id FROM recorded_meetings WHERE id = ? AND deleted_at IS NULL',
        [id],
      ).rows?.[0];
      if (!row) return;
      const now = new Date().toISOString();
      tx.executeSync(
        `UPDATE recorded_meetings
            SET deleted_at = ?, updated_at = ?, transcript_json = NULL, notes_json = NULL,
                section_cache_json = '{}'
          WHERE id = ?`,
        [now, now, id],
      );
    });
  },

  findInterrupted: (userId: string): RecordedMeeting[] =>
    recordedMeetingStore
      .list(userId)
      .filter((meeting) =>
        ['recording', 'paused', 'importing', 'transcribing', 'generating_notes'].includes(
          meeting.status,
        ),
      ),
};
