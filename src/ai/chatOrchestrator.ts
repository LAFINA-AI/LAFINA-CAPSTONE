import { chatStore, type ChatMessage } from '../storage/chatStore';
import { timeBlocksStore } from '../storage/timeBlocksStore';
import { tasksStore } from '../storage/tasksStore';
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
}

export interface ChatOrchestratorResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  intent: ValidatedIntent;
  actionResult?: NluActionResult;
  conflict?: ScheduleConflict;
  recommendedSlot?: TimeSlot | null;
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
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return timeStr;
  let hour = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const minStr = min < 10 ? `0${min}` : `${min}`;
  return `${hour}:${minStr} ${meridiem}`;
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
   * 2. Extracts validated intent via IntentService (fast-path / on-device SLM).
   * 3. Performs conflict checks & adaptive slot recommendation for schedule items.
   * 4. Executes SQLite actions & native scheduler alarms.
   * 5. Persists assistant reply to chatStore.
   * 6. Reads aloud reply via react-native-tts if requested.
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

    // Step 2: Extract validated intent
    const validated = await intentService.extractIntent(trimmed, {
      referenceDate: refDate,
    });

    let finalReply = '';
    let actionResult: NluActionResult | undefined;
    let conflictResult: ScheduleConflict | undefined;
    let recommendedSlot: TimeSlot | null = null;

    // Step 3: Conflict-aware scheduling for time blocks
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

    // Step 4: Execute database mutation if no unresolved conflict
    if (!finalReply) {
      if (
        validated.intent === 'create_task' ||
        validated.intent === 'create_time_block' ||
        validated.intent === 'create_reminder' ||
        validated.intent === 'create_note' ||
        validated.intent === 'query_schedule' ||
        validated.intent === 'acknowledge' ||
        validated.intent === 'snooze' ||
        validated.intent === 'reschedule'
      ) {
        actionResult = await executeNluAction(userId, validated, {
          referenceDate: refDate,
        });
        finalReply = actionResult.reply;
      } else if (validated.intent === 'chat') {
        finalReply =
          "Hey! I'm LAFINA, your offline academic assistant. I can schedule study blocks, set exact reminder alarms, track assignments, take notes, or review what's on your schedule.";
      } else {
        finalReply =
          'I can help you manage your student schedule, study blocks, tasks, reminders, and notes. Try asking: "What\'s on my schedule today?" or "Add study block for Math tomorrow from 2pm to 4pm".';
      }
    }

    // Step 5: Persist assistant message
    const assistantMessage = chatStore.addMessage(userId, 'assistant', finalReply);

    // Step 6: Non-blocking react-native-tts speech synthesis if requested
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
      reply: finalReply,
    };
  }
}

export const chatOrchestrator = new ChatOrchestrator();
