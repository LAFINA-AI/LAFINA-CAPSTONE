import { Task, Event } from './tasksStore';
import { TimeBlock } from './timeBlocksStore';
import ICalParser from 'ical-js-parser';
import { RRule, RRuleSet, rrulestr } from 'rrule';
import {
  addDaysToDate,
  deviceTimeZone,
  endsNextDay,
  isKnownTimeZone,
  isRealDate,
  isWallTime,
  localDateTime,
  localToUtc,
  wallTimeCandidates,
} from './eventTime';
import type { FoldChoice } from './eventTime';

/**
 * Escapes special characters for iCalendar format values.
 * RFC 5545 requires escaping backslashes, commas, semicolons, and newlines.
 * 
 * @param text The raw string to escape.
 * @returns The escaped string.
 */
const escapeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
};

/**
 * Unescapes special characters from iCalendar format values.
 * 
 * @param text The escaped iCalendar string.
 * @returns The unescaped raw string.
 */
const unescapeText = (text: string): string => {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
};

/**
 * Formats a YYYY-MM-DD date and HH:MM time into an iCalendar date-time string (YYYYMMDDThhmmss).
 * If time is not provided, formats as date-only (YYYYMMDD).
 * 
 * @param date YYYY-MM-DD date string.
 * @param time Optional HH:MM time string.
 * @returns iCalendar formatted string.
 */
const formatIcsDateTime = (date?: string | null, time?: string | null): string => {
  if (!date) return '';
  const cleanDate = date.replace(/-/g, '');
  if (!time) {
    return cleanDate;
  }
  const cleanTime = time.replace(/:/g, '');
  return `${cleanDate}T${cleanTime}00`;
};

/**
 * The DTEND date of a timed item (AGY-PORT 08): an end at or before the start
 * is on the next day, the floating overnight rule Calendar draws.
 */
const endDateOf = (date: string, startTime: string, endTime: string): string =>
  isRealDate(date) && isWallTime(startTime) && isWallTime(endTime) && endsNextDay(startTime, endTime)
    ? addDaysToDate(date, 1)
    : date;

/** 2026-11-06T01:00:00.000Z to 20261106T010000Z. */
const formatIcsUtcInstant = (iso: string): string =>
  iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Parses an iCalendar date or date-time string into a structured date (YYYY-MM-DD) and time (HH:MM).
 * Handles formats: YYYYMMDD, YYYYMMDDThhmmss, YYYYMMDDThhmmssZ.
 * 
 * @param icsValue The raw iCalendar datetime value.
 * @returns An object with date and optional time.
 */
const parseIcsDateTime = (icsValue: string): { date: string; time?: string } => {
  // Strip any trailing Z (UTC identifier) or extra text
  const clean = icsValue.trim().replace(/Z$/, '');
  
  if (clean.includes('T')) {
    const [datePart, timePart] = clean.split('T');
    if (/^\d{8}$/.test(datePart) && timePart.length >= 4) {
      const year = datePart.substring(0, 4);
      const month = datePart.substring(4, 6);
      const day = datePart.substring(6, 8);
      const hour = timePart.substring(0, 2);
      const minute = timePart.substring(2, 4);
      return {
        date: `${year}-${month}-${day}`,
        time: `${hour}:${minute}`,
      };
    }
  }
  
  if (/^\d{8}$/.test(clean)) {
    const year = clean.substring(0, 4);
    const month = clean.substring(4, 6);
    const day = clean.substring(6, 8);
    return {
      date: `${year}-${month}-${day}`,
    };
  }
  
  // Fallback to today if format is unrecognized
  const todayStr = new Date().toISOString().split('T')[0];
  return { date: todayStr };
};

/**
 * Folds a line to a maximum of 75 octets as specified in RFC 5545.
 * Folds by inserting a CRLF and a single space character.
 * 
 * @param line The line of text to fold.
 * @returns The folded line string.
 */
const foldLine = (line: string): string => {
  if (line.length <= 75) return line;
  
  let result = '';
  let remaining = line;
  
  // First chunk can be up to 75 characters
  result += remaining.substring(0, 75);
  remaining = remaining.substring(75);
  
  // Subsequent chunks can be up to 74 characters (because of the leading space)
  while (remaining.length > 0) {
    result += '\r\n ' + remaining.substring(0, 74);
    remaining = remaining.substring(74);
  }
  
  return result;
};

