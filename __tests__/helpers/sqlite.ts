import type {DatabaseSync} from 'node:sqlite';
import type {LocalSqlConnection} from '../../src/core/storage/preferencesRepository';

/** Exercise production SQL with host SQLite; this does not simulate Android JSI. */
export function connect(db: DatabaseSync): LocalSqlConnection {
  return {
    execute(sql, params = []) {
      const statement = db.prepare(sql);
      if (statement.columns().length > 0) {
        return statement.all(...params);
      }
      statement.run(...params);
      return [];
    },
  };
}
