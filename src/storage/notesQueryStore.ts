import {db} from './database';
import type {DatabaseTransaction} from './database';
import {notesStore} from './notesStore';
import {NoteEditConflictError, toNoteSnapshot} from './notesEditStore';
import type {NoteSnapshot} from './notesEditStore';
import {NOTES_SEARCH_TABLE} from './notesSearchSchema';
import {noteBlocksToPlainText, parseNoteBlocks} from '../utils/noteMarkdown';
import {noteBodyToMarkdown} from '../utils/richText';

/**
 * Bounded Notes pages, filters and search (AGY-PORT 07). Adapted from the
 * LAFINA donor `notesQueryStore.ts` (blob 5cf887a2) onto AGY's schema and
 * filters. See ADR-020.
 *
 * - Pages are keyset pages in Notes' existing order (pinned first, then
 *   `sort_order`, then newest `updated_at`), with `id` as the final tiebreak so
 *   equal values never drop or repeat a row. A cursor names its owner, filter
 *   and search; it cannot be replayed for another owner or query.
 * - Filters run in SQL. Search matches a lower-cased plain-text cache that is
 *   built at most `INDEX_BATCH` notes per call (bounded work), so `indexing`
 *   tells the screen to ask again until the cache is complete. `%`, `_` and
 *   `\` in a search are literal characters, not wildcards.
 * - Reorder rewrites `sort_order` only from the complete, unchanged, unfiltered
 *   collection, so a partial or filtered page can never rewrite the global
 *   order.
 */
export interface NotesQuery {
  userId: string;
  /** 'All' | 'Pinned' | 'AI Transcribed' | a category name. */
  filter?: string;
  search?: string;
  after?: string | null;
  limit?: number;
}

export interface NotesPage {
  items: NoteSnapshot[];
  nextCursor: string | null;
  /** True while some of this owner's notes are not yet searchable. */
  indexing: boolean;
}

export const NOTES_PAGE_SIZE = 50;
export const MAX_NOTES_PAGE_SIZE = 100;
export const INDEX_BATCH = 50;
/** Characters of one body normalized for search; the note itself is untouched. */
export const MAX_INDEXED_BODY_CHARS = 100_000;
/** Body characters normalized per page call before the rest waits for the next call. */
export const INDEX_CHAR_BUDGET = 400_000;
const MAX_SEARCH_CHARS = 100;
const CURSOR_VERSION = 1;

type Row = Record<string, unknown>;

export class InvalidNotesQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNotesQueryError';
  }
}

/** Lower-cased plain text of a title and a (Markdown or legacy HTML) body. */
export const normalizeNoteForSearch = (title: string, body: string): string => {
  const bounded = (body || '').slice(0, MAX_INDEXED_BODY_CHARS);
  const plain = noteBlocksToPlainText(
    parseNoteBlocks(noteBodyToMarkdown(bounded)),
  );
  return `${title || ''}\n${plain}`.toLowerCase();
};

export const escapeLike = (text: string): string =>
  text.replace(/[\\%_]/g, match => `\\${match}`);

const hasControlCharacter = (text: string): boolean => {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
};

const normalizeQuery = (
  query: NotesQuery,
): {filter: string; search: string; limit: number} => {
  const filter = query.filter ?? 'All';
  const search = (query.search ?? '').trim().toLowerCase();
  const limit = query.limit ?? NOTES_PAGE_SIZE;
  if (
    !query.userId ||
    filter.length > 100 ||
    search.length > MAX_SEARCH_CHARS ||
    hasControlCharacter(filter + search) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_NOTES_PAGE_SIZE
  ) {
    throw new InvalidNotesQueryError(
      `Use a search of up to ${MAX_SEARCH_CHARS} characters.`,
    );
  }
  return {filter, search, limit};
};

const STALE_SQL = `FROM notes n
  LEFT JOIN entity_local_revisions r
    ON r.entity_type = 'note' AND r.entity_id = n.id
  LEFT JOIN ${NOTES_SEARCH_TABLE} s
    ON s.note_id = n.id AND s.user_id = n.user_id
   AND s.source_revision = COALESCE(r.revision, 0)
  WHERE n.user_id = ? AND n.deleted_at IS NULL AND s.note_id IS NULL`;

/**
 * Builds the cache for at most INDEX_BATCH notes and about INDEX_CHAR_BUDGET
 * body characters (always at least one note); true while more remain. Bodies
 * are read already cut to MAX_INDEXED_BODY_CHARS by SQLite.
 */
const indexBatch = (userId: string, executor: DatabaseTransaction): boolean => {
  const rows = (executor.executeSync(
    `SELECT n.id, n.title, substr(n.body, 1, ?) AS body,
            COALESCE(r.revision, 0) AS revision ${STALE_SQL}
      ORDER BY n.id LIMIT ?`,
    [MAX_INDEXED_BODY_CHARS, userId, INDEX_BATCH],
  ).rows || []) as Row[];
  const now = new Date().toISOString();
  let budget = INDEX_CHAR_BUDGET;
  let processed = 0;
  for (const row of rows) {
    if (processed > 0 && budget <= 0) break;
    processed += 1;
    budget -= String(row.body ?? '').length;
    executor.executeSync(
      `INSERT INTO ${NOTES_SEARCH_TABLE}
         (note_id, user_id, source_revision, normalized_text, indexed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(note_id) DO UPDATE SET
         user_id = excluded.user_id,
         source_revision = excluded.source_revision,
         normalized_text = excluded.normalized_text,
         indexed_at = excluded.indexed_at`,
      [
        row.id,
        userId,
        Number(row.revision),
        normalizeNoteForSearch(String(row.title ?? ''), String(row.body ?? '')),
        now,
      ],
    );
  }
  if (processed === rows.length && rows.length < INDEX_BATCH) return false;
  return (
    (
      executor.executeSync(`SELECT n.id ${STALE_SQL} LIMIT 1`, [userId]).rows ||
      []
    ).length > 0
  );
};

