export type ThemePreference = 'system' | 'light' | 'dark';
export type ReplyMode = 'text' | 'voice' | 'both';

/** Local settings only; this is not an account or a remotely registered identity. */
export interface Preferences {
  schemaVersion: 1;
  nickname: string;
  timezone: string;
  theme: ThemePreference;
  replyMode: ReplyMode;
  leadMinutes: number;
  snoozeMinutes: number;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  onboardingCompletedAt: string | null;
}

export interface PreferencesRepository {
  load(): Promise<Preferences | null>;
  save(preferences: Preferences): Promise<void>;
}

/** Defaults never initialize a microphone, model, network client or speech engine. */
export function defaultPreferences(timezone: string): Preferences {
  return {
    schemaVersion: 1,
    nickname: '',
    timezone: isTimezone(timezone) ? timezone : 'UTC',
    theme: 'system',
    replyMode: 'text',
    leadMinutes: 15,
    snoozeMinutes: 10,
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00',
    onboardingCompletedAt: null,
  };
}

export function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', {timeZone: value}).format(0);
    return value.trim().length > 0;
  } catch {
    return false;
  }
}

/** Validate persisted and user-entered settings before a durable write. */
export function validatePreferences(value: Preferences): string | null {
  if (Array.from(value.nickname.trim()).length > 40) {
    return 'Use a nickname with 40 characters or fewer.';
  }
  if (!isTimezone(value.timezone)) {
    return 'Enter a valid timezone, such as Asia/Manila.';
  }
  if (
    !Number.isInteger(value.leadMinutes) ||
    value.leadMinutes < 0 ||
    value.leadMinutes > 120
  ) {
    return 'Reminder lead time must be a whole number from 0 to 120 minutes.';
  }
  if (
    !Number.isInteger(value.snoozeMinutes) ||
    value.snoozeMinutes < 1 ||
    value.snoozeMinutes > 120
  ) {
    return 'Snooze must be a whole number from 1 to 120 minutes.';
  }
  const clockTime = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!clockTime.test(value.quietStart) || !clockTime.test(value.quietEnd)) {
    return 'Quiet hours must use 24-hour HH:MM times.';
  }
  if (value.quietHoursEnabled && value.quietStart === value.quietEnd) {
    return 'Choose different start and end times for quiet hours.';
  }
  return null;
}

/** Reject corrupt/unknown versions instead of silently discarding saved settings. */
export function decodePreferences(payload: string): Preferences {
  const value: unknown = JSON.parse(payload);
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid preference record');
  }
  const item = value as Record<string, unknown>;
  if (
    item.schemaVersion !== 1 ||
    typeof item.nickname !== 'string' ||
    typeof item.timezone !== 'string' ||
    !['system', 'light', 'dark'].includes(String(item.theme)) ||
    !['text', 'voice', 'both'].includes(String(item.replyMode)) ||
    typeof item.leadMinutes !== 'number' ||
    typeof item.snoozeMinutes !== 'number' ||
    typeof item.quietHoursEnabled !== 'boolean' ||
    typeof item.quietStart !== 'string' ||
    typeof item.quietEnd !== 'string' ||
    !(
      item.onboardingCompletedAt === null ||
      (typeof item.onboardingCompletedAt === 'string' &&
        Number.isFinite(Date.parse(item.onboardingCompletedAt)))
    )
  ) {
    throw new Error('Unsupported preference record');
  }
  const preferences = item as unknown as Preferences;
  if (validatePreferences(preferences)) {
    throw new Error('Invalid saved preference values');
  }
  return preferences;
}
