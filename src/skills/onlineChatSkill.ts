import { cloudClient, CloudResult } from '../cloud';

/** A whole (non-streamed) reply gets as long as a streamed one. */
const CHAT_REQUEST_TIMEOUT_MS = 65_000;
import { localSettingsStore, userStore } from '../storage';
import { isUstpSchoolEnabled } from '../storage/ustpEligibility';
import {directProviderTestEnabled, directTestChat} from '../cloud/directProviderTest';
import type {RequestTrace} from '../ai/benchmark/requestTrace';

/** A model id the server chose to report, if any; never guessed. */
const reportedModel = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : undefined;

export interface OnlineChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface HandbookSource {
  title: string;
  section?: string | null;
  page?: number | null;
  snippet?: string | null;
}

export interface OnlineChatReply {
  reply: string;
  sources: HandbookSource[];
  usedHandbook: boolean;
  /** Streaming only: DeepSeek stopped part-way, so `reply` is what arrived. */
  interrupted?: boolean;
}

export interface HandbookStatus {
  available: boolean;
  title?: string | null;
  chunkCount?: number;
}

export interface SendChatMessageOptions {
  useHandbook?: boolean;
  /** What LAFINA remembers about the student, newest first (sent only when non-empty). */
  memories?: { id: string; text: string }[];
  signal?: AbortSignal;
  /** Developer timing for this request (only when tracking is on). */
  trace?: RequestTrace | null;
  /**
   * Return the reply exactly as the model wrote it. Intent extraction needs
   * this: its reply carries the student's own words ("LAFINA test reminder"),
   * which must not be rewritten for speech.
   */
  keepNameCase?: boolean;
}

export interface StreamChatMessageOptions extends SendChatMessageOptions {
  /** The reply so far, each time more of it arrives. */
  onReplyText: (replySoFar: string) => void;
}

/**
 * Onboarding redesign: the USTP handbook is requested from the backend only
 * for the signed-in student whose school features are on (confirmed COR),
 * whatever an individual caller asked for. Checked at send time.
 */
const handbookAllowed = (requested: boolean | undefined): boolean => {
  if (requested === false) return false;
  try {
    const user = userStore.getCurrentUser();
    return Boolean(user && isUstpSchoolEnabled(user.id));
  } catch {
    return false;
  }
};

const HANDBOOK_SETTING_KEY = 'chat.useHandbook';
const HANDBOOK_SETTING_ALIAS = 'ustp_handbook_enabled';
const MAX_CHAT_MESSAGES = 10;
const MAX_CHAT_MESSAGE_LENGTH = 4_090;

export const handbookPreference = {
  read: (userId: string): boolean => {
    const stored =
      localSettingsStore.get(userId, HANDBOOK_SETTING_KEY) ??
      localSettingsStore.get(userId, HANDBOOK_SETTING_ALIAS);
    return stored === null ? true : stored === 'true';
  },
  write: (userId: string, enabled: boolean): void => {
    localSettingsStore.set(
      userId,
      HANDBOOK_SETTING_KEY,
      enabled ? 'true' : 'false',
    );
    localSettingsStore.set(
      userId,
      HANDBOOK_SETTING_ALIAS,
      enabled ? 'true' : 'false',
    );
  },
};

export const handbookSourceLabel = (
  sources: HandbookSource[],
): string | null => {
  if (!sources.length) return null;
  const pages = Array.from(
    new Set(
      sources
        .map((source) =>
          typeof source.page === 'number' && source.page > 0
            ? `p. ${source.page}`
            : null,
        )
        .filter((page): page is string => Boolean(page)),
    ),
  );
  if (pages.length > 0) {
    return `Referenced USTP Student Handbook (${pages.slice(0, 4).join(', ')})`;
  }
  return 'Referenced USTP Student Handbook';
};

interface BackendChatSource {
  title?: unknown;
  section?: unknown;
  page?: unknown;
  snippet?: unknown;
}

interface BackendChatResponse {
  reply: string;
  model?: unknown;
  sources?: BackendChatSource[];
  used_handbook?: boolean;
  usedHandbook?: boolean;
}

interface BackendHandbookStatusResponse {
  available?: unknown;
  enabled?: boolean;
  functional?: boolean;
  passages?: number;
  title?: unknown;
  chunk_count?: unknown;
}

