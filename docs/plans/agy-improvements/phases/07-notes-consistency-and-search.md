# AGY-PORT 07 — rich Notes consistency, search and pages

Prerequisites: 01, 04. Inventory: 12, 13. Protect PF03–PF04, PF07–PF08, PF10, PF12.

## Navigate

Target Notes store/hooks/editor/filter/reorder/share paths, rich-text utilities, sync-pull writers, meeting-generated Notes and assistant note intents. Donor notesEditStore/notesQueryStore/notesSearchSchema and edit-conflict/paging/query tests.

## Execute

1. Add owner-bound edit snapshots and revision-checked transactional save/soft-delete across manual/assistant/meeting/sync writers. Preserve rich content, flags, checklist behavior, categories/pinning and existing export/share formats. Failed or stale edits retain the user's draft with repair/refresh feedback.
2. Retire late actions on owner/editor changes and protect asynchronous refresh from overwriting a newer draft. Guest linking rekeys revisions/cache metadata with existing Notes atomically.
3. Add a derived normalized search cache tied to owner/note/revision. Invalidate after all writers, normalize rich bodies with bounded work and escape literal SQL wildcard text. Do not rewrite authoritative body content for search or silently index private content into logs.
4. Implement stable keyset pages, filters and bounded indexing batches in AGY's existing Notes UI. Partial/filtered pages cannot rewrite global sort order. Preserve pull-to-refresh, rich editing and meeting save-to-Notes/action-item routes.
5. Test concurrent editor/sync updates/deletes, failed saves, owner change, guest link, rich variants, literal wildcards, equal-time paging, indexing progress/reopen and safe reorder. Use synthetic large content with fingerprints, not user Notes. Run meeting/doc/Notes preserved suites plus full gates.

## Acceptance

No stale editor overwrites/deletes newer Notes; drafts survive recoverable failure; search/pages are bounded and owner-safe; rich and meeting-generated content remains editable/exportable. No source body is rewritten or real student database used as a fixture.

Deliver `reports/phase-07-notes.md`, schema/cache/revision docs and manual rich-note conflict/search/meeting-save checklist.
