import { remindersStore } from '../storage/remindersStore';
import { DeliveryFenceError, deliveryStore } from '../storage/deliveryStore';
import type { DeliveryFenceReason } from '../storage/deliveryStore';
import { db } from '../storage/database';
import type { DatabaseTransaction } from '../storage/database';
import { isSameAlert, resolveReminderSource } from '../storage/sourceReminders';
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
  /** Snooze saved, but Android has not accepted the new alarm yet; reconcile retries. */
  deliveryPending?: boolean;
  /** Why a captured delivery identity was refused (stale button, other owner...). */
  fenceReason?: DeliveryFenceReason;
}

const rejection = (message: string): ReminderActionResult => ({
  ok: false,
  outcome: 'rejected',
  triggerAt: null,
  message,
});

const STALE_MESSAGE = 'This reminder call is no longer current, so nothing was changed.';

const fenceRejection = (reason: DeliveryFenceReason): ReminderActionResult => ({
  ...rejection(STALE_MESSAGE),
  fenceReason: reason,
});

type FencePreparation =
  | { ok: true; guard: (tx: DatabaseTransaction) => void }
  | { ok: false; result: ReminderActionResult };

/**
 * Checks a captured delivery identity before the mutation (for a clear
 * message) and returns the in-transaction guard that re-checks it atomically.
 * `expectedGeneration` undefined/null keeps AGY's owner-only behavior for
 * callers without a captured identity (typed Chat commands).
 */
const prepareFence = (
  reminderId: string,
  userId: string,
  expectedGeneration: number | null | undefined,
): FencePreparation => {
  const check = deliveryStore.checkFence(reminderId, userId, expectedGeneration);
  if (!check.ok) {
    if (check.job) {
      try {
        deliveryStore.recordEvent({
          reminderId,
          userId: check.job.userId,
          generation: expectedGeneration ?? -1,
          event: 'action_rejected',
          code: check.reason,
        });
      } catch (error) {
        console.warn('[ReminderActions] Could not record rejected action:', error);
      }
    }
    return { ok: false, result: fenceRejection(check.reason) };
  }
  return {
    ok: true,
    guard: (tx) =>
      deliveryStore.assertFence(tx, reminderId, userId, expectedGeneration),
  };
};

const fenceFailure = (error: unknown): ReminderActionResult | null =>
  error instanceof DeliveryFenceError ? fenceRejection(error.reason) : null;

/**
 * Snoozes a reminder, then registers the replacement alarm for the new
 * delivery generation. The snooze (reminder + delivery job + outbox) commits
 * atomically first; a failed Android registration keeps the committed snooze,
 * is recorded as a receipt and retried by reconcile, and the foreground
 * fallback can still ring it.
 */
export const snoozeReminderAction = async (
  reminderId: string,
  userId: string,
  minutes: number,
  expectedGeneration?: number | null,
): Promise<ReminderActionResult> => {
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder || reminder.userId !== userId) {
    return rejection('Reminder was not found.');
  }
  const fence = prepareFence(reminderId, userId, expectedGeneration);
  if (!fence.ok) return fence.result;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
    return rejection('Snooze duration must be between 1 and 120 minutes.');
  }

  const preferences = getReminderPreferences(userId);
  if (reminder.snoozeCount >= preferences.maxSnoozeCount) {
    return rejection(`You have reached the limit of ${preferences.maxSnoozeCount} snoozes.`);
  }

  const triggerAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  try {
    remindersStore.snoozeReminderAt(reminder.id, triggerAt, fence.guard);
  } catch (error) {
    const fenced = fenceFailure(error);
    if (fenced) return fenced;
    console.error('[ReminderActions] Snooze failed:', error);
    return rejection('I could not reschedule this reminder. Please try again.');
  }

  let deliveryPending = false;
  try {
    await scheduleReminderAlarm(reminder.id, reminder.task, triggerAt);
  } catch (error) {
    deliveryPending = true;
    console.warn('[ReminderActions] Snoozed; alarm registration will be retried:', error);
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
    ...(deliveryPending ? { deliveryPending: true } : {}),
  };
};

/**
 * Marks only the reminder acknowledged and clears all native call artifacts.
 * Critical invariant: Acknowledged reminder does NOT complete the underlying academic task.
 */
export const acknowledgeReminderAction = async (
  reminderId: string,
  userId: string,
  expectedGeneration?: number | null,
): Promise<ReminderActionResult> => {
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder || reminder.userId !== userId) {
    return rejection('Reminder was not found.');
  }
  const fence = prepareFence(reminderId, userId, expectedGeneration);
  if (!fence.ok) return fence.result;

  try {
    remindersStore.acknowledgeReminder(reminder.id, fence.guard);
  } catch (error) {
    const fenced = fenceFailure(error);
    if (fenced) return fenced;
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

  // Also acknowledge the other pending, snoozed or triggered reminders of the same
  // alert, so the student is not called again for an item already acknowledged.
  // Same alert = the same task, event or time block (exact link or strict
  // evidence), or an exact duplicate; reminders that only share a title are left.
  try {
    const source = resolveReminderSource(db, reminder);
    const otherReminders = remindersStore
      .getPendingReminders(userId)
      .filter((r) => isSameAlert(db, reminder, r, source));

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
  expectedGeneration?: number | null,
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
      expectedGeneration,
    );
  }

  const fence = prepareFence(reminderId, userId, expectedGeneration);
  if (!fence.ok) return fence.result;

  try {
    remindersStore.updateReminderStatus(reminder.id, 'missed', fence.guard);
  } catch (error) {
    const fenced = fenceFailure(error);
    if (fenced) return fenced;
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
