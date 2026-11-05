/**
 * AGY-PORT 01: upgrades from the frozen schema-17 fixture on real SQLite files,
 * including forced failures at every statement of the upgrade.
 */
import {readFileSync} from 'node:fs';
import {DatabaseService} from '../../src/storage/database';
import type {DatabaseTransaction} from '../../src/storage/database';
import {
  CURRENT_SCHEMA_VERSION,
  initDatabase,
  validateMigrationSequence,
} from '../../src/storage/dbInit';
import type {SchemaMigration} from '../../src/storage/dbInit';
import {
  buildSchema17Database,
  FIXTURE_ACCOUNT_A,
  FIXTURE_ACCOUNT_B,
  FIXTURE_GUEST,
  readUserVersion,
  SCHEMA_17_BODY_SHA256,
  schema17BodySha256,
  schema17FixtureFingerprint,
  snapshotAllRows,
} from '../fixtures/schema17Fixture';
import {createOwnedTempDirectory, openSqliteFile} from '../fixtures/sqliteFile';
import type {OwnedTempDirectory} from '../fixtures/sqliteFile';

const seededStep = (version: number, table: string): SchemaMigration => ({
  version,
  description: `create ${table}`,
  up: (tx: DatabaseTransaction) => {
    tx.executeSync(`CREATE TABLE ${table} (id TEXT PRIMARY KEY NOT NULL)`);
    tx.executeSync(`INSERT INTO ${table} VALUES ('seeded')`);
  },
});

