import { chatStore, type ChatAttachment, type ChatMessage } from '../storage/chatStore';
import { timeBlocksStore } from '../storage/timeBlocksStore';
import { tasksStore } from '../storage/tasksStore';
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
import { formatLocalDate } from './nlu/fastPathParser';
import { ttsService } from './tts/ttsService';
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

function buildLocalChatFallback(trimmed: string, validated: ValidatedIntent): string {
  const queryLower = (validated.details || trimmed || '').toLowerCase();
  if (
    /\b(?:what|who)\s+(?:are|is)\s+(?:you|lafina)|tell\s+me\s+about\s+yourself|who\s+made\s+you|are\s+you\s+(?:an?\s+)?(?:ai|bot|assistant)|what(?:'s|\s+is)\s+your\s+name|who\s+are\s+u|what\s+are\s+u\b/i.test(
      queryLower,
    ) ||
    validated.details === 'Identity'
  ) {
    return 'I am lafina, your offline academic assistant. I help you manage your schedule, set reminder alarms, and organize tasks and notes.';
  }
  if (
    /\b(?:what\s+can\s+you\s+do|how\s+(?:do|can)\s+you\s+help|what\s+do\s+you\s+do|help(?:\s+me)?)\b/i.test(
      queryLower,
    )
  ) {
    return 'I am lafina, your offline academic assistant. You can ask me to schedule study blocks, set alarms, or add and view tasks.';
  }
  if (/\b(?:how\s+are\s+you|how's\s+it\s+going|how\s+are\s+things)\b/i.test(queryLower)) {
    return 'I am lafina, doing great! Ready to help you with your schedule, tasks, or notes.';
  }
  if (
    /^(?:hey|hi|hello|good\s+morning|good\s+afternoon|good\s+evening|sup|what'?s\s+up)\b/i.test(
      queryLower,
    )
  ) {
    return 'Hey! I am lafina, your offline academic assistant. How can I help with your schedule or tasks today?';
  }
  return 'I am lafina, your offline academic assistant. I can schedule study blocks, set exact reminder alarms, track assignments, take notes, or review what is on your schedule.';
}

export class ChatOrchestrator {
  /**
   * Conflict-aware check for time block and calendar event overlaps.
   */
  checkScheduleConflict(
    userId: string,
    date: string,
    startTime: string,
    endTime: string,
  ): ScheduleConflict {
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);

    if (endMins <= startMins) {
      return { hasConflict: false };
    }

    // 1. Check existing time blocks
    const blocks = timeBlocksStore.getAll(userId).filter((b) => b.date === date);
    for (const b of blocks) {
      const bStart = timeToMinutes(b.startTime);
      const bEnd = timeToMinutes(b.endTime);
      if (bEnd > bStart && Math.max(startMins, bStart) < Math.min(endMins, bEnd)) {
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
    const events = tasksStore.getAllEvents(userId).filter((e) => e.date === date);
    for (const e of events) {
      const eStart = timeToMinutes(e.startTime);
      const eEnd = timeToMinutes(e.endTime);
      if (eEnd > eStart && Math.max(startMins, eStart) < Math.min(endMins, eEnd)) {
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

    for (let current = dayStartMinutes; current + duration <= dayEndMinutes; current += step) {
      const candidateStart = minutesToTime(current);
      const candidateEnd = minutesToTime(current + duration);

      const conflict = this.checkScheduleConflict(
        userId,
        date,
        candidateStart,
        candidateEnd,
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
        const previousMessages: OnlineChatMessage[] = chatStore
          .getMessages(userId)
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

    // Step 5: Execute database mutation or conversational reply if no unresolved conflict
    if (!finalReply) {
      if (
        validated.intent === 'create_task' ||
        validated.intent === 'create_time_block' ||
        validated.intent === 'create_reminder' ||
        validated.intent === 'create_note' ||
        validated.intent === 'update_task' ||
        validated.intent === 'update_time_block' ||
        validated.intent === 'update_note' ||
        validated.intent === 'delete_task' ||
        validated.intent === 'delete_time_block' ||
        validated.intent === 'delete_note' ||
        validated.intent === 'query_schedule' ||
        validated.intent === 'acknowledge' ||
        validated.intent === 'snooze' ||
        validated.intent === 'reschedule'
      ) {
        actionResult = await executeNluAction(userId, validated, {
          referenceDate: refDate,
        });
        finalReply = actionResult.reply;
      } else {
        if (options.onlineMode) {
          const history: OnlineChatMessage[] = chatStore
            .getMessages(userId)
            .slice(-10)
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
            console.warn('[ChatOrchestrator] Online AI chat failed:', onlineResult.error);
          }
        }

        if (!finalReply) {
          finalReply =
            validated.intent === 'chat'
              ? buildLocalChatFallback(trimmed, validated)
              : 'I am lafina, your offline academic assistant. You can ask me to manage your schedule, set reminders, or organize tasks and notes.';
        }
      }
    }

    // Ensure "LAFINA" is not capitalized as an acronym so chat display and TTS pronounce "lafina" naturally
    finalReply = finalReply
      .replace(/\bL[.-]?A[.-]?F[.-]?I[.-]?N[.-]?A\b/gi, 'lafina')
      .replace(/\bLAFINA\b/g, 'lafina');

    // Step 6: Persist assistant message
    const assistantMessage = chatStore.addMessage(userId, 'assistant', finalReply, attachment);

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
      reply: finalReply,
    };
  }
}

export const chatOrchestrator = new ChatOrchestrator();
