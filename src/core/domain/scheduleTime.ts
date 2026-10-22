const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const MAX_SERIES_DAYS = 366;

export type FoldChoice = 'earlier' | 'later';

export interface WeeklyRule {
  weekdays: number[];
  untilDate: string;
}

interface WeeklyQuery {
  startDate: string;
  time: string;
  timezone: string;
  rule: WeeklyRule;
  fromUtc: string;
  toUtc: string;
  fold?: FoldChoice;
}

export type ReminderTimeDecision = {
  kind: 'ready' | 'future' | 'missed' | 'quiet';
  nextAtUtc?: string;
};

// Bound the cache: timezone input must not grow a permanently resident map.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timezone);
  if (existing) {
    return existing;
  }
  assertTimezone(timezone);
  const result = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  if (formatters.size === 16) {
    const oldest = formatters.keys().next().value;
    if (oldest !== undefined) {
      formatters.delete(oldest);
    }
  }
  formatters.set(timezone, result);
  return result;
}

export function assertUtc(value: string): void {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error(
      'Use an exact UTC timestamp, including milliseconds and Z.',
    );
  }
  assertDate(value.slice(0, 10));
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value) {
    throw new Error('The UTC timestamp is not a real date and time.');
  }
}

export function assertDate(value: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Use a calendar date in YYYY-MM-DD format.');
  }
  const year = Number(value.slice(0, 4));
  const instant = new Date(`${value}T00:00:00.000Z`);
  if (
    year < 2000 ||
    year > 2100 ||
    !Number.isFinite(instant.getTime()) ||
    instant.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Use a real calendar date between 2000 and 2100.');
  }
}

function assertTime(value: string): void {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error('Use a local time in HH:mm format, from 00:00 to 23:59.');
  }
}

export function assertTimezone(timezone: string): void {
  if (
    typeof timezone !== 'string' ||
    timezone.length === 0 ||
    timezone.length > 100 ||
    timezone !== timezone.trim()
  ) {
    throw new Error('Choose a supported timezone identifier.');
  }
  if (formatters.has(timezone)) {
    return;
  }
  try {
    new Intl.DateTimeFormat('en', {timeZone: timezone}).resolvedOptions();
  } catch {
    throw new Error('Choose a supported timezone identifier.');
  }
}

function partsAt(instant: number, timezone: string) {
  const values = formatter(timezone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = values.find(entry => entry.type === type)?.value;
    if (value === undefined) {
      throw new Error('The device could not resolve the selected timezone.');
    }
    return value;
  };
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
    second: part('second'),
  };
}

export function localDateTime(
  utc: string,
  timezone: string,
): {date: string; time: string} {
  assertUtc(utc);
  const {date, time} = partsAt(Date.parse(utc), timezone);
  return {date, time};
}

export function localToUtc(
  date: string,
  time: string,
  timezone: string,
  fold?: FoldChoice,
): string {
  assertDate(date);
  assertTime(time);
  assertTimezone(timezone);
  if (fold !== undefined && fold !== 'earlier' && fold !== 'later') {
    throw new Error(
      'Choose the earlier or later occurrence of this local time.',
    );
  }
  const nominal = Date.parse(`${date}T${time}:00.000Z`);
  const offsets = new Set<number>();
  // Sample both sides of any nearby timezone transition, including a skipped
  // calendar day. Candidates must then round-trip exactly; gaps never roll over.
  for (let hours = -48; hours <= 48; hours += 6) {
    const probe = nominal + hours * 60 * MINUTE_MS;
    const local = partsAt(probe, timezone);
    offsets.add(
      Date.parse(`${local.date}T${local.time}:${local.second}.000Z`) - probe,
    );
  }
  const candidates = [...offsets]
    .map(offset => nominal - offset)
    .filter(candidate => {
      const local = partsAt(candidate, timezone);
      return (
        local.date === date && local.time === time && local.second === '00'
      );
    })
    .sort((left, right) => left - right);
  if (candidates.length === 0) {
    throw new Error('This local time does not exist in the selected timezone.');
  }
  if (candidates.length > 1 && fold === undefined) {
    throw new Error(
      'This local time occurs twice; choose the earlier or later occurrence.',
    );
  }
  const chosen =
    fold === 'later' ? candidates[candidates.length - 1] : candidates[0];
  if (chosen === undefined) {
    throw new Error('The device could not resolve the selected local time.');
  }
  // A nominal date at a supported boundary may map outside supported UTC years.
  const result = new Date(chosen).toISOString();
  assertUtc(result);
  return result;
}

