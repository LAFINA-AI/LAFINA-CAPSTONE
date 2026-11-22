import {db} from './database';
import type {DatabaseTransaction} from './database';
import {GUEST_USER_ID} from '../constants';

export const ALERT_PREFERENCES_KEY = 'alert_preferences_v1';
export const DEFAULT_CALLER_SUBTITLE = 'Your academic secretary is calling';
export const MAX_CALLER_SUBTITLE_LENGTH = 48;
export const MAX_TONE_URI_LENGTH = 512;

export type VibrationPattern = 'off' | 'gentle' | 'standard' | 'urgent';
export type LockScreenPrivacy = 'show' | 'hide_task';
export type CallAnswerMode = 'auto_online' | 'offline_voice' | 'buttons_only';
export type CallGreetingStyle = 'friendly' | 'concise' | 'urgent';
export type AlarmVolumeRampSec = 0 | 15 | 30 | 60;
export type NotificationSnoozeMinutes = 5 | 10 | 15 | 30;
export type CallRingTimeoutSec = 30 | 45 | 60;

export interface AlertPreferences {
  version: 1;
  revision: number;
  // Alarms
  defaultAlarmSoundUri: string | null;
  defaultAlarmSoundTitle: string | null;
  alarmVibrationPattern: VibrationPattern;
  alarmVolumeRampSec: AlarmVolumeRampSec;
  // Notifications
  defaultReminderDeliveryStyle: 'call' | 'notify';
  notificationSoundUri: string | null;
  notificationSoundTitle: string | null;
  notificationVibrate: boolean;
  notificationVibrationPattern: VibrationPattern;
  notificationSnoozeMinutes: NotificationSnoozeMinutes;
  lockScreenPrivacy: LockScreenPrivacy;
  quietHoursDowngradeToNotify: boolean;
  // AI Reminder Calls
  callRingtoneUri: string | null;
  callRingtoneTitle: string | null;
  callVibrate: boolean;
  callVibrationPattern: VibrationPattern;
  callRingTimeoutSec: CallRingTimeoutSec;
  callAnswerMode: CallAnswerMode;
  callGreetingStyle: CallGreetingStyle;
  callCallerSubtitle: string;
  callSnoozeMinutesOverride: number | null;
  callMaxAutoSnoozesOverride: number | null;
  updatedAt: string;
}

export type AlertPreferencesPatch = Partial<
  Omit<AlertPreferences, 'version' | 'revision' | 'updatedAt'>
>;

export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  version: 1,
  revision: 0,
  defaultAlarmSoundUri: null,
  defaultAlarmSoundTitle: null,
  alarmVibrationPattern: 'standard',
  alarmVolumeRampSec: 30,
  defaultReminderDeliveryStyle: 'call',
  notificationSoundUri: null,
  notificationSoundTitle: null,
  notificationVibrate: true,
  notificationVibrationPattern: 'standard',
  notificationSnoozeMinutes: 10,
  lockScreenPrivacy: 'hide_task',
  quietHoursDowngradeToNotify: false,
  callRingtoneUri: null,
  callRingtoneTitle: null,
  callVibrate: true,
  callVibrationPattern: 'standard',
  callRingTimeoutSec: 45,
  callAnswerMode: 'auto_online',
  callGreetingStyle: 'friendly',
  callCallerSubtitle: DEFAULT_CALLER_SUBTITLE,
  callSnoozeMinutesOverride: null,
  callMaxAutoSnoozesOverride: null,
  updatedAt: new Date(0).toISOString(),
};

const VALID_PATTERNS: ReadonlySet<string> = new Set([
  'off',
  'gentle',
  'standard',
  'urgent',
]);
const VALID_RAMP_SEC: ReadonlySet<number> = new Set([0, 15, 30, 60]);
const VALID_NOTIFY_SNOOZE: ReadonlySet<number> = new Set([5, 10, 15, 30]);
const VALID_RING_TIMEOUT: ReadonlySet<number> = new Set([30, 45, 60]);
const VALID_ANSWER_MODES: ReadonlySet<string> = new Set([
  'auto_online',
  'offline_voice',
  'buttons_only',
]);
const VALID_GREETING_STYLES: ReadonlySet<string> = new Set([
  'friendly',
  'concise',
  'urgent',
]);

const hasControlChars = (value: string): boolean => {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
};

export const sanitizeToneUri = (
  raw: unknown,
  allowSilent: boolean,
): string | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_TONE_URI_LENGTH) return null;
  if (hasControlChars(trimmed)) return null;
  if (trimmed === 'silent') return allowSilent ? 'silent' : null;
  if (
    trimmed.startsWith('android.resource://') ||
    trimmed.startsWith('content://')
  ) {
    return trimmed;
  }
  return null;
};

