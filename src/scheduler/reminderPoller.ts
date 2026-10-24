import { DeviceEventEmitter } from 'react-native';
import { remindersStore } from '../storage/remindersStore';

let pollerInterval: ReturnType<typeof setInterval> | null = null;
let activeUserId: string | null = null;

export const EVENT_CALL_TRIGGER = 'LAFINA_CALL_TRIGGER';

/**
 * Checks for due reminders and dispatches the call trigger if any are found.
 * Compares triggerAt with the current time (checks if triggerAt is <= current time + 30s).
 */
export const checkAndTriggerReminders = async (userId: string): Promise<void> => {
  try {
    const upcoming = remindersStore.getUpcomingReminders(userId, 1);
    const now = new Date();

    for (const reminder of upcoming) {
      const triggerTime = new Date(reminder.triggerAt);

      // Only trigger if triggerTime has passed or is within 30s
      if (triggerTime.getTime() <= now.getTime() + 30 * 1000) {
        console.log(`[ReminderPoller] Triggering reminder: ${reminder.id} - ${reminder.task}`);

        // 1. Mark status as triggered immediately to avoid double-triggers
        remindersStore.updateReminderStatus(reminder.id, 'triggered');

        // 2. Emit call event for UI and Call Dispatcher
        DeviceEventEmitter.emit(EVENT_CALL_TRIGGER, {
          reminderId: reminder.id,
          task: reminder.task,
          audioPath: reminder.preCastAudioPath,
        });
      }
    }
  } catch (error) {
    console.error('[ReminderPoller] Error checking reminders:', error);
  }
};

/**
 * Starts the foreground poller loop (defaults to every 15 seconds).
 */
export const startReminderPoller = (userId: string, intervalMs: number = 15000): void => {
  if (pollerInterval) {
    clearInterval(pollerInterval);
  }

  activeUserId = userId;
  console.log(`[ReminderPoller] Poller started for user ${userId}`);

  // Run immediately on start
  void checkAndTriggerReminders(userId);

  pollerInterval = setInterval(() => {
    if (activeUserId) {
      void checkAndTriggerReminders(activeUserId);
    }
  }, intervalMs);
};

/**
 * Stops the foreground poller loop.
 */
export const stopReminderPoller = (): void => {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log('[ReminderPoller] Poller stopped');
  }
  activeUserId = null;
};
