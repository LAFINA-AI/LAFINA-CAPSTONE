import {
  tasksStore,
  timeBlocksStore,
  remindersStore,
  notesStore,
} from '../../storage';
import type {Task, Event, TimeBlock, Note, Reminder} from '../../storage';
import {
  scheduleReminderAlarm,
  cancelReminderAlarm,
  finishNativeIncomingCall,
  acknowledgeReminderAction,
  snoozeReminderAction,
} from '../../scheduler';
import {generateId} from '../../utils';
import {formatLocalDate} from './fastPathParser';
import {ttsService} from '../tts/ttsService';
import {computeAdaptiveTriggerAt} from '../ml';
import type {ValidatedIntent, NluActionResult} from './types';

export interface ActionExecutorOptions {
  activeReminderId?: string;
  referenceDate?: Date;
  speakResult?: boolean;
}

function format12HourTime(timeStr?: string | null): string {
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

function formatListWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function formatSpokenDayLabel(targetDateStr: string, refDate: Date): string {
  const todayFormatted = formatLocalDate(refDate);

  const tomorrow = new Date(refDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowFormatted = formatLocalDate(tomorrow);

  const yesterday = new Date(refDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayFormatted = formatLocalDate(yesterday);

  if (targetDateStr === todayFormatted) {
    return 'Today';
  }
  if (targetDateStr === tomorrowFormatted) {
    return 'Tomorrow';
  }
  if (targetDateStr === yesterdayFormatted) {
    return 'Yesterday';
  }

  const parts = targetDateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      const weekdays = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ];
      return `On ${weekdays[d.getDay()]}, ${
        months[d.getMonth()]
      } ${d.getDate()}`;
    }
  }

  return `For ${targetDateStr}`;
}

function normalizeForMatch(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(
      /\b(?:my|the|a|an|this|that|our|task|tasks|todo|todos|to\s*do|time\s*block|timeblock|timeblocks|study\s*block|study\s*blocks|focus\s*block|focus\s*blocks|work\s*block|work\s*blocks|block|blocks|note|notes|reminder|reminders|alarm|alarms|event|events|appointment|appointments|schedule|scheduled|plan|plans|item|items|for|about|to|on|at|in|from|of|with)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRawWords(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(?:my|the|a|an|our|for|about|to|on|at|in|from|of|with)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRecentReference(query: string | null | undefined): boolean {
  if (!query) return false;
  const cleaned = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(
      /\b(?:my|the|a|an|our|task|tasks|todo|todos|time\s*block|timeblock|study\s*block|focus\s*block|work\s*block|block|blocks|note|notes|reminder|reminders|alarm|alarms|event|events|appointment|appointments|schedule|item|one)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return /^(?:last|latest|recent|previous|that|this|it)$/i.test(cleaned);
}

function parseTimeMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(mins)) return null;
  return h * 60 + mins;
}

function scoreEntityMatch(
  candidateTitle: string,
  candidateDate: string | null | undefined,
  candidateTime: string | null | undefined,
  targetTitle: string | null | undefined,
  targetDate: string | null | undefined,
  targetTime: string | null | undefined,
  candidateEndTime?: string | null,
  targetEndTime?: string | null,
): number {
  const normCandidate = normalizeForMatch(candidateTitle);
  const normQuery = normalizeForMatch(targetTitle);
  const rawCandidate = normalizeRawWords(candidateTitle);
  const rawQuery = normalizeRawWords(targetTitle);

  let titleScore = 0;

  if (normQuery && normCandidate) {
    if (normCandidate === normQuery) {
      titleScore = 100;
    } else if (
      normCandidate.includes(normQuery) ||
      normQuery.includes(normCandidate)
    ) {
      titleScore = 85;
    } else {
      const queryWords = normQuery.split(' ').filter(Boolean);
      const candWords = normCandidate.split(' ').filter(Boolean);
      const candSet = new Set(candWords);
      if (queryWords.length > 0 && candWords.length > 0) {
        const matchedWords = queryWords.filter(w => candSet.has(w)).length;
        const queryRatio = matchedWords / queryWords.length;
        const candRatio = matchedWords / candWords.length;
        const bestRatio = Math.max(queryRatio, candRatio);
        if (matchedWords > 0 && bestRatio >= 0.5) {
          titleScore = Math.round(bestRatio * 70);
        }
      }
    }
  } else if (!normCandidate && rawQuery && rawCandidate) {
    // Fallback for items whose title consists only of generic words (e.g. "Schedule .")
    if (rawCandidate === rawQuery || rawCandidate.includes(rawQuery)) {
      titleScore = 80;
    }
  }

  // If the user explicitly named a non-empty target title and the candidate has a non-empty title,
  // do not allow a pure time match on an unrelated title.
  if (normQuery && normCandidate && titleScore === 0) {
    return 0;
  }

  let timeScore = 0;
  if (targetTime) {
    if (candidateTime && candidateTime === targetTime) {
      timeScore += normQuery ? 50 : 85;
    } else if (candidateTime && candidateEndTime) {
      const tMins = parseTimeMinutes(targetTime);
      const sMins = parseTimeMinutes(candidateTime);
      const eMins = parseTimeMinutes(candidateEndTime);
      if (
        tMins !== null &&
        sMins !== null &&
        eMins !== null &&
        eMins > sMins &&
        tMins >= sMins &&
        tMins < eMins
      ) {
        timeScore += normQuery ? 35 : 65;
      } else if (candidateTime) {
        timeScore -= 30;
      }
    } else if (candidateTime && candidateTime !== targetTime) {
      timeScore -= 30;
    }

    if (
      targetEndTime &&
      candidateEndTime &&
      targetEndTime === candidateEndTime
    ) {
      timeScore += 25;
    }
  }

  let dateScore = 0;
  if (targetDate) {
    if (candidateDate && candidateDate === targetDate) {
      dateScore += normQuery || targetTime ? 25 : 60;
    } else if (candidateDate && candidateDate !== targetDate) {
      dateScore -= 25;
    }
  }

  return Math.max(0, titleScore + timeScore + dateScore);
}

function findMatchingTask(
  tasks: Task[],
  targetTitle: string | null | undefined,
  targetDate: string | null | undefined,
  targetTime: string | null | undefined,
): {task: Task | null; score: number} {
  if (tasks.length === 0) return {task: null, score: 0};
  if (isRecentReference(targetTitle)) {
    const sorted = [...tasks].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || ''),
    );
    return {task: sorted[0], score: 70};
  }

  let bestTask: Task | null = null;
  let bestScore = 0;
  for (const t of tasks) {
    const score = scoreEntityMatch(
      t.title,
      t.dueDate,
      t.dueTime,
      targetTitle,
      targetDate,
      targetTime,
    );
    if (score > bestScore) {
      bestScore = score;
      bestTask = t;
    }
  }
  return {task: bestScore >= 30 ? bestTask : null, score: bestScore};
}

