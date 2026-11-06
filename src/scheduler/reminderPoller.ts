import { DeviceEventEmitter } from 'react-native';
import { remindersStore } from '../storage/remindersStore';
import { db } from '../storage/database';
import { alertSuppression } from '../storage/sourceReminders';
import { deliveryStore } from '../storage/deliveryStore';
import { cancelReminderAlarm, finishNativeIncomingCall } from './reminderAlarm';
import {
  claimForegroundRing,
  readLiveNativeRegistrations,
  reconcileIfDeliveryChanged,
  shouldDispatchInJs,
} from './deliveryReconciler';
import type { NativeRegistrationSnapshot } from './deliveryReconciler';

let pollerInterval: ReturnType<typeof setInterval> | null = null;
let activeUserId: string | null = null;

export const EVENT_CALL_TRIGGER = 'LAFINA_CALL_TRIGGER';

/**
 * Checks for due reminders and dispatches the call trigger if any are found.
 * Compares triggerAt with the current time (checks if triggerAt is <= current time + 30s).
 *
 * AGY-PORT 03: this is the fallback engine only. A generation the native
 * AlarmManager registry holds is left to Android, so one reminder generation
 * never rings from both engines.
 */
export const checkAndTriggerReminders = async (userId: string): Promise<void> => {
  try {
    const upcoming = remindersStore.getUpcomingReminders(userId, 1);
    const now = new Date();
    let liveRegistrations: NativeRegistrationSnapshot;
    let registrationsRead = false;

    for (const reminder of upcoming) {
      const triggerTime = new Date(reminder.triggerAt);

      // Only trigger if triggerTime has passed or is within 30s
      if (triggerTime.getTime() <= now.getTime() + 30 * 1000) {
        if (!registrationsRead) {
          liveRegistrations = await readLiveNativeRegistrations();
          registrationsRead = true;
        }
        if (!shouldDispatchInJs(reminder.id, liveRegistrations)) continue;

        // Suppress only when this reminder's own task is completed or the same
        // alert was already acknowledged (exact link, strict evidence or exact
        // duplicate); a shared title alone never silences a reminder.
        if (alertSuppression(db, reminder)) {
          remindersStore.acknowledgeReminder(reminder.id);
          void cancelReminderAlarm(reminder.id);
          void finishNativeIncomingCall(reminder.id);
          continue;
        }

        // Exactly one engine per generation: native may have fired since the
        // listing above; after this claim it can no longer ring this one.
        const job = deliveryStore.get(reminder.id);
        if (!(await claimForegroundRing(reminder.id, userId, job?.generation))) continue;

        console.log(`[ReminderPoller] Triggering reminder: ${reminder.id} - ${reminder.task}`);

        // 1. Mark status as triggered immediately to avoid double-triggers
        remindersStore.updateReminderStatus(reminder.id, 'triggered');
        if (job) {
          deliveryStore.recordEvent({
            reminderId: job.reminderId,
            userId: job.userId,
            generation: job.generation,
            event: 'js_dispatched',
          });
        }

        // 2. Emit call event for UI and Call Dispatcher, with the captured identity
        DeviceEventEmitter.emit(EVENT_CALL_TRIGGER, {
          reminderId: reminder.id,
          task: reminder.task,
          audioPath: reminder.preCastAudioPath,
          ownerId: reminder.userId,
          generation: job?.generation,
        });
      }
    }
  } catch (error) {
    console.error('[ReminderPoller] Error checking reminders:', error);
  }
  // A writer that retired or moved a job without cancelling its alarm is
  // corrected now, not only at the next start, resume or sync.
  try {
    await reconcileIfDeliveryChanged(userId);
  } catch (error) {
    console.warn('[ReminderPoller] Delivery reconcile failed:', error);
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
