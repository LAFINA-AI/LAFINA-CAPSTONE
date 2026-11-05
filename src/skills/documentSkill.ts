import { cloudClient, CloudResult } from '../cloud';
import type { OnlineChatMessage } from './onlineChatSkill';

export type DocumentFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx';

export interface DocumentFormatMeta {
  format: DocumentFormat;
  label: string;
  shortLabel: string;
  extension: string;
  mimeType: string;
}

export const DOCUMENT_FORMATS: Record<DocumentFormat, DocumentFormatMeta> = {
  pdf: {
    format: 'pdf',
    label: 'PDF Document',
    shortLabel: 'PDF',
    extension: 'pdf',
    mimeType: 'application/pdf',
  },
  docx: {
    format: 'docx',
    label: 'Word Document',
    shortLabel: 'Word',
    extension: 'docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xlsx: {
    format: 'xlsx',
    label: 'Excel Spreadsheet',
    shortLabel: 'Excel',
    extension: 'xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  pptx: {
    format: 'pptx',
    label: 'PowerPoint Presentation',
    shortLabel: 'Slides',
    extension: 'pptx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
};

export const DOCUMENT_FORMAT_ORDER: readonly DocumentFormat[] = [
  'pdf',
  'docx',
  'xlsx',
  'pptx',
];

export const isDocumentFormat = (value: unknown): value is DocumentFormat =>
  typeof value === 'string' && value in DOCUMENT_FORMATS;

export interface GeneratedDocument {
  format: DocumentFormat;
  fileName: string;
  mimeType: string;
  contentBase64: string;
  title: string;
  summary: string;
  sizeBytes: number;
}

interface BackendDocumentResponse {
  requestId?: unknown;
  format?: unknown;
  filename?: unknown;
  fileName?: unknown;
  file_name?: unknown;
  mimeType?: unknown;
  mime_type?: unknown;
  sizeBytes?: unknown;
  size_bytes?: unknown;
  contentBase64?: unknown;
  content_base64?: unknown;
  title?: unknown;
  summary?: unknown;
  warnings?: unknown;
}

const MAX_DOCUMENT_MESSAGES = 10;
const MAX_DOCUMENT_CHARS = 8_000;
const MAX_HISTORY_MESSAGE_CHARS = 4_000;
const MAX_PROMPT_CHARS = 4_000;

const sanitizeFileName = (raw: string, extension: string): string => {
  const withoutExt = raw.replace(/\.[a-z0-9]{2,5}$/i, '');
  const cleaned = withoutExt
    .replace(/[^A-Za-z0-9._ -]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
  const stem = cleaned || 'lafina_document';
  return `${stem}.${extension}`;
};

const estimateBase64Bytes = (base64: string): number => {
  const len = base64.length;
  if (len === 0) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
};

export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const totalChars = (messages: OnlineChatMessage[]): number =>
  messages.reduce((sum, item) => sum + item.content.length, 0);

export const trimDocumentHistory = (
  messages: OnlineChatMessage[],
): OnlineChatMessage[] => {
  const recent = messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_HISTORY_MESSAGE_CHARS),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_DOCUMENT_MESSAGES);

  while (recent.length > 1 && totalChars(recent) > MAX_DOCUMENT_CHARS) {
    recent.shift();
  }
  while (recent.length > 1 && recent[0]?.role === 'assistant') {
    recent.shift();
  }
  if (recent.length === 1 && recent[0]!.content.length > MAX_DOCUMENT_CHARS) {
    recent[0] = {
      ...recent[0]!,
      content: recent[0]!.content.slice(0, MAX_DOCUMENT_CHARS),
    };
  }
  return recent;
};

export const describeDocumentFailure = (
  result: CloudResult<GeneratedDocument>,
): string => {
  switch (result.status) {
    case 'offline':
      return 'You appear to be offline. Connect to the internet to create files.';
    case 'auth_required':
      return 'Sign in to your cloud account to create files.';
    case 'subscription_required':
    case 'account_disabled':
      return 'Creating files is not available for this account.';
    case 'rate_limited':
      return 'Too many file requests right now. Please wait a moment and try again.';
    case 'validation_error':
      return result.error || 'Please describe what should go into the file.';
    default:
      return (
        result.error || 'Could not create the file right now. Please try again.'
      );
  }
};

