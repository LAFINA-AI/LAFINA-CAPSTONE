import type {Reminder} from '../storage/remindersStore';
import {remindersStore} from '../storage/remindersStore';
import {getOccurrences} from '../storage/rruleHelper';
import {DeliveryFenceError, deliveryStore} from '../storage/deliveryStore';
import type {DeliveryFenceReason} from '../storage/deliveryStore';
import {db} from '../storage/database';
import type {DatabaseTransaction} from '../storage/database';
import {isSameAlert, resolveReminderSource} from '../storage/sourceReminders';
import {deletePreCachedReminderAudio} from '../ai/tts/ttsService';
import {recordReminderInteraction} from '../ai/ml';
import {generateId} from '../utils';
import {getReminderPreferences} from './userPreferences';
import {
  cancelReminderAlarm,
  finishNativeIncomingCall,
  scheduleReminderAlarm,
} from './reminderAlarm';

export type ReminderActionOutcome =
  | 'snoozed'
  | 'acknowledged'
  | 'missed'
  | 'rejected';

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

const STALE_MESSAGE =
  'This reminder call is no longer current, so nothing was changed.';

const fenceRejection = (reason: DeliveryFenceReason): ReminderActionResult => ({
  ...rejection(STALE_MESSAGE),
  fenceReason: reason,
});

type FencePreparation =
  | {ok: true; guard: (tx: DatabaseTransaction) => void}
  | {ok: false; result: ReminderActionResult};

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
  const check = deliveryStore.checkFence(
    reminderId,
    userId,
    expectedGeneration,
  );
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
        console.warn(
          '[ReminderActions] Could not record rejected action:',
          error,
        );
      }
    }
    return {ok: false, result: fenceRejection(check.reason)};
  }
  return {
    ok: true,
    guard: tx =>
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
    return rejection(
      `You have reached the limit of ${preferences.maxSnoozeCount} snoozes.`,
    );
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
    console.warn(
      '[ReminderActions] Snoozed; alarm registration will be retried:',
      error,
    );
  }

  try {
    await finishNativeIncomingCall(reminder.id);
  } catch (error) {
    console.error('[ReminderActions] Snoozed, but call cleanup failed:', error);
  }

  // Non-blocking ML behavior tracking (Section 2.4.8)
  try {
    const latencySeconds = reminder.triggerAt
      ? Math.max(
          0,
          Math.round(
            (Date.now() - new Date(reminder.triggerAt).getTime()) / 1000,
          ),
        )
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
    ...(deliveryPending ? {deliveryPending: true} : {}),
  };
};

/** Retains AGY recurrence, including when ACK is committed through a Review card. */
export const createNextRecurringReminder = (
  reminder: Reminder,
  userId: string,
  tx?: DatabaseTransaction,
): {id: string; task: string; triggerAt: string} | null => {
  if (reminder.userId !== userId) return null;
  if (!tx)
    return db.transactionSync(inner =>
      createNextRecurringReminder(reminder, userId, inner),
    );
  const rule = /\[RRULE:([^\]]+)\]/
    .exec(reminder.description || '')?.[1]
    ?.trim();
  if (!rule) return null;
  const at = new Date(reminder.scheduledAt || reminder.triggerAt);
  if (!Number.isFinite(at.getTime())) return null;
  const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(at.getDate()).padStart(2, '0')}`;
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(
    at.getMinutes(),
  ).padStart(2, '0')}`;
  const nextDay = new Date(at);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);
  const until = new Date(nextDay);
  until.setDate(until.getDate() + 60);
  const nextDate = getOccurrences(date, rule, nextDay, until)[0];
  if (!nextDate) return null;
  const next = {
    id: generateId('rem'),
    task: reminder.task,
    triggerAt: new Date(`${nextDate}T${time}:00`).toISOString(),
  };
  const source = resolveReminderSource(tx, reminder);
  remindersStore.insertReminder(
    {
      id: next.id,
      userId,
      task: next.task,
      description: reminder.description,
      scheduledAt: next.triggerAt,
      triggerAt: next.triggerAt,
      status: 'pending',
      preCastAudioPath: null,
    },
    tx,
  );
  if (source) deliveryStore.linkSource(next.id, source.type, source.id, tx);
  return next;
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
    return rejection(
      'I could not acknowledge this reminder. Please try again.',
    );
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
      .filter(r => isSameAlert(db, reminder, r, source));

    for (const other of otherReminders) {
      try {
        remindersStore.acknowledgeReminder(other.id);
        await cancelReminderAlarm(other.id);
        await finishNativeIncomingCall(other.id);
        await deletePreCachedReminderAudio(other.preCastAudioPath);
      } catch (err) {
        console.warn(
          '[ReminderActions] Cleanup of duplicate reminder failed:',
          err,
        );
      }
    }
  } catch (err) {
    console.warn(
      '[ReminderActions] Error finding duplicate reminders to acknowledge:',
      err,
    );
  }

  // Use the same recurrence creation for call actions and reviewed commands.
  try {
    const next = createNextRecurringReminder(reminder, userId);
    if (next) await scheduleReminderAlarm(next.id, next.task, next.triggerAt);
  } catch (error) {
    console.warn(
      '[ReminderActions] Failed to schedule next recurring reminder:',
      error,
    );
  }

  // Non-blocking ML behavior tracking (Section 2.4.8)
  try {
    const latencySeconds = reminder.triggerAt
      ? Math.max(
          0,
          Math.round(
            (Date.now() - new Date(reminder.triggerAt).getTime()) / 1000,
          ),
        )
      : 0;
    recordReminderInteraction(userId, {
      reminderId: reminder.id,
      outcome: 'acknowledged',
      latencySeconds,
      channel: 'call',
    });
  } catch (err) {
    console.warn(
      '[ReminderActions] Failed to record acknowledge interaction:',
      err,
    );
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
    console.error(
      '[ReminderActions] Marked missed, but cleanup failed:',
      error,
    );
  }

  // Non-blocking ML behavior tracking (Section 2.4.8)
  try {
    const latencySeconds = reminder.triggerAt
      ? Math.max(
          0,
          Math.round(
            (Date.now() - new Date(reminder.triggerAt).getTime()) / 1000,
          ),
        )
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
