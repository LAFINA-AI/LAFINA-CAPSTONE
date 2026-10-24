import { remindersStore } from '../storage/remindersStore';
import { deletePreCachedReminderAudio } from '../ai/tts/ttsService';
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

  return {
    ok: true,
    outcome: 'missed',
    triggerAt: null,
    message: 'Snooze limit reached. This reminder was marked missed.',
  };
};
