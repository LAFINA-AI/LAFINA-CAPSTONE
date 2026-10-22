import type {EventDraft, TaskDraft} from './planner';
import {
  assertDate,
  assertTimezone,
  assertUtc,
  expandWeekly,
  localDateTime,
} from './scheduleTime';

export function validateToken(token: string) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(token)) {
    throw new Error('Invalid operation token.');
  }
}
export function validateLead(lead: number | null) {
  if (lead !== null && (!Number.isInteger(lead) || lead < 0 || lead > 120)) {
    throw new Error('Reminder lead must be an integer from 0 to 120 minutes.');
  }
}
function common(draft: {title: string; notes: string; timezone: string}) {
  if (
    typeof draft.title !== 'string' ||
    typeof draft.notes !== 'string' ||
    !draft.title.trim() ||
    [...draft.title].length > 160 ||
    [...draft.notes].length > 4000
  ) {
    throw new Error(
      'Enter a title (1–160 characters) and notes up to 4000 characters.',
    );
  }
  assertTimezone(draft.timezone);
}
export function decodeRecurrence(value: unknown): EventDraft['recurrence'] {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid weekly class rule.');
  }
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).some(
      key => !['weekdays', 'untilDate', 'fold'].includes(key),
    ) ||
    !Array.isArray(row.weekdays) ||
    row.weekdays.length < 1 ||
    row.weekdays.length > 7 ||
    row.weekdays.some(
      day =>
        typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6,
    ) ||
    new Set(row.weekdays).size !== row.weekdays.length ||
    typeof row.untilDate !== 'string' ||
    (row.fold !== undefined && row.fold !== 'earlier' && row.fold !== 'later')
  ) {
    throw new Error(
      'Use a bounded weekly rule with unique weekdays and an optional explicit fold.',
    );
  }
  assertDate(row.untilDate);
  return {
    weekdays: row.weekdays as number[],
    untilDate: row.untilDate,
    ...(row.fold === undefined ? {} : {fold: row.fold}),
  };
}
export function validateTask(draft: TaskDraft, lead: number | null) {
  common(draft);
  validateLead(lead);
  if (
    !['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(draft.status)
  ) {
    throw new Error('Invalid task status.');
  }
  if (draft.dueAt !== null) {
    assertUtc(draft.dueAt);
  }
  if (draft.dueDate !== null) {
    assertDate(draft.dueDate);
  }
  if (draft.dueAt !== null && draft.dueDate !== null) {
    throw new Error('Choose a date-only or timed due date.');
  }
  if (lead !== null && draft.dueAt === null) {
    throw new Error(
      'A reminder needs an explicit due time. Date-only tasks have no invented alarm time.',
    );
  }
}
export function eventOccurrences(draft: EventDraft): string[] {
  if (!draft.recurrence) {
    return [draft.startAt];
  }
  const local = localDateTime(draft.startAt, draft.timezone);
  return expandWeekly({
    startDate: local.date,
    time: local.time,
    timezone: draft.timezone,
    rule: draft.recurrence,
    fold: draft.recurrence.fold,
    fromUtc: draft.startAt,
    toUtc: new Date(
      Math.min(
        Date.parse(draft.startAt) + 367 * 86400000,
        Date.parse('2100-12-31T23:59:59.999Z'),
      ),
    ).toISOString(),
  });
}
export function validateEvent(draft: EventDraft, lead: number | null) {
  common(draft);
  validateLead(lead);
  assertUtc(draft.startAt);
  assertUtc(draft.endAt);
  decodeRecurrence(draft.recurrence);
  if (!['ACTIVE', 'CANCELLED'].includes(draft.status)) {
    throw new Error('Invalid event status.');
  }
  if (draft.endAt <= draft.startAt) {
    throw new Error('Event end must be after its start.');
  }
  if (draft.recurrence) {
    if (Date.parse(draft.endAt) - Date.parse(draft.startAt) > 86400000) {
      throw new Error('Weekly classes must last at most 24 hours.');
    }
    if (
      new Date(draft.startAt).getUTCSeconds() !== 0 ||
      new Date(draft.startAt).getUTCMilliseconds() !== 0
    ) {
      throw new Error('Weekly classes use whole-minute start times.');
    }
    const occurrences = eventOccurrences(draft);
    if (occurrences[0] !== draft.startAt) {
      throw new Error(
        'The starting class must match a selected weekday and fold.',
      );
    }
  }
}
