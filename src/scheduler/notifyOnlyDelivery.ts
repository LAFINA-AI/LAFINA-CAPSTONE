import {Alert} from 'react-native';
import {alertPreferencesStore} from '../storage/alertPreferencesStore';
import {
  acknowledgeReminderAction,
  snoozeReminderAction,
} from './reminderActions';
import type {ReminderActionResult} from './reminderActions';
import {finishNativeIncomingCall} from './reminderAlarm';
import type {NativeCallAction} from './reminderAlarm';
import {resolveReminderDeliveryStyle} from './reminderDeliveryPolicy';

/**
 * "Notify only" reminders (agent audit finding 16). The native engine posts an
 * ordinary notification instead of a call; its Acknowledge and Snooze buttons
 * arrive here as call actions and are applied without the call screen, through
 * the same identity fence as the call's own buttons. Acknowledged means the
 * student received the reminder, not that the task is done.
 */
export const NOTIFY_SNOOZE_MINUTES = 10;

export const getNotifySnoozeMinutes = (userId: string): number =>
  alertPreferencesStore.read(userId).notificationSnoozeMinutes;

export type NotificationAction = Extract<
  NativeCallAction,
  'acknowledge' | 'snooze'
>;

export const isNotificationAction = (
  action: NativeCallAction | undefined,
): action is NotificationAction =>
  action === 'acknowledge' || action === 'snooze';

export const isNotifyOnlyReminder = (
  reminderId: string,
  userId?: string,
  triggerAtMs?: number,
): boolean =>
  resolveReminderDeliveryStyle(reminderId, userId, triggerAtMs) === 'notify';

export const applyNotificationAction = async (
  reminderId: string,
  userId: string,
  action: NotificationAction,
  generation: number | null,
): Promise<ReminderActionResult> => {
  const snoozeMinutes = getNotifySnoozeMinutes(userId);
  const result =
    action === 'snooze'
      ? await snoozeReminderAction(
          reminderId,
          userId,
          snoozeMinutes,
          generation,
        )
      : await acknowledgeReminderAction(reminderId, userId, generation);
  // The notification goes either way: a refused action is stale.
  await finishNativeIncomingCall(reminderId).catch(() => undefined);
  return result;
};

/**
 * The in-app fallback for a notify-only reminder (no native engine, or the
 * native registration failed): a plain alert instead of the call screen.
 * Dismissing it leaves the reminder as it is.
 */
export const showNotifyOnlyReminderAlert = (
  reminderId: string,
  userId: string,
  task: string,
  generation: number | null,
): void => {
  const snoozeMinutes = getNotifySnoozeMinutes(userId);
  Alert.alert(
    'LAFINA Reminder',
    task || 'Scheduled academic reminder',
    [
      {
        text: `Snooze ${snoozeMinutes} min`,
        onPress: () =>
          void applyNotificationAction(reminderId, userId, 'snooze', generation),
      },
      {
        text: 'Acknowledge',
        onPress: () =>
          void applyNotificationAction(
            reminderId,
            userId,
            'acknowledge',
            generation,
          ),
      },
    ],
    {cancelable: true},
  );
};
