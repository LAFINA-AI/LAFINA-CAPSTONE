import type { CloudResult } from '../cloud';
import {
  classifyNotesFailure,
  isRetryable,
  MeetingError,
} from './meetingErrors';
import {
  emptyNotes,
  isNotesEmpty,
  normalizeNotes,
} from './meetingNotes';
import type { MeetingNotes } from './meetingNotes';
import { formatTimestamp, partitionTranscript, transcriptToText } from './transcript';
import type { TranscriptSegment } from './transcript';

export interface SectionPromptInput {
  sectionIndex: number;
  sectionCount: number;
  startTimeLabel: string;
  endTimeLabel: string;
  transcript: string;
}

export interface NotesSkill {
  summarizeSection: (input: SectionPromptInput) => Promise<CloudResult<MeetingNotes>>;
  synthesizeNotes: (input: {
    titleHint: string;
    recordedAt: string;
    sectionSummaries: MeetingNotes[];
    directTranscript?: string;
  }) => Promise<CloudResult<MeetingNotes>>;
}

export interface NotesProgress {
  stage: 'section' | 'synthesis';
  completedSections: number;
  totalSections: number;
  percent: number;
  message: string;
}

export interface GenerateNotesOptions {
  segments: TranscriptSegment[];
  skill: NotesSkill;
  titleHint?: string;
  recordedAt?: string;
  cachedSections?: Record<string, MeetingNotes>;
  onSectionDone?: (key: string, notes: MeetingNotes) => void;
  onProgress?: (progress: NotesProgress) => void;
  signal?: AbortSignal;
  retryDelayMs?: number;
}

export interface GenerateNotesResult {
  notes: MeetingNotes;
  sectionSummaries: Record<string, MeetingNotes>;
}

const SINGLE_PASS_CHAR_LIMIT = 14_000;

const checkAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new MeetingError('cancelled');
  }
};

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new MeetingError('cancelled'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new MeetingError('cancelled'));
      },
      { once: true },
    );
  });

const withRetry = async <T>(
  fn: () => Promise<CloudResult<T>>,
  signal: AbortSignal | undefined,
  baseDelayMs: number,
): Promise<T> => {
  const delays = [baseDelayMs, baseDelayMs * 2.5];
  for (let attempt = 0; ; attempt += 1) {
    checkAborted(signal);
    const result = await fn();
    if (result.status === 'success' && result.data !== undefined) {
      return result.data;
    }
    const code = classifyNotesFailure(result.status, result.error);
    if (!isRetryable(code) || attempt >= delays.length) {
      throw new MeetingError(code, result.error);
    }
    await wait(delays[attempt], signal);
  }
};

export const mergeSectionNotes = (
  sections: MeetingNotes[],
  titleHint = '',
): MeetingNotes => {
  if (sections.length === 0) return emptyNotes();
  if (sections.length === 1) {
    const single = normalizeNotes(sections[0]);
    return { ...single, title: single.title || titleHint };
  }
  return normalizeNotes({
    title: sections.find((s) => s.title)?.title || titleHint,
    summary: sections
      .map((s) => s.summary)
      .filter(Boolean)
      .join('\n\n'),
    key_topics: sections.flatMap((s) => s.key_topics),
    decisions: sections.flatMap((s) => s.decisions),
    action_items: sections.flatMap((s) => s.action_items),
    important_dates: sections.flatMap((s) => s.important_dates),
    issues: sections.flatMap((s) => s.issues),
    unresolved_questions: sections.flatMap((s) => s.unresolved_questions),
    key_points: sections.flatMap((s) => s.key_points),
  });
};

export const generateMeetingNotes = async (
  options: GenerateNotesOptions,
): Promise<GenerateNotesResult> => {
  const {
    segments,
    skill,
    titleHint = '',
    recordedAt = new Date().toISOString(),
    cachedSections = {},
    onSectionDone,
    onProgress,
    signal,
    retryDelayMs = 1200,
  } = options;

  checkAborted(signal);
  const fullText = transcriptToText(segments, { timestamps: true });
  if (!fullText.trim()) {
    throw new MeetingError('empty_transcript');
  }

  const sectionSummaries: Record<string, MeetingNotes> = { ...cachedSections };

  if (fullText.length <= SINGLE_PASS_CHAR_LIMIT) {
    onProgress?.({
      stage: 'synthesis',
      completedSections: 0,
      totalSections: 1,
      percent: 25,
      message: 'Analyzing transcript and extracting notes…',
    });
    const raw = await withRetry(
      () =>
        skill.synthesizeNotes({
          titleHint,
          recordedAt,
          sectionSummaries: [],
          directTranscript: fullText,
        }),
      signal,
      retryDelayMs,
    );
    const notes = normalizeNotes({ ...raw, title: raw.title || titleHint });
    if (isNotesEmpty(notes)) {
      throw new MeetingError('notes_service_failed', 'Empty notes returned');
    }
    onProgress?.({
      stage: 'synthesis',
      completedSections: 1,
      totalSections: 1,
      percent: 100,
      message: 'Notes ready',
    });
    return { notes, sectionSummaries };
  }

  const sections = partitionTranscript(segments);
  const orderedSummaries: MeetingNotes[] = [];

  for (let i = 0; i < sections.length; i += 1) {
    checkAborted(signal);
    const section = sections[i];
    const key = `${section.index}:${section.startMs}-${section.endMs}`;
    onProgress?.({
      stage: 'section',
      completedSections: i,
      totalSections: sections.length,
      percent: Math.round((i / (sections.length + 1)) * 100),
      message: `Summarizing part ${i + 1} of ${sections.length} (${formatTimestamp(
        section.startMs,
      )} – ${formatTimestamp(section.endMs)})…`,
    });

    let summary = sectionSummaries[key];
    if (!summary || isNotesEmpty(summary)) {
      summary = await withRetry(
        () =>
          skill.summarizeSection({
            sectionIndex: i,
            sectionCount: sections.length,
            startTimeLabel: formatTimestamp(section.startMs),
            endTimeLabel: formatTimestamp(section.endMs),
            transcript: section.text,
          }),
        signal,
        retryDelayMs,
      );
      summary = normalizeNotes(summary);
      sectionSummaries[key] = summary;
      onSectionDone?.(key, summary);
    }
    orderedSummaries.push(summary);
  }

  checkAborted(signal);
  onProgress?.({
    stage: 'synthesis',
    completedSections: sections.length,
    totalSections: sections.length,
    percent: 88,
    message: 'Combining sections into final meeting notes…',
  });

  try {
    const raw = await withRetry(
      () =>
        skill.synthesizeNotes({
          titleHint,
          recordedAt,
          sectionSummaries: orderedSummaries,
        }),
      signal,
      retryDelayMs,
    );
    const notes = normalizeNotes({ ...raw, title: raw.title || titleHint });
    if (!isNotesEmpty(notes)) {
      onProgress?.({
        stage: 'synthesis',
        completedSections: sections.length,
        totalSections: sections.length,
        percent: 100,
        message: 'Notes ready',
      });
      return { notes, sectionSummaries };
    }
  } catch (err) {
    if (err instanceof MeetingError && err.code === 'cancelled') throw err;
  }

  const merged = mergeSectionNotes(orderedSummaries, titleHint);
  if (isNotesEmpty(merged)) {
    throw new MeetingError('notes_service_failed');
  }
  return { notes: merged, sectionSummaries };
};
