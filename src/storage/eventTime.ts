/**
 * Event wall time and local-only timezone metadata (AGY-PORT 08). The zone
 * conversion is adapted from the LAFINA donor `eventTime.ts` (blob bf62db10,
 * pinned commit 0d4bbe39) onto AGY's frozen sync contract. See ADR-021.
 *
 * Two layers:
 *
 * 1. Wall time (synced, unchanged). An event is `date` + `start_time` +
 *    `end_time`, floating in whatever timezone the device is in. An end at or
 *    before the start means the event ends on the next day. Calendar layout,
 *    the fast-path parser and every other AGY device already read it that way,
 *    so overnight events need no new wire field. Spans are at most 24 hours.
 * 2. Zone metadata (this device only). When an event is saved here, the IANA
 *    timezone and the exact UTC start and end instants are kept in
 *    `event_time_local`. Nothing in it is sent to the server.
 *
 * Conversions are exact or they fail: a wall time that does not exist (a
 * clock-change gap) is refused, and one that happens twice needs an explicit
 * earlier/later choice. No time is ever moved to make it fit.
 */
export type FoldChoice = 'earlier' | 'later';

export interface EventFolds {
  startFold?: FoldChoice | null;
  endFold?: FoldChoice | null;
}

export interface EventWallTime {
  date: string;
  startTime: string;
  endTime: string;
}

/** Saved on this device only; see `event_time_local`. */
export interface EventZoneTiming {
  timeZone: string;
  startAt: string;
  endAt: string;
  startFold: FoldChoice | null;
  endFold: FoldChoice | null;
}

export const MINUTES_PER_DAY = 24 * 60;
const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MAX_ZONE_LENGTH = 100;
/** A 24-hour wall span plus one repeated hour on a clock-change night. */
const MAX_SPAN_MS = 25 * 3_600_000;

export const isRealDate = (date: unknown): date is string => {
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
};

export const isWallTime = (time: unknown): time is string =>
  typeof time === 'string' && TIME_PATTERN.test(time);

const minutesOf = (time: string): number =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Calendar-date arithmetic, independent of the device timezone. */
export const addDaysToDate = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

/** The floating overnight rule, shared with Calendar layout. */
export const endsNextDay = (startTime: string, endTime: string): boolean =>
  minutesOf(endTime) <= minutesOf(startTime);

export const eventEndDate = (wall: EventWallTime): string =>
  endsNextDay(wall.startTime, wall.endTime)
    ? addDaysToDate(wall.date, 1)
    : wall.date;

/** Wall-clock length in minutes; an equal start and end is a full day, as Calendar draws it. */
export const eventSpanMinutes = (startTime: string, endTime: string): number =>
  (minutesOf(endTime) - minutesOf(startTime) + MINUTES_PER_DAY) %
    MINUTES_PER_DAY || MINUTES_PER_DAY;

export type WallTimeProblem = 'invalid_date' | 'invalid_time' | 'zero_length';

export type WallTimeCheck =
  | {ok: true; endDate: string; overnight: boolean}
  | {ok: false; problem: WallTimeProblem; message: string};

/**
 * Checks a new or edited event before it is saved. Existing rows are never
 * re-checked: a legacy event with an equal start and end keeps its meaning.
 */
export const checkEventWallTime = (wall: EventWallTime): WallTimeCheck => {
  if (!isRealDate(wall.date)) {
    return {ok: false, problem: 'invalid_date', message: 'Use a real date.'};
  }
  if (!isWallTime(wall.startTime) || !isWallTime(wall.endTime)) {
    return {
      ok: false,
      problem: 'invalid_time',
      message: 'Choose a valid start and end time.',
    };
  }
  if (wall.startTime === wall.endTime) {
    return {
      ok: false,
      problem: 'zero_length',
      message: 'The end time must be different from the start time.',
    };
  }
  const overnight = endsNextDay(wall.startTime, wall.endTime);
  return {ok: true, endDate: eventEndDate(wall), overnight};
};

export type EventTimeProblem = 'gap' | 'ambiguous' | 'invalid' | 'range';

export class EventTimeError extends Error {
  constructor(
    readonly problem: EventTimeProblem,
    readonly which: 'start' | 'end' | null,
    message: string,
  ) {
    super(message);
    this.name = 'EventTimeError';
  }
}

export const isEventTimeError = (error: unknown): error is EventTimeError =>
  error instanceof EventTimeError;

const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (zone: string): Intl.DateTimeFormat => {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
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
    if (formatters.size >= 16) {
      const first = formatters.keys().next().value;
      if (first !== undefined) formatters.delete(first);
    }
    formatters.set(zone, formatter);
  }
  return formatter;
};

