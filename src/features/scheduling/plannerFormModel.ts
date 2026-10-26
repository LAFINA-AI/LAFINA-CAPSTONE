import type {
  AcademicEvent,
  EventDraft,
  Task,
  TaskDraft,
} from '../../core/domain/planner';
import type {Preferences} from '../../core/domain/preferences';
import {validateEvent, validateTask} from '../../core/domain/plannerValidation';
import {localDateTime, localToUtc} from '../../core/domain/scheduleTime';
import type {FoldChoice} from '../../core/domain/scheduleTime';

export type PlannerSaveDraft =
  | {kind: 'task'; draft: TaskDraft; reminderLeadMinutes: number | null}
  | {kind: 'event'; draft: EventDraft; reminderLeadMinutes: number | null};

export interface PlannerFormState {
  title: string;
  notes: string;
  timezone: string;
  dueKind: 'none' | 'date' | 'timed';
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  reminder: boolean;
  lead: string;
  repeat: boolean;
  weekdays: number[];
  until: string;
  fold: FoldChoice | undefined;
  endFold: FoldChoice | undefined;
}

function savedFold(
  at: string | null,
  timezone: string,
): FoldChoice | undefined {
  if (at === null) {
    return undefined;
  }
  const local = localDateTime(at, timezone);
  const earlier = localToUtc(local.date, local.time, timezone, 'earlier');
  const later = localToUtc(local.date, local.time, timezone, 'later');
  if (earlier === later) {
    return undefined;
  }
  return Date.parse(at) >= Date.parse(later) ? 'later' : 'earlier';
}

export function initialFormState(
  initial: Task | AcademicEvent | null,
  date: string,
  preferences: Preferences,
): PlannerFormState {
  const timezone = initial?.timezone ?? preferences.timezone;
  const task = initial && 'dueAt' in initial ? initial : null;
  const event = initial && 'startAt' in initial ? initial : null;
  const start = event
    ? localDateTime(event.startAt, timezone)
    : task?.dueAt
    ? localDateTime(task.dueAt, timezone)
    : {date: task?.dueDate ?? date, time: '09:00'};
  const end = event
    ? localDateTime(event.endAt, timezone)
    : {date: start.date, time: '10:00'};
  return {
    title: initial?.title ?? '',
    notes: initial?.notes ?? '',
    timezone,
    dueKind: task?.dueAt ? 'timed' : task?.dueDate ? 'date' : 'none',
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    reminder: initial?.reminderLeadMinutes != null,
    lead: String(initial?.reminderLeadMinutes ?? preferences.leadMinutes),
    repeat: event?.recurrence != null,
    weekdays: event?.recurrence?.weekdays ?? [weekday(start.date)],
    until: event?.recurrence?.untilDate ?? start.date,
    fold:
      event?.recurrence?.fold ??
      savedFold(event?.startAt ?? task?.dueAt ?? null, timezone),
    endFold: savedFold(event?.endAt ?? null, timezone),
  };
}

export function weekday(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** Conversion round-trips through the scheduling domain; gaps never roll forward. */
export function buildPlannerDraft(
  kind: 'task' | 'event',
  state: PlannerFormState,
  initial: Task | AcademicEvent | null,
): PlannerSaveDraft {
  const hasTime = kind === 'event' || state.dueKind === 'timed';
  const reminderLeadMinutes =
    hasTime && state.reminder
      ? /^\d+$/.test(state.lead.trim())
        ? Number(state.lead)
        : NaN
      : null;
  const common = {
    title: state.title.trim(),
    notes: state.notes,
    timezone: state.timezone.trim(),
  };
  function instant(
    label: 'Due time' | 'Start time' | 'End time',
    date: string,
    time: string,
    fold?: FoldChoice,
  ) {
    try {
      const savedAt = initial
        ? 'dueAt' in initial
          ? initial.dueAt
          : label === 'End time'
          ? initial.endAt
          : initial.startAt
        : null;
      // Older manually entered or QA records can contain seconds. A title-only
      // edit must not move an existing alarm back to the displayed minute.
      if (savedAt && initial?.timezone === common.timezone) {
        const savedLocal = localDateTime(savedAt, common.timezone);
        if (
          savedLocal.date === date &&
          savedLocal.time === time &&
          savedFold(savedAt, common.timezone) === fold
        ) {
          return savedAt;
        }
      }
      return localToUtc(date, time, common.timezone, fold);
    } catch (problem) {
      if (
        problem instanceof Error &&
        problem.message.includes('occurs twice')
      ) {
        throw new Error(
          `${label} occurs twice; choose the earlier or later occurrence.`,
        );
      }
      throw problem;
    }
  }
  if (kind === 'task') {
    const draft: TaskDraft = {
      ...common,
      dueAt:
        state.dueKind === 'timed'
          ? instant('Due time', state.startDate, state.startTime, state.fold)
          : null,
      dueDate: state.dueKind === 'date' ? state.startDate : null,
      status: initial && 'dueAt' in initial ? initial.status : 'TODO',
    };
    validateTask(draft, reminderLeadMinutes);
    return {kind, draft, reminderLeadMinutes};
  }
  const draft: EventDraft = {
    ...common,
    startAt: instant(
      'Start time',
      state.startDate,
      state.startTime,
      state.fold,
    ),
    endAt: instant('End time', state.endDate, state.endTime, state.endFold),
    recurrence: state.repeat
      ? {
          weekdays: [...state.weekdays].sort((a, b) => a - b),
          untilDate: state.until,
          ...(state.fold ? {fold: state.fold} : {}),
        }
      : null,
    status: initial && 'startAt' in initial ? initial.status : 'ACTIVE',
  };
  validateEvent(draft, reminderLeadMinutes);
  return {kind, draft, reminderLeadMinutes};
}

/** A past reminder can ring immediately within Android's delivery grace. */
export function hasPastSchedule(
  value: PlannerSaveDraft,
  now: number,
  localToday: string,
): boolean {
  const at = value.kind === 'task' ? value.draft.dueAt : value.draft.startAt;
  if (at) {
    const reminder = value.reminderLeadMinutes;
    return (
      Date.parse(at) < now ||
      (reminder !== null && Date.parse(at) - reminder * 60000 < now)
    );
  }
  return (
    value.kind === 'task' &&
    value.draft.dueDate !== null &&
    value.draft.dueDate < localToday
  );
}

export function clockPreview(time: string, format: '12h' | '24h'): string {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return 'Enter a 24-hour time such as 09:00 or 15:30.';
  }
  if (format === '24h') {
    return time;
  }
  const hour = Number(time.slice(0, 2));
  return `${hour % 12 || 12}:${time.slice(3)} ${hour < 12 ? 'AM' : 'PM'}`;
}