const normalizeSources = (raw?: BackendChatSource[]): HandbookSource[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is BackendChatSource =>
      Boolean(entry && typeof entry === 'object'),
    )
    .map((entry) => ({
      title:
        typeof entry.title === 'string' && entry.title.trim()
          ? entry.title.trim()
          : 'USTP Student Handbook',
      section:
        typeof entry.section === 'string' && entry.section.trim()
          ? entry.section.trim()
          : null,
      page:
        (typeof entry.page === 'number' || (typeof entry.page === 'string' && /^\d+$/.test(entry.page))) && Number.isFinite(Number(entry.page))
          ? Number(entry.page)
          : null,
      snippet:
        typeof entry.snippet === 'string' && entry.snippet.trim()
          ? entry.snippet.trim()
          : null,
    }));
};

const normalizeName = (text: string): string =>
  text
    .replace(/\bL[.-]?A[.-]?F[.-]?I[.-]?N[.-]?A\b/gi, 'lafina')
    .replace(/\bLAFINA\b/g, 'lafina');

/** Newest turns that fit the backend's limits, or null when nothing is left. */
const boundMessages = (messages: OnlineChatMessage[]): OnlineChatMessage[] | null => {
    const trimmed = messages
      .slice(-MAX_CHAT_MESSAGES)
      .map((msg) => ({
        role: msg.role,
        content: msg.content.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH),
      }))
      .filter((msg) => msg.content.length > 0);
    // Keep the latest turn and fit the server's combined 8,000-character budget.
    let budget = 8_000;
    const bounded = trimmed.reverse().map(msg => {
      const content = msg.content.slice(-budget);
      const accepted = budget > 0 ? {...msg, content} : null;
      budget = Math.max(0, budget - content.length);
      return accepted;
    }).filter((msg): msg is OnlineChatMessage => msg !== null).reverse();
    return bounded.length > 0 ? bounded : null;
};

const EMPTY_MESSAGE: CloudResult<OnlineChatReply> = {
  status: 'validation_error',
  error: 'Message cannot be empty.',
};

interface StreamEvent {
  type?: unknown;
  text?: unknown;
  sources?: BackendChatSource[];
  usedHandbook?: unknown;
  model?: unknown;
}

/** Splits Server-Sent Events text into complete events, keeping any partial tail. */
const takeEvents = (buffer: string): { events: StreamEvent[]; rest: string } => {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? '';
  const events: StreamEvent[] = [];
  for (const block of blocks) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) continue; // comments and keep-alives
    try {
      const parsed: unknown = JSON.parse(data);
      if (parsed && typeof parsed === 'object') events.push(parsed as StreamEvent);
    } catch {
      // A malformed event is skipped; the reply carries on.
    }
  }
  return { events, rest };
};

// Set once the backend answers 404/405 for the stream route (a deployment
// without it), so later messages go straight to the regular endpoint.
let streamRouteMissing = false;

export const resetChatStreamSupport = (): void => {
  streamRouteMissing = false;
  agentRouteMissing = false;
};

/** Set when the server has no `/v1/ai/chat/agent` route (not deployed yet). */
let agentRouteMissing = false;

const AGENT_UNAVAILABLE = {
  status: 'server_unavailable' as const,
  error: 'Chat agent is unavailable.',
  httpStatus: 404,
};

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** This turn's tool exchange, in the OpenAI shape the server checks. */
export type AgentExchangeMessage =
  | {
      role: 'assistant';
      content: null;
      tool_calls: {
        id: string;
        type: 'function';
        function: {name: string; arguments: string};
      }[];
    }
  | {role: 'tool'; tool_call_id: string; content: string};

export interface AgentStepOptions extends SendChatMessageOptions {
  tools: string[];
  exchange: AgentExchangeMessage[];
  /** "Sunday 2026-11-15, 9:00 AM": the phone's own clock. */
  localNow?: string;
}

export interface AgentStepReply {
  reply: string;
  toolCalls: AgentToolCall[];
  sources: HandbookSource[];
  usedHandbook: boolean;
}

interface BackendAgentResponse {
  reply?: string;
  toolCalls?: AgentToolCall[];
  sources?: BackendChatSource[];
  usedHandbook?: boolean;
}


