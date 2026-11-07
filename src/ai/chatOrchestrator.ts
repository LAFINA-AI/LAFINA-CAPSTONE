import { chatStore, type ChatAttachment, type ChatMessage } from '../storage/chatStore';
import { plannerQueries } from '../storage/plannerQueries';
import type { PlannerWindow } from '../storage/plannerQueries';
import { addDaysToDate, isRealDate, MINUTES_PER_DAY } from '../storage/eventTime';
import {
  DOCUMENT_FORMATS,
  describeDocumentFailure,
  documentSkill,
  type DocumentFormat,
} from '../skills/documentSkill';
import {
  handbookSourceLabel,
  onlineChatSkill,
  type OnlineChatMessage,
} from '../skills/onlineChatSkill';
import { saveGeneratedFile } from '../ui/components/chat/chatFiles';
import { detectDocumentRequest } from './documentIntent';
import { intentService } from './nlu/intentService';
import { executeNluAction } from './nlu/actionExecutor';
import { routeIntent } from './nlu/intentRoutes';
import type { ResolvedIntentRoute, RingingCallContext } from './nlu/intentRoutes';
import {
  cancelReviewedCommand,
  confirmReviewedCommand,
  prepareReviewedCommand,
} from './nlu/commandReview';
import type { ConfirmResult, PrepareResult, ReviewSurface } from './nlu/commandReview';
import { acknowledgeReminderAction, snoozeReminderAction } from '../scheduler/reminderActions';
import { formatLocalDate } from './nlu/fastPathParser';
import { ttsService } from './tts/ttsService';
import {
  buildLocalConversationReply,
  classifySmallTalk,
  OFFLINE_REPLY_NOTE,
} from './localConversation';
import type { ValidatedIntent, NluActionResult } from './nlu/types';

export interface ScheduleConflict {
  hasConflict: boolean;
  conflictingTitle?: string;
  conflictingStartTime?: string;
  conflictingEndTime?: string;
  conflictingType?: 'time_block' | 'event';
}

export interface TimeSlot {
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface ProcessMessageOptions {
  referenceDate?: Date;
  speakReply?: boolean;
  forceSchedule?: boolean;
  onlineMode?: boolean;
  useHandbook?: boolean;
  documentFormat?: DocumentFormat | null;
  /** Which review card shows a proposal (AGY-PORT 04). Defaults to Chat. */
  reviewSurface?: ReviewSurface;
  /**
   * Identity captured by a ringing reminder call. Only then do acknowledge and
   * snooze act immediately, through the call actions with that identity.
   */
  ringingCall?: RingingCallContext | null;
}

/** Outcome of Confirm or Cancel on a review card. */
export interface ReviewDecisionResult {
  /** Present for Confirm; absent for Cancel. */
  outcome?: ConfirmResult;
  cancelled?: boolean;
  /** The transcript line saved for this decision, when one was saved. */
  assistantMessage: ChatMessage | null;
  reply: string;
}

export interface ChatOrchestratorResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  intent: ValidatedIntent;
  actionResult?: NluActionResult;
  conflict?: ScheduleConflict;
  recommendedSlot?: TimeSlot | null;
  attachment?: ChatAttachment | null;
  handbookNote?: string | null;
  usedOnline?: boolean;
  /** Route taken for the extracted intent (AGY-PORT 04). */
  route?: ResolvedIntentRoute;
  /** Present when the request would change the planner: a proposal, clarification or refusal. Nothing was written. */
  review?: PrepareResult;
  reply: string;
}

/** Parses HH:mm string to minutes from midnight. */
export function timeToMinutes(timeStr: string): number {
  const parts = (timeStr || '').trim().split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  return isNaN(hours) || isNaN(minutes) ? 0 : hours * 60 + minutes;
}

/** Formats minutes from midnight to HH:mm string. */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** Formats HH:mm into friendly 12-hour AM/PM string. */
export function format12HourTime(timeStr?: string | null): string {
  if (!timeStr) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(timeStr.trim());
  if (!match) return timeStr;
  let hour = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const minStr = min < 10 ? `0${min}` : `${min}`;
  return `${hour}:${minStr} ${meridiem}`;
}

/**
 * Bounded, owner-scoped context for online requests. A read failure sends no
 * history rather than blocking the reply; the message itself is already saved.
 */
function readRecentHistory(userId: string, count: number): ChatMessage[] {
  try {
    return chatStore.getRecentMessages(userId, count);
  } catch (error) {
    console.warn('[ChatOrchestrator] Could not read recent chat history:', error);
    return [];
  }
}