const sanitizeToneTitle = (
  raw: unknown,
  cleanUri: string | null,
): string | null => {
  if (cleanUri === null) return null;
  if (cleanUri === 'silent') return 'Silent';
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 80);
};

const sanitizePattern = (raw: unknown): VibrationPattern =>
  typeof raw === 'string' && VALID_PATTERNS.has(raw)
    ? (raw as VibrationPattern)
    : 'standard';

const sanitizeRamp = (raw: unknown): AlarmVolumeRampSec =>
  typeof raw === 'number' && VALID_RAMP_SEC.has(raw)
    ? (raw as AlarmVolumeRampSec)
    : 30;

const sanitizeNotifySnooze = (raw: unknown): NotificationSnoozeMinutes =>
  typeof raw === 'number' && VALID_NOTIFY_SNOOZE.has(raw)
    ? (raw as NotificationSnoozeMinutes)
    : 10;

const sanitizeRingTimeout = (raw: unknown): CallRingTimeoutSec =>
  typeof raw === 'number' && VALID_RING_TIMEOUT.has(raw)
    ? (raw as CallRingTimeoutSec)
    : 45;

const sanitizePrivacy = (raw: unknown): LockScreenPrivacy =>
  raw === 'show' ? 'show' : 'hide_task';

const sanitizeDeliveryStyle = (raw: unknown): 'call' | 'notify' =>
  raw === 'notify' ? 'notify' : 'call';

const sanitizeAnswerMode = (raw: unknown): CallAnswerMode =>
  typeof raw === 'string' && VALID_ANSWER_MODES.has(raw)
    ? (raw as CallAnswerMode)
    : 'auto_online';

const sanitizeGreetingStyle = (raw: unknown): CallGreetingStyle =>
  typeof raw === 'string' && VALID_GREETING_STYLES.has(raw)
    ? (raw as CallGreetingStyle)
    : 'friendly';

const sanitizeSubtitle = (raw: unknown): string => {
  if (typeof raw !== 'string') return DEFAULT_CALLER_SUBTITLE;
  const trimmed = raw.trim().slice(0, MAX_CALLER_SUBTITLE_LENGTH);
  return trimmed || DEFAULT_CALLER_SUBTITLE;
};

const sanitizeSnoozeOverride = (raw: unknown): number | null => {
  if (raw == null) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  return Math.max(1, Math.min(60, rounded));
};

const sanitizeMaxAutoSnoozesOverride = (raw: unknown): number | null => {
  if (raw == null) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  return Math.max(0, Math.min(10, rounded));
};

const normalizePreferences = (
  input: Partial<AlertPreferences> | null | undefined,
): AlertPreferences => {
  const defaultAlarmSoundUri = sanitizeToneUri(
    input?.defaultAlarmSoundUri,
    false,
  );
  const notificationSoundUri = sanitizeToneUri(
    input?.notificationSoundUri,
    true,
  );
  const callRingtoneUri = sanitizeToneUri(input?.callRingtoneUri, true);
  const revision =
    typeof input?.revision === 'number' &&
    Number.isSafeInteger(input.revision) &&
    input.revision >= 0
      ? input.revision
      : 0;
  const updatedAt =
    typeof input?.updatedAt === 'string' &&
    Number.isFinite(Date.parse(input.updatedAt))
      ? input.updatedAt
      : DEFAULT_ALERT_PREFERENCES.updatedAt;

  return {
    version: 1,
    revision,
    defaultAlarmSoundUri,
    defaultAlarmSoundTitle: sanitizeToneTitle(
      input?.defaultAlarmSoundTitle,
      defaultAlarmSoundUri,
    ),
    alarmVibrationPattern: sanitizePattern(input?.alarmVibrationPattern),
    alarmVolumeRampSec: sanitizeRamp(input?.alarmVolumeRampSec),
    defaultReminderDeliveryStyle: sanitizeDeliveryStyle(
      input?.defaultReminderDeliveryStyle,
    ),
    notificationSoundUri,
    notificationSoundTitle: sanitizeToneTitle(
      input?.notificationSoundTitle,
      notificationSoundUri,
    ),
    notificationVibrate:
      typeof input?.notificationVibrate === 'boolean'
        ? input.notificationVibrate
        : DEFAULT_ALERT_PREFERENCES.notificationVibrate,
    notificationVibrationPattern: sanitizePattern(
      input?.notificationVibrationPattern,
    ),
    notificationSnoozeMinutes: sanitizeNotifySnooze(
      input?.notificationSnoozeMinutes,
    ),
    lockScreenPrivacy: sanitizePrivacy(input?.lockScreenPrivacy),
    quietHoursDowngradeToNotify:
      typeof input?.quietHoursDowngradeToNotify === 'boolean'
        ? input.quietHoursDowngradeToNotify
        : DEFAULT_ALERT_PREFERENCES.quietHoursDowngradeToNotify,
    callRingtoneUri,
    callRingtoneTitle: sanitizeToneTitle(
      input?.callRingtoneTitle,
      callRingtoneUri,
    ),
    callVibrate:
      typeof input?.callVibrate === 'boolean'
        ? input.callVibrate
        : DEFAULT_ALERT_PREFERENCES.callVibrate,
    callVibrationPattern: sanitizePattern(input?.callVibrationPattern),
    callRingTimeoutSec: sanitizeRingTimeout(input?.callRingTimeoutSec),
    callAnswerMode: sanitizeAnswerMode(input?.callAnswerMode),
    callGreetingStyle: sanitizeGreetingStyle(input?.callGreetingStyle),
    callCallerSubtitle: sanitizeSubtitle(input?.callCallerSubtitle),
    callSnoozeMinutesOverride: sanitizeSnoozeOverride(
      input?.callSnoozeMinutesOverride,
    ),
    callMaxAutoSnoozesOverride: sanitizeMaxAutoSnoozesOverride(
      input?.callMaxAutoSnoozesOverride,
    ),
    updatedAt,
  };
};