/**
 * Generates an iCalendar RFC 5545 compliant string for events, time blocks, and tasks.
 * 
 * @param events List of calendar events.
 * @param blocks List of schedule/time blocks.
 * @param tasks List of tasks.
 * @returns iCalendar formatted string.
 */
export const generateIcsString = (
  events: Event[],
  blocks: TimeBlock[],
  tasks: Task[]
): string => {
  const nowFormatted = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LAFINA//NONSGML Calendar//EN',
    'CALSCALE:GREGORIAN',
  ];

  // 1. Export Events
  events.forEach((event) => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}`);
    lines.push(`DTSTAMP:${nowFormatted}`);
    if (event.startAt && event.endAt && !event.recurrenceRule) {
      // Saved on this device with an exact timezone: export the exact instants.
      lines.push(`DTSTART:${formatIcsUtcInstant(event.startAt)}`);
      lines.push(`DTEND:${formatIcsUtcInstant(event.endAt)}`);
    } else {
      lines.push(`DTSTART:${formatIcsDateTime(event.date, event.startTime)}`);
      lines.push(
        `DTEND:${formatIcsDateTime(endDateOf(event.date, event.startTime, event.endTime), event.endTime)}`,
      );
    }
    lines.push(foldLine(`SUMMARY:${escapeText(event.title)}`));
    if (event.location) {
      lines.push(foldLine(`LOCATION:${escapeText(event.location)}`));
    }
    if (event.recurrenceRule) {
      lines.push(`RRULE:${event.recurrenceRule}`);
    }
    lines.push('X-LAFINA-TYPE:event');
    lines.push('END:VEVENT');
  });

  // 2. Export Time Blocks
  blocks.forEach((block) => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${block.id}`);
    lines.push(`DTSTAMP:${nowFormatted}`);
    lines.push(`DTSTART:${formatIcsDateTime(block.date, block.startTime)}`);
    lines.push(
      `DTEND:${formatIcsDateTime(endDateOf(block.date, block.startTime, block.endTime), block.endTime)}`,
    );
    lines.push(foldLine(`SUMMARY:${escapeText(block.title)}`));
    if (block.notes) {
      lines.push(foldLine(`DESCRIPTION:${escapeText(block.notes)}`));
    }
    lines.push(foldLine(`CATEGORIES:${escapeText(block.category)}`));
    lines.push(`X-LAFINA-COLOR:${block.color}`);
    if (block.recurrenceRule) {
      lines.push(`RRULE:${block.recurrenceRule}`);
    }
    lines.push('X-LAFINA-TYPE:time_block');
    lines.push('END:VEVENT');
  });

  // 3. Export Tasks
  tasks.forEach((task) => {
    lines.push('BEGIN:VTODO');
    lines.push(`UID:${task.id}`);
    lines.push(`DTSTAMP:${nowFormatted}`);
    if (task.dueDate) {
      const dt = formatIcsDateTime(task.dueDate, task.dueTime);
      if (task.dueTime) {
        lines.push(`DUE:${dt}`);
      } else {
        lines.push(`DUE;VALUE=DATE:${dt}`);
      }
    }
    lines.push(foldLine(`SUMMARY:${escapeText(task.title)}`));
    if (task.notes) {
      lines.push(foldLine(`DESCRIPTION:${escapeText(task.notes)}`));
    }
    lines.push(foldLine(`CATEGORIES:${escapeText(task.category)}`));
    lines.push(`STATUS:${task.isCompleted ? 'COMPLETED' : 'NEEDS-ACTION'}`);
    
    // Priority mapping: High -> 1, Medium -> 5, Low -> 9
    const priorityNum = task.priority === 'High' ? 1 : task.priority === 'Medium' ? 5 : 9;
    lines.push(`PRIORITY:${priorityNum}`);
    if (task.recurrenceRule) {
      lines.push(`RRULE:${task.recurrenceRule}`);
    }
    lines.push('X-LAFINA-TYPE:task');
    lines.push('END:VTODO');
  });

  lines.push('END:VCALENDAR');
  
  // Join lines with CRLF as required by RFC 5545
  return lines.join('\r\n') + '\r\n';
};