/** Handbook topics answer only from the verified online handbook, never offline. */
const isHandbookQuestion = (text: string): boolean =>
  /\b(?:ustp|handbook|dean'?s\s+list|grading\s+system|retention\s+policy|tuition|graduation\s+requirements|uniform\s+policy|dress\s+code|drop(?:ping)?\s+subject|prerequisite|academic\s+probation)\b/i.test(
    text,
  );

/**
 * On-device replies are tagged when saved. Replies saved before the tag
 * existed are recognized by their fixed wording so DeepSeek never sees them.
 */
const isLocalReply = (msg: ChatMessage): boolean =>
  msg.localReply === true ||
  /^(?:hey! )?i am lafina, (?:your offline academic assistant|doing great)/i.test(msg.content.trim());

/**
 * One bounded read of a day's blocks and events, recurring occurrences
 * included (AGY-PORT 06). The day before and after are read too (AGY-PORT 08),
 * so an overnight item that spills into this day, or one this proposal spills
 * into, is seen. Like the legacy store getters it replaces, a storage failure
 * yields an empty day here, so the check never blocks a proposal; the change
 * itself still waits for review and Confirm.
 */
const readDay = (userId: string, date: string): PlannerWindow => {
  try {
    return plannerQueries.window(
      userId,
      addDaysToDate(date, -1),
      addDaysToDate(date, 1),
    );
  } catch (error) {
    console.warn('[ChatOrchestrator] Could not read the day for a conflict check:', error);
    return { tasks: [], events: [], blocks: [] };
  }
};

/**
 * Online Mode must never pass off a local reply as DeepSeek. Each failure says
 * plainly that the online answer is missing and that offline tools still work.
 */
export const describeOnlineChatFailure = (status: string): string => {
  const offlineNote = ' Your offline scheduling tools are still available.';
  switch (status) {
    case 'auth_required':
      return 'Sign in to use DeepSeek in Online Mode.' + offlineNote;
    case 'account_disabled':
      return 'This account is disabled, so DeepSeek cannot reply.' + offlineNote;
    case 'offline':
      return 'You are offline, so DeepSeek cannot reply. Reconnect and send your message again.' + offlineNote;
    case 'rate_limited':
      return 'DeepSeek usage limit reached. Wait a moment and try again.' + offlineNote;
    default:
      return (
        'DeepSeek could not reply right now. Check your connection and try sending your message again.' +
        offlineNote
      );
  }
};

export class ChatOrchestrator {
  /**
   * Conflict-aware check for time block and calendar event overlaps.
   * `day` lets a caller that checks many slots read the day only once.
   */
  checkScheduleConflict(
    userId: string,
    date: string,
    startTime: string,
    endTime: string,
    day: PlannerWindow = readDay(userId, date),
  ): ScheduleConflict {
    // Minutes from this day's midnight. An end before the start is on the
    // next day (the floating overnight rule Calendar draws). An equal start and
    // end is not checked, as before.
    const previousDay = isRealDate(date) ? addDaysToDate(date, -1) : null;
    const nextDay = isRealDate(date) ? addDaysToDate(date, 1) : null;
    const span = (itemDate: string, start: string, end: string): [number, number] | null => {
      const from = timeToMinutes(start);
      let to = timeToMinutes(end);
      if (to === from) return null;
      if (to < from) to += MINUTES_PER_DAY;
      const offset =
        itemDate === date
          ? 0
          : itemDate === previousDay
            ? -MINUTES_PER_DAY
            : itemDate === nextDay
              ? MINUTES_PER_DAY
              : null;
      return offset === null ? null : [from + offset, to + offset];
    };
    const proposal = span(date, startTime, endTime);
    if (!proposal) {
      return { hasConflict: false };
    }
    const overlaps = (item: { date: string; startTime: string; endTime: string }): boolean => {
      const other = span(item.date, item.startTime, item.endTime);
      return !!other && Math.max(proposal[0], other[0]) < Math.min(proposal[1], other[1]);
    };
    // Same-day items first, as before, then the neighbouring days.
    const byDay = <T extends { date: string }>(items: T[]): T[] => [
      ...items.filter((item) => item.date === date),
      ...items.filter((item) => item.date !== date),
    ];

    // 1. Check existing time blocks
    for (const b of byDay(day.blocks)) {
      if (overlaps(b)) {
        return {
          hasConflict: true,
          conflictingTitle: b.title,
          conflictingStartTime: b.startTime,
          conflictingEndTime: b.endTime,
          conflictingType: 'time_block',
        };
      }
    }

    // 2. Check existing calendar events
    for (const e of byDay(day.events)) {
      if (overlaps(e)) {
        return {
          hasConflict: true,
          conflictingTitle: e.title,
          conflictingStartTime: e.startTime,
          conflictingEndTime: e.endTime,
          conflictingType: 'event',
        };
      }
    }

    return { hasConflict: false };
  }

