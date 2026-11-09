import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import {
  errorCodes,
  isErrorWithCode,
  pick,
} from '@react-native-documents/picker';
import { recordedMeetingStore } from '../../storage';
import type { MeetingPatch, RecordedMeeting } from '../../storage';
import { generateId } from '../../utils';
import {
  isMicrophoneBusyError,
  meetingRecorder,
  transcribeMeetingChunks,
} from '../../ai';
import { hasProEntitlement, requestMeetingSummary } from '../../cloud';
import { meetingNotesSkill } from '../../skills/meetingNotesSkill';
import {
  MeetingError,
  cleanSegments,
  describeMeetingError,
  generateMeetingNotes,
  normalizeNotes,
} from '../../meetings';
import type {
  MeetingErrorCode,
  MeetingErrorInfo,
  MeetingNotes,
} from '../../meetings';

export interface RecorderState {
  meetingId: string;
  status: 'starting' | 'recording' | 'paused' | 'stopping';
  elapsedMs: number;
}

export interface ProcessingState {
  meetingId: string;
  stage: 'transcribing' | 'generating_notes';
  percent: number;
  message: string;
  etaSeconds: number | null;
}

interface MeetingsContextValue {
  userId: string;
  meetings: RecordedMeeting[];
  refresh: () => void;
  available: boolean;
  entitled: boolean;
  keepAudio: boolean;
  setKeepAudio: (keep: boolean) => void;

  recorder: RecorderState | null;
  recorderError: MeetingErrorInfo | null;
  clearRecorderError: () => void;
  startRecording: (input: { title?: string }) => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  discardRecording: () => Promise<void>;

  processing: ProcessingState | null;
  transcribeMeeting: (id: string) => Promise<void>;
  generateNotes: (id: string) => Promise<void>;
  cancelProcessing: () => void;

  renameMeeting: (id: string, title: string) => void;
  saveNotes: (id: string, notes: MeetingNotes) => void;
  deleteAudio: (id: string) => Promise<void>;
  deleteMeeting: (id: string) => Promise<void>;
  importAudio: () => Promise<string | null>;
}

const MeetingsContext = createContext<MeetingsContextValue | null>(null);

