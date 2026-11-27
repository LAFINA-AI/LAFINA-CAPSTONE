import {isCallInProgress} from './callDispatcher';
import {consumePendingNativeCalls} from './reminderAlarm';
import {recoverNativeCall} from './nativeCallRecovery';
import {callLifecycle} from './callLifecycle';
import {deliveryStore} from '../storage/deliveryStore';
import {remindersStore} from '../storage/remindersStore';
import {checkAndTriggerReminders} from './reminderPoller';
import {reconcileReminderDelivery} from './deliveryReconciler';
import {createNextRecurringReminder} from './reminderActions';
import {db} from '../storage/database';

export interface RescheduleSummary {
  checked: number;
  rescheduled: number;
  missed: number;
  triggered: number;
}

const OVERDUE_MISSED_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Reconciles and reschedules all pending reminders for a user across lifecycle events
 * (startup, foreground resume, device boot, cloud sync pull).
 */
export const rescheduleUserReminders = async (
  userId: string,
  foregroundDelivery = true,
): Promise<RescheduleSummary> => {
  const summary: RescheduleSummary = {
    checked: 0,
    rescheduled: 0,
    missed: 0,
    triggered: 0,
  };

  try {
    for (const request of foregroundDelivery
      ? await consumePendingNativeCalls()
      : []) {
      if (!request.ownerId || request.ownerId === userId)
        recoverNativeCall(request, userId);
    }
    const pending = remindersStore.getPendingReminders(userId);
    summary.checked = pending.length;
    const now = Date.now();

    for (const reminder of pending) {
      const generation = deliveryStore.get(reminder.id)?.generation;
      if (
        (generation != null &&
          isCallInProgress(userId, reminder.id, generation)) ||
        callLifecycle.protects(userId, reminder.id, generation)
      )
        continue;
      const triggerMs = new Date(reminder.triggerAt).getTime();

      if (triggerMs <= now) {
        // Overdue reminder
        const overdueBy = now - triggerMs;
        if (overdueBy > OVERDUE_MISSED_THRESHOLD_MS) {
          // Beyond grace period -> mark as missed
          // A repeating reminder continues with its next future occurrence
          // (audit 2, B1); the reconcile pass below registers it.
          db.transactionSync(tx => {
            remindersStore.updateReminderStatus(
              reminder.id,
              'missed',
              undefined,
              tx,
            );
            createNextRecurringReminder(reminder, userId, tx, new Date(now));
          });
          summary.missed += 1;
        } else {
          // Within grace period -> trigger immediately. If an unprotected
          // reminder was left stranded in 'triggered' after a crash/kill,
          // re-arm it to 'pending' so checkAndTriggerReminders can pick it up.
          if (reminder.status === 'triggered') {
            remindersStore.updateReminderStatus(reminder.id, 'pending');
          }
          summary.triggered += 1;
        }
      }
    }

    // Future reminders: one reconcile pass registers missing or outdated
    // generations with Android AlarmManager and cancels stale or foreign ones.
    const delivery = await reconcileReminderDelivery(userId);
    summary.rescheduled = delivery.registered + delivery.kept;

    if (foregroundDelivery && summary.triggered > 0) {
      await checkAndTriggerReminders(userId);
    }
  } catch (error) {
    console.error(
      '[ReminderRescheduler] Lifecycle reconciliation failed:',
      error,
    );
  }

  return summary;
};