// Helper to parse duration string (e.g. PT1H30M or P1W) to milliseconds
const parseDuration = (iso: string): number => {
  const clean = iso.trim().toUpperCase();
  const weekMatch = clean.match(/^P(\d+)W$/);
  if (weekMatch) {
    return parseInt(weekMatch[1], 10) * 7 * 24 * 60 * 60 * 1000;
  }
  const match = clean.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 3600000; // default 1 hour
  const d = match[1] ? parseInt(match[1], 10) : 0;
  const h = match[2] ? parseInt(match[2], 10) : 0;
  const m = match[3] ? parseInt(match[3], 10) : 0;
  const s = match[4] ? parseInt(match[4], 10) : 0;
  return ((d * 24 + h) * 60 + m) * 60000 + s * 1000;
};

// Timezone-independent Date parser
const parseIcsToUtcDate = (icsValue: string): Date => {
  try {
    const clean = icsValue.trim().replace(/Z$/, '');
    if (clean.includes('T')) {
      const [datePart, timePart] = clean.split('T');
      if (!/^\d{8}$/.test(datePart) || timePart.length < 4) {
        return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 0, 0, 0));
      }
      const year = parseInt(datePart.substring(0, 4), 10);
      const month = parseInt(datePart.substring(4, 6), 10) - 1;
      const day = parseInt(datePart.substring(6, 8), 10);
      const hour = parseInt(timePart.substring(0, 2), 10);
      const minute = parseInt(timePart.substring(2, 4), 10);
      const second = timePart.length >= 6 ? parseInt(timePart.substring(4, 6), 10) : 0;
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    } else {
      if (!/^\d{8}$/.test(clean)) {
        return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 0, 0, 0));
      }
      const year = parseInt(clean.substring(0, 4), 10);
      const month = parseInt(clean.substring(4, 6), 10) - 1;
      const day = parseInt(clean.substring(6, 8), 10);
      return new Date(Date.UTC(year, month, day, 0, 0, 0));
    }
  } catch {
    return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 0, 0, 0));
  }
};

const cleanIcsValue = (val: string): string => {
  const parts = val.split(':');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    if (/\d+/.test(lastPart)) {
      return lastPart;
    }
  }
  return val;
};

// Alignment helper for exdate/rdate
const parseIcsDateWithValueTime = (icsValue: string, referenceTime: Date): Date => {
  const parsed = parseIcsToUtcDate(icsValue);
  const clean = icsValue.trim().replace(/Z$/, '');
  if (!clean.includes('T')) {
    parsed.setUTCHours(referenceTime.getUTCHours());
    parsed.setUTCMinutes(referenceTime.getUTCMinutes());
    parsed.setUTCSeconds(referenceTime.getUTCSeconds());
    parsed.setUTCMilliseconds(referenceTime.getUTCMilliseconds());
  }
  return parsed;
};

const formatDateForRRule = (date: Date): string => {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
};