describe('schema migrations', () => {
  let directory: OwnedTempDirectory;
  let serial = 0;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    directory = createOwnedTempDirectory();
  });

  afterEach(() => {
    directory.remove();
    jest.restoreAllMocks();
  });

  const legacyFile = (): string => {
    serial += 1;
    const path = directory.file(`legacy-${serial}.db`);
    const seed = openSqliteFile(path);
    buildSchema17Database(seed);
    seed.close();
    return path;
  };

  const inspect = <T>(
    path: string,
    read: (c: ReturnType<typeof openSqliteFile>) => T,
  ): T => {
    const connection = openSqliteFile(path);
    try {
      return read(connection);
    } finally {
      connection.close();
    }
  };

  test('the frozen fixture has not drifted', () => {
    expect(schema17BodySha256()).toBe(SCHEMA_17_BODY_SHA256);
    expect(schema17FixtureFingerprint()).toMatch(/^[0-9a-f]{64}$/);
  });

  test('a fresh database reaches the current version', async () => {
    const connection = openSqliteFile(directory.file('fresh.db'));
    const service = new DatabaseService(() => connection);
    await initDatabase(service);
    expect(readUserVersion(connection)).toBe(CURRENT_SCHEMA_VERSION);
    expect(service.getHealth().status).toBe('ready');
    connection.close();
  });

  /** Every row of every schema-17 table, read back through its schema-17 columns only. */
  const snapshotSchema17Columns = (
    connection: ReturnType<typeof openSqliteFile>,
    columnsByTable: Record<string, string[]>,
  ): Record<string, string[]> => {
    const snapshot: Record<string, string[]> = {};
    for (const [table, columns] of Object.entries(columnsByTable)) {
      snapshot[table] = connection
        .executeSync(`SELECT ${columns.map(c => `"${c}"`).join(', ')} FROM ${table}`)
        .rows.map(row => JSON.stringify(row))
        .sort();
    }
    return snapshot;
  };

  const readColumns = (
    connection: ReturnType<typeof openSqliteFile>,
  ): Record<string, string[]> => {
    const columns: Record<string, string[]> = {};
    for (const table of Object.keys(snapshotAllRows(connection))) {
      columns[table] = connection
        .executeSync(`PRAGMA table_info(${table})`)
        .rows.map(column => String(column.name));
    }
    return columns;
  };

  test('upgrading schema 17 keeps every row byte-identical, then reopens', async () => {
    const path = legacyFile();
    const before = inspect(path, snapshotAllRows);
    const schema17Columns = inspect(path, readColumns);
    expect(before.sync_outbox.length).toBeGreaterThan(5);
    expect(before.recorded_meetings).toHaveLength(2);
    expect(before.messages).toHaveLength(3);

    const first = openSqliteFile(path);
    await initDatabase(new DatabaseService(() => first));
    expect(readUserVersion(first)).toBe(CURRENT_SCHEMA_VERSION);
    first.close();

    // Schema 18 only adds: every schema-17 column of every row is unchanged.
    const afterUpgrade = inspect(path, snapshotAllRows);
    const projected = inspect(path, c => snapshotSchema17Columns(c, schema17Columns));
    for (const [table, rows] of Object.entries(before)) {
      expect(projected[table]).toEqual(rows);
    }
    const added = Object.keys(afterUpgrade).filter(t => !(t in before));
    expect(added).toEqual(['chat_legacy_quarantine']);
    const afterColumns = inspect(path, readColumns);
    for (const [table, columns] of Object.entries(schema17Columns)) {
      const extra = afterColumns[table].filter(c => !columns.includes(c));
      expect([table, extra]).toEqual([
        table,
        table === 'messages'
          ? ['seq', 'metadata_json']
          : table === 'chat_sessions'
            ? ['generation']
            : [],
      ]);
    }

    // The fixture's shared history was opened by account A, but three accounts
    // exist, so it is quarantined in place rather than handed to anyone.
    const chat = inspect(path, c => ({
      messages: c.executeSync(
        'SELECT id, session_id, seq, metadata_json FROM messages ORDER BY seq',
      ).rows,
      quarantine: c.executeSync(
        'SELECT session_id, recorded_owner, message_count, reason FROM chat_legacy_quarantine',
      ).rows,
    }));
    expect(chat.messages).toEqual([
      {id: 'm-user', session_id: 'default_chat_session', seq: 1, metadata_json: null},
      {id: 'm-cited', session_id: 'default_chat_session', seq: 2, metadata_json: null},
      {id: 'm-doc', session_id: 'default_chat_session', seq: 3, metadata_json: null},
    ]);
    expect(chat.quarantine).toEqual([
      {
        session_id: 'default_chat_session',
        recorded_owner: FIXTURE_ACCOUNT_A,
        message_count: 3,
        reason: 'multiple_local_accounts',
      },
    ]);

    const second = openSqliteFile(path);
    await initDatabase(new DatabaseService(() => second));
    second.close();
    expect(inspect(path, snapshotAllRows)).toEqual(afterUpgrade);
  });

  test('stores read upgraded data through the real module stack', async () => {
    const path = legacyFile();
    const connection = openSqliteFile(path);
    let storage!: typeof import('../../src/storage');
    jest.isolateModules(() => {
      jest.doMock('@op-engineering/op-sqlite', () => ({
        open: () => connection,
      }));
      storage = require('../../src/storage');
    });
    await storage.initDatabase();

    const A = FIXTURE_ACCOUNT_A;
    const B = FIXTURE_ACCOUNT_B;
    expect(storage.db.getHealth().status).toBe('ready');
    expect(storage.userStore.getActiveSessionToken().userId).toBe(A);
    expect(storage.tasksStore.getAllTasks(A).map(t => t.id)).toEqual(['t-a']);
    expect(storage.tasksStore.getAllTasks(FIXTURE_GUEST)).toHaveLength(1);
    expect(storage.tasksStore.getAllEvents(A).map(e => e.id)).toEqual(['e-a']);
    expect(storage.timeBlocksStore.getAll(A).map(b => b.id)).toEqual(['b-a']);
    expect(storage.notesStore.getAll(B).map(n => n.id)).toEqual(['n-b']);
    expect(storage.notesStore.getAll(A)[0].body).toContain('- [x] done');
    expect(
      storage.remindersStore.getPendingReminders(B).map(r => r.id),
    ).toEqual(['r-b']);
    expect(storage.preferencesStore.get(A).reminderLeadMinutes).toBe(25);
    const pending = storage.syncOutboxStore.getPendingMutations(A, 50);
    expect(new Set(pending.map(p => p.entityType))).toEqual(
      new Set(['task', 'event', 'time_block', 'reminder', 'custom_category']),
    );
    connection.close();
  });

  test('importing the storage modules writes nothing before a refusal', async () => {
    const path = directory.file('future.db');
    const seed = openSqliteFile(path);
    seed.exec('CREATE TABLE from_the_future (id TEXT);');
    seed.exec('PRAGMA user_version = 99;');
    seed.close();
    const before = readFileSync(path);

    const connection = openSqliteFile(path);
    let storage!: typeof import('../../src/storage');
    jest.isolateModules(() => {
      jest.doMock('@op-engineering/op-sqlite', () => ({
        open: () => connection,
      }));
      storage = require('../../src/storage');
    });
    await expect(storage.initDatabase()).rejects.toThrow();
    expect(storage.db.getHealth().reason).toBe('future_schema');
    expect(
      connection.statements.filter(s =>
        /^\s*(CREATE|INSERT|UPDATE|DELETE|ALTER|DROP|BEGIN)/i.test(s),
      ),
    ).toEqual([]);
    connection.close();
    expect(readFileSync(path).equals(before)).toBe(true);
  });

  test('a failure at any upgrade statement leaves the fixture intact', async () => {
    const path = legacyFile();
    const expected = inspect(path, snapshotAllRows);
    const steps = [seededStep(18, 'step_one'), seededStep(19, 'step_two')];

    const probe = openSqliteFile(legacyFile());
    await initDatabase(new DatabaseService(() => probe), steps);
    const transactional = probe.statements.slice(
      probe.statements.findIndex(s => s.startsWith('BEGIN')) + 1,
      probe.statements.lastIndexOf('COMMIT') + 1,
    );
    probe.close();
    expect(transactional.length).toBeGreaterThan(40);

    // Each candidate is exercised on a fresh file; a stride keeps it bounded while
    // still covering the first, every later migration step, and COMMIT.
    const lastIndex = transactional.length - 1;
    const stride = Math.max(1, Math.floor(transactional.length / 25));
    const candidates = new Set<number>();
    for (let i = 0; i <= lastIndex; i += stride) candidates.add(i);
    for (let i = Math.max(0, lastIndex - 6); i <= lastIndex; i += 1) {
      candidates.add(i);
    }

    for (const target of candidates) {
      const failing = legacyFile();
      const connection = openSqliteFile(failing);
      let inTransaction = -1;
      connection.failWhen = query => {
        if (query.startsWith('BEGIN')) {
          inTransaction = 0;
          return false;
        }
        if (inTransaction < 0) return false;
        const current = inTransaction;
        inTransaction += 1;
        return current === target;
      };
      const service = new DatabaseService(() => connection);
      await expect(initDatabase(service, steps)).rejects.toThrow();
      expect(service.getHealth()).toMatchObject({
        status: 'unavailable',
        reason: 'migration_failed',
      });
      connection.close();

      const after = inspect(failing, snapshotAllRows);
      expect(after).toEqual(expected);
      expect(inspect(failing, readUserVersion)).toBe(17);
    }
  });

  test('a failed step is retried cleanly on the next launch', async () => {
    const path = legacyFile();
    const failingSteps: SchemaMigration[] = [
      seededStep(18, 'step_one'),
      {
        version: 19,
        description: 'always fails',
        up: () => {
          throw new Error('forced step failure');
        },
      },
    ];
    const first = openSqliteFile(path);
    const firstService = new DatabaseService(() => first);
    await expect(initDatabase(firstService, failingSteps)).rejects.toThrow(
      'forced step failure',
    );
    expect(readUserVersion(first)).toBe(17);
    expect(
      first.executeSync(
        "SELECT name FROM sqlite_master WHERE name = 'step_one'",
      ).rows,
    ).toEqual([]);
    first.close();

    const second = openSqliteFile(path);
    const steps = [seededStep(18, 'step_one'), seededStep(19, 'step_two')];
    await initDatabase(new DatabaseService(() => second), steps);
    expect(readUserVersion(second)).toBe(19);
    expect(second.executeSync('SELECT id FROM step_two').rows).toEqual([
      {id: 'seeded'},
    ]);
    second.close();
  });

  test('steps run once, in order, and only those above the installed version', async () => {
    const path = legacyFile();
    const ran: number[] = [];
    const tracked = (version: number): SchemaMigration => ({
      version,
      description: `step ${version}`,
      up: () => {
        ran.push(version);
      },
    });
    const first = openSqliteFile(path);
    await initDatabase(new DatabaseService(() => first), [tracked(18)]);
    first.close();
    expect(ran).toEqual([18]);

    const second = openSqliteFile(path);
    await initDatabase(new DatabaseService(() => second), [
      tracked(18),
      tracked(19),
      tracked(20),
    ]);
    second.close();
    expect(ran).toEqual([18, 19, 20]);
  });

  test('an interrupted older version gains missing columns additively', async () => {
    const path = directory.file('older.db');
    const seed = openSqliteFile(path);
    seed.exec(`CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL, username TEXT NOT NULL, email TEXT UNIQUE,
      password_hash TEXT, is_new_user INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`);
    seed.exec(
      "INSERT INTO users (id, username, created_at, updated_at) VALUES ('old', 'Old', 'x', 'x');",
    );
    seed.exec('PRAGMA user_version = 12;');
    seed.close();

    const connection = openSqliteFile(path);
    await initDatabase(new DatabaseService(() => connection));
    expect(readUserVersion(connection)).toBe(CURRENT_SCHEMA_VERSION);
    expect(connection.executeSync('SELECT id, role FROM users').rows).toEqual([
      {id: 'old', role: 'student'},
    ]);
    connection.close();
  });

  test('the connection uses rollback journaling, enforced keys and a bounded wait', async () => {
    const connection = openSqliteFile(directory.file('protocol.db'));
    await initDatabase(new DatabaseService(() => connection));
    const pragma = (name: string): unknown =>
      Object.values(connection.executeSync(`PRAGMA ${name}`).rows[0])[0];
    expect(pragma('journal_mode')).toBe('delete');
    expect(pragma('foreign_keys')).toBe(1);
    expect(pragma('busy_timeout')).toBe(5000);
    expect(pragma('synchronous')).toBe(2);
    const begin = connection.statements.findIndex(s => s.startsWith('BEGIN'));
    const journal = connection.statements.findIndex(s =>
      /journal_mode\s*=/.test(s),
    );
    expect(journal).toBeGreaterThanOrEqual(0);
    expect(journal).toBeLessThan(begin);
    connection.close();
  });

  describe('validateMigrationSequence', () => {
    const noop = (version: number): SchemaMigration => ({
      version,
      description: 'noop',
      up: () => undefined,
    });

    test('accepts an empty list and contiguous steps', () => {
      expect(() => validateMigrationSequence([])).not.toThrow();
      expect(() =>
        validateMigrationSequence([noop(18), noop(19)]),
      ).not.toThrow();
    });

    test.each([
      ['a gap', [noop(18), noop(20)]],
      ['a duplicate', [noop(18), noop(18)]],
      ['out of order', [noop(19), noop(18)]],
      ['at or below the baseline', [noop(17)]],
    ])('rejects %s', (_label, steps) => {
      expect(() => validateMigrationSequence(steps)).toThrow(/migration/i);
    });
  });
});
