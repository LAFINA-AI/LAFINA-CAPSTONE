import type {
  AcademicEvent,
  Reminder,
  ReminderJob,
  Task,
} from '../domain/planner';
import {
  decodeRecurrence,
  validateEvent,
  validateLead,
  validateTask,
} from '../domain/plannerValidation';
import {assertUtc, localDateTime, localToUtc} from '../domain/scheduleTime';

type Row = Record<string, unknown>;

export function str(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new Error('Invalid stored planner data.');
  }
  return value;
}
export function nullable(row: Row, key: string) {
  return row[key] === null ? null : str(row, key);
}
export function num(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('Invalid stored planner number.');
  }
  return value;
}
export function oneOf<T extends string>(
  value: string,
  options: readonly T[],
): T {
  const result = options.find(option => option === value);
  if (!result) {
    throw new Error('Invalid stored planner state.');
  }
  return result;
}
export function decodeTask(row: Row): Task {
  const task: Task = {
    id: str(row, 'id'),
    title: str(row, 'title'),
    notes: str(row, 'notes'),
    dueAt: nullable(row, 'due_at'),
    dueDate: nullable(row, 'due_date'),
    reminderLeadMinutes:
      row.reminder_lead_minutes === null
        ? null
        : num(row, 'reminder_lead_minutes'),
    timezone: str(row, 'timezone'),
    status: oneOf(str(row, 'status'), [
      'TODO',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ]),
    version: num(row, 'version'),
    createdAt: str(row, 'created_at'),
    updatedAt: str(row, 'updated_at'),
  };
  validateTask(task, task.reminderLeadMinutes);
  assertUtc(task.createdAt);
  assertUtc(task.updatedAt);
  return task;
}
export function decodeEvent(
  row: Row,
  options: {validateSeries?: boolean} = {},
): AcademicEvent {
  const recurrence = nullable(row, 'recurrence');
  const event: AcademicEvent = {
    id: str(row, 'id'),
    title: str(row, 'title'),
    notes: str(row, 'notes'),
    startAt: str(row, 'start_at'),
    endAt: str(row, 'end_at'),
    timezone: str(row, 'timezone'),
    recurrence:
      recurrence === null
        ? null
        : decodeRecurrence(JSON.parse(recurrence) as unknown),
    reminderLeadMinutes:
      row.reminder_lead_minutes === null
        ? null
        : num(row, 'reminder_lead_minutes'),
    status: oneOf(str(row, 'status'), ['ACTIVE', 'CANCELLED']),
    version: num(row, 'version'),
    createdAt: str(row, 'created_at'),
    updatedAt: str(row, 'updated_at'),
  };
  if (options.validateSeries !== false || event.recurrence === null) {
    validateEvent(event, event.reminderLeadMinutes);
  } else {
    // Product window queries must not expand an entire year merely to decode
    // each row. Preserve structural/start validation; requested occurrences
    // are still resolved strictly (including DST gaps/folds) by the query.
    validateEvent({...event, recurrence: null}, event.reminderLeadMinutes);
    const local = localDateTime(event.startAt, event.timezone);
    const firstDate = Date.parse(`${local.date}T00:00:00.000Z`);
    const lastDate = Date.parse(`${event.recurrence.untilDate}T00:00:00.000Z`);
    const days = (lastDate - firstDate) / 86400000 + 1;
    if (
      days < 1 ||
      days > 366 ||
      Date.parse(event.endAt) - Date.parse(event.startAt) > 86400000 ||
      new Date(event.startAt).getUTCSeconds() !== 0 ||
      new Date(event.startAt).getUTCMilliseconds() !== 0 ||
      !event.recurrence.weekdays.includes(new Date(firstDate).getUTCDay()) ||
      localToUtc(
        local.date,
        local.time,
        event.timezone,
        event.recurrence.fold,
      ) !== event.startAt
    ) {
      throw new Error('Invalid stored weekly class bounds or starting time.');
    }
  }
  assertUtc(event.createdAt);
  assertUtc(event.updatedAt);
  return event;
}
export function decodeReminder(row: Row): Reminder {
  const reminder: Reminder = {
    id: str(row, 'id'),
    taskId: nullable(row, 'task_id'),
    eventId: nullable(row, 'event_id'),
    occurrenceKey: str(row, 'occurrence_key'),
    scheduledAt: str(row, 'scheduled_at'),
    leadMinutes: num(row, 'lead_minutes'),
    status: oneOf(str(row, 'status'), [
      'SCHEDULED',
      'RINGING',
      'ACKNOWLEDGED',
      'SNOOZED',
      'MISSED',
      'CANCELLED',
    ]),
    version: num(row, 'version'),
    lastOutcomeAt: nullable(row, 'last_outcome_at'),
  };
  assertUtc(reminder.scheduledAt);
  if (reminder.lastOutcomeAt) {
    assertUtc(reminder.lastOutcomeAt);
  }
  validateLead(reminder.leadMinutes);
  return reminder;
}
export function decodeJob(row: Row): ReminderJob {
  const job: ReminderJob = {
    id: str(row, 'id'),
    reminderId: str(row, 'reminder_id'),
    occurrenceKey: str(row, 'occurrence_key'),
    runAt: str(row, 'run_at'),
    status: oneOf(str(row, 'status'), [
      'PENDING',
      'RINGING',
      'ACKNOWLEDGED',
      'MISSED',
      'CANCELLED',
    ]),
    generation: num(row, 'generation'),
    attemptCount: num(row, 'attempt_count'),
    deliveryState: oneOf(str(row, 'delivery_state'), [
      'UNAVAILABLE',
      'PENDING',
      'REGISTERED',
      'FAILED',
    ]),
    deliveryReason: nullable(row, 'delivery_reason'),
  };
  assertUtc(job.runAt);
  return job;
}
