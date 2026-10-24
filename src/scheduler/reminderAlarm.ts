import { NativeModules } from 'react-native';
import type { Reminder } from '../storage/remindersStore';

export type NativeCallAction = 'call' | 'answer' | 'decline';

export interface NativeCallTrigger {
  reminderId: string;
  task: string;
  action: NativeCallAction;
}

export interface ReminderPermissionStatus {
  canScheduleExactAlarms: boolean;
  canUseFullScreenIntent: boolean;
  notificationsEnabled: boolean;
}

interface ScheduleAlarmOptions {
  reminderId: string;
  task: string;
  triggerAtMs: number;
}

interface LafinaReminderNativeModule {
  scheduleExactAlarm: (options: ScheduleAlarmOptions) => Promise<boolean>;
  cancelAlarm: (reminderId: string) => Promise<boolean>;
  consumePendingCall: () => Promise<NativeCallTrigger | null>;
  finishIncomingCall: (reminderId: string) => Promise<boolean>;
  startActiveCall?: (task: string) => Promise<boolean>;
  stopActiveCall?: () => Promise<boolean>;
  getPermissionStatus: () => Promise<ReminderPermissionStatus>;
  openExactAlarmSettings: () => Promise<boolean>;
  openFullScreenIntentSettings: () => Promise<boolean>;
}

const getNativeModule = (): LafinaReminderNativeModule | null => {
  const module = NativeModules.LafinaReminder as
    | LafinaReminderNativeModule
    | undefined;
  return module?.scheduleExactAlarm ? module : null;
};

export const scheduleReminderAlarm = async (
  reminderId: string,
  task: string,
  triggerAt: string,
): Promise<void> => {
  const module = getNativeModule();
  if (!module) {
    throw new Error('Native reminder module is unavailable.');
  }

  const triggerAtMs = new Date(triggerAt).getTime();
  if (!Number.isFinite(triggerAtMs) || triggerAtMs <= Date.now()) {
    throw new Error('Reminder trigger must be a valid future time.');
  }

  const scheduled = await module.scheduleExactAlarm({
    reminderId,
    task,
    triggerAtMs,
  });
  if (!scheduled) {
    throw new Error('Android rejected the exact reminder alarm.');
  }
};

export const cancelReminderAlarm = async (
  reminderId: string,
): Promise<void> => {
  const module = getNativeModule();
  if (!module) return;
  await module.cancelAlarm(reminderId);
};

export const finishNativeIncomingCall = async (
  reminderId: string,
): Promise<void> => {
  const module = getNativeModule();
  if (!module) return;
  await module.finishIncomingCall(reminderId);
};

export const startActiveCallSession = async (task: string): Promise<void> => {
  const module = getNativeModule();
  if (!module?.startActiveCall) return;
  await module.startActiveCall(task);
};

export const stopActiveCallSession = async (): Promise<void> => {
  const module = getNativeModule();
  if (!module?.stopActiveCall) return;
  await module.stopActiveCall();
};

export const consumePendingNativeCall =
  async (): Promise<NativeCallTrigger | null> => {
    const module = getNativeModule();
    if (!module?.consumePendingCall) return null;
    return module.consumePendingCall();
  };

export const getReminderPermissionStatus =
  async (): Promise<ReminderPermissionStatus | null> => {
    const module = getNativeModule();
    if (!module?.getPermissionStatus) return null;
    return module.getPermissionStatus();
  };

export const openExactAlarmSettings = async (): Promise<void> => {
  const module = getNativeModule();
  if (!module?.openExactAlarmSettings) return;
  await module.openExactAlarmSettings();
};

export const openFullScreenIntentSettings = async (): Promise<void> => {
  const module = getNativeModule();
  if (!module?.openFullScreenIntentSettings) return;
  await module.openFullScreenIntentSettings();
};

export const reconcileReminderAlarms = async (
  reminders: Reminder[],
): Promise<void> => {
  const futureReminders = reminders.filter(
    (reminder) =>
      (reminder.status === 'pending' || reminder.status === 'snoozed') &&
      new Date(reminder.triggerAt).getTime() > Date.now(),
  );

  for (const reminder of futureReminders) {
    try {
      await scheduleReminderAlarm(
        reminder.id,
        reminder.task,
        reminder.triggerAt,
      );
    } catch (error) {
      console.error(
        '[ReminderAlarm] Failed to reconcile alarm:',
        reminder.id,
        error,
      );
    }
  }
};
