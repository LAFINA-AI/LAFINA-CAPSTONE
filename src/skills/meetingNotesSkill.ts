import { cloudClient, CloudResult } from '../cloud';
import { normalizeNotes } from '../meetings/meetingNotes';
import type { MeetingNotes } from '../meetings/meetingNotes';
import type { NotesSkill, SectionPromptInput } from '../meetings/notesPipeline';

interface BackendNotesResponse {
  notes?: unknown;
}

const parseNotesResult = (
  result: CloudResult<BackendNotesResponse>,
): CloudResult<MeetingNotes> => {
  if (result.status !== 'success') {
    return {
      status: result.status,
      error: result.error,
      httpStatus: result.httpStatus,
    };
  }
  const raw = result.data?.notes;
  if (!raw || typeof raw !== 'object') {
    return {
      status: 'server_error',
      error: 'The notes response was empty.',
    };
  }
  return {
    status: 'success',
    data: normalizeNotes(raw),
  };
};

export const meetingNotesSkill: NotesSkill = {
  summarizeSection: async (
    input: SectionPromptInput,
  ): Promise<CloudResult<MeetingNotes>> => {
    const result = await cloudClient.request<BackendNotesResponse>(
      '/v1/ai/meeting-notes/section',
      {
        method: 'POST',
        body: JSON.stringify({
          section_index: input.sectionIndex,
          section_count: input.sectionCount,
          start_time_label: input.startTimeLabel,
          end_time_label: input.endTimeLabel,
          transcript: input.transcript,
        }),
      },
      true,
    );
    return parseNotesResult(result);
  },

  synthesizeNotes: async (input: {
    titleHint: string;
    recordedAt: string;
    sectionSummaries: MeetingNotes[];
    directTranscript?: string;
  }): Promise<CloudResult<MeetingNotes>> => {
    const result = await cloudClient.request<BackendNotesResponse>(
      '/v1/ai/meeting-notes/generate',
      {
        method: 'POST',
        body: JSON.stringify({
          title_hint: input.titleHint,
          recorded_at: input.recordedAt,
          section_summaries: input.sectionSummaries,
          direct_transcript: input.directTranscript ?? null,
        }),
      },
      true,
    );
    return parseNotesResult(result);
  },
};
