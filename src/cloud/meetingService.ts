import { cloudClient, CloudResult } from './cloudClient';
import { TranscriptSegment } from '../ai/native/meetingRecorder';

export interface MeetingActionItem {
  title: string;
  assignee?: string | null;
  dueDate?: string | null;
  priority: 'Low' | 'Medium' | 'High';
}

export interface MeetingSummaryResponse {
  id: string;
  title: string;
  summary: string;
  decisions: string[];
  actionItems: MeetingActionItem[];
  createdAt: string;
}

interface BackendMeetingSummaryResponse {
  id: string;
  title: string;
  summary: string;
  decisions: string[];
  action_items: Array<{
    title: string;
    assignee?: string | null;
    due_date?: string | null;
    priority?: string;
  }>;
  created_at: string;
}

export interface RequestMeetingSummaryInput {
  title: string;
  segments: TranscriptSegment[];
  consentGiven: boolean;
}

const normalizePriority = (raw?: string): 'Low' | 'Medium' | 'High' => {
  const lower = (raw || 'medium').toLowerCase();
  if (lower === 'high') return 'High';
  if (lower === 'low') return 'Low';
  return 'Medium';
};

/**
 * Sends the local Whisper transcript to `/v1/meetings/summary` ONLY after
 * explicit user consent. Raw audio never leaves the device.
 */
export const requestMeetingSummary = async (
  input: RequestMeetingSummaryInput,
): Promise<CloudResult<MeetingSummaryResponse>> => {
  if (!input.consentGiven) {
    return {
      status: 'validation_error',
      error:
        'Explicit consent is required before sending transcript to cloud AI.',
    };
  }
  if (!input.segments || input.segments.length === 0) {
    return {
      status: 'validation_error',
      error: 'Transcript is empty; nothing to summarize.',
    };
  }

  const response = await cloudClient.request<BackendMeetingSummaryResponse>(
    '/v1/meetings/summary',
    {
      method: 'POST',
      body: JSON.stringify({
        title: input.title.trim() || 'Lecture Notes',
        consent_given: true,
        segments: input.segments.map((s) => ({
          start_ms: Math.max(0, Math.round(s.start_ms)),
          end_ms: Math.max(0, Math.round(s.end_ms)),
          text: s.text,
        })),
      }),
    },
    true,
  );

  if (response.status !== 'success' || !response.data) {
    return {
      status: response.status === 'success' ? 'server_error' : response.status,
      error: response.error,
      httpStatus: response.httpStatus,
    };
  }

  const data = response.data;
  return {
    status: 'success',
    data: {
      id: data.id,
      title: data.title,
      summary: data.summary,
      decisions: Array.isArray(data.decisions) ? data.decisions : [],
      actionItems: (data.action_items ?? []).map((item) => ({
        title: item.title,
        assignee: item.assignee ?? null,
        dueDate: item.due_date ?? null,
        priority: normalizePriority(item.priority),
      })),
      createdAt: data.created_at,
    },
  };
};
