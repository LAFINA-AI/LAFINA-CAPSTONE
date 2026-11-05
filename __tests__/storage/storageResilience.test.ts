/**
 * AGY-PORT 01: production storage failures must be honest. These run against real
 * SQLite files where behavior depends on the engine, and scripted connections only
 * to reach failures SQLite will not produce on demand (a failing ROLLBACK).
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {
  DatabaseService,
  StorageUnavailableError,
} from '../../src/storage/database';
import type {DatabaseTransaction} from '../../src/storage/database';
import {CURRENT_SCHEMA_VERSION, initDatabase} from '../../src/storage/dbInit';
import {createOwnedTempDirectory, openSqliteFile} from '../fixtures/sqliteFile';
import type {
  OwnedTempDirectory,
  SqliteTestConnection,
} from '../fixtures/sqliteFile';

const failingOpen = () => {
  throw new Error('native library not linked');
};

describe('DatabaseService failure handling', () => {
  let directory: OwnedTempDirectory;
  let connection: SqliteTestConnection;
  let database: DatabaseService;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    directory = createOwnedTempDirectory();
    connection = openSqliteFile(directory.file('t.db'));
    connection.exec('CREATE TABLE items (id TEXT PRIMARY KEY);');
    database = new DatabaseService(() => connection);
  });

  afterEach(() => {
    connection.close();
    directory.remove();
    jest.restoreAllMocks();
  });

  const count = (): number =>
    Number(connection.executeSync('SELECT COUNT(*) AS c FROM items').rows[0].c);

  describe('native open failure', () => {
    test('is reported as unavailable, never as a working database', () => {
      const broken = new DatabaseService(failingOpen);
      expect(broken.isFallback()).toBe(false);
      expect(broken.getHealth()).toMatchObject({
        status: 'unavailable',
        durable: false,
        reason: 'open_failed',
      });
      expect(() => broken.executeSync('SELECT 1')).toThrow(
        StorageUnavailableError,
      );
    });

    test('rejects writes without running the callback or after-commit work', () => {
      const broken = new DatabaseService(failingOpen);
      const body = jest.fn();
      const afterCommit = jest.fn();
      expect(() =>
        broken.transactionSync(tx => {
          body();
          tx.afterCommit?.(afterCommit);
        }),
      ).toThrow(StorageUnavailableError);
      expect(body).not.toHaveBeenCalled();
      expect(afterCommit).not.toHaveBeenCalled();
    });

    test('initDatabase rejects and keeps the unavailable state', async () => {
      const broken = new DatabaseService(failingOpen);
      await expect(initDatabase(broken)).rejects.toBeInstanceOf(
        StorageUnavailableError,
      );
      expect(broken.getHealth().status).toBe('unavailable');
    });

    test('reopen recovers once the connection can open', () => {
      let attempts = 0;
      const flaky = new DatabaseService(() => {
        attempts += 1;
        if (attempts === 1) throw new Error('not yet');
        return connection;
      });
      expect(flaky.getHealth().status).toBe('unavailable');
      expect(flaky.reopen().status).toBe('ready');
      expect(flaky.executeSync('SELECT 1 AS one').rows).toEqual([{one: 1}]);
    });
  });

  describe('test-only volatile adapter', () => {
    test('is refused outside the test environment', () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        expect(() => database.setFallbackForTesting(true)).toThrow(/test/i);
        expect(database.isFallback()).toBe(false);
      } finally {
        process.env.NODE_ENV = previous;
      }
    });

    test('is explicit: temporary, not durable, and after-commit still runs', () => {
      database.setFallbackForTesting(true);
      expect(database.isFallback()).toBe(true);
      expect(database.getHealth()).toMatchObject({
        status: 'temporary',
        durable: false,
      });
      const afterCommit = jest.fn();
      database.transactionSync(tx => {
        tx.afterCommit?.(afterCommit);
        expect(
          tx.executeSync('INSERT INTO items VALUES (?)', ['x']).rows,
        ).toEqual([]);
      });
      expect(afterCommit).toHaveBeenCalledTimes(1);
      database.setFallbackForTesting(false);
      expect(database.getHealth().status).toBe('ready');
      expect(count()).toBe(0);
    });
  });

  describe('rollback failure quarantine', () => {
    const scriptedRollbackFailure = (message: string) => {
      const realExecute = connection.executeSync;
      connection.executeSync = (query, params) => {
        if (query === 'ROLLBACK') throw new Error(message);
        return realExecute(query, params);
      };
    };

    test('blocks reads and writes on the unsafe connection', () => {
      scriptedRollbackFailure('disk I/O error');
      expect(() =>
        database.transactionSync(() => {
          throw new Error('original failure');
        }),
      ).toThrow('original failure');
      expect(database.getHealth()).toMatchObject({
        status: 'quarantined',
        durable: false,
        reason: 'rollback_failed',
      });
      expect(() => database.executeSync('SELECT 1')).toThrow(
        StorageUnavailableError,
      );
      expect(() => database.transactionSync(() => undefined)).toThrow(
        StorageUnavailableError,
      );
    });

    test('SQLite auto-rollback is not treated as an unsafe connection', () => {
      scriptedRollbackFailure('cannot rollback - no transaction is active');
      expect(() =>
        database.transactionSync(() => {
          throw new Error('original failure');
        }),
      ).toThrow('original failure');
      expect(database.getHealth().status).toBe('ready');
    });

    test('reopen closes the unsafe connection and starts clean', () => {
      const first = openSqliteFile(directory.file('q.db'));
      first.exec('CREATE TABLE items (id TEXT PRIMARY KEY);');
      const realExecute = first.executeSync;
      first.executeSync = (query, params) => {
        if (query === 'ROLLBACK') throw new Error('disk I/O error');
        return realExecute(query, params);
      };
      const closeSpy = jest.spyOn(first, 'close');
      const connections = [first, openSqliteFile(directory.file('q.db'))];
      const service = new DatabaseService(() => connections.shift()!);
      expect(() =>
        service.transactionSync(tx => {
          tx.executeSync('INSERT INTO items VALUES (?)', ['lost']);
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(service.getHealth().status).toBe('quarantined');
      expect(service.reopen().status).toBe('ready');
      expect(closeSpy).toHaveBeenCalled();
      expect(service.executeSync('SELECT * FROM items').rows).toEqual([]);
    });
  });

  describe('transaction lifetime', () => {
    test('an exception rolls back every statement', () => {
      expect(() =>
        database.transactionSync(tx => {
          tx.executeSync('INSERT INTO items VALUES (?)', ['a']);
          throw new Error('stop');
        }),
      ).toThrow('stop');
      expect(count()).toBe(0);
      expect(database.getHealth().status).toBe('ready');
    });

    test('a handle cannot be used after commit or after rollback', () => {
      let saved: DatabaseTransaction | undefined;
      database.transactionSync(tx => {
        saved = tx;
      });
      expect(() =>
        saved?.executeSync('INSERT INTO items VALUES (?)', ['late']),
      ).toThrow(/no longer active/);
      expect(() => saved?.afterCommit?.(() => undefined)).toThrow(
        /no longer active/,
      );
      expect(() =>
        database.transactionSync(tx => {
          saved = tx;
          throw new Error('stop');
        }),
      ).toThrow('stop');
      expect(() =>
        saved?.executeSync('INSERT INTO items VALUES (?)', ['late']),
      ).toThrow(/no longer active/);
      expect(count()).toBe(0);
    });

    test('async callbacks are refused and leave nothing behind', () => {
      expect(() =>
        database.transactionSync(async tx => {
          tx.executeSync('INSERT INTO items VALUES (?)', ['a']);
        }),
      ).toThrow(/synchronous/);
      expect(count()).toBe(0);
      expect(database.getHealth().status).toBe('ready');
    });

    test('a callback returning a promise rolls back', async () => {
      let rejected: Promise<void> | undefined;
      expect(() =>
        database.transactionSync(tx => {
          tx.executeSync('INSERT INTO items VALUES (?)', ['a']);
          rejected = Promise.reject(new Error('late rejection'));
          return rejected;
        }),
      ).toThrow(/synchronous/);
      expect(count()).toBe(0);
      await expect(rejected).rejects.toThrow('late rejection');
    });

    test('nesting is refused and the outer work rolls back', () => {
      expect(() =>
        database.transactionSync(tx => {
          tx.executeSync('INSERT INTO items VALUES (?)', ['outer']);
          database.transactionSync(() => undefined);
        }),
      ).toThrow(/Nested/);
      expect(count()).toBe(0);
    });

    test('a failed BEGIN does not run the body or quarantine', () => {
      connection.failWhen = query => query.startsWith('BEGIN');
      const body = jest.fn();
      expect(() => database.transactionSync(body)).toThrow(/injected/);
      expect(body).not.toHaveBeenCalled();
      expect(database.getHealth().status).toBe('ready');
    });

    test('a failed COMMIT rolls back and skips after-commit work', () => {
      connection.failWhen = query => query === 'COMMIT';
      const afterCommit = jest.fn();
      expect(() =>
        database.transactionSync(tx => {
          tx.executeSync('INSERT INTO items VALUES (?)', ['a']);
          tx.afterCommit?.(afterCommit);
        }),
      ).toThrow(/injected/);
      connection.failWhen = null;
      expect(afterCommit).not.toHaveBeenCalled();
      expect(count()).toBe(0);
      expect(database.getHealth().status).toBe('ready');
    });
  });

  describe('after-commit work', () => {
    test('runs only after commit, in order', () => {
      const seen: string[] = [];
      const result = database.transactionSync(tx => {
        tx.afterCommit?.(() => seen.push(`one:${count()}`));
        tx.afterCommit?.(() => seen.push(`two:${count()}`));
        tx.executeSync('INSERT INTO items VALUES (?)', ['a']);
        seen.push('body');
        return 'done';
      });
      expect(result).toBe('done');
      expect(seen).toEqual(['body', 'one:1', 'two:1']);
    });

    test('never runs after a rollback', () => {
      const afterCommit = jest.fn();
      expect(() =>
        database.transactionSync(tx => {
          tx.afterCommit?.(afterCommit);
          throw new Error('stop');
        }),
      ).toThrow('stop');
      expect(afterCommit).not.toHaveBeenCalled();
    });

    test('a native registration failure does not pretend the save rolled back', () => {
      const later = jest.fn();
      const result = database.transactionSync(tx => {
        tx.executeSync('INSERT INTO items VALUES (?)', ['durable']);
        tx.afterCommit?.(() => {
          throw new Error('alarm registration failed');
        });
        tx.afterCommit?.(later);
        return 'saved';
      });
      expect(result).toBe('saved');
      expect(count()).toBe(1);
      expect(later).toHaveBeenCalledTimes(1);
      expect(database.getHealth().status).toBe('ready');
    });

    test('after-commit work can start a new transaction', () => {
      database.transactionSync(tx => {
        tx.afterCommit?.(() => {
          database.transactionSync(next => {
            next.executeSync('INSERT INTO items VALUES (?)', ['second']);
          });
        });
      });
      expect(count()).toBe(1);
    });
  });

  describe('diagnostics', () => {
    test('SQL errors never log bound values', () => {
      const errorSpy = jest.spyOn(console, 'error');
      expect(() =>
        database.executeSync('INSERT INTO missing_table VALUES (?)', [
          'secret-password-value',
        ]),
      ).toThrow();
      const logged = JSON.stringify(errorSpy.mock.calls.map(c => String(c)));
      expect(errorSpy).toHaveBeenCalled();
      expect(logged).not.toContain('secret-password-value');
    });

    test('health listeners hear transitions and can unsubscribe', () => {
      const seen: string[] = [];
      const unsubscribe = database.subscribeHealth(h => seen.push(h.status));
      database.requireRecovery('integrity_failed');
      expect(seen).toEqual(['unavailable']);
      database.reopen();
      expect(seen).toEqual(['unavailable', 'ready']);
      unsubscribe();
      database.requireRecovery('integrity_failed');
      expect(seen).toHaveLength(2);
    });
  });

  describe('unreadable and refused files are never rewritten', () => {
    const garbage = Buffer.from(
      'this is not a sqlite database file'.repeat(64),
    );

    test('a corrupt file is left byte-for-byte untouched', async () => {
      const path = directory.file('corrupt.db');
      writeFileSync(path, garbage);
      const file = openSqliteFile(path);
      const service = new DatabaseService(() => file);
      await expect(initDatabase(service)).rejects.toBeInstanceOf(
        StorageUnavailableError,
      );
      file.close();
      expect(service.getHealth().durable).toBe(false);
      expect(readFileSync(path).equals(garbage)).toBe(true);
    });

    test('a newer schema is refused before any write', async () => {
      const path = directory.file('future.db');
      const seed = openSqliteFile(path);
      seed.exec('CREATE TABLE users (id TEXT PRIMARY KEY);');
      seed.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1};`);
      seed.close();
      const before = readFileSync(path);

      const file = openSqliteFile(path);
      const service = new DatabaseService(() => file);
      await expect(initDatabase(service)).rejects.toBeInstanceOf(
        StorageUnavailableError,
      );
      expect(service.getHealth()).toMatchObject({
        status: 'unavailable',
        reason: 'future_schema',
      });
      expect(
        file.statements.filter(s =>
          /^\s*(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|BEGIN)/i.test(s),
        ),
      ).toEqual([]);
      expect(file.statements.join('\n')).not.toMatch(/journal_mode\s*=/);
      file.close();
      expect(readFileSync(path).equals(before)).toBe(true);
    });

    test('a malformed version is refused before any write', async () => {
      const path = directory.file('negative.db');
      const seed = openSqliteFile(path);
      seed.exec('CREATE TABLE users (id TEXT PRIMARY KEY);');
      seed.exec('PRAGMA user_version = -3;');
      seed.close();
      const before = readFileSync(path);

      const file = openSqliteFile(path);
      const service = new DatabaseService(() => file);
      await expect(initDatabase(service)).rejects.toBeInstanceOf(
        StorageUnavailableError,
      );
      expect(service.getHealth().reason).toBe('malformed_version');
      file.close();
      expect(readFileSync(path).equals(before)).toBe(true);
    });

    test('a failed integrity verdict stops before the schema is touched', async () => {
      const statements: string[] = [];
      const scripted = {
        close: () => undefined,
        executeSync: (query: string) => {
          statements.push(query);
          if (query.includes('quick_check')) {
            return {
              rows: [{quick_check: 'database disk image is malformed'}],
            };
          }
          if (query === 'PRAGMA user_version') {
            return {rows: [{user_version: 17}]};
          }
          return {rows: []};
        },
      };
      const service = new DatabaseService(() => scripted);
      await expect(initDatabase(service)).rejects.toBeInstanceOf(
        StorageUnavailableError,
      );
      expect(service.getHealth().reason).toBe('integrity_failed');
      expect(statements.some(s => /CREATE TABLE|BEGIN/.test(s))).toBe(false);
    });
  });
});
