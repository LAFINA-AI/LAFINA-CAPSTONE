import {DatabaseSync} from 'node:sqlite';
import type {
  Clock,
  EventDraft,
  ReminderAction,
  ReminderCommand,
  ReminderJob,
  TaskDraft,
} from '../../src/core/domain/planner';
import {initializePlannerDatabase} from '../../src/core/storage/plannerDatabase';
import {createPlannerRepository} from '../../src/core/storage/plannerRepository';
import type {LocalSqlConnection} from '../../src/core/storage/preferencesRepository';
import {connect} from './sqlite';

export const fixtureNow = '2026-10-22T08:00:00.000Z';

export function taskDraft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: 'Read chapter',
    notes: 'Synthetic test fixture',
    dueAt: '2026-10-22T09:00:00.000Z',
    dueDate: null,
    timezone: 'Asia/Manila',
    status: 'TODO',
    ...overrides,
  };
}

export function eventDraft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    title: 'Study group',
    notes: 'Synthetic test fixture',
    startAt: '2026-10-22T09:00:00.000Z',
    endAt: '2026-10-22T10:00:00.000Z',
    timezone: 'Asia/Manila',
    recurrence: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

export function createPlannerFixture(file = ':memory:') {
  const db = new DatabaseSync(file);
  const sql = connect(db);
  let current = fixtureNow;
  const clock: Clock = {now: () => current};
  initializePlannerDatabase(sql, fixtureNow);
  return {
    db,
    sql,
    clock,
    repository: createPlannerRepository(sql, clock),
    setNow(value: string) {
      current = value;
    },
    close: () => db.close(),
  };
}

export function reminderCommand(
  job: ReminderJob,
  token: string,
  action: ReminderAction,
): ReminderCommand {
  return {
    token,
    id: job.reminderId,
    occurrenceKey: job.occurrenceKey,
    generation: job.generation,
    action,
  };
}

/** Fail once at a real SQL boundary, then allow rollback and retry to execute. */
export function failOnce(
  sql: LocalSqlConnection,
  statementPattern: RegExp,
): LocalSqlConnection {
  let failed = false;
  return {
    execute(statement, params) {
      if (!failed && statementPattern.test(statement)) {
        failed = true;
        throw new Error('Injected SQL failure');
      }
      return sql.execute(statement, params);
    },
  };
}
