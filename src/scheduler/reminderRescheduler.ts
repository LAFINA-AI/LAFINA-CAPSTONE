import { remindersStore } from '../storage/remindersStore';
import { checkAndTriggerReminders } from './reminderPoller';
import { reconcileReminderDelivery } from './deliveryReconciler';

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
): Promise<RescheduleSummary> => {
  const summary: RescheduleSummary = {
    checked: 0,
    rescheduled: 0,
    missed: 0,
    triggered: 0,
  };

  try {
    const pending = remindersStore.getPendingReminders(userId);
    summary.checked = pending.length;
    const now = Date.now();

    for (const reminder of pending) {
      const triggerMs = new Date(reminder.triggerAt).getTime();

      if (triggerMs <= now) {
        // Overdue reminder
        const overdueBy = now - triggerMs;
        if (overdueBy > OVERDUE_MISSED_THRESHOLD_MS) {
          // Beyond grace period -> mark as missed
          remindersStore.updateReminderStatus(reminder.id, 'missed');
          summary.missed += 1;
        } else {
          // Within grace period -> trigger immediately
          summary.triggered += 1;
        }
      }
    }

    // Future reminders: one reconcile pass registers missing or outdated
    // generations with Android AlarmManager and cancels stale or foreign ones.
    const delivery = await reconcileReminderDelivery(userId);
    summary.rescheduled = delivery.registered + delivery.kept;

    if (summary.triggered > 0) {
      await checkAndTriggerReminders(userId);
    }
  } catch (error) {
    console.error('[ReminderRescheduler] Lifecycle reconciliation failed:', error);
  }

  return summary;
};
