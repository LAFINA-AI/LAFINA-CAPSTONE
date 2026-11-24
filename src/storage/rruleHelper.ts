/**
 * Custom RRULE Helper
 * Expands manual rules with LAFINA's established wall-date semantics and
 * imported RRULE-prefixed rules with the existing rrule library's RFC semantics.
 */
import {rrulestr} from 'rrule';

export interface ParsedRrule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byday?: string[]; // e.g. ['MO', 'WE', 'FR']
  until?: string; // YYYY-MM-DD
  count?: number; // Max occurrences
}

/**
 * Parses an iCalendar RRULE string into a ParsedRrule object.
 * Returns null if the rule is invalid or empty.
 */
export const parseRrule = (
  ruleStr: string | null | undefined,
): ParsedRrule | null => {
  if (!ruleStr) return null;

  try {
    const parts = ruleStr.replace(/^RRULE:/i, '').split(';');
    const rule: Partial<ParsedRrule> = {};

    parts.forEach(part => {
      const [key, val] = part.split('=');
      if (!key || !val) return;

      const upperKey = key.toUpperCase();
      const upperVal = val.toUpperCase();

      switch (upperKey) {
        case 'FREQ':
          if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(upperVal)) {
            rule.freq = upperVal as any;
          }
          break;
        case 'INTERVAL':
          rule.interval = parseInt(upperVal, 10);
          break;
        case 'BYDAY':
          rule.byday = upperVal.split(',');
          break;
        case 'UNTIL':
          // Extract date part (handles YYYYMMDD, YYYY-MM-DD, and YYYYMMDDThhmmssZ)
          const datePart = upperVal.split('T')[0].replace(/-/g, '');
          if (/^\d{8}$/.test(datePart)) {
            const year = datePart.substring(0, 4);
            const month = datePart.substring(4, 6);
            const day = datePart.substring(6, 8);
            rule.until = `${year}-${month}-${day}`;
          }
          break;
        case 'COUNT':
          rule.count = parseInt(upperVal, 10);
          break;
      }
    });

    if (!rule.freq) return null;
    if (
      rule.count !== undefined &&
      (!Number.isSafeInteger(rule.count) || rule.count < 1)
    )
      return null;
    if (
      rule.byday?.some(
        day => !['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].includes(day),
      )
    )
      return null;
    rule.interval = rule.interval && rule.interval > 0 ? rule.interval : 1;
    if (!Number.isSafeInteger(rule.interval)) return null;

    return rule as ParsedRrule;
  } catch (error) {
    console.error('Error parsing RRULE:', ruleStr, error);
    return null;
  }
};

/**
 * Helper to safely parse a YYYY-MM-DD string into a local Date object at midnight.
 */
const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

/**
 * Helper to format a local Date object into a YYYY-MM-DD string.
 */
const formatLocalDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Helper to get the Sunday of the week at midnight.
 */
const getSunday = (d: Date): Date => {
  const res = new Date(d);
  const day = res.getDay();
  res.setDate(res.getDate() - day);
  res.setHours(0, 0, 0, 0);
  return res;
};

// Map day codes to JS getDay() values: 0=Sunday, 1=Monday, etc.
const DAY_CODES: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

/**
 * Expands a recurring event starting on `startDateStr` into a list of YYYY-MM-DD dates
 * that fall within the range `rangeStart` to `rangeEnd`.
 */
