import {open} from '@op-engineering/op-sqlite';
import {initializePlannerDatabase} from './plannerDatabase';
import {createPlannerRepository} from './plannerRepository';
import {createPreferencesRepository} from './preferencesRepository';
import type {LocalSqlConnection} from './preferencesRepository';
import {defaultPreferences} from '../domain/preferences';
import type {Mutation, TaskDraft} from '../domain/planner';

/** Private QA build only. This dedicated synthetic DB never opens the student's DB. */
export async function runPlannerSqlChecks(): Promise<string> {
  const native = open({name: 'lafina-phase02-qa.sqlite'});
  const db: LocalSqlConnection = {
    execute: (sql, params) => native.executeSync(sql, params).rows,
  };
  function check(condition: boolean, label: string) {
    if (!condition) {
      throw new Error(`SQLite QA failed: ${label}`);
    }
  }
  try {
    initializePlannerDatabase(db, '2026-10-22T00:00:00.000Z');
    // Only synthetic rows in this explicitly named QA database are reset.
    for (const table of [
      'reminder_jobs',
      'reminders',
      'tasks',
      'events',
      'operation_receipts',
      'chat_messages',
    ]) {
      db.execute(`DELETE FROM ${table}`);
    }
    const preferences = createPreferencesRepository(db);
    await preferences.save(defaultPreferences('Asia/Manila'));
    initializePlannerDatabase(db, '2026-10-22T00:00:00.000Z');
    check(
      (await preferences.load())?.timezone === 'Asia/Manila',
      'settings preservation',
    );
    const command: Mutation<TaskDraft> = {
      token: 'native_qa_task',
      draft: {
        title: 'Synthetic SQL check',
        notes: '',
        dueAt: '2026-10-22T00:00:00.000Z',
        dueDate: null,
        timezone: 'Asia/Manila',
        status: 'TODO',
      },
      reminderLeadMinutes: 0,
    };
    let inject = true;
    const faultDb: LocalSqlConnection = {
      execute(sql, params) {
        if (inject && /INSERT INTO reminder_jobs/.test(sql)) {
          throw new Error('Synthetic interrupted job write');
        }
        return db.execute(sql, params);
      },
    };
    const repository = createPlannerRepository(faultDb, {
      now: () => command.draft.dueAt!,
    });
    let rejected = false;
    try {
      repository.createTask(command);
    } catch {
      rejected = true;
    }
    check(rejected, 'injected failure');
    const empty = repository.snapshot();
    check(
      empty.tasks.length === 0 &&
        empty.reminders.length === 0 &&
        empty.jobs.length === 0,
      'paired rollback',
    );
    inject = false;
    const task = repository.createTask(command);
    check(
      repository.createTask(command).id === task.id &&
        repository.snapshot().jobs.length === 1,
      'idempotent create',
    );
    const before = repository.snapshot();
    const reminder = before.reminders[0]!;
    const job = before.jobs[0]!;
    const target = {
      id: reminder.id,
      occurrenceKey: reminder.occurrenceKey,
      generation: job.generation,
    };
    check(
      repository.reminderAction({
        ...target,
        token: 'native_qa_ring',
        action: {kind: 'RING', timezone: 'Asia/Manila', quietHours: null},
      }) === 'applied',
      'ring data state',
    );
    check(
      repository.reminderAction({
        ...target,
        token: 'native_qa_ack',
        action: {kind: 'ACK'},
      }) === 'applied',
      'ack data state',
    );
    const after = repository.snapshot();
    check(
      after.tasks[0]?.status === 'TODO' &&
        after.reminders[0]?.status === 'ACKNOWLEDGED' &&
        after.jobs[0]?.status === 'ACKNOWLEDGED',
      'ACK independent of completion',
    );
    check(
      repository.reminderAction({
        ...target,
        token: 'native_qa_ack',
        action: {kind: 'ACK'},
      }) === 'applied' && repository.snapshot().jobs[0]?.attemptCount === 1,
      'duplicate outcome',
    );
    check(
      db.execute('PRAGMA integrity_check')[0]?.integrity_check === 'ok',
      'integrity',
    );
    check(db.execute('PRAGMA foreign_key_check').length === 0, 'foreign keys');
    return 'PASS: native SQLite migration replay/settings preservation, paired rollback, create retry, ACK vs task completion, duplicate outcome, integrity and foreign keys. Synthetic QA DB only. No alarm/audio delivery tested.';
  } finally {
    native.close();
  }
}