  /**
   * Adaptive slot recommendation:
   * Finds the first available non-overlapping daytime slot (between 08:00 and 20:00).
   */
  recommendAvailableSlot(
    userId: string,
    date: string,
    durationMinutes: number,
  ): TimeSlot | null {
    const duration = Math.max(15, durationMinutes || 60);
    const dayStartMinutes = 8 * 60;  // 08:00 AM
    const dayEndMinutes = 20 * 60;   // 08:00 PM
    const step = 30;                 // 30 minute increments
    const day = readDay(userId, date);

    for (let current = dayStartMinutes; current + duration <= dayEndMinutes; current += step) {
      const candidateStart = minutesToTime(current);
      const candidateEnd = minutesToTime(current + duration);

      const conflict = this.checkScheduleConflict(
        userId,
        date,
        candidateStart,
        candidateEnd,
        day,
      );

      if (!conflict.hasConflict) {
        return {
          startTime: candidateStart,
          endTime: candidateEnd,
        };
      }
    }

    return null;
  }

  /**
   * End-to-end assistant loop:
   * 1. Persists user query to chatStore.
   * 2. Handles online document generation (PDF, Word, Excel, PowerPoint) if requested.
   * 3. Extracts validated intent via IntentService (fast-path / on-device SLM).
   * 4. Performs conflict checks & adaptive slot recommendation for schedule items.
   * 5. Executes SQLite actions & native scheduler alarms, or online RAG chat when Online Mode is active.
   * 6. Persists assistant reply (and optional document attachment) to chatStore.
   * 7. Reads aloud reply via react-native-tts if requested.
   */
  async processMessage(
    userId: string,
    text: string,
    options: ProcessMessageOptions = {},
  ): Promise<ChatOrchestratorResult> {
    const trimmed = (text || '').trim();
    const refDate = options.referenceDate || new Date();
    const todayStr = formatLocalDate(refDate);

    // Step 1: Persist user message
    const userMessage = chatStore.addMessage(userId, 'user', trimmed);

    let finalReply = '';
    let actionResult: NluActionResult | undefined;
    let conflictResult: ScheduleConflict | undefined;
    let recommendedSlot: TimeSlot | null = null;
    let attachment: ChatAttachment | null = null;
    let handbookNote: string | null = null;
    let usedOnline = false;
    // On-device conversational replies; never replayed to DeepSeek as its own.
    let localReply = false;
    let route: ResolvedIntentRoute | undefined;
    let review: PrepareResult | undefined;

    // Step 2: Check for explicit or natural-language document generation request
    const detectedDoc = options.documentFormat
      ? { format: options.documentFormat, prompt: trimmed }
      : detectDocumentRequest(trimmed);

    if (detectedDoc) {
      const formatMeta = DOCUMENT_FORMATS[detectedDoc.format];
      const docIntent: ValidatedIntent = {
        intent: 'chat',
        title: formatMeta.label,
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: detectedDoc.prompt,
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: trimmed,
        isValid: true,
      };

      if (!options.onlineMode) {
        finalReply = `Creating ${formatMeta.shortLabel} files requires Online Mode. Switch to Online Mode in the chat header to generate ${formatMeta.label.toLowerCase()}s.`;
      } else {
        const previousMessages: OnlineChatMessage[] = readRecentHistory(userId, 11)
          .filter((msg) => msg.id !== userMessage.id)
          .map((msg) => ({
            role: msg.sender,
            content: msg.content,
          }));
        const docResult = await documentSkill.generate({
          prompt: detectedDoc.prompt,
          format: detectedDoc.format,
          history: previousMessages,
        });
        if (docResult.status === 'success' && docResult.data) {
          try {
            attachment = await saveGeneratedFile(docResult.data);
            finalReply = docResult.data.summary;
            usedOnline = true;
          } catch (saveError) {
            console.warn('[ChatOrchestrator] Failed to save generated document:', saveError);
            finalReply = `${docResult.data.summary}\n\n(The ${formatMeta.shortLabel} file was created, but could not be saved to device storage.)`;
            usedOnline = true;
          }
        } else {
          finalReply = describeDocumentFailure(docResult);
        }
      }

      const assistantMessage = chatStore.addMessage(userId, 'assistant', finalReply, attachment);
      if (options.speakReply) {
        try {
          await ttsService.speak(finalReply);
        } catch (err) {
          console.warn('[ChatOrchestrator] TTS playback error:', err);
        }
      }
      return {
        userMessage,
        assistantMessage,
        intent: docIntent,
        attachment,
        handbookNote,
        usedOnline,
        reply: finalReply,
      };
    }

    // Step 3: Extract validated intent
    const validated = await intentService.extractIntent(trimmed, {
      referenceDate: refDate,
    });

    // Step 4: Conflict-aware scheduling for time blocks
    if (validated.intent === 'create_time_block' && !options.forceSchedule) {
      const blockDate = validated.date || todayStr;
      const startTime = validated.time || '09:00';
      const duration = validated.durationMinutes || 60;
      const endTime = validated.endTime || minutesToTime(timeToMinutes(startTime) + duration);

      conflictResult = this.checkScheduleConflict(userId, blockDate, startTime, endTime);

      if (conflictResult.hasConflict) {
        recommendedSlot = this.recommendAvailableSlot(userId, blockDate, duration);
        const conflictStart12 = format12HourTime(conflictResult.conflictingStartTime);
        const conflictEnd12 = format12HourTime(conflictResult.conflictingEndTime);

        let conflictMessage = `You already have "${conflictResult.conflictingTitle}" scheduled from ${conflictStart12} to ${conflictEnd12} on ${blockDate}.`;
        if (recommendedSlot) {
          const recStart12 = format12HourTime(recommendedSlot.startTime);
          const recEnd12 = format12HourTime(recommendedSlot.endTime);
          conflictMessage += ` I found an open slot from ${recStart12} to ${recEnd12}. Would you like me to schedule it then?`;
        } else {
          conflictMessage += ' There are no open daytime slots available on that day.';
        }

        finalReply = conflictMessage;
      }
    }

    // Step 5: Planner changes become a private proposal that waits for Confirm
    // (AGY-PORT 04). Reads, call actions and conversation keep their routes.
    if (!finalReply) {
      route = routeIntent(validated.intent, { ringingCall: options.ringingCall });
      if (route === 'reviewed_mutation') {
        review = prepareReviewedCommand(userId, validated, {
          referenceDate: refDate,
          surface: options.reviewSurface,
          ringingCall: options.ringingCall,
        });
        finalReply = review.reply;
        // "thanks" / "ok" with no ringing call and nothing to acknowledge is
        // just conversation. The refused review wrote nothing, so drop it.
        const smallTalk = classifySmallTalk(trimmed);
        if (
          review.status === 'invalid' &&
          !options.ringingCall &&
          validated.intent === 'acknowledge' &&
          (smallTalk === 'thanks' || smallTalk === 'acknowledgement')
        ) {
          review = undefined;
          route = 'conversation';
          finalReply = '';
        }
      }
      if (route === 'call_context_immediate' && options.ringingCall) {
        const call = options.ringingCall;
        const outcome =
          validated.intent === 'acknowledge'
            ? await acknowledgeReminderAction(call.reminderId, userId, call.generation)
            : await snoozeReminderAction(
                call.reminderId,
                userId,
                validated.snoozeMinutes || 10,
                call.generation,
              );
        actionResult = {
          success: outcome.ok,
          intent: validated.intent,
          entityType: 'reminder',
          entityId: call.reminderId,
          reply: outcome.message,
          ...(outcome.ok ? {} : { error: outcome.message }),
        };
        finalReply = outcome.message;
      } else if (route === 'read_only') {
        actionResult = await executeNluAction(userId, validated, {
          referenceDate: refDate,
        });
        finalReply = actionResult.reply;
      } else if (route !== 'reviewed_mutation') {
        // Conversation. Online Mode always asks DeepSeek first, greetings
        // included; on-device replies are only the offline or fallback voice.
        const recent = readRecentHistory(userId, 10);
        const recentReplies = recent
          .filter((msg) => msg.sender === 'assistant')
          .map((msg) => msg.content);
        const smallTalk = classifySmallTalk(trimmed);
        if (options.onlineMode) {
          const history: OnlineChatMessage[] = recent
            // DeepSeek must not imitate on-device replies as if it wrote them.
            .filter((msg) => !(msg.sender === 'assistant' && isLocalReply(msg)))
            .map((msg) => ({
              role: msg.sender,
              content: msg.content,
            }));
          const onlineResult = await onlineChatSkill.sendChatMessage(history, {
            useHandbook: options.useHandbook,
          });
          if (onlineResult.status === 'success' && onlineResult.data) {
            finalReply = onlineResult.data.reply;
            handbookNote = handbookSourceLabel(onlineResult.data.sources);
            usedOnline = true;
          } else {
            console.warn('[ChatOrchestrator] Online AI chat failed:', onlineResult.status);
            localReply = true;
            if (
              options.useHandbook &&
              /\b(?:ustp|handbook|dean'?s\s+list|grading|policy|curriculum|tuition|retention)\b/i.test(
                trimmed,
              )
            ) {
              finalReply =
                "I couldn't verify that from the USTP Student Handbook right now. Please check your internet connection or refer directly to the USTP Student Affairs office.";
            } else if (smallTalk) {
              // Still friendly, but clearly not DeepSeek's words.
              finalReply = `${buildLocalConversationReply(userId, trimmed, {
                recentReplies,
              })}\n\n${OFFLINE_REPLY_NOTE}`;
            } else {
              finalReply = describeOnlineChatFailure(onlineResult.status);
            }
          }
        }

        if (!finalReply) {
          localReply = true;
          finalReply = isHandbookQuestion(trimmed)
            ? 'Official USTP Student Handbook guidelines require Online Mode. Switch to Online Mode in the chat header to look up verified handbook policies and academic regulations.'
            : buildLocalConversationReply(userId, trimmed, { recentReplies });
        }
      }
    }

    // Ensure "LAFINA" is not capitalized as an acronym so chat display and TTS pronounce "lafina" naturally
    finalReply = finalReply
      .replace(/\bL[.-]?A[.-]?F[.-]?I[.-]?N[.-]?A\b/gi, 'lafina')
      .replace(/\bLAFINA\b/g, 'lafina');

    // Step 6: Persist assistant message, keeping the Handbook citation with it
    const assistantMessage = chatStore.addMessage(userId, 'assistant', finalReply, attachment, {
      handbookNote,
      localReply,
    });

    // Step 7: Non-blocking react-native-tts speech synthesis if requested
    if (options.speakReply) {
      try {
        await ttsService.speak(finalReply);
      } catch (err) {
        console.warn('[ChatOrchestrator] TTS playback error:', err);
      }
    }

    return {
      userMessage,
      assistantMessage,
      intent: validated,
      actionResult,
      conflict: conflictResult,
      recommendedSlot,
      attachment,
      handbookNote,
      usedOnline,
      route,
      review,
      reply: finalReply,
    };
  }

