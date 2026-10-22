import {DatabaseSync} from 'node:sqlite';
import {
  assertDatabaseUsable,
  initializePlannerDatabase,
  inTransaction,
} from '../src/core/storage/plannerDatabase';
import {defaultPreferences} from '../src/core/domain/preferences';
import {createPreferencesRepository} from '../src/core/storage/preferencesRepository';
import type {LocalSqlConnection} from '../src/core/storage/preferencesRepository';
import {connect} from './helpers/sqlite';

const now = '2026-10-22T08:00:00.000Z';

// Frozen Phase 02 schema fixture. Do not derive this from the current migration:
// upgrades must accept the tables already installed by the earlier application.
const phaseTwoSchema = `
CREATE TABLE app_settings (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL);
CREATE TABLE local_profile (id TEXT PRIMARY KEY NOT NULL CHECK (id = 'local'), created_at TEXT NOT NULL);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0), notes TEXT NOT NULL,
  due_at TEXT, due_date TEXT,
  reminder_lead_minutes INTEGER CHECK (reminder_lead_minutes IS NULL OR (typeof(reminder_lead_minutes)='integer' AND reminder_lead_minutes BETWEEN 0 AND 120)),
  timezone TEXT NOT NULL CHECK (length(trim(timezone)) > 0),
  status TEXT NOT NULL CHECK (status IN ('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version >= 1),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  CHECK (due_at IS NULL OR due_date IS NULL)
);
CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0), notes TEXT NOT NULL,
  start_at TEXT NOT NULL, end_at TEXT NOT NULL,
  timezone TEXT NOT NULL CHECK (length(trim(timezone)) > 0), recurrence TEXT,
  reminder_lead_minutes INTEGER CHECK (reminder_lead_minutes IS NULL OR (typeof(reminder_lead_minutes)='integer' AND reminder_lead_minutes BETWEEN 0 AND 120)),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CANCELLED')),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version >= 1),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  CHECK (end_at > start_at)
);
CREATE TABLE reminders (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  occurrence_key TEXT NOT NULL CHECK (length(occurrence_key) > 0), scheduled_at TEXT NOT NULL,
  lead_minutes INTEGER NOT NULL CHECK (typeof(lead_minutes) = 'integer' AND lead_minutes >= 0),
  status TEXT NOT NULL CHECK (status IN ('SCHEDULED', 'RINGING', 'ACKNOWLEDGED', 'SNOOZED', 'MISSED', 'CANCELLED')),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version >= 1), last_outcome_at TEXT,
  UNIQUE (task_id, occurrence_key), UNIQUE (event_id, occurrence_key),
  CHECK ((task_id IS NOT NULL AND event_id IS NULL) OR (task_id IS NULL AND event_id IS NOT NULL))
);
CREATE TABLE reminder_jobs (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  reminder_id TEXT NOT NULL UNIQUE REFERENCES reminders(id) ON DELETE CASCADE,
  occurrence_key TEXT NOT NULL CHECK (length(occurrence_key) > 0), run_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RINGING', 'ACKNOWLEDGED', 'MISSED', 'CANCELLED')),
  generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation >= 0),
  attempt_count INTEGER NOT NULL CHECK (typeof(attempt_count) = 'integer' AND attempt_count >= 0),
  delivery_state TEXT NOT NULL DEFAULT 'UNAVAILABLE' CHECK (delivery_state IN ('UNAVAILABLE', 'PENDING', 'REGISTERED', 'FAILED')),
  delivery_reason TEXT
);
CREATE TABLE operation_receipts (
  token TEXT PRIMARY KEY NOT NULL CHECK (length(trim(token)) > 0),
  fingerprint TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0), created_at TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')), text TEXT NOT NULL, action_id TEXT
);
CREATE INDEX tasks_upcoming ON tasks (status, due_at, id);
CREATE INDEX tasks_due_date ON tasks (status, due_date, id);
CREATE INDEX events_upcoming ON events (status, start_at, id);
CREATE INDEX reminders_pending ON reminders (status, scheduled_at, id);
CREATE INDEX reminder_jobs_pending ON reminder_jobs (status, run_at, id);
CREATE INDEX chat_messages_recent ON chat_messages (created_at, id);
PRAGMA user_version = 1;
`;

