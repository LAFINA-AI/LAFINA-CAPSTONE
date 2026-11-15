/**
 * Alarm plan A2: the JS mirror of the native `AlarmSchedule` rules, for what
 * the screens show ("Next alarm in 7 h 12 min", "Weekdays"). Native books the
 * real alarm; this never decides when anything rings.
 */

/** Mon=1 … Sun=64, the same bits as the native AlarmDefinition. */
export const DAY_BITS = {
  mon: 1,
  tue: 2,
  wed: 4,
  thu: 8,
  fri: 16,
  sat: 32,
  sun: 64,
} as const;

export type AlarmDayKey = keyof typeof DAY_BITS;

export const DAY_ORDER: readonly AlarmDayKey[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];

export const DAY_SHORT: Record<AlarmDayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

export const WEEKDAYS = 31;
export const WEEKEND = 96;
export const EVERY_DAY = 127;

/** JS getDay() (Sun=0) → bit. */
export const bitForDate = (date: Date): number => 1 << (date.getDay() + 6) % 7;

export interface AlarmTiming {
  hour: number;
  minute: number;
  repeatDays: number;
  oneShotDate: string | null;
  enabled: boolean;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const atTime = (date: Date, hour: number, minute: number): Date => {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
};

/** The date a one-shot alarm at this time rings: today if still ahead, else tomorrow. */
export const oneShotDateFor = (
  hour: number,
  minute: number,
  now: Date = new Date(),
): string => {
  const today = atTime(now, hour, minute);
  if (today.getTime() > now.getTime()) return localDateKey(today);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localDateKey(tomorrow);
};

/** The next ring strictly after `now`, or null (disabled, or a past one-shot). */
export const nextAlarmTrigger = (
  alarm: AlarmTiming,
  now: Date = new Date(),
): Date | null => {
  if (!alarm.enabled) return null;
  if (alarm.repeatDays & EVERY_DAY) {
    for (let offset = 0; offset <= 7; offset++) {
      const day = new Date(now);
      day.setDate(day.getDate() + offset);
      if (!(alarm.repeatDays & bitForDate(day))) continue;
      const candidate = atTime(day, alarm.hour, alarm.minute);
      if (candidate.getTime() > now.getTime()) return candidate;
    }
    return null;
  }
  if (alarm.oneShotDate) {
    const [y, m, d] = alarm.oneShotDate.split('-').map(Number);
    const candidate = new Date(y, m - 1, d, alarm.hour, alarm.minute, 0, 0);
    return candidate.getTime() > now.getTime() ? candidate : null;
  }
  const today = atTime(now, alarm.hour, alarm.minute);
  if (today.getTime() > now.getTime()) return today;
  today.setDate(today.getDate() + 1);
  return today;
};

/** "Weekdays", "Every day", "Weekends", "Mon, Wed, Fri" or "Once". */
export const describeRepeat = (repeatDays: number): string => {
  const days = repeatDays & EVERY_DAY;
  if (days === 0) return 'Once';
  if (days === EVERY_DAY) return 'Every day';
  if (days === WEEKDAYS) return 'Weekdays';
  if (days === WEEKEND) return 'Weekends';
  return DAY_ORDER.filter(key => days & DAY_BITS[key])
    .map(key => DAY_SHORT[key])
    .join(', ');
};

export const formatAlarmTime = (
  hour: number,
  minute: number,
  use24h = false,
): string => {
  if (use24h) return `${pad(hour)}:${pad(minute)}`;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${pad(minute)} ${suffix}`;
};

/** "in 7 h 12 min", "in 45 min", "in less than a minute". */
export const describeTimeUntil = (
  when: Date,
  now: Date = new Date(),
): string => {
  const minutes = Math.max(
    0,
    Math.round((when.getTime() - now.getTime()) / 60000),
  );
  if (minutes < 1) return 'in less than a minute';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} d`);
  if (hours) parts.push(`${hours} h`);
  if (mins && !days) parts.push(`${mins} min`);
  return `in ${parts.join(' ')}`;
};

/** "mo,we" style tokens (agent `repeat`, see repeatToRule) → bitmask. */
export const repeatDaysFromRule = (rule: string | null | undefined): number => {
  const text = (rule || '').toUpperCase();
  if (!text) return 0;
  if (/FREQ=DAILY/.test(text) && !/BYDAY/.test(text)) return EVERY_DAY;
  const byDay = /BYDAY=([A-Z,]+)/.exec(text)?.[1];
  if (!byDay) return 0;
  const map: Record<string, number> = {
    MO: DAY_BITS.mon,
    TU: DAY_BITS.tue,
    WE: DAY_BITS.wed,
    TH: DAY_BITS.thu,
    FR: DAY_BITS.fri,
    SA: DAY_BITS.sat,
    SU: DAY_BITS.sun,
  };
  return byDay
    .split(',')
    .reduce((bits, token) => bits | (map[token.trim()] ?? 0), 0);
};
