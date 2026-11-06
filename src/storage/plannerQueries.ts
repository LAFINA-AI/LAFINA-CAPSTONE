import {db} from './database';
import type {DatabaseTransaction} from './database';
import {mapRowToEvent, mapRowToTask} from './tasksStore';
import type {Event, Task} from './tasksStore';
import {mapRowToBlock} from './timeBlocksStore';
import type {TimeBlock} from './timeBlocksStore';
import {getOccurrences} from './rruleHelper';

/**
 * Bounded planner reads (AGY-PORT 06).
 *
 * Every read is scoped to one owner and to a requested date window, filter or
 * page, and is answered by SQL using the existing owner/date indexes
 * (`idx_tasks_user_due`, `idx_events_user_date`, `idx_time_blocks_user_date`)
 * instead of loading the whole history into JavaScript. Unlike the legacy
 * store getters, these functions do not swallow storage errors: a caller must
 * be able to tell "nothing scheduled" from "storage unavailable".
 *
 * Tasks with no due date (NULL or '') are never in a window or overdue; they
 * are paged by `tasksStore.getUndatedTasksPage` (AGY-PORT 04).
 *
 * Recurring rows are few and are selected by SQL (rule present, base date on
 * or before the window end), then expanded with the same `getOccurrences`
 * rule and occurrence ID scheme Calendar has always used.
 */

export interface PlannerWindow {
  tasks: Task[];
  events: Event[];
  blocks: TimeBlock[];
}

/** All owned rows of one kind, for an explicit full export. */
export interface PlannerExport {
  tasks: Task[];
  events: Event[];
  blocks: TimeBlock[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_EXPORT_BATCH = 500;

const assertDate = (value: string, label: string): void => {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`Invalid ${label} date: ${value}`);
  }
};

const dayStart = (date: string): Date => new Date(`${date}T00:00:00`);
const dayEnd = (date: string): Date => new Date(`${date}T23:59:59.999`);

const boundedLimit = (limit: number): number =>
  Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(limit) || 1));

/** Expands recurring rows into the window with Calendar's occurrence IDs. */
const expand = <T extends {id: string; recurrenceRule?: string | null}>(
  fixed: T[],
  recurring: T[],
  dateOf: (item: T) => string | null | undefined,
  withDate: (item: T, date: string) => T,
  start: string,
  end: string,
): T[] => {
  const out = [...fixed];
  const rangeStart = dayStart(start);
  const rangeEnd = dayEnd(end);
  for (const item of recurring) {
    const base = dateOf(item);
    if (!base) continue;
    for (const date of getOccurrences(
      base,
      item.recurrenceRule,
      rangeStart,
      rangeEnd,
    )) {
      out.push(
        date === base
          ? item
          : {...withDate(item, date), id: `${item.id}_occur_${date}`},
      );
    }
  }
  return out;
};