const formatUtcDate = (date: Date): string => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatUtcTime = (date: Date): string => {
  const h = String(date.getUTCHours()).padStart(2, '0');
  const m = String(date.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

/**
 * What a VEVENT becomes on import.
 *
 * LAFINA labels everything it exports with `X-LAFINA-TYPE`, so a file from
 * this app round-trips exactly. Foreign calendars (e.g. university timetables)
 * become time blocks.
 */
const veventType = (xLafinaType: string | null | undefined): 'event' | 'time_block' =>
  (xLafinaType ?? '').trim().toLowerCase() === 'event' ? 'event' : 'time_block';

/** True when the file said what this is, rather than leaving it to be guessed. */
const isLafinaLabelled = (xLafinaType: string | null | undefined): boolean =>
  ['event', 'time_block'].includes((xLafinaType ?? '').trim().toLowerCase());

const resolveDtend = (vevent: any, dtstart: Date): Date => {
  if (vevent.dtend && vevent.dtend.value) {
    return parseIcsToUtcDate(vevent.dtend.value);
  }
  if (vevent.duration) {
    const durationMs = parseDuration(vevent.duration);
    return new Date(dtstart.getTime() + durationMs);
  }
  return new Date(dtstart.getTime() + 60 * 60 * 1000); // default: 1 hour
};

const expandRecurringEvent = (
  vevent: any,
  dtstart: Date,
  dtend: Date,
  rdates: string[],
): { date: string; startTime: string; endTime: string }[] => {
  const duration = dtend.getTime() - dtstart.getTime();
  const ruleSet = new RRuleSet();

  const rruleString = `DTSTART:${formatDateForRRule(dtstart)}\nRRULE:${vevent.rrule}`;
  const rule = rrulestr(rruleString, { forceset: false });
  ruleSet.rrule(rule instanceof RRule ? rule : (rule as RRuleSet).rrules()[0]);

  if (vevent.exdate) {
    for (const ex of vevent.exdate) {
      if (ex && ex.value) {
        const cleanEx = cleanIcsValue(ex.value);
        ruleSet.exdate(parseIcsDateWithValueTime(cleanEx, dtstart));
      }
    }
  }

  for (const rd of rdates) {
    ruleSet.rdate(parseIcsDateWithValueTime(rd, dtstart));
  }

  const expansionEnd = new Date(dtstart);
  expansionEnd.setFullYear(expansionEnd.getFullYear() + 2);

  const occurrences = ruleSet.between(dtstart, expansionEnd, true);

  return occurrences.map((occurrenceStart) => {
    const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
    return {
      date: formatUtcDate(occurrenceStart),
      startTime: formatUtcTime(occurrenceStart),
      endTime: formatUtcTime(occurrenceEnd),
    };
  });
};

const DATE_KEYS = ['DTSTART', 'DTEND', 'DUE', 'EXDATE', 'RDATE', 'RECURRENCE-ID'];
const STRICT_DATE_KEYS = ['DTSTART', 'DTEND', 'DUE'];
const ICS_DATE_TIME = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?Z?$/i;

/** A real calendar date with an optional real time, nothing else. */
const isStrictIcsDateTime = (value: string): boolean => {
  const clean = value.trim();
  const match = ICS_DATE_TIME.exec(clean);
  if (!match) return false;
  if (!isRealDate(`${match[1]}-${match[2]}-${match[3]}`)) return false;
  if (match[4] === undefined) return !/Z$/i.test(clean);
  return Number(match[4]) < 24 && Number(match[5]) < 60 && Number(match[6] ?? '0') < 60;
};

/**
 * Normalize CRLF to LF, unfold lines, and drop any VEVENT/VTODO whose date
 * value is not a real date (AGY-PORT 08). It used to be moved to today, which
 * invented a time the file never said; now it is skipped and counted.
 */
const sanitizeIcsContent = (icsContent: string): { content: string; skipped: number } => {
  const normalized = icsContent.replace(/\r\n/g, '\n');
  const unfoldedLines: string[] = [];
  const rawLines = normalized.split('\n');
  
  for (const line of rawLines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (unfoldedLines.length > 0) {
        unfoldedLines[unfoldedLines.length - 1] += line.substring(1);
      }
    } else if (line.trim().length > 0) {
      unfoldedLines.push(line);
    }
  }

  const isComponent = (value: string): boolean =>
    ['VEVENT', 'VTODO'].includes(value.trim().toUpperCase());
  const out: string[] = [];
  let component: string[] | null = null;
  let invalid = false;
  let skipped = 0;
  for (const line of unfoldedLines) {
    const colonIndex = line.indexOf(':');
    const fullKey = colonIndex === -1 ? line : line.substring(0, colonIndex);
    const value = colonIndex === -1 ? '' : line.substring(colonIndex + 1).trim();
    const baseKey = fullKey.split(';')[0].toUpperCase();
    if (!component) {
      if (baseKey === 'BEGIN' && isComponent(value)) {
        component = [line];
        invalid = false;
      } else {
        out.push(line);
      }
      continue;
    }
    component.push(line);
    if (DATE_KEYS.includes(baseKey)) {
      const cleanValue = cleanIcsValue(value);
      if (STRICT_DATE_KEYS.includes(baseKey)) {
        if (!isStrictIcsDateTime(cleanValue)) invalid = true;
      } else if (!/^\d{8}$/.test(cleanValue.replace(/Z$/, '').split('T')[0])) {
        invalid = true;
      }
    }
    if (baseKey === 'END' && isComponent(value)) {
      if (invalid) skipped += 1;
      else out.push(...component);
      component = null;
    }
  }
  if (component) {
    if (invalid) skipped += 1;
    else out.push(...component);
  }

  return { content: out.join('\n'), skipped };
};

interface IcsWall {
  date: string;
  time?: string;
  /** Which of two instants, when the converted wall time happens twice here. */
  fold?: FoldChoice | null;
}

/**
 * The device-local wall date and time of one DTSTART/DTEND (AGY-PORT 08). A
 * UTC value or a known TZID is converted exactly into this device's timezone;
 * a floating value, or one whose zone the device cannot resolve, is kept as
 * written, as before. A TZID time the clocks skip is invalid, never moved.
 *
 * `rawValue` is the value exactly as the file wrote it: ical-js-parser appends
 * a `Z` to floating times, so only the file text can tell UTC from floating.
 * Without it the value is treated as floating, as before this phase.
 */
const readIcsWall = (
  prop: { value?: string; timezone?: string } | undefined,
  rawValue: string | undefined,
): IcsWall | 'invalid' => {
  const digits = cleanIcsValue(prop?.value ?? '').trim().replace(/Z$/i, '');
  const match = ICS_DATE_TIME.exec(digits);
  if (!match || !isStrictIcsDateTime(digits)) return 'invalid';
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  if (match[4] === undefined) return { date };
  const time = `${match[4]}:${match[5]}`;
  const here = deviceTimeZone();
  const isUtc = rawValue !== undefined && /Z$/i.test(cleanIcsValue(rawValue).trim());
  let instantMs: number | null = null;
  if (here && isUtc) {
    instantMs = Date.parse(`${date}T${time}:00Z`);
  } else if (here && prop?.timezone && isKnownTimeZone(prop.timezone)) {
    try {
      // RFC 5545: a repeated TZID time means its first occurrence.
      instantMs = Date.parse(localToUtc(date, time, prop.timezone, 'earlier'));
    } catch {
      return 'invalid';
    }
  }
  if (instantMs === null || !here) return { date, time };
  const local = localDateTime(new Date(instantMs).toISOString(), here);
  const candidates = wallTimeCandidates(local.date, local.time, here);
  const fold: FoldChoice | null =
    candidates.length > 1 ? (candidates[0] === instantMs ? 'earlier' : 'later') : null;
  return { date: local.date, time: local.time, fold };
};

/** Wall-clock minutes from one ICS wall to another, ignoring timezones. */
const wallSpanMinutes = (from: IcsWall, to: IcsWall): number =>
  (Date.parse(`${to.date}T${to.time ?? '00:00'}:00Z`) -
    Date.parse(`${from.date}T${from.time ?? '00:00'}:00Z`)) /
  60000;

/**
 * Parses an iCalendar string back into LAFINA tasks, events, and time blocks.
 * Supports unfolding lines and parsing custom properties.
 * 
 * @param icsContent The iCalendar file content string.
 * @returns Parsed events, time blocks, and tasks.
 */
export const parseIcsString = (
  icsContent: string
): {
  events: Omit<Event, 'userId' | 'createdAt' | 'updatedAt'>[];
  blocks: Omit<TimeBlock, 'userId' | 'createdAt' | 'updatedAt'>[];
  tasks: Omit<Task, 'userId' | 'createdAt' | 'updatedAt'>[];
  /** Items left out because a date or time was invalid or impossible (AGY-PORT 08). */
  skipped: number;
} => {
  const events: Omit<Event, 'userId' | 'createdAt' | 'updatedAt'>[] = [];
  const blocks: Omit<TimeBlock, 'userId' | 'createdAt' | 'updatedAt'>[] = [];
  const tasks: Omit<Task, 'userId' | 'createdAt' | 'updatedAt'>[] = [];

  const { content: sanitized, skipped: invalidComponents } = sanitizeIcsContent(icsContent);
  let skipped = invalidComponents;
  const unfoldedLines = sanitized.split('\n');

  // Step 2: Scan unfolded lines to collect all RDATEs by UID (needed because ical-js-parser only keeps last RDATE)
  const rdatesByUid: { [uid: string]: string[] } = {};
  let scanUid: string | null = null;
  for (const line of unfoldedLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const fullKey = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1);
    const baseKey = fullKey.split(';')[0].toUpperCase();

    if (baseKey === 'BEGIN' && value.toUpperCase() === 'VEVENT') {
      scanUid = null;
    } else if (baseKey === 'UID') {
      scanUid = value.trim();
    } else if (baseKey === 'RDATE' && scanUid) {
      if (!rdatesByUid[scanUid]) {
        rdatesByUid[scanUid] = [];
      }
      const cleanVal = cleanIcsValue(value);
      const parts = cleanVal.split(',');
      for (const part of parts) {
        if (part.trim()) {
          rdatesByUid[scanUid].push(part.trim());
        }
      }
    }
  }

  // AGY-PORT 08: DTSTART/DTEND exactly as written, per non-override VEVENT UID,
  // so a floating time is never mistaken for UTC (see readIcsWall).
  const rawTimesByUid: { [uid: string]: { dtstart?: string; dtend?: string } } = {};
  let rawCurrent: { uid?: string; dtstart?: string; dtend?: string; override: boolean } | null = null;
  for (const line of unfoldedLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const baseKey = line.substring(0, colonIndex).split(';')[0].toUpperCase();
    const value = line.substring(colonIndex + 1).trim();
    if (baseKey === 'BEGIN' && value.toUpperCase() === 'VEVENT') {
      rawCurrent = { override: false };
    } else if (rawCurrent) {
      if (baseKey === 'UID') rawCurrent.uid = value;
      else if (baseKey === 'DTSTART') rawCurrent.dtstart = value;
      else if (baseKey === 'DTEND') rawCurrent.dtend = value;
      else if (baseKey === 'RECURRENCE-ID') rawCurrent.override = true;
      else if (baseKey === 'END' && value.toUpperCase() === 'VEVENT') {
        if (rawCurrent.uid && !rawCurrent.override && !(rawCurrent.uid in rawTimesByUid)) {
          rawTimesByUid[rawCurrent.uid] = { dtstart: rawCurrent.dtstart, dtend: rawCurrent.dtend };
        }
        rawCurrent = null;
      }
    }
  }

  // Step 3: Parse with ical-js-parser
  const parsed = ICalParser.toJSON(sanitized);
  const rawEvents = parsed.events || [];
  const rawTodos = parsed.todos || [];

  const nonOverrides = rawEvents.filter(e => !e.recurrenceId);
  const overrides = rawEvents.filter(e => e.recurrenceId);

  // Process VEVENTs
  for (const vevent of nonOverrides) {
    const type = veventType(vevent.xLafinaType);
    const uid = vevent.uid || 'imported_' + Math.random().toString(36).substring(2, 9);
    const summary = unescapeText(vevent.summary || 'Untitled');
    const location = vevent.location ? unescapeText(vevent.location) : null;
    const color = vevent.xLafinaColor || '#2196F3';
    const categoryDefault =
      type === 'time_block' && isLafinaLabelled(vevent.xLafinaType) ? 'Academic' : '';
    const category = unescapeText(vevent.categories || categoryDefault);
    const notes = vevent.description ? unescapeText(vevent.description) : undefined;
    const rrule = vevent.rrule || null;

    if (!vevent.dtstart || !vevent.dtstart.value) continue;

    const dtstart = parseIcsToUtcDate(vevent.dtstart.value);
    const dtend = resolveDtend(vevent, dtstart);

    if (!rrule) {
      const raw = vevent.uid ? rawTimesByUid[vevent.uid] : undefined;
      const parsedStart = readIcsWall(vevent.dtstart, raw?.dtstart);
      const parsedEnd = vevent.dtend ? readIcsWall(vevent.dtend, raw?.dtend) : null;
      if (parsedStart === 'invalid' || parsedEnd === 'invalid') {
        skipped += 1;
        continue;
      }
      if (parsedStart.time && parsedEnd?.time) {
        const span = wallSpanMinutes(parsedStart, parsedEnd);
        // LAFINA's own older exports wrote an overnight end on the start date.
        const legacyOvernight =
          isLafinaLabelled(vevent.xLafinaType) &&
          parsedEnd.date === parsedStart.date &&
          parsedEnd.time !== parsedStart.time;
        if (!legacyOvernight && (span <= 0 || span > 24 * 60)) {
          // An end before its start, or longer than a day, cannot be one
          // Calendar item; it used to be cut to the start date silently.
          skipped += 1;
          continue;
        }
      }

      if (type === 'time_block') {
        blocks.push({
          id: uid,
          title: summary,
          date: parsedStart.date,
          startTime: parsedStart.time || '09:00',
          endTime: parsedEnd?.time || '10:00',
          color,
          category,
          notes,
          recurrenceRule: null,
        });
      } else {
        events.push({
          id: uid,
          title: summary,
          date: parsedStart.date,
          startTime: parsedStart.time || '12:00',
          endTime: parsedEnd?.time || '13:00',
          location,
          recurrenceRule: null,
          startFold: parsedStart.fold ?? null,
          endFold: parsedEnd?.fold ?? null,
        });
      }
    } else {
      const rdates = rdatesByUid[uid] || [];
      const expanded = expandRecurringEvent(vevent, dtstart, dtend, rdates);

      expanded.forEach((occurrence, idx) => {
        const occurrenceId = `${uid}_${idx}`;
        if (type === 'time_block') {
          blocks.push({
            id: occurrenceId,
            title: summary,
            date: occurrence.date,
            startTime: occurrence.startTime,
            endTime: occurrence.endTime,
            color,
            category,
            notes,
            recurrenceRule: null,
          });
        } else {
          events.push({
            id: occurrenceId,
            title: summary,
            date: occurrence.date,
            startTime: occurrence.startTime,
            endTime: occurrence.endTime,
            location,
            recurrenceRule: null,
          });
        }
      });
    }
  }

  // Apply RECURRENCE-ID overrides
  for (const override of overrides) {
    const overrideUid = override.uid;
    if (!overrideUid || !override.recurrenceId || !override.recurrenceId.value) continue;
    const overrideDate = parseIcsToUtcDate(override.recurrenceId.value);
    const type = veventType(override.xLafinaType);

    if (type === 'time_block') {
      const idx = blocks.findIndex(
        ev => {
          if (!ev.id.startsWith(overrideUid)) return false;
          const occurrenceStart = parseIcsToUtcDate(formatIcsDateTime(ev.date, ev.startTime));
          return Math.abs(occurrenceStart.getTime() - overrideDate.getTime()) < 86400000;
        }
      );
      if (idx !== -1) {
        const dtstart = parseIcsToUtcDate(override.dtstart.value);
        const dtend = resolveDtend(override, dtstart);
        blocks[idx] = {
          id: blocks[idx].id,
          title: override.summary || blocks[idx].title,
          date: formatUtcDate(dtstart),
          startTime: formatUtcTime(dtstart),
          endTime: formatUtcTime(dtend),
          color: override.xLafinaColor || blocks[idx].color,
          category: override.categories || blocks[idx].category,
          notes: override.description ? unescapeText(override.description) : blocks[idx].notes,
          recurrenceRule: blocks[idx].recurrenceRule,
        };
      }
    } else {
      const idx = events.findIndex(
        ev => {
          if (!ev.id.startsWith(overrideUid)) return false;
          const occurrenceStart = parseIcsToUtcDate(formatIcsDateTime(ev.date, ev.startTime));
          return Math.abs(occurrenceStart.getTime() - overrideDate.getTime()) < 86400000;
        }
      );
      if (idx !== -1) {
        const dtstart = parseIcsToUtcDate(override.dtstart.value);
        const dtend = resolveDtend(override, dtstart);
        events[idx] = {
          id: events[idx].id,
          title: override.summary || events[idx].title,
          date: formatUtcDate(dtstart),
          startTime: formatUtcTime(dtstart),
          endTime: formatUtcTime(dtend),
          location: override.location !== undefined ? override.location : events[idx].location,
          recurrenceRule: events[idx].recurrenceRule,
        };
      }
    }
  }

  // Process VTODOs
  for (const todo of rawTodos) {
    const uid = todo.uid || 'imported_' + Math.random().toString(36).substring(2, 9);
    const summary = unescapeText(todo.summary || 'Untitled Task');
    const description = todo.description ? unescapeText(todo.description) : null;
    const categories = unescapeText(todo.categories || 'General');
    const status = todo.status || 'NEEDS-ACTION';
    const priorityVal = parseInt(todo.priority || '5', 10);
    const dueVal = cleanIcsValue(todo.due || '');
    const rrule = todo.rrule || null;

    let priority: 'High' | 'Medium' | 'Low' = 'Medium';
    if (priorityVal > 0 && priorityVal <= 4) priority = 'High';
    else if (priorityVal >= 5 && priorityVal <= 8) priority = 'Medium';
    else if (priorityVal >= 9) priority = 'Low';

    let dueDate: string | null = null;
    let dueTime: string | null = null;
    if (dueVal) {
      const dueParsed = parseIcsDateTime(dueVal);
      dueDate = dueParsed.date;
      dueTime = dueParsed.time || null;
    }

    tasks.push({
      id: uid,
      title: summary,
      dueDate,
      dueTime,
      isCompleted: status.toUpperCase() === 'COMPLETED',
      priority,
      category: categories,
      notes: description,
      recurrenceRule: rrule,
    });
  }

  return { events, blocks, tasks, skipped };
};