function findMatchingEvent(
  events: Event[],
  targetTitle: string | null | undefined,
  targetDate: string | null | undefined,
  targetTime: string | null | undefined,
  targetEndTime?: string | null,
): {event: Event | null; score: number} {
  if (events.length === 0) return {event: null, score: 0};
  if (isRecentReference(targetTitle)) {
    const sorted = [...events].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || ''),
    );
    return {event: sorted[0], score: 70};
  }

  let bestEvent: Event | null = null;
  let bestScore = 0;
  for (const e of events) {
    const score = scoreEntityMatch(
      e.title,
      e.date,
      e.startTime,
      targetTitle,
      targetDate,
      targetTime,
      e.endTime,
      targetEndTime,
    );
    if (score > bestScore) {
      bestScore = score;
      bestEvent = e;
    }
  }
  return {event: bestScore >= 30 ? bestEvent : null, score: bestScore};
}

function findMatchingTimeBlock(
  blocks: TimeBlock[],
  targetTitle: string | null | undefined,
  targetDate: string | null | undefined,
  targetTime: string | null | undefined,
  targetEndTime?: string | null,
): {block: TimeBlock | null; score: number} {
  if (blocks.length === 0) return {block: null, score: 0};
  if (isRecentReference(targetTitle)) {
    const sorted = [...blocks].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || ''),
    );
    return {block: sorted[0], score: 70};
  }

  let bestBlock: TimeBlock | null = null;
  let bestScore = 0;
  for (const b of blocks) {
    const score = scoreEntityMatch(
      b.title,
      b.date,
      b.startTime,
      targetTitle,
      targetDate,
      targetTime,
      b.endTime,
      targetEndTime,
    );
    if (score > bestScore) {
      bestScore = score;
      bestBlock = b;
    }
  }
  return {block: bestScore >= 30 ? bestBlock : null, score: bestScore};
}

async function cleanupMatchingReminders(
  userId: string,
  deletedTitle: string,
): Promise<void> {
  const normDeleted = normalizeForMatch(deletedTitle);
  const rawDeleted = normalizeRawWords(deletedTitle);
  const pending = remindersStore.getPendingReminders(userId);
  for (const r of pending) {
    const normRem = normalizeForMatch(r.task);
    const rawRem = normalizeRawWords(r.task);
    const isMatch =
      r.task.trim().toLowerCase() === deletedTitle.trim().toLowerCase() ||
      (normDeleted.length > 0 && normRem === normDeleted) ||
      (!normDeleted && rawDeleted.length > 0 && rawRem === rawDeleted);
    if (isMatch) {
      remindersStore.deleteReminder(r.id);
      try {
        await cancelReminderAlarm(r.id);
        await finishNativeIncomingCall(r.id);
      } catch (e) {
        console.warn('Failed to cancel alarm for deleted item reminder:', e);
      }
    }
  }
}

function findMatchingNote(
  notes: Note[],
  targetTitle: string | null | undefined,
): {note: Note | null; score: number} {
  if (notes.length === 0) return {note: null, score: 0};
  if (isRecentReference(targetTitle)) {
    const sorted = [...notes].sort((a, b) =>
      (b.updatedAt || '').localeCompare(a.updatedAt || ''),
    );
    return {note: sorted[0], score: 70};
  }

  let bestNote: Note | null = null;
  let bestScore = 0;
  for (const n of notes) {
    const titleScore = scoreEntityMatch(
      n.title,
      null,
      null,
      targetTitle,
      null,
      null,
    );
    const bodyScore =
      scoreEntityMatch(n.body, null, null, targetTitle, null, null) * 0.7;
    const score = Math.max(titleScore, bodyScore);
    if (score > bestScore) {
      bestScore = score;
      bestNote = n;
    }
  }
  return {note: bestScore >= 30 ? bestNote : null, score: bestScore};
}

function computeDurationMinutes(startTime: string, endTime: string): number {
  const sMatch = /^(\d{1,2}):(\d{2})$/.exec(startTime);
  const eMatch = /^(\d{1,2}):(\d{2})$/.exec(endTime);
  if (!sMatch || !eMatch) return 60;
  const sMin = parseInt(sMatch[1], 10) * 60 + parseInt(sMatch[2], 10);
  let eMin = parseInt(eMatch[1], 10) * 60 + parseInt(eMatch[2], 10);
  if (eMin <= sMin) eMin += 24 * 60;
  return eMin - sMin;
}

function addMinutesToTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(v => parseInt(v, 10));
  const totalMin = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

