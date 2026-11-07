import type {DatabaseTransaction} from './database';

/**
 * Schema 21 (AGY-PORT 07): a derived, device-local search cache for Notes.
 * Adapted from the LAFINA donor `notesSearchSchema.ts` (blob d2c09d6a) onto
 * AGY's `entity_local_revisions` (schema 20). See ADR-020.
 *
 * `notes_search_index` holds one lower-cased plain-text copy of a note's title
 * and rich body, stamped with the owner and the note's local revision when it
 * was built. The note row stays authoritative and is never rewritten for
 * search. A cache row counts only while its owner and revision still match
 * the note, and two triggers delete it whenever the note row is updated or
 * deleted, so every writer (manual editor, reviewed assistant commands,
 * meetings, sync pulls, guest rekeys, category renames, raw SQL) invalidates
 * it without having to remember to. Nothing here is synced or logged.
 */
export const NOTES_SEARCH_TABLE = 'notes_search_index';

export const NOTES_SEARCH_TRIGGERS = [
  'notes_search_invalidate_update',
  'notes_search_invalidate_delete',
] as const;

export const migrateNotesSearch = (tx: DatabaseTransaction): void => {
  tx.executeSync(`CREATE TABLE IF NOT EXISTS ${NOTES_SEARCH_TABLE} (
    note_id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
    normalized_text TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  )`);
  tx.executeSync(
    `CREATE INDEX IF NOT EXISTS idx_notes_search_owner ON ${NOTES_SEARCH_TABLE}(user_id, note_id)`,
  );
  // Notes pages in their exact order, so a page is read without sorting every note.
  tx.executeSync(
    `CREATE INDEX IF NOT EXISTS idx_notes_user_page
       ON notes(user_id, is_pinned DESC, sort_order ASC, updated_at DESC, id ASC)`,
  );
  const [onUpdate, onDelete] = NOTES_SEARCH_TRIGGERS;
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS ${onUpdate}
    AFTER UPDATE ON notes BEGIN
      DELETE FROM ${NOTES_SEARCH_TABLE} WHERE note_id = OLD.id;
    END`);
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS ${onDelete}
    AFTER DELETE ON notes BEGIN
      DELETE FROM ${NOTES_SEARCH_TABLE} WHERE note_id = OLD.id;
    END`);
};
