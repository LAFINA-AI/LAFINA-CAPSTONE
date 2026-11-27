/**
 * Multi-turn clarification follow-up for reviewed commands.
 *
 * When a planner command is missing one required detail (for example,
 * "remind me to throw trash" has no time, so LAFINA asks what time), this
 * module remembers the partial intent for that (owner, surface, session) until
 * the very next reply. If the student answers with the missing detail ("9pm",
 * "tomorrow at 8am", "in 15 minutes"), the partial intent is completed and
 * sent through `prepareReviewedCommand` to produce a normal review card —
 * working identically offline and online, in both Quick Chat and Main Chat.
 *
 * Nothing is ever written here; every completed intent still requires Confirm.
 */
import {
  getReviewSessionId,
  REVIEW_TTL_MS,
  type PrepareResult,
  type ReviewSurface,
} from './commandReview';
import {
  formatLocalDate,
  parseDateAndTime,
  parseIntentFastPath,
  translateTaglishCommand,
  VAGUE_ITEM_TITLE,
} from './fastPathParser';
import {classifySmallTalk} from '../localConversation';
import type {ValidatedIntent} from './types';

export type PendingClarificationKind = 'missing_time' | 'missing_title';

export interface PendingClarification {
  readonly userId: string;
  readonly surface: ReviewSurface;
  readonly sessionId: string;
  readonly reviewSessionId: string;
  readonly assistantMessageId: string;
  readonly kind: PendingClarificationKind;
  readonly intent: ValidatedIntent;
  readonly clearLeadMinutes: boolean;
  readonly expiresAt: number;
}

const MAX_PENDING = 40;
const pendingMap = new Map<string, PendingClarification>();

const keyOf = (
  userId: string,
  surface: ReviewSurface,
  sessionId: string,
): string => `${userId}\0${surface}\0${sessionId}`;