type Listener = (userId: string, prefs: AlertPreferences) => void;
const listeners = new Set<Listener>();

export const onAlertPreferencesChanged = (
  listener: Listener,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const emitChanged = (userId: string, prefs: AlertPreferences): void => {
  for (const listener of Array.from(listeners)) {
    listener(userId, prefs);
  }
};

type Executor = Pick<DatabaseTransaction, 'executeSync'>;

const read = (userId: string, executor: Executor = db): AlertPreferences => {
  if (!userId || userId.length > 256) {
    return {...DEFAULT_ALERT_PREFERENCES};
  }
  try {
    const raw = executor.executeSync(
      'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
      [userId, ALERT_PREFERENCES_KEY],
    ).rows?.[0]?.value;
    if (typeof raw !== 'string') return {...DEFAULT_ALERT_PREFERENCES};
    const parsed = JSON.parse(raw) as Partial<AlertPreferences>;
    return normalizePreferences(parsed);
  } catch (error) {
    console.warn('[AlertPreferences] Could not read preferences:', error);
    return {...DEFAULT_ALERT_PREFERENCES};
  }
};

export const alertPreferencesStore = {
  read,

  save: (userId: string, patch: AlertPreferencesPatch): AlertPreferences => {
    if (!userId || userId.length > 256) {
      throw new Error('Alert preferences owner required.');
    }
    const saved = db.transactionSync(tx => {
      const before = read(userId, tx);
      const merged = normalizePreferences({
        ...before,
        ...patch,
        revision: before.revision + 1,
        updatedAt: new Date().toISOString(),
      });
      tx.executeSync(
        `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [userId, ALERT_PREFERENCES_KEY, JSON.stringify(merged), merged.updatedAt],
      );
      return merged;
    });
    emitChanged(userId, saved);
    return saved;
  },

  reset: (userId: string): AlertPreferences => {
    if (!userId || userId.length > 256) {
      throw new Error('Alert preferences owner required.');
    }
    const saved = db.transactionSync(tx => {
      const before = read(userId, tx);
      const next: AlertPreferences = {
        ...DEFAULT_ALERT_PREFERENCES,
        revision: before.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      tx.executeSync(
        `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [userId, ALERT_PREFERENCES_KEY, JSON.stringify(next), next.updatedAt],
      );
      return next;
    });
    emitChanged(userId, saved);
    return saved;
  },

  /**
   * Guest link (inside the link transaction): an account that already has a
   * choice on this device keeps it; otherwise the guest's moves to it.
   */
  transferFromGuest: (
    tx: DatabaseTransaction,
    cloudUserId: string,
    now: string,
  ): void => {
    if (cloudUserId === GUEST_USER_ID) return;
    const raw = tx.executeSync(
      'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
      [GUEST_USER_ID, ALERT_PREFERENCES_KEY],
    ).rows?.[0]?.value;
    if (raw == null) return;
    tx.executeSync(
      'INSERT OR IGNORE INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
      [cloudUserId, ALERT_PREFERENCES_KEY, String(raw), now],
    );
    const resetGuest: AlertPreferences = {
      ...DEFAULT_ALERT_PREFERENCES,
      revision: read(GUEST_USER_ID, tx).revision + 1,
      updatedAt: now,
    };
    tx.executeSync(
      'UPDATE local_settings SET value = ?, updated_at = ? WHERE user_id = ? AND key = ?',
      [JSON.stringify(resetGuest), now, GUEST_USER_ID, ALERT_PREFERENCES_KEY],
    );
  },
};
