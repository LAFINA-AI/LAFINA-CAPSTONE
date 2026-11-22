import {NativeModules, Platform} from 'react-native';
import {alertPreferencesStore} from '../storage/alertPreferencesStore';
import type {AlertPreferences} from '../storage/alertPreferencesStore';

interface NativeAlertPreferencesPayload {
  defaultAlarmSoundUri: string | null;
  alarmVibrationPattern: string;
  alarmVolumeRampSec: number;
  notificationSoundUri: string | null;
  notificationVibrate: boolean;
  notificationVibrationPattern: string;
  notificationSnoozeMinutes: number;
  lockScreenPrivacy: string;
  callRingtoneUri: string | null;
  callVibrate: boolean;
  callVibrationPattern: string;
  callRingTimeoutSec: number;
}

const parseHHMM = (hhmm: string): number | null => {
  const parts = hhmm.trim().split(':');
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (
    !Number.isInteger(h) ||
    !Number.isInteger(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    return null;
  }
  return h * 60 + m;
};

/**
 * True when [triggerAtMs]'s local wall-clock time falls in [sleepHHMM, wakeHHMM),
 * handling overnight wrap (e.g. 23:00..07:00) and same-day windows (01:00..06:00).
 */
export const isWithinQuietHours = (
  triggerAtMs: number,
  sleepHHMM: string,
  wakeHHMM: string,
): boolean => {
  if (!Number.isFinite(triggerAtMs)) return false;
  const start = parseHHMM(sleepHHMM);
  const end = parseHHMM(wakeHHMM);
  if (start === null || end === null || start === end) return false;
  const d = new Date(triggerAtMs);
  const current = d.getHours() * 60 + d.getMinutes();
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
};

export const buildNativeAlertPayload = (
  prefs: AlertPreferences,
): NativeAlertPreferencesPayload => ({
  defaultAlarmSoundUri: prefs.defaultAlarmSoundUri,
  alarmVibrationPattern: prefs.alarmVibrationPattern,
  alarmVolumeRampSec: prefs.alarmVolumeRampSec,
  notificationSoundUri: prefs.notificationSoundUri,
  notificationVibrate: prefs.notificationVibrate,
  notificationVibrationPattern: prefs.notificationVibrationPattern,
  notificationSnoozeMinutes: prefs.notificationSnoozeMinutes,
  lockScreenPrivacy: prefs.lockScreenPrivacy,
  callRingtoneUri: prefs.callRingtoneUri,
  callVibrate: prefs.callVibrate,
  callVibrationPattern: prefs.callVibrationPattern,
  callRingTimeoutSec: prefs.callRingTimeoutSec,
});

export const syncAlertPreferencesToNative = async (
  userId: string,
): Promise<void> => {
  if (!userId || Platform.OS !== 'android') return;
  const prefs = alertPreferencesStore.read(userId);
  const payload = buildNativeAlertPayload(prefs);

  const reminderModule = NativeModules.LafinaReminder as
    | {setAlertPreferences?: (opts: NativeAlertPreferencesPayload) => Promise<boolean>}
    | undefined;
  if (reminderModule?.setAlertPreferences) {
    await reminderModule.setAlertPreferences(payload).catch(() => undefined);
  }

  const alarmModule = NativeModules.LafinaAlarm as
    | {
        setAlarmAudioPreferences?: (opts: {
          defaultAlarmSoundUri: string | null;
          alarmVibrationPattern: string;
          alarmVolumeRampSec: number;
        }) => Promise<boolean>;
      }
    | undefined;
  if (alarmModule?.setAlarmAudioPreferences) {
    await alarmModule
      .setAlarmAudioPreferences({
        defaultAlarmSoundUri: payload.defaultAlarmSoundUri,
        alarmVibrationPattern: payload.alarmVibrationPattern,
        alarmVolumeRampSec: payload.alarmVolumeRampSec,
      })
      .catch(() => undefined);
  }
};
