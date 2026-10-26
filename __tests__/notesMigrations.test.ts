import {DatabaseSync} from 'node:sqlite';
import {initializePlannerDatabase} from '../src/core/storage/plannerDatabase';
import {createPlannerRepository} from '../src/core/storage/plannerRepository';
import {createPreferencesRepository} from '../src/core/storage/preferencesRepository';
import {defaultPreferences} from '../src/core/domain/preferences';
import {createNotesRepository} from '../src/core/storage/notesRepository';
import {connect} from './helpers/sqlite';
import {frozenSchemaTwo} from './helpers/phase03Schema';
import {
  eventDraft,
  failOnce,
  fixtureNow,
  taskDraft,
} from './helpers/plannerFixtures';

describe('additive notes schema 2→3 on real host SQLite', () => {
  let native: DatabaseSync;
  let sql: ReturnType<typeof connect>;
  const tables = [
    'app_settings',
    'local_profile',
    'tasks',
    'events',
    'reminders',
    'reminder_jobs',
    'operation_receipts',
    'chat_messages',
    'native_delivery_settings',
    'native_alarm_registrations',
    'native_alarm_events',
  ];
  function snapshot() {
    return Object.fromEntries(
      tables.map(table => [
        table,
        sql.execute(`SELECT * FROM ${table} ORDER BY 1`),
      ]),
    );
  }
  beforeEach(async () => {
    native = new DatabaseSync(':memory:');
    native.exec(frozenSchemaTwo);
    sql = connect(native);
    sql.execute('PRAGMA foreign_keys=ON');
    sql.execute('INSERT INTO local_profile VALUES(?,?)', ['local', fixtureNow]);
    await createPreferencesRepository(sql).save(
      defaultPreferences('Asia/Manila'),
    );
    const planner = createPlannerRepository(sql, {now: () => fixtureNow});
    planner.createTask({
      token: 'old_task',
      draft: taskDraft(),
      reminderLeadMinutes: 0,
    });
    planner.createEvent({
      token: 'old_event',
      draft: eventDraft(),
      reminderLeadMinutes: 10,
    });
    const job = planner.snapshot().jobs[0]!;
    sql.execute('UPDATE native_delivery_settings SET enabled=1,full_screen=1');
    sql.execute('INSERT INTO native_alarm_registrations VALUES(?,?,?,?,?,?)', [
      job.id,
      job.generation,
      job.occurrenceKey,
      job.runAt,
      'EXACT',
      fixtureNow,
    ]);
    sql.execute(
      'INSERT INTO native_alarm_events(job_id,generation,event,at_utc,planned_at) VALUES(?,?,?,?,?)',
      [job.id, job.generation, 'REGISTERED', fixtureNow, job.runAt],
    );
  });
  afterEach(() => native.close());

  it('preserves every prior table row/settings/native registration/receipt exactly and permits native reminder data reads', () => {
    const before = snapshot();
    initializePlannerDatabase(sql, fixtureNow);
    expect(sql.execute('PRAGMA user_version')).toEqual([{user_version: 3}]);
    expect(snapshot()).toEqual(before);
    expect(sql.execute('SELECT * FROM notes')).toEqual([]);
    expect(sql.execute('PRAGMA integrity_check')).toEqual([
      {integrity_check: 'ok'},
    ]);
    expect(sql.execute('PRAGMA foreign_key_check')).toEqual([]);
    const notes = createNotesRepository(sql, {now: () => fixtureNow});
    notes.create({
      token: 'new_note',
      draft: {
        title: 'Synthetic migration note',
        body: '',
        category: 'Personal',
        pinned: true,
      },
    });
    initializePlannerDatabase(sql, '2026-10-27T00:00:00.000Z');
    expect(notes.counts()).toEqual({completedTasks: 0, notes: 1});
    expect(snapshot().reminder_jobs).toEqual(before.reminder_jobs);
  });

  it.each([
    'CREATE TABLE notes',
    'CREATE INDEX notes_category_order',
    'PRAGMA user_version = 3',
    'COMMIT',
  ])(
    'rolls back every additive change if interrupted at %s, then retries without data loss',
    boundary => {
      const before = snapshot();
      expect(() =>
        initializePlannerDatabase(
          failOnce(sql, new RegExp(`^${boundary}`)),
          fixtureNow,
        ),
      ).toThrow('Injected');
      expect(sql.execute('PRAGMA user_version')).toEqual([{user_version: 2}]);
      expect(snapshot()).toEqual(before);
      expect(
        sql.execute("SELECT name FROM sqlite_master WHERE name LIKE 'notes%'"),
      ).toEqual([]);
      initializePlannerDatabase(sql, fixtureNow);
      expect(sql.execute('PRAGMA user_version')).toEqual([{user_version: 3}]);
      expect(snapshot()).toEqual(before);
    },
  );
});