export const MIN_FREE_MB = 60;
export const MAX_RECORDING_MS = 3 * 60 * 60 * 1000;
const WHISPER_MODEL = 'base.en';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const defaultMeetingTitle = (date = new Date()): string => {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `Lecture — ${MONTHS[date.getMonth()]} ${date.getDate()}, ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const isDefaultTitle = (title: string): boolean =>
  /^(?:Meeting|Lecture) — /.test(title);

const detailOf = (error: unknown): string | null =>
  error instanceof MeetingError
    ? error.detail || null
    : ((error as Error)?.message ?? null);

interface ActiveRecording {
  meetingId: string;
  accumulatedMs: number;
  resumedAt: number | null;
  paused: boolean;
}

const elapsedOf = (recording: ActiveRecording): number =>
  recording.accumulatedMs +
  (recording.resumedAt === null ? 0 : Date.now() - recording.resumedAt);

export const MeetingsProvider: React.FC<{
  userId: string;
  syncRevision?: number;
  children: React.ReactNode;
}> = ({ userId, syncRevision = 0, children }) => {
  const [available, setAvailable] = useState(() => meetingRecorder.isAvailable());

  useEffect(() => {
    setAvailable(meetingRecorder.isAvailable());
    const timer = setTimeout(() => {
      setAvailable(meetingRecorder.isAvailable());
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Offline recording & Whisper transcription are available to all students in LAFINA-CAPSTONE;
  // AI cloud summarization uses Online Mode / cloud account when available.
  const entitled = true;
  const [keepAudio, setKeepAudio] = useState(false);
  const [meetings, setMeetings] = useState<RecordedMeeting[]>([]);
  const [recorder, setRecorder] = useState<RecorderState | null>(null);
  const [recorderError, setRecorderError] = useState<MeetingErrorInfo | null>(
    null,
  );
  const [processing, setProcessing] = useState<ProcessingState | null>(null);

  const active = useRef<ActiveRecording | null>(null);
  const job = useRef<{ meetingId: string; controller: AbortController } | null>(
    null,
  );
  const queued = useRef<string[]>([]);
  const runPipelineRef = useRef<
    (id: string, from: 'transcribe' | 'notes') => Promise<void>
  >(async () => undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setMeetings(recordedMeetingStore.list(userId));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh, syncRevision]);

  const update = useCallback(
    (id: string, patch: MeetingPatch) => {
      recordedMeetingStore.update(id, patch);
      refresh();
    },
    [refresh],
  );

  const runNotes = useCallback(
    async (id: string, controller: AbortController) => {
      const meeting = recordedMeetingStore.get(id);
      if (!meeting?.transcript?.length) return;

      update(id, {
        status: 'generating_notes',
        errorCode: null,
        errorDetail: null,
      });
      setProcessing({
        meetingId: id,
        stage: 'generating_notes',
        percent: 0,
        message: 'Preparing the transcript…',
        etaSeconds: null,
      });

      const cache = { ...meeting.sectionCache };
      try {
        const result = await generateMeetingNotes({
          segments: meeting.transcript,
          skill: meetingNotesSkill,
          titleHint: isDefaultTitle(meeting.title) ? '' : meeting.title,
          recordedAt: meeting.startedAt,
          signal: controller.signal,
          cachedSections: cache,
          onSectionDone: (key, notes) => {
            cache[key] = notes;
            recordedMeetingStore.update(id, { sectionCache: cache });
          },
          onProgress: (progress) =>
            setProcessing((current) =>
              current?.meetingId === id
                ? {
                    ...current,
                    percent: progress.percent,
                    message: progress.message,
                  }
                : current,
            ),
        });
        const latest = recordedMeetingStore.get(id);
        update(id, {
          status: 'completed',
          notes: result.notes,
          notesEdited: false,
          sectionCache: {},
          errorCode: null,
          errorDetail: null,
          title:
            latest && isDefaultTitle(latest.title) && result.notes.title
              ? result.notes.title
              : undefined,
        });
      } catch (error) {
        // Fallback to /v1/meetings/summary if /v1/ai/meeting-notes/generate is unavailable
        try {
          const fallbackRes = await requestMeetingSummary({
            title: meeting.title,
            consentGiven: true,
            segments: meeting.transcript.map((s) => ({
              start_ms: s.startMs,
              end_ms: s.endMs,
              text: s.text,
            })),
          });
          if (fallbackRes.status === 'success' && fallbackRes.data) {
            const fallbackData = fallbackRes.data;
            const mappedNotes = normalizeNotes({
              title: fallbackData.title || meeting.title,
              summary: fallbackData.summary,
              decisions: fallbackData.decisions,
              action_items: fallbackData.actionItems.map((item) => ({
                task: item.title,
                assignee: item.assignee ?? '',
                deadline: item.dueDate ?? '',
                status: 'pending',
              })),
            });
            update(id, {
              status: 'completed',
              notes: mappedNotes,
              notesEdited: false,
              sectionCache: {},
              errorCode: null,
              errorDetail: null,
            });
            return;
          }
        } catch {
          // Ignore fallback error and report primary error below
        }

        const code = error instanceof MeetingError ? error.code : 'unknown';
        if (code === 'cancelled') {
          update(id, { status: 'cancelled', errorCode: null });
        } else if (code === 'plan_required' || code === 'unauthorized') {
          update(id, {
            status: 'transcription_complete',
            errorCode: hasProEntitlement(userId) ? code : 'plan_required',
          });
        } else {
          update(id, {
            status: 'error',
            errorCode: code,
            errorDetail: detailOf(error),
          });
        }
      }
    },
    [update, userId],
  );

  const runTranscription = useCallback(
    async (id: string, controller: AbortController): Promise<boolean> => {
      update(id, { status: 'transcribing', errorCode: null, errorDetail: null });
      setProcessing({
        meetingId: id,
        stage: 'transcribing',
        percent: 0,
        message: 'Preparing the recording…',
        etaSeconds: null,
      });

      const audio = await meetingRecorder
        .listMeetingAudio(id)
        .catch(() => ({ chunks: [], totalBytes: 0 }));
      if (!audio.chunks.length) {
        update(id, {
          status: 'error',
          errorCode: 'recording_lost',
          audioBytes: 0,
        });
        return false;
      }

      const startedAt = Date.now();
      // ponytail: transcribe meeting chunks using ElevenLabs cloud STT with local Whisper fallback
      const result = await transcribeMeetingChunks({
        meetingId: id,
        userId: userId || undefined,
        useElevenLabs: true,
        chunkFiles: audio.chunks.map((chunk) => chunk.path),
        chunkDurationsMs: audio.chunks.map((chunk) => chunk.durationMs),
        keepAudio,
        shouldCancel: () => controller.signal.aborted,
        onProgress: (fraction, done, total) => {
          const elapsed = (Date.now() - startedAt) / 1000;
          setProcessing((current) =>
            current?.meetingId === id
              ? {
                  ...current,
                  percent: Math.round(fraction * 100),
                  message:
                    done < total
                      ? `Transcribing on this phone — part ${done + 1} of ${total}`
                      : 'Putting the transcript together…',
                  etaSeconds:
                    done > 0 && done < total
                      ? Math.round((elapsed / done) * (total - done))
                      : null,
                }
              : current,
          );
        },
      });

      if (result.cancelled || controller.signal.aborted) {
        update(id, { status: 'cancelled', errorCode: null });
        return false;
      }
      if (result.failedChunks === audio.chunks.length) {
        const code: MeetingErrorCode =
          /WHISPER_INIT|initiali[sz]e Whisper/i.test(result.lastError ?? '')
            ? 'whisper_init_failed'
            : 'transcription_failed';
        update(id, {
          status: 'error',
          errorCode: code,
          errorDetail: result.lastError,
        });
        return false;
      }

      const segments = cleanSegments(
        result.segments.map((segment) => ({
          startMs: segment.start_ms,
          endMs: segment.end_ms,
          text: segment.text,
        })),
      );
      const durationMs = audio.chunks.reduce(
        (sum, chunk) => sum + chunk.durationMs,
        0,
      );
      update(id, {
        status: segments.length ? 'transcription_complete' : 'error',
        errorCode: segments.length ? null : 'empty_transcript',
        errorDetail: null,
        transcript: segments,
        language: 'en',
        transcriptionDevice: 'cpu',
        whisperModel: WHISPER_MODEL,
        durationSeconds:
          durationMs > 0 ? Math.round(durationMs / 1000) : undefined,
        audioBytes: keepAudio ? audio.totalBytes : 0,
        sectionCache: {},
      });
      return segments.length > 0;
    },
    [keepAudio, update, userId],
  );

  const runPipeline = useCallback(
    async (id: string, from: 'transcribe' | 'notes') => {
      if (job.current) {
        if (
          from === 'transcribe' &&
          job.current.meetingId !== id &&
          !queued.current.includes(id)
        ) {
          queued.current.push(id);
        }
        return;
      }
      const controller = new AbortController();
      job.current = { meetingId: id, controller };
      try {
        if (from === 'transcribe') {
          const transcribed = await runTranscription(id, controller).catch(
            (error) => {
              update(id, {
                status: 'error',
                errorCode: 'transcription_failed',
                errorDetail: detailOf(error),
              });
              return false;
            },
          );
          if (!transcribed) return;
        }
        if (controller.signal.aborted) return;
        if (from === 'notes') {
          await runNotes(id, controller);
        }
      } finally {
        job.current = null;
        if (mounted.current) setProcessing(null);
        const next = queued.current.shift();
        if (next && recordedMeetingStore.get(next)) {
          void runPipelineRef.current(next, 'transcribe');
        }
      }
    },
    [runNotes, runTranscription, update],
  );
  runPipelineRef.current = runPipeline;

  const transcribeMeeting = useCallback(
    (id: string) => runPipeline(id, 'transcribe'),
    [runPipeline],
  );
  const generateNotes = useCallback(
    (id: string) => runPipeline(id, 'notes'),
    [runPipeline],
  );

  const cancelProcessing = useCallback(() => {
    job.current?.controller.abort();
  }, []);

  const finishActive = useCallback(
    async (options: { reason?: MeetingErrorCode; process: boolean }) => {
      const recording = active.current;
      if (!recording) return;
      active.current = null;
      const id = recording.meetingId;
      setRecorder((current) =>
        current ? { ...current, status: 'stopping' } : current,
      );

      await meetingRecorder.stop().catch((error) => {
        console.error('[Meetings] Could not stop recording cleanly:', error);
        return null;
      });
      const audio = await meetingRecorder
        .listMeetingAudio(id)
        .catch(() => ({ chunks: [], totalBytes: 0 }));
      const recordedMs = audio.chunks.reduce(
        (sum, chunk) => sum + chunk.durationMs,
        0,
      );
      const saved = audio.chunks.length > 0;
      update(id, {
        status: saved ? 'recording_complete' : 'error',
        durationSeconds: Math.round(
          (recordedMs || elapsedOf(recording)) / 1000,
        ),
        audioBytes: audio.totalBytes,
        errorCode: saved ? (options.reason ?? null) : 'recording_failed',
      });
      if (mounted.current) setRecorder(null);

      if (saved && options.process && !options.reason) {
        void runPipeline(id, 'transcribe');
      }
    },
    [runPipeline, update],
  );

  const startRecording = useCallback(
    async (input: { title?: string }) => {
      if (active.current || !available) return;
      setRecorderError(null);

      if (!(await meetingRecorder.requestPermission())) {
        setRecorderError(describeMeetingError('microphone_permission_denied'));
        return;
      }
      const freeMb = await meetingRecorder
        .getAvailableStorageMB()
        .catch(() => Number.POSITIVE_INFINITY);
      if (freeMb < MIN_FREE_MB) {
        setRecorderError(describeMeetingError('insufficient_storage'));
        return;
      }

      const id = generateId('meeting');
      const title = input.title?.trim() || defaultMeetingTitle();
      recordedMeetingStore.create({
        id,
        userId,
        title,
        microphoneLabel: 'Phone microphone',
      });
      setRecorder({ meetingId: id, status: 'starting', elapsedMs: 0 });

      try {
        await meetingRecorder.start(id, title);
      } catch (error) {
        console.error('[Meetings] Could not start recording:', error);
        recordedMeetingStore.remove(id);
        setRecorder(null);
        // AGY-PORT 05: the native code (not only the message) says the microphone
        // is owned by voice capture; nothing already recorded is touched.
        const code = String((error as { code?: unknown })?.code ?? '');
        const busy =
          isMicrophoneBusyError(error) ||
          code === 'ALREADY_RECORDING' ||
          /ALREADY_RECORDING|MIC_IN_USE|already being recorded|microphone is currently in use/i.test(
            String((error as Error)?.message ?? ''),
          );
        setRecorderError(
          describeMeetingError(busy ? 'microphone_in_use' : 'recording_failed'),
        );
        refresh();
        return;
      }

      active.current = {
        meetingId: id,
        accumulatedMs: 0,
        resumedAt: Date.now(),
        paused: false,
      };
      setRecorder({ meetingId: id, status: 'recording', elapsedMs: 0 });
      refresh();
    },
    [available, refresh, userId],
  );

  const pauseRecording = useCallback(async () => {
    const recording = active.current;
    if (!recording || recording.paused) return;
    await meetingRecorder.pause().catch(() => false);
    recording.accumulatedMs = elapsedOf(recording);
    recording.resumedAt = null;
    recording.paused = true;
    update(recording.meetingId, { status: 'paused' });
    setRecorder((current) =>
      current
        ? { ...current, status: 'paused', elapsedMs: recording.accumulatedMs }
        : current,
    );
  }, [update]);

  const resumeRecording = useCallback(async () => {
    const recording = active.current;
    if (!recording || !recording.paused) return;
    await meetingRecorder.resume().catch(() => false);
    recording.resumedAt = Date.now();
    recording.paused = false;
    update(recording.meetingId, { status: 'recording' });
    setRecorder((current) =>
      current ? { ...current, status: 'recording' } : current,
    );
  }, [update]);

  const stopRecording = useCallback(
    () => finishActive({ process: true }),
    [finishActive],
  );

  const discardRecording = useCallback(async () => {
    const recording = active.current;
    if (!recording) return;
    active.current = null;
    setRecorder((current) =>
      current ? { ...current, status: 'stopping' } : current,
    );
    await meetingRecorder.stop().catch(() => null);
    await meetingRecorder
      .deleteMeetingAudio(recording.meetingId)
      .catch(() => false);
    recordedMeetingStore.remove(recording.meetingId);
    if (mounted.current) setRecorder(null);
    refresh();
  }, [refresh]);

  const recordingId = recorder?.meetingId;
  const recordingStatus = recorder?.status;
  useEffect(() => {
    if (
      !recordingId ||
      recordingStatus === 'starting' ||
      recordingStatus === 'stopping'
    ) {
      return undefined;
    }
    let ticks = 0;
    const timer = setInterval(() => {
      const recording = active.current;
      if (!recording) return;
      const elapsedMs = elapsedOf(recording);
      setRecorder((current) =>
        current && current.status !== 'stopping'
          ? { ...current, elapsedMs }
          : current,
      );
      if (elapsedMs >= MAX_RECORDING_MS) {
        void finishActive({ process: true });
        return;
      }
      ticks += 1;
      if (ticks % 6 !== 0) return;
      void meetingRecorder.isRecording().then(async (running) => {
        if (running || active.current !== recording) return;
        const freeMb = await meetingRecorder
          .getAvailableStorageMB()
          .catch(() => Number.POSITIVE_INFINITY);
        const reason: MeetingErrorCode =
          freeMb < MIN_FREE_MB ? 'insufficient_storage' : 'recording_failed';
        setRecorderError(describeMeetingError(reason));
        await finishActive({ reason, process: false });
      });
    }, 500);
    return () => clearInterval(timer);
  }, [recordingId, recordingStatus, finishActive]);

  const renameMeeting = useCallback(
    (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      update(id, { title: trimmed });
    },
    [update],
  );

  const saveNotes = useCallback(
    (id: string, notes: MeetingNotes) => {
      update(id, { notes, notesEdited: true });
    },
    [update],
  );

  const deleteAudio = useCallback(
    async (id: string) => {
      if (job.current?.meetingId === id || active.current?.meetingId === id) {
        return;
      }
      await meetingRecorder.deleteMeetingAudio(id).catch(() => false);
      update(id, { audioBytes: 0 });
    },
    [update],
  );

  const deleteMeeting = useCallback(
    async (id: string) => {
      if (active.current?.meetingId === id) return;
      queued.current = queued.current.filter((entry) => entry !== id);
      if (job.current?.meetingId === id) job.current.controller.abort();
      await meetingRecorder.deleteMeetingAudio(id).catch(() => false);
      recordedMeetingStore.remove(id);
      refresh();
    },
    [refresh],
  );

  useEffect(() => {
    if (!available) return undefined;
    let cancelled = false;
    const recover = async (): Promise<void> => {
      const stillRecording = await meetingRecorder
        .isRecording()
        .catch(() => false);
      const interrupted = recordedMeetingStore.findInterrupted(userId);
      let reattached = false;

      for (const meeting of interrupted) {
        if (cancelled) return;
        if (
          meeting.id === active.current?.meetingId ||
          meeting.id === job.current?.meetingId
        ) {
          continue;
        }
        if (meeting.status === 'recording' || meeting.status === 'paused') {
          if (stillRecording && !reattached && !active.current) {
            reattached = true;
            const paused = meeting.status === 'paused';
            const sinceStart = Math.max(
              0,
              Date.now() - Date.parse(meeting.startedAt),
            );
            active.current = paused
              ? {
                  meetingId: meeting.id,
                  accumulatedMs: sinceStart,
                  resumedAt: null,
                  paused: true,
                }
              : {
                  meetingId: meeting.id,
                  accumulatedMs: 0,
                  resumedAt: Date.now() - sinceStart,
                  paused: false,
                };
            setRecorder({
              meetingId: meeting.id,
              status: paused ? 'paused' : 'recording',
              elapsedMs: sinceStart,
            });
            continue;
          }
          const audio = await meetingRecorder
            .listMeetingAudio(meeting.id)
            .catch(() => ({ chunks: [], totalBytes: 0 }));
          const recordedMs = audio.chunks.reduce(
            (sum, chunk) => sum + chunk.durationMs,
            0,
          );
          recordedMeetingStore.update(
            meeting.id,
            audio.chunks.length
              ? {
                  status: 'recording_complete',
                  durationSeconds: Math.round(recordedMs / 1000),
                  audioBytes: audio.totalBytes,
                  recovered: true,
                  errorCode: null,
                }
              : { status: 'error', errorCode: 'recording_lost' },
          );
        } else if (meeting.status === 'importing') {
          recordedMeetingStore.update(meeting.id, {
            status: 'error',
            errorCode: 'import_interrupted',
          });
        } else if (meeting.status === 'transcribing') {
          recordedMeetingStore.update(meeting.id, {
            status: 'cancelled',
            errorCode: 'transcription_interrupted',
          });
        } else if (meeting.status === 'generating_notes') {
          recordedMeetingStore.update(meeting.id, {
            status: 'cancelled',
            errorCode: 'notes_interrupted',
          });
        }
      }
      if (!stillRecording) {
        await meetingRecorder.clearRecoveryState().catch(() => false);
      }
      if (!cancelled) refresh();
    };
    void recover();
    return () => {
      cancelled = true;
    };
  }, [available, refresh, userId]);

  const importAudio = useCallback(async (): Promise<string | null> => {
    try {
      const res = await pick({
        type: ['audio/*'],
      });
      if (!res || res.length === 0 || !res[0]?.uri) {
        return null;
      }
      const file = res[0];
      const meetingId = generateId('meeting');
      const rawName = file.name || 'Imported Audio';
      const cleanTitle =
        rawName.replace(/\.[^/.]+$/, '').trim() || 'Imported Audio';

      setProcessing({
        meetingId,
        stage: 'transcribing',
        percent: 0,
        message: 'Importing and preparing audio file…',
        etaSeconds: null,
      });

      const importResult = await meetingRecorder.importAudioFile(
        file.uri,
        meetingId,
      );

      recordedMeetingStore.create({
        id: meetingId,
        userId,
        title: cleanTitle,
        upload: { fileName: rawName },
      });

      recordedMeetingStore.update(meetingId, {
        status: 'recording_complete',
        durationSeconds: Math.round(importResult.durationSeconds || 0),
        audioBytes: Math.round(importResult.audioBytes || file.size || 0),
      });
      refresh();

      void transcribeMeeting(meetingId);
      return meetingId;
    } catch (err: any) {
      if (
        (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) ||
        err?.code === 'DOCUMENT_PICKER_CANCELED'
      ) {
        return null;
      }
      console.error('[MeetingsContext] Failed to import audio recording:', err);
      Alert.alert(
        'Audio Import Failed',
        err instanceof Error
          ? err.message
          : 'Could not decode or import the audio file.',
      );
      setProcessing(null);
      return null;
    }
  }, [userId, refresh, transcribeMeeting]);

  const value = useMemo<MeetingsContextValue>(
    () => ({
      userId,
      meetings,
      refresh,
      available,
      entitled,
      keepAudio,
      setKeepAudio,
      recorder,
      recorderError,
      clearRecorderError: () => setRecorderError(null),
      startRecording,
      pauseRecording,
      resumeRecording,
      stopRecording,
      discardRecording,
      processing,
      transcribeMeeting,
      generateNotes,
      cancelProcessing,
      renameMeeting,
      saveNotes,
      deleteAudio,
      deleteMeeting,
      importAudio,
    }),
    [
      userId,
      meetings,
      refresh,
      available,
      entitled,
      keepAudio,
      recorder,
      recorderError,
      startRecording,
      pauseRecording,
      resumeRecording,
      stopRecording,
      discardRecording,
      processing,
      transcribeMeeting,
      generateNotes,
      cancelProcessing,
      renameMeeting,
      saveNotes,
      deleteAudio,
      deleteMeeting,
      importAudio,
    ],
  );

  return (
    <MeetingsContext.Provider value={value}>{children}</MeetingsContext.Provider>
  );
};

export const useMeetings = (): MeetingsContextValue => {
  const context = useContext(MeetingsContext);
  if (!context) {
    throw new Error('useMeetings must be used inside a MeetingsProvider.');
  }
  return context;
};

export const useMeetingRecorderIndicator = (): RecorderState | null =>
  useContext(MeetingsContext)?.recorder ?? null;
