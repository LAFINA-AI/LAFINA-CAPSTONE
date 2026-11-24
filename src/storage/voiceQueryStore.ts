import {db} from './database';
import {mapRowToTask} from './tasksStore';
import {mapRowToNote} from './notesStore';
import {escapeLike} from './notesQueryStore';

const search = (query: string) => `%${escapeLike(query.toLowerCase())}%`;

/** Bound rows and body bytes before crossing the synchronous SQLite/JS boundary. */
export const voiceQueryStore = {
  tasks(owner: string, query = '', limit = 21, dated?: boolean) {
    const pattern = search(query);
    return db
      .executeSync(
        `SELECT id, user_id, title, due_date, due_time, is_completed, priority,
      category, substr(notes, 1, 2000) AS notes, recurrence_rule, created_at, updated_at, deleted_at
      FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND is_completed = 0
      ${
        dated === undefined
          ? ''
          : dated
          ? "AND due_date IS NOT NULL AND due_date <> ''"
          : "AND (due_date IS NULL OR due_date = '')"
      }
      AND (lower(title) LIKE ? ESCAPE '\\' OR lower(category) LIKE ? ESCAPE '\\' OR lower(COALESCE(notes, '')) LIKE ? ESCAPE '\\')
      ORDER BY CASE WHEN due_date IS NULL OR due_date = '' THEN 0 ELSE 1 END,
        CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, due_date, id LIMIT ?`,
        [owner, pattern, pattern, pattern, Math.max(1, Math.min(100, limit))],
      )
      .rows.map(mapRowToTask);
  },
  notes(owner: string, query = '', limit = 51) {
    const pattern = search(query);
    const rows = db.executeSync(
      `SELECT id, user_id, title, substr(body, 1, 50000) AS body,
      length(body) > 50000 AS body_truncated, is_pinned, tags, category, is_voice_transcribed,
      image_uri, sort_order, created_at, updated_at, deleted_at FROM notes
      WHERE user_id = ? AND deleted_at IS NULL
      AND (lower(title) LIKE ? ESCAPE '\\' OR lower(body) LIKE ? ESCAPE '\\' OR lower(category) LIKE ? ESCAPE '\\')
      ORDER BY is_pinned DESC, sort_order, updated_at DESC, id LIMIT ?`,
      [owner, pattern, pattern, pattern, Math.max(1, Math.min(100, limit))],
    ).rows;
    return {
      items: rows.map(mapRowToNote),
      truncated: rows.some(row => Number(row.body_truncated) === 1),
    };
  },
};