export function expandWeekly(query: WeeklyQuery): string[] {
  const {startDate, time, timezone, rule, fromUtc, toUtc, fold} = query;
  assertDate(startDate);
  assertDate(rule.untilDate);
  assertTime(time);
  assertTimezone(timezone);
  assertUtc(fromUtc);
  assertUtc(toUtc);
  if (fromUtc >= toUtc) {
    throw new Error('The recurrence query must have a positive UTC interval.');
  }
  if (
    !Array.isArray(rule.weekdays) ||
    rule.weekdays.length === 0 ||
    rule.weekdays.length > 7 ||
    new Set(rule.weekdays).size !== rule.weekdays.length ||
    rule.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw new Error('Select unique weekdays from 0 (Sunday) to 6 (Saturday).');
  }
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${rule.untilDate}T00:00:00.000Z`);
  const days = (end - start) / DAY_MS + 1;
  if (days < 1 || days > MAX_SERIES_DAYS) {
    throw new Error(
      'A weekly series must span between 1 and 366 calendar days.',
    );
  }
  const result: string[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start + index * DAY_MS);
    if (rule.weekdays.includes(date.getUTCDay())) {
      const utc = localToUtc(
        date.toISOString().slice(0, 10),
        time,
        timezone,
        fold,
      );
      if (utc >= fromUtc && utc < toUtc) {
        result.push(utc);
      }
    }
  }
  return result;
}

export function evaluateReminderTime(
  runAtUtc: string,
  nowUtc: string,
  timezone: string,
  quietHours: {start: string; end: string} | null,
  graceMinutes = 15,
): ReminderTimeDecision {
  assertUtc(runAtUtc);
  assertUtc(nowUtc);
  assertTimezone(timezone);
  if (
    !Number.isInteger(graceMinutes) ||
    graceMinutes < 0 ||
    graceMinutes > 120
  ) {
    throw new Error(
      'The missed-reminder grace must be 0 to 120 whole minutes.',
    );
  }
  if (quietHours !== null) {
    assertTime(quietHours.start);
    assertTime(quietHours.end);
    if (quietHours.start === quietHours.end) {
      throw new Error('Quiet hours must have different start and end times.');
    }
  }
  const elapsed = Date.parse(nowUtc) - Date.parse(runAtUtc);
  if (elapsed < 0) {
    return {kind: 'future', nextAtUtc: runAtUtc};
  }
  if (elapsed > graceMinutes * MINUTE_MS) {
    return {kind: 'missed'};
  }
  if (quietHours !== null) {
    const local = localDateTime(nowUtc, timezone);
    const crossesMidnight = quietHours.start > quietHours.end;
    const midnight = Date.parse(`${local.date}T00:00:00.000Z`);
    // Compare instants, not only HH:mm: in a repeated hour, 01:45 in the
    // earlier occurrence can precede a quiet end at the later 01:30.
    for (const shift of [0, -1]) {
      const startDate = new Date(midnight + shift * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const endDate = new Date(
        midnight + (shift + Number(crossesMidnight)) * DAY_MS,
      )
        .toISOString()
        .slice(0, 10);
      if (startDate < '2000-01-01' || endDate > '2100-12-31') {
        continue;
      }
      // Nonexistent quiet boundaries are rejected for the caller to surface
      // and repair. A repeated boundary starts earlier and ends later.
      const startUtc = localToUtc(
        startDate,
        quietHours.start,
        timezone,
        'earlier',
      );
      const endUtc = localToUtc(endDate, quietHours.end, timezone, 'later');
      if (nowUtc >= startUtc && nowUtc < endUtc) {
        return {kind: 'quiet', nextAtUtc: endUtc};
      }
    }
  }
  return {kind: 'ready'};
}
