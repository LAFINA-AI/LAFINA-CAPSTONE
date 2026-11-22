import {reminderDeliveryStyleStore} from '../storage/reminderDeliveryStyleStore';
import type {ReminderDeliveryStyle} from '../storage/reminderDeliveryStyleStore';
import {alertPreferencesStore} from '../storage/alertPreferencesStore';
import {preferencesStore} from '../storage/preferencesStore';
import {isWithinQuietHours} from './alertPreferencesSync';

/**
 * Resolves how a reminder should be delivered:
 * 1. Explicit per-reminder override in `reminder_delivery_styles` wins.
 * 2. Otherwise user's device-local `defaultReminderDeliveryStyle` ('call' | 'notify').
 * 3. Otherwise if `quietHoursDowngradeToNotify` is enabled and `triggerAtMs`
 *    falls inside the student's sleep-time window, downgrade to 'notify'.
 */
export const resolveReminderDeliveryStyle = (
  reminderId: string,
  userId?: string,
  triggerAtMs?: number,
): ReminderDeliveryStyle => {
  const explicit = reminderDeliveryStyleStore.getExplicit(reminderId);
  if (explicit) return explicit;
  if (!userId) return 'call';

  const alertPrefs = alertPreferencesStore.read(userId);
  if (alertPrefs.defaultReminderDeliveryStyle === 'notify') return 'notify';

  if (alertPrefs.quietHoursDowngradeToNotify && triggerAtMs != null) {
    const userPrefs = preferencesStore.get(userId);
    if (
      isWithinQuietHours(triggerAtMs, userPrefs.sleepTime, userPrefs.wakeTime)
    ) {
      return 'notify';
    }
  }
  return 'call';
};
