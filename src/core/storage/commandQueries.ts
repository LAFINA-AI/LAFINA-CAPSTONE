import type {PlannerRepository} from '../domain/planner';
import {assertDatabaseUsable} from './plannerDatabase';
import {num, str} from './plannerRows';
import type {LocalSqlConnection} from './preferencesRepository';

/** A finite exact-match result, never a substring or first-match target picker.
 * SQLite NOCASE folds ASCII only; other scripts retain exact spelling. SQL may
 * scan titles, but at most21 small identity rows cross the native boundary.
 */
export function createCommandQueries(
  db: LocalSqlConnection,
): Pick<PlannerRepository, 'findTargets'> {
  return {
    findTargets(query) {
      assertDatabaseUsable(db);
      if (
        (query.kind !== 'task' && query.kind !== 'event') ||
        typeof query.title !== 'string' ||
        !query.title.trim() ||
        [...query.title].length > 160
      ) {
        throw new Error('Choose one exact saved task or event title.');
      }
      const table = query.kind === 'task' ? 'tasks' : 'events';
      const rows = db.execute(
        `SELECT id,title,version FROM ${table} WHERE deleted_at IS NULL
         AND trim(title)=? COLLATE NOCASE ORDER BY id LIMIT 21`,
        [query.title.trim()],
      );
      return {
        items: rows.slice(0, 20).map(row => ({
          kind: query.kind,
          id: str(row, 'id'),
          title: str(row, 'title'),
          version: num(row, 'version'),
        })),
        hasMore: rows.length > 20,
      };
    },
  };
}
