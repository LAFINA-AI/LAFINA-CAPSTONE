import type {Reminder, ReminderCommand, ReminderJob} from '../domain/planner';
import {assertUtc, evaluateReminderTime} from '../domain/scheduleTime';
import {decodeJob, decodeReminder, str} from './plannerRows';
import type {LocalSqlConnection} from './preferencesRepository';

const unavailable = 'Awaiting Android reminder delivery reconciliation.';

/** Paired reminder/job SQL operations; the repository owns the transaction boundary. */
export function createReminderOperations(db: LocalSqlConnection) {
  function sourceReminders(kind: 'task' | 'event', id: string) {
    return db
      .execute(`SELECT * FROM reminders WHERE ${kind}_id = ?`, [id])
      .map(decodeReminder);
  }
  function cancel(kind: 'task' | 'event', id: string, at: string) {
    for (const reminder of sourceReminders(kind, id)) {
      if (['ACKNOWLEDGED', 'MISSED', 'CANCELLED'].includes(reminder.status)) {
        continue;
      }
      db.execute(
        "UPDATE reminders SET status='CANCELLED',version=version+1,last_outcome_at=? WHERE id=?",
        [at, reminder.id],
      );
      db.execute(
        "UPDATE reminder_jobs SET status='CANCELLED',generation=generation+1,delivery_state='UNAVAILABLE',delivery_reason=?,ringing_deadline=NULL,notified_at=NULL WHERE reminder_id=?",
        [unavailable, reminder.id],
      );
    }
  }
  function set(
    kind: 'task' | 'event',
    id: string,
    occurrences: string[],
    lead: number | null,
    at: string,
  ) {
    cancel(kind, id, at);
    if (lead === null) {
      return;
    }
    for (const occurrence of occurrences) {
      const runAt = new Date(
        Date.parse(occurrence) - lead * 60000,
      ).toISOString();
      assertUtc(runAt);
      const key = `${id}|${occurrence}`;
      const reminderId = `reminder:${key}`;
      const previous = db.execute('SELECT status FROM reminders WHERE id=?', [
        reminderId,
      ])[0];
      // Editing a class series/lead must not replay an already handled occurrence.
      // A different occurrence instant gets a new identity; rearming needs a later explicit API.
      if (
        previous &&
        ['ACKNOWLEDGED', 'MISSED'].includes(str(previous, 'status'))
      ) {
        continue;
      }
      db.execute(
        `INSERT INTO reminders(id,task_id,event_id,occurrence_key,scheduled_at,lead_minutes,status,version,last_outcome_at)
        VALUES(?,?,?,?,?,?,'SCHEDULED',1,NULL)
        ON CONFLICT(id) DO UPDATE SET scheduled_at=excluded.scheduled_at,lead_minutes=excluded.lead_minutes,status='SCHEDULED',version=reminders.version+1,last_outcome_at=NULL`,
        [
          reminderId,
          kind === 'task' ? id : null,
          kind === 'event' ? id : null,
          key,
          runAt,
          lead,
        ],
      );
      db.execute(
        `INSERT INTO reminder_jobs(id,reminder_id,occurrence_key,run_at,status,generation,attempt_count,delivery_state,delivery_reason)
        VALUES(?,?,?,?,'PENDING',1,0,'UNAVAILABLE',?)
        ON CONFLICT(reminder_id) DO UPDATE SET run_at=excluded.run_at,status='PENDING',generation=reminder_jobs.generation+1,attempt_count=0,delivery_state='UNAVAILABLE',delivery_reason=excluded.delivery_reason,ringing_deadline=NULL,notified_at=NULL`,
        [`job:${reminderId}`, reminderId, key, runAt, unavailable],
      );
    }
  }
  function apply(command: ReminderCommand, at: string): 'applied' | 'ignored' {
    const row = db.execute('SELECT * FROM reminders WHERE id=?', [
      command.id,
    ])[0];
    const jobRow = db.execute(
      'SELECT * FROM reminder_jobs WHERE reminder_id=?',
      [command.id],
    )[0];
    if (!row || !jobRow) {
      return 'ignored';
    }
    const reminder = decodeReminder(row);
    const job = decodeJob(jobRow);
    if (
      command.occurrenceKey !== reminder.occurrenceKey ||
      command.generation !== job.generation ||
      ['ACKNOWLEDGED', 'MISSED', 'CANCELLED'].includes(reminder.status)
    ) {
      return 'ignored';
    }
    let status: Reminder['status'];
    let jobStatus: ReminderJob['status'];
    let runAt = job.runAt;
    let generation = job.generation;
    let expired = false;
    if (command.action.kind === 'RING') {
      if (
        job.status !== 'PENDING' ||
        !['SCHEDULED', 'SNOOZED'].includes(reminder.status)
      ) {
        return 'ignored';
      }
      const policy = evaluateReminderTime(
        job.runAt,
        at,
        command.action.timezone,
        command.action.quietHours,
      );
      if (policy.kind === 'future') {
        return 'ignored';
      }
      if (policy.kind === 'missed') {
        status = 'MISSED';
        jobStatus = 'MISSED';
      } else if (policy.kind === 'quiet') {
        status = 'SNOOZED';
        jobStatus = 'PENDING';
        runAt = policy.nextAtUtc!;
        generation++;
      } else {
        status = 'RINGING';
        jobStatus = 'RINGING';
      }
    } else if (command.action.kind === 'CANCEL') {
      status = 'CANCELLED';
      jobStatus = 'CANCELLED';
      generation++;
    } else {
      if (reminder.status !== 'RINGING' || job.status !== 'RINGING') {
        return 'ignored';
      }
      const deadline = jobRow.ringing_deadline;
      if (deadline === null && command.action.kind !== 'MISS') {
        throw new Error(
          'Reminder response window is unavailable. Refresh its state.',
        );
      }
      if (deadline !== null) {
        if (typeof deadline !== 'string') {
          throw new Error('Invalid stored reminder response window.');
        }
        assertUtc(deadline);
      }
      // Android timeout delivery can be delayed. Manual controls must enforce
      // the same persisted response window rather than acknowledging a late ring.
      expired = deadline !== null && at >= deadline;
      if (expired || command.action.kind === 'MISS') {
        status = 'MISSED';
        jobStatus = 'MISSED';
      } else if (command.action.kind === 'ACK') {
        status = 'ACKNOWLEDGED';
        jobStatus = 'ACKNOWLEDGED';
      } else {
        const minutes = command.action.minutes;
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
          throw new Error('Snooze must be 1–120 whole minutes.');
        }
        runAt = new Date(Date.parse(at) + minutes * 60000).toISOString();
        assertUtc(runAt);
        generation++;
        status = 'SNOOZED';
        jobStatus = 'PENDING';
      }
    }
    db.execute(
      'UPDATE reminders SET status=?,version=version+1,last_outcome_at=? WHERE id=?',
      [status, at, reminder.id],
    );
    const ringingDeadline =
      status === 'RINGING'
        ? new Date(Date.parse(at) + 60000).toISOString()
        : null;
    db.execute(
      'UPDATE reminder_jobs SET status=?,run_at=?,generation=?,attempt_count=attempt_count+?,delivery_state=?,delivery_reason=?,ringing_deadline=?,notified_at=NULL WHERE id=?',
      [
        jobStatus,
        runAt,
        generation,
        status === 'RINGING' ? 1 : 0,
        status === 'MISSED' && job.deliveryState === 'FAILED'
          ? 'FAILED'
          : 'UNAVAILABLE',
        status === 'MISSED' && job.deliveryState === 'FAILED'
          ? job.deliveryReason
          : unavailable,
        ringingDeadline,
        job.id,
      ],
    );
    return expired ? 'ignored' : 'applied';
  }
  return {cancel, set, apply};
}