export const getOccurrences = (
  startDateStr: string,
  recurrenceRule: string | null | undefined,
  rangeStart: Date,
  rangeEnd: Date,
): string[] => {
  if (!startDateStr) return [];

  const localRangeStart = new Date(
    rangeStart.getFullYear(),
    rangeStart.getMonth(),
    rangeStart.getDate(),
  );
  const localRangeEnd = new Date(
    rangeEnd.getFullYear(),
    rangeEnd.getMonth(),
    rangeEnd.getDate(),
    23,
    59,
    59,
    999,
  );

  // Imported rules keep their RFC semantics (e.g. Jan 31 skips February),
  // while existing manually created rules retain LAFINA's month-end clamping.
  if (recurrenceRule?.startsWith('RRULE:')) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) return [];
    try {
      const utcDay = (date: Date) =>
        new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const end = utcDay(rangeEnd);
      end.setUTCHours(23, 59, 59, 999);
      const imported = rrulestr(
        `DTSTART:${startDateStr.replace(/-/g, '')}T000000Z\n${recurrenceRule}`,
      );
      return imported
        .between(utcDay(rangeStart), end, true, (_date, index) => {
          if (index >= 10000)
            throw new Error(
              'The recurrence window is too large. Choose a shorter date range.',
            );
          return true;
        })
        .map(date => date.toISOString().slice(0, 10));
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('recurrence window is too large')
      ) {
        throw error;
      }
      const startDt = parseLocalDate(startDateStr);
      if (
        Number.isFinite(startDt.getTime()) &&
        startDt >= localRangeStart &&
        startDt <= localRangeEnd
      ) {
        return [startDateStr];
      }
      return [];
    }
  }

  const rule = parseRrule(recurrenceRule);
  if (!rule) {
    // If no recurrence, only return the start date if it falls inside the range
    const startDt = parseLocalDate(startDateStr);
    if (
      Number.isFinite(startDt.getTime()) &&
      startDt >= localRangeStart &&
      startDt <= localRangeEnd
    ) {
      return [startDateStr];
    }
    return [];
  }

  const occurrences: string[] = [];
  const startDt = parseLocalDate(startDateStr);
  const untilDt = rule.until ? parseLocalDate(rule.until) : null;
  const count = rule.count ?? Infinity;
  const interval = rule.interval;
  if (!Number.isFinite(startDt.getTime()) || count <= 0) return [];
  const dayNumber = (d: Date) =>
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  const end = untilDt && untilDt < localRangeEnd ? untilDt : localRangeEnd;
  const push = (date: Date) => {
    if (date < localRangeStart || date > end) return;
    if (occurrences.length >= 10000)
      throw new Error(
        'The recurrence window is too large. Choose a shorter date range.',
      );
    occurrences.push(formatLocalDate(date));
  };

  if (rule.freq === 'WEEKLY') {
    const targetDays = [
      ...new Set(
        rule.byday?.length
          ? rule.byday
              .map(code => DAY_CODES[code])
              .filter(day => day !== undefined)
          : [startDt.getDay()],
      ),
    ].sort((a, b) => a - b);
    if (!targetDays.length) return [];
    const base = getSunday(startDt);
    const firstDays = targetDays.filter(day => day >= startDt.getDay());
    const weeks = Math.max(
      0,
      Math.floor((dayNumber(getSunday(rangeStart)) - dayNumber(base)) / 7),
    );
    let period = Math.floor(weeks / interval);
    let used =
      period === 0 ? 0 : firstDays.length + (period - 1) * targetDays.length;
    for (;;) {
      const week = new Date(base);
      week.setDate(week.getDate() + period * interval * 7);
      if (week > end || used >= count) break;
      for (const day of period === 0 ? firstDays : targetDays) {
        if (used >= count) break;
        const date = new Date(week);
        date.setDate(date.getDate() + day);
        push(date);
        used += 1;
      }
      period += 1;
    }
  } else {
    const distance =
      rule.freq === 'DAILY'
        ? dayNumber(rangeStart) - dayNumber(startDt)
        : rule.freq === 'MONTHLY'
        ? (rangeStart.getFullYear() - startDt.getFullYear()) * 12 +
          rangeStart.getMonth() -
          startDt.getMonth()
        : rangeStart.getFullYear() - startDt.getFullYear();
    // Jump over historical periods without consuming the output safety budget.
    let period = Math.max(0, Math.floor(distance / interval));
    for (; period < count; period += 1) {
      let current: Date;
      if (rule.freq === 'DAILY') {
        current = new Date(startDt);
        current.setDate(current.getDate() + period * interval);
      } else {
        const month =
          rule.freq === 'MONTHLY'
            ? startDt.getMonth() + period * interval
            : startDt.getMonth();
        const year =
          startDt.getFullYear() +
          (rule.freq === 'YEARLY' ? period * interval : Math.floor(month / 12));
        const actualMonth = ((month % 12) + 12) % 12;
        const lastDay = new Date(year, actualMonth + 1, 0).getDate();
        current = new Date(
          year,
          actualMonth,
          Math.min(startDt.getDate(), lastDay),
        );
      }
      if (!Number.isFinite(current.getTime()) || current > end) break;
      push(current);
    }
  }
  return occurrences;
};
