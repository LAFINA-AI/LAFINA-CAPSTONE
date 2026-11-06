# ADR-018 — Reviewed assistant commands: local revisions and operation receipts

**Status:** accepted (owner pre-authorized AGY-PORT 00–13 in `docs/plans/agy-improvements/OWNER-AUTHORIZATION.md`)
**Date:** 2026-11-06
**Phase:** AGY-PORT 04
**Review owner:** human developer

## Context / problem

Before this phase, Chat and Voice wrote planner changes as soon as an intent was parsed. Examples are "Add task …", "Delete physics homework" and "Acknowledge the quiz reminder". `executeNluAction` also:

- matched targets by fuzzy title;
- filled a missing date/time with today/09:00 without saying so;
- removed reminders by matching titles.

A misheard phrase or a local-model guess could therefore delete or move the wrong item with no chance to check it first.

AGY-PORT 04 requires the following:

- **Review first.** Assistant-proposed mutations are reviewed before any write, and Confirm writes exactly what was shown.
- **Re-check at Confirm.** Confirm refuses if the owner, session, target or expiry changed since the review was prepared.
- **Exactly once.** A repeated Confirm must not write twice.
- **Preserved AGY features stay intact:** sync wire (PF04), Chat routing (PF05), Handbook RAG (PF06), documents (PF07) and ringing-call ACK/Snooze (PF11).

## Decision

1. **Local revisions in a side table**: `entity_local_revisions(entity_type, entity_id, revision)`, added by schema migration 20 (`src/storage/assistantOperationSchema.ts`).
   - SQLite `AFTER INSERT/UPDATE/DELETE` triggers on `tasks`, `events`, `time_blocks`, `notes` and `reminders` add 1 to the revision. That covers every writer: manual forms, assistant, sync pull upserts, guest rekey, cascades and raw SQL.
   - An update counts only when a tracked column really changes. Each update trigger is `AFTER UPDATE OF <tracked columns> … WHEN OLD.c IS NOT NEW.c OR …` (`REVISION_TRACKED_COLUMNS`).
     - Tracked: every student-visible column plus `id`, `user_id` and `deleted_at`.
     - Not tracked: `created_at`, `updated_at` and the reminder speech cache `precast_audio_path`.
     - So a sync echo that rewrites identical values does not make an open review stale; a real change does. This is tested with a full `runSyncPass` against a fake server.
   - No synced table gains a column. The seven sync payloads are unchanged (PF04), and a test asserts that no outbox payload contains "revision".
2. **Operation receipts**: `assistant_operation_receipts(operation_id UNIQUE, user_id, intent, operation, entity_type, entity_id, reminder_id, reply, applied_at)`.
   - The receipt is inserted in the same transaction as the item, its linked reminder, the delivery-job link (`deliveryStore.linkSource`) and the outbox rows.
   - A repeated Confirm finds the receipt and returns it with `repeated: true`; nothing is written again.
   - A trigger keeps the newest 500 receipts. Receipts are local-only and contain no transcript text.
3. **Proposals are in memory only**, and expire after five minutes (`REVIEW_TTL_MS`).
   - Each proposal is frozen and bound to:
     - an operation ID;
     - the owner and an owner epoch: whether the owner's user row exists, plus the `active_session` user and its `created_at`. Every sign-in therefore starts a new epoch, and a card prepared before a sign-out never confirms after signing back in, even as the same account. `App.tsx` also calls `endReviewSession()` whenever the active account changes;
     - a process-local session ID;
     - the exact target IDs and the revisions read at prepare time;
     - the resolved date/time and the reminder lead.
   - Each owner has at most one open proposal per surface (Chat or Voice). A newer one cancels the older one.
   - Raw model output is never stored as a command: every field is re-validated (`cleanIntent`) and turned into a typed operation.
4. **Confirm** (`confirmReviewedCommand`) runs in one `transactionSync` and takes these steps:
   1. checks for an existing receipt;
   2. checks owner, session, cancelled state and expiry;
   3. inside the transaction, re-reads the owner epoch, and for each target checks owner, not-deleted and an equal revision;
   4. checks the delivery fence for reminder actions;
   5. applies the operation;
   6. inserts the receipt.

   After it runs:
   - Alarm registration and cancellation run after commit.
   - A stale, expired, other-owner, cancelled or fenced review is refused and stays refused.
   - Any other failure rolls everything back and returns `failed`; the proposal stays pending so Confirm can be retried.
5. **Routing** (`src/ai/nlu/intentRoutes.ts`) is a `Record<ParsedIntentType, …>`, so a new intent type fails to compile until it is given a route.
   - Create, update and delete for tasks, time blocks and notes, plus `create_reminder`, `reschedule`, `acknowledge` and `snooze`, are reviewed mutations.
   - `query_schedule` is read-only and runs at once.
   - `chat` and `out_of_scope` are conversation; the online, Handbook and document paths are unchanged.
   - Inside a ringing call, only `acknowledge` and `snooze` are immediate, and they are fenced by the call's captured reminder ID and generation.
6. **Exact links replace title cleanup** wherever a link exists.
   - Reviewed creations link their reminder to the source item with `deliveryStore.linkSource`.
   - Store cascades and the manual Calendar form never remove a reminder that is linked to a different item.
   - Reminders without a link keep AGY's legacy rule: same owner, same title ignoring letter case and spacing (`legacyTitleKey` in `src/storage/sourceReminders.ts`). This is the rule AGY's assistant and Calendar paths used. AGY's store cascades compared titles exactly, so they now also catch case and spacing variants of the same title, for the same owner only.
   - When a reviewed command renames or moves a task, event or time block, its linked reminders and its legacy same-title reminders change in the same transaction.
     - `reminders.task` gets the new title and the stale pre-recorded speech is dropped. `description` holds notes, never the title, in AGY, so it is unchanged.
     - A moved task's reminder rings at the new due time, as in AGY. An event or time block's reminder shifts by the same amount, which keeps its lead time.
     - Each alarm is re-registered after commit with the new text.
   - The delete card lists each reminder that will be removed with the item, and marks the unlinked same-title ones. Confirm re-reads that set and refuses as stale if it changed, so nothing is removed that the card did not show.
