import { tasksStore, timeBlocksStore, remindersStore, notesStore } from '../../storage';
import type { Task, TimeBlock, Note } from '../../storage';
import {
  scheduleReminderAlarm,
  cancelReminderAlarm,
  acknowledgeReminderAction,
  snoozeReminderAction,
} from '../../scheduler';
import { generateId } from '../../utils';
import { formatLocalDate } from './fastPathParser';
import { ttsService } from '../tts/ttsService';
import type { ValidatedIntent, NluActionResult } from './types';

export interface ActionExecutorOptions {
  activeReminderId?: string;
  referenceDate?: Date;
  speakResult?: boolean;
}

function format12HourTime(timeStr?: string | null): string {
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
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];
      return `On ${weekdays[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
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
      /\b(?:my|the|a|an|this|that|task|tasks|todo|time\s*block|timeblock|study\s*block|focus\s*block|block|blocks|note|notes|reminder|reminders|event|events|for|about|to|on|at|in)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function isRecentReference(query: string | null | undefined): boolean {
  if (!query) return false;
  return /^(?:last|latest|recent|previous|that|this|it)$/i.test(normalizeForMatch(query));
}

function scoreEntityMatch(
  candidateTitle: string,
  candidateDate: string | null | undefined,
  candidateTime: string | null | undefined,
  targetTitle: string | null | undefined,
  targetDate: string | null | undefined,
  targetTime: string | null | undefined,
): number {
  const normCandidate = normalizeForMatch(candidateTitle);
  const normQuery = normalizeForMatch(targetTitle);

  let score = 0;

  if (normQuery && normCandidate) {
    if (normCandidate === normQuery) {
      score += 100;
    } else if (normCandidate.includes(normQuery) || normQuery.includes(normCandidate)) {
      score += 80;
    } else {
      const queryWords = normQuery.split(' ').filter(Boolean);
      const candWords = new Set(normCandidate.split(' ').filter(Boolean));
      if (queryWords.length > 0) {
        const matchedWords = queryWords.filter((w) => candWords.has(w)).length;
        const ratio = matchedWords / queryWords.length;
        if (ratio >= 0.5) {
          score += Math.round(ratio * 65);
        }
      }
    }
  }

  if (targetTime && candidateTime && candidateTime === targetTime) {
    score += normQuery ? 40 : 75;
  }

  if (targetDate && candidateDate && candidateDate === targetDate) {
    score += normQuery || targetTime ? 20 : 50;
  }

  return score;
}

function findMatchingTask(
  tasks: Task[],
  targetTitle: string | null | undefined,
  targetDate: string | null | undefined,
  targetTime: string | null | undefined,
): { task: Task | null; score: number } {
  if (tasks.length === 0) return { task: null, score: 0 };
  if (isRecentReference(targetTitle)) {
    const sorted = [...tasks].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return { task: sorted[0], score: 70 };
  }

  let bestTask: Task | null = null;
  let bestScore = 0;
  for (const t of tasks) {
    const score = scoreEntityMatch(t.title, t.dueDate, t.dueTime, targetTitle, targetDate, targetTime);
    if (score > bestScore) {
      bestScore = score;
      bestTask = t;
    }
  }
  return { task: bestScore >= 30 ? bestTask : null, score: bestScore };
}

function findMatchingTimeBlock(
  blocks: TimeBlock[],
  targetTitle: string | null | undefined,
  targetDate: string | null | undefined,
  targetTime: string | null | undefined,
): { block: TimeBlock | null; score: number } {
  if (blocks.length === 0) return { block: null, score: 0 };
  if (isRecentReference(targetTitle)) {
    const sorted = [...blocks].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return { block: sorted[0], score: 70 };
  }

  let bestBlock: TimeBlock | null = null;
  let bestScore = 0;
  for (const b of blocks) {
    const score = scoreEntityMatch(b.title, b.date, b.startTime, targetTitle, targetDate, targetTime);
    if (score > bestScore) {
      bestScore = score;
      bestBlock = b;
    }
  }
  return { block: bestScore >= 30 ? bestBlock : null, score: bestScore };
}

function findMatchingNote(
  notes: Note[],
  targetTitle: string | null | undefined,
): { note: Note | null; score: number } {
  if (notes.length === 0) return { note: null, score: 0 };
  if (isRecentReference(targetTitle)) {
    const sorted = [...notes].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return { note: sorted[0], score: 70 };
  }

  let bestNote: Note | null = null;
  let bestScore = 0;
  for (const n of notes) {
    const titleScore = scoreEntityMatch(n.title, null, null, targetTitle, null, null);
    const bodyScore = scoreEntityMatch(n.body, null, null, targetTitle, null, null) * 0.7;
    const score = Math.max(titleScore, bodyScore);
    if (score > bestScore) {
      bestScore = score;
      bestNote = n;
    }
  }
  return { note: bestScore >= 30 ? bestNote : null, score: bestScore };
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
  const [h, m] = startTime.split(':').map((v) => parseInt(v, 10));
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
        const triggerAt = isNaN(scheduledTimeMs) ? new Date().toISOString() : new Date(scheduledTimeMs).toISOString();

        remindersStore.insertReminder({
          id: reminderId,
          userId,
          task: taskTitle,
          description: intent.details || null,
          scheduledAt: triggerAt,
          triggerAt,
          status: 'pending',
          preCastAudioPath: null,
        });

        try {
          await scheduleReminderAlarm(reminderId, taskTitle, triggerAt);
        } catch (e) {
          console.warn('Failed to schedule native alarm for task reminder:', e);
        }
        reminderMsg = ` with a reminder at ${dueTime}`;
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
        reply: `Scheduled time block: "${blockTitle}" on ${blockDate} from ${startTime} to ${endTime}.`,
      };
    }

    case 'create_reminder': {
      const reminderId = generateId();
      const reminderTitle = intent.title || 'Reminder';
      const remDate = intent.date || todayStr;
      const remTime = intent.time || '09:00';
      const scheduledAt = `${remDate}T${remTime}:00`;
      const scheduledTimeMs = new Date(scheduledAt).getTime();
      const triggerAt = isNaN(scheduledTimeMs)
        ? new Date(Date.now() + 60000).toISOString()
        : new Date(scheduledTimeMs).toISOString();

      remindersStore.insertReminder({
        id: reminderId,
        userId,
        task: reminderTitle,
        description: intent.details || null,
        scheduledAt: triggerAt,
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
        recurrenceRule: null,
      });

      try {
        await scheduleReminderAlarm(reminderId, reminderTitle, triggerAt);
      } catch (e) {
        console.warn('Failed to schedule exact native alarm:', e);
      }

      return {
        success: true,
        intent: 'create_reminder',
        entityType: 'reminder',
        entityId: reminderId,
        reply: `Reminder set: "${reminderTitle}" on ${remDate} at ${remTime}.`,
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
      const { block } = findMatchingTimeBlock(allBlocks, targetTitle, intent.date, targetTime);

      if (!block) {
        return {
          success: false,
          intent: 'delete_time_block',
          entityType: 'time_block',
          reply: `Could not find a time block matching "${targetTitle || targetTime || 'that request'}".`,
          error: 'Time block not found.',
        };
      }

      timeBlocksStore.delete(block.id);
      return {
        success: true,
        intent: 'delete_time_block',
        entityType: 'time_block',
        entityId: block.id,
        reply: `Removed time block: "${block.title}".`,
      };
    }

    case 'delete_note': {
      const targetTitle = intent.targetTitle || intent.title;
      const allNotes = notesStore.getAll(userId);
      const { note } = findMatchingNote(allNotes, targetTitle);

      if (!note) {
        return {
          success: false,
          intent: 'delete_note',
          entityType: 'note',
          reply: `Could not find a note matching "${targetTitle || 'that request'}".`,
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
      const taskMatch = findMatchingTask(allTasks, targetTitle, intent.date, targetTime);

      // If targetEntityType is 'any' (user said e.g. "Cancel my Coffee Break"), check if a time block or note is a better match
      if (intent.targetEntityType === 'any') {
        const allBlocks = timeBlocksStore.getAll(userId);
        const blockMatch = findMatchingTimeBlock(allBlocks, targetTitle, intent.date, targetTime);
        if (blockMatch.block && blockMatch.score > taskMatch.score) {
          timeBlocksStore.delete(blockMatch.block.id);
          return {
            success: true,
            intent: 'delete_time_block',
            entityType: 'time_block',
            entityId: blockMatch.block.id,
            reply: `Removed time block: "${blockMatch.block.title}".`,
          };
        }

        if (!taskMatch.task && !blockMatch.block) {
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
      }

      if (taskMatch.task) {
        tasksStore.deleteTask(taskMatch.task.id);
        return {
          success: true,
          intent: 'delete_task',
          entityType: 'task',
          entityId: taskMatch.task.id,
          reply: `Removed task: "${taskMatch.task.title}".`,
        };
      }

      // Check standalone reminders if no task row matched
      const allReminders = remindersStore.getPendingReminders(userId);
      const normQuery = normalizeForMatch(targetTitle);
      const matchedReminder = allReminders.find(
        (r) => normQuery && normalizeForMatch(r.task).includes(normQuery),
      );
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

      return {
        success: false,
        intent: 'delete_task',
        entityType: 'task',
        reply: `Could not find a task matching "${targetTitle || targetTime || 'that request'}".`,
        error: 'Task not found.',
      };
    }

    case 'update_time_block': {
      const targetTitle = intent.targetTitle || intent.title;
      const allBlocks = timeBlocksStore.getAll(userId);
      const { block } = findMatchingTimeBlock(allBlocks, targetTitle, null, intent.targetTime);

      if (!block) {
        return {
          success: false,
          intent: 'update_time_block',
          entityType: 'time_block',
          reply: `Could not find a time block matching "${targetTitle || intent.targetTime || 'that request'}".`,
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
          const origDur = computeDurationMinutes(block.startTime, block.endTime);
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
        reply: `Updated time block: "${updatedTitle}" on ${updatedDate} from ${updatedStart} to ${updatedEnd}.`,
      };
    }

    case 'update_note': {
      const targetTitle = intent.targetTitle || intent.title;
      const allNotes = notesStore.getAll(userId);
      const { note } = findMatchingNote(allNotes, targetTitle);

      if (!note) {
        return {
          success: false,
          intent: 'update_note',
          entityType: 'note',
          reply: `Could not find a note matching "${targetTitle || 'that request'}".`,
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
      const taskMatch = findMatchingTask(allTasks, targetTitle, null, intent.targetTime);

      // If targetEntityType === 'any' (e.g. "Move Coffee Break to 3pm"), check if a time block is a better match
      if (intent.targetEntityType === 'any' && !intent.isCompleted) {
        const allBlocks = timeBlocksStore.getAll(userId);
        const blockMatch = findMatchingTimeBlock(allBlocks, targetTitle, null, intent.targetTime);
        if (blockMatch.block && blockMatch.score > taskMatch.score) {
          const b = blockMatch.block;
          const updatedTitle = intent.newTitle || b.title;
          const updatedDate = intent.date || b.date;
          const updatedStart = intent.time || b.startTime;
          let updatedEnd = intent.endTime || b.endTime;
          if (!intent.endTime) {
            if (intent.durationMinutes) {
              updatedEnd = addMinutesToTime(updatedStart, intent.durationMinutes);
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
            reply: `Updated time block: "${updatedTitle}" on ${updatedDate} from ${updatedStart} to ${updatedEnd}.`,
          };
        }
      }

      if (!taskMatch.task) {
        return {
          success: false,
          intent: 'update_task',
          entityType: 'task',
          reply: `Could not find a task matching "${targetTitle || intent.targetTime || 'that request'}".`,
          error: 'Task not found.',
        };
      }

      const task = taskMatch.task;
      if (intent.isCompleted === true) {
        tasksStore.updateTask({
          id: task.id,
          isCompleted: true,
        });
        return {
          success: true,
          intent: 'update_task',
          entityType: 'task',
          entityId: task.id,
          reply: `Marked task "${task.title}" as completed.`,
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
          (r) => normalizeForMatch(r.task) === normalizeForMatch(task.title),
        );
        const scheduledAt = `${updatedDate}T${updatedTime}:00`;
        const scheduledMs = new Date(scheduledAt).getTime();
        if (linkedRem && Number.isFinite(scheduledMs) && scheduledMs > Date.now()) {
          const triggerAt = new Date(scheduledMs).toISOString();
          try {
            remindersStore.updateReminderTriggerAt(linkedRem.id, triggerAt);
            await scheduleReminderAlarm(linkedRem.id, updatedTitle, triggerAt);
          } catch (e) {
            console.warn('Failed to update task reminder alarm:', e);
          }
        }
      }

      const timeSuffix = updatedTime ? ` at ${updatedTime}` : '';
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
      }
      return {
        success: true,
        intent: 'acknowledge',
        reply: 'Great job! Acknowledged.',
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
        const triggerAt = isNaN(scheduledMs) ? new Date(Date.now() + 60000).toISOString() : new Date(scheduledMs).toISOString();

        try {
          remindersStore.updateReminderTriggerAt(options.activeReminderId, triggerAt);
          const activeRem = remindersStore.getReminderById(options.activeReminderId);
          if (activeRem) {
            await scheduleReminderAlarm(activeRem.id, activeRem.task, triggerAt);
          }
        } catch (e) {
          console.warn('Failed to reschedule native alarm:', e);
        }
      }

      return {
        success: true,
        intent: 'reschedule',
        reply: `Rescheduled to ${newDate} at ${newTime}.`,
      };
    }

    case 'query_schedule': {
      const refDate = options.referenceDate || new Date();
      const targetDate = intent.date || formatLocalDate(refDate);
      const dayLabel = formatSpokenDayLabel(targetDate, refDate);

      const tasks = tasksStore.getAllTasks(userId).filter((t) => !t.isCompleted && t.dueDate === targetDate);
      const blocks = timeBlocksStore.getAll(userId).filter((b) => b.date === targetDate);
      const events = tasksStore.getAllEvents(userId).filter((e) => e.date === targetDate);

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
          countParts.push(`${blocks.length} time block${blocks.length > 1 ? 's' : ''}`);
        }
        if (events.length > 0) {
          countParts.push(`${events.length} event${events.length > 1 ? 's' : ''}`);
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
          const endSpoken = b.endTime && b.endTime !== b.startTime ? format12HourTime(b.endTime) : '';
          const timePhrase = endSpoken ? `from ${startSpoken} to ${endSpoken}` : `at ${startSpoken}`;
          timedItems.push({
            title: b.title,
            timeStr: b.startTime || '00:00',
            spokenDetail: `${b.title} ${timePhrase}`,
          });
        }

        for (const e of events) {
          const startSpoken = format12HourTime(e.startTime);
          const endSpoken = e.endTime && e.endTime !== e.startTime ? format12HourTime(e.endTime) : '';
          const timePhrase = endSpoken ? `from ${startSpoken} to ${endSpoken}` : `at ${startSpoken}`;
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

        const countSentence = `${dayLabel} you have ${formatListWithAnd(countParts)}:`;

        if (timedItems.length === 0 && allDayTasks.length > 0) {
          summary = `${countSentence} ${formatListWithAnd(allDayTasks.map((t) => `"${t}"`))}.`;
        } else if (timedItems.length === 1 && allDayTasks.length === 0) {
          summary = `${countSentence} ${timedItems[0].spokenDetail}.`;
        } else if (timedItems.length === 2 && allDayTasks.length === 0) {
          summary = `${countSentence} First, ${timedItems[0].spokenDetail}. Then, ${timedItems[1].spokenDetail}.`;
        } else if (timedItems.length > 2 && allDayTasks.length === 0) {
          const parts = timedItems.map((item, idx) => {
            if (idx === 0) return `First, ${item.spokenDetail}.`;
            if (idx === timedItems.length - 1) return `Finally, ${item.spokenDetail}.`;
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
              if (idx === timedItems.length - 1) return `Finally, ${item.spokenDetail}.`;
              return `Next, ${item.spokenDetail}.`;
            });
            timedSentence = parts.join(' ');
          }

          const allDaySentence = `You also have ${allDayTasks.length} all-day task${allDayTasks.length > 1 ? 's' : ''}: ${formatListWithAnd(allDayTasks.map((t) => `"${t}"`))}.`;
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
      return {
        success: true,
        intent: intent.intent,
        reply: "Hey! I'm LAFINA. You can ask me to add, update, or remove tasks, time blocks, reminders, or notes.",
      };
    }
  }
}