describe('capstone planner migrations using real host SQLite', () => {
  let db: DatabaseSync;
  let sql: LocalSqlConnection;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    sql = connect(db);
  });
  afterEach(() => db.close());

  function seedSettings(): string {
    sql.execute(
      'CREATE TABLE app_settings (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL)',
    );
    const originalPayload = '{"nickname":"Student","opaqueFutureField":true}';
    sql.execute('INSERT INTO app_settings VALUES (1, ?)', [originalPayload]);
    return originalPayload;
  }

  function seedTask(id = 'task-1'): void {
    sql.execute(
      `INSERT INTO tasks (id, title, notes, timezone, status, version, created_at, updated_at)
       VALUES (?, 'Read chapter', '', 'Asia/Manila', 'TODO', 1, ?, ?)`,
      [id, now, now],
    );
  }

  function seedEvent(): void {
    sql.execute(
      `INSERT INTO events (id, title, notes, start_at, end_at, timezone, status, version, created_at, updated_at)
       VALUES ('event-1', 'Class', '', ?, ?, 'Asia/Manila', 'ACTIVE', 1, ?, ?)`,
      [now, '2026-10-22T09:00:00.000Z', now, now],
    );
  }

  function seedReminder(
    id = 'reminder-1',
    taskId: string | null = 'task-1',
    eventId: string | null = null,
    occurrence = '2026-10-22T08:00:00.000Z',
  ): void {
    sql.execute(
      `INSERT INTO reminders (id, task_id, event_id, occurrence_key, scheduled_at, lead_minutes, status, version)
       VALUES (?, ?, ?, ?, ?, 15, 'SCHEDULED', 1)`,
      [id, taskId, eventId, occurrence, now],
    );
  }

  function seedJob(id = 'job-1', reminder = 'reminder-1'): void {
    sql.execute(
      `INSERT INTO reminder_jobs (id, reminder_id, occurrence_key, run_at, status, generation, attempt_count)
       VALUES (?, ?, ?, ?, 'PENDING', 1, 0)`,
      [id, reminder, now, now],
    );
  }

  function seedVersionOne() {
    db.exec(phaseTwoSchema);
    sql.execute('INSERT INTO app_settings VALUES (1, ?)', [
      '{"nickname":"Synthetic Student","opaqueFutureField":true}',
    ]);
    sql.execute('INSERT INTO local_profile VALUES (?, ?)', [
      'local',
      '2026-10-01T00:00:00.000Z',
    ]);
    seedTask();
    seedEvent();
    seedReminder();
    seedJob();
    seedReminder('event-reminder', null, 'event-1');
    seedJob('event-job', 'event-reminder');
    sql.execute(
      "UPDATE tasks SET version=4,reminder_lead_minutes=15,notes='Synthetic preserved notes'",
    );
    sql.execute('UPDATE events SET version=9,reminder_lead_minutes=10');
    sql.execute(
      "UPDATE reminders SET status='SNOOZED',version=8,last_outcome_at=? WHERE id='reminder-1'",
      [now],
    );
    sql.execute(
      "UPDATE reminders SET status='ACKNOWLEDGED',version=3,last_outcome_at=? WHERE id='event-reminder'",
      [now],
    );
    sql.execute(
      "UPDATE reminder_jobs SET generation=7,attempt_count=2,delivery_state='REGISTERED' WHERE id='job-1'",
    );
    sql.execute(
      "UPDATE reminder_jobs SET status='ACKNOWLEDGED',generation=3,attempt_count=1 WHERE id='event-job'",
    );
    sql.execute('INSERT INTO operation_receipts VALUES (?, ?, ?, ?)', [
      'preserved_token',
      '{"opaqueFingerprint":true}',
      '{"id":"task-1","version":4}',
      now,
    ]);
    sql.execute('INSERT INTO chat_messages VALUES (?, ?, ?, ?, ?)', [
      'preserved_chat',
      now,
      'user',
      'Synthetic preserved message',
      'preserved_token',
    ]);
  }

  function existingRows() {
    return Object.fromEntries(
      [
        'app_settings',
        'local_profile',
        'tasks',
        'events',
        'reminders',
        'reminder_jobs',
        'operation_receipts',
        'chat_messages',
      ].map(table => [table, sql.execute(`SELECT * FROM ${table} ORDER BY 1`)]),
    );
  }

  it('creates a fresh versioned schema, one anonymous profile and required indices', () => {
    initializePlannerDatabase(sql, now);
    expect(sql.execute('PRAGMA user_version')).toEqual([{user_version: 2}]);
    expect(sql.execute('PRAGMA foreign_keys')).toEqual([{foreign_keys: 1}]);
    expect(sql.execute('PRAGMA busy_timeout')).toEqual([{timeout: 5000}]);
    expect(sql.execute('SELECT * FROM local_profile')).toEqual([
      {id: 'local', created_at: now},
    ]);
    expect(sql.execute('SELECT * FROM app_settings')).toEqual([]);
    const names = sql
      .execute("SELECT name FROM sqlite_master WHERE type = 'index'")
      .map(row => row.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'tasks_upcoming',
        'tasks_due_date',
        'events_upcoming',
        'reminders_pending',
        'reminder_jobs_pending',
        'chat_messages_recent',
      ]),
    );
    expect(() =>
      sql.execute('INSERT INTO local_profile VALUES (?, ?)', ['another', now]),
    ).toThrow();
  });

  it('preserves the exact Phase 01 settings payload and schema during migration and replay', () => {
    const payload = seedSettings();
    const originalSchema = sql.execute(
      "SELECT sql FROM sqlite_master WHERE name = 'app_settings'",
    );
    initializePlannerDatabase(sql, now);
    seedTask();
    initializePlannerDatabase(sql, '2026-11-01T00:00:00.000Z');
    expect(sql.execute('SELECT payload FROM app_settings')).toEqual([
      {payload},
    ]);
    expect(
      sql.execute("SELECT sql FROM sqlite_master WHERE name = 'app_settings'"),
    ).toEqual(originalSchema);
    expect(sql.execute('SELECT * FROM local_profile')).toEqual([
      {id: 'local', created_at: now},
    ]);
    expect(sql.execute('SELECT id FROM tasks')).toEqual([{id: 'task-1'}]);
  });

  it('upgrades the frozen Phase 02 schema without changing any existing payload, record, version or receipt', () => {
    seedVersionOne();
    const before = existingRows();
    initializePlannerDatabase(sql, '2026-10-23T00:00:00.000Z');
    expect(sql.execute('PRAGMA user_version')).toEqual([{user_version: 2}]);
    expect(existingRows()).toEqual({
      ...before,
      reminder_jobs: before.reminder_jobs!.map(row => ({
        ...row,
        ringing_deadline: null,
        notified_at: null,
      })),
    });
    expect(sql.execute('SELECT * FROM native_delivery_settings')).toEqual([
      {id: 1, enabled: 0, full_screen: 0},
    ]);
    expect(sql.execute('SELECT * FROM native_alarm_registrations')).toEqual([]);
    expect(sql.execute('SELECT * FROM native_alarm_events')).toEqual([]);
    sql.execute('UPDATE native_delivery_settings SET enabled=1,full_screen=1');
    const migrated = existingRows();
    initializePlannerDatabase(sql, '2026-11-01T00:00:00.000Z');
    expect(existingRows()).toEqual(migrated);
    expect(sql.execute('SELECT * FROM native_delivery_settings')).toEqual([
      {id: 1, enabled: 1, full_screen: 1},
    ]);
  });

  it.each([now, null])(
    'ends an old paired simulated ring using its historical outcome or migration time (%s)',
    historical => {
      seedVersionOne();
      sql.execute(
        "UPDATE reminders SET status='RINGING',last_outcome_at=? WHERE id='reminder-1'",
        [historical],
      );
      sql.execute("UPDATE reminder_jobs SET status='RINGING' WHERE id='job-1'");
      const oldAcknowledged = sql.execute(
        "SELECT * FROM reminders WHERE id='event-reminder'",
      );
      const oldReceipts = sql.execute('SELECT * FROM operation_receipts');
      const migrationAt = '2026-10-23T00:00:00.000Z';
      initializePlannerDatabase(sql, migrationAt);
      expect(
        sql.execute(
          "SELECT status,version,last_outcome_at FROM reminders WHERE id='reminder-1'",
        ),
      ).toEqual([
        {
          status: 'MISSED',
          version: 9,
          last_outcome_at: historical ?? migrationAt,
        },
      ]);
      expect(
        sql.execute(
          "SELECT status,generation,attempt_count,delivery_state,delivery_reason,ringing_deadline,notified_at FROM reminder_jobs WHERE id='job-1'",
        ),
      ).toEqual([
        {
          status: 'MISSED',
          generation: 7,
          attempt_count: 2,
          delivery_state: 'UNAVAILABLE',
          delivery_reason: 'LEGACY_SIMULATION_ENDED',
          ringing_deadline: null,
          notified_at: null,
        },
      ]);
      expect(
        sql.execute("SELECT * FROM reminders WHERE id='event-reminder'"),
      ).toEqual(oldAcknowledged);
      expect(sql.execute('SELECT * FROM operation_receipts')).toEqual(
        oldReceipts,
      );
      expect(sql.execute('SELECT status FROM tasks')).toEqual([
        {status: 'TODO'},
      ]);
      initializePlannerDatabase(sql, '2026-10-24T00:00:00.000Z');
      expect(
        sql.execute(
          "SELECT version,last_outcome_at FROM reminders WHERE id='reminder-1'",
        ),
      ).toEqual([{version: 9, last_outcome_at: historical ?? migrationAt}]);
    },
  );

  it.each([
    'ALTER TABLE reminder_jobs ADD COLUMN notified_at',
    'CREATE TABLE native_alarm_registrations',
    'UPDATE reminders SET status',
    'PRAGMA user_version = 2',
    'COMMIT',
  ])(
    'rolls back a schema 1→2 failure before %s and permits a complete retry',
    failure => {
      seedVersionOne();
      sql.execute(
        "UPDATE reminders SET status='RINGING' WHERE id='reminder-1'",
      );
      sql.execute("UPDATE reminder_jobs SET status='RINGING' WHERE id='job-1'");
      const before = existingRows();
      let injected = false;
      const failing: LocalSqlConnection = {
        execute(statement, params) {
          if (!injected && statement.startsWith(failure)) {
            injected = true;
            throw new Error('Injected native migration failure');
          }
          return sql.execute(statement, params);
        },
      };
      expect(() => initializePlannerDatabase(failing, now)).toThrow(
        'Injected native migration failure',
      );
      expect(injected).toBe(true);
      expect(sql.execute('PRAGMA user_version')).toEqual([{user_version: 1}]);
      expect(existingRows()).toEqual(before);
      expect(
        sql
          .execute('PRAGMA table_info(reminder_jobs)')
          .map(column => column.name),
      ).not.toContain('ringing_deadline');
      expect(
        sql.execute(
          "SELECT name FROM sqlite_master WHERE name LIKE 'native_%'",
        ),
      ).toEqual([]);
      initializePlannerDatabase(sql, now);
      expect(sql.execute('PRAGMA user_version')).toEqual([{user_version: 2}]);
      expect(sql.execute('PRAGMA integrity_check')).toEqual([
        {integrity_check: 'ok'},
      ]);
    },
  );

  it('rolls back both fresh migration steps if schema 2 setup fails', () => {
    const payload = seedSettings();
    const failing: LocalSqlConnection = {
      execute(statement, params) {
        if (statement.startsWith('CREATE TABLE native_alarm_events')) {
          throw new Error('Injected fresh native migration failure');
        }
        return sql.execute(statement, params);
      },
    };
    expect(() => initializePlannerDatabase(failing, now)).toThrow(
      'Injected fresh native migration failure',
    );
    expect(sql.execute('PRAGMA user_version')).toEqual([{user_version: 0}]);
    expect(
      sql.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      ),
    ).toEqual([{name: 'app_settings'}]);
    expect(sql.execute('SELECT payload FROM app_settings')).toEqual([
      {payload},
    ]);
    initializePlannerDatabase(sql, now);
    expect(sql.execute('PRAGMA user_version')).toEqual([{user_version: 2}]);
  });

  it('keeps derived registration identities after source removal and constrains delivery settings', () => {
    initializePlannerDatabase(sql, now);
    seedTask();
    seedReminder();
    seedJob();
    sql.execute(
      'INSERT INTO native_alarm_registrations VALUES (?, ?, ?, ?, ?, ?)',
      ['job-1', 1, now, now, 'EXACT', now],
    );
    sql.execute(
      'INSERT INTO native_alarm_events (job_id,generation,event,at_utc,planned_at,detail) VALUES (?, ?, ?, ?, ?, ?)',
      ['job-1', 1, 'REGISTERED', now, now, null],
    );
    sql.execute('DELETE FROM tasks');
    expect(sql.execute('SELECT id FROM reminder_jobs')).toEqual([]);
    expect(
      sql.execute('SELECT job_id FROM native_alarm_registrations'),
    ).toEqual([{job_id: 'job-1'}]);
    expect(sql.execute('SELECT event FROM native_alarm_events')).toEqual([
      {event: 'REGISTERED'},
    ]);
    expect(() =>
      sql.execute('UPDATE native_delivery_settings SET enabled=2'),
    ).toThrow();
    expect(() =>
      sql.execute('UPDATE native_delivery_settings SET full_screen=-1'),
    ).toThrow();
    expect(() =>
      sql.execute('INSERT INTO native_delivery_settings VALUES (2,0,0)'),
    ).toThrow();
    expect(() =>
      sql.execute("UPDATE native_alarm_registrations SET precision='UNKNOWN'"),
    ).toThrow();
    expect(sql.execute('PRAGMA foreign_key_check')).toEqual([]);
  });

  it.each([
    'CREATE TABLE reminders',
    'INSERT INTO local_profile',
    'PRAGMA user_version = 1',
    'COMMIT',
  ])(
    'rolls back all DDL/data/version on an injected failure before %s',
    failure => {
      const payload = seedSettings();
      let injected = false;
      const failing: LocalSqlConnection = {
        execute(statement, params) {
          if (!injected && statement.startsWith(failure)) {
            injected = true;
            throw new Error('Injected migration write failure');
          }
          return sql.execute(statement, params);
        },
      };
      expect(() => initializePlannerDatabase(failing, now)).toThrow(
        'Injected migration write failure',
      );
      expect(injected).toBe(true);
      expect(sql.execute('PRAGMA user_version')).toEqual([{user_version: 0}]);
      expect(sql.execute('SELECT payload FROM app_settings')).toEqual([
        {payload},
      ]);
      expect(
        sql.execute(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        ),
      ).toEqual([{name: 'app_settings'}]);
      initializePlannerDatabase(sql, now);
      expect(sql.execute('PRAGMA user_version')).toEqual([{user_version: 2}]);
    },
  );

  it('refuses a future schema without rewriting its data or version', () => {
    const payload = seedSettings();
    sql.execute('PRAGMA user_version = 3');
    expect(() => initializePlannerDatabase(sql, now)).toThrow('newer');
    expect(sql.execute('PRAGMA user_version')).toEqual([{user_version: 3}]);
    expect(sql.execute('SELECT payload FROM app_settings')).toEqual([
      {payload},
    ]);
    expect(
      sql.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      ),
    ).toEqual([{name: 'app_settings'}]);
  });

  it('rejects invalid migration clocks before creating tables', () => {
    expect(() => initializePlannerDatabase(sql, 'invalid')).toThrow(
      'timestamp',
    );
    expect(
      sql.execute("SELECT name FROM sqlite_master WHERE type = 'table'"),
    ).toEqual([]);
  });

  it('enforces source FKs and cascades source removal through reminder and job', () => {
    initializePlannerDatabase(sql, now);
    expect(() => seedReminder()).toThrow();
    seedTask();
    seedEvent();
    seedReminder();
    seedJob();
    seedReminder('event-reminder', null, 'event-1');
    seedJob('event-job', 'event-reminder');
    expect(() => seedJob('orphan', 'missing')).toThrow();
    sql.execute('DELETE FROM tasks WHERE id = ?', ['task-1']);
    expect(sql.execute('SELECT id FROM reminders')).toEqual([
      {id: 'event-reminder'},
    ]);
    expect(sql.execute('SELECT id FROM reminder_jobs')).toEqual([
      {id: 'event-job'},
    ]);
    sql.execute('DELETE FROM events WHERE id = ?', ['event-1']);
    expect(sql.execute('SELECT id FROM reminders')).toEqual([]);
    expect(sql.execute('SELECT id FROM reminder_jobs')).toEqual([]);
  });

  it('enforces exactly one source, occurrence uniqueness and one job per reminder', () => {
    initializePlannerDatabase(sql, now);
    seedTask();
    seedEvent();
    expect(() => seedReminder('none', null, null)).toThrow();
    expect(() => seedReminder('both', 'task-1', 'event-1')).toThrow();
    seedReminder();
    expect(() => seedReminder('duplicate')).toThrow();
    seedReminder('event-reminder', null, 'event-1');
    expect(() => seedReminder('event-duplicate', null, 'event-1')).toThrow();
    seedJob();
    expect(() => seedJob('duplicate-job')).toThrow();
    expect(sql.execute('SELECT delivery_state FROM reminder_jobs')).toEqual([
      {delivery_state: 'UNAVAILABLE'},
    ]);
  });

  it('enforces persisted status, counter, due-time and ordering constraints', () => {
    initializePlannerDatabase(sql, now);
    seedTask();
    seedEvent();
    seedReminder();
    seedJob();
    const invalidWrites = [
      "UPDATE tasks SET status = 'ACKNOWLEDGED'",
      'UPDATE tasks SET version = 0',
      'UPDATE tasks SET version = 1.5',
      "UPDATE tasks SET title = '   '",
      "UPDATE tasks SET due_at = '2026-10-23T08:00:00.000Z', due_date = '2026-10-23'",
      "UPDATE events SET status = 'TODO'",
      'UPDATE events SET end_at = start_at',
      "UPDATE reminders SET status = 'COMPLETED'",
      'UPDATE reminders SET lead_minutes = -1',
      'UPDATE reminders SET lead_minutes = 0.5',
      "UPDATE reminder_jobs SET status = 'SNOOZED'",
      'UPDATE reminder_jobs SET generation = -1',
      'UPDATE reminder_jobs SET attempt_count = -1',
      "UPDATE reminder_jobs SET delivery_state = 'SUCCESS'",
    ];
    for (const statement of invalidWrites) {
      expect(() => sql.execute(statement)).toThrow();
    }
    expect(() =>
      sql.execute('INSERT INTO chat_messages VALUES (?, ?, ?, ?, ?)', [
        'chat-1',
        now,
        'system',
        'Not an accepted persisted role',
        null,
      ]),
    ).toThrow();
  });

  it('commits synchronous results, rolls back thrown mutations and remains reusable', () => {
    initializePlannerDatabase(sql, now);
    expect(
      inTransaction(sql, () => {
        seedTask();
        return 42;
      }),
    ).toBe(42);
    expect(() =>
      inTransaction(sql, () => {
        seedTask('rolled-back');
        throw new Error('Simulated process failure');
      }),
    ).toThrow('Simulated process failure');
    expect(sql.execute('SELECT id FROM tasks')).toEqual([{id: 'task-1'}]);
    inTransaction(sql, () => seedTask('retry'));
    expect(sql.execute('SELECT COUNT(*) AS count FROM tasks')).toEqual([
      {count: 2},
    ]);
  });

  it('quarantines a failed rollback before any retry or one-statement preference write can reach SQLite', async () => {
    initializePlannerDatabase(sql, now);
    const reachedSql: string[] = [];
    const guarded: LocalSqlConnection = {
      execute(statement, params) {
        // Match the production shared-connection boundary, including preferences.
        assertDatabaseUsable(guarded);
        reachedSql.push(statement);
        if (statement === 'ROLLBACK') {
          throw new Error('Injected rollback I/O failure');
        }
        return sql.execute(statement, params);
      },
    };
    const preferences = createPreferencesRepository(guarded);
    let callbackRuns = 0;
    const command = () =>
      inTransaction(guarded, () => {
        callbackRuns++;
        guarded.execute(
          'INSERT INTO app_settings (id, payload) VALUES (1, ?)',
          ['uncommitted snapshot'],
        );
        throw new Error('Injected original mutation failure');
      });
    expect(command).toThrow('rollback failed');
    // The native transaction really remains active; only its unsafe owner is blocked.
    expect(sql.execute('SELECT payload FROM app_settings')).toEqual([
      {payload: 'uncommitted snapshot'},
    ]);
    const callsAfterFailure = reachedSql.length;
    try {
      expect(() => assertDatabaseUsable(guarded)).toThrow('Restart the app');
      expect(command).toThrow('Restart the app');
      await expect(
        preferences.save(defaultPreferences('Asia/Manila')),
      ).rejects.toThrow('Restart the app');
      expect(reachedSql).toHaveLength(callsAfterFailure);
      expect(callbackRuns).toBe(1);
    } finally {
      // Test cleanup bypasses the deliberately failed wrapper only, never production.
      sql.execute('ROLLBACK');
    }
    expect(sql.execute('SELECT payload FROM app_settings')).toEqual([]);
    // Even after external cleanup this owner stays quarantined: no silent reuse.
    expect(command).toThrow('Restart the app');
    const freshNative = new DatabaseSync(':memory:');
    try {
      const fresh = connect(freshNative);
      initializePlannerDatabase(fresh, now);
      expect(() => assertDatabaseUsable(fresh)).not.toThrow();
      expect(inTransaction(fresh, () => 'new connection works')).toBe(
        'new connection works',
      );
    } finally {
      freshNative.close();
    }
  });

  it('refuses async callbacks, rolls back returned promises and refuses nesting', () => {
    initializePlannerDatabase(sql, now);
    expect(() =>
      inTransaction(sql, async () => {
        seedTask('async-task');
      }),
    ).toThrow('synchronous');
    expect(() =>
      inTransaction(sql, () => {
        seedTask('promise-task');
        return Promise.resolve('later');
      }),
    ).toThrow('synchronous');
    expect(() =>
      inTransaction(sql, () => {
        seedTask('outer-task');
        return inTransaction(sql, () => seedTask('nested-task'));
      }),
    ).toThrow('Nested');
    expect(sql.execute('SELECT id FROM tasks')).toEqual([]);
    expect(inTransaction(sql, () => 'connection reusable')).toBe(
      'connection reusable',
    );
  });
});
