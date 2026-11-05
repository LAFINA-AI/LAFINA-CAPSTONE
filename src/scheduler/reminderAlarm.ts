import { NativeModules } from 'react-native';
import type { Reminder } from '../storage/remindersStore';
import { deliveryStore } from '../storage/deliveryStore';

export type NativeCallAction = 'call' | 'answer' | 'decline';

export interface NativeCallTrigger {
  reminderId: string;
  task: string;
  action: NativeCallAction;
  /** Delivery identity captured by the native alarm (absent from old builds). */
  ownerId?: string;
  generation?: number;
}

/** One live registration in the native delivery registry (no reminder text). */
export interface NativeDeliveryRegistration {
  reminderId: string;
  ownerId: string;
  generation: number;
  triggerAtMs: number;
  /** False when the registry entry exists but Android no longer holds the alarm. */
  armed: boolean;
}

/** Redacted native evidence: identifiers and an event code, never task text. */
export interface NativeDeliveryReceipt {
  atMs: number;
  event: string;
  reminderId: string;
  ownerId: string;
  generation: number;
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
  ownerId: string;
  generation: number;
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
  openNotificationSettings?: () => Promise<boolean>;
  listDeliveryRegistrations?: () => Promise<NativeDeliveryRegistration[]>;
  setDeliveryOwner?: (ownerId: string) => Promise<boolean>;
  drainDeliveryReceipts?: () => Promise<NativeDeliveryReceipt[]>;
}

const getNativeModule = (): LafinaReminderNativeModule | null => {
  const module = NativeModules.LafinaReminder as
    | LafinaReminderNativeModule
    | undefined;
  return module?.scheduleExactAlarm ? module : null;
};

/** Native delivery (Android AlarmManager) is the authoritative engine when present. */
export const isNativeReminderDeliveryAvailable = (): boolean =>
  getNativeModule() !== null;

/** Internal: the native module with the AGY-PORT 03 registry methods, if any. */
export const getNativeDeliveryModule = (): LafinaReminderNativeModule | null =>
  getNativeModule();

const errorCode = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.length > 0 ? code : 'native_rejected';
};

const recordReceipt = (
  reminderId: string,
  generation: number,
  outcome: 'registered' | 'failed',
  code: string | null,
): void => {
  if (generation < 1) return;
  try {
    deliveryStore.recordRegistration(reminderId, generation, outcome, code);
  } catch (error) {
    console.warn('[ReminderAlarm] Could not record registration receipt:', error);
  }
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

  // The registration carries the job's current identity. Without a job (a
  // caller that registers before inserting) generation 0 is sent; the next
  // reconcile replaces it with the real identity.
  let job = null;
  try {
    job = deliveryStore.get(reminderId);
  } catch (error) {
    console.warn('[ReminderAlarm] Delivery job unavailable:', error);
  }
  const ownerId = job?.userId ?? '';
  const generation = job?.generation ?? 0;

  let scheduled: boolean;
  try {
    scheduled = await module.scheduleExactAlarm({
      reminderId,
      task,
      triggerAtMs,
      ownerId,
      generation,
    });
  } catch (error) {
    recordReceipt(reminderId, generation, 'failed', errorCode(error));
    throw error;
  }
  if (!scheduled) {
    recordReceipt(reminderId, generation, 'failed', 'native_returned_false');
    throw new Error('Android rejected the exact reminder alarm.');
  }
  recordReceipt(reminderId, generation, 'registered', null);
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

export const openNotificationSettings = async (): Promise<void> => {
  const module = getNativeModule();
  if (!module?.openNotificationSettings) return;
  await module.openNotificationSettings();
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