6. **Unreviewed writers are fenced.** `intentService.processAndExecuteIntent` is marked `@deprecated` and test-only. `scripts/check-architecture.mjs` fails if any `src/` module other than its own references it. It also fails if `executeNluAction` is referenced outside its module, the NLU barrel, `intentService` and `chatOrchestrator`, whose only use is the read-only `query_schedule` route.

## Alternatives considered

- **A `revision` column on each synced table.** Rejected: it would change the schema of synced rows and risk leaking onto the wire (PF04). Every writer, including sync upserts, would also have to remember to bump it.
- **Comparing `updated_at`.** Rejected: sync preserves the server's `updated_at`, and second-level timestamps can collide.
- **Persisting proposals in SQLite.** Rejected: a proposal is a private, short-lived UI object. Persisting it would keep transcripts on disk and allow a confirm after restart or account change. The durable part, the receipt, is persisted.
- **Adopting the donor's `NluResult`/`commandSchema` public schema.** Rejected by the phase directive: it is incompatible with AGY's `ValidatedIntent`, and the file does not exist at the pinned donor revision.
- **Keeping direct writes and adding Undo.** Rejected: Undo cannot recall an alarm that has already rung or a change already synced to the cloud.

## Impact

- **Correctness.**
  - Prepare and Cancel write nothing; Confirm writes once.
  - Ambiguous or missing targets produce a clarification listing up to 5 candidates.
  - Defaults are visible on the card; a reminder with no time asks instead of assuming 09:00.
- **Intentional behaviour changes (PF05).**
  - Chat and Voice planner commands need a Confirm tap.
  - "Acknowledge X" outside a call no longer marks a task done.
  - A reviewed acknowledge stops only the exact reminder, not same-title duplicates.
  - Date-only and undated tasks are kept without a reminder, and a new paged Undated view shows them.
- **Unchanged.** Manual forms and ringing-call Answer/ACK/Snooze stay immediate. `executeNluAction` stays exported for legacy callers and the preservation suite.
- **Performance.** Five tiny triggers are added per write (an UPSERT of one row). There is no native change and no new permission.
- **Privacy.** Proposals never leave memory. Receipts store the IDs and a short reply, not the transcript.

## Measurements/verification

- Jest with the node:sqlite mock:
  - `__tests__/ai/agyPort04ReviewedCommands.test.ts` (42 tests);
  - `__tests__/ui/agyPort04ReviewUi.test.tsx` (7 tests);
  - the schema-20 upgrade test in `__tests__/storage/schemaMigrations.test.ts`;
  - first pass: `npm run preflight` gave 24 suites, 366 tests, PASS.
  - After the review follow-up:
    - `agyPort04ReviewedCommands` has 52 tests, including a full fake-server `runSyncPass` echo test;
    - `npm run preflight` gives 24 suites, 376 tests, PASS;
    - an architecture-guard probe fails as intended with a probe file and passes without it.
- Evidence: `docs/plans/agy-improvements/reports/evidence/agy-port-20261106/phase-04/`.
- Device behaviour is **NOT YET MEASURED** (no phone in this run).

## Rollback

- **Database.** The migration ledger records version 20. Under ADR-016, a build older than the installed schema is refused rather than allowed to write. A plain revert installed over a phone that already ran schema 20 would therefore refuse the database; it would not delete it.
- **Code.** The safe rollback is a forward build that keeps migration 20 and its two additive side tables, and changes only the behaviour. Local tasks, reminders and alarms are untouched because the new tables are side tables that are never synced.
- **Turning off the review flow in that build.** Switch `chatOrchestrator` step 5 back to `executeNluAction` for `reviewed_mutation` routes. That also brings back the unreviewed writes.

## Human approval

Pre-authorized for this unattended run in `docs/plans/agy-improvements/OWNER-AUTHORIZATION.md`. Product review of the Confirm UX on a phone is still required.

## Addendum 2026-11-06: no title-only reminder ownership

Status: accepted, pre-advance remediation. Supersedes the "legacy same-owner, same-title rule" above. Report: `docs/plans/agy-improvements/reports/pre-advance-remediation.md`.

- **Ownership.** A reminder belongs to an item only through:
  - an exact local link (`reminder_delivery_jobs.source_type`/`source_id`); or
  - for an unlinked reminder, the strict evidence rule in `src/storage/sourceReminders.ts`. The owner and the title (ignoring case and spacing) must match, the reminder's `scheduled_at` must be the item's own due date and minute, and no other live item may qualify.

  A shared title alone never establishes ownership. An ambiguous match is standalone.
- **Who uses the rule.**
  - Store cascades and reviewed delete, rename and move use `remindersForSource`.
  - The Calendar form replaces and deletes only an item's own reminders, and links each new reminder in the same transaction.
  - Call admission, the dispatcher and the poller suppress a reminder only when its own task is completed, or when the same alert was acknowledged (`alertSuppression`).
  - Acknowledge also acknowledges only reminders of the same alert (`isSameAlert`). That means the same item, or for standalone reminders the identical text at the identical instant.
- **Promotion to an exact link.** Confirming a reviewed rename or move that includes an evidence-matched reminder records its exact link in the same transaction.
- **Not changed.** The legacy title cleanup inside `actionExecutor`'s mutation helpers is kept for the test-only `intentService.processAndExecuteIntent`. The architecture check forbids product callers.
