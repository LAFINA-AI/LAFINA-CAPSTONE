import {remindersStore} from '../storage/remindersStore';
import type {Reminder} from '../storage/remindersStore';
import {deliveryStore} from '../storage/deliveryStore';
import {db} from '../storage/database';
import {alertSuppression} from '../storage/sourceReminders';
import {cancelReminderAlarm, finishNativeIncomingCall} from './reminderAlarm';
import type {NativeCallAction} from './reminderAlarm';

/** A call request from the native alarm, an activity intent or the JS fallback. */
export interface CallRequest {
  reminderId: string;
  task?: string;
  action?: NativeCallAction;
  ownerId?: string | null;
  generation?: number | null;
}

export type CallRejection =
  | 'no_active_owner'
  | 'missing'
  | 'owner_mismatch'
  | 'stale_generation'
  | 'not_actionable'
  | 'task_completed'
  | 'already_acknowledged';

export type CallAdmission =
  | {
      admitted: true;
      reminder: Reminder;
      task: string;
      action: NativeCallAction;
      /** Generation the UI captures and passes to every call action. */
      generation: number | null;
    }
  | {admitted: false; reason: CallRejection};

const recordRejection = (
  reminderId: string,
  userId: string,
  generation: number,
  reason: CallRejection,
): void => {
  try {
    deliveryStore.recordEvent({
      reminderId,
      userId,
      generation,
      event: 'call_rejected',
      code: reason,
    });
  } catch {
    // Evidence only; never blocks call handling.
  }
};

/**
 * One admission path for every incoming call (native alarm event, cold-start
 * pending call, resume, JS fallback). It enforces the active owner and the
 * captured delivery identity before any UI or speech starts, and keeps AGY's
 * existing suppression rules (acknowledged/missed, completed task, already
 * acknowledged title). Rejected calls dismiss only their own native artifacts;
 * an alarm is cancelled only when no newer generation could own it.
 */
export const admitReminderCall = (
  request: CallRequest,
  activeUserId: string | null,
): CallAdmission => {
  const reminderId = request.reminderId;
  const captured =
    typeof request.generation === 'number' &&
    Number.isSafeInteger(request.generation)
      ? request.generation
      : null;
  const reject = (
    reason: CallRejection,
    options: {cancelAlarm?: boolean; userId?: string} = {},
  ): CallAdmission => {
    void finishNativeIncomingCall(reminderId).catch(() => undefined);
    if (options.cancelAlarm) {
      void cancelReminderAlarm(reminderId).catch(() => undefined);
    }
    if (options.userId) {
      recordRejection(reminderId, options.userId, captured ?? -1, reason);
    }
    return {admitted: false, reason};
  };

  if (!activeUserId) return reject('no_active_owner');
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder) return reject('missing');
  if (reminder.userId !== activeUserId) {
    return reject('owner_mismatch', {userId: reminder.userId});
  }
  if (request.ownerId && request.ownerId !== activeUserId) {
    return reject('owner_mismatch', {userId: reminder.userId});
  }

  const fence = deliveryStore.checkFence(reminderId, activeUserId, captured);
  if (!fence.ok) {
    return reject(fence.reason, {
      userId: reminder.userId,
      cancelAlarm: fence.reason === 'not_actionable',
    });
  }

  if (reminder.status === 'acknowledged' || reminder.status === 'missed') {
    return reject('not_actionable', {
      userId: reminder.userId,
      cancelAlarm: true,
    });
  }

  // Suppression needs the reminder's own item (exact link or strict evidence)
  // or an exact duplicate; a completed task or acknowledged reminder that only
  // shares the title never silences this call.
  const suppression = alertSuppression(db, reminder);
  if (suppression) {
    remindersStore.acknowledgeReminder(reminder.id);
    return reject(suppression, {
      userId: reminder.userId,
      cancelAlarm: true,
    });
  }

  const generation =
    captured !== null && captured > 0
      ? captured
      : fence.job?.generation ?? null;
  try {
    deliveryStore.recordEvent({
      reminderId,
      userId: activeUserId,
      generation: generation ?? -1,
      event: 'call_admitted',
      code: request.action ?? 'call',
    });
  } catch {
    // Evidence only.
  }
  return {
    admitted: true,
    reminder,
    task: request.task || reminder.task,
    action: request.action ?? 'call',
    generation,
  };
};
