import type {TaskDraft} from '../src/core/domain/planner';
import * as scheduleTime from '../src/core/domain/scheduleTime';
import {createPlannerRepository} from '../src/core/storage/plannerRepository';
import {
  createPlannerFixture,
  eventDraft,
  taskDraft,
} from './helpers/plannerFixtures';

type Fixture = ReturnType<typeof createPlannerFixture>;
const window = {
  fromDate: '2026-10-22',
  toDate: '2026-10-22',
  timezone: 'Asia/Manila',
};
describe('bounded product planner queries against real host SQLite', () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = createPlannerFixture();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fixture.close();
  });
  const addTask = (token: string, overrides: Partial<TaskDraft> = {}) =>
    fixture.repository.createTask({
      token,
      draft: taskDraft(overrides),
      reminderLeadMinutes: null,
    });

  it('pages active, completed and all tasks with undated items, excluding cancelled and deleted sources', () => {
    const active = addTask('active');
    const progress = addTask('progress', {status: 'IN_PROGRESS'});
    const completed = addTask('completed', {status: 'COMPLETED'});
    const undated = addTask('undated', {dueAt: null});
    addTask('cancelled', {status: 'CANCELLED'});
    const deleted = addTask('deleted');
    fixture.repository.deleteTask({
      token: 'delete',
      id: deleted.id,
      expectedVersion: 1,
    });
    const first = fixture.repository.tasksPage({filter: 'active', limit: 2});
    expect(first.items.map(item => item.id)).toEqual([active.id, progress.id]);
    expect(first.hasMore).toBe(true);
    expect(
      fixture.repository.tasksPage({filter: 'active', offset: 2, limit: 2}),
    ).toEqual({items: [undated], hasMore: false});
    expect(fixture.repository.tasksPage({filter: 'completed'}).items).toEqual([
      completed,
    ]);
    expect(fixture.repository.tasksPage({filter: 'all'}).items).toHaveLength(4);
    expect(fixture.repository.getTask(deleted.id)).toBeNull();
    expect(fixture.repository.getTask(active.id)).toEqual(active);
    expect(fixture.repository.getTask("' OR 1=1 --")).toBeNull();
  });

  it('uses query-local dates for timed tasks and unchanged declared dates for date-only tasks', () => {
    addTask('just_before', {dueAt: '2026-10-21T15:59:59.999Z'});
    const midnight = addTask('midnight', {
      dueAt: '2026-10-21T16:00:00.000Z',
      timezone: 'UTC',
    });
    const last = addTask('last', {dueAt: '2026-10-22T15:59:59.999Z'});
    addTask('next_day', {dueAt: '2026-10-22T16:00:00.000Z'});
    const dateOnly = addTask('date_only', {
      dueAt: null,
      dueDate: '2026-10-22',
      timezone: 'Pacific/Honolulu',
    });
    addTask('undated', {dueAt: null});
    addTask('completed', {status: 'COMPLETED'});
    const result = fixture.repository.agendaPage(window);
    expect(result.items.map(item => item.id)).toEqual([
      dateOnly.id,
      midnight.id,
      last.id,
    ]);
    expect(result.items.every(item => item.date === '2026-10-22')).toBe(true);
    expect(
      fixture.repository.agendaPage({...window, includeCompleted: true}).items,
    ).toHaveLength(4);
  });

  it('returns a long overlapping nonrecurring event once on the first visible date with its actual interval', () => {
    const event = fixture.repository.createEvent({
      token: 'long',
      reminderLeadMinutes: null,
      draft: eventDraft({
        startAt: '2026-09-01T00:00:00.000Z',
        endAt: '2026-11-01T00:00:00.000Z',
      }),
    });
    fixture.repository.createEvent({
      token: 'ended',
      reminderLeadMinutes: null,
      draft: eventDraft({
        startAt: '2026-10-21T00:00:00.000Z',
        endAt: '2026-10-21T16:00:00.000Z',
      }),
    });
    const result = fixture.repository.agendaPage({
      ...window,
      toDate: '2026-10-28',
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: event.id,
        date: window.fromDate,
        at: event.startAt,
        endAt: event.endAt,
        occurrenceKey: `${event.id}|${event.startAt}`,
      }),
    ]);
    expect(fixture.repository.getEvent(event.id)).toEqual(event);
    fixture.repository.deleteEvent({
      token: 'delete_event',
      id: event.id,
      expectedVersion: 1,
    });
    expect(fixture.repository.getEvent(event.id)).toBeNull();
    expect(fixture.repository.agendaPage(window).items).toEqual([]);
  });

  it('expands classes without reminders only within the requested dates plus duration carry-in', () => {
    const event = fixture.repository.createEvent({
      token: 'weekly',
      reminderLeadMinutes: null,
      draft: eventDraft({
        startAt: '2026-01-01T15:00:00.000Z',
        endAt: '2026-01-01T17:00:00.000Z',
        recurrence: {weekdays: [0, 1, 2, 3, 4, 5, 6], untilDate: '2026-12-31'},
      }),
    });
    const expand = jest.spyOn(scheduleTime, 'expandWeekly');
    const result = fixture.repository.agendaPage(window);
    expect(result.items.map(item => item.at)).toEqual([
      '2026-10-21T15:00:00.000Z',
      '2026-10-22T15:00:00.000Z',
    ]);
    expect(result.items.every(item => item.id === event.id)).toBe(true);
    expect(
      fixture.repository.reminderPage({kind: 'event', id: event.id}).items,
    ).toEqual([]);
    expect(expand).toHaveBeenCalledTimes(1);
    const query = expand.mock.calls[0]![0];
    expect(query.startDate).toBe('2026-10-21');
    expect(query.rule.untilDate).toBe('2026-10-22');
    expect(expand.mock.results[0]!.value).toHaveLength(2);
  });

  it('does not require a yearly recurrence scan when opening event details', () => {
    const event = fixture.repository.createEvent({
      token: 'annual',
      reminderLeadMinutes: null,
      draft: eventDraft({
        startAt: '2026-01-01T01:00:00.000Z',
        endAt: '2026-01-01T02:00:00.000Z',
        recurrence: {weekdays: [4], untilDate: '2026-12-31'},
      }),
    });
    const expand = jest.spyOn(scheduleTime, 'expandWeekly');
    expect(fixture.repository.getEvent(event.id)).toEqual(event);
    expect(expand).not.toHaveBeenCalled();
  });

  it('pages stable same-minute task and recurring occurrence keys without omissions or duplicates', () => {
    for (let index = 0; index < 123; index += 1) {
      addTask(`bulk_${String(index).padStart(3, '0')}`);
    }
    fixture.repository.createEvent({
      token: 'event',
      reminderLeadMinutes: null,
      draft: eventDraft(),
    });
    const requests: {sql: string; rows: number}[] = [];
    const repository = createPlannerRepository(
      {
        execute(sql, parameters) {
          const rows = fixture.sql.execute(sql, parameters);
          requests.push({sql, rows: rows.length});
          return rows;
        },
      },
      fixture.clock,
    );
    const keys: string[] = [];
    let after: string | undefined;
    do {
      const page = repository.agendaPage({...window, after, limit: 7});
      expect(page.items.length).toBeLessThanOrEqual(7);
      keys.push(...page.items.map(item => item.key));
      after = page.nextCursor ?? undefined;
    } while (after !== undefined);
    expect(keys).toHaveLength(124);
    expect(new Set(keys).size).toBe(124);
    requests.forEach(request => {
      expect(request.sql).toMatch(/ORDER BY id LIMIT 50$/);
      expect(request.rows).toBeLessThanOrEqual(50);
      expect(request.sql).not.toMatch(/OFFSET/);
    });
  });

  it('uses the real 23-hour DST date and the real 25-hour repeated date boundaries', () => {
    addTask('spring_before', {dueAt: '2026-03-08T04:59:59.999Z'});
    const springStart = addTask('spring_start', {
      dueAt: '2026-03-08T05:00:00.000Z',
    });
    const springEnd = addTask('spring_end', {
      dueAt: '2026-03-09T03:59:59.999Z',
    });
    addTask('spring_after', {dueAt: '2026-03-09T04:00:00.000Z'});
    expect(
      fixture.repository
        .agendaPage({
          fromDate: '2026-03-08',
          toDate: '2026-03-08',
          timezone: 'America/New_York',
        })
        .items.map(item => item.id),
    ).toEqual([springStart.id, springEnd.id]);
    const earlier = addTask('fold_earlier', {
      dueAt: '2026-11-01T05:30:00.000Z',
    });
    const later = addTask('fold_later', {dueAt: '2026-11-01T06:30:00.000Z'});
    const end = addTask('fall_end', {dueAt: '2026-11-02T04:59:59.999Z'});
    addTask('fall_after', {dueAt: '2026-11-02T05:00:00.000Z'});
    expect(
      fixture.repository
        .agendaPage({
          fromDate: '2026-11-01',
          toDate: '2026-11-01',
          timezone: 'America/New_York',
        })
        .items.map(item => item.id),
    ).toEqual([earlier.id, later.id, end.id]);
  });

  it('finds a real midnight-gap day and leaves a skipped calendar date empty', () => {
    const gap = addTask('midnight_gap', {dueAt: '2018-11-04T03:00:00.000Z'});
    addTask('gap_before', {dueAt: '2018-11-04T02:59:59.999Z'});
    expect(
      fixture.repository
        .agendaPage({
          fromDate: '2018-11-04',
          toDate: '2018-11-04',
          timezone: 'America/Sao_Paulo',
        })
        .items.map(item => item.id),
    ).toEqual([gap.id]);
    addTask('skip_before', {dueAt: '2011-12-30T09:59:59.999Z'});
    addTask('skip_after', {dueAt: '2011-12-30T10:00:00.000Z'});
    expect(
      fixture.repository.agendaPage({
        fromDate: '2011-12-30',
        toDate: '2011-12-30',
        timezone: 'Pacific/Apia',
      }).items,
    ).toEqual([]);
  });

  it('supports date windows at the domain year limits without validating their external UTC boundaries as saved values', () => {
    const first = addTask('first_year', {dueAt: '2000-01-01T00:00:00.000Z'});
    const last = addTask('last_year', {dueAt: '2100-12-31T23:59:59.999Z'});
    expect(
      fixture.repository
        .agendaPage({
          fromDate: '2000-01-01',
          toDate: '2000-01-01',
          timezone: 'Pacific/Kiritimati',
        })
        .items.map(item => item.id),
    ).toEqual([first.id]);
    expect(
      fixture.repository
        .agendaPage({
          fromDate: '2100-12-31',
          toDate: '2100-12-31',
          timezone: 'Pacific/Honolulu',
        })
        .items.map(item => item.id),
    ).toEqual([last.id]);
  });

  it('returns paired reminder histories independently from task completion and delivery cancellation', () => {
    const event = fixture.repository.createEvent({
      token: 'class',
      reminderLeadMinutes: 15,
      draft: eventDraft({recurrence: {weekdays: [4], untilDate: '2026-11-12'}}),
    });
    const first = fixture.repository.reminderPage({
      kind: 'event',
      id: event.id,
      limit: 2,
    });
    const second = fixture.repository.reminderPage({
      kind: 'event',
      id: event.id,
      limit: 2,
      offset: 2,
    });
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    expect([...first.items, ...second.items]).toHaveLength(4);
    first.items.forEach(({reminder, job}) => {
      expect(job.reminderId).toBe(reminder.id);
      expect(job.occurrenceKey).toBe(reminder.occurrenceKey);
      expect(job.deliveryState).toBe('UNAVAILABLE');
    });
    fixture.repository.updateEvent({
      token: 'cancel',
      id: event.id,
      expectedVersion: 1,
      reminderLeadMinutes: 15,
      draft: {...event, status: 'CANCELLED'},
    });
    expect(fixture.repository.agendaPage(window).items).toEqual([]);
    expect(
      fixture.repository
        .reminderPage({kind: 'event', id: event.id})
        .items.every(item => item.job.status === 'CANCELLED'),
    ).toBe(true);
    fixture.repository.deleteEvent({
      token: 'delete',
      id: event.id,
      expectedVersion: 2,
    });
    expect(
      fixture.repository.reminderPage({kind: 'event', id: event.id}).items,
    ).toEqual([]);
  });

  it.each([
    {weekdays: [4], untilDate: '2028-12-31'},
    {weekdays: [3], untilDate: '2026-12-31'},
    {weekdays: [4, 4], untilDate: '2026-12-31'},
  ])(
    'rejects malformed stored recurrence bounds or starting weekdays: %p',
    rule => {
      const event = fixture.repository.createEvent({
        token: 'corrupt',
        reminderLeadMinutes: null,
        draft: eventDraft(),
      });
      fixture.sql.execute('UPDATE events SET recurrence=? WHERE id=?', [
        JSON.stringify(rule),
        event.id,
      ]);
      expect(() => fixture.repository.getEvent(event.id)).toThrow();
      expect(() => fixture.repository.agendaPage(window)).toThrow();
    },
  );

  it('rejects a stored ambiguous fold without a choice rather than silently choosing', () => {
    const event = fixture.repository.createEvent({
      token: 'fold',
      reminderLeadMinutes: null,
      draft: eventDraft({
        startAt: '2026-11-01T05:30:00.000Z',
        endAt: '2026-11-01T06:00:00.000Z',
        timezone: 'America/New_York',
        recurrence: {weekdays: [0], untilDate: '2026-11-15', fold: 'earlier'},
      }),
    });
    fixture.sql.execute('UPDATE events SET recurrence=? WHERE id=?', [
      JSON.stringify({weekdays: [0], untilDate: '2026-11-15'}),
      event.id,
    ]);
    expect(() => fixture.repository.getEvent(event.id)).toThrow(/occurs twice/);
  });

  it('refuses a corrupted recurring occurrence in a DST gap when that window is requested', () => {
    const event = fixture.repository.createEvent({
      token: 'gap',
      reminderLeadMinutes: null,
      draft: eventDraft({
        startAt: '2026-02-01T07:30:00.000Z',
        endAt: '2026-02-01T08:30:00.000Z',
        timezone: 'America/New_York',
      }),
    });
    fixture.sql.execute('UPDATE events SET recurrence=? WHERE id=?', [
      JSON.stringify({weekdays: [0], untilDate: '2026-03-15'}),
      event.id,
    ]);
    expect(() =>
      fixture.repository.agendaPage({
        fromDate: '2026-03-08',
        toDate: '2026-03-08',
        timezone: 'America/New_York',
      }),
    ).toThrow(/does not exist/);
  });

  it('keeps task and reminder result allocations at page+1 beyond the debug snapshot cap', () => {
    fixture.sql
      .execute(`WITH RECURSIVE n(v) AS (SELECT 1 UNION ALL SELECT v+1 FROM n WHERE v<1200)
      INSERT INTO tasks(id,title,notes,due_at,timezone,status,version,created_at,updated_at)
      SELECT printf('bulk_%04d',v),'Synthetic','','2026-10-22T09:00:00.000Z','UTC','TODO',1,
        '2026-10-22T00:00:00.000Z','2026-10-22T00:00:00.000Z' FROM n`);
    const event = fixture.repository.createEvent({
      token: 'daily_history',
      reminderLeadMinutes: 15,
      draft: eventDraft({
        startAt: '2026-01-01T01:00:00.000Z',
        endAt: '2026-01-01T02:00:00.000Z',
        recurrence: {weekdays: [0, 1, 2, 3, 4, 5, 6], untilDate: '2026-12-31'},
      }),
    });
    const requests: {sql: string; rows: number}[] = [];
    const repository = createPlannerRepository(
      {
        execute(sql, parameters) {
          const rows = fixture.sql.execute(sql, parameters);
          requests.push({sql, rows: rows.length});
          return rows;
        },
      },
      fixture.clock,
    );
    expect(
      repository.tasksPage({filter: 'active', limit: 50, offset: 1000}).items,
    ).toHaveLength(50);
    expect(
      repository.reminderPage({
        kind: 'event',
        id: event.id,
        limit: 50,
        offset: 100,
      }).items,
    ).toHaveLength(50);
    expect(requests.map(request => request.rows)).toEqual([51, 51]);
    expect(repository.getTask('bulk_1200')?.title).toBe('Synthetic');
    expect(repository.agendaPage({...window, limit: 50}).items).toHaveLength(
      50,
    );
  });

  it('rejects invalid windows, pagination and cross-window or malformed cursors', () => {
    addTask('a');
    addTask('b');
    const cursor = fixture.repository.agendaPage({...window, limit: 1})
      .nextCursor!;
    expect(() =>
      fixture.repository.agendaPage({
        ...window,
        toDate: '2026-10-23',
        after: cursor,
      }),
    ).toThrow(/cursor/);
    for (const after of [
      'not json',
      'null',
      '[]',
      '{"version":1}',
      'x'.repeat(2049),
    ]) {
      expect(() => fixture.repository.agendaPage({...window, after})).toThrow(
        /cursor/,
      );
    }
    const invalidTime = JSON.parse(cursor) as {key: string[]};
    invalidTime.key[1] = '2026-10-22T29:00:00.000Z';
    expect(() =>
      fixture.repository.agendaPage({
        ...window,
        after: JSON.stringify(invalidTime),
      }),
    ).toThrow(/cursor/);
    for (const change of [
      {toDate: '2026-12-03'},
      {toDate: '2026-10-21'},
      {fromDate: '2026-02-31'},
      {timezone: 'Invalid/Zone'},
      {limit: 0},
      {limit: 51},
      {limit: 1.5},
    ]) {
      expect(() =>
        fixture.repository.agendaPage({...window, ...change}),
      ).toThrow();
    }
    expect(() =>
      fixture.repository.tasksPage({filter: 'active', offset: -1}),
    ).toThrow(/offset/);
    expect(() =>
      fixture.repository.tasksPage({filter: 'active', limit: 51}),
    ).toThrow(/size/);
    expect(() => fixture.repository.getTask('')).toThrow(/valid/);
  });
});
