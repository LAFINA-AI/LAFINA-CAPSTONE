import {assertDate, localDateTime} from '../../core/domain/scheduleTime';

export function shiftDate(date: string, days: number): string {
  assertDate(date);
  const next = new Date(`${date}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  const result = next.toISOString().slice(0, 10);
  assertDate(result);
  return result;
}
export function localToday(date: Date, timezone: string): string {
  try {
    const local = localDateTime(date.toISOString(), timezone).date;
    assertDate(local);
    return local;
  } catch {
    const utcDate = Number.isFinite(date.getTime())
      ? date.toISOString().slice(0, 10)
      : '2000-01-01';
    return utcDate < '2000-01-01'
      ? '2000-01-01'
      : utcDate > '2100-12-31'
      ? '2100-12-31'
      : utcDate;
  }
}
export function plannerDateWarning(
  date: Date,
  timezone: string,
): string | null {
  try {
    assertDate(localDateTime(date.toISOString(), timezone).date);
    return null;
  } catch {
    return 'The device clock or timezone could not provide a supported planner date (2000–2100). This is a fallback view; check the clock and choose the correct date before saving a schedule.';
  }
}
export function weekDates(date: string): string[] {
  assertDate(date);
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return Array.from({length: 7}, (_, index) => {
    const day = new Date(`${date}T12:00:00.000Z`);
    day.setUTCDate(day.getUTCDate() - ((weekday + 6) % 7) + index);
    return day.toISOString().slice(0, 10);
  }).filter(day => day >= '2000-01-01' && day <= '2100-12-31');
}
export function clockText(time: string, format: '12h' | '24h'): string {
  if (format === '24h') return time;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'Invalid time';
  const hour = Number(time.slice(0, 2));
  return `${hour % 12 || 12}:${time.slice(3)} ${hour < 12 ? 'AM' : 'PM'}`;
}
export function displayInstant(
  utc: string,
  timezone: string,
  format: '12h' | '24h',
): string {
  try {
    const local = localDateTime(utc, timezone);
    return `${local.date} · ${clockText(local.time, format)}`;
  } catch {
    return `${utc} (UTC; local display unavailable)`;
  }
}
let sequence = 0;
export function operationToken(): string {
  return `manual_${Date.now().toString(36)}_${sequence++}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