export const onlineChatSkill = {
  sendChatMessage: async (
    messages: OnlineChatMessage[],
    options: SendChatMessageOptions = {},
  ): Promise<CloudResult<OnlineChatReply>> => {
    const bounded = boundMessages(messages);
    if (!bounded) return EMPTY_MESSAGE;

    const trace = options.trace ?? null;
    trace?.note({onlineAttempted: true});
    trace?.mark('onlineDispatched');
    if (directProviderTestEnabled()) {
      trace?.note({transportNote: 'direct provider test build (no LAFINA server)'});
      const direct = await directTestChat(bounded, options.memories);
      if (direct.status === 'success') trace?.mark('firstContentReceived');
      return direct;
    }

    const result = await cloudClient.request<BackendChatResponse>(
      '/v1/ai/chat',
      {
        method: 'POST',
        signal: options.signal,
        timeoutMs: CHAT_REQUEST_TIMEOUT_MS,
        body: JSON.stringify({
          messages: bounded,
          useHandbook: handbookAllowed(options.useHandbook),
          ...(options.memories?.length ? { memories: options.memories } : {}),
        }),
      },
      true,
    );

    if (result.status !== 'success' || !result.data) {
      return {
        status: result.status === 'success' ? 'server_error' : result.status,
        error: result.error || 'Cloud AI chat request failed.',
        httpStatus: result.httpStatus,
      };
    }

    const rawReply = result.data.reply?.trim();
    if (!rawReply) {
      return {
        status: 'server_error',
        error: 'Cloud AI returned an empty response.',
      };
    }

    const reply = options.keepNameCase ? rawReply : normalizeName(rawReply);
    // Not streamed: the whole reply arrives with the response.
    trace?.mark('firstNetworkChunk');
    trace?.mark('firstContentReceived');
    trace?.note({onlineModelId: reportedModel(result.data.model)});

    return {
      status: 'success',
      data: {
        reply,
        sources: normalizeSources(result.data.sources),
        usedHandbook: Boolean(result.data.usedHandbook ?? result.data.used_handbook ?? result.data.sources?.length),
      },
    };
  },

  /**
   * The same reply as `sendChatMessage`, shown while DeepSeek writes it.
   * Falls back to the regular endpoint when the stream route is missing or
   * the stream fails before any text, so the result is never worse than a
   * normal request. If the reply stops part-way, the text that arrived is
   * returned with `interrupted: true`.
   */
  streamChatMessage: async (
    messages: OnlineChatMessage[],
    options: StreamChatMessageOptions,
  ): Promise<CloudResult<OnlineChatReply>> => {
    const bounded = boundMessages(messages);
    if (!bounded) return EMPTY_MESSAGE;
    const trace = options.trace ?? null;
    if (directProviderTestEnabled()) {
      trace?.note({
        onlineAttempted: true,
        streamed: false,
        transportNote: 'direct provider test build (no LAFINA server)',
      });
      trace?.mark('onlineDispatched');
      const result = await directTestChat(bounded, options.memories);
      if (result.status === 'success' && result.data) {
        trace?.mark('firstContentReceived');
        options.onReplyText(result.data.reply);
      }
      return result;
    }
    const useHandbook = handbookAllowed(options.useHandbook);
    const memoryField = options.memories?.length ? { memories: options.memories } : {};
    const fallback = (why: string) => {
      trace?.note({streamed: false, transportNote: `stream → regular endpoint (${why})`});
      return onlineChatSkill.sendChatMessage(bounded, {
        useHandbook,
        ...memoryField,
        signal: options.signal,
        trace,
      });
    };
    if (options.signal?.aborted) {
      return { status: 'server_unavailable', error: 'cancelled' };
    }
    if (streamRouteMissing) return fallback('stream route missing on this server');
    trace?.note({onlineAttempted: true, streamed: true});
    trace?.mark('onlineDispatched');

    let buffer = '';
    let reply = '';
    let done: StreamEvent | null = null;
    let failed = false;
    const consume = (events: StreamEvent[]) => {
      for (const event of events) {
        if (event.type === 'delta' && typeof event.text === 'string') {
          reply += event.text;
        } else if (event.type === 'done') {
          done = event;
        } else if (event.type === 'error') {
          failed = true;
        }
      }
    };
    const result = await cloudClient.stream(
      '/v1/ai/chat/stream',
      { messages: bounded, useHandbook, ...memoryField },
      {
        signal: options.signal,
        onText: (chunk) => {
          // Network bytes, which may be only a keep-alive or a header-like
          // comment; reply text is marked separately below.
          if (chunk) trace?.mark('firstNetworkChunk');
          const before = reply;
          const parsed = takeEvents(buffer + chunk);
          buffer = parsed.rest;
          consume(parsed.events);
          if (reply !== before && reply.trim()) {
            trace?.mark('firstContentReceived');
            options.onReplyText(normalizeName(reply.trimStart()));
          }
        },
        // The reply is final at "done" (or "error"); the server may still be
        // saving usage before it closes the connection.
        isComplete: () => done !== null || failed,
      },
      true,
    );
    if (buffer.trim()) consume(takeEvents(`${buffer}\n\n`).events);

    const text = normalizeName(reply.trim());
    if (!text) {
      if (options.signal?.aborted) {
        return { status: 'server_unavailable', error: 'cancelled' };
      }
      if (result.httpStatus === 404 || result.httpStatus === 405) {
        streamRouteMissing = true;
        return fallback('stream route missing on this server');
      }
      // A connection failure, or a 200 that was not a usable stream (a proxy
      // that rewrote it, say): the regular request gives the real answer.
      if (result.status === 'success' || result.status === 'server_unavailable') {
        return fallback(
          result.status === 'success'
            ? 'stream carried no reply text'
            : 'stream connection failed before any text',
        );
      }
      return {
        status: result.status,
        error: result.error || 'Cloud AI chat request failed.',
        httpStatus: result.httpStatus,
      };
    }
    const finished = done as StreamEvent | null;
    trace?.note({onlineModelId: reportedModel(finished?.model)});
    return {
      status: 'success',
      data: {
        reply: text,
        sources: normalizeSources(finished?.sources),
        usedHandbook: Boolean(finished?.usedHandbook ?? finished?.sources?.length),
        ...(finished && !failed ? {} : { interrupted: true }),
      },
    };
  },

  /**
   * One Chat agent step (`POST /v1/ai/chat/agent`): DeepSeek either replies or
   * asks the phone to run tools. Any failure (including a server without the
   * agent route yet) lets the caller fall back to the ordinary chat reply.
   */
  agentStep: async (
    messages: OnlineChatMessage[],
    options: AgentStepOptions,
  ): Promise<CloudResult<AgentStepReply>> => {
    const bounded = boundMessages(messages);
    if (!bounded || bounded[bounded.length - 1].role !== 'user')
      return {status: 'validation_error', error: 'Message cannot be empty.'};
    if (agentRouteMissing || directProviderTestEnabled())
      return AGENT_UNAVAILABLE;
    const result = await cloudClient.request<BackendAgentResponse>(
      '/v1/ai/chat/agent',
      {
        method: 'POST',
        timeoutMs: CHAT_REQUEST_TIMEOUT_MS,
        body: JSON.stringify({
          messages: bounded,
          useHandbook: handbookAllowed(options.useHandbook),
          ...(options.memories?.length ? {memories: options.memories} : {}),
          tools: options.tools,
          exchange: options.exchange,
          ...(options.localNow ? {localNow: options.localNow} : {}),
        }),
      },
      true,
    );
    if (result.httpStatus === 404 || result.httpStatus === 405) {
      agentRouteMissing = true;
      return AGENT_UNAVAILABLE;
    }
    if (result.status !== 'success' || !result.data) {
      return {
        status: result.status === 'success' ? 'server_error' : result.status,
        error: result.error || 'Chat agent request failed.',
        httpStatus: result.httpStatus,
      };
    }
    const toolCalls = Array.isArray(result.data.toolCalls)
      ? result.data.toolCalls.filter(
          (call): call is AgentToolCall =>
            Boolean(call) &&
            typeof call.id === 'string' &&
            typeof call.name === 'string' &&
            Boolean(call.arguments) &&
            typeof call.arguments === 'object' &&
            !Array.isArray(call.arguments),
        )
      : [];
    const reply = normalizeName((result.data.reply || '').trim());
    if (!reply && toolCalls.length === 0) {
      return {
        status: 'server_error',
        error: 'Cloud AI returned an empty response.',
      };
    }
    return {
      status: 'success',
      data: {
        reply,
        toolCalls,
        sources: normalizeSources(result.data.sources),
        usedHandbook: Boolean(
          result.data.usedHandbook ?? result.data.sources?.length,
        ),
      },
    };
  },

  fetchHandbookStatus: async (): Promise<CloudResult<HandbookStatus>> => {
    const result = await cloudClient.request<BackendHandbookStatusResponse>(
      '/v1/ai/handbook/status',
      { method: 'GET' },
      true,
    );
    if (result.status !== 'success') {
      return {
        status: result.status,
        error: result.error,
        httpStatus: result.httpStatus,
      };
    }
    return {
      status: 'success',
      data: {
        available: Boolean(result.data?.available ?? (result.data?.enabled && result.data?.functional)),
        title:
          typeof result.data?.title === 'string' ? result.data.title : null,
        chunkCount:
          typeof result.data?.chunk_count === 'number'
            ? result.data.chunk_count
            : result.data?.passages ?? 0,
      },
    };
  },
};
