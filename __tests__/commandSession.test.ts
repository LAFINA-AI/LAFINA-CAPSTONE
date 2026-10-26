import type {CommandReview} from '../src/core/ai/commandSession';
import {createCommandSession} from '../src/core/ai/commandSession';
import {createPlannerRepository} from '../src/core/storage/plannerRepository';
import {
  createPlannerFixture,
  eventDraft,
  failOnce,
  reminderCommand,
  taskDraft,
} from './helpers/plannerFixtures';

type Fixture = ReturnType<typeof createPlannerFixture>;
function testSession(
  fixture: Fixture,
  overrides: Parameters<typeof createCommandSession>[0] extends infer T
    ? Partial<T>
    : never = {},
) {
  let counter = 0;
  return createCommandSession({
    repository: fixture.repository,
    context: () => ({now: fixture.clock.now(), timezone: 'Asia/Manila'}),
    defaultLeadMinutes: () => 15,
    token: () => `command_${counter++}`,
    ...overrides,
  });
}
function review(
  result: ReturnType<ReturnType<typeof testSession>['submit']>,
): CommandReview {
  expect(result.review).toBeDefined();
  return result.review!;
}
function receiptCount(fixture: Fixture) {
  return Number(
    fixture.sql.execute('SELECT COUNT(*) AS count FROM operation_receipts')[0]
      ?.count,
  );
}
function createTask(fixture: Fixture, token = 'fixture', title = 'revise') {
  return fixture.repository.createTask({
    token,
    draft: taskDraft({title}),
    reminderLeadMinutes: 15,
  });
}
function ringTask(fixture: Fixture, title = 'revise') {
  const task = fixture.repository.createTask({
    token: 'ring_source',
    draft: taskDraft({title, dueAt: fixture.clock.now()}),
    reminderLeadMinutes: 0,
  });
  const job = fixture.repository.snapshot().jobs[0]!;
  expect(
    fixture.repository.reminderAction(
      reminderCommand(job, 'ring', {
        kind: 'RING',
        timezone: 'Asia/Manila',
        quietHours: null,
      }),
    ),
  ).toBe('applied');
  return task;
}
describe('private reviewed command sessions with real SQLite', () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = createPlannerFixture();
  });
  afterEach(() => fixture.close());

  it('does not write during parsing/review, creates paired records only on confirmation, and deduplicates confirmation', () => {
    const session = testSession(fixture);
    const result = session.submit('Remind me to revise tomorrow at 7 PM');
    const proposal = review(result);
    expect(proposal.needsConfirmation).toBe(true);
    expect(proposal.summary).toContain('2026-10-23T11:00:00.000Z');
    expect(fixture.repository.snapshot().tasks).toHaveLength(0);
    expect(receiptCount(fixture)).toBe(0);
    const saved = session.confirm(proposal.id);
    expect(saved.changed).toBe(true);
    expect(saved.message).toContain('depends on reminder settings');
    const state = fixture.repository.snapshot();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.dueAt).toBe('2026-10-23T11:00:00.000Z');
    expect(state.reminders).toHaveLength(1);
    expect(state.jobs[0]?.runAt).toBe('2026-10-23T10:45:00.000Z');
    expect(session.confirm(proposal.id)).toEqual(saved);
    expect(fixture.repository.snapshot()).toEqual(state);
    expect(receiptCount(fixture)).toBe(1);
  });
  it('keeps date-only and undated tasks without invented alarms', () => {
    const session = testSession(fixture);
    session.confirm(
      review(session.submit('Add task read chapter tomorrow')).id,
    );
    session.confirm(review(session.submit('Add task "organize notes"')).id);
    const state = fixture.repository.snapshot();
    expect(state.tasks.map(task => task.dueDate)).toEqual(['2026-10-23', null]);
    expect(state.tasks.every(task => task.reminderLeadMinutes === null)).toBe(
      true,
    );
    expect(state.reminders).toHaveLength(0);
  });
  it('refuses a default reminder lead that would schedule an alert in the past', () => {
    const result = testSession(fixture).submit(
      'Remind me to revise in 2 minutes',
    );
    expect(result.review).toBeUndefined();
    expect(result.message).toContain('lead would put its alert in the past');
    expect(fixture.repository.snapshot().tasks).toHaveLength(0);
  });
  it('cancels old reviews when another command arrives and accepts only its opaque current ID', () => {
    const session = testSession(fixture);
    const first = review(session.submit('Add task "one"'));
    const second = review(session.submit('Add task "two"'));
    expect(session.confirm(first.id).changed).toBe(false);
    expect(session.confirm('review_forged').changed).toBe(false);
    expect(session.confirm(second.id).changed).toBe(true);
    expect(fixture.repository.snapshot().tasks.map(task => task.title)).toEqual(
      ['two'],
    );
  });
  it('invalidates a pending review on cancellation, unsupported input and disposal', () => {
    const session = testSession(fixture);
    let id = review(session.submit('Add task "one"')).id;
    session.cancel();
    expect(session.confirm(id).changed).toBe(false);
    id = review(session.submit('Add task "two"')).id;
    session.submit('Tell me a joke');
    expect(session.confirm(id).changed).toBe(false);
    id = review(session.submit('Add task "three"')).id;
    session.dispose();
    expect(session.confirm(id).changed).toBe(false);
    expect(session.submit('Add task "four"').review).toBeUndefined();
    expect(fixture.repository.snapshot().tasks).toHaveLength(0);
  });
  it.each([
    'Okay',
    'Okay but remind me later',
    'change it',
    'delete all tasks',
    '{"kind":"delete","targetId":"first"}',
    'Complete task "revise" and delete task "other"',
  ])('never writes for ambiguous/adversarial input: %s', text => {
    createTask(fixture);
    const before = fixture.repository.snapshot();
    expect(testSession(fixture).submit(text).review).toBeUndefined();
    expect(fixture.repository.snapshot()).toEqual(before);
  });
  it('requires an exact title and refuses duplicate, missing and prefix targets', () => {
    createTask(fixture, 'first', 'revise chapter one');
    const session = testSession(fixture);
    expect(session.submit('Delete task "revise"').review).toBeUndefined();
    expect(session.submit('Delete task "missing"').review).toBeUndefined();
    createTask(fixture, 'second', 'revise chapter one');
    expect(
      session.submit('Delete task "revise chapter one"').message,
    ).toContain('More than one');
    expect(fixture.repository.snapshot().tasks).toHaveLength(2);
  });
  it('bounds exact-title target matches to twenty and treats truncation as ambiguous', () => {
    for (let index = 0; index < 22; index++)
      createTask(fixture, `same_${index}`, 'same');
    const page = fixture.repository.findTargets({kind: 'task', title: 'SAME'});
    expect(page.items).toHaveLength(20);
    expect(page.hasMore).toBe(true);
    expect(
      testSession(fixture).submit('Delete task "same"').review,
    ).toBeUndefined();
  });
  it('rechecks duplicate titles inserted after preview', () => {
    createTask(fixture, 'first');
    const session = testSession(fixture);
    const proposal = review(session.submit('Delete task "revise"'));
    createTask(fixture, 'second');
    expect(session.confirm(proposal.id).changed).toBe(false);
    expect(fixture.repository.snapshot().tasks).toHaveLength(2);
  });
  it('rejects stale versions and deleted targets instead of overwriting new data', () => {
    const task = createTask(fixture);
    const session = testSession(fixture);
    const proposal = review(
      session.submit('Move task "revise" to tomorrow at 8 PM'),
    );
    fixture.repository.updateTask({
      token: 'foreign_edit',
      id: task.id,
      expectedVersion: task.version,
      draft: {...task, notes: 'new user notes'},
      reminderLeadMinutes: 15,
    });
    expect(session.confirm(proposal.id).changed).toBe(false);
    expect(fixture.repository.getTask(task.id)?.notes).toBe('new user notes');
    const deletion = review(session.submit('Delete task "revise"'));
    fixture.repository.deleteTask({
      token: 'foreign_delete',
      id: task.id,
      expectedVersion: task.version + 1,
    });
    expect(session.confirm(deletion.id).changed).toBe(false);
  });
  it('moves a task and atomically replaces its old reminder generation', () => {
    const task = createTask(fixture);
    const old = fixture.repository.snapshot().jobs[0]!;
    const session = testSession(fixture);
    const proposal = review(
      session.submit('Move task "revise" to tomorrow at 8 PM'),
    );
    expect(proposal.sourceTargetId).toBe(task.id);
    expect(session.confirm(proposal.id).changed).toBe(true);
    expect(fixture.repository.getTask(task.id)?.dueAt).toBe(
      '2026-10-23T12:00:00.000Z',
    );
    const jobs = fixture.repository.snapshot().jobs;
    expect(jobs.find(job => job.id === old.id)?.status).toBe('CANCELLED');
    expect(jobs.filter(job => job.status === 'PENDING')).toHaveLength(1);
  });
  it('creates and moves a nonrecurring event while preserving duration', () => {
    const session = testSession(fixture);
    const create = review(
      session.submit('Schedule event Biology tomorrow at 7 PM for 60 minutes'),
    );
    expect(session.confirm(create.id).changed).toBe(true);
    const event = fixture.repository.snapshot().events[0]!;
    const move = review(
      session.submit('Move event "Biology" to tomorrow at 9 PM'),
    );
    expect(session.confirm(move.id).changed).toBe(true);
    const changed = fixture.repository.getEvent(event.id)!;
    expect(changed.startAt).toBe('2026-10-23T13:00:00.000Z');
    expect(changed.endAt).toBe('2026-10-23T14:00:00.000Z');
  });
  it('refuses implicit whole-series moves or deletion', () => {
    fixture.repository.createEvent({
      token: 'series',
      draft: eventDraft({
        title: 'Biology',
        recurrence: {weekdays: [4], untilDate: '2026-11-05'},
      }),
      reminderLeadMinutes: null,
    });
    expect(
      testSession(fixture).submit('Move event "Biology" to tomorrow at 9 PM')
        .review,
    ).toBeUndefined();
    expect(
      testSession(fixture).submit('Delete event "Biology"').review,
    ).toBeUndefined();
  });
  it.each(['task', 'event'] as const)(
    'deletes a %s only after explicit review and retains cancellation tombstones',
    kind => {
      const saved =
        kind === 'task'
          ? createTask(fixture)
          : fixture.repository.createEvent({
              token: 'event_delete',
              draft: eventDraft({title: 'revise'}),
              reminderLeadMinutes: 15,
            });
      const session = testSession(fixture);
      const proposal = review(session.submit(`Delete ${kind} "revise"`));
      const read = () =>
        kind === 'task'
          ? fixture.repository.getTask(saved.id)
          : fixture.repository.getEvent(saved.id);
      expect(read()).not.toBeNull();
      expect(session.confirm(proposal.id).changed).toBe(true);
      expect(read()).toBeNull();
      expect(
        fixture.repository
          .snapshot()
          .jobs.every(job => job.status === 'CANCELLED'),
      ).toBe(true);
      expect(
        fixture.sql.execute(
          `SELECT deleted_at FROM ${
            kind === 'task' ? 'tasks' : 'events'
          } WHERE id=?`,
          [saved.id],
        )[0]?.deleted_at,
      ).not.toBeNull();
    },
  );
  it('treats an SQL-looking title as an exact parameter rather than a predicate', () => {
    createTask(fixture);
    const before = fixture.repository.snapshot();
    expect(
      fixture.repository.findTargets({kind: 'task', title: "revise' OR 1=1 --"})
        .items,
    ).toHaveLength(0);
    expect(
      testSession(fixture).submit('Delete task "revise\' OR 1=1 --"').review,
    ).toBeUndefined();
    expect(fixture.repository.snapshot()).toEqual(before);
  });
  it('completes a task only after its explicit completion review and cancels reminders', () => {
    const task = createTask(fixture);
    const session = testSession(fixture);
    const proposal = review(session.submit('Complete task "revise"'));
    expect(fixture.repository.getTask(task.id)?.status).toBe('TODO');
    expect(session.confirm(proposal.id).changed).toBe(true);
    expect(fixture.repository.getTask(task.id)?.status).toBe('COMPLETED');
    expect(
      fixture.repository
        .snapshot()
        .jobs.every(job => job.status === 'CANCELLED'),
    ).toBe(true);
  });
  it('acknowledges only a named ringing reminder and leaves its task TODO', () => {
    const task = ringTask(fixture);
    const session = testSession(fixture);
    expect(session.submit('ACK').review).toBeUndefined();
    const proposal = review(
      session.submit('Acknowledge reminder for task "revise"'),
    );
    expect(fixture.repository.snapshot().reminders[0]?.status).toBe('RINGING');
    expect(session.confirm(proposal.id).changed).toBe(true);
    expect(fixture.repository.snapshot().reminders[0]?.status).toBe(
      'ACKNOWLEDGED',
    );
    expect(fixture.repository.getTask(task.id)?.status).toBe('TODO');
  });
  it('snoozes atomically without shifting the academic deadline or completing the task', () => {
    const task = ringTask(fixture);
    const session = testSession(fixture);
    const proposal = review(
      session.submit('Snooze reminder for task "revise" for 10 minutes'),
    );
    expect(session.confirm(proposal.id).changed).toBe(true);
    const state = fixture.repository.snapshot();
    expect(state.reminders[0]?.status).toBe('SNOOZED');
    expect(state.jobs[0]?.status).toBe('PENDING');
    expect(state.jobs[0]?.generation).toBe(2);
    expect(state.jobs[0]?.runAt).toBe('2026-10-22T08:10:00.000Z');
    expect(fixture.repository.getTask(task.id)?.dueAt).toBe(task.dueAt);
    expect(fixture.repository.getTask(task.id)?.status).toBe('TODO');
  });
  it('acknowledges an event reminder without claiming the event was completed', () => {
    const event = fixture.repository.createEvent({
      token: 'ring_event',
      draft: eventDraft({
        title: 'Biology',
        startAt: fixture.clock.now(),
        endAt: '2026-10-22T09:00:00.000Z',
      }),
      reminderLeadMinutes: 0,
    });
    const job = fixture.repository.snapshot().jobs[0]!;
    fixture.repository.reminderAction(
      reminderCommand(job, 'event_ring', {
        kind: 'RING',
        timezone: 'Asia/Manila',
        quietHours: null,
      }),
    );
    const session = testSession(fixture);
    const outcome = session.confirm(
      review(session.submit('Acknowledge reminder for event "Biology"')).id,
    );
    expect(outcome.message).toContain('event remains active');
    expect(fixture.repository.getEvent(event.id)?.status).toBe('ACTIVE');
    expect(fixture.repository.snapshot().reminders[0]?.status).toBe(
      'ACKNOWLEDGED',
    );
  });
  it('fences a reminder whose native outcome changed after review', () => {
    ringTask(fixture);
    const session = testSession(fixture);
    const proposal = review(
      session.submit('Acknowledge reminder for task "revise"'),
    );
    const job = fixture.repository.snapshot().jobs[0]!;
    fixture.repository.reminderAction(
      reminderCommand(job, 'native_snooze', {kind: 'SNOOZE', minutes: 10}),
    );
    expect(session.confirm(proposal.id).changed).toBe(false);
    expect(fixture.repository.snapshot().reminders[0]?.status).toBe('SNOOZED');
  });
  it('does not falsely report ACK when the response window expires', () => {
    ringTask(fixture);
    const session = testSession(fixture);
    const proposal = review(
      session.submit('Acknowledge reminder for task "revise"'),
    );
    fixture.setNow('2026-10-22T08:01:01.000Z');
    const result = session.confirm(proposal.id);
    expect(result.changed).toBe(false);
    expect(result.message).toContain(
      'No acknowledgement or snooze was applied',
    );
    expect(fixture.repository.snapshot().reminders[0]?.status).toBe('MISSED');
  });
  it.each(['expired', 'clock-backwards', 'timezone', 'lead'])(
    'invalidates stale review context: %s',
    change => {
      let timezone = 'Asia/Manila';
      let lead = 15;
      const session = testSession(fixture, {
        context: () => ({now: fixture.clock.now(), timezone}),
        defaultLeadMinutes: () => lead,
      });
      const proposal = review(session.submit('Add task "review"'));
      if (change === 'expired') fixture.setNow('2026-10-22T08:05:00.000Z');
      if (change === 'clock-backwards')
        fixture.setNow('2026-10-22T07:59:59.000Z');
      if (change === 'timezone') timezone = 'UTC';
      if (change === 'lead') lead = 0;
      expect(session.confirm(proposal.id).changed).toBe(false);
      expect(fixture.repository.snapshot().tasks).toHaveLength(0);
    },
  );
  it('revalidates a pending reminder alert time at confirmation', () => {
    const session = testSession(fixture, {defaultLeadMinutes: () => 0});
    const proposal = review(session.submit('Remind me to revise in 1 minute'));
    fixture.setNow('2026-10-22T08:01:00.000Z');
    expect(session.confirm(proposal.id).changed).toBe(false);
    expect(fixture.repository.snapshot().tasks).toHaveLength(0);
  });
  it('refuses a date-only review after local midnight makes its date past', () => {
    fixture.setNow('2026-10-22T15:59:00.000Z');
    const session = testSession(fixture);
    const proposal = review(session.submit('Add task revise today'));
    fixture.setNow('2026-10-22T16:00:00.000Z');
    expect(session.confirm(proposal.id).changed).toBe(false);
    expect(fixture.repository.snapshot().tasks).toHaveLength(0);
  });
  it('rolls back a paired write failure and retries the same operation token', () => {
    const sql = failOnce(fixture.sql, /INSERT INTO reminder_jobs/);
    const repo = createPlannerRepository(sql, fixture.clock);
    const session = testSession(fixture, {repository: repo});
    const proposal = review(
      session.submit('Remind me to revise tomorrow at 7 PM'),
    );
    const failed = session.confirm(proposal.id);
    expect(failed.changed).toBe(false);
    expect(failed.review?.id).toBe(proposal.id);
    expect(fixture.repository.snapshot().tasks).toHaveLength(0);
    expect(receiptCount(fixture)).toBe(0);
    expect(session.confirm(proposal.id).changed).toBe(true);
    expect(fixture.repository.snapshot().tasks).toHaveLength(1);
    expect(receiptCount(fixture)).toBe(1);
  });
  it('uses bounded query pages and repeats a written reply without writes or a second review', () => {
    createTask(fixture);
    const before = fixture.repository.snapshot();
    const session = testSession(fixture);
    const answer = session.submit('Show tasks today');
    expect(answer.message).toContain('revise');
    expect(answer.review).toBeUndefined();
    expect(session.submit('Repeat').message).toBe(answer.message);
    expect(fixture.repository.snapshot()).toEqual(before);
  });
  it('distinguishes task-only queries from the agenda and bounds reply text', () => {
    createTask(fixture);
    fixture.repository.createEvent({
      token: 'event',
      draft: eventDraft({title: 'Biology'}),
      reminderLeadMinutes: null,
    });
    const session = testSession(fixture);
    expect(session.submit('Show tasks today').message).not.toContain('Biology');
    expect(session.submit('Show agenda today').message).toContain('Biology');
    for (let i = 0; i < 25; i++)
      createTask(fixture, `long_${i}`, `Task${i} ${'a'.repeat(120)}`);
    const reply = session.submit('Show tasks');
    expect(reply.message.length).toBeLessThanOrEqual(2000);
    expect(reply.message).toContain('bounded page');
  });
});