const BARE_HOUR_REPLY_RE =
  /^(?:(?:at|for|around|by|make\s+it|set\s+(?:it\s+)?(?:to|for))\s+)?(?:(?:today|tonight|tomorrow|tmr|tmrw|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[.?!]*$/i;

const NON_TIME_QUESTION_RE =
  /^(?:what|why|how|who|where|when|explain|summarize|define|compare|show|list|check|can\s+you|could\s+you|do\s+i|am\s+i|is\s+there)\b/i;

const TIME_SUGGESTION_QUESTION_RE = /^(?:what|how)\s+about\b/i;

const PLACEHOLDER_FALLBACK_TITLES = new Set([
  'new task',
  'reminder',
  'study session',
  'alarm',
]);

const LEADING_TIME_PREPOSITION_RE =
  /^(?:at|on|in|by|around|for|tomorrow|today|tonight|next|this|after|every)\b/i;

/** Decides whether a clarification reply can be completed by the student's next message. */
export function classifyPendingClarification(
  intent: ValidatedIntent,
  review: PrepareResult | undefined,
): {kind: PendingClarificationKind; clearLeadMinutes: boolean} | null {
  if (!review || review.status === 'proposal') return null;

  if (intent.intent === 'create_reminder' && review.status === 'clarify') {
    const titleText = intent.title?.trim() ?? '';
    if (!intent.time && titleText.length > 0 && !VAGUE_ITEM_TITLE.test(titleText)) {
      return {kind: 'missing_time', clearLeadMinutes: false};
    }
    if (/already passed/i.test(review.reply)) {
      return {kind: 'missing_time', clearLeadMinutes: false};
    }
    if (/has no start time/i.test(review.reply)) {
      return {kind: 'missing_time', clearLeadMinutes: true};
    }
  }

  if (
    intent.intent === 'create_alarm' &&
    (review.status === 'invalid' || review.status === 'clarify') &&
    (/what time should the alarm/i.test(review.reply) ||
      /already passed/i.test(review.reply))
  ) {
    return {kind: 'missing_time', clearLeadMinutes: false};
  }

  if (
    intent.intent === 'reschedule' &&
    review.status === 'clarify' &&
    (/when should the reminder ring/i.test(review.reply) ||
      /already passed/i.test(review.reply))
  ) {
    return {kind: 'missing_time', clearLeadMinutes: false};
  }

  if (
    (intent.intent === 'create_reminder' ||
      intent.intent === 'create_task' ||
      intent.intent === 'create_time_block') &&
    (review.status === 'invalid' || review.status === 'clarify') &&
    /what should (?:i remind you about|the (?:task|time block) be called)/i.test(
      review.reply,
    )
  ) {
    return {kind: 'missing_title', clearLeadMinutes: false};
  }

  return null;
}

export function rememberPendingClarification(
  entry: Omit<PendingClarification, 'reviewSessionId' | 'expiresAt'>,
  nowMs: number = Date.now(),
): void {
  const key = keyOf(entry.userId, entry.surface, entry.sessionId);
  pendingMap.delete(key);
  pendingMap.set(key, {
    ...entry,
    reviewSessionId: getReviewSessionId(),
    expiresAt: nowMs + REVIEW_TTL_MS,
  });
  while (pendingMap.size > MAX_PENDING) {
    const oldest = pendingMap.keys().next().value;
    if (oldest === undefined) break;
    pendingMap.delete(oldest);
  }
}

export function getPendingClarification(
  userId: string,
  surface: ReviewSurface,
  sessionId: string,
  lastAssistantId: string | null,
  nowMs: number = Date.now(),
): PendingClarification | null {
  const key = keyOf(userId, surface, sessionId);
  const entry = pendingMap.get(key);
  if (!entry) return null;
  if (
    entry.reviewSessionId !== getReviewSessionId() ||
    entry.expiresAt <= nowMs ||
    !lastAssistantId ||
    entry.assistantMessageId !== lastAssistantId
  ) {
    pendingMap.delete(key);
    return null;
  }
  return entry;
}

export function clearPendingClarification(
  userId?: string,
  surface?: ReviewSurface,
  sessionId?: string,
): void {
  if (!userId) {
    pendingMap.clear();
    return;
  }
  for (const [key, entry] of pendingMap.entries()) {
    if (entry.userId !== userId) continue;
    if (surface && entry.surface !== surface) continue;
    if (sessionId && entry.sessionId !== sessionId) continue;
    pendingMap.delete(key);
  }
}

const combineRawTranscript = (original: string, followUp: string): string => {
  const base = original.trim();
  const extra = followUp.trim();
  if (!base) return extra;
  if (!extra) return base;
  if (LEADING_TIME_PREPOSITION_RE.test(extra)) {
    return `${base} ${extra}`;
  }
  return `${base} at ${extra}`;
};

const CANCEL_CLARIFICATION_RE =
  /^(?:no|nope|cancel(?:\s+(?:it|that|this))?|never\s*mind|nevermind|nvm|forget\s+(?:it|that|about\s+it)|stop|no\s+thanks?|skip(?:\s+(?:it|that|this))?|wag\s+na|huwag\s+na|hindi\s+na)[.!?]*$/i;

const CONVERSATIONAL_TOPIC_CHANGE_RE =
  /^(?:i['’]m|i\s+am|i\s+have\s+been|i\s+feel|can\s+you|could\s+you|please\s+help|help\s+me|tell\s+me|explain|sorry)\b/i;

/**
 * Attempts to merge a short follow-up answer ("9pm", "tomorrow at 8am",
 * "in 15 minutes") into a pending incomplete intent. Returns null when the
 * student started a new command or changed the subject.
 */
export function resolveClarificationFollowUp(
  pending: PendingClarification,
  text: string,
  referenceDate: Date = new Date(),
): ValidatedIntent | null {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  if (CANCEL_CLARIFICATION_RE.test(trimmed)) return null;

  const translated = translateTaglishCommand(trimmed) ?? trimmed;

  if (pending.kind === 'missing_time') {
    if (
      NON_TIME_QUESTION_RE.test(translated) &&
      !TIME_SUGGESTION_QUESTION_RE.test(translated)
    ) {
      return null;
    }

    // If the student gave a complete new command with a real title (not a
    // time-only phrase like "9pm", "tomorrow", or "make it 9pm" which
    // fastPathParser falls back to "New Task" / "Reminder"), let the new
    // command run instead.
    const standalone = parseIntentFastPath(trimmed, referenceDate);
    if (standalone.intent !== 'chat') {
      const standaloneTitle = standalone.title?.trim() ?? '';
      const isPlaceholder =
        !standaloneTitle ||
        PLACEHOLDER_FALLBACK_TITLES.has(standaloneTitle.toLowerCase()) ||
        VAGUE_ITEM_TITLE.test(standaloneTitle) ||
        /^(?:it|that|this|reminder|alarm)$/i.test(standaloneTitle);
      const isReadOrMutationQuery =
        standalone.intent.startsWith('query_') ||
        standalone.intent.startsWith('list_') ||
        standalone.intent.startsWith('delete_') ||
        standalone.intent === 'create_note';
      if (!isPlaceholder || isReadOrMutationQuery) {
        return null;
      }
    }

    let parsed = parseDateAndTime(translated, referenceDate);
    if (!parsed.time) {
      const bareMatch = BARE_HOUR_REPLY_RE.exec(translated);
      if (bareMatch) {
        const hourToken = bareMatch[1];
        const withAt = translated.replace(
          new RegExp(`\\b${hourToken}\\b`, 'i'),
          `at ${hourToken}`,
        );
        const retry = parseDateAndTime(withAt, referenceDate);
        if (retry.time) {
          parsed = {
            ...parsed,
            time: retry.time,
            date: parsed.date ?? retry.date,
          };
        }
      }
    }

    if (!parsed.time && !parsed.date && !parsed.durationMinutes) {
      return null;
    }

    const today = formatLocalDate(referenceDate);
    const resolvedDate =
      parsed.date ??
      (parsed.time && pending.intent.date && pending.intent.date < today
        ? today
        : pending.intent.date);

    return {
      ...pending.intent,
      date: resolvedDate,
      time: parsed.time ?? pending.intent.time,
      endTime: parsed.endTime ?? pending.intent.endTime,
      durationMinutes: parsed.durationMinutes ?? pending.intent.durationMinutes,
      ...(pending.clearLeadMinutes ? {leadMinutes: null} : {}),
      rawTranscript: combineRawTranscript(
        pending.intent.rawTranscript,
        trimmed,
      ),
      source: 'fast_path',
      isValid: true,
    };
  }

  // missing_title
  if (
    trimmed.length > 100 ||
    classifySmallTalk(trimmed) ||
    trimmed.endsWith('?') ||
    NON_TIME_QUESTION_RE.test(translated) ||
    CONVERSATIONAL_TOPIC_CHANGE_RE.test(translated) ||
    VAGUE_ITEM_TITLE.test(trimmed)
  ) {
    return null;
  }
  const standalone = parseIntentFastPath(trimmed, referenceDate);
  if (standalone.intent !== 'chat') {
    return null;
  }
  const parsed = parseDateAndTime(translated, referenceDate);
  const titleCandidate = trimmed.slice(0, 200).trim();
  if (!titleCandidate) return null;

  return {
    ...pending.intent,
    title: titleCandidate,
    date: parsed.date ?? pending.intent.date,
    time: parsed.time ?? pending.intent.time,
    endTime: parsed.endTime ?? pending.intent.endTime,
    durationMinutes: parsed.durationMinutes ?? pending.intent.durationMinutes,
    rawTranscript: `${pending.intent.rawTranscript} ${trimmed}`.trim(),
    source: 'fast_path',
    isValid: true,
  };
}
