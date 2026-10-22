import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {defaultPreferences} from '../src/core/domain/preferences';
import type {
  ChatMessage,
  ReminderCommand,
  ReminderJob,
} from '../src/core/domain/planner';
import {createPlannerRepository} from '../src/core/storage/plannerRepository';
import {createPreferencesRepository} from '../src/core/storage/preferencesRepository';
import {
  createPlannerFixture,
  eventDraft,
  failOnce,
  fixtureNow,
  reminderCommand,
  taskDraft,
} from './helpers/plannerFixtures';

type Fixture = ReturnType<typeof createPlannerFixture>;
const ring = {
  kind: 'RING' as const,
  timezone: 'Asia/Manila',
  quietHours: null,
};

function firstJob(fixture: Fixture): ReminderJob {
  const job = fixture.repository.snapshot().jobs[0];
  if (!job) {
    throw new Error('Fixture must have a reminder job.');
  }
  return job;
}

function receiptCount(fixture: Fixture): number {
  return Number(
    fixture.sql.execute('SELECT COUNT(*) AS count FROM operation_receipts')[0]
      ?.count,
  );
}

describe('planner repository with real host SQLite and an injected clock', () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = createPlannerFixture();
  });
  afterEach(() => fixture.close());

  it('bounds the debug snapshot at SQL and array boundaries while preserving records beyond the view', () => {
    const numbers = `WITH RECURSIVE numbers(n) AS (
      SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<1001
    )`;
    fixture.sql.execute(`${numbers}
      INSERT INTO tasks (id,title,notes,due_at,timezone,status,version,created_at,updated_at)
      SELECT printf('bulk_task_%04d',n),'Synthetic task','','2026-10-22T09:00:00.000Z',
        'Asia/Manila','TODO',1,'${fixtureNow}','${fixtureNow}' FROM numbers`);
    fixture.sql.execute(`${numbers}
      INSERT INTO events (id,title,notes,start_at,end_at,timezone,status,version,created_at,updated_at)
      SELECT printf('bulk_event_%04d',n),'Synthetic event','','2026-10-22T09:00:00.000Z',
        '2026-10-22T10:00:00.000Z','Asia/Manila','ACTIVE',1,'${fixtureNow}','${fixtureNow}' FROM numbers`);
    fixture.sql.execute(`${numbers}
      INSERT INTO reminders (id,task_id,event_id,occurrence_key,scheduled_at,lead_minutes,status,version)
      SELECT printf('bulk_reminder_%04d',n),printf('bulk_task_%04d',n),NULL,printf('bulk_occurrence_%04d',n),
        '2026-10-22T08:45:00.000Z',15,'SCHEDULED',1 FROM numbers`);
    fixture.sql.execute(`${numbers}
      INSERT INTO reminder_jobs (id,reminder_id,occurrence_key,run_at,status,generation,attempt_count)
      SELECT printf('bulk_job_%04d',n),printf('bulk_reminder_%04d',n),printf('bulk_occurrence_%04d',n),
        '2026-10-22T08:45:00.000Z','PENDING',1,0 FROM numbers`);
    const queries: {sql: string; rows: number}[] = [];
    const repo = createPlannerRepository(
      {
        execute(statement, params) {
          const rows = fixture.sql.execute(statement, params);
          queries.push({sql: statement, rows: rows.length});
          return rows;
        },
      },
      fixture.clock,
    );
    const snapshot = repo.snapshot();
    expect(snapshot.truncated).toBe(true);
    expect([
      snapshot.tasks.length,
      snapshot.events.length,
      snapshot.reminders.length,
      snapshot.jobs.length,
    ]).toEqual([500, 500, 500, 500]);
    expect(queries).toHaveLength(4);
    queries.forEach(query => {
      expect(query.sql).toMatch(/LIMIT 501$/);
      expect(query.rows).toBe(501);
    });
    expect(snapshot.tasks.at(-1)?.id).toBe('bulk_task_0500');
    expect(snapshot.jobs.at(-1)?.id).toBe('bulk_job_0500');
    ['tasks', 'events', 'reminders', 'reminder_jobs'].forEach(table => {
      expect(
        fixture.sql.execute(`SELECT COUNT(*) AS count FROM ${table}`),
      ).toEqual([{count: 1001}]);
    });
  });

  it('keeps the four-key snapshot contract for views that have not overflowed', () => {
    expect(fixture.repository.snapshot()).toEqual({
      tasks: [],
      events: [],
      reminders: [],
      jobs: [],
    });
    expect(Object.keys(fixture.repository.snapshot()).sort()).toEqual([
      'events',
      'jobs',
      'reminders',
      'tasks',
    ]);
  });

  it('creates and edits independent task/event records with bound text and durable versions', () => {
    const repo = fixture.repository;
    const task = repo.createTask({
      token: 'create_task',
      draft: taskDraft({title: "O'Neil's reading; DROP TABLE tasks;"}),
      reminderLeadMinutes: 15,
    });
    const event = repo.createEvent({
      token: 'create_event',
      draft: eventDraft(),
      reminderLeadMinutes: 10,
    });
    expect(task.version).toBe(1);
    expect(repo.snapshot().tasks).toEqual([task]);
    const updated = repo.updateTask({
      token: 'edit_task',
      id: task.id,
      expectedVersion: 1,
      draft: taskDraft({title: 'Finished reading', status: 'COMPLETED'}),
      reminderLeadMinutes: 15,
    });
    const cancelled = repo.updateEvent({
      token: 'edit_event',
      id: event.id,
      expectedVersion: 1,
      draft: eventDraft({status: 'CANCELLED'}),
      reminderLeadMinutes: 10,
    });
    expect(updated).toMatchObject({version: 2, status: 'COMPLETED'});
    expect(cancelled).toMatchObject({version: 2, status: 'CANCELLED'});
    expect(repo.snapshot().jobs.every(job => job.status === 'CANCELLED')).toBe(
      true,
    );
    expect(
      repo.upcoming(fixtureNow, '2026-10-23T08:00:00.000Z', 'Asia/Manila'),
    ).toEqual([]);
  });

  it('queries a half-open UTC window, local date-only tasks and overlapping events', () => {
    const repo = fixture.repository;
    const drafts = [
      taskDraft({title: 'Before', dueAt: '2026-10-22T15:59:59.999Z'}),
      taskDraft({title: 'At start', dueAt: '2026-10-22T16:00:00.000Z'}),
      taskDraft({title: 'At end', dueAt: '2026-10-23T16:00:00.000Z'}),
      taskDraft({title: 'Date only', dueAt: null, dueDate: '2026-10-23'}),
      taskDraft({title: 'Earlier date', dueAt: null, dueDate: '2026-10-22'}),
      taskDraft({
        title: 'Completed',
        dueAt: null,
        dueDate: '2026-10-23',
        status: 'COMPLETED',
      }),
    ];
    drafts.forEach((draft, index) =>
      repo.createTask({
        token: `task_${index}`,
        draft,
        reminderLeadMinutes: null,
      }),
    );
    repo.createEvent({
      token: 'overlap',
      draft: eventDraft({
        title: 'Already in progress',
        startAt: '2026-10-22T15:30:00.000Z',
        endAt: '2026-10-22T17:00:00.000Z',
      }),
      reminderLeadMinutes: null,
    });
    const upcoming = repo.upcoming(
      '2026-10-22T16:00:00.000Z',
      '2026-10-23T16:00:00.000Z',
      'Asia/Manila',
    );
    expect(upcoming.map(item => item.title).sort()).toEqual([
      'Already in progress',
      'At start',
      'Date only',
    ]);
    expect(upcoming.find(item => item.title === 'Date only')).toMatchObject({
      at: null,
      date: '2026-10-23',
    });
    expect(repo.snapshot().jobs).toEqual([]);
  });

  it('persists one paired job per weekly occurrence through the inclusive final class date', () => {
    const repo = fixture.repository;
    const event = repo.createEvent({
      token: 'weekly_class',
      draft: eventDraft({recurrence: {weekdays: [4], untilDate: '2026-11-05'}}),
      reminderLeadMinutes: 15,
    });
    const snapshot = repo.snapshot();
    expect(snapshot.reminders).toHaveLength(3);
    expect(snapshot.jobs).toHaveLength(3);
    expect(new Set(snapshot.jobs.map(job => job.occurrenceKey)).size).toBe(3);
    expect(snapshot.jobs.map(job => job.runAt)).toEqual([
      '2026-10-22T08:45:00.000Z',
      '2026-10-29T08:45:00.000Z',
      '2026-11-05T08:45:00.000Z',
    ]);
    expect(
      repo.upcoming(
        '2026-10-29T00:00:00.000Z',
        '2026-10-30T00:00:00.000Z',
        'Asia/Manila',
      ),
    ).toEqual([
      {
        kind: 'event',
        id: event.id,
        title: event.title,
        at: '2026-10-29T09:00:00.000Z',
        date: null,
        occurrenceKey: `${event.id}|2026-10-29T09:00:00.000Z`,
      },
    ]);
  });

  it('keeps weekly class wall time across a DST offset change', () => {
    const repo = fixture.repository;
    repo.createEvent({
      token: 'dst_class',
      draft: eventDraft({
        startAt: '2026-10-25T13:00:00.000Z',
        endAt: '2026-10-25T14:00:00.000Z',
        timezone: 'America/New_York',
        recurrence: {weekdays: [0], untilDate: '2026-11-08'},
      }),
      reminderLeadMinutes: 0,
    });
    expect(repo.snapshot().jobs.map(job => job.runAt)).toEqual([
      '2026-10-25T13:00:00.000Z',
      '2026-11-01T14:00:00.000Z',
      '2026-11-08T14:00:00.000Z',
    ]);
  });

  it('replays duplicate operation tokens without extra rows and rejects conflicting reuse', () => {
    const repo = fixture.repository;
    const command = {
      token: 'once',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    };
    const first = repo.createTask(command);
    fixture.setNow('2026-10-23T08:00:00.000Z');
    expect(repo.createTask(command)).toEqual(first);
    expect(repo.snapshot().tasks).toHaveLength(1);
    expect(repo.snapshot().reminders).toHaveLength(1);
    expect(repo.snapshot().jobs).toHaveLength(1);
    expect(receiptCount(fixture)).toBe(1);
    expect(() =>
      repo.createTask({...command, draft: taskDraft({title: 'Different'})}),
    ).toThrow('different action');
    expect(repo.snapshot().tasks).toEqual([first]);
    expect(receiptCount(fixture)).toBe(1);
  });

  it('rejects stale optimistic edits without invalidating the current reminder generation', () => {
    const repo = fixture.repository;
    const task = repo.createTask({
      token: 'create',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    const initialJob = firstJob(fixture);
    const edit = {
      token: 'edit',
      id: task.id,
      expectedVersion: 1,
      draft: taskDraft({title: 'Edited title'}),
      reminderLeadMinutes: 15,
    };
    repo.updateTask(edit);
    expect(firstJob(fixture)).toEqual(initialJob);
    expect(() =>
      repo.updateTask({
        ...edit,
        token: 'stale',
        draft: taskDraft({title: 'Stale overwrite'}),
      }),
    ).toThrow('changed');
    expect(repo.snapshot().tasks[0]).toMatchObject({
      title: 'Edited title',
      version: 2,
    });
    expect(receiptCount(fixture)).toBe(2);
  });

  it('rolls back source, reminder, job and receipt if job insertion fails, then permits retry', () => {
    const broken = createPlannerRepository(
      failOnce(fixture.sql, /^INSERT INTO reminder_jobs/),
      fixture.clock,
    );
    const command = {
      token: 'retry_create',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    };
    expect(() => broken.createTask(command)).toThrow('Injected SQL failure');
    expect(fixture.repository.snapshot()).toEqual({
      tasks: [],
      events: [],
      reminders: [],
      jobs: [],
    });
    expect(receiptCount(fixture)).toBe(0);
    expect(broken.createTask(command)).toMatchObject({
      id: 'task:retry_create',
      version: 1,
    });
    expect(fixture.repository.snapshot().jobs).toHaveLength(1);
  });

  it.each([/^UPDATE reminder_jobs/, /^COMMIT$/])(
    'rolls back every edit record and receipt on failure at %s',
    pattern => {
      const repo = fixture.repository;
      const task = repo.createTask({
        token: 'create',
        draft: taskDraft(),
        reminderLeadMinutes: 15,
      });
      const original = repo.snapshot();
      const broken = createPlannerRepository(
        failOnce(fixture.sql, pattern),
        fixture.clock,
      );
      const command = {
        token: 'edit_retry',
        id: task.id,
        expectedVersion: 1,
        draft: taskDraft({
          title: 'Rescheduled',
          dueAt: '2026-10-23T09:00:00.000Z',
        }),
        reminderLeadMinutes: 15,
      };
      expect(() => broken.updateTask(command)).toThrow('Injected SQL failure');
      expect(repo.snapshot()).toEqual(original);
      expect(receiptCount(fixture)).toBe(1);
      broken.updateTask(command);
      expect(repo.snapshot().tasks[0]).toMatchObject({
        title: 'Rescheduled',
        version: 2,
      });
      expect(
        repo.snapshot().jobs.filter(job => job.status === 'PENDING'),
      ).toHaveLength(1);
      expect(receiptCount(fixture)).toBe(2);
    },
  );

  it('ACK acknowledges delivery without completing the task and duplicate broadcasts are inert', () => {
    const repo = fixture.repository;
    repo.createTask({
      token: 'create',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    const job = firstJob(fixture);
    fixture.setNow(job.runAt);
    expect(repo.reminderAction(reminderCommand(job, 'ring', ring))).toBe(
      'applied',
    );
    expect(
      repo.reminderAction(reminderCommand(job, 'ring_duplicate', ring)),
    ).toBe('ignored');
    expect(
      repo.reminderAction(reminderCommand(job, 'ack', {kind: 'ACK'})),
    ).toBe('applied');
    expect(
      repo.reminderAction(reminderCommand(job, 'ack', {kind: 'ACK'})),
    ).toBe('applied');
    expect(
      repo.reminderAction(reminderCommand(job, 'ack_duplicate', {kind: 'ACK'})),
    ).toBe('ignored');
    expect(repo.snapshot().reminders[0]).toMatchObject({
      status: 'ACKNOWLEDGED',
    });
    expect(firstJob(fixture)).toMatchObject({
      status: 'ACKNOWLEDGED',
      attemptCount: 1,
    });
    expect(repo.snapshot().tasks[0]).toMatchObject({status: 'TODO'});
  });

  it('sets a finite simulated ringing deadline and clears native delivery markers on snooze and cancel', () => {
    const repo = fixture.repository;
    const task = repo.createTask({
      token: 'deadline_task',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    const job = firstJob(fixture);
    fixture.setNow(job.runAt);
    repo.reminderAction(reminderCommand(job, 'deadline_ring', ring));
    expect(
      fixture.sql.execute(
        'SELECT ringing_deadline,notified_at FROM reminder_jobs',
      ),
    ).toEqual([
      {ringing_deadline: '2026-10-22T08:46:00.000Z', notified_at: null},
    ]);
    fixture.sql.execute('UPDATE reminder_jobs SET notified_at=?', [job.runAt]);
    repo.reminderAction(
      reminderCommand(job, 'deadline_snooze', {kind: 'SNOOZE', minutes: 10}),
    );
    expect(
      fixture.sql.execute(
        'SELECT ringing_deadline,notified_at FROM reminder_jobs',
      ),
    ).toEqual([{ringing_deadline: null, notified_at: null}]);
    const snoozed = firstJob(fixture);
    fixture.setNow(snoozed.runAt);
    repo.reminderAction(reminderCommand(snoozed, 'deadline_rering', ring));
    fixture.sql.execute('UPDATE reminder_jobs SET notified_at=?', [
      snoozed.runAt,
    ]);
    repo.deleteTask({
      token: 'deadline_delete',
      id: task.id,
      expectedVersion: 1,
    });
    expect(
      fixture.sql.execute(
        'SELECT status,ringing_deadline,notified_at FROM reminder_jobs',
      ),
    ).toEqual([
      {status: 'CANCELLED', ringing_deadline: null, notified_at: null},
    ]);
  });

  it.each([{kind: 'ACK' as const}, {kind: 'SNOOZE' as const, minutes: 10}])(
    'refuses late $kind at the persisted deadline and durably marks MISSED',
    action => {
      const repo = fixture.repository;
      repo.createTask({
        token: 'expiry_task',
        draft: taskDraft(),
        reminderLeadMinutes: 15,
      });
      const job = firstJob(fixture);
      fixture.setNow(job.runAt);
      repo.reminderAction(reminderCommand(job, 'expiry_ring', ring));
      fixture.setNow(new Date(Date.parse(job.runAt) + 60_000).toISOString());
      const command = reminderCommand(job, 'expired_action', action);
      expect(repo.reminderAction(command)).toBe('ignored');
      expect(repo.reminderAction(command)).toBe('ignored');
      expect(firstJob(fixture)).toMatchObject({
        status: 'MISSED',
        generation: 1,
      });
      expect(repo.snapshot().reminders[0]?.status).toBe('MISSED');
      expect(repo.snapshot().tasks[0]?.status).toBe('TODO');
    },
  );

  it('repairs a missing ringing deadline only through MISS and retains a delivery failure reason', () => {
    const repo = fixture.repository;
    repo.createTask({
      token: 'invalid_deadline',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    const job = firstJob(fixture);
    fixture.setNow(job.runAt);
    repo.reminderAction(reminderCommand(job, 'invalid_ring', ring));
    fixture.sql.execute(
      "UPDATE reminder_jobs SET ringing_deadline=NULL,delivery_state='FAILED',delivery_reason='NOTIFICATION_FAILED'",
    );
    expect(() =>
      repo.reminderAction(reminderCommand(job, 'invalid_ack', {kind: 'ACK'})),
    ).toThrow('window');
    expect(
      repo.reminderAction(reminderCommand(job, 'repair_miss', {kind: 'MISS'})),
    ).toBe('applied');
    expect(firstJob(fixture)).toMatchObject({
      status: 'MISSED',
      deliveryState: 'FAILED',
      deliveryReason: 'NOTIFICATION_FAILED',
    });
    expect(repo.snapshot().tasks[0]?.status).toBe('TODO');
  });

  it.each(['ACK', 'MISS'] as const)(
    'clears native ringing markers on explicit %s without completing a task',
    action => {
      const repo = fixture.repository;
      repo.createTask({
        token: 'terminal_markers',
        draft: taskDraft(),
        reminderLeadMinutes: 15,
      });
      const job = firstJob(fixture);
      fixture.setNow(job.runAt);
      repo.reminderAction(reminderCommand(job, 'markers_ring', ring));
      fixture.sql.execute('UPDATE reminder_jobs SET notified_at=?', [
        job.runAt,
      ]);
      repo.reminderAction(
        reminderCommand(job, 'markers_terminal', {kind: action}),
      );
      expect(
        fixture.sql.execute(
          'SELECT ringing_deadline,notified_at FROM reminder_jobs',
        ),
      ).toEqual([{ringing_deadline: null, notified_at: null}]);
      expect(repo.snapshot().tasks[0]?.status).toBe('TODO');
    },
  );

  it('clears old native markers when desired scheduling is replaced', () => {
    const repo = fixture.repository;
    const task = repo.createTask({
      token: 'replace_markers',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    fixture.sql.execute(
      'UPDATE reminder_jobs SET ringing_deadline=?,notified_at=?',
      ['2026-10-22T08:46:00.000Z', '2026-10-22T08:45:00.000Z'],
    );
    repo.updateTask({
      token: 'replace_schedule',
      id: task.id,
      expectedVersion: 1,
      draft: taskDraft({dueAt: '2026-10-23T09:00:00.000Z'}),
      reminderLeadMinutes: 10,
    });
    expect(
      fixture.sql.execute(
        'SELECT ringing_deadline,notified_at FROM reminder_jobs',
      ),
    ).toEqual([
      {ringing_deadline: null, notified_at: null},
      {ringing_deadline: null, notified_at: null},
    ]);
    expect(
      repo
        .snapshot()
        .jobs.map(candidate => candidate.status)
        .sort(),
    ).toEqual(['CANCELLED', 'PENDING']);
  });

  it.each([/^UPDATE reminder_jobs/, /^COMMIT$/])(
    'rolls back an acknowledgement and its receipt on failure at %s',
    pattern => {
      const repo = fixture.repository;
      repo.createTask({
        token: 'atomic_ack_task',
        draft: taskDraft(),
        reminderLeadMinutes: 15,
      });
      const job = firstJob(fixture);
      fixture.setNow(job.runAt);
      repo.reminderAction(reminderCommand(job, 'atomic_ack_ring', ring));
      const original = repo.snapshot();
      const broken = createPlannerRepository(
        failOnce(fixture.sql, pattern),
        fixture.clock,
      );
      const acknowledgement = reminderCommand(job, 'atomic_ack', {kind: 'ACK'});
      expect(() => broken.reminderAction(acknowledgement)).toThrow(
        'Injected SQL failure',
      );
      expect(repo.snapshot()).toEqual(original);
      expect(receiptCount(fixture)).toBe(2);
      expect(broken.reminderAction(acknowledgement)).toBe('applied');
      expect(firstJob(fixture)).toMatchObject({
        status: 'ACKNOWLEDGED',
        attemptCount: 1,
      });
      expect(repo.snapshot().tasks[0]?.status).toBe('TODO');
      expect(receiptCount(fixture)).toBe(3);
    },
  );

  it('keeps an active reminder intact when a task moves from TODO to IN_PROGRESS', () => {
    const repo = fixture.repository;
    const task = repo.createTask({
      token: 'progress_task',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    const job = firstJob(fixture);
    fixture.setNow(job.runAt);
    repo.reminderAction(reminderCommand(job, 'progress_ring', ring));
    const ringing = repo.snapshot();
    repo.updateTask({
      token: 'task_progress',
      id: task.id,
      expectedVersion: 1,
      draft: taskDraft({status: 'IN_PROGRESS'}),
      reminderLeadMinutes: 15,
    });
    expect(repo.snapshot().jobs).toEqual(ringing.jobs);
    expect(repo.snapshot().reminders).toEqual(ringing.reminders);
    expect(repo.snapshot().tasks[0]?.status).toBe('IN_PROGRESS');
  });

  it.each(['ACK', 'MISS'] as const)(
    'does not rearm a weekly occurrence after %s when the series or lead is edited',
    outcome => {
      const repo = fixture.repository;
      const draft = eventDraft({
        recurrence: {weekdays: [4], untilDate: '2026-11-05'},
      });
      const event = repo.createEvent({
        token: 'terminal_series',
        draft,
        reminderLeadMinutes: 15,
      });
      const job = firstJob(fixture);
      fixture.setNow(job.runAt);
      repo.reminderAction(reminderCommand(job, 'terminal_ring', ring));
      repo.reminderAction(
        reminderCommand(job, 'terminal_outcome', {kind: outcome}),
      );
      const terminalJob = firstJob(fixture);
      const terminalReminder = repo
        .snapshot()
        .reminders.find(reminder => reminder.id === job.reminderId);
      repo.updateEvent({
        token: 'extend_series',
        id: event.id,
        expectedVersion: 1,
        draft: {
          ...draft,
          recurrence: {weekdays: [4], untilDate: '2026-11-12'},
        },
        reminderLeadMinutes: 10,
      });
      expect(
        repo.snapshot().jobs.find(candidate => candidate.id === job.id),
      ).toEqual(terminalJob);
      expect(
        repo
          .snapshot()
          .reminders.find(candidate => candidate.id === job.reminderId),
      ).toEqual(terminalReminder);
      expect(
        repo
          .snapshot()
          .jobs.filter(candidate => candidate.status === 'PENDING'),
      ).toHaveLength(3);
      expect(repo.snapshot().events[0]?.reminderLeadMinutes).toBe(10);
    },
  );

  it('uses the current source lead after rescheduling an acknowledged task', () => {
    const repo = fixture.repository;
    const task = repo.createTask({
      token: 'historical_lead',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    const oldJob = firstJob(fixture);
    fixture.setNow(oldJob.runAt);
    repo.reminderAction(reminderCommand(oldJob, 'historical_ring', ring));
    repo.reminderAction(
      reminderCommand(oldJob, 'historical_ack', {kind: 'ACK'}),
    );
    const later = taskDraft({dueAt: '2026-10-23T09:00:00.000Z'});
    repo.updateTask({
      token: 'historical_reschedule',
      id: task.id,
      expectedVersion: 1,
      draft: later,
      reminderLeadMinutes: 10,
    });
    const beforeTitleEdit = repo.snapshot();
    repo.updateTask({
      token: 'historical_title',
      id: task.id,
      expectedVersion: 2,
      draft: {...later, title: 'Renamed future task'},
      reminderLeadMinutes: 10,
    });
    expect(repo.snapshot().reminders).toEqual(beforeTitleEdit.reminders);
    expect(repo.snapshot().jobs).toEqual(beforeTitleEdit.jobs);
    expect(repo.snapshot().tasks[0]?.reminderLeadMinutes).toBe(10);
  });

  it('allows an early ignored RING token to be retried at its actual due time', () => {
    const repo = fixture.repository;
    repo.createTask({
      token: 'early_retry',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    const job = firstJob(fixture);
    const command = reminderCommand(job, 'same_delivery_token', ring);
    expect(repo.reminderAction(command)).toBe('ignored');
    expect(receiptCount(fixture)).toBe(1);
    fixture.setNow(job.runAt);
    expect(repo.reminderAction(command)).toBe('applied');
    expect(receiptCount(fixture)).toBe(2);
    expect(firstJob(fixture)).toMatchObject({
      status: 'RINGING',
      attemptCount: 1,
    });
  });

  it('rejects malformed native-style action payloads before any reminder mutation', () => {
    const repo = fixture.repository;
    repo.createTask({
      token: 'payload_validation',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    const job = firstJob(fixture);
    const command = reminderCommand(job, 'invalid_action', ring);
    const malformed = [
      {...command, generation: 0},
      {...command, generation: Number.NaN},
      {...command, action: {kind: 'COMPLETE_TASK'}},
      {...command, token: 42},
    ];
    const original = repo.snapshot();
    malformed.forEach(payload => {
      expect(() =>
        repo.reminderAction(payload as unknown as ReminderCommand),
      ).toThrow();
    });
    expect(repo.snapshot()).toEqual(original);
    expect(receiptCount(fixture)).toBe(1);
  });

  it('snoozes atomically, rejects invalid durations and ignores broadcasts from an old generation', () => {
    const repo = fixture.repository;
    repo.createTask({
      token: 'create',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    const original = firstJob(fixture);
    fixture.setNow(original.runAt);
    repo.reminderAction(reminderCommand(original, 'ring', ring));
    const beforeInvalid = repo.snapshot();
    expect(() =>
      repo.reminderAction(
        reminderCommand(original, 'invalid_snooze', {
          kind: 'SNOOZE',
          minutes: 0,
        }),
      ),
    ).toThrow('Snooze');
    expect(repo.snapshot()).toEqual(beforeInvalid);
    expect(receiptCount(fixture)).toBe(2);
    expect(
      repo.reminderAction(
        reminderCommand(original, 'snooze', {kind: 'SNOOZE', minutes: 10}),
      ),
    ).toBe('applied');
    const snoozed = firstJob(fixture);
    expect(snoozed).toMatchObject({
      status: 'PENDING',
      generation: original.generation + 1,
      runAt: '2026-10-22T08:55:00.000Z',
      attemptCount: 1,
    });
    expect(repo.snapshot().reminders[0]?.status).toBe('SNOOZED');
    expect(
      repo.reminderAction(reminderCommand(original, 'stale_ring', ring)),
    ).toBe('ignored');
    expect(
      repo.reminderAction(reminderCommand(snoozed, 'early_ring', ring)),
    ).toBe('ignored');
    fixture.setNow(snoozed.runAt);
    expect(
      repo.reminderAction(reminderCommand(snoozed, 'new_ring', ring)),
    ).toBe('applied');
    expect(firstJob(fixture)).toMatchObject({
      status: 'RINGING',
      attemptCount: 2,
    });
  });

  it('retains cancellation tombstones and generation changes after a source is deleted', () => {
    const repo = fixture.repository;
    const task = repo.createTask({
      token: 'create',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    const old = firstJob(fixture);
    const command = {token: 'delete', id: task.id, expectedVersion: 1};
    repo.deleteTask(command);
    repo.deleteTask(command);
    expect(repo.snapshot().tasks).toEqual([]);
    expect(repo.snapshot().reminders[0]?.status).toBe('CANCELLED');
    expect(firstJob(fixture)).toMatchObject({
      status: 'CANCELLED',
      generation: old.generation + 1,
    });
    expect(fixture.sql.execute('SELECT deleted_at, status FROM tasks')).toEqual(
      [{deleted_at: fixtureNow, status: 'CANCELLED'}],
    );
    expect(repo.reminderAction(reminderCommand(old, 'late_ring', ring))).toBe(
      'ignored',
    );
    expect(
      repo.upcoming(fixtureNow, '2026-10-23T08:00:00.000Z', 'Asia/Manila'),
    ).toEqual([]);
  });

  it('deletes a weekly event while retaining every cancelled occurrence for reconciliation', () => {
    const repo = fixture.repository;
    const event = repo.createEvent({
      token: 'weekly',
      draft: eventDraft({recurrence: {weekdays: [4], untilDate: '2026-11-05'}}),
      reminderLeadMinutes: 15,
    });
    repo.deleteEvent({token: 'delete_event', id: event.id, expectedVersion: 1});
    expect(repo.snapshot().events).toEqual([]);
    expect(repo.snapshot().jobs).toHaveLength(3);
    expect(
      repo
        .snapshot()
        .jobs.every(job => job.status === 'CANCELLED' && job.generation === 2),
    ).toBe(true);
  });

  it('handles two simultaneously due jobs independently without a shared active slot', () => {
    const repo = fixture.repository;
    repo.createTask({
      token: 'task_a',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    repo.createTask({
      token: 'task_b',
      draft: taskDraft({title: 'Second task'}),
      reminderLeadMinutes: 15,
    });
    const jobs = repo.snapshot().jobs;
    fixture.setNow('2026-10-22T08:45:00.000Z');
    jobs.forEach((job, index) =>
      expect(
        repo.reminderAction(reminderCommand(job, `ring_${index}`, ring)),
      ).toBe('applied'),
    );
    expect(repo.snapshot().jobs.map(job => job.status)).toEqual([
      'RINGING',
      'RINGING',
    ]);
    const first = jobs[0]!;
    repo.reminderAction(reminderCommand(first, 'ack_first', {kind: 'ACK'}));
    expect(repo.snapshot().jobs.map(job => job.status)).toEqual([
      'ACKNOWLEDGED',
      'RINGING',
    ]);
    expect(repo.snapshot().tasks.every(task => task.status === 'TODO')).toBe(
      true,
    );
  });

  it('records missed and quiet-hour outcomes without pretending native delivery occurred', () => {
    const repo = fixture.repository;
    repo.createTask({
      token: 'missed',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    const missed = firstJob(fixture);
    fixture.setNow('2026-10-22T09:00:00.001Z');
    repo.reminderAction(reminderCommand(missed, 'missed_ring', ring));
    expect(firstJob(fixture)).toMatchObject({
      status: 'MISSED',
      attemptCount: 0,
      deliveryState: 'UNAVAILABLE',
    });
    repo.createTask({
      token: 'quiet',
      draft: taskDraft({dueAt: '2026-10-22T15:00:00.000Z'}),
      reminderLeadMinutes: 0,
    });
    const quiet = repo.snapshot().jobs.find(job => job.status === 'PENDING')!;
    fixture.setNow(quiet.runAt);
    repo.reminderAction(
      reminderCommand(quiet, 'quiet_ring', {
        ...ring,
        quietHours: {start: '22:00', end: '07:00'},
      }),
    );
    expect(repo.snapshot().jobs.find(job => job.id === quiet.id)).toMatchObject(
      {
        status: 'PENDING',
        runAt: '2026-10-22T23:00:00.000Z',
        generation: quiet.generation + 1,
        attemptCount: 0,
        deliveryState: 'UNAVAILABLE',
      },
    );
    expect(repo.snapshot().tasks.every(task => task.status === 'TODO')).toBe(
      true,
    );
  });

  it('retains only the latest 100 local chat messages and handles append replay/conflicts', () => {
    const repo = fixture.repository;
    const messages: ChatMessage[] = Array.from({length: 105}, (_, index) => ({
      id: `chat_${index}`,
      createdAt: new Date(Date.parse(fixtureNow) + index * 1000).toISOString(),
      role: index % 2 === 0 ? 'user' : 'assistant',
      text: `Synthetic message ${index}`,
      actionId: null,
    }));
    messages.forEach(message => repo.appendChat(message));
    const latest = messages[104]!;
    repo.appendChat(latest);
    expect(repo.recentChat()).toHaveLength(100);
    expect(repo.recentChat()[0]).toEqual(latest);
    expect(repo.recentChat().at(-1)).toEqual(messages[5]);
    expect(repo.recentChat(2)).toEqual([messages[104], messages[103]]);
    expect(() =>
      repo.appendChat({...latest, text: 'Conflicting reuse'}),
    ).toThrow('already used');
    expect(() => repo.recentChat(101)).toThrow('1–100');
  });

  it.each([
    taskDraft({dueAt: '2026-02-30T09:00:00.000Z'}),
    taskDraft({dueAt: '2026-10-22T09:00:00+08:00'}),
    taskDraft({dueAt: null, dueDate: '2026-02-30'}),
    taskDraft({timezone: 'Invalid/Timezone'}),
  ])('rejects invalid schedule data before any durable action: %p', draft => {
    expect(() =>
      fixture.repository.createTask({
        token: 'invalid',
        draft,
        reminderLeadMinutes: null,
      }),
    ).toThrow();
    expect(fixture.repository.snapshot()).toEqual({
      tasks: [],
      events: [],
      reminders: [],
      jobs: [],
    });
    expect(receiptCount(fixture)).toBe(0);
  });
});

describe('planner persistence and host process interruption', () => {
  let tempRoot: string;
  let directory: string;
  let file: string;
  beforeEach(() => {
    tempRoot = fs.realpathSync(os.tmpdir());
    directory = fs.mkdtempSync(path.join(tempRoot, 'lafina-planner-'));
    file = path.join(directory, 'planner.sqlite');
  });
  afterEach(() => {
    if (
      path.dirname(fs.realpathSync(directory)) !== tempRoot ||
      !path.basename(directory).startsWith('lafina-planner-')
    ) {
      throw new Error('Unexpected planner test cleanup path');
    }
    fs.rmSync(directory, {recursive: true, force: true});
  });

  it('retains items, paired jobs, receipts and Phase 01 preferences after close/reopen', async () => {
    const first = createPlannerFixture(file);
    const preferences = {
      ...defaultPreferences('Asia/Manila'),
      nickname: 'Synthetic Student',
      onboardingCompletedAt: fixtureNow,
    };
    const command = {
      token: 'persisted_task',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    };
    let snapshot;
    try {
      await createPreferencesRepository(first.sql).save(preferences);
      first.repository.createTask(command);
      first.repository.createEvent({
        token: 'persisted_event',
        draft: eventDraft(),
        reminderLeadMinutes: 10,
      });
      snapshot = first.repository.snapshot();
    } finally {
      first.close();
    }
    const reopened = createPlannerFixture(file);
    try {
      expect(reopened.repository.snapshot()).toEqual(snapshot);
      expect(await createPreferencesRepository(reopened.sql).load()).toEqual(
        preferences,
      );
      reopened.repository.createTask(command);
      expect(reopened.repository.snapshot()).toEqual(snapshot);
      expect(receiptCount(reopened)).toBe(2);
    } finally {
      reopened.close();
    }
  });

  it('recovers the previous committed rows when a separate host process is killed before COMMIT', () => {
    const first = createPlannerFixture(file);
    first.repository.createTask({
      token: 'before_crash',
      draft: taskDraft(),
      reminderLeadMinutes: 15,
    });
    const original = first.repository.snapshot();
    first.close();
    // This is an actual process termination against the same SQLite file. It
    // proves host SQLite crash recovery, not Android lifecycle or native delivery.
    const script = `
      const fs = require('node:fs');
      const {DatabaseSync} = require('node:sqlite');
      const db = new DatabaseSync(process.argv[1]);
      db.exec('PRAGMA cache_size = 1; PRAGMA cache_spill = ON; BEGIN IMMEDIATE');
      db.prepare('UPDATE tasks SET title = ?, notes = ?, version = version + 1').run('Uncommitted change', 'x'.repeat(3900));
      db.exec("UPDATE reminders SET status = 'RINGING', version = version + 1");
      db.exec("UPDATE reminder_jobs SET status = 'RINGING', attempt_count = 1");
      db.prepare('INSERT INTO operation_receipts VALUES (?, ?, ?, ?)').run('crash_receipt', 'uncommitted', 'null', '${fixtureNow}');
      fs.writeSync(1, 'uncommitted SQL reached; terminating process');
      process.kill(process.pid, 'SIGKILL');
    `;
    const killed = spawnSync(process.execPath, ['-e', script, file], {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
    });
    expect(killed.error).toBeUndefined();
    expect(killed.stdout).toContain('uncommitted SQL reached');
    expect(killed.status === null || killed.status !== 0).toBe(true);
    const reopened = createPlannerFixture(file);
    try {
      expect(reopened.repository.snapshot()).toEqual(original);
      expect(receiptCount(reopened)).toBe(1);
      expect(reopened.sql.execute('PRAGMA integrity_check')).toEqual([
        {integrity_check: 'ok'},
      ]);
      reopened.repository.createTask({
        token: 'after_crash',
        draft: taskDraft({title: 'Recovery write'}),
        reminderLeadMinutes: null,
      });
      expect(reopened.repository.snapshot().tasks).toHaveLength(2);
    } finally {
      reopened.close();
    }
  });
});
