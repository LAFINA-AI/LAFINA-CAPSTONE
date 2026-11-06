/**
 * AGY-PORT 06: bounded planner reads on real SQLite (node:sqlite).
 *
 * Synthetic collections for two owners prove SQL bounds, recurrence window
 * edges, completed/backlog/undated filtering, keyset export and that no read
 * crosses owners. The window result is compared with the legacy algorithm
 * (load everything, filter and expand in JavaScript) that Calendar used before.
 *
 * Set AGY_MEASURE=1 to print host fixture timings. They are host-only Jest
 * measurements and say nothing about phone UI or inference performance.
 */
import {performance} from 'perf_hooks';
import {db, initDatabase, tasksStore, timeBlocksStore} from '../../src/storage';
import type {DatabaseTransaction} from '../../src/storage/database';
import {
  createPlannerQueries,
  MAX_PAGE_SIZE,
  plannerQueries,
} from '../../src/storage/plannerQueries';
import {getOccurrences} from '../../src/storage/rruleHelper';

const A = 'p06-owner-a';
const B = 'p06-owner-b';
const CREATED = '2026-01-01T00:00:00.000Z';

const dateOf = (dayOffset: number): string => {
  const d = new Date(2026, 0, 1);
  d.setDate(d.getDate() + dayOffset);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

let counter = 0;
const nextId = (prefix: string): string => {
  counter += 1;
  return `${prefix}-${String(counter).padStart(7, '0')}`;
};

const insertTask = (
  owner: string,
  row: {
    id?: string;
    due?: string | null;
    time?: string | null;
    done?: boolean;
    rule?: string | null;
    deleted?: boolean;
    created?: string;
    title?: string;
  },
): string => {
  const id = row.id ?? nextId('t');
  db.executeSync(
    `INSERT INTO tasks (id, user_id, title, due_date, due_time, is_completed, priority, category, recurrence_rule, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, 'Medium', 'General', ?, ?, ?, ?)`,
    [
      id,
      owner,
      row.title ?? id,
      row.due === undefined ? null : row.due,
      row.time ?? null,
      row.done ? 1 : 0,
      row.rule ?? null,
      row.created ?? CREATED,
      row.created ?? CREATED,
      row.deleted ? CREATED : null,
    ],
  );
  return id;
};

const insertScheduled = (
  table: 'events' | 'time_blocks',
  owner: string,
  row: {id?: string; date: string; rule?: string | null; deleted?: boolean},
): string => {
  const id = row.id ?? nextId(table === 'events' ? 'e' : 'b');
  db.executeSync(
    `INSERT INTO ${table} (id, user_id, title, date, start_time, end_time, recurrence_rule, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, '09:00', '10:00', ?, ?, ?, ?)`,
    [
      id,
      owner,
      id,
      row.date,
      row.rule ?? null,
      CREATED,
      CREATED,
      row.deleted ? CREATED : null,
    ],
  );
  return id;
};

const clearPlanner = (): void => {
  for (const table of ['tasks', 'events', 'time_blocks']) {
    db.executeSync(`DELETE FROM ${table}`);
  }
};

/** The pre-AGY-PORT-06 Calendar algorithm: everything, then filter/expand in JS. */
const legacyWindow = (owner: string, start: string, end: string) => {
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T23:59:59.999`);
  const expand = <T extends {id: string; recurrenceRule?: string | null}>(
    items: T[],
    dateKey: 'dueDate' | 'date',
  ): string[] => {
    const out: string[] = [];
    for (const item of items) {
      const base = (item as Record<string, unknown>)[dateKey] as
        | string
        | null
        | undefined;
      if (item.recurrenceRule && base) {
        for (const d of getOccurrences(base, item.recurrenceRule, from, to)) {
          out.push(d === base ? item.id : `${item.id}_occur_${d}`);
        }
      } else if (base && base >= start && base <= end) {
        out.push(item.id);
      }
    }
    return out.sort();
  };
  return {
    tasks: expand(tasksStore.getAllTasks(owner), 'dueDate'),
    events: expand(tasksStore.getAllEvents(owner), 'date'),
    blocks: expand(timeBlocksStore.getAll(owner), 'date'),
  };
};

const ids = (items: {id: string}[]): string[] =>
  items.map(item => item.id).sort();

describe('AGY-PORT 06 bounded planner queries', () => {
  beforeAll(() => {
    initDatabase();
  });

  beforeEach(() => {
    clearPlanner();
  });

  afterAll(() => {
    clearPlanner();
  });

  describe('window', () => {
    test('matches the legacy full-read result on a large two-owner collection and never returns the other owner', () => {
      for (const owner of [A, B]) {
        for (let i = 0; i < 1500; i += 1) {
          insertTask(owner, {
            due: dateOf(i % 365),
            time: i % 3 ? '08:00' : null,
            done: i % 4 === 0,
          });
          insertScheduled('events', owner, {date: dateOf((i * 7) % 365)});
          insertScheduled('time_blocks', owner, {date: dateOf((i * 3) % 365)});
        }
        for (let i = 0; i < 300; i += 1) insertTask(owner, {due: null});
        insertTask(owner, {due: dateOf(10), deleted: true});
        insertTask(owner, {due: dateOf(3), rule: 'FREQ=WEEKLY;INTERVAL=1'});
        insertScheduled('events', owner, {
          date: dateOf(0),
          rule: 'FREQ=DAILY;INTERVAL=1',
        });
        insertScheduled('time_blocks', owner, {
          date: dateOf(5),
          rule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        });
        insertScheduled('time_blocks', owner, {
          date: dateOf(400),
          rule: 'FREQ=DAILY;INTERVAL=1',
        });
      }

      for (const [start, end] of [
        [dateOf(40), dateOf(46)],
        [dateOf(59), dateOf(89)],
        [dateOf(0), dateOf(0)],
        [dateOf(360), dateOf(370)],
      ]) {
        const got = plannerQueries.window(A, start, end);
        const want = legacyWindow(A, start, end);
        expect(ids(got.tasks)).toEqual(want.tasks);
        expect(ids(got.events)).toEqual(want.events);
        expect(ids(got.blocks)).toEqual(want.blocks);
        for (const item of [...got.tasks, ...got.events, ...got.blocks]) {
          expect(item.userId).toBe(A);
        }
      }
    });

    test('includes completed dated tasks, excludes undated, empty-date and deleted rows', () => {
      const day = dateOf(20);
      const open = insertTask(A, {due: day});
      const done = insertTask(A, {due: day, done: true});
      insertTask(A, {due: null});
      insertTask(A, {due: ''});
      insertTask(A, {due: day, deleted: true});
      insertScheduled('events', A, {date: day, deleted: true});
      insertTask(B, {due: day});

      const got = plannerQueries.window(A, day, day);
      expect(ids(got.tasks)).toEqual([open, done].sort());
      expect(got.events).toEqual([]);
    });

    test('window edges are inclusive and recurrences use Calendar occurrence ids', () => {
      const base = dateOf(0); // 2026-01-01
      const weekly = insertScheduled('events', A, {
        date: base,
        rule: 'FREQ=WEEKLY;INTERVAL=1',
      });
      const later = insertScheduled('events', A, {
        date: dateOf(30),
        rule: 'FREQ=DAILY;INTERVAL=1',
      });

      // Starts and ends exactly on occurrences (day 7 and day 14).
      const got = plannerQueries.window(A, dateOf(7), dateOf(14));
      expect(ids(got.events)).toEqual(
        [
          `${weekly}_occur_${dateOf(7)}`,
          `${weekly}_occur_${dateOf(14)}`,
        ].sort(),
      );
      expect(got.events.map(e => e.date).sort()).toEqual([
        dateOf(7),
        dateOf(14),
      ]);

      // The base occurrence keeps its own id.
      expect(ids(plannerQueries.window(A, base, base).events)).toEqual([
        weekly,
      ]);

      // A series that starts after the window end is not read into the window.
      expect(
        plannerQueries.window(A, dateOf(28), dateOf(29)).events.map(e => e.id),
      ).not.toContain(later);
      expect(
        plannerQueries.window(A, dateOf(30), dateOf(30)).events.map(e => e.id),
      ).toContain(later);
    });

    test('rejects malformed or reversed windows instead of reading everything', () => {
      expect(() => plannerQueries.window(A, '2026-1-1', dateOf(3))).toThrow(
        /Invalid start date/,
      );
      expect(() => plannerQueries.window(A, dateOf(3), 'tomorrow')).toThrow(
        /Invalid end date/,
      );
      expect(() => plannerQueries.window(A, dateOf(5), dateOf(4))).toThrow(
        /after its end/,
      );
    });
  });

  describe('overdue backlog', () => {
    test('is bounded, oldest first, excludes completed/undated/empty-date/future/other-owner, and reports the exact total', () => {
      const today = dateOf(100);
      for (let i = 0; i < 150; i += 1) insertTask(A, {due: dateOf(i % 99)});
      insertTask(A, {due: dateOf(50), done: true});
      insertTask(A, {due: null});
      insertTask(A, {due: ''});
      insertTask(A, {due: today});
      insertTask(A, {due: dateOf(101)});
      insertTask(A, {due: dateOf(1), deleted: true});
      insertTask(B, {due: dateOf(1)});

      const result = plannerQueries.overdueTasks(A, today, 40);
      expect(result.total).toBe(150);
      expect(result.items).toHaveLength(40);
      const dues = result.items.map(t => t.dueDate as string);
      expect([...dues].sort()).toEqual(dues);
      for (const task of result.items) {
        expect(task.userId).toBe(A);
        expect(task.isCompleted).toBe(false);
        expect((task.dueDate as string) < today).toBe(true);
      }
    });

    test('caps an oversized limit at the maximum page size', () => {
      for (let i = 0; i < MAX_PAGE_SIZE + 20; i += 1) {
        insertTask(A, {due: dateOf(1)});
      }
      const result = plannerQueries.overdueTasks(A, dateOf(2), 10_000);
      expect(result.items).toHaveLength(MAX_PAGE_SIZE);
      expect(result.total).toBe(MAX_PAGE_SIZE + 20);
    });
  });

  describe('undated paging (reused from AGY-PORT 04)', () => {
    test('equal created_at timestamps never drop or repeat a row, and owners stay separate', () => {
      const mine: string[] = [];
      for (let i = 0; i < 95; i += 1) mine.push(insertTask(A, {due: null}));
      for (let i = 0; i < 5; i += 1) mine.push(insertTask(A, {due: ''}));
      insertTask(A, {due: null, done: true});
      for (let i = 0; i < 30; i += 1) insertTask(B, {due: null});

      const seen: string[] = [];
      let after: string | null = null;
      let pages = 0;
      do {
        const page = tasksStore.getUndatedTasksPage(A, {limit: 20, after});
        seen.push(...page.items.map(t => t.id));
        for (const task of page.items) expect(task.userId).toBe(A);
        after = page.nextCursor;
        pages += 1;
      } while (after && pages < 50);

      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.sort()).toEqual(mine.sort());

      // A cursor taken from A's pages cannot reveal A's rows to B.
      const fromA = tasksStore.getUndatedTasksPage(A, {limit: 20});
      const bPage = tasksStore.getUndatedTasksPage(B, {
        limit: 100,
        after: fromA.nextCursor,
      });
      for (const task of bPage.items) expect(task.userId).toBe(B);
    });
  });

  describe('explicit full export', () => {
    test('returns every owned, non-deleted row in small keyset batches', () => {
      const owned = new Set<string>();
      for (let i = 0; i < 53; i += 1) {
        owned.add(insertTask(A, {due: i % 2 ? dateOf(i) : null}));
      }
      for (let i = 0; i < 17; i += 1) {
        owned.add(insertScheduled('events', A, {date: dateOf(i)}));
        owned.add(insertScheduled('time_blocks', A, {date: dateOf(i)}));
      }
      insertTask(A, {due: dateOf(1), deleted: true});
      insertTask(B, {due: dateOf(1)});

      const statements: string[] = [];
      const spy: DatabaseTransaction = {
        executeSync: (sql: string, params?: never) => {
          statements.push(sql);
          return db.executeSync(sql, params);
        },
      } as DatabaseTransaction;

      const all = createPlannerQueries(spy).exportAll(A, 7);
      const got = [...all.tasks, ...all.events, ...all.blocks].map(i => i.id);
      expect(new Set(got).size).toBe(got.length);
      expect(new Set(got)).toEqual(owned);
      // 53 tasks in batches of 7 → 8 reads; 17 rows → 3 reads each.
      expect(statements).toHaveLength(8 + 3 + 3);
      for (const sql of statements) expect(sql).toMatch(/LIMIT \?/);
    });
  });

  describe('SQL plans and error propagation', () => {
    /**
     * The Jest op-sqlite mock returns rows only for SELECT/PRAGMA, so plans are
     * read from a node:sqlite copy of the app's exact schema (from sqlite_master).
     */
    const planOf = (sql: string, params: unknown[]): string => {
      const {DatabaseSync} = require('node:sqlite');
      const copy = new DatabaseSync(':memory:');
      try {
        const schema = (
          db.executeSync(
            "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table', 'index') AND tbl_name IN ('tasks', 'events', 'time_blocks') ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END",
          ).rows || []
        ).map((row: any) => String(row.sql));
        for (const statement of schema) copy.exec(statement);
        return copy
          .prepare(`EXPLAIN QUERY PLAN ${sql}`)
          .all(...(params as never[]))
          .map((row: any) => String(row.detail))
          .join(' | ');
      } finally {
        copy.close();
      }
    };

    test('window and overdue reads use the owner/date indexes', () => {
      insertTask(A, {due: dateOf(1)});
      const statements: {sql: string; params: unknown[]}[] = [];
      const spy = {
        executeSync: (sql: string, params?: never) => {
          statements.push({sql, params: params ?? []});
          return db.executeSync(sql, params);
        },
      } as DatabaseTransaction;
      const queries = createPlannerQueries(spy);
      queries.window(A, dateOf(0), dateOf(6));
      queries.overdueTasks(A, dateOf(6));
      expect(statements.length).toBe(8);
      const expected = [
        'idx_tasks_user_due',
        'idx_tasks_user_due',
        'idx_events_user_date',
        'idx_events_user_date',
        'idx_time_blocks_user_date',
        'idx_time_blocks_user_date',
        'idx_tasks_user_due',
        'idx_tasks_user_due',
      ];
      statements.forEach(({sql, params}, index) => {
        const plan = planOf(sql, params);
        expect(plan).toContain(expected[index]);
        expect(plan).not.toMatch(/SCAN (tasks|events|time_blocks)\b(?! USING)/);
      });
    });

    test('storage errors are thrown, never turned into an empty schedule', () => {
      const broken = {
        executeSync: () => {
          throw new Error('disk I/O error');
        },
      } as unknown as DatabaseTransaction;
      const queries = createPlannerQueries(broken);
      expect(() => queries.window(A, dateOf(0), dateOf(0))).toThrow(
        'disk I/O error',
      );
      expect(() => queries.overdueTasks(A, dateOf(0))).toThrow(
        'disk I/O error',
      );
      expect(() => queries.exportAll(A)).toThrow('disk I/O error');
    });
  });

  const measure = process.env.AGY_MEASURE === '1' ? test : test.skip;
  measure('host fixture timing (AGY_MEASURE=1 only)', () => {
    for (const owner of [A, B]) {
      for (let i = 0; i < 10_000; i += 1) {
        insertTask(owner, {due: i % 10 ? dateOf(i % 730) : null});
        insertScheduled('events', owner, {date: dateOf((i * 7) % 730)});
        insertScheduled('time_blocks', owner, {date: dateOf((i * 3) % 730)});
      }
    }
    const time = (fn: () => unknown, runs = 20): number => {
      fn();
      const started = performance.now();
      for (let i = 0; i < runs; i += 1) fn();
      return (performance.now() - started) / runs;
    };
    const result = {
      kind: 'host-jest-node-sqlite-fixture',
      rowsPerOwner: {tasks: 10_000, events: 10_000, time_blocks: 10_000},
      owners: 2,
      weekWindowMs: time(() =>
        plannerQueries.window(A, dateOf(300), dateOf(306)),
      ),
      monthWindowMs: time(() =>
        plannerQueries.window(A, dateOf(300), dateOf(341)),
      ),
      legacyWeekFullReadMs: time(() =>
        legacyWindow(A, dateOf(300), dateOf(306)),
      ),
      overdueMs: time(() => plannerQueries.overdueTasks(A, dateOf(400))),
      exportAllMs: time(() => plannerQueries.exportAll(A), 3),
    };
    console.log(`AGY_PORT_06_TIMING ${JSON.stringify(result)}`);
    expect(result.weekWindowMs).toBeGreaterThan(0);
  });
});
