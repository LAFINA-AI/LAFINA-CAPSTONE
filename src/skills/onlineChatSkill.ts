import { cloudClient, CloudResult } from '../cloud';
import { localSettingsStore } from '../storage';

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
}

export interface StreamChatMessageOptions extends SendChatMessageOptions {
  /** The reply so far, each time more of it arrives. */
  onReplyText: (replySoFar: string) => void;
}

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
};

export const onlineChatSkill = {
  sendChatMessage: async (
    messages: OnlineChatMessage[],
    options: SendChatMessageOptions = {},
  ): Promise<CloudResult<OnlineChatReply>> => {
    const bounded = boundMessages(messages);
    if (!bounded) return EMPTY_MESSAGE;

    const result = await cloudClient.request<BackendChatResponse>(
      '/v1/ai/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          messages: bounded,
          useHandbook: options.useHandbook !== false,
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

    const reply = normalizeName(rawReply);

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
    const useHandbook = options.useHandbook !== false;
    const fallback = () => onlineChatSkill.sendChatMessage(bounded, { useHandbook });
    if (streamRouteMissing) return fallback();

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
      { messages: bounded, useHandbook },
      {
        onText: (chunk) => {
          const before = reply;
          const parsed = takeEvents(buffer + chunk);
          buffer = parsed.rest;
          consume(parsed.events);
          if (reply !== before && reply.trim()) {
            options.onReplyText(normalizeName(reply.trimStart()));
          }
        },
      },
      true,
    );
    if (buffer.trim()) consume(takeEvents(`${buffer}\n\n`).events);

    const text = normalizeName(reply.trim());
    if (!text) {
      if (result.httpStatus === 404 || result.httpStatus === 405) {
        streamRouteMissing = true;
        return fallback();
      }
      // A connection failure, or a 200 that was not a usable stream (a proxy
      // that rewrote it, say): the regular request gives the real answer.
      if (result.status === 'success' || result.status === 'server_unavailable') {
        return fallback();
      }
      return {
        status: result.status,
        error: result.error || 'Cloud AI chat request failed.',
        httpStatus: result.httpStatus,
      };
    }
    const finished = done as StreamEvent | null;
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
