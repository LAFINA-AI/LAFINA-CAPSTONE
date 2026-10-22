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
import {assertUtc} from '../domain/scheduleTime';

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
export function decodeEvent(row: Row): AcademicEvent {
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
  validateEvent(event, event.reminderLeadMinutes);
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
