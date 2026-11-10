/**
 * A real SQLite file behind the same `executeSync` shape as op-sqlite, so storage
 * tests see genuine journaling, rollback and reopen behavior. Files live in a
 * directory the caller owns and removes; no student database is ever involved.
 */
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

interface NodeSqliteStatement {
  all: (...params: unknown[]) => Array<Record<string, unknown>>;
  run: (...params: unknown[]) => {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
}

interface NodeSqliteDatabase {
  prepare: (query: string) => NodeSqliteStatement;
  exec: (sql: string) => void;
  close: () => void;
}

interface NodeSqliteModule {
  DatabaseSync: new (path: string) => NodeSqliteDatabase;
}

export interface SqliteTestConnection {
  executeSync: (
    query: string,
    params?: unknown[],
  ) => {
    rows: Array<Record<string, unknown>>;
    rowsAffected: number;
    insertId?: number;
  };
  close: () => void;
  exec: (sql: string) => void;
  /** Every statement sent through `executeSync`, in order. */
  statements: string[];
  /** Throws from `executeSync` for matching statements, to inject failures. */
  failWhen: ((query: string, index: number) => boolean) | null;
}

const sqliteModule = (): NodeSqliteModule => {
  const builtin = (
    process as unknown as {
      getBuiltinModule?: (name: string) => unknown;
    }
  ).getBuiltinModule?.('node:sqlite');
  if (!builtin) throw new Error('node:sqlite is unavailable in this Node.');
  return builtin as NodeSqliteModule;
};

const openConnections = new Set<SqliteTestConnection>();

export const openSqliteFile = (path: string): SqliteTestConnection => {
  const database = new (sqliteModule().DatabaseSync)(path);
  let isClosed = false;
  const connection: SqliteTestConnection = {
    statements: [],
    failWhen: null,
    exec: sql => database.exec(sql),
    close: () => {
      if (isClosed) return;
      isClosed = true;
      openConnections.delete(connection);
      database.close();
    },
    executeSync: (query, params = []) => {
      const index = connection.statements.length;
      connection.statements.push(query);
      if (connection.failWhen?.(query, index)) {
        throw new Error('injected storage failure');
      }
      const statement = database.prepare(query);
      const normalized = query.trim().toUpperCase();
      const returnsRows =
        normalized.startsWith('SELECT') ||
        (normalized.startsWith('PRAGMA') && !query.includes('='));
      if (returnsRows) {
        return {rows: statement.all(...params), rowsAffected: 0};
      }
      const result = statement.run(...params);
      return {
        rows: [],
        rowsAffected: Number(result.changes),
        insertId: Number(result.lastInsertRowid),
      };
    },
  };
  openConnections.add(connection);
  return connection;
};

export interface OwnedTempDirectory {
  path: string;
  file: (name: string) => string;
  remove: () => void;
}

/** A uniquely named directory this test owns and removes. */
export const createOwnedTempDirectory = (): OwnedTempDirectory => {
  const path = mkdtempSync(join(tmpdir(), 'agy-storage-test-'));
  return {
    path,
    file: name => join(path, name),
    remove: () => {
      // An open handle blocks deletion on Windows.
      [...openConnections].forEach(connection => connection.close());
      rmSync(path, {recursive: true, force: true});
    },
  };
};