/** Executes validated NLU intents against local SQLite stores and native scheduler. */
export async function executeNluAction(
  userId: string,
  intent: ValidatedIntent,
  options: ActionExecutorOptions = {},
): Promise<NluActionResult> {
  if (!intent.isValid) {
    return {
      success: false,
      intent: intent.intent,
      reply: intent.validationError || 'Could not understand the request.',
      error: intent.validationError,
    };
  }

  const todayStr = formatLocalDate(options.referenceDate || new Date());

  switch (intent.intent) {
    case 'create_task': {
      const taskId = generateId();
      const taskTitle = intent.title || 'New Task';
      const dueDate = intent.date || todayStr;
      const dueTime = intent.time || null;

      tasksStore.insertTask({
        id: taskId,
        userId,
        title: taskTitle,
        dueDate,
        dueTime,
        isCompleted: false,
        priority: 'Medium',
        category: intent.category || 'Academic',
        notes: intent.details || null,
        recurrenceRule: null,
      });

      // If time was specified, also schedule an exact reminder
      let reminderMsg = '';
      if (dueTime) {
        const reminderId = generateId();
        const scheduledAt = `${dueDate}T${dueTime}:00`;
        const scheduledTimeMs = new Date(scheduledAt).getTime();
        const rawTriggerAt = isNaN(scheduledTimeMs)
          ? new Date().toISOString()
          : new Date(scheduledTimeMs).toISOString();
        const triggerAt = computeAdaptiveTriggerAt(
          userId,
          rawTriggerAt,
          (intent.priority ?? undefined) || undefined,
        );

        remindersStore.insertReminder({
          id: reminderId,
          userId,
          task: taskTitle,
          description: intent.details || null,
          scheduledAt: rawTriggerAt,
          triggerAt,
          status: 'pending',
          preCastAudioPath: null,
        });

        try {
          await scheduleReminderAlarm(reminderId, taskTitle, triggerAt);
        } catch (e) {
          console.warn('Failed to schedule native alarm for task reminder:', e);
        }
        reminderMsg = ` with a reminder at ${format12HourTime(dueTime)}`;
      }

      return {
        success: true,
        intent: 'create_task',
        entityType: 'task',
        entityId: taskId,
        reply: `Added task: "${taskTitle}" for ${dueDate}${reminderMsg}.`,
      };
    }

    case 'create_time_block': {
      const blockId = generateId();
      const blockTitle = intent.title || 'Study Session';
      const blockDate = intent.date || todayStr;
      const startTime = intent.time || '09:00';

      // Compute endTime from duration if not present
      let endTime = intent.endTime;
      if (!endTime) {
        const dur = intent.durationMinutes || 60;
        endTime = addMinutesToTime(startTime, dur);
      }

      timeBlocksStore.insert({
        id: blockId,
        userId,
        title: blockTitle,
        date: blockDate,
        startTime,
        endTime,
        color: '#3498DB',
        category: intent.category || 'Academic',
        notes: intent.details || undefined,
        recurrenceRule: null,
      });

      return {
        success: true,
        intent: 'create_time_block',
        entityType: 'time_block',
        entityId: blockId,
        reply: `Scheduled time block: "${blockTitle}" on ${blockDate} from ${format12HourTime(
          startTime,
        )} to ${format12HourTime(endTime)}.`,
      };
    }

    case 'create_reminder': {
      const reminderId = generateId();
      const reminderTitle = intent.title || 'Reminder';
      const remDate = intent.date || todayStr;
      const remTime = intent.time || '09:00';
      const scheduledAt = `${remDate}T${remTime}:00`;
      const scheduledTimeMs = new Date(scheduledAt).getTime();
      const rawTriggerAt = isNaN(scheduledTimeMs)
        ? new Date(Date.now() + 60000).toISOString()
        : new Date(scheduledTimeMs).toISOString();
      const triggerAt = computeAdaptiveTriggerAt(
        userId,
        rawTriggerAt,
        intent.priority || 'High',
      );

      const recurrenceTag = intent.recurrenceRule
        ? `[RRULE:${intent.recurrenceRule}] `
        : '';
      const reminderDesc =
        `${recurrenceTag}${intent.details || ''}`.trim() || null;

      remindersStore.insertReminder({
        id: reminderId,
        userId,
        task: reminderTitle,
        description: reminderDesc,
        scheduledAt: rawTriggerAt,
        triggerAt,
        status: 'pending',
        preCastAudioPath: null,
      });

      // Also create corresponding task so it surfaces in task lists
      const taskId = generateId();
      tasksStore.insertTask({
        id: taskId,
        userId,
        title: reminderTitle,
        dueDate: remDate,
        dueTime: remTime,
        isCompleted: false,
        priority: 'High',
        category: intent.category || 'Academic',
        notes: intent.details || null,
        recurrenceRule: intent.recurrenceRule || null,
      });

      try {
        await scheduleReminderAlarm(reminderId, reminderTitle, triggerAt);
      } catch (e) {
        console.warn('Failed to schedule exact native alarm:', e);
      }

      let recurrenceNote = '';
      if (intent.recurrenceRule) {
        if (/BYDAY=MO/i.test(intent.recurrenceRule))
          recurrenceNote = ', repeating every Monday';
        else if (/BYDAY=TU/i.test(intent.recurrenceRule))
          recurrenceNote = ', repeating every Tuesday';
        else if (/BYDAY=WE/i.test(intent.recurrenceRule))
          recurrenceNote = ', repeating every Wednesday';
        else if (/BYDAY=TH/i.test(intent.recurrenceRule))
          recurrenceNote = ', repeating every Thursday';
        else if (/BYDAY=FR/i.test(intent.recurrenceRule))
          recurrenceNote = ', repeating every Friday';
        else if (/BYDAY=SA/i.test(intent.recurrenceRule))
          recurrenceNote = ', repeating every Saturday';
        else if (/BYDAY=SU/i.test(intent.recurrenceRule))
          recurrenceNote = ', repeating every Sunday';
        else if (/FREQ=DAILY/i.test(intent.recurrenceRule))
          recurrenceNote = ', repeating daily';
        else if (/FREQ=WEEKLY/i.test(intent.recurrenceRule))
          recurrenceNote = ', repeating weekly';
        else if (/FREQ=MONTHLY/i.test(intent.recurrenceRule))
          recurrenceNote = ', repeating monthly';
        else recurrenceNote = ', repeating';
      }

      return {
        success: true,
        intent: 'create_reminder',
        entityType: 'reminder',
        entityId: reminderId,
        reply: `Reminder set: "${reminderTitle}" on ${remDate} at ${format12HourTime(
          remTime,
        )}${recurrenceNote}.`,
      };
    }

    case 'create_note': {
      const noteId = generateId();
      const noteTitle = intent.title || 'Voice Note';
      const noteBody = intent.details || intent.title || '';

      notesStore.insert({
        id: noteId,
        userId,
        title: noteTitle,
        body: noteBody,
        isPinned: false,
        tags: [intent.category || 'Academic'],
        category: intent.category || 'Academic',
        isVoiceTranscribed: true,
        imageUri: null,
        sortOrder: 0,
      });

      return {
        success: true,
        intent: 'create_note',
        entityType: 'note',
        entityId: noteId,
        reply: `Saved note: "${noteTitle}".`,
      };
    }

    case 'delete_time_block': {
      const targetTitle = intent.targetTitle || intent.title;
      const targetTime = intent.targetTime || intent.time;
      const allBlocks = timeBlocksStore.getAll(userId);
      const allEvents = tasksStore.getAllEvents(userId);
      const allTasks = tasksStore.getAllTasks(userId);

      const blockMatch = findMatchingTimeBlock(
        allBlocks,
        targetTitle,
        intent.date,
        targetTime,
        intent.endTime,
      );
      const eventMatch = findMatchingEvent(
        allEvents,
        targetTitle,
        intent.date,
        targetTime,
        intent.endTime,
      );

      // If the user specifically said "event" and an event matches at least as well as a time block
      if (
        eventMatch.event &&
        (intent.targetEntityType === 'event'
          ? eventMatch.score >= blockMatch.score
          : eventMatch.score > blockMatch.score)
      ) {
        tasksStore.deleteEvent(eventMatch.event.id);
        await cleanupMatchingReminders(userId, eventMatch.event.title);
        return {
          success: true,
          intent: 'delete_time_block',
          entityType: 'event',
          entityId: eventMatch.event.id,
          reply: `Removed event: "${eventMatch.event.title}".`,
        };
      }

      if (blockMatch.block) {
        timeBlocksStore.delete(blockMatch.block.id);
        await cleanupMatchingReminders(userId, blockMatch.block.title);
        return {
          success: true,
          intent: 'delete_time_block',
          entityType: 'time_block',
          entityId: blockMatch.block.id,
          reply: `Removed time block: "${blockMatch.block.title}".`,
        };
      }

      // Cross-entity fallback: if user called a task an "event" or "time block", still delete the matching task
      const taskMatch = findMatchingTask(
        allTasks,
        targetTitle,
        intent.date,
        targetTime,
      );
      if (taskMatch.task) {
        tasksStore.deleteTask(taskMatch.task.id);
        await cleanupMatchingReminders(userId, taskMatch.task.title);
        return {
          success: true,
          intent: 'delete_task',
          entityType: 'task',
          entityId: taskMatch.task.id,
          reply: `Removed task: "${taskMatch.task.title}".`,
        };
      }

      const label =
        intent.targetEntityType === 'event' ? 'event' : 'time block';
      return {
        success: false,
        intent: 'delete_time_block',
        entityType:
          intent.targetEntityType === 'event' ? 'event' : 'time_block',
        reply: `Could not find a ${label} matching "${
          targetTitle || format12HourTime(targetTime) || 'that request'
        }".`,
        error: 'Time block not found.',
      };
    }

    case 'delete_note': {
      const targetTitle = intent.targetTitle || intent.title;
      const allNotes = notesStore.getAll(userId);
      const {note} = findMatchingNote(allNotes, targetTitle);

      if (!note) {
        return {
          success: false,
          intent: 'delete_note',
          entityType: 'note',
          reply: `Could not find a note matching "${
            targetTitle || 'that request'
          }".`,
          error: 'Note not found.',
        };
      }

      notesStore.delete(note.id);
      return {
        success: true,
        intent: 'delete_note',
        entityType: 'note',
        entityId: note.id,
        reply: `Deleted note: "${note.title}".`,
      };
    }

    case 'delete_task': {
      const targetTitle = intent.targetTitle || intent.title;
      const targetTime = intent.targetTime || intent.time;
      const allTasks = tasksStore.getAllTasks(userId);
      const allEvents = tasksStore.getAllEvents(userId);
      const allBlocks = timeBlocksStore.getAll(userId);

      const taskMatch = findMatchingTask(
        allTasks,
        targetTitle,
        intent.date,
        targetTime,
      );
      const eventMatch = findMatchingEvent(
        allEvents,
        targetTitle,
        intent.date,
        targetTime,
        intent.endTime,
      );
      const blockMatch = findMatchingTimeBlock(
        allBlocks,
        targetTitle,
        intent.date,
        targetTime,
        intent.endTime,
      );

      // If user specifically targeted a reminder, prioritize matching pending reminders
      if (intent.targetEntityType === 'reminder') {
        const allReminders = remindersStore.getPendingReminders(userId);
        const normQuery = normalizeForMatch(targetTitle);
        const matchedReminder = allReminders.find(r => {
          if (normQuery && normalizeForMatch(r.task).includes(normQuery)) {
            return true;
          }
          if (targetTime) {
            const remDate = new Date(r.scheduledAt || r.triggerAt);
            if (!isNaN(remDate.getTime())) {
              const remTimeStr = `${String(remDate.getHours()).padStart(
                2,
                '0',
              )}:${String(remDate.getMinutes()).padStart(2, '0')}`;
              if (remTimeStr === targetTime) return true;
            }
          }
          return false;
        });

        if (matchedReminder) {
          remindersStore.deleteReminder(matchedReminder.id);
          try {
            await cancelReminderAlarm(matchedReminder.id);
          } catch (e) {
            console.warn('Failed to cancel alarm for deleted reminder:', e);
          }
          const matchingTask = allTasks.find(t => {
            if (normQuery && normalizeForMatch(t.title).includes(normQuery))
              return true;
            if (
              normalizeForMatch(t.title) ===
              normalizeForMatch(matchedReminder.task)
            )
              return true;
            if (targetTime && t.dueTime === targetTime) return true;
            return false;
          });
          if (matchingTask) {
            tasksStore.deleteTask(matchingTask.id);
          }
          return {
            success: true,
            intent: 'delete_task',
            entityType: 'reminder',
            entityId: matchedReminder.id,
            reply: `Cancelled reminder: "${matchedReminder.task}".`,
          };
        }
      }

      // If targetEntityType is 'any' (user said e.g. "Cancel my Coffee Date" or "Cancel at 2pm"),
      // pick the highest-scoring entity across tasks, events, and time blocks
      if (intent.targetEntityType === 'any') {
        if (
          blockMatch.block &&
          blockMatch.score > taskMatch.score &&
          blockMatch.score >= eventMatch.score
        ) {
          timeBlocksStore.delete(blockMatch.block.id);
          await cleanupMatchingReminders(userId, blockMatch.block.title);
          return {
            success: true,
            intent: 'delete_time_block',
            entityType: 'time_block',
            entityId: blockMatch.block.id,
            reply: `Removed time block: "${blockMatch.block.title}".`,
          };
        }

        if (
          eventMatch.event &&
          eventMatch.score > taskMatch.score &&
          eventMatch.score > blockMatch.score
        ) {
          tasksStore.deleteEvent(eventMatch.event.id);
          await cleanupMatchingReminders(userId, eventMatch.event.title);
          return {
            success: true,
            intent: 'delete_time_block',
            entityType: 'event',
            entityId: eventMatch.event.id,
            reply: `Removed event: "${eventMatch.event.title}".`,
          };
        }
      }

      if (taskMatch.task) {
        tasksStore.deleteTask(taskMatch.task.id);
        await cleanupMatchingReminders(userId, taskMatch.task.title);
        return {
          success: true,
          intent: 'delete_task',
          entityType: 'task',
          entityId: taskMatch.task.id,
          reply: `Removed task: "${taskMatch.task.title}".`,
        };
      }

      // Cross-entity fallback when user said "task" but the item was stored as an event or time block
      if (eventMatch.event && eventMatch.score >= blockMatch.score) {
        tasksStore.deleteEvent(eventMatch.event.id);
        await cleanupMatchingReminders(userId, eventMatch.event.title);
        return {
          success: true,
          intent: 'delete_time_block',
          entityType: 'event',
          entityId: eventMatch.event.id,
          reply: `Removed event: "${eventMatch.event.title}".`,
        };
      }

      if (blockMatch.block) {
        timeBlocksStore.delete(blockMatch.block.id);
        await cleanupMatchingReminders(userId, blockMatch.block.title);
        return {
          success: true,
          intent: 'delete_time_block',
          entityType: 'time_block',
          entityId: blockMatch.block.id,
          reply: `Removed time block: "${blockMatch.block.title}".`,
        };
      }

      // Check standalone reminders by title or time if no task/event/block row matched
      const allReminders = remindersStore.getPendingReminders(userId);
      const normQuery = normalizeForMatch(targetTitle);
      const matchedReminder = allReminders.find(r => {
        if (normQuery && normalizeForMatch(r.task).includes(normQuery)) {
          return true;
        }
        if (targetTime) {
          const remDate = new Date(r.scheduledAt || r.triggerAt);
          if (!isNaN(remDate.getTime())) {
            const remTimeStr = `${String(remDate.getHours()).padStart(
              2,
              '0',
            )}:${String(remDate.getMinutes()).padStart(2, '0')}`;
            if (remTimeStr === targetTime) return true;
          }
        }
        return false;
      });
      if (matchedReminder) {
        remindersStore.deleteReminder(matchedReminder.id);
        try {
          await cancelReminderAlarm(matchedReminder.id);
        } catch (e) {
          console.warn('Failed to cancel alarm for deleted reminder:', e);
        }
        return {
          success: true,
          intent: 'delete_task',
          entityType: 'reminder',
          entityId: matchedReminder.id,
          reply: `Cancelled reminder: "${matchedReminder.task}".`,
        };
      }

      if (intent.targetEntityType === 'any') {
        const allNotes = notesStore.getAll(userId);
        const noteMatch = findMatchingNote(allNotes, targetTitle);
        if (noteMatch.note) {
          notesStore.delete(noteMatch.note.id);
          return {
            success: true,
            intent: 'delete_note',
            entityType: 'note',
            entityId: noteMatch.note.id,
            reply: `Deleted note: "${noteMatch.note.title}".`,
          };
        }
      }

      return {
        success: false,
        intent: 'delete_task',
        entityType: 'task',
        reply: `Could not find a scheduled item matching "${
          targetTitle || format12HourTime(targetTime) || 'that request'
        }".`,
        error: 'Task not found.',
      };
    }

    case 'update_time_block': {
      const targetTitle = intent.targetTitle || intent.title;
      const allBlocks = timeBlocksStore.getAll(userId);
      const allEvents = tasksStore.getAllEvents(userId);
      const blockMatch = findMatchingTimeBlock(
        allBlocks,
        targetTitle,
        null,
        intent.targetTime,
      );
      const eventMatch = findMatchingEvent(
        allEvents,
        targetTitle,
        null,
        intent.targetTime,
      );

      if (
        eventMatch.event &&
        (intent.targetEntityType === 'event'
          ? eventMatch.score >= blockMatch.score
          : eventMatch.score > blockMatch.score)
      ) {
        const ev = eventMatch.event;
        const updatedTitle = intent.newTitle || ev.title;
        const updatedDate = intent.date || ev.date;
        const updatedStart = intent.time || ev.startTime;
        let updatedEnd = intent.endTime || ev.endTime;
        if (!intent.endTime) {
          if (intent.durationMinutes) {
            updatedEnd = addMinutesToTime(updatedStart, intent.durationMinutes);
          } else if (intent.time) {
            const origDur = computeDurationMinutes(ev.startTime, ev.endTime);
            updatedEnd = addMinutesToTime(updatedStart, origDur);
          }
        }
        tasksStore.updateEvent({
          id: ev.id,
          title: updatedTitle,
          date: updatedDate,
          startTime: updatedStart,
          endTime: updatedEnd,
        });
        return {
          success: true,
          intent: 'update_time_block',
          entityType: 'event',
          entityId: ev.id,
          reply: `Updated event: "${updatedTitle}" on ${updatedDate} from ${format12HourTime(
            updatedStart,
          )} to ${format12HourTime(updatedEnd)}.`,
        };
      }

      const block = blockMatch.block;
      if (!block) {
        return {
          success: false,
          intent: 'update_time_block',
          entityType: 'time_block',
          reply: `Could not find a time block matching "${
            targetTitle || format12HourTime(intent.targetTime) || 'that request'
          }".`,
          error: 'Time block not found.',
        };
      }

      const updatedTitle = intent.newTitle || block.title;
      const updatedDate = intent.date || block.date;
      const updatedStart = intent.time || block.startTime;
      let updatedEnd = intent.endTime || block.endTime;

      if (!intent.endTime) {
        if (intent.durationMinutes) {
          updatedEnd = addMinutesToTime(updatedStart, intent.durationMinutes);
        } else if (intent.time) {
          const origDur = computeDurationMinutes(
            block.startTime,
            block.endTime,
          );
          updatedEnd = addMinutesToTime(updatedStart, origDur);
        }
      }

      timeBlocksStore.update({
        id: block.id,
        title: updatedTitle,
        date: updatedDate,
        startTime: updatedStart,
        endTime: updatedEnd,
      });

      return {
        success: true,
        intent: 'update_time_block',
        entityType: 'time_block',
        entityId: block.id,
        reply: `Updated time block: "${updatedTitle}" on ${updatedDate} from ${format12HourTime(
          updatedStart,
        )} to ${format12HourTime(updatedEnd)}.`,
      };
    }

    case 'update_note': {
      const targetTitle = intent.targetTitle || intent.title;
      const allNotes = notesStore.getAll(userId);
      const {note} = findMatchingNote(allNotes, targetTitle);

      if (!note) {
        return {
          success: false,
          intent: 'update_note',
          entityType: 'note',
          reply: `Could not find a note matching "${
            targetTitle || 'that request'
          }".`,
          error: 'Note not found.',
        };
      }

      const updatedTitle = intent.newTitle || note.title;
      const isAppend = intent.category === 'APPEND';
      const updatedBody = intent.details
        ? isAppend && note.body
          ? `${note.body}\n${intent.details}`
          : intent.details
        : note.body;

      notesStore.update({
        id: note.id,
        title: updatedTitle,
        body: updatedBody,
      });

      return {
        success: true,
        intent: 'update_note',
        entityType: 'note',
        entityId: note.id,
        reply: `Updated note: "${updatedTitle}".`,
      };
    }

    case 'update_task': {
      const targetTitle = intent.targetTitle || intent.title;
      const allTasks = tasksStore.getAllTasks(userId);
      const taskMatch = findMatchingTask(
        allTasks,
        targetTitle,
        null,
        intent.targetTime,
      );

      // If targetEntityType === 'any' (e.g. "Move Coffee Break to 3pm"), check if an event or time block is a better match
      if (intent.targetEntityType === 'any' && !intent.isCompleted) {
        const allEvents = tasksStore.getAllEvents(userId);
        const eventMatch = findMatchingEvent(
          allEvents,
          targetTitle,
          null,
          intent.targetTime,
        );
        const allBlocks = timeBlocksStore.getAll(userId);
        const blockMatch = findMatchingTimeBlock(
          allBlocks,
          targetTitle,
          null,
          intent.targetTime,
        );

        if (
          eventMatch.event &&
          eventMatch.score > taskMatch.score &&
          eventMatch.score >= blockMatch.score
        ) {
          const ev = eventMatch.event;
          const updatedTitle = intent.newTitle || ev.title;
          const updatedDate = intent.date || ev.date;
          const updatedStart = intent.time || ev.startTime;
          let updatedEnd = intent.endTime || ev.endTime;
          if (!intent.endTime) {
            if (intent.durationMinutes) {
              updatedEnd = addMinutesToTime(
                updatedStart,
                intent.durationMinutes,
              );
            } else if (intent.time) {
              const origDur = computeDurationMinutes(ev.startTime, ev.endTime);
              updatedEnd = addMinutesToTime(updatedStart, origDur);
            }
          }
          tasksStore.updateEvent({
            id: ev.id,
            title: updatedTitle,
            date: updatedDate,
            startTime: updatedStart,
            endTime: updatedEnd,
          });
          return {
            success: true,
            intent: 'update_time_block',
            entityType: 'event',
            entityId: ev.id,
            reply: `Updated event: "${updatedTitle}" on ${updatedDate} from ${format12HourTime(
              updatedStart,
            )} to ${format12HourTime(updatedEnd)}.`,
          };
        }

        if (blockMatch.block && blockMatch.score > taskMatch.score) {
          const b = blockMatch.block;
          const updatedTitle = intent.newTitle || b.title;
          const updatedDate = intent.date || b.date;
          const updatedStart = intent.time || b.startTime;
          let updatedEnd = intent.endTime || b.endTime;
          if (!intent.endTime) {
            if (intent.durationMinutes) {
              updatedEnd = addMinutesToTime(
                updatedStart,
                intent.durationMinutes,
              );
            } else if (intent.time) {
              const origDur = computeDurationMinutes(b.startTime, b.endTime);
              updatedEnd = addMinutesToTime(updatedStart, origDur);
            }
          }
          timeBlocksStore.update({
            id: b.id,
            title: updatedTitle,
            date: updatedDate,
            startTime: updatedStart,
            endTime: updatedEnd,
          });
          return {
            success: true,
            intent: 'update_time_block',
            entityType: 'time_block',
            entityId: b.id,
            reply: `Updated time block: "${updatedTitle}" on ${updatedDate} from ${format12HourTime(
              updatedStart,
            )} to ${format12HourTime(updatedEnd)}.`,
          };
        }
      }

      if (!taskMatch.task) {
        return {
          success: false,
          intent: 'update_task',
          entityType: 'task',
          reply: `Could not find a task matching "${
            targetTitle || format12HourTime(intent.targetTime) || 'that request'
          }".`,
          error: 'Task not found.',
        };
      }

      const task = taskMatch.task;
      if (intent.isCompleted === true) {
        tasksStore.updateTask({
          id: task.id,
          isCompleted: true,
        });
        await cleanupMatchingReminders(userId, task.title);
        return {
          success: true,
          intent: 'update_task',
          entityType: 'task',
          entityId: task.id,
          reply: `Marked task "${task.title}" as completed. All reminder alarms for it have been cancelled.`,
        };
      }

      const updatedTitle = intent.newTitle || task.title;
      const updatedDate = intent.date || task.dueDate || todayStr;
      const updatedTime = intent.time !== null ? intent.time : task.dueTime;

      tasksStore.updateTask({
        id: task.id,
        title: updatedTitle,
        dueDate: updatedDate,
        dueTime: updatedTime,
      });

      // Also update or create a reminder if dueTime is present
      if (updatedTime) {
        const pendingReminders = remindersStore.getPendingReminders(userId);
        const linkedRem = pendingReminders.find(
          r => normalizeForMatch(r.task) === normalizeForMatch(task.title),
        );
        const scheduledAt = `${updatedDate}T${updatedTime}:00`;
        const scheduledMs = new Date(scheduledAt).getTime();
        if (
          linkedRem &&
          Number.isFinite(scheduledMs) &&
          scheduledMs > Date.now()
        ) {
          const triggerAt = new Date(scheduledMs).toISOString();
          try {
            remindersStore.updateReminderTriggerAt(linkedRem.id, triggerAt);
            await scheduleReminderAlarm(linkedRem.id, updatedTitle, triggerAt);
          } catch (e) {
            console.warn('Failed to update task reminder alarm:', e);
          }
        }
      }

      const timeSuffix = updatedTime
        ? ` at ${format12HourTime(updatedTime)}`
        : '';
      return {
        success: true,
        intent: 'update_task',
        entityType: 'task',
        entityId: task.id,
        reply: `Updated task: "${updatedTitle}" for ${updatedDate}${timeSuffix}.`,
      };
    }

    case 'acknowledge': {
      if (options.activeReminderId) {
        try {
          await acknowledgeReminderAction(options.activeReminderId, userId);
        } catch (e) {
          console.warn('Failed to acknowledge active reminder:', e);
        }
        return {
          success: true,
          intent: 'acknowledge',
          reply: 'Great job! Acknowledged.',
        };
      }

      const targetQuery = intent.targetTitle || intent.title;
      const pendingReminders = remindersStore.getPendingReminders(userId);

      // 1. If target title was specified by user
      if (targetQuery) {
        const normTarget = normalizeForMatch(targetQuery);
        const matchingRem = pendingReminders.find(
          r =>
            r.task.trim().toLowerCase() === targetQuery.trim().toLowerCase() ||
            (normTarget && normalizeForMatch(r.task).includes(normTarget)),
        );

        if (matchingRem) {
          await acknowledgeReminderAction(matchingRem.id, userId);
          const allTasks = tasksStore.getAllTasks(userId);
          const taskMatch = findMatchingTask(allTasks, targetQuery, null, null);
          if (taskMatch.task && intent.targetEntityType === 'task') {
            tasksStore.updateTask({id: taskMatch.task.id, isCompleted: true});
          }
          return {
            success: true,
            intent: 'acknowledge',
            entityType: 'reminder',
            entityId: matchingRem.id,
            reply: `Acknowledged "${matchingRem.task}". Reminder alarms have been cancelled and no additional call reminders will be triggered.`,
          };
        }

        // Direct task match
        const allTasks = tasksStore.getAllTasks(userId);
        const taskMatch = findMatchingTask(allTasks, targetQuery, null, null);
        if (taskMatch.task) {
          tasksStore.updateTask({id: taskMatch.task.id, isCompleted: true});
          await cleanupMatchingReminders(userId, taskMatch.task.title);
          return {
            success: true,
            intent: 'acknowledge',
            entityType: 'task',
            entityId: taskMatch.task.id,
            reply: `Acknowledged task "${taskMatch.task.title}". It has been marked completed and its call reminders are cancelled.`,
          };
        }

        // Direct event match
        const allEvents = tasksStore.getAllEvents(userId);
        const eventMatch = findMatchingEvent(
          allEvents,
          targetQuery,
          null,
          null,
        );
        if (eventMatch.event) {
          await cleanupMatchingReminders(userId, eventMatch.event.title);
          return {
            success: true,
            intent: 'acknowledge',
            entityType: 'event',
            entityId: eventMatch.event.id,
            reply: `Acknowledged event "${eventMatch.event.title}". Its call reminders have been cancelled.`,
          };
        }
      }

      // 2. If no target title, acknowledge the most relevant pending reminder
      if (pendingReminders.length > 0) {
        let chosenRem: Reminder | null = null;
        if (intent.targetEntityType === 'event') {
          const allEvents = tasksStore.getAllEvents(userId);
          chosenRem =
            pendingReminders.find(r =>
              allEvents.some(
                e =>
                  e.title.trim().toLowerCase() === r.task.trim().toLowerCase(),
              ),
            ) || pendingReminders[0];
        } else if (intent.targetEntityType === 'task') {
          const allTasks = tasksStore.getAllTasks(userId);
          chosenRem =
            pendingReminders.find(r =>
              allTasks.some(
                t =>
                  t.title.trim().toLowerCase() === r.task.trim().toLowerCase(),
              ),
            ) || pendingReminders[0];
        } else {
          chosenRem = pendingReminders[0];
        }

        if (chosenRem) {
          await acknowledgeReminderAction(chosenRem.id, userId);
          return {
            success: true,
            intent: 'acknowledge',
            entityType: 'reminder',
            entityId: chosenRem.id,
            reply: `Acknowledged "${chosenRem.task}". Reminder alarms have been cancelled and no additional call reminders will be triggered.`,
          };
        }
      }

      return {
        success: true,
        intent: 'acknowledge',
        reply:
          'All reminders and tasks are already acknowledged. No additional call reminders will be triggered.',
      };
    }

    case 'snooze': {
      const minutes = intent.snoozeMinutes || 10;
      if (options.activeReminderId) {
        try {
          await snoozeReminderAction(options.activeReminderId, userId, minutes);
        } catch (e) {
          console.warn('Failed to snooze active reminder:', e);
        }
      }
      return {
        success: true,
        intent: 'snooze',
        reply: `Snoozed for ${minutes} minutes.`,
      };
    }

    case 'reschedule': {
      const newTime = intent.time || '10:00';
      const newDate = intent.date || todayStr;

      if (options.activeReminderId) {
        const scheduledAt = `${newDate}T${newTime}:00`;
        const scheduledMs = new Date(scheduledAt).getTime();
        const triggerAt = isNaN(scheduledMs)
          ? new Date(Date.now() + 60000).toISOString()
          : new Date(scheduledMs).toISOString();

        try {
          remindersStore.updateReminderTriggerAt(
            options.activeReminderId,
            triggerAt,
          );
          const activeRem = remindersStore.getReminderById(
            options.activeReminderId,
          );
          if (activeRem) {
            await scheduleReminderAlarm(
              activeRem.id,
              activeRem.task,
              triggerAt,
            );
          }
        } catch (e) {
          console.warn('Failed to reschedule native alarm:', e);
        }
      }

      return {
        success: true,
        intent: 'reschedule',
        reply: `Rescheduled to ${newDate} at ${format12HourTime(newTime)}.`,
      };
    }

    case 'query_schedule': {
      const refDate = options.referenceDate || new Date();

      if (
        intent.dateRange === 'this_week' ||
        intent.dateRange === 'next_week'
      ) {
        const isNextWeek = intent.dateRange === 'next_week';
        const dayOfWeek = refDate.getDay(); // 0 = Sunday, 1 = Monday, ...
        const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(refDate);
        weekStart.setDate(refDate.getDate() + diffToMon + (isNextWeek ? 7 : 0));
        weekStart.setHours(0, 0, 0, 0);

        const weekDates: string[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekStart);
          d.setDate(weekStart.getDate() + i);
          weekDates.push(formatLocalDate(d));
        }
        const weekDateSet = new Set(weekDates);

        const allTasks = tasksStore
          .getAllTasks(userId)
          .filter(
            t => !t.isCompleted && t.dueDate && weekDateSet.has(t.dueDate),
          );
        const allBlocks = timeBlocksStore
          .getAll(userId)
          .filter(b => weekDateSet.has(b.date));
        const allEvents = tasksStore
          .getAllEvents(userId)
          .filter(e => weekDateSet.has(e.date));

        const totalCount =
          allTasks.length + allBlocks.length + allEvents.length;
        const rangeLabel = isNextWeek ? 'Next week' : 'This week';

        if (totalCount === 0) {
          return {
            success: true,
            intent: 'query_schedule',
            reply: `${rangeLabel}, your schedule is completely clear! You have no tasks, events, or time blocks.`,
          };
        }

        const dayNames = [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ];
        const daySummaries: string[] = [];

        for (let i = 0; i < 7; i++) {
          const dateStr = weekDates[i];
          const dayName = dayNames[i];
          const dayTasks = allTasks.filter(t => t.dueDate === dateStr);
          const dayBlocks = allBlocks.filter(b => b.date === dateStr);
          const dayEvents = allEvents.filter(e => e.date === dateStr);

          const dayItems: string[] = [];
          for (const b of dayBlocks) {
            const timeDesc =
              b.endTime && b.endTime !== b.startTime
                ? `from ${format12HourTime(b.startTime)} to ${format12HourTime(
                    b.endTime,
                  )}`
                : `at ${format12HourTime(b.startTime)}`;
            dayItems.push(`${b.title} ${timeDesc}`);
          }
          for (const e of dayEvents) {
            const timeDesc =
              e.endTime && e.endTime !== e.startTime
                ? `from ${format12HourTime(e.startTime)} to ${format12HourTime(
                    e.endTime,
                  )}`
                : `at ${format12HourTime(e.startTime)}`;
            dayItems.push(`${e.title} ${timeDesc}`);
          }
          for (const t of dayTasks) {
            if (t.dueTime) {
              dayItems.push(`${t.title} at ${format12HourTime(t.dueTime)}`);
            } else {
              dayItems.push(t.title);
            }
          }

          if (dayItems.length > 0) {
            if (dayItems.length <= 3) {
              daySummaries.push(
                `On ${dayName}: ${formatListWithAnd(dayItems)}.`,
              );
            } else {
              const shown = dayItems.slice(0, 3);
              const remaining = dayItems.length - 3;
              daySummaries.push(
                `On ${dayName}: ${shown.join(
                  ', ',
                )}, and ${remaining} more item${remaining > 1 ? 's' : ''}.`,
              );
            }
          }
        }

        const countParts: string[] = [];
        if (allTasks.length > 0)
          countParts.push(
            `${allTasks.length} task${allTasks.length > 1 ? 's' : ''}`,
          );
        if (allBlocks.length > 0)
          countParts.push(
            `${allBlocks.length} time block${allBlocks.length > 1 ? 's' : ''}`,
          );
        if (allEvents.length > 0)
          countParts.push(
            `${allEvents.length} event${allEvents.length > 1 ? 's' : ''}`,
          );

        const summary = `${rangeLabel} you have ${formatListWithAnd(
          countParts,
        )} scheduled: ${daySummaries.join(' ')}`;
        return {
          success: true,
          intent: 'query_schedule',
          reply: summary,
        };
      }

      const targetDate = intent.date || formatLocalDate(refDate);
      const dayLabel = formatSpokenDayLabel(targetDate, refDate);

      const tasks = tasksStore
        .getAllTasks(userId)
        .filter(t => !t.isCompleted && t.dueDate === targetDate);
      const blocks = timeBlocksStore
        .getAll(userId)
        .filter(b => b.date === targetDate);
      const events = tasksStore
        .getAllEvents(userId)
        .filter(e => e.date === targetDate);

      const totalCount = tasks.length + blocks.length + events.length;

      let summary = '';
      if (totalCount === 0) {
        summary = `${dayLabel}, your schedule is completely clear! You have no tasks, events, or time blocks.`;
      } else {
        const countParts: string[] = [];
        if (tasks.length > 0) {
          countParts.push(`${tasks.length} task${tasks.length > 1 ? 's' : ''}`);
        }
        if (blocks.length > 0) {
          countParts.push(
            `${blocks.length} time block${blocks.length > 1 ? 's' : ''}`,
          );
        }
        if (events.length > 0) {
          countParts.push(
            `${events.length} event${events.length > 1 ? 's' : ''}`,
          );
        }

        interface TimedItem {
          title: string;
          timeStr: string;
          spokenDetail: string;
        }

        const timedItems: TimedItem[] = [];
        const allDayTasks: string[] = [];

        for (const b of blocks) {
          const startSpoken = format12HourTime(b.startTime);
          const endSpoken =
            b.endTime && b.endTime !== b.startTime
              ? format12HourTime(b.endTime)
              : '';
          const timePhrase = endSpoken
            ? `from ${startSpoken} to ${endSpoken}`
            : `at ${startSpoken}`;
          timedItems.push({
            title: b.title,
            timeStr: b.startTime || '00:00',
            spokenDetail: `${b.title} ${timePhrase}`,
          });
        }

        for (const e of events) {
          const startSpoken = format12HourTime(e.startTime);
          const endSpoken =
            e.endTime && e.endTime !== e.startTime
              ? format12HourTime(e.endTime)
              : '';
          const timePhrase = endSpoken
            ? `from ${startSpoken} to ${endSpoken}`
            : `at ${startSpoken}`;
          timedItems.push({
            title: e.title,
            timeStr: e.startTime || '00:00',
            spokenDetail: `${e.title} ${timePhrase}`,
          });
        }

        for (const t of tasks) {
          if (t.dueTime) {
            const dueSpoken = format12HourTime(t.dueTime);
            timedItems.push({
              title: t.title,
              timeStr: t.dueTime,
              spokenDetail: `${t.title} at ${dueSpoken}`,
            });
          } else {
            allDayTasks.push(t.title);
          }
        }

        // Chronological sort by start/due time
        timedItems.sort((a, b) => a.timeStr.localeCompare(b.timeStr));

        const countSentence = `${dayLabel} you have ${formatListWithAnd(
          countParts,
        )}:`;

        if (timedItems.length === 0 && allDayTasks.length > 0) {
          summary = `${countSentence} ${formatListWithAnd(
            allDayTasks.map(t => `"${t}"`),
          )}.`;
        } else if (timedItems.length === 1 && allDayTasks.length === 0) {
          summary = `${countSentence} ${timedItems[0].spokenDetail}.`;
        } else if (timedItems.length === 2 && allDayTasks.length === 0) {
          summary = `${countSentence} First, ${timedItems[0].spokenDetail}. Then, ${timedItems[1].spokenDetail}.`;
        } else if (timedItems.length > 2 && allDayTasks.length === 0) {
          const parts = timedItems.map((item, idx) => {
            if (idx === 0) return `First, ${item.spokenDetail}.`;
            if (idx === timedItems.length - 1)
              return `Finally, ${item.spokenDetail}.`;
            return `Next, ${item.spokenDetail}.`;
          });
          summary = `${countSentence} ${parts.join(' ')}`;
        } else {
          // Mixed: timed items and all-day tasks
          let timedSentence = '';
          if (timedItems.length === 1) {
            timedSentence = timedItems[0].spokenDetail + '.';
          } else if (timedItems.length === 2) {
            timedSentence = `First, ${timedItems[0].spokenDetail}. Then, ${timedItems[1].spokenDetail}.`;
          } else {
            const parts = timedItems.map((item, idx) => {
              if (idx === 0) return `First, ${item.spokenDetail}.`;
              if (idx === timedItems.length - 1)
                return `Finally, ${item.spokenDetail}.`;
              return `Next, ${item.spokenDetail}.`;
            });
            timedSentence = parts.join(' ');
          }

          const allDaySentence = `You also have ${
            allDayTasks.length
          } all-day task${
            allDayTasks.length > 1 ? 's' : ''
          }: ${formatListWithAnd(allDayTasks.map(t => `"${t}"`))}.`;
          summary = `${countSentence} ${timedSentence} ${allDaySentence}`;
        }
      }

      if (options.speakResult) {
        try {
          await ttsService.speak(summary);
        } catch (e) {
          console.warn('[ActionExecutor] TTS playback error:', e);
        }
      }

      return {
        success: true,
        intent: 'query_schedule',
        reply: summary,
      };
    }

    case 'chat':
    case 'out_of_scope':
    default: {
      const queryLower = (
        intent.details ||
        intent.rawTranscript ||
        ''
      ).toLowerCase();
      if (
        /\b(?:what|who)\s+(?:are|is)\s+(?:you|lafina)|tell\s+me\s+about\s+yourself|who\s+made\s+you|are\s+you\s+(?:an?\s+)?(?:ai|bot|assistant)|what(?:'s|\s+is)\s+your\s+name|who\s+are\s+u|what\s+are\s+u\b/i.test(
          queryLower,
        ) ||
        intent.details === 'Identity'
      ) {
        return {
          success: true,
          intent: intent.intent,
          reply:
            'I am lafina, your offline academic assistant. I help you manage your schedule, set reminder alarms, and organize tasks and notes.',
        };
      }
      if (
        /\b(?:what\s+can\s+you\s+do|how\s+(?:do|can)\s+you\s+help|what\s+do\s+you\s+do|help(?:\s+me)?)\b/i.test(
          queryLower,
        )
      ) {
        return {
          success: true,
          intent: intent.intent,
          reply:
            'I am lafina, your offline academic assistant. You can ask me to schedule study blocks, set alarms, or add and view tasks.',
        };
      }
      return {
        success: true,
        intent: intent.intent,
        reply:
          'I am lafina, your offline academic assistant. I can manage your schedule, set reminders, and organize tasks and notes.',
      };
    }
  }
}