const decodeCursor = (
  raw: string,
  userId: string,
  filter: string,
  search: string,
): [number, number, string, string] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidNotesQueryError('Invalid Notes cursor.');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 8 ||
    parsed[0] !== CURSOR_VERSION ||
    parsed[1] !== userId ||
    parsed[2] !== filter ||
    parsed[3] !== search ||
    (parsed[4] !== 0 && parsed[4] !== 1) ||
    !Number.isFinite(parsed[5]) ||
    typeof parsed[6] !== 'string' ||
    typeof parsed[7] !== 'string'
  ) {
    throw new InvalidNotesQueryError('Invalid Notes cursor.');
  }
  return [parsed[4], parsed[5], parsed[6], parsed[7]];
};

export const createNotesQueryStore = (executor: DatabaseTransaction = db) => ({
  /** One SQL-filtered page. A search first indexes at most INDEX_BATCH notes. */
  page: (query: NotesQuery): NotesPage => {
    const {filter, search, limit} = normalizeQuery(query);
    const indexing = !search
      ? false
      : executor === db
      ? db.transactionSync(tx => indexBatch(query.userId, tx))
      : indexBatch(query.userId, executor);
    let join = ` LEFT JOIN entity_local_revisions r
      ON r.entity_type = 'note' AND r.entity_id = n.id`;
    let where = 'n.user_id = ? AND n.deleted_at IS NULL';
    const args: unknown[] = [query.userId];
    if (filter === 'Pinned') where += ' AND n.is_pinned = 1';
    else if (filter === 'AI Transcribed')
      where += ' AND n.is_voice_transcribed = 1';
    else if (filter !== 'All') {
      where += ' AND n.category = ?';
      args.push(filter);
    }
    if (search) {
      join += ` JOIN ${NOTES_SEARCH_TABLE} s
        ON s.note_id = n.id AND s.user_id = n.user_id
       AND s.source_revision = COALESCE(r.revision, 0)`;
      where += " AND s.normalized_text LIKE ? ESCAPE '\\'";
      args.push(`%${escapeLike(search)}%`);
    }
    if (query.after) {
      const [pinned, order, updated, id] = decodeCursor(
        query.after,
        query.userId,
        filter,
        search,
      );
      where += ` AND (n.is_pinned < ?
        OR (n.is_pinned = ? AND n.sort_order > ?)
        OR (n.is_pinned = ? AND n.sort_order = ? AND n.updated_at < ?)
        OR (n.is_pinned = ? AND n.sort_order = ? AND n.updated_at = ? AND n.id > ?))`;
      args.push(
        pinned,
        pinned,
        order,
        pinned,
        order,
        updated,
        pinned,
        order,
        updated,
        id,
      );
    }
    const rows = (executor.executeSync(
      `SELECT n.*, COALESCE(r.revision, 0) AS local_revision
         FROM notes n${join}
        WHERE ${where}
        ORDER BY n.is_pinned DESC, n.sort_order ASC, n.updated_at DESC, n.id ASC
        LIMIT ?`,
      [...args, limit + 1],
    ).rows || []) as Row[];
    const kept = rows.slice(0, limit);
    const last = kept[kept.length - 1];
    return {
      items: kept.map(toNoteSnapshot),
      nextCursor:
        rows.length > limit && last
          ? JSON.stringify([
              CURSOR_VERSION,
              query.userId,
              filter,
              search,
              Number(last.is_pinned) === 1 ? 1 : 0,
              Number(last.sort_order) || 0,
              String(last.updated_at),
              String(last.id),
            ])
          : null,
      indexing,
    };
  },

  /**
   * Saves a new manual order from the complete, unchanged collection of this
   * owner. Refuses (nothing written) if any note was added, removed or changed
   * since the screen read it.
   */
  reorder: (userId: string, items: readonly NoteSnapshot[]): void => {
    const run = (tx: DatabaseTransaction): void => {
      const active = tx.executeSync(
        'SELECT user_id FROM active_session LIMIT 1',
      ).rows?.[0]?.user_id;
      if (active != null && String(active) !== userId) {
        throw new NoteEditConflictError('owner_changed');
      }
      const rows = (tx.executeSync(
        `SELECT n.id, COALESCE(r.revision, 0) AS revision FROM notes n
           LEFT JOIN entity_local_revisions r
             ON r.entity_type = 'note' AND r.entity_id = n.id
          WHERE n.user_id = ? AND n.deleted_at IS NULL`,
        [userId],
      ).rows || []) as Row[];
      const versions = new Map(
        rows.map(row => [String(row.id), Number(row.revision)]),
      );
      if (
        rows.length !== items.length ||
        new Set(items.map(item => item.id)).size !== items.length ||
        items.some(
          item =>
            item.userId !== userId || versions.get(item.id) !== item.revision,
        )
      ) {
        throw new NoteEditConflictError('changed');
      }
      items
        .filter(item => !item.isPinned)
        .forEach((item, index) => {
          if (item.sortOrder !== index) {
            notesStore.update({id: item.id, sortOrder: index}, tx);
          }
        });
    };
    if (executor === db) db.transactionSync(run);
    else run(executor);
  },
});

export const notesQueryStore = createNotesQueryStore();
