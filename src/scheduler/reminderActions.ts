import { remindersStore } from '../storage/remindersStore';
import { getOccurrences } from '../storage/rruleHelper';
import { deletePreCachedReminderAudio } from '../ai/tts/ttsService';
import { recordReminderInteraction } from '../ai/ml';
import { generateId } from '../utils';
import { getReminderPreferences } from './userPreferences';
import {
  cancelReminderAlarm,
  finishNativeIncomingCall,
  scheduleReminderAlarm,
} from './reminderAlarm';

export type ReminderActionOutcome = 'snoozed' | 'acknowledged' | 'missed' | 'rejected';

export interface ReminderActionResult {
  ok: boolean;
  outcome: ReminderActionOutcome;
  triggerAt: string | null;
  message: string;
}

const rejection = (message: string): ReminderActionResult => ({
  ok: false,
  outcome: 'rejected',
  triggerAt: null,
  message,
});

/**
 * Snoozes a reminder and registers the replacement exact alarm as one coordinated atomic action.
 */
export const snoozeReminderAction = async (
  reminderId: string,
  userId: string,
  minutes: number,
): Promise<ReminderActionResult> => {
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder || reminder.userId !== userId) {
    return rejection('Reminder was not found.');
  }
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
    return rejection('Snooze duration must be between 1 and 120 minutes.');
  }

  const preferences = getReminderPreferences(userId);
  if (reminder.snoozeCount >= preferences.maxSnoozeCount) {
    return rejection(`You have reached the limit of ${preferences.maxSnoozeCount} snoozes.`);
  }

  const triggerAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  try {
    await scheduleReminderAlarm(reminder.id, reminder.task, triggerAt);
    try {
      remindersStore.snoozeReminderAt(reminder.id, triggerAt);
    } catch (databaseError) {
      await cancelReminderAlarm(reminder.id);
      throw databaseError;
    }
  } catch (error) {
    console.error('[ReminderActions] Snooze failed:', error);
    return rejection('I could not reschedule this reminder. Please try again.');
  }

  try {
    await finishNativeIncomingCall(reminder.id);
  } catch (error) {
    console.error('[ReminderActions] Snoozed, but call cleanup failed:', error);
  }

  // Non-blocking ML behavior tracking (Section 2.4.8)
  try {
    const latencySeconds = reminder.triggerAt
      ? Math.max(0, Math.round((Date.now() - new Date(reminder.triggerAt).getTime()) / 1000))
      : 0;
    recordReminderInteraction(userId, {
      reminderId: reminder.id,
      outcome: 'snoozed',
      latencySeconds,
      snoozeMinutes: minutes,
      channel: 'call',
    });
  } catch (err) {
    console.warn('[ReminderActions] Failed to record snooze interaction:', err);
  }

  return {
    ok: true,
    outcome: 'snoozed',
    triggerAt,
    message: `Snoozed for ${minutes} minutes.`,
  };
};

/**
 * Marks only the reminder acknowledged and clears all native call artifacts.
 * Critical invariant: Acknowledged reminder does NOT complete the underlying academic task.
 */
