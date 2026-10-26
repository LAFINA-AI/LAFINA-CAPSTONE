import type {
  AcademicEvent,
  AgendaItem,
  AgendaQuery,
  PlannerRepository,
} from '../domain/planner';
import {
  assertDate,
  assertTimezone,
  assertUtc,
  expandWeekly,
  localDateTime,
} from '../domain/scheduleTime';
import {assertDatabaseUsable} from './plannerDatabase';
import {
  decodeEvent,
  decodeJob,
  decodeReminder,
  decodeTask,
  str,
} from './plannerRows';
import type {LocalSqlConnection} from './preferencesRepository';
import {createCommandQueries} from './commandQueries';

const DAY_MS = 86400000;
const BATCH_SIZE = 50;
type Row = Record<string, unknown>;
type SortKey = [string, string, string, string, string];
type QueryMethods = Pick<
  PlannerRepository,
  | 'getTask'
  | 'getEvent'
  | 'tasksPage'
  | 'agendaPage'
  | 'reminderPage'
  | 'findTargets'
>;

function pageBounds(query: {offset?: number; limit?: number}) {
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 20;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('Page offset must be a nonnegative whole number.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Page size must be 1–50.');
  }
  return {offset, limit};
}
function assertId(id: string) {
  if (typeof id !== 'string' || !id.trim() || id.length > 160) {
    throw new Error('Choose a valid saved item.');
  }
}
function compareKey(left: SortKey, right: SortKey): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]! < right[index]!) {
      return -1;
    }
    if (left[index]! > right[index]!) {
      return 1;
    }
  }
  return 0;
}
function itemKey(item: AgendaItem): SortKey {
  // A carry-in event precedes times on the first visible date. UTC occurrence
  // identity remains intact even when two local clock times match at a fold.
  const local = item.at === null ? null : localDateTime(item.at, item.timezone);
  return [
    item.date,
    local?.date === item.date ? item.at! : '',
    item.kind,
    item.id,
    item.occurrenceKey,
  ];
}
function scope(query: AgendaQuery): string[] {
  return [
    query.fromDate,
    query.toDate,
    query.timezone,
    String(query.includeCompleted === true),
  ];
}
function readCursor(query: AgendaQuery): SortKey | null {
  if (query.after === undefined) {
    return null;
  }
  if (typeof query.after !== 'string' || query.after.length > 2048) {
    throw new Error('Invalid agenda cursor. Refresh the agenda.');
  }
  let value: unknown;
  try {
    value = JSON.parse(query.after);
  } catch {
    throw new Error('Invalid agenda cursor. Refresh the agenda.');
  }
  const row = value as Record<string, unknown> | null;
  if (
    row === null ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    row.version !== 1 ||
    JSON.stringify(row.scope) !== JSON.stringify(scope(query)) ||
    !Array.isArray(row.key) ||
    row.key.length !== 5 ||
    row.key.some(part => typeof part !== 'string' || part.length > 512) ||
    row.key[0] < query.fromDate ||
    row.key[0] > query.toDate ||
    !/^(?:|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/.test(
      row.key[1] as string,
    ) ||
    !['task', 'event'].includes(row.key[2] as string) ||
    !(row.key[3] as string).trim() ||
    !(row.key[4] as string).trim()
  ) {
    throw new Error('Invalid agenda cursor. Refresh the agenda.');
  }
  try {
    assertDate(row.key[0] as string);
    if (row.key[1] !== '') {
      assertUtc(row.key[1] as string);
    }
  } catch {
    throw new Error('Invalid agenda cursor. Refresh the agenda.');
  }
  return row.key as SortKey;
}

/** First instant whose local date is at least `date`, including midnight gaps.
 * Searching calendar dates handles 23/25-hour days and skipped local dates,
 * without inventing a 24-hour UTC interval or normalizing an invalid 00:00.
 */
function dateBoundary(date: string, timezone: string): number {
  const nominal = Date.parse(`${date}T00:00:00.000Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateAt = (instant: number) => {
    const parts = formatter.formatToParts(instant);
    const get = (type: Intl.DateTimeFormatPartTypes) => {
      const value = parts.find(part => part.type === type)?.value;
      if (value === undefined) {
        throw new Error('The device could not resolve the agenda timezone.');
      }
      return value;
    };
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  let before = nominal - 2 * DAY_MS;
  let after = nominal + 2 * DAY_MS;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (dateAt(middle) < date) {
      before = middle;
    } else {
      after = middle;
    }
  }
  return after;
}
function eventWindow(event: AcademicEvent, from: number, to: number): string[] {
  if (event.recurrence === null) {
    return [event.startAt];
  }
  const duration = Date.parse(event.endAt) - Date.parse(event.startAt);
  const lower = Math.max(Date.parse(event.startAt), from - duration + 1);
  // Domain UTC values end in 2100. A weekly start uses whole minutes, so
  // excluding the last millisecond cannot drop a valid weekly occurrence.
  const upper = Math.min(to, Date.parse('2100-12-31T23:59:59.999Z'));
  if (lower >= upper) {
    return [];
  }
  const original = localDateTime(event.startAt, event.timezone);
  const first = localDateTime(
    new Date(lower).toISOString(),
    event.timezone,
  ).date;
  const last = localDateTime(
    new Date(upper - 1).toISOString(),
    event.timezone,
  ).date;
  const startDate = first > original.date ? first : original.date;
  const untilDate =
    last < event.recurrence.untilDate ? last : event.recurrence.untilDate;
  if (startDate > untilDate) {
    return [];
  }
  // Clamp the calendar loop itself, not only its UTC output. For a 42-day
  // window plus <=24-hour carry-in this visits at most 45 local dates.
  return expandWeekly({
    startDate,
    time: original.time,
    timezone: event.timezone,
    rule: {...event.recurrence, untilDate},
    fold: event.recurrence.fold,
    fromUtc: new Date(lower).toISOString(),
    toUtc: new Date(upper).toISOString(),
  });
}

/** Product reads use finite result pages; snapshot() remains a separate QA view.
 * Agenda SQL candidates stream in 50-row keyset batches. Only the best page+1
 * entries and a single event's window occurrences are retained in JS memory.
 * Total scan time still depends on matching candidates; this is not a CPU cap.
 */
export function createPlannerQueries(db: LocalSqlConnection): QueryMethods {
  function scan(
    table: 'tasks' | 'events',
    predicate: string,
    parameters: (string | number | null)[],
    visit: (row: Row) => void,
  ) {
    let after = '';
    while (true) {
      const rows = db.execute(
        `SELECT * FROM ${table} WHERE ${predicate} AND id>? ORDER BY id LIMIT ${BATCH_SIZE}`,
        [...parameters, after],
      );
      for (const row of rows) {
        visit(row);
      }
      if (rows.length < BATCH_SIZE) {
        return;
      }
      after = str(rows[rows.length - 1]!, 'id');
    }
  }
  return {
    ...createCommandQueries(db),
    getTask(id) {
      assertDatabaseUsable(db);
      assertId(id);
      const row = db.execute(
        'SELECT * FROM tasks WHERE id=? AND deleted_at IS NULL',
        [id],
      )[0];
      return row ? decodeTask(row) : null;
    },
    getEvent(id) {
      assertDatabaseUsable(db);
      assertId(id);
      const row = db.execute(
        'SELECT * FROM events WHERE id=? AND deleted_at IS NULL',
        [id],
      )[0];
      return row ? decodeEvent(row, {validateSeries: false}) : null;
    },
    tasksPage(query) {
      assertDatabaseUsable(db);
      const {offset, limit} = pageBounds(query);
      if (!['active', 'completed', 'all'].includes(query.filter)) {
        throw new Error('Choose active, completed or all tasks.');
      }
      const statuses =
        query.filter === 'active'
          ? "('TODO','IN_PROGRESS')"
          : query.filter === 'completed'
          ? "('COMPLETED')"
          : "('TODO','IN_PROGRESS','COMPLETED')";
      const rows = db.execute(
        `SELECT * FROM tasks WHERE deleted_at IS NULL AND status IN ${statuses}
         ORDER BY (due_at IS NULL AND due_date IS NULL),COALESCE(due_date,due_at),id LIMIT ? OFFSET ?`,
        [limit + 1, offset],
      );
      return {
        items: rows.slice(0, limit).map(decodeTask),
        hasMore: rows.length > limit,
      };
    },
    agendaPage(query) {
      assertDatabaseUsable(db);
      const {limit} = pageBounds({limit: query.limit});
      assertDate(query.fromDate);
      assertDate(query.toDate);
      assertTimezone(query.timezone);
      const days =
        (Date.parse(query.toDate) - Date.parse(query.fromDate)) / DAY_MS + 1;
      if (days < 1 || days > 42) {
        throw new Error(
          'Agenda windows must cover 1–42 inclusive calendar dates.',
        );
      }
      if (
        query.includeCompleted !== undefined &&
        typeof query.includeCompleted !== 'boolean'
      ) {
        throw new Error('Choose whether completed tasks are included.');
      }
      const after = readCursor(query);
      const from = dateBoundary(query.fromDate, query.timezone);
      const nextDate = new Date(Date.parse(query.toDate) + DAY_MS)
        .toISOString()
        .slice(0, 10);
      const to = dateBoundary(nextDate, query.timezone);
      const fromUtc = new Date(from).toISOString();
      const toUtc = new Date(to).toISOString();
      const best: {item: AgendaItem; key: SortKey}[] = [];
      function offer(item: Omit<AgendaItem, 'key'>) {
        const candidate = {...item, key: ''};
        const key = itemKey(candidate);
        if (after && compareKey(key, after) <= 0) {
          return;
        }
        candidate.key = JSON.stringify(key);
        let index = 0;
        while (index < best.length && compareKey(best[index]!.key, key) < 0) {
          index += 1;
        }
        if (index <= limit) {
          best.splice(index, 0, {item: candidate, key});
          if (best.length > limit + 1) {
            best.pop();
          }
        }
      }
      const statuses = query.includeCompleted
        ? "('TODO','IN_PROGRESS','COMPLETED')"
        : "('TODO','IN_PROGRESS')";
      scan(
        'tasks',
        `deleted_at IS NULL AND status IN ${statuses}
        AND ((due_at>=? AND due_at<?) OR (due_date>=? AND due_date<=?))`,
        [fromUtc, toUtc, query.fromDate, query.toDate],
        row => {
          const task = decodeTask(row);
          const date =
            task.dueDate ?? localDateTime(task.dueAt!, query.timezone).date;
          offer({
            kind: 'task',
            id: task.id,
            title: task.title,
            date,
            at: task.dueAt,
            endAt: null,
            occurrenceKey: task.id,
            status: task.status,
            timezone: query.timezone,
          });
        },
      );
      scan(
        'events',
        "deleted_at IS NULL AND status='ACTIVE' AND start_at<? AND (recurrence IS NOT NULL OR end_at>?)",
        [toUtc, fromUtc],
        row => {
          const event = decodeEvent(row, {validateSeries: false});
          const duration = Date.parse(event.endAt) - Date.parse(event.startAt);
          for (const occurrence of eventWindow(event, from, to)) {
            const end = Date.parse(occurrence) + duration;
            if (Date.parse(occurrence) >= to || end <= from) {
              continue;
            }
            const localDate = localDateTime(occurrence, query.timezone).date;
            offer({
              kind: 'event',
              id: event.id,
              title: event.title,
              date: localDate < query.fromDate ? query.fromDate : localDate,
              at: occurrence,
              endAt: new Date(end).toISOString(),
              occurrenceKey: `${event.id}|${occurrence}`,
              status: event.status,
              timezone: query.timezone,
            });
          }
        },
      );
      const items = best.slice(0, limit).map(entry => entry.item);
      return {
        items,
        nextCursor:
          best.length > limit
            ? JSON.stringify({
                version: 1,
                scope: scope(query),
                key: best[limit - 1]!.key,
              })
            : null,
      };
    },
    reminderPage(query) {
      assertDatabaseUsable(db);
      assertId(query.id);
      const {offset, limit} = pageBounds(query);
      if (query.kind !== 'task' && query.kind !== 'event') {
        throw new Error('Choose a task or event reminder list.');
      }
      const source = query.kind === 'task' ? 'tasks' : 'events';
      const column = query.kind === 'task' ? 'task_id' : 'event_id';
      // Histories include cancelled jobs: a cancellation is a useful delivery
      // outcome, distinct from rendering a cancelled source in the agenda.
      const rows = db.execute(
        `SELECT r.*,j.id AS job_id,j.reminder_id AS job_reminder_id,
        j.occurrence_key AS job_occurrence_key,j.run_at AS job_run_at,j.status AS job_status,
        j.generation AS job_generation,j.attempt_count AS job_attempt_count,
        j.delivery_state AS job_delivery_state,j.delivery_reason AS job_delivery_reason
        FROM reminders r JOIN reminder_jobs j ON j.reminder_id=r.id
        JOIN ${source} s ON s.id=r.${column}
        WHERE s.id=? AND s.deleted_at IS NULL ORDER BY r.scheduled_at,r.id LIMIT ? OFFSET ?`,
        [query.id, limit + 1, offset],
      );
      return {
        hasMore: rows.length > limit,
        items: rows.slice(0, limit).map(row => ({
          reminder: decodeReminder(row),
          job: decodeJob({
            id: row.job_id,
            reminder_id: row.job_reminder_id,
            occurrence_key: row.job_occurrence_key,
            run_at: row.job_run_at,
            status: row.job_status,
            generation: row.job_generation,
            attempt_count: row.job_attempt_count,
            delivery_state: row.job_delivery_state,
            delivery_reason: row.job_delivery_reason,
          }),
        })),
      };
    },
  };
}
