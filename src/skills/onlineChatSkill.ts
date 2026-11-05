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
}

export interface HandbookStatus {
  available: boolean;
  title?: string | null;
  chunkCount?: number;
}

export interface SendChatMessageOptions {
  useHandbook?: boolean;
}

const HANDBOOK_SETTING_KEY = 'chat.useHandbook';
const HANDBOOK_SETTING_ALIAS = 'ustp_handbook_enabled';
const MAX_CHAT_MESSAGES = 10;
const MAX_CHAT_MESSAGE_LENGTH = 8_000;

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
}

interface BackendHandbookStatusResponse {
  available?: unknown;
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
        typeof entry.page === 'number' && Number.isFinite(entry.page)
          ? entry.page
          : null,
      snippet:
        typeof entry.snippet === 'string' && entry.snippet.trim()
          ? entry.snippet.trim()
          : null,
    }));
};

export const onlineChatSkill = {
  sendChatMessage: async (
    messages: OnlineChatMessage[],
    options: SendChatMessageOptions = {},
  ): Promise<CloudResult<OnlineChatReply>> => {
    const trimmed = messages
      .slice(-MAX_CHAT_MESSAGES)
      .map((msg) => ({
        role: msg.role,
        content: msg.content.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH),
      }))
      .filter((msg) => msg.content.length > 0);
    if (trimmed.length === 0) {
      return {
        status: 'validation_error',
        error: 'Message cannot be empty.',
      };
    }

    const result = await cloudClient.request<BackendChatResponse>(
      '/v1/ai/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          messages: trimmed,
          use_handbook: options.useHandbook !== false,
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

    const reply = rawReply
      .replace(/\bL[.-]?A[.-]?F[.-]?I[.-]?N[.-]?A\b/gi, 'lafina')
      .replace(/\bLAFINA\b/g, 'lafina');

    return {
      status: 'success',
      data: {
        reply,
        sources: normalizeSources(result.data.sources),
        usedHandbook: Boolean(result.data.used_handbook),
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
        available: Boolean(result.data?.available),
        title:
          typeof result.data?.title === 'string' ? result.data.title : null,
        chunkCount:
          typeof result.data?.chunk_count === 'number'
            ? result.data.chunk_count
            : 0,
      },
    };
  },
};
