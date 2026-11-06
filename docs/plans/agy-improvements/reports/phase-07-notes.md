# AGY-PORT 07: rich Notes consistency, search and pages

Implementation: CODE_COMPLETE

Automation: PASS. Build: PASS (native unchanged). Device: NOT_RUN. Live service: NOT_RUN.

Run ID / UTC timestamp: `agy-port-20261106`, 2026-11-06T03:5xZ–04:2xZ
Repository/worktree / branch: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` / `codex/agy-preservation-improvements`
Phase base / tested HEAD: base `4dbfc4b` (the AGY-PORT 06 result `a077b10` plus its index commit) / tested `4dbfc4b+worktree`
Phase result commit: recorded in RUN-STATE.json and the run log after commit (no self-referential SHA)
Owner authorization: [OWNER-AUTHORIZATION.md](../OWNER-AUTHORIZATION.md), plus the owner's resume prompt of 2026-11-06.
Inventory areas / prerequisites: 12 and 13. Prerequisites 01 (`8ab83b2`) and 04 (`c36eec9`) are committed.

## Outcome in plain language

**Notes no longer lose newer text to a stale screen.**
- A note open in the editor saves only over the version it opened.
- If the note changed meanwhile, the editor stays open with the student's text and offers **Keep editing** (default) or **Save as a copy**. The change could come from sync, a reviewed assistant command, a category rename or another editor.
- A delete confirmed after such a change is refused.
- A checklist tap on a stale card refreshes the list instead of writing old text.
- An account change closes and clears the editor. The editor's "AI" actions (summarize, clean, extract tasks) do nothing if the editor closed or the account changed before their timer ran. Before this phase, "extract tasks" could create tasks after the editor had closed.

**Notes are read and searched in SQLite, a page at a time.**
- Notes load 50 at a time, with a "Show more notes" button.
- The All, Pinned, AI Transcribed and category filters run in SQL.
- Search uses a derived, device-local cache of each note's plain text, which every write invalidates. It is built in bounded batches; while it builds, Notes says "Preparing your notes for search…".
- `%`, `_` and `\` in a search are literal characters.
- The stored note is never rewritten for search.

**Drag-to-reorder now needs the complete collection.** It saves only from the full, unfiltered collection with nothing changed, so a partial or filtered page can never rewrite the order. With more than 50 notes, drag appears once all pages are loaded.

**Unchanged:** rich editing and the preview, checklist syntax, categories, pinning, images, the meeting recorder entry point, meeting "save to Notes", and Notes export and share formats.

## Checklist and changes

| Requirement | Result | File/module | Reason / intentional behavior change |
|---|---|---|---|
| 1. Owner-bound snapshots; revision-checked save/soft-delete | implemented | `src/storage/notesEditStore.ts` | Reuses the schema 20 revisions, which cover every writer. Refusals are `changed`, `deleted` or `owner_changed`, and nothing is written. |
| 1. All writers covered | existing + verified | revision triggers (ADR-018); `commandReview` (AGY-PORT 04); `MeetingDetail` (insert only); `syncWorker` | Tests cover a real `runSyncPass` update and delete under an open editor, manual updates, raw writes, category rename, delete and guest rekey. |
| 1. Drafts survive failure | implemented, intentional change | `src/ui/screens/notes/hooks/useNotesData.ts` | Conflict → Keep editing / Save as a copy. Other failures → the existing "Note not saved" alert, with the editor kept open. |
| 2. Late actions retired | implemented, intentional change | same | Editor and query tokens plus an owner ref. Owner change closes the editor. AI timers check both before acting. |
| 2. Guest link | verified | `guestMigration` (unchanged) and the new triggers | The rekey drops the guest cache rows and bumps revisions in the same transaction. A guest-era snapshot is refused; the new owner can edit. |
| 3. Derived search cache | implemented | `src/storage/notesSearchSchema.ts` (schema 21), `notesQueryStore.ts` | Owner- and revision-stamped. Cleared by update/delete triggers. At most 50 notes and about 400,000 characters per call, with 100,000 characters per body. Literal `LIKE` escaping. Nothing is logged. |
| 4. Keyset pages, SQL filters, bounded batches | implemented | `notesQueryStore.page`, `NotesScreen.tsx` | Cursors are bound to owner, filter and search. The `idx_notes_user_page` index serves pages without a sort. |
| 4. Safe reorder | implemented, intentional change | `notesQueryStore.reorder`, `canReorder` | Complete, unchanged collection only. Only notes that moved are written. |
| 4. Preserve rich editing / meeting saves / pull-to-refresh | preserved | — | The Notes screen has no pull-to-refresh control; it refreshes on `refreshTrigger`, which is unchanged. Meeting save-to-Notes is unchanged and tested as searchable and editable. |
| 5. Tests | implemented | `__tests__/storage/agyPort07Notes.test.ts` (17), `__tests__/ui/agyPort07NotesUi.test.tsx` (8) | Synthetic content only. The large body is checked by SHA-256 fingerprint. |

Intentional test updates:
- **`schemaMigrations`:** the list of tables added by the upgrade now includes `notes_search_index`, which starts empty.
- **`storageRecovery`:** "a failed reorder ends the drag and says so" now makes `notesQueryStore.reorder` fail instead of `notesStore.updateOrder`. The assertions are unchanged. `notesStore.updateOrder` still exists, and its own recovery test is unchanged.

## Provenance and compatibility

- **Donors:** LAFINA `0d4bbe39e106c29fb90792cf5d2f916b5c0d6480`, read only.
  - `src/storage/notesEditStore.ts` (blob `98e0b615…`)
  - `notesQueryStore.ts` (blob `5cf887a2…`)
  - `notesSearchSchema.ts` (blob `d2c09d6a…`)
- **Adapted:**
  - Revisions come from AGY's `entity_local_revisions`, where a missing row means 0. The donor requires ≥1.
  - Owner checks: the donor requires an `active_session` row. AGY refuses only when a session names *another* account, because guest creation does not set a session.
  - Search work is bounded by a character budget as well as the count.
  - The page index is new.
  - Reorder writes only the notes that moved.
  - Errors are typed and never contain note text.
  - AGY's own utilities do the normalization: `noteBodyToMarkdown`, `parseNoteBlocks`, `noteBlocksToPlainText`.
- **Schema 21** is additive (one table, two indexes, two triggers) and device-local. There is no sync payload, outbox or wire change. See [ADR-020](../../../decisions/ADR-020-notes-revisions-search-pages.md).

## Preserved AGY features

| PF ID | Baseline result | Current test/command | Actual result | Manual/live limitation |
|---|---|---|---|---|
| PF03 Guest linking | PASS | preflight; new guest-link test | PASS | Device NOT_RUN |
| PF04 Sync | PASS | preflight; new `runSyncPass` (fake server) note update/delete test | PASS | Live sync NOT_RUN |
| PF07 Documents/attachments, meeting save | PASS (phase09) | preflight; new meeting-note search/edit test | PASS | Live generation NOT_RUN |
| PF08 Recorder/microphone | PASS | preflight (untouched) | PASS | Device NOT_RUN |
| PF10 UI/navigation/settings | PASS (phase02 screens) | preflight; new Notes UI tests | PASS | Intentional: conflict choices, "Show more notes", indexing notice, drag only on the complete collection |
| PF12 Data/error recovery | PASS (storageRecovery) | preflight; updated reorder recovery test | PASS | Device NOT_RUN |
| PF01, PF02, PF05, PF06, PF09, PF11, PF13 | PASS | preflight (full suite) | PASS | Untouched |

## Commands and evidence

All in `evidence/agy-port-20261106/phase-07/`. Every run is kept, including the failure.

| UTC / working directory | Exact command | Tested HEAD | Exit/result | Evidence path |
|---|---|---|---|---|
| 04:01–04:04Z / checkout | `p07_mutations.sh` (N1–N5, each applied, both new suites run, restored, `cmp`) | 4dbfc4b+worktree | each mutation fails named tests; all restored byte-identical | `mutation-checks.log` |
| 04:05Z / checkout | `npm run preflight` | 4dbfc4b+worktree | **exit 1**: ESLint `no-control-regex` in `notesQueryStore.ts` | `preflight-1.log` |
| 04:07Z / checkout | `npm run preflight` | 4dbfc4b+worktree | exit 0; 32 suites, 470 passed + 1 skipped | `preflight-2.log` |
| 04:08Z / `X:\android` | `gradle-x.ps1 … testDebugUnitTest assembleDebug` | 4dbfc4b+worktree | exit 0; `:app:testDebugUnitTest` UP-TO-DATE (native unchanged) | `gradle-unit-assemble-1.log` |
| 04:12Z / checkout | `npm run preflight` (after the char-budget and reload review fixes) | 4dbfc4b+worktree | exit 0; 471 passed + 1 skipped | `preflight-3.log` |
| 04:14Z / checkout | temporary Jest probe printing `EXPLAIN QUERY PLAN`; probe deleted | 4dbfc4b+worktree | before the page index | `query-plans.txt` |
| 04:16Z / checkout | same probe after adding `idx_notes_user_page` | 4dbfc4b+worktree | pages use the index with no sort | `query-plans-2.txt` |
| 04:17Z / checkout | `npm run preflight` (final) | 4dbfc4b+worktree | exit 0; 32 suites, 471 passed + 1 skipped; architecture PASS (203 modules) | `preflight-4.log` |

**Mutations N1–N5:**

| Mutation | What it broke | Tests failed |
|---|---|---|
| N1 | Revision check removed | 6, including the real sync pull test |
| N2 | `LIKE` wildcards not escaped | 1 |
| N3 | Update trigger does not invalidate the cache | 2 |
| N4 | Partial reorder accepted | 1 |
| N5 | Late AI action not retired | 2 |

- The mutated lines were unchanged by the later review fixes.
- **Counts:** 446 tests before this phase, 471 after: 25 new tests and no removed ones. Two existing tests were updated intentionally (above).

## Native, performance and device facts

- **Native:** no Android file changed (`git diff --stat HEAD -- android` is empty). Gradle reused its Kotlin results (UP-TO-DATE, 43/43 from the remediation run), and `assembleDebug` succeeded. No APK carries this JavaScript, because the debug build uses Metro.
- **Query plans:**
  - **Pages:** `SEARCH n USING INDEX idx_notes_user_page (user_id=?)` with no temporary B-tree.
  - **Search pages:** start from `idx_notes_search_owner` and sort only the matches.
  - **Indexing:** reads stale rows via `idx_notes_user_sort`.
- **Timing:** no timing was measured for this phase.
- **Device:** none used.

## Review findings and decisions

The parent self-reviewed the full Phase 07 diff on 2026-11-06. No independent reviewer was used.

1. **Indexing work per call (fixed).**
   - Problem: 50 bodies of 100,000 characters each could be normalized in one keystroke on the JS thread.
   - Fix: a 400,000-character budget per call (at least one note), with bodies cut in SQL by `substr`. Tested.
2. **Stale revisions after reorder (fixed).**
   - Problem: a successful reorder left the cards with old revisions unless the parent refresh changed the trigger, so the next checklist tap would be refused.
   - Fix: the hook reloads after every drag end.
3. **Page sort cost (fixed).**
   - Problem: each page sorted all of the owner's notes because of the mixed sort directions.
   - Fix: `idx_notes_user_page` matches the order exactly.
4. **Lint (fixed).** `no-control-regex` failed preflight-1 (kept). It is now an explicit character-code check, with a test for a tab character.
5. **Remaining risks.**
   - A note edited between two page loads can move. Duplicates are skipped by ID; a note that moved *up* past the cursor appears only after a refresh.
   - Text beyond 100,000 characters per body is not searchable.
   - Category, Profile and assistant code still use `notesStore.getAll` for their own purposes (deferred below).

## Manual checklist still needed

1. Install/open: build the debug app from the Phase 07 commit and run it with Metro.
2. Actions:
   - Open a note on the phone. Change the same note on another signed-in device (or through Chat: "Rename note …" → Confirm) and let it sync. Then edit on the phone and tap Save.
   - Choose Save as a copy.
   - Open the delete prompt for a note, let a sync change arrive, then tap Delete.
   - Tick a checklist item on a card after the note changed elsewhere.
   - Create more than 50 notes, then scroll to "Show more notes" and try dragging before and after loading all of them.
   - Search for a word in a bold/heading/checklist line and for `100%`.
   - Save a recorded lecture to Notes, search for a word from it, then edit and save it.
   - Start "Extract tasks" in the editor and close the editor at once.
3. Expected:
   - The editor stays open with your text and "Note changed elsewhere". The copy is saved as "(copy)" and the synced note is unchanged.
   - The delete is refused.
   - The card refreshes and asks for a second tap.
   - Drag works only once all notes are loaded.
   - Rich words and the literal `%` match; markup does not.
   - The lecture note is found and saves.
   - No tasks are created after the editor closes.
4. Current execution status: NOT_RUN. No device or live backend was used.

## Deferrals and continuation

- **Other full note reads.**
  - `notesStore.getAll` remains in Profile statistics (Phase 09), in assistant target matching (`commandReview`, which needs title search under the AGY-PORT 04 rules), and in Profile's "delete all".
  - None of these is the Notes screen. Bounding them belongs with Phase 09 or 12.
- **On-screen pull-to-refresh** does not exist in AGY's Notes, so it was not added. That is a feature addition, not preservation.
- **Paging stability under concurrent edits** is best-effort, as described under Review findings. A stricter, immutable page key would need a schema change to Notes ordering.

Next action: NEXT_PHASE, AGY-PORT 08. No human review pause under this pack's authorization.
