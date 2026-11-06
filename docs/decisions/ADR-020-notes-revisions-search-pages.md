# ADR-020: Revision-checked Notes, derived search cache and keyset pages

**Status:** accepted (owner pre-authorized AGY-PORT 00–13 in `docs/plans/agy-improvements/OWNER-AUTHORIZATION.md`)
**Date:** 2026-11-06
**Phase:** AGY-PORT 07
**Review owner:** human developer

## Context / problem

Before this phase, the Notes screen had these gaps:

- **Stale saves.**
  - The editor saved with `notesStore.update(id, …)`, with no owner or version check.
  - If the same note changed while the editor was open, the old draft silently replaced the newer text. The change could come from a sync pull, a reviewed assistant command, a category rename or a second editor.
  - A delete confirmed after such a change deleted the newer note.
  - A checklist tap on a card wrote the card's (possibly stale) body back.
- **Late actions.**
  - The 1.5 s "AI" editor actions ran after the editor closed or the account changed. "Extract tasks" could create tasks for the previous account.
  - Owner changes did not close the editor.
- **Unbounded reads.**
  - `getAll` loaded every note.
  - Search lower-cased and Markdown-converted every body on every keystroke in JavaScript.
  - The filters ran over the full array.
- **Reorder** rewrote `sort_order` from whatever list was on screen.

## Decision

### 1. Revisions come from schema 20

Schema 20 (ADR-018) already keeps `entity_local_revisions` for notes. Triggers bump a note's revision on every insert and delete, and on any real change to a tracked column, whoever wrote it. AGY-PORT 07 adds no second version mechanism. A missing revision row means revision 0.

### 2. Edit snapshots (`notesEditStore`)

- `getSnapshot(userId, id)` returns the note and its revision. The editor re-reads the note when it opens, so it never starts from a stale card.
- `save(target, patch)` and `remove(target)` run in one transaction. They refuse with `NoteEditConflictError` when:
  - `owner_changed`: a signed-in session names another account, or the row now belongs to someone else;
  - `deleted`: the note is gone;
  - `changed`: the revision moved.
- Nothing is written when a save or delete is refused. Content, revision and outbox are rolled back together.
- `create` refuses when another account is signed in.
- If no `active_session` row exists at all (tests, first launch), this is not treated as an owner change; the row's own owner is still checked. A strict session requirement, as the donor has, would break sessionless guest paths in AGY.

### 3. The UI keeps the draft

- **Stale save:** the editor stays open with the text. It offers **Keep editing** (default) or **Save as a copy**, which creates a new note from the draft so nothing is overwritten.
- **Stale delete:** refused with an explanation.
- **Stale checklist tap:** refreshes the list and asks for a second tap.
- **Owner change:** closes and clears the editor.
- Editor actions, delete prompts and indexing retries carry an editor or query token and an owner. A late callback whose token or owner is no longer current does nothing.

### 4. Derived search cache (schema 21, `notes_search_index`)

- **Content:** one row per note, holding `user_id`, `source_revision` and `normalized_text`, which is the lower-cased title plus the plain text of the Markdown/HTML body.
- **Validity:** a row counts only while its owner and revision match the note.
- **Invalidation:** `AFTER UPDATE` and `AFTER DELETE` triggers on `notes` delete the row. This happens for any update at all, including guest rekeys (`user_id`), category renames, sync upserts (`ON CONFLICT DO UPDATE`) and soft deletes.
- **Bounded work:** normalization is bounded. At most 100,000 body characters per note are normalized, and at most 50 notes per page call. `indexing: true` makes the screen ask again on a short timer.
- **Escaping:** `%`, `_` and `\` are escaped (`LIKE … ESCAPE '\'`), so they match literally.
- **Privacy:** the cache is device-local, never synced, and never logged. The note body is never rewritten.

### 5. Keyset pages (`notesQueryStore.page`)

- **Order:** Notes' existing order, `is_pinned DESC, sort_order ASC, updated_at DESC`, plus `id ASC` as the final tiebreak. Equal values never drop or repeat a note.
- **Cursors:** a cursor is `[version, owner, filter, search, pinned, sort_order, updated_at, id]`. It is refused for any other owner, filter or search.
- **Filters:** All, Pinned, AI Transcribed and category run in SQL.
- **Page size:** 50, with a "Show more notes" button.
- **Index:** schema 21 also adds `idx_notes_user_page (user_id, is_pinned DESC, sort_order ASC, updated_at DESC, id ASC)`. Unfiltered and cursor pages are then read in index order with no sort step. Search pages sort only their matches.
- **Edits during paging:** a note edited between pages can move. The screen skips duplicates by ID, and a refresh restarts from page one.

### 6. Safe reorder

`notesQueryStore.reorder` saves `sort_order` only when:

- the screen holds the owner's complete set of notes, with no filter, no search and no further page;
- every note's revision still matches.

Dragging is offered only in that state. Only notes whose position actually changed are written. Each write goes through `notesStore.update`, so the outbox and revision rules are unchanged.

## Public interfaces

- `notesEditStore`: `getSnapshot`, `isActiveOwner`, `create`, `save`, `remove`, plus `NoteEditConflictError` / `isNoteEditConflict`.
- `notesQueryStore`: `page`, `reorder`, plus `InvalidNotesQueryError` and `NOTES_PAGE_SIZE`.
- `useNotesData` adds `hasMore`, `loadMoreNotes`, `indexing`, `queryError` and `canReorder`.
- Notes and card props are unchanged; the screen passes snapshots.

## Wire and compatibility

- **Sync:** no change to the seven sync payloads, the outbox or the sync worker.
- **Migration:** schema 21 is additive (a new table, two indexes and two triggers) and runs in the single upgrade transaction (ADR-016).
- **Unchanged features:** export and share formats, rich editing, checklist syntax, categories, pinning and meeting "save to Notes" are unchanged.

## Consequences

- Text beyond the first 100,000 characters of a body is not searchable. The note itself is complete.
- Every update to a note, including a reorder, clears its cache row, so the next search re-indexes it. This is bounded to 50 per call.
- With more than 50 notes, drag-to-reorder appears only after all pages are loaded.
- Assistant note commands already went through the AGY-PORT 04 revision-checked review. Meeting saves only insert new notes. Neither needed a change.
