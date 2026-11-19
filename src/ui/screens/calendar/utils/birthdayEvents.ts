import {db, tasksStore} from '../../../../storage';
import type {Event} from '../../../../storage';
import {mapRowToEvent} from '../../../../storage/tasksStore';
import {generateId} from '../../../../utils';

export const BIRTHDAYS_GROUP_ID = 'group:birthdays';
export const BIRTHDAY_ACCENT_COLOR = '#E91E63';

export const BIRTHDAY_RELATIONS = [
  'Family',
  'Friend',
  'Classmate',
  'Partner',
  'Other',
] as const;

export const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export interface BirthdayEntry {
  id: string;
  personName: string;
  month: number; // 1..12
  day: number; // 1..31
  birthYear: number | null;
  relation: string;
  notes: string;
  event: Event;
}

export interface SaveBirthdayInput {
  userId: string;
  id?: string;
  personName: string;
  month: number;
  day: number;
  birthYear?: number | null;
  relation?: string;
  notes?: string;
}

/** True when an Event row belongs to the Birthdays & Anniversaries group. */
export function isBirthdayEvent(
  event: Pick<Event, 'linkedCalendarBlock' | 'location'>,
): boolean {
  if (event.linkedCalendarBlock === BIRTHDAYS_GROUP_ID) return true;
  return (
    typeof event.location === 'string' &&
    event.location.startsWith('[BIRTHDAY]')
  );
}

/** Encodes structured birthday metadata into `event.location`. */
export function formatBirthdayLocation(meta: {
  birthYear?: number | null;
  relation?: string;
  notes?: string;
}): string {
  const parts = ['[BIRTHDAY]'];
  if (
    typeof meta.birthYear === 'number' &&
    meta.birthYear >= 1900 &&
    meta.birthYear <= 2100
  ) {
    parts.push(`Year: ${meta.birthYear}`);
  }
  const rel = meta.relation?.trim().replace(/\|/g, '·');
  if (rel) {
    parts.push(`Relation: ${rel}`);
  }
  const note = meta.notes?.trim().replace(/\|/g, '·');
  if (note) {
    parts.push(`Note: ${note}`);
  }
  return parts.join(' | ');
}

/** Parses a stored birthday Event back into a structured BirthdayEntry. */
export function parseBirthdayEvent(event: Event): BirthdayEntry | null {
  if (!isBirthdayEvent(event)) return null;
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.date ?? '');
  if (!dateParts) return null;
  const month = Number(dateParts[2]);
  const day = Number(dateParts[3]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;

  let personName = event.title.trim();
  personName = personName.replace(/^🎂\s*/, '');
  personName = personName.replace(/'s Birthday$/i, '').trim();
  if (!personName) personName = event.title.trim();

  let birthYear: number | null = null;
  let relation = '';
  let notes = '';

  const loc = (event.location ?? '').trim();
  if (loc) {
    for (const segment of loc.split('|').map(s => s.trim())) {
      if (segment === '[BIRTHDAY]') continue;
      const yrMatch = /^Year\s*:\s*(\d{4})$/i.exec(segment);
      if (yrMatch) {
        birthYear = Number(yrMatch[1]);
        continue;
      }
      const relMatch = /^Relation\s*:\s*(.+)$/i.exec(segment);
      if (relMatch) {
        relation = relMatch[1].trim();
        continue;
      }
      const noteMatch = /^Note\s*:\s*(.+)$/i.exec(segment);
      if (noteMatch) {
        notes = noteMatch[1].trim();
      }
    }
  }

  return {
    id: event.id,
    personName,
    month,
    day,
    birthYear,
    relation,
    notes,
    event,
  };
}

export function formatBirthdayDisplayTitle(entry: BirthdayEntry): string {
  return `🎂 ${entry.personName}'s Birthday`;
}

export function formatBirthdaySubtitle(
  entry: BirthdayEntry,
  targetYear?: number,
): string {
  if (entry.birthYear && targetYear && targetYear > entry.birthYear) {
    const age = targetYear - entry.birthYear;
    return entry.relation
      ? `Turns ${age} · ${entry.relation}`
      : `Birthday · Turns ${age}`;
  }
  return entry.relation ? `Birthday · ${entry.relation}` : 'Birthday';
}

export function formatBirthdayMonthDay(month: number, day: number): string {
  const mon = SHORT_MONTH_NAMES[month - 1] ?? 'Jan';
  return `${mon} ${day}`;
}

/** Reads all saved birthday entries for one user, sorted by month and day. */
export function getBirthdays(userId: string): BirthdayEntry[] {
  try {
    const rows =
      db.executeSync(
        `SELECT * FROM events
         WHERE user_id = ? AND deleted_at IS NULL
           AND (linked_calendar_block = ? OR location LIKE '[BIRTHDAY]%')
         ORDER BY substr(date, 6, 5) ASC, title ASC`,
        [userId, BIRTHDAYS_GROUP_ID],
      ).rows ?? [];
    const parsed: BirthdayEntry[] = [];
    for (const row of rows) {
      const entry = parseBirthdayEvent(mapRowToEvent(row));
      if (entry) parsed.push(entry);
    }
    return parsed.sort(
      (a, b) =>
        a.month - b.month ||
        a.day - b.day ||
        a.personName.localeCompare(b.personName),
    );
  } catch (error) {
    console.error('[birthdayEvents] Error loading birthdays:', error);
    return [];
  }
}

/** Validates month/day and inserts or updates a recurring yearly birthday Event. */
export function saveBirthday(input: SaveBirthdayInput): void {
  const name = input.personName
    .trim()
    .replace(/^🎂\s*/, '')
    .replace(/'s Birthday$/i, '')
    .trim();
  if (!name) throw new Error('Please enter a name.');
  const month = Math.max(1, Math.min(12, Math.floor(input.month)));
  const yearForClamp =
    typeof input.birthYear === 'number' &&
    input.birthYear >= 1900 &&
    input.birthYear <= 2100
      ? Math.floor(input.birthYear)
      : 2000; // Leap year so Feb 29 is preserved when year is omitted.
  const maxDay = new Date(yearForClamp, month, 0).getDate();
  const day = Math.max(1, Math.min(maxDay, Math.floor(input.day)));
  const dateStr = `${yearForClamp}-${String(month).padStart(2, '0')}-${String(
    day,
  ).padStart(2, '0')}`;
  const title = `${name}'s Birthday`;
  const location = formatBirthdayLocation({
    birthYear:
      typeof input.birthYear === 'number' &&
      input.birthYear >= 1900 &&
      input.birthYear <= 2100
        ? Math.floor(input.birthYear)
        : null,
    relation: input.relation,
    notes: input.notes,
  });

  if (input.id) {
    tasksStore.updateEvent({
      id: input.id,
      title,
      date: dateStr,
      startTime: '00:00',
      endTime: '23:59',
      location,
      linkedCalendarBlock: BIRTHDAYS_GROUP_ID,
      recurrenceRule: 'FREQ=YEARLY',
    });
  } else {
    tasksStore.insertEvent({
      id: generateId('event'),
      userId: input.userId,
      title,
      date: dateStr,
      startTime: '00:00',
      endTime: '23:59',
      location,
      linkedCalendarBlock: BIRTHDAYS_GROUP_ID,
      recurrenceRule: 'FREQ=YEARLY',
    });
  }
}

export function deleteBirthday(eventId: string): void {
  tasksStore.deleteEvent(eventId);
}
