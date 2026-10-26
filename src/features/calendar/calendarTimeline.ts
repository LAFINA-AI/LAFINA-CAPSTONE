import type {AgendaItem} from '../../core/domain/planner';
import {assertDate, localDateTime} from '../../core/domain/scheduleTime';
import {clockText, shiftDate} from './plannerDisplay';

export const calendarHourHeight = 76;
const dayMinutes = 1440;

export interface CalendarInterval {
  item: AgendaItem;
  start: number;
  end: number;
  column: number;
  columns: number;
  label: string;
}

function minutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/**
 * Side-by-side overlap layout adapted from Nol-branch 9c183a2,
 * src/ui/screens/calendar/utils/timeGridLayout.ts. Only this bounded agenda
 * page is laid out; UTC occurrences retain the planner's timezone semantics.
 * Minimum visual durations reserve touch space and never change saved times.
 */
export function calendarIntervals(
  items: readonly AgendaItem[],
  date: string,
  timezone: string,
  format: '12h' | '24h',
): {timed: CalendarInterval[]; dateOnly: AgendaItem[]} {
  assertDate(date);
  const dateOnly = items.filter(item => item.at === null && item.date === date);
  const sorted = items
    .filter((item): item is AgendaItem & {at: string} => item.at !== null)
    .map(item => {
      const start = localDateTime(item.at, timezone);
      const end = item.endAt ? localDateTime(item.endAt, timezone) : null;
      const startMinute = start.date < date ? 0 : minutes(start.time);
      const actualEnd = end
        ? end.date > date
          ? dayMinutes
          : minutes(end.time)
        : Math.min(dayMinutes, startMinute + 30);
      return {
        item,
        start: startMinute,
        end: Math.min(dayMinutes, Math.max(startMinute + 40, actualEnd)),
        column: 0,
        columns: 1,
        label: item.endAt
          ? `${clockText(start.time, format)} – ${clockText(
              end!.time,
              format,
            )}${
              start.date !== date || end!.date !== date
                ? ' · spans midnight'
                : ''
            }`
          : `Due ${clockText(start.time, format)}`,
      };
    })
    .filter(item => item.end > item.start)
    .sort(
      (a, b) =>
        a.start - b.start ||
        b.end - a.end ||
        a.item.key.localeCompare(b.item.key),
    );

  const timed: CalendarInterval[] = [];
  let group: CalendarInterval[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;
  function flush() {
    for (const item of group) timed.push({...item, columns: columnEnds.length});
    group = [];
    columnEnds = [];
    groupEnd = -1;
  }
  for (const item of sorted) {
    if (item.start >= groupEnd) flush();
    const openColumn = columnEnds.findIndex(end => end <= item.start);
    const column = openColumn < 0 ? columnEnds.length : openColumn;
    columnEnds[column] = item.end;
    group.push({...item, column});
    groupEnd = Math.max(groupEnd, item.end);
  }
  flush();
  return {timed, dateOnly};
}

/** One calendar week in the saved Monday/Sunday convention, clipped to planner limits. */
export function calendarWeek(date: string, weekStartsMonday = true): string[] {
  assertDate(date);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const offset = weekStartsMonday ? (weekday + 6) % 7 : weekday;
  return Array.from({length: 7}, (_, index) => {
    try {
      return shiftDate(date, index - offset);
    } catch {
      return null;
    }
  }).filter((value): value is string => value !== null);
}

export function calendarRangeLabel(
  date: string,
  mode: 'month' | 'week',
  weekStartsMonday = true,
): string {
  assertDate(date);
  const days = calendarWeek(date, weekStartsMonday);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  try {
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: 'UTC',
      month: mode === 'month' ? 'long' : 'short',
      ...(mode === 'month' ? {year: 'numeric'} : {day: 'numeric'}),
    });
    if (mode === 'month')
      return formatter.format(new Date(`${date}T12:00:00Z`));
    if (first.slice(0, 4) !== last.slice(0, 4)) {
      const years = new Intl.DateTimeFormat('en', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${years.format(new Date(`${first}T12:00:00Z`))} – ${years.format(
        new Date(`${last}T12:00:00Z`),
      )}`;
    }
    return `${formatter.format(
      new Date(`${first}T12:00:00Z`),
    )} – ${formatter.format(new Date(`${last}T12:00:00Z`))}, ${date.slice(
      0,
      4,
    )}`;
  } catch {
    // The calendar remains navigable when the platform's locale formatter fails.
    return mode === 'month' ? date.slice(0, 7) : `${first} – ${last}`;
  }
}