  /**
   * Applies a reviewed proposal once and records the outcome in the owner's
   * transcript. A repeated Confirm returns the first receipt and adds nothing.
   */
  async confirmReview(
    userId: string,
    operationId: string,
    options: { speakReply?: boolean } = {},
  ): Promise<ReviewDecisionResult> {
    const outcome = confirmReviewedCommand(userId, operationId);
    let assistantMessage: ChatMessage | null = null;
    if (!(outcome.status === 'applied' && outcome.repeated)) {
      try {
        assistantMessage = chatStore.addMessage(userId, 'assistant', outcome.reply);
      } catch (error) {
        console.warn('[ChatOrchestrator] Could not save the review outcome to chat:', error);
      }
    }
    if (options.speakReply) {
      try {
        await ttsService.speak(outcome.reply);
      } catch (err) {
        console.warn('[ChatOrchestrator] TTS playback error:', err);
      }
    }
    return { outcome, assistantMessage, reply: outcome.reply };
  }

  /** Discards a proposal. Writes no planner data. */
  cancelReview(
    userId: string,
    operationId: string,
    options: { recordInChat?: boolean } = {},
  ): ReviewDecisionResult {
    const cancelled = cancelReviewedCommand(userId, operationId);
    const reply = cancelled
      ? 'Cancelled. Nothing was changed.'
      : 'There was nothing to cancel. Nothing was changed.';
    let assistantMessage: ChatMessage | null = null;
    if (cancelled && options.recordInChat !== false) {
      try {
        assistantMessage = chatStore.addMessage(userId, 'assistant', reply);
      } catch (error) {
        console.warn('[ChatOrchestrator] Could not save the cancellation to chat:', error);
      }
    }
    return { cancelled, assistantMessage, reply };
  }
}

export const chatOrchestrator = new ChatOrchestrator();
