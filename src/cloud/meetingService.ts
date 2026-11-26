import {
  cloudClient,
  CloudResult,
  LONG_REQUEST_TIMEOUT_MS,
} from './cloudClient';
import {TranscriptSegment} from '../ai/native/meetingRecorder';

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

interface BackendNestedSummary {
  key_points?: string[];
  decisions?: string[];
  open_questions?: string[];
  action_items?: Array<{
    task?: string;
    assignee?: string | null;
    due?: string | null;
  }>;
}

interface BackendMeetingSummaryResponse {
  id?: string;
  requestId?: string;
  title?: string;
  meetingTitle?: string;
  summary: string | BackendNestedSummary;
  decisions?: string[];
  action_items?: Array<{
    title: string;
    assignee?: string | null;
    due_date?: string | null;
    priority?: string;
  }>;
  created_at?: string;
  createdAt?: string;
}

export interface RequestMeetingSummaryInput {
  title: string;
  segments: TranscriptSegment[];
  consentGiven: boolean;
  signal?: AbortSignal;
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

  const transcript = input.segments
    .map(s => (typeof s?.text === 'string' ? s.text.trim() : ''))
    .filter(Boolean)
    .join('\n');
  if (!transcript) {
    return {
      status: 'validation_error',
      error: 'Transcript is empty; nothing to summarize.',
    };
  }

  const response = await cloudClient.request<BackendMeetingSummaryResponse>(
    '/v1/meetings/summary',
    {
      method: 'POST',
      timeoutMs: LONG_REQUEST_TIMEOUT_MS,
      ...(input.signal ? {signal: input.signal} : {}),
      body: JSON.stringify({
        meetingTitle: input.title.trim() || 'Lecture Notes',
        transcript,
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
  if (typeof data.summary === 'object' && data.summary !== null) {
    const nested = data.summary;
    const keyPoints = Array.isArray(nested.key_points)
      ? nested.key_points.filter((p): p is string => typeof p === 'string')
      : [];
    const decisions = Array.isArray(nested.decisions)
      ? nested.decisions.filter((d): d is string => typeof d === 'string')
      : [];
    const rawNestedItems = Array.isArray(nested.action_items)
      ? nested.action_items
      : [];
    const actionItems = rawNestedItems
      .filter((item): item is NonNullable<typeof item> => item != null && typeof item === 'object')
      .map(item => ({
        title: typeof item.task === 'string' && item.task.trim() ? item.task.trim() : 'Untitled Task',
        assignee: typeof item.assignee === 'string' ? item.assignee : null,
        dueDate: typeof item.due === 'string' ? item.due : null,
        priority: 'Medium' as const,
      }));
    return {
      status: 'success',
      data: {
        id: data.requestId || data.id || 'meeting_summary',
        title: input.title.trim() || 'Lecture Notes',
        summary: keyPoints.join('\n'),
        decisions,
        actionItems,
        createdAt:
          data.createdAt || data.created_at || new Date().toISOString(),
      },
    };
  }

  const rawActionItems = Array.isArray(data.action_items)
    ? data.action_items
    : [];
  return {
    status: 'success',
    data: {
      id: data.id || data.requestId || 'meeting_summary',
      title: data.title || input.title.trim() || 'Lecture Notes',
      summary: typeof data.summary === 'string' ? data.summary : '',
      decisions: Array.isArray(data.decisions)
        ? data.decisions.filter((d): d is string => typeof d === 'string')
        : [],
      actionItems: rawActionItems
        .filter((item): item is NonNullable<typeof item> => item != null && typeof item === 'object')
        .map(item => ({
          title:
            typeof item.title === 'string' && item.title.trim()
              ? item.title.trim()
              : 'Untitled Task',
          assignee: typeof item.assignee === 'string' ? item.assignee : null,
          dueDate: typeof item.due_date === 'string' ? item.due_date : null,
          priority: normalizePriority(item.priority),
        })),
      createdAt: data.created_at || data.createdAt || new Date().toISOString(),
    },
  };
};