const wallParts = (
  ms: number,
  zone: string,
): {date: string; time: string; second: string} => {
  const values = formatterFor(zone).formatToParts(ms);
  const part = (type: string): string =>
    values.find(value => value.type === type)?.value ?? '';
  // Some engines print midnight as 24 even with hourCycle h23.
  const hour = part('hour') === '24' ? '00' : part('hour');
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${hour}:${part('minute')}`,
    second: part('second'),
  };
};

export const isKnownTimeZone = (zone: unknown): zone is string => {
  if (typeof zone !== 'string' || !zone || zone.length > MAX_ZONE_LENGTH) {
    return false;
  }
  try {
    formatterFor(zone);
    return true;
  } catch {
    return false;
  }
};

let engineChecked: boolean | null = null;

/**
 * True when this JavaScript engine formats wall time the way the conversion
 * needs (24-hour parts, Gregorian dates). Checked once on known instants; if
 * it fails, no timezone metadata is recorded and events stay floating, so an
 * engine quirk can never make the form refuse a valid time.
 */
const engineFormatsWallTime = (): boolean => {
  if (engineChecked === null) {
    try {
      const afternoon = wallParts(Date.UTC(2020, 0, 1, 13, 5, 0), 'UTC');
      const midnight = wallParts(Date.UTC(2020, 0, 2, 0, 0, 0), 'UTC');
      engineChecked =
        afternoon.date === '2020-01-01' &&
        afternoon.time === '13:05' &&
        afternoon.second === '00' &&
        midnight.date === '2020-01-02' &&
        midnight.time === '00:00';
    } catch {
      engineChecked = false;
    }
  }
  return engineChecked;
};

/**
 * The device's IANA timezone, or null when the engine cannot say or cannot
 * convert wall time reliably (then events stay floating, as before).
 */
export const deviceTimeZone = (): string | null => {
  try {
    if (!engineFormatsWallTime()) return null;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isKnownTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
};

/** Wall date and time of a UTC instant in an explicit timezone. */
export const localDateTime = (
  utc: string,
  zone: string,
): {date: string; time: string} => {
  const ms = Date.parse(utc);
  if (!Number.isFinite(ms) || !isKnownTimeZone(zone)) {
    throw new EventTimeError('invalid', null, 'Invalid instant or timezone.');
  }
  const {date, time} = wallParts(ms, zone);
  return {date, time};
};

/**
 * Every UTC instant whose wall time in `zone` is exactly `date time`. Zero
 * means a clock-change gap, two means the time happens twice.
 */
export const wallTimeCandidates = (
  date: string,
  time: string,
  zone: string,
): number[] => {
  if (!isRealDate(date) || !isWallTime(time) || !isKnownTimeZone(zone)) {
    throw new EventTimeError(
      'invalid',
      null,
      'Choose a valid date, time and timezone.',
    );
  }
  const nominal = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const probe = nominal + hours * 3_600_000;
    const local = wallParts(probe, zone);
    offsets.add(
      Date.parse(`${local.date}T${local.time}:${local.second}Z`) - probe,
    );
  }
  return [...new Set([...offsets].map(offset => nominal - offset))]
    .filter(candidate => {
      const local = wallParts(candidate, zone);
      return (
        local.date === date && local.time === time && local.second === '00'
      );
    })
    .sort((a, b) => a - b);
};

/** One exact instant, or an EventTimeError naming the problem. */
export const localToUtc = (
  date: string,
  time: string,
  zone: string,
  fold?: FoldChoice | null,
  which: 'start' | 'end' | null = null,
): string => {
  if (fold != null && fold !== 'earlier' && fold !== 'later') {
    throw new EventTimeError('invalid', which, 'Choose earlier or later.');
  }
  const candidates = wallTimeCandidates(date, time, zone);
  if (candidates.length === 0) {
    throw new EventTimeError(
      'gap',
      which,
      `${time} does not exist on ${date} in ${zone} (the clocks change). Choose another time.`,
    );
  }
  if (candidates.length > 1 && !fold) {
    throw new EventTimeError(
      'ambiguous',
      which,
      `${time} happens twice on ${date} in ${zone} (the clocks change). Choose the earlier or the later one.`,
    );
  }
  return new Date(
    fold === 'later' ? candidates[candidates.length - 1] : candidates[0],
  ).toISOString();
};

/**
 * The exact zone timing of a wall-time event, or an EventTimeError. A fold is
 * kept only where the wall time really happens twice.
 */
export const resolveEventZoneTiming = (
  wall: EventWallTime,
  zone: string,
  folds: EventFolds = {},
): EventZoneTiming => {
  const endDate = eventEndDate(wall);
  const startCount = wallTimeCandidates(wall.date, wall.startTime, zone).length;
  const endCount = wallTimeCandidates(endDate, wall.endTime, zone).length;
  const startAt = localToUtc(
    wall.date,
    wall.startTime,
    zone,
    startCount > 1 ? folds.startFold : null,
    'start',
  );
  const endAt = localToUtc(
    endDate,
    wall.endTime,
    zone,
    endCount > 1 ? folds.endFold : null,
    'end',
  );
  const duration = Date.parse(endAt) - Date.parse(startAt);
  if (duration <= 0 || duration > MAX_SPAN_MS) {
    throw new EventTimeError(
      'range',
      'end',
      'The end must come after the start, within 24 hours.',
    );
  }
  return {
    timeZone: zone,
    startAt,
    endAt,
    startFold: startCount > 1 ? folds.startFold ?? null : null,
    endFold: endCount > 1 ? folds.endFold ?? null : null,
  };
};

/** True when stored metadata still describes exactly this wall time. */
export const zoneTimingMatches = (
  wall: EventWallTime,
  timing: EventZoneTiming,
): boolean => {
  try {
    const again = resolveEventZoneTiming(wall, timing.timeZone, timing);
    return again.startAt === timing.startAt && again.endAt === timing.endAt;
  } catch {
    return false;
  }
};
