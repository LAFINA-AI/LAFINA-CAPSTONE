import {assertDate, localDateTime, localToUtc} from '../domain/scheduleTime';
import type {IntentContext} from './intents';

export class IntentTimeError extends Error {
  constructor(message: string, readonly missingSlots: string[]) {
    super(message);
    this.name = 'IntentTimeError';
  }
}

export function intentDate(value: string, context: IntentContext): string {
  const word = value.toLowerCase();
  const today = localDateTime(context.now, context.timezone).date;
  const date =
    word === 'today'
      ? today
      : word === 'tomorrow'
      ? new Date(Date.parse(`${today}T12:00:00.000Z`) + 86400_000)
          .toISOString()
          .slice(0, 10)
      : value;
  assertDate(date);
  return date;
}

function clock(value: string): string {
  const meridiem = /^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i.exec(value);
  if (meridiem) {
    const hour = Number(meridiem[1]);
    if (hour < 1 || hour > 12) {
      throw new IntentTimeError('Use an AM/PM hour from 1 to 12.', ['time']);
    }
    return `${String(
      (hour % 12) + (meridiem[3]!.toLowerCase() === 'pm' ? 12 : 0),
    ).padStart(2, '0')}:${meridiem[2] ?? '00'}`;
  }
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  if (value.toLowerCase() === 'noon') return '12:00';
  if (value.toLowerCase() === 'midnight') return '00:00';
  throw new IntentTimeError(
    'Use a time such as 7 PM or 19:00. An hour alone is ambiguous.',
    ['time'],
  );
}

/** Calendar-relative words use the selected timezone, never the host timezone.
 * Existing domain conversion refuses nonexistent or duplicated DST wall times.
 */
export function intentWhen(
  value: string,
  context: IntentContext,
  requireTime: boolean,
): {at: string | null; date: string | null} {
  const relative = /^in (\d{1,4}) (?:minutes?|mins?)$/i.exec(value);
  if (relative) {
    const minutes = Number(relative[1]);
    if (minutes < 1 || minutes > 1440) {
      throw new IntentTimeError('Use a delay of 1–1440 whole minutes.', [
        'time',
      ]);
    }
    return {
      at: new Date(Date.parse(context.now) + minutes * 60_000).toISOString(),
      date: null,
    };
  }
  const match = /^(today|tomorrow|\d{4}-\d{2}-\d{2})(?: at (.+))?$/i.exec(
    value,
  );
  if (!match) {
    throw new IntentTimeError(
      'Use today, tomorrow or YYYY-MM-DD with an explicit time. Weekdays and “later” need clarification.',
      ['date', 'time'],
    );
  }
  const date = intentDate(match[1]!, context);
  if (!match[2]) {
    if (requireTime)
      throw new IntentTimeError(
        'What time should the reminder or event use? Include 7 PM or 19:00.',
        ['time'],
      );
    return {at: null, date};
  }
  try {
    return {
      at: localToUtc(date, clock(match[2]), context.timezone),
      date: null,
    };
  } catch (error) {
    if (error instanceof IntentTimeError) throw error;
    throw new IntentTimeError(
      error instanceof Error
        ? error.message
        : 'Choose another explicit date and time.',
      ['date', 'time'],
    );
  }
}
