import {chatStore, isUstpSessionId} from '../../storage/chatStore';
import type {ChatMessage} from '../../storage/chatStore';
import {
  containsSensitiveSecret,
  sanitizeUntrustedContext,
} from '../../ai/voiceActions/promptSanitizer';
import type {CallRecapTurn, ConversationTurn} from './types';

/**
 * Call memory (ADR-046). Every online call, and every reconnect, starts with
 * the last messages of the chat the call writes into. Calls save their turns
 * there (`createVoicePersistence`), so a second call in the same chat, or a
 * call that reconnected after a drop, knows what was just said.
 *
 * Bounded and read-only: at most 16 messages and 3,000 characters, newest
 * kept first. It goes at the front of the student context, which both the
 * app and the server cut from the end.
 */

export const CHAT_RECAP_MAX_MESSAGES = 16;
export const CHAT_RECAP_MAX_CHARS = 3000;
const PER_MESSAGE_CHARS = 300;
/** Up to this many earlier turns of the call go to a server that accepts them. */
export const CALL_RECAP_MAX_TURNS = 12;

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/** "3 minutes ago", "yesterday": old chat must not read as "just now". */
export const relativeTime = (iso: string, now: Date): string => {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 'some time ago';
  const minutes = Math.max(0, Math.round((now.getTime() - at) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
};

/**
 * The chat a call's turns are saved into (the open chat), or null when the
 * open chat is a USTP handbook chat: the call then writes to a new general
 * chat, which has no history yet. Mirrors `chatStore.addGeneralMessage`.
 */
export const callChatSessionId = (userId: string): string | null => {
  try {
    const open = chatStore.currentSessionId(userId);
    return open && !isUstpSessionId(open) ? open : null;
  } catch {
    return null;
  }
};

const messageLine = (message: ChatMessage): string | null => {
  const speaker = message.sender === 'user' ? 'Student' : 'LAFINA';
  const raw = oneLine(message.content ?? '');
  const attachment = message.attachment
    ? `[attachment: ${clip(
        oneLine(message.attachment.fileName || 'file'),
        60,
      )}]`
    : '';
  if (!raw && !attachment) return null;
  if (raw && containsSensitiveSecret(raw)) {
    return `${speaker}: [a message with private details was left out]`;
  }
  const text = sanitizeUntrustedContext(clip(raw, PER_MESSAGE_CHARS), 400);
  const cut = message.voiceInterrupted ? ' (cut off)' : '';
  return `${speaker}: ${[attachment, text].filter(Boolean).join(' ')}${cut}`;
};

/**
 * The recent conversation of the call's chat as plain lines, oldest first,
 * under a header that says how long ago it was. Empty when there is none
 * or it cannot be read (the call still starts).
 */
export const buildChatRecap = (
  userId: string,
  options: {
    now?: Date;
    maxMessages?: number;
    maxChars?: number;
    sessionId?: string | null;
  } = {},
): string => {
  if (!userId) return '';
  const sessionId =
    options.sessionId && !isUstpSessionId(options.sessionId)
      ? options.sessionId
      : callChatSessionId(userId);
  if (!sessionId) return '';
  const now = options.now ?? new Date();
  const maxMessages = options.maxMessages ?? CHAT_RECAP_MAX_MESSAGES;
  const maxChars = options.maxChars ?? CHAT_RECAP_MAX_CHARS;
  let messages: ChatMessage[];
  try {
    messages = chatStore.getMessagesPage(userId, {
      limit: maxMessages,
      sessionId,
    }).items;
  } catch {
    return '';
  }
  const kept: string[] = [];
  let used = 0;
  let newest: ChatMessage | null = null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const line = messageLine(messages[i]);
    if (!line) continue;
    if (used + line.length + 1 > maxChars) break;
    kept.push(line);
    used += line.length + 1;
    newest = newest ?? messages[i];
  }
  if (!kept.length || !newest) return '';
  kept.reverse();
  return `Earlier in this chat (the student's own conversation with you; the last message was ${relativeTime(
    newest.createdAt,
    now,
  )}):\n${kept.join('\n')}`;
};

/**
 * This call's finished turns, for a server that takes them as real prior
 * messages (`call_recap`, capability `resume`). Provisional words are left
 * out; the list starts with a student turn, as a conversation does.
 */
export const callRecapTurns = (
  turns: readonly ConversationTurn[],
  options: {maxTurns?: number; maxChars?: number} = {},
): CallRecapTurn[] => {
  const maxTurns = options.maxTurns ?? CALL_RECAP_MAX_TURNS;
  const maxChars = options.maxChars ?? CHAT_RECAP_MAX_CHARS;
  const out: CallRecapTurn[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0 && out.length < maxTurns; i -= 1) {
    const turn = turns[i];
    if (turn.status === 'provisional') continue;
    const text = clip(oneLine(turn.text), PER_MESSAGE_CHARS);
    if (!text || containsSensitiveSecret(text)) continue;
    if (used + text.length > maxChars) break;
    out.push({role: turn.role, text});
    used += text.length;
  }
  out.reverse();
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
};