export const documentSkill = {
  generate: async (params: {
    prompt: string;
    format: DocumentFormat;
    history?: OnlineChatMessage[];
  }): Promise<CloudResult<GeneratedDocument>> => {
    const prompt = params.prompt.trim().slice(0, MAX_PROMPT_CHARS);
    if (!prompt) {
      return {
        status: 'validation_error',
        error: 'Please describe what should go into the file.',
      };
    }
    if (!isDocumentFormat(params.format)) {
      return {
        status: 'validation_error',
        error: 'Unsupported document format.',
      };
    }

    const meta = DOCUMENT_FORMATS[params.format];
    const priorHistory = params.history ?? [];
    const lastHistoryMsg = priorHistory[priorHistory.length - 1];
    const combinedMessages: OnlineChatMessage[] =
      lastHistoryMsg &&
      lastHistoryMsg.role === 'user' &&
      lastHistoryMsg.content.trim() === prompt
        ? [...priorHistory]
        : [...priorHistory, { role: 'user', content: prompt }];
    const messages = trimDocumentHistory(combinedMessages);

    const result = await cloudClient.request<BackendDocumentResponse>(
      '/v1/ai/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          format: params.format,
          messages,
        }),
      },
      true,
    );

    if (result.status !== 'success' || !result.data) {
      return {
        status: result.status === 'success' ? 'server_error' : result.status,
        error: result.error,
        httpStatus: result.httpStatus,
      };
    }

    const raw = result.data;
    const rawBase64 =
      typeof raw?.contentBase64 === 'string'
        ? raw.contentBase64
        : typeof raw?.content_base64 === 'string'
        ? raw.content_base64
        : '';
    const contentBase64 = rawBase64.trim();
    if (!contentBase64) {
      return {
        status: 'server_error',
        error: 'The server returned an empty document.',
      };
    }

    const format = isDocumentFormat(raw?.format) ? raw.format : params.format;
    const formatMeta = DOCUMENT_FORMATS[format] || meta;
    const title =
      typeof raw?.title === 'string' && raw.title.trim()
        ? raw.title.trim()
        : formatMeta.label;
    const rawFileName =
      typeof raw?.filename === 'string' && raw.filename.trim()
        ? raw.filename.trim()
        : typeof raw?.fileName === 'string' && raw.fileName.trim()
        ? raw.fileName.trim()
        : typeof raw?.file_name === 'string' && raw.file_name.trim()
        ? raw.file_name.trim()
        : title;
    const fileName = sanitizeFileName(rawFileName, formatMeta.extension);
    const mimeType =
      typeof raw?.mimeType === 'string' && raw.mimeType.trim()
        ? raw.mimeType.trim()
        : typeof raw?.mime_type === 'string' && raw.mime_type.trim()
        ? raw.mime_type.trim()
        : formatMeta.mimeType;
    const warnings = Array.isArray(raw?.warnings)
      ? raw.warnings.filter(
          (w): w is string => typeof w === 'string' && w.trim().length > 0,
        )
      : [];
    const baseSummary =
      typeof raw?.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : `Created ${title} (${formatMeta.shortLabel}).`;
    const summary =
      warnings.length > 0
        ? `${baseSummary}\n\nNote: ${warnings.join(' ')}`
        : baseSummary;
    const sizeBytes =
      typeof raw?.sizeBytes === 'number' &&
      Number.isFinite(raw.sizeBytes) &&
      raw.sizeBytes > 0
        ? raw.sizeBytes
        : typeof raw?.size_bytes === 'number' &&
          Number.isFinite(raw.size_bytes) &&
          raw.size_bytes > 0
        ? raw.size_bytes
        : estimateBase64Bytes(contentBase64);

    return {
      status: 'success',
      data: {
        format,
        fileName,
        mimeType,
        contentBase64,
        title,
        summary,
        sizeBytes,
      },
    };
  },
};
