import {reminderHealthStore} from '../storage/reminderHealthStore';
import type {LocalReminderHealth} from '../storage/reminderHealthStore';
import {getReminderPermissionStatus} from './reminderAlarm';
import type {ReminderPermissionStatus} from './reminderAlarm';
import {reconcileReminderDelivery} from './deliveryReconciler';

/**
 * AGY-PORT 09: reminder health keeps two kinds of fact apart.
 *
 * - Android access (notifications, exact alarms, full-screen calls): what the
 *   system currently permits. It does not prove any reminder rang.
 * - Local delivery evidence: what this device recorded for the owner's
 *   reminders. A registration means Android accepted an alarm, not that it rang.
 *
 * Either part is null when it could not be read; nothing is guessed.
 */
export interface ReminderHealthSnapshot {
  userId: string;
  permissions: ReminderPermissionStatus | null;
  local: LocalReminderHealth | null;
  checkedAt: string;
}

export const PERMISSION_READ_TIMEOUT_MS = 3000;
export const RECOVERY_TIMEOUT_MS = 10000;

class HealthTimeoutError extends Error {
  constructor() {
    super('Reminder health request timed out.');
    this.name = 'HealthTimeoutError';
  }
}

const bounded = <T>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new HealthTimeoutError()), ms);
    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

const isPermissionStatus = (value: unknown): value is ReminderPermissionStatus => {
  if (!value || typeof value !== 'object') return false;
  const status = value as Record<string, unknown>;
  return ['notificationsEnabled', 'canScheduleExactAlarms', 'canUseFullScreenIntent'].every(
    key => typeof status[key] === 'boolean',
  );
};

export const readReminderHealth = async (
  userId: string,
): Promise<ReminderHealthSnapshot> => {
  let local: LocalReminderHealth | null = null;
  let permissions: ReminderPermissionStatus | null = null;
  try {
    local = reminderHealthStore.read(userId);
  } catch (error) {
    console.warn('[ReminderHealth] Local delivery evidence unavailable:', error);
  }
  try {
    const value = await bounded(getReminderPermissionStatus(), PERMISSION_READ_TIMEOUT_MS);
    if (isPermissionStatus(value)) permissions = value;
  } catch (error) {
    console.warn('[ReminderHealth] Android access unavailable:', error);
  }
  return {userId, permissions, local, checkedAt: new Date().toISOString()};
};

export interface ReminderRecoveryResult {
  ok: boolean;
  message: string;
}

const UNAVAILABLE = 'Retry is unavailable for this account or app build.';

/**
 * Asks the existing delivery reconciler to register this owner's armed
 * reminders again. Only for the signed-in owner: a pass for any other account
 * would cancel the signed-in account's alarms. Success means registration was
 * requested and Android answered; it never means a reminder rang.
 */
export const recoverReminderHealth = async (
  userId: string,
): Promise<ReminderRecoveryResult> => {
  try {
    if (!reminderHealthStore.isActive(userId, true)) {
      return {ok: false, message: UNAVAILABLE};
    }
    const summary = await bounded(reconcileReminderDelivery(userId), RECOVERY_TIMEOUT_MS);
    if (!reminderHealthStore.isActive(userId, true)) {
      return {ok: false, message: 'Account changed. Reopen reminder health.'};
    }
    if (!summary.nativeAvailable) {
      return {ok: false, message: 'Reminder alarms are not available in this app build.'};
    }
    if (summary.error) {
      return {
        ok: false,
        message: 'Retry could not complete. Check Android access, then retry.',
      };
    }
    const failed = summary.failed > 0 ? ` ${summary.failed} could not be registered.` : '';
    return {
      ok: summary.failed === 0,
      message:
        `Registration requested: ${summary.registered} registered, ${summary.kept} already in place.` +
        `${failed} This does not confirm that any reminder will ring.`,
    };
  } catch (error) {
    if (error instanceof HealthTimeoutError) {
      return {
        ok: false,
        message: 'Still working. Refresh in a moment to see the result.',
      };
    }
    console.warn('[ReminderHealth] Retry failed:', error);
    return {ok: false, message: 'Retry could not complete. Check Android access, then retry.'};
  }
};
