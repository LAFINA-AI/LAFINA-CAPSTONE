import { tasksStore, timeBlocksStore, remindersStore, notesStore } from '../../storage';
import { scheduleReminderAlarm, acknowledgeReminderAction, snoozeReminderAction } from '../../scheduler';
import { generateId } from '../../utils';
import { formatLocalDate } from './fastPathParser';
import type { ValidatedIntent, NluActionResult } from './types';

export interface ActionExecutorOptions {
  activeReminderId?: string;
  referenceDate?: Date;
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
        const [h, m] = startTime.split(':').map((v) => parseInt(v, 10));
        const dur = intent.durationMinutes || 60;
        const totalMin = h * 60 + m + dur;
        const endH = Math.min(23, Math.floor(totalMin / 60));
        const endM = totalMin % 60;
        endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
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
      const targetDate = intent.date || todayStr;
      const tasks = tasksStore.getAllTasks(userId).filter((t) => !t.isCompleted && t.dueDate === targetDate);
      const blocks = timeBlocksStore.getAll(userId).filter((b) => b.date === targetDate);

      let summary = `For ${targetDate}: `;
      if (tasks.length === 0 && blocks.length === 0) {
        summary += 'You have no scheduled tasks or time blocks. Your schedule is clear!';
      } else {
        const parts: string[] = [];
        if (tasks.length > 0) {
          const taskNames = tasks.map((t) => `"${t.title}"${t.dueTime ? ` at ${t.dueTime}` : ''}`).join(', ');
          parts.push(`${tasks.length} task${tasks.length > 1 ? 's' : ''} (${taskNames})`);
        }
        if (blocks.length > 0) {
          const blockNames = blocks.map((b) => `"${b.title}" (${b.startTime}-${b.endTime})`).join(', ');
          parts.push(`${blocks.length} time block${blocks.length > 1 ? 's' : ''} (${blockNames})`);
        }
        summary += `You have ${parts.join(' and ')}.`;
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
        reply: "Hey! I'm LAFINA. You can ask me to add tasks, schedule study blocks, set reminders, or take notes.",
      };
    }
  }
}