export const createPlannerQueries = (executor: DatabaseTransaction = db) => {
  const rows = (sql: string, params: unknown[]): any[] =>
    executor.executeSync(sql, params as never).rows || [];

  return {
    /**
     * Dated tasks, events and time blocks visible in [start, end] (inclusive
     * local dates), with recurring occurrences expanded. Completed tasks are
     * included, as Calendar shows them; undated tasks are not.
     */
    window(owner: string, start: string, end: string): PlannerWindow {
      assertDate(start, 'start');
      assertDate(end, 'end');
      if (start > end) throw new Error('Window start is after its end.');
      const tasks = expand(
        rows(
          `SELECT * FROM tasks
            WHERE user_id = ? AND is_completed IN (0, 1)
              AND due_date BETWEEN ? AND ? AND deleted_at IS NULL
              AND (recurrence_rule IS NULL OR recurrence_rule = '')
            ORDER BY due_date, due_time, id`,
          [owner, start, end],
        ).map(mapRowToTask),
        rows(
          `SELECT * FROM tasks
            WHERE user_id = ? AND deleted_at IS NULL
              AND recurrence_rule IS NOT NULL AND recurrence_rule <> ''
              AND due_date IS NOT NULL AND due_date <> '' AND due_date <= ?
            ORDER BY due_date, due_time, id`,
          [owner, end],
        ).map(mapRowToTask),
        task => task.dueDate,
        (task, date) => ({...task, dueDate: date}),
        start,
        end,
      );
      const scheduled = <T extends {id: string}>(
        table: 'events' | 'time_blocks',
        map: (row: unknown) => T,
        dateOf: (item: T) => string,
        withDate: (item: T, date: string) => T,
      ): T[] =>
        expand(
          rows(
            `SELECT * FROM ${table}
              WHERE user_id = ? AND date BETWEEN ? AND ? AND deleted_at IS NULL
                AND (recurrence_rule IS NULL OR recurrence_rule = '')
              ORDER BY date, start_time, id`,
            [owner, start, end],
          ).map(map),
          rows(
            `SELECT * FROM ${table}
              WHERE user_id = ? AND date <= ? AND deleted_at IS NULL
                AND recurrence_rule IS NOT NULL AND recurrence_rule <> ''
              ORDER BY date, start_time, id`,
            [owner, end],
          ).map(map),
          dateOf,
          withDate,
          start,
          end,
        );
      const events = scheduled<Event>(
        'events',
        mapRowToEvent,
        event => event.date,
        (event, date) => ({...event, date}),
      );
      const blocks = scheduled<TimeBlock>(
        'time_blocks',
        mapRowToBlock,
        block => block.date,
        (block, date) => ({...block, date}),
      );
      return {tasks, events, blocks};
    },

    /**
     * Unfinished tasks due before `today`, oldest first, at most `limit`, plus
     * the exact total so the UI can say how many more exist.
     */
    overdueTasks(
      owner: string,
      today: string,
      limit = 100,
    ): {items: Task[]; total: number} {
      assertDate(today, 'today');
      const items = rows(
        `SELECT * FROM tasks
          WHERE user_id = ? AND is_completed = 0 AND due_date < ?
            AND due_date <> '' AND deleted_at IS NULL
          ORDER BY due_date, due_time, id
          LIMIT ?`,
        [owner, today, boundedLimit(limit)],
      ).map(mapRowToTask);
      const total = Number(
        rows(
          `SELECT COUNT(*) AS n FROM tasks
            WHERE user_id = ? AND is_completed = 0 AND due_date < ?
              AND due_date <> '' AND deleted_at IS NULL`,
          [owner, today],
        )[0]?.n ?? 0,
      );
      return {items, total};
    },

    /**
     * Every owned, non-deleted row, read in keyset batches of `batchSize` so
     * no single query loads the whole history. Used only by the explicit
     * export/share action.
     */
    exportAll(owner: string, batchSize = DEFAULT_EXPORT_BATCH): PlannerExport {
      const size = Math.max(1, Math.floor(batchSize) || 1);
      const readAll = <T>(table: string, map: (row: unknown) => T): T[] => {
        const out: T[] = [];
        let lastId = '';
        for (;;) {
          const batch = rows(
            `SELECT * FROM ${table}
              WHERE user_id = ? AND deleted_at IS NULL AND id > ?
              ORDER BY id LIMIT ?`,
            [owner, lastId, size],
          );
          for (const row of batch) out.push(map(row));
          if (batch.length < size) return out;
          lastId = String(batch[batch.length - 1].id);
        }
      };
      return {
        tasks: readAll('tasks', mapRowToTask),
        events: readAll('events', mapRowToEvent),
        blocks: readAll('time_blocks', mapRowToBlock),
      };
    },
  };
};

export type PlannerQueries = ReturnType<typeof createPlannerQueries>;

/** Default instance on the app database. */
export const plannerQueries = createPlannerQueries();
