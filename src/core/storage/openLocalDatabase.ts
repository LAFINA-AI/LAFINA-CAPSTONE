import {open} from '@op-engineering/op-sqlite';
import {
  assertDatabaseUsable,
  initializePlannerDatabase,
} from './plannerDatabase';
import type {LocalSqlConnection} from './preferencesRepository';

let connection: LocalSqlConnection | undefined;
/** One lazy connection for both settings and planner; failed initialization never caches a fallback. */
export function openLocalDatabase(): LocalSqlConnection {
  if (connection) {
    return connection;
  }
  const native = open({name: 'lafina-capstone.sqlite'});
  const db: LocalSqlConnection = {
    execute: (sql, params) => {
      assertDatabaseUsable(db);
      return native.executeSync(sql, params).rows;
    },
  };
  try {
    // ADR-015: the isolated Android process uses framework SQLite. Both engines
    // use rollback journaling; older Android SQLite may lack the WAL-reset fix.
    const journal = db.execute('PRAGMA journal_mode=DELETE')[0]?.journal_mode;
    if (journal !== 'delete') {
      throw new Error('Safe local database journal mode is unavailable');
    }
    db.execute('PRAGMA busy_timeout=5000');
    initializePlannerDatabase(db);
    connection = db;
    return db;
  } catch (error) {
    native.close();
    throw error;
  }
}
