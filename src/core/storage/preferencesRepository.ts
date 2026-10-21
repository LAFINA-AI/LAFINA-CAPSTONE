import {decodePreferences, validatePreferences} from '../domain/preferences';
import type {Preferences, PreferencesRepository} from '../domain/preferences';

export type SqlValue = string | number | null;
export interface LocalSqlConnection {
  execute(sql: string, params?: SqlValue[]): Record<string, unknown>[];
}

/** One atomic snapshot in the same DB that Phase 02 will extend with planner tables. */
export function createPreferencesRepository(
  db: LocalSqlConnection,
): PreferencesRepository {
  // CREATE IF NOT EXISTS is replayable. Never overwrite an unreadable record.
  db.execute(
    'CREATE TABLE IF NOT EXISTS app_settings (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL)',
  );
  return {
    async load() {
      const row = db.execute(
        'SELECT payload FROM app_settings WHERE id = 1',
      )[0];
      if (!row) {
        return null;
      }
      if (typeof row.payload !== 'string') {
        throw new Error('Invalid settings payload');
      }
      return decodePreferences(row.payload);
    },
    async save(preferences: Preferences) {
      const error = validatePreferences(preferences);
      if (error) {
        throw new Error(error);
      }
      // A single SQL statement commits all onboarding fields and completion together.
      db.execute(
        'INSERT INTO app_settings (id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload',
        [JSON.stringify(preferences)],
      );
    },
  };
}
