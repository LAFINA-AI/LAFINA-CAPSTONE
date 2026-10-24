import { remindersStore } from '../storage';
import { scheduleReminderAlarm } from './reminderAlarm';

export interface ReminderPreferenceRefreshResult {
  updatedCount: number;
  failedCount: number;
}

export const refreshPendingReminderLeadTimes = async (
  userId: string,
  leadTimeMinutes: number,
): Promise<ReminderPreferenceRefreshResult> => {
  if (!Number.isInteger(leadTimeMinutes) || leadTimeMinutes < 0 || leadTimeMinutes > 120) {
    throw new Error('Reminder lead time must be between 0 and 120 minutes.');
  }

  let updatedCount = 0;
  let failedCount = 0;
  const nowMs = Date.now();
  const reminders = remindersStore
    .getAllReminders(userId)
    .filter(
      (reminder) =>
        reminder.status === 'pending' &&
        new Date(reminder.scheduledAt).getTime() > nowMs,
    );

  for (const reminder of reminders) {
    const scheduledAtMs = new Date(reminder.scheduledAt).getTime();
    const preferredTriggerMs = scheduledAtMs - leadTimeMinutes * 60 * 1000;
    const triggerAt = new Date(Math.max(preferredTriggerMs, Date.now() + 1000)).toISOString();

    try {
      await scheduleReminderAlarm(reminder.id, reminder.task, triggerAt);
      try {
        remindersStore.updateReminderTriggerAt(reminder.id, triggerAt);
        updatedCount += 1;
      } catch (databaseError) {
        try {
          await scheduleReminderAlarm(reminder.id, reminder.task, reminder.triggerAt);
        } catch (rollbackError) {
          console.error(
            '[ReminderPreferences] Failed to restore the original alarm:',
            reminder.id,
            rollbackError,
          );
        }
        throw databaseError;
      }
    } catch (error) {
      failedCount += 1;
      console.error(
        '[ReminderPreferences] Failed to apply updated lead time:',
        reminder.id,
        error,
      );
    }
  }

  return { updatedCount, failedCount };
};
