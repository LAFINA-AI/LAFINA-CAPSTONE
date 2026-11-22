import {cloudClient, CloudResult, LONG_REQUEST_TIMEOUT_MS} from '../cloud';
import {normalizeNotes} from '../meetings/meetingNotes';
import type {MeetingNotes} from '../meetings/meetingNotes';
import type {NotesSkill, SectionPromptInput} from '../meetings/notesPipeline';

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
        timeoutMs: LONG_REQUEST_TIMEOUT_MS,
        body: JSON.stringify({
          content: input.transcript,
          index: input.sectionIndex,
          count: input.sectionCount,
          material: 'transcript',
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
    const isDirect = Boolean(input.directTranscript?.trim());
    const content = isDirect
      ? input.directTranscript!.trim()
      : JSON.stringify(input.sectionSummaries);
    const result = await cloudClient.request<BackendNotesResponse>(
      '/v1/ai/meeting-notes/generate',
      {
        method: 'POST',
        timeoutMs: LONG_REQUEST_TIMEOUT_MS,
        body: JSON.stringify({
          content,
          source: isDirect ? 'transcript' : 'sections',
          titleHint: input.titleHint,
          recordedAt: input.recordedAt,
        }),
      },
      true,
    );
    return parseNotesResult(result);
  },
};
