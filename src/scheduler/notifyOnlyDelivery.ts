import {Alert} from 'react-native';
import {reminderDeliveryStyleStore} from '../storage/reminderDeliveryStyleStore';
import {
  acknowledgeReminderAction,
  snoozeReminderAction,
} from './reminderActions';
import type {ReminderActionResult} from './reminderActions';
import {finishNativeIncomingCall} from './reminderAlarm';
import type {NativeCallAction} from './reminderAlarm';

/**
 * "Notify only" reminders (agent audit finding 16). The native engine posts an
 * ordinary notification instead of a call; its Acknowledge and Snooze buttons
 * arrive here as call actions and are applied without the call screen, through
 * the same identity fence as the call's own buttons. Acknowledged means the
 * student received the reminder, not that the task is done.
 */
export const NOTIFY_SNOOZE_MINUTES = 10;

export type NotificationAction = Extract<
  NativeCallAction,
  'acknowledge' | 'snooze'
>;

export const isNotificationAction = (
  action: NativeCallAction | undefined,
): action is NotificationAction =>
  action === 'acknowledge' || action === 'snooze';

export const isNotifyOnlyReminder = (reminderId: string): boolean =>
  reminderDeliveryStyleStore.get(reminderId) === 'notify';

export const applyNotificationAction = async (
  reminderId: string,
  userId: string,
  action: NotificationAction,
  generation: number | null,
): Promise<ReminderActionResult> => {
  const result =
    action === 'snooze'
      ? await snoozeReminderAction(
          reminderId,
          userId,
          NOTIFY_SNOOZE_MINUTES,
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
  Alert.alert(
    'LAFINA Reminder',
    task || 'Scheduled academic reminder',
    [
      {
        text: `Snooze ${NOTIFY_SNOOZE_MINUTES} min`,
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