export const acknowledgeReminderAction = async (
  reminderId: string,
  userId: string,
): Promise<ReminderActionResult> => {
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder || reminder.userId !== userId) {
    return rejection('Reminder was not found.');
  }

  try {
    remindersStore.acknowledgeReminder(reminder.id);
  } catch (error) {
    console.error('[ReminderActions] Acknowledge failed:', error);
    return rejection('I could not acknowledge this reminder. Please try again.');
  }

  try {
    await cancelReminderAlarm(reminder.id);
    await finishNativeIncomingCall(reminder.id);
    await deletePreCachedReminderAudio(reminder.preCastAudioPath);
  } catch (error) {
    console.error('[ReminderActions] Acknowledged, but cleanup failed:', error);
  }

  // Also acknowledge and cancel any other pending, snoozed, or triggered reminders for the same task/event title
  // so no additional or duplicate call reminders get triggered for an event or task the user has already acknowledged.
  try {
    const normTarget = reminder.task.trim().toLowerCase();
    const otherReminders = remindersStore
      .getPendingReminders(userId)
      .filter((r) => r.id !== reminder.id && r.task.trim().toLowerCase() === normTarget);

    for (const other of otherReminders) {
      try {
        remindersStore.acknowledgeReminder(other.id);
        await cancelReminderAlarm(other.id);
        await finishNativeIncomingCall(other.id);
        await deletePreCachedReminderAudio(other.preCastAudioPath);
      } catch (err) {
        console.warn('[ReminderActions] Cleanup of duplicate reminder failed:', err);
      }
    }
  } catch (err) {
    console.warn('[ReminderActions] Error finding duplicate reminders to acknowledge:', err);
  }

  // If this reminder is recurring, automatically schedule the next occurrence
  try {
    const rruleMatch = /\[RRULE:([^\]]+)\]/.exec(reminder.description || '');
    if (rruleMatch) {
      const rruleStr = rruleMatch[1].trim();
      const remDate = new Date(reminder.scheduledAt || reminder.triggerAt);
      if (!isNaN(remDate.getTime())) {
        const y = remDate.getFullYear();
        const m = String(remDate.getMonth() + 1).padStart(2, '0');
        const d = String(remDate.getDate()).padStart(2, '0');
        const startDateStr = `${y}-${m}-${d}`;
        const hoursStr = String(remDate.getHours()).padStart(2, '0');
        const minsStr = String(remDate.getMinutes()).padStart(2, '0');
        const timeStr = `${hoursStr}:${minsStr}`;

        const nextDay = new Date(remDate);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(0, 0, 0, 0);
        const sixtyDaysAhead = new Date(nextDay);
        sixtyDaysAhead.setDate(sixtyDaysAhead.getDate() + 60);

        const occurrences = getOccurrences(startDateStr, rruleStr, nextDay, sixtyDaysAhead);
        if (occurrences.length > 0) {
          const nextDateStr = occurrences[0];
          const nextTriggerAt = new Date(`${nextDateStr}T${timeStr}:00`).toISOString();
          const nextReminderId = generateId('rem');

          remindersStore.insertReminder({
            id: nextReminderId,
            userId,
            task: reminder.task,
            description: reminder.description,
            scheduledAt: nextTriggerAt,
            triggerAt: nextTriggerAt,
            status: 'pending',
            preCastAudioPath: null,
          });
          await scheduleReminderAlarm(nextReminderId, reminder.task, nextTriggerAt);
        }
      }
    }
  } catch (err) {
    console.warn('[ReminderActions] Failed to schedule next recurring reminder:', err);
  }

  // Non-blocking ML behavior tracking (Section 2.4.8)
  try {
    const latencySeconds = reminder.triggerAt
      ? Math.max(0, Math.round((Date.now() - new Date(reminder.triggerAt).getTime()) / 1000))
      : 0;
    recordReminderInteraction(userId, {
      reminderId: reminder.id,
      outcome: 'acknowledged',
      latencySeconds,
      channel: 'call',
    });
  } catch (err) {
    console.warn('[ReminderActions] Failed to record acknowledge interaction:', err);
  }

  return {
    ok: true,
    outcome: 'acknowledged',
    triggerAt: null,
    message: 'Great! Reminder acknowledged. Have a productive study session.',
  };
};

/**
 * Applies the configured automatic snooze duration, or marks the reminder missed when snooze limit is reached.
 */
export const autoSnoozeReminderAction = async (
  reminderId: string,
  userId: string,
): Promise<ReminderActionResult> => {
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder || reminder.userId !== userId) {
    return rejection('Reminder was not found.');
  }

  const preferences = getReminderPreferences(userId);
  if (reminder.snoozeCount < preferences.maxSnoozeCount) {
    return snoozeReminderAction(
      reminderId,
      userId,
      preferences.autoSnoozeDurationMinutes,
    );
  }

  try {
    remindersStore.updateReminderStatus(reminder.id, 'missed');
  } catch (error) {
    console.error('[ReminderActions] Mark missed failed:', error);
    return rejection('I could not close this reminder. Please try again.');
  }

  try {
    await cancelReminderAlarm(reminder.id);
    await finishNativeIncomingCall(reminder.id);
  } catch (error) {
    console.error('[ReminderActions] Marked missed, but cleanup failed:', error);
  }

  // Non-blocking ML behavior tracking (Section 2.4.8)
  try {
    const latencySeconds = reminder.triggerAt
      ? Math.max(0, Math.round((Date.now() - new Date(reminder.triggerAt).getTime()) / 1000))
      : 0;
    recordReminderInteraction(userId, {
      reminderId: reminder.id,
      outcome: 'missed',
      latencySeconds,
      channel: 'call',
    });
  } catch (err) {
    console.warn('[ReminderActions] Failed to record missed interaction:', err);
  }

  return {
    ok: true,
    outcome: 'missed',
    triggerAt: null,
    message: 'Snooze limit reached. This reminder was marked missed.',
  };
};
