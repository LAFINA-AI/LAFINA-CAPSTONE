import type {
  AcademicEvent,
  ChatMessage,
  Clock,
  Edit,
  EventDraft,
  Mutation,
  PlannerRepository,
  ReminderCommand,
  Target,
  Task,
  TaskDraft,
  UpcomingItem,
} from '../domain/planner';
import {
  eventOccurrences,
  validateEvent,
  validateTask,
  validateToken,
} from '../domain/plannerValidation';
import {assertTimezone, assertUtc, localDateTime} from '../domain/scheduleTime';
import {inTransaction} from './plannerDatabase';
import {
  decodeTask,
  decodeEvent,
  decodeReminder,
  decodeJob,
  str,
  nullable,
  oneOf,
} from './plannerRows';
import {createReminderOperations} from './reminderOperations';
import type {LocalSqlConnection} from './preferencesRepository';

const systemClock: Clock = {now: () => new Date().toISOString()};
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return entry;
  });
}
function checkVersion(version: number) {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error('Invalid record version.');
  }
}

/** Owns bounded synchronous SQL mutations. No native side effects run inside a transaction. */
export function createPlannerRepository(
  db: LocalSqlConnection,
  clock: Clock = systemClock,
): PlannerRepository {
  const reminders = createReminderOperations(db);
  function now() {
    const value = clock.now();
    assertUtc(value);
    return value;
  }
  function mutate<T>(
    token: string,
    kind: string,
    payload: unknown,
    apply: (at: string) => T,
  ): T {
    validateToken(token);
    const fingerprint = canonical({kind, payload});
    return inTransaction(db, () => {
      const receipt = db.execute(
        'SELECT fingerprint, result FROM operation_receipts WHERE token = ?',
        [token],
      )[0];
      if (receipt) {
        if (str(receipt, 'fingerprint') !== fingerprint) {
          throw new Error(
            'This operation token was already used for a different action.',
          );
        }
        // Receipts are local transaction results, never interpreted as commands.
        return JSON.parse(str(receipt, 'result')) as T;
      }
      const at = now();
      const result = apply(at);
      // An early/stale no-op is not a committed outcome. Its token may be retried at due time.
      if (kind === 'reminderAction' && result === 'ignored') {
        return result;
      }
      db.execute(
        'INSERT INTO operation_receipts(token,fingerprint,result,created_at) VALUES(?,?,?,?)',
        [token, fingerprint, JSON.stringify(result ?? null), at],
      );
      return result;
    });
  }
  function liveTask(target: Target) {
    checkVersion(target.expectedVersion);
    const row = db.execute(
      'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
      [target.id],
    )[0];
    if (!row) {
      throw new Error('Task is no longer available. Refresh the planner.');
    }
    const task = decodeTask(row);
    if (task.version !== target.expectedVersion) {
      throw new Error('Task changed. Refresh before saving.');
    }
    return task;
  }
  function liveEvent(target: Target) {
    checkVersion(target.expectedVersion);
    const row = db.execute(
      'SELECT * FROM events WHERE id = ? AND deleted_at IS NULL',
      [target.id],
    )[0];
    if (!row) {
      throw new Error('Event is no longer available. Refresh the planner.');
    }
    const event = decodeEvent(row);
    if (event.version !== target.expectedVersion) {
      throw new Error('Event changed. Refresh before saving.');
    }
    return event;
  }
  function insertTask(command: Mutation<TaskDraft>, at: string): Task {
    const task: Task = {
      ...command.draft,
      reminderLeadMinutes: command.reminderLeadMinutes,
      id: `task:${command.token}`,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    db.execute(
      'INSERT INTO tasks(id,title,notes,due_at,due_date,reminder_lead_minutes,timezone,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      [
        task.id,
        task.title,
        task.notes,
        task.dueAt,
        task.dueDate,
        task.reminderLeadMinutes,
        task.timezone,
        task.status,
        1,
        at,
        at,
      ],
    );
    reminders.set(
      'task',
      task.id,
      task.dueAt && ['TODO', 'IN_PROGRESS'].includes(task.status)
        ? [task.dueAt]
        : [],
      command.reminderLeadMinutes,
      at,
    );
    return task;
  }
  function insertEvent(
    command: Mutation<EventDraft>,
    at: string,
  ): AcademicEvent {
    const event: AcademicEvent = {
      ...command.draft,
      reminderLeadMinutes: command.reminderLeadMinutes,
      id: `event:${command.token}`,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    db.execute(
      'INSERT INTO events(id,title,notes,start_at,end_at,timezone,recurrence,reminder_lead_minutes,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        event.id,
        event.title,
        event.notes,
        event.startAt,
        event.endAt,
        event.timezone,
        event.recurrence ? JSON.stringify(event.recurrence) : null,
        event.reminderLeadMinutes,
        event.status,
        1,
        at,
        at,
      ],
    );
    reminders.set(
      'event',
      event.id,
      event.status === 'ACTIVE' ? eventOccurrences(event) : [],
      command.reminderLeadMinutes,
      at,
    );
    return event;
  }
  return {
    snapshot() {
      const tasks = db.execute(
        'SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY created_at,id LIMIT 501',
      );
      const events = db.execute(
        'SELECT * FROM events WHERE deleted_at IS NULL ORDER BY start_at,id LIMIT 501',
      );
      const pendingReminders = db.execute(
        'SELECT * FROM reminders ORDER BY scheduled_at,id LIMIT 501',
      );
      const jobs = db.execute(
        'SELECT * FROM reminder_jobs ORDER BY run_at,id LIMIT 501',
      );
      const truncated = [tasks, events, pendingReminders, jobs].some(
        rows => rows.length > 500,
      );
      return {
        tasks: tasks.slice(0, 500).map(decodeTask),
        events: events.slice(0, 500).map(decodeEvent),
        reminders: pendingReminders.slice(0, 500).map(decodeReminder),
        jobs: jobs.slice(0, 500).map(decodeJob),
        ...(truncated ? {truncated: true} : {}),
      };
    },
    createTask(command) {
      validateTask(command.draft, command.reminderLeadMinutes);
      return mutate(command.token, 'createTask', command, at =>
        insertTask(command, at),
      );
    },
    updateTask(command: Edit<TaskDraft>) {
      validateTask(command.draft, command.reminderLeadMinutes);
      return mutate(command.token, 'updateTask', command, at => {
        const old = liveTask(command);
        const next: Task = {
          ...command.draft,
          reminderLeadMinutes: command.reminderLeadMinutes,
          id: old.id,
          version: old.version + 1,
          createdAt: old.createdAt,
          updatedAt: at,
        };
        const changed =
          old.dueAt !== next.dueAt ||
          old.reminderLeadMinutes !== command.reminderLeadMinutes ||
          ['TODO', 'IN_PROGRESS'].includes(old.status) !==
            ['TODO', 'IN_PROGRESS'].includes(next.status);
        db.execute(
          'UPDATE tasks SET title=?,notes=?,due_at=?,due_date=?,reminder_lead_minutes=?,timezone=?,status=?,version=?,updated_at=? WHERE id=?',
          [
            next.title,
            next.notes,
            next.dueAt,
            next.dueDate,
            next.reminderLeadMinutes,
            next.timezone,
            next.status,
            next.version,
            at,
            next.id,
          ],
        );
        if (changed) {
          reminders.set(
            'task',
            next.id,
            next.dueAt && ['TODO', 'IN_PROGRESS'].includes(next.status)
              ? [next.dueAt]
              : [],
            command.reminderLeadMinutes,
            at,
          );
        }
        return next;
      });
    },
    deleteTask(command) {
      mutate(command.token, 'deleteTask', command, at => {
        const task = liveTask(command);
        reminders.cancel('task', task.id, at);
        db.execute(
          "UPDATE tasks SET deleted_at=?,status='CANCELLED',version=version+1,updated_at=? WHERE id=?",
          [at, at, task.id],
        );
        return null;
      });
    },
    createEvent(command) {
      validateEvent(command.draft, command.reminderLeadMinutes);
      return mutate(command.token, 'createEvent', command, at =>
        insertEvent(command, at),
      );
    },
    updateEvent(command: Edit<EventDraft>) {
      validateEvent(command.draft, command.reminderLeadMinutes);
      return mutate(command.token, 'updateEvent', command, at => {
        const old = liveEvent(command);
        const next: AcademicEvent = {
          ...command.draft,
          reminderLeadMinutes: command.reminderLeadMinutes,
          id: old.id,
          version: old.version + 1,
          createdAt: old.createdAt,
          updatedAt: at,
        };
        const changed =
          old.startAt !== next.startAt ||
          old.timezone !== next.timezone ||
          canonical(old.recurrence) !== canonical(next.recurrence) ||
          old.status !== next.status ||
          old.reminderLeadMinutes !== command.reminderLeadMinutes;
        db.execute(
          'UPDATE events SET title=?,notes=?,start_at=?,end_at=?,timezone=?,recurrence=?,reminder_lead_minutes=?,status=?,version=?,updated_at=? WHERE id=?',
          [
            next.title,
            next.notes,
            next.startAt,
            next.endAt,
            next.timezone,
            next.recurrence ? JSON.stringify(next.recurrence) : null,
            next.reminderLeadMinutes,
            next.status,
            next.version,
            at,
            next.id,
          ],
        );
        if (changed) {
          reminders.set(
            'event',
            next.id,
            next.status === 'ACTIVE' ? eventOccurrences(next) : [],
            command.reminderLeadMinutes,
            at,
          );
        }
        return next;
      });
    },
    deleteEvent(command) {
      mutate(command.token, 'deleteEvent', command, at => {
        const event = liveEvent(command);
        reminders.cancel('event', event.id, at);
        db.execute(
          "UPDATE events SET deleted_at=?,status='CANCELLED',version=version+1,updated_at=? WHERE id=?",
          [at, at, event.id],
        );
        return null;
      });
    },
    reminderAction(command: ReminderCommand) {
      if (
        !Number.isSafeInteger(command.generation) ||
        command.generation < 1 ||
        !['RING', 'ACK', 'MISS', 'CANCEL', 'SNOOZE'].includes(
          command.action.kind,
        )
      ) {
        throw new Error('Invalid reminder action or generation.');
      }
      return mutate(command.token, 'reminderAction', command, at =>
        reminders.apply(command, at),
      );
    },
    upcoming(fromUtc, toUtc, timezone) {
      assertUtc(fromUtc);
      assertUtc(toUtc);
      assertTimezone(timezone);
      if (
        toUtc <= fromUtc ||
        Date.parse(toUtc) - Date.parse(fromUtc) > 366 * 86400000
      ) {
        throw new Error('Upcoming query must cover 1 instant to 366 days.');
      }
      const fromDate = localDateTime(fromUtc, timezone).date;
      const toDate = localDateTime(
        new Date(Date.parse(toUtc) - 1).toISOString(),
        timezone,
      ).date;
      const result: UpcomingItem[] = [];
      for (const row of db.execute(
        "SELECT * FROM tasks WHERE deleted_at IS NULL AND status IN ('TODO','IN_PROGRESS') AND ((due_at>=? AND due_at<?) OR (due_date>=? AND due_date<=?))",
        [fromUtc, toUtc, fromDate, toDate],
      )) {
        const task = decodeTask(row);
        result.push({
          kind: 'task',
          id: task.id,
          title: task.title,
          at: task.dueAt,
          date: task.dueDate,
          occurrenceKey: task.id,
        });
      }
      for (const row of db.execute(
        "SELECT * FROM events WHERE deleted_at IS NULL AND status='ACTIVE' AND start_at<?",
        [toUtc],
      )) {
        const event = decodeEvent(row);
        const duration = Date.parse(event.endAt) - Date.parse(event.startAt);
        for (const occurrence of eventOccurrences(event)) {
          if (
            occurrence < toUtc &&
            Date.parse(occurrence) + duration > Date.parse(fromUtc)
          ) {
            result.push({
              kind: 'event',
              id: event.id,
              title: event.title,
              at: occurrence,
              date: null,
              occurrenceKey: `${event.id}|${occurrence}`,
            });
          }
        }
      }
      return result.sort(
        (a, b) =>
          (a.date ?? localDateTime(a.at!, timezone).date).localeCompare(
            b.date ?? localDateTime(b.at!, timezone).date,
          ) ||
          (a.at ?? '').localeCompare(b.at ?? '') ||
          a.id.localeCompare(b.id),
      );
    },
    appendChat(message: ChatMessage) {
      validateToken(message.id);
      assertUtc(message.createdAt);
      if (
        !['user', 'assistant'].includes(message.role) ||
        !message.text.trim() ||
        message.text.length > 4000 ||
        (message.actionId !== null && message.actionId.length > 160)
      ) {
        throw new Error('Invalid local chat message.');
      }
      inTransaction(db, () => {
        const existing = db.execute('SELECT * FROM chat_messages WHERE id=?', [
          message.id,
        ])[0];
        if (existing) {
          if (
            str(existing, 'created_at') !== message.createdAt ||
            str(existing, 'role') !== message.role ||
            str(existing, 'text') !== message.text ||
            nullable(existing, 'action_id') !== message.actionId
          ) {
            throw new Error('Chat message ID already used.');
          }
          return;
        }
        db.execute(
          'INSERT INTO chat_messages(id,created_at,role,text,action_id) VALUES(?,?,?,?,?)',
          [
            message.id,
            message.createdAt,
            message.role,
            message.text,
            message.actionId,
          ],
        );
        db.execute(
          'DELETE FROM chat_messages WHERE id NOT IN (SELECT id FROM chat_messages ORDER BY created_at DESC,id DESC LIMIT 100)',
        );
      });
    },
    recentChat(limit = 100) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error('Chat limit must be 1–100.');
      }
      return db
        .execute(
          'SELECT * FROM chat_messages ORDER BY created_at DESC,id DESC LIMIT ?',
          [limit],
        )
        .map(row => ({
          id: str(row, 'id'),
          createdAt: str(row, 'created_at'),
          role: oneOf(str(row, 'role'), ['user', 'assistant']),
          text: str(row, 'text'),
          actionId: nullable(row, 'action_id'),
        }));
    },
  };
}
