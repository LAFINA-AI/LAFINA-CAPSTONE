# AGY-PORT 04 — reviewed mutations without losing AGY commands

Implementation: CODE_COMPLETE

| Gate | Status |
|---|---|
| Automation (targeted Jest, `npm run preflight`) | PASS |
| Native build | N/A: no native file changed |
| Device | NOT_RUN |
| Live service | NOT_RUN |

Run ID / UTC timestamp: agy-port-20261106 / 2026-11-05T20:2xZ (worker fork; local date 2026-11-06)
Repository/worktree / branch: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` / `codex/agy-preservation-improvements`
Phase base / tested HEAD: `f5ae9aaae9e5f4bda8fdb5edeb6b8bbc12376035` (schema 19) plus this phase's uncommitted working tree
Phase result commit: none by the worker. The parent commits and records it.
Owner authorization: [OWNER-AUTHORIZATION.md](../OWNER-AUTHORIZATION.md), current starting prompt.
Inventory areas / prerequisites: 4, 5 / AGY-PORT 01 and 03 complete.
Decision record: [ADR-018](../../../decisions/ADR-018-reviewed-commands-revisions-receipts.md).

## Outcome in plain language

When a student asks Chat or Voice to add, change, delete, acknowledge, snooze or reschedule something, LAFINA no longer saves it straight away. It shows a review card that says:

- what it will do and to which item;
- any default it filled in, for example "No date was given, so it is due today" or "starts at 9:00 AM";
- any warning, for example that a past time gets no reminder.

Nothing is saved until the student taps **Confirm**. **Cancel** saves nothing.

Before writing, Confirm checks again that:

- the same account is signed in;
- the item has not been edited, synced or deleted since the card appeared;
- the card is less than 5 minutes old.

If any of these fail, it refuses and changes nothing. Tapping Confirm twice saves once.

When a name fits several items ("Delete physics"), LAFINA lists them and asks which one. It no longer guesses.

A reminder with no time asks "What time should I remind you?" instead of silently using 09:00.

Tasks with no date or with only a date are now kept as they are, without a reminder. Calendar has a new **Undated** button that lists open undated tasks 20 at a time, with **Mark done**.

What is unchanged:

- Ringing-call Answer, ACK and Snooze stay immediate and bound to that call.
- Manual Calendar and Notes forms save immediately.
- Schedule questions are answered at once.
- Online chat, the Handbook with citations, and document generation route exactly as before.
- Speech defaults (Whisper STT, `react-native-tts` with entitled online speech) are unchanged.

**Nothing here has run on a phone.**

## Intent coverage map

Source: `src/ai/nlu/intentRoutes.ts` (`INTENT_ROUTES: Record<ParsedIntentType, …>`, so a new intent type will not compile without a route). Test: "every intent type has exactly one route" in `agyPort04ReviewedCommands.test.ts`.

| Intent | Route outside a call | Route in a ringing call | Writes on Confirm | Target resolution / defaults | Tests |
|---|---|---|---|---|---|
| `create_task` | reviewed | reviewed | task. Also a reminder linked with `linkSource` when it has a date and time in the future | No date: undated, no reminder. Date only: no reminder. Time only: "due today" assumption shown | fast path (×2), model-sourced, atomic create, untimed, date-only, defaults, phase06/08 |
| `create_time_block` | reviewed | reviewed | time block only. As in AGY, the assistant adds no reminder to a block | Default date, 09:00 start and 60 min length shown as assumptions | fast path, defaults card (UI) |
| `create_reminder` | reviewed | reviewed | task and linked reminder (AGY shape) | No time or a past time: clarification. Lead is 0, so it rings at the due time, as in AGY | fast path, rollback/retry, no-time |
| `create_note` | reviewed | reviewed | note | Default title "Voice Note" shown | fast path, double confirm, phase08 |
| `update_task` | reviewed | reviewed | task (time/date/title/completion). Its linked and legacy same-title reminders get the new text and time; alarms are re-registered with the new title (follow-up 1) | Revision-bound target and reminders. Ambiguous: clarification | stale (manual and full sync pass), rename, rename+move, no-write |
| `update_time_block` | reviewed | reviewed | time block or event. Its reminders get the new text and shift by the same amount, keeping their lead time (follow-up 1) | same | rename+move with lead, no-write |
| `update_note` | reviewed | reviewed | note (rename / replace / `APPEND`) | same | no-write |
| `delete_task` | reviewed | reviewed | soft delete, plus its exactly linked reminders and legacy unlinked same-title reminders. The card lists each one, and Confirm refuses if the set changed (follow-up 4) | Ambiguous: clarification with candidates. "it/that": newest item, with the assumption shown | ambiguous, exact link, recent reference, guest link, delete card, phase08 |
| `delete_time_block` | reviewed | reviewed | time block or event | same | phase08 "Coffee Date"/event |
| `delete_note` | reviewed | reviewed | note | Missing target: clarification | missing target |
| `acknowledge` | reviewed | **immediate** (`acknowledgeReminderAction` with the call's generation) | that reminder only. **Never the task** | No reminder: says so and points to "mark it as done" | ACK≠completion, call immediate plus stale generation, task-only match |
| `snooze` | reviewed | **immediate** (`snoozeReminderAction` with the call's generation) | reminder snoozed (1–120 min, max-snooze checked) | Fenced on the delivery generation | bounds and fence |
| `reschedule` | reviewed | reviewed, targeted at exactly the ringing reminder | reminder trigger only. Status `triggered` returns to `pending` | Past time: clarification. Ambiguous: clarification | past/ok, ambiguous, in-call target |
| `query_schedule` | read-only, immediate (`executeNluAction`) | same | nothing | n/a | read-only test, phase06 speech |
| `chat` | conversation (online / Handbook / local fallback, unchanged) | same | nothing | n/a | RAG unchanged, phase08/phase10 |
| `out_of_scope` | conversation (unchanged) | same | nothing | n/a | routing table |
| document request (pre-intent) | unchanged (checked before intent routing) | same | unchanged | n/a | document route unchanged, phase09 |
| unknown value at runtime | conversation; `prepareReviewedCommand` returns `invalid` | same | nothing | n/a | unknown intent |

The `ringingCall` context is accepted by `chatOrchestrator.processMessage(..., { ringingCall })`, but no screen passes it yet:

- `IncomingCallScreen` keeps its own direct, already-fenced ACK/Snooze buttons and voice path (Phase 03), so ringing-call behaviour is unchanged.
- Chat and Voice opened outside a call get the reviewed route.

## Checklist and changes

| Requirement | Result | File/module | Reason / intentional behaviour change |
|---|---|---|---|
| Exhaustive typed routing table | implemented | `src/ai/nlu/intentRoutes.ts`, `chatOrchestrator.ts` step 5 | The document path and conflict check (step 4) run before routing, as before |
| Private, expiring, in-memory proposals with an operation ID, bound to owner/session/IDs/revisions/date-time/lead | implemented | `src/ai/nlu/commandReview.ts` | Five-minute TTL. Frozen proposal objects. One open proposal per owner and surface |
| Visible defaults; no silent today/09:00 | implemented | `commandReview.ts` builders, `CommandReviewCard` assumptions list | A reminder with no time now asks for one |
| Raw model JSON never becomes a command | implemented | `cleanIntent` re-validation | Real calendar dates 2000–2100, `HH:mm`, length caps, control characters stripped, extra keys ignored. Test: model-sourced intent |
| Cancel mutates nothing; Confirm rechecks then writes item + linked reminder + outbox + receipt atomically; repeated Confirm returns the same receipt | implemented | `confirmReviewedCommand`, `cancelReviewedCommand` | Alarm registration and cancellation run after commit |
| Stale / expired / other-owner refused | implemented | owner epoch, revision check, `assertFence` | Refusal is sticky. A non-refusal failure keeps the review retryable |
| Migration 20: local revisions for all writers, off the wire; receipt table | implemented | `src/storage/assistantOperationSchema.ts`, `assistantOperationStore.ts`, `dbInit.ts` | Side table, kept current by triggers. PF04 preservation suite unmodified and passing |
| Ambiguous destructive/reschedule targets: in-product clarification listing candidates | implemented | `resolveTarget`, `clarifyAmbiguous` | Up to 5 candidates. The score threshold and margin come from AGY's `scoreEntityMatch` |
| `linkSource` exact links replace title cleanup for reviewed creations/deletions; legacy title rule only without a link | implemented | `src/storage/sourceReminders.ts`, `tasksStore`, `timeBlocksStore`, `useScheduleItemModal.linkedElsewhere` | Unlinked reminders (all pre-phase data and manual-form reminders) keep AGY's same-owner, same-title rule |
| Untimed and date-only tasks; paged Undated view | implemented | `tasksStore.getUndatedTasksPage`, `UndatedTasksModal.tsx`, `CalendarScreen` | Keyset cursor `created_at\|id`, 20 per page. Only "Mark done" is offered in the tray; editing stays in the normal forms |
| Review UI in ChatScreen and VoiceModal with AGY tokens; never auto-confirm | implemented | `CommandReviewCard.tsx`, `useCommandReview.ts`, `ChatScreen.tsx`, `VoiceModal.tsx` | Unmount, timeout, background and double tap never confirm. Closing Voice cancels. Voice does not auto-close while a card waits |
| Manual saves and ringing-call ACK/Snooze immediate | preserved | `useScheduleItemModal`, `IncomingCallScreen` (untouched), `call_context_immediate` route | — |
| `executeNluAction` exported and working | preserved | `src/ai/nlu/index.ts` (explicit exports) | Still used for `query_schedule` and by the preservation suite |
| Optional `executor` on store writers | implemented | `remindersStore`, `notesStore`, `tasksStore.updateTask/updateEvent`, `timeBlocksStore.update` | Lets one `transactionSync` cover the item, reminder, outbox and receipt. Callers without an executor behave as before |

### Intentional behaviour changes (PF05)

1. Chat and Voice planner mutations need a Confirm tap. Three existing test files were updated for this, and only where they encoded the old direct write:
   - `__tests__/ai/phase08ChatAndOrchestrator.test.tsx`: note, task, force-schedule, "Coffee Date" cancel and event delete now go through prepare, then an assertion that nothing was written, then confirm. The task test expects 3 messages: user, review and outcome.
   - `__tests__/ai/phase06SttAndVoiceModal.test.tsx`: the note and task voice commands assert no insert, then press `voice-review-confirm`. They check the first argument because the reviewed write passes its transaction as a second one.
   - `__tests__/storage/schemaMigrations.test.ts`: the schema-17 → current added-tables list now includes the two schema-20 tables, plus a new schema-20 revision test.
2. "Acknowledge X" outside a call never marks a task done. AGY marked a matching task complete. ACK means the alert was received, not that the work is done.
3. A reviewed acknowledge stops exactly one reminder. AGY also acknowledged same-title duplicates. Call-path `acknowledgeReminderAction` is unchanged.
4. Tasks without a date or time are kept undated or date-only, with no reminder. AGY could give them today/09:00.
5. A reminder without a time asks for one.
6. Reschedule moves only the reminder, not the linked task.

## Provenance and compatibility

The donor is `LAFINA` at `0d4bbe39e106c29fb90792cf5d2f916b5c0d6480`, read with `git show` only. Only concepts were reused; no file was copied. Blob hashes are in `evidence/agy-port-20261106/phase-04/donor-provenance.txt`. `commandSchema.ts` does not exist at the pinned revision, and the donor's public `NluResult` schema was not imported.

Compatibility:

- **Schema.** The 19 → 20 step is additive: two tables, one index, sixteen triggers.
- **Sync, native, entitlements and speech.** The wire payloads are unchanged; there is no native or Android change, no entitlement change and no speech-default change. Kokoro is not present.

## Preserved AGY features

| PF ID | Baseline result | Current test/command | Actual result | Manual/live limitation |
|---|---|---|---|---|
| PF03 Guest linking | PASS | preservation PF03 (unmodified), new "guest linking during a review refuses it" | PASS | NOT_RUN on device |
| PF04 Sync wire | PASS | preservation PF04 (unmodified), schema-20 "stay off the wire" | PASS | Live sync NOT_RUN |
| PF05 Chat routing | PASS | preservation PF05 (unmodified), phase07, phase08 (updated: see intentional change 1), routing-table test | PASS with intentional review step | NOT_RUN on device |
| PF06 Handbook RAG | PASS | phase10, preservation PF06, new "online chat and Handbook RAG … no review" | PASS | Live backend NOT_RUN |
| PF07 Documents | PASS | phase09, preservation PF07, new "document requests … no review" | PASS | Live backend NOT_RUN |
| PF10 UI/navigation | PASS | phase01Theme, phase02Calendar, App.test, new `agyPort04ReviewUi` | PASS | Visual review on a phone NOT_RUN |
| PF11 Reminder calls | PASS | phase03, callDispatcher, `agyPort03Delivery`, call-context tests | PASS | NOT_RUN on device |
| PF12 Data/error recovery | PASS (after 01) | schemaMigrations (every-statement rollback now includes step 20), rollback/retry test | PASS | — |
| PF01, PF02, PF08, PF09, PF13 | PASS | full preflight | PASS (not touched) | NOT_RUN on device |

## Commands and evidence

| UTC / working directory | Exact command | Tested HEAD | Exit/result | Evidence path |
|---|---|---|---|---|
| 2026-11-05T20:2xZ / checkout root | `npx jest __tests__/ai/agyPort04ReviewedCommands.test.ts __tests__/ui/agyPort04ReviewUi.test.tsx __tests__/ai/phase06SttAndVoiceModal.test.tsx __tests__/ai/phase08ChatAndOrchestrator.test.tsx __tests__/storage/schemaMigrations.test.ts` | f5ae9aa + worktree | 0. 5 suites, 95 tests passed | `evidence/agy-port-20261106/phase-04/targeted-tests.log` |
| same | `npm run preflight` (typecheck, `eslint --max-warnings 0`, full Jest, architecture check) | f5ae9aa + worktree | 0. 24 suites, 366 tests passed. 194 modules, 0 cycles, 0 forbidden dependencies | `…/phase-04/preflight.log`, `preflight-exit.txt` |
| same | `npx jest <two new files> --verbose` (name list) | f5ae9aa + worktree | 49 tests listed, all ✓ | `…/phase-04/phase04-test-names.txt` |
| same | `git diff --stat`, `git status --short` | f5ae9aa + worktree | 18 tracked files changed | `…/phase-04/diff-stat.txt`, `git-status.txt` |

Counts: Phase 03 ended at 316 Jest tests. This phase adds 50 (42 + 7 + 1 schema test), giving 366. The two parent-owned files (`RUN-STATE.json`, `autonomous-run-log.md`) show up in `git status` and in the 18-file diff stat because of the parent's own edits. This worker did not touch them.

Along the way:

- A first preflight caught a typecheck error and a lint warning in the new files. Both were fixed, and they are not in the final run.
- The two new voice-confirm presses in phase06 are wrapped in `act`. The console "not wrapped in act" count is back to the Phase 03 level of 14. All 14 are pre-existing.

Not run:

- Prettier `--write` was run only on the new files. Pre-existing files were edited by hand and pass lint.
- No Gradle or native build was run because no native file changed.

## Native, performance and device facts

N/A for native: no Kotlin, C++, manifest or Gradle change. No APK was produced in this phase. No device was available, and performance was not measured.

## Review findings and decisions

There was no independent reviewer. I reviewed my own diff.

Decisions and remaining risks:

- **Sync staleness test.** The first pass used the sync worker's UPSERT statement shape. Follow-up 2 adds a full `runSyncPass` against a fake server.
- **Recent-reference tie.** "Delete it" picks the newest `created_at`. Two items created in the same millisecond tie, and either may be chosen. The card names the item and says it used the most recent one, so the student can still Cancel.
- **Process-local session.** Proposals live only in memory, so an app restart drops them; this is intended. Account changes are handled in follow-up 6.
- **Undated tray.** It offers only "Mark done". Editing an undated task still uses the existing forms.
- **Reviewed acknowledge with duplicates.** It no longer acknowledges same-title duplicates, which is intentional change 3.
- **Fast-path quirk (pre-existing, not changed).** "Add task submit essay on 2026-11-20" is parsed with time 11:00 taken from the date. The review card shows the 11:00 time, so the student can see it and Cancel. A parser fix belongs to a later phase.

## Manual checklist still needed

1. Install/open: NO ARTIFACT PRODUCED by this phase. Build the debug APK from this tree, install it, and open LAFINA as a guest.
2. Actions:
   1. **Chat review card.** In Chat, type "Add task review notes tomorrow at 3pm".
      - A card appears above the input with the action, the date and "rings at 3:00 PM".
      - Check that Calendar shows nothing new yet.
      - Tap **Cancel**. Chat says "Cancelled. Nothing was changed." and still nothing is added.
   2. **Confirm.** Repeat the request and tap **Confirm** quickly twice.
      - Exactly one task appears in Calendar.
      - Exactly one alarm rings at 3:00 PM tomorrow, or use a time 2 minutes ahead.
   3. **Visible defaults.** Type "Add study block for Algorithms". The card lists "No date was given…", "starts at 9:00 AM" and "lasts 1 hour" before you confirm.
   4. **No silent 09:00.** Type "Remind me to take medicine". LAFINA asks what time; nothing is saved.
   5. **Ambiguous target.** Create "Physics homework" and "Physics lab report", then type "Delete physics". LAFINA lists both and deletes nothing.
   6. **Stale review.** Type "Delete Physics homework" and leave the card open. Edit that task in Calendar, return to Chat, and tap **Confirm**. It is refused as changed; the task stays.
   7. **Expiry.** Leave a card open for more than 5 minutes. It shows "expired" with only **Dismiss**; nothing is saved.
   8. **Voice.** Open Voice and say or type "Add task: read chapter 5".
      - The card appears and the modal does not auto-close.
      - Close the modal. No task is added.
      - Repeat and Confirm. The reply is spoken, the modal closes, and the task is listed under Calendar → **Undated**.
   9. **Undated view.** In Calendar → **Undated**, tap **Mark done**. The task leaves the list.
   10. **Ringing call.** Let a reminder ring and tap **Acknowledge** on the call screen. It stops immediately with no card, and the linked task is **not** marked done.
   11. **Online routes.** Online and entitled, ask a Handbook question and request a PDF study guide. Both work as before, with no review card.
3. Expected records/UI/audio/notification and fallback:
   - The card uses the app theme in light and dark mode.
   - No change appears in Calendar or Notes until Confirm.
   - The alarm and call behave as in Phase 03.
   - If speech fails, the reply text still shows.
4. Current execution status: **all of the above NOT_RUN**. No phone or live backend was used in this run.

## Phase 05 API notes

- **Orchestrator.** `chatOrchestrator.processMessage(userId, text, { reviewSurface: 'chat' | 'voice', ringingCall?, ... })` returns `{ route, review?: PrepareResult, reply, ... }`.
  - `review.status` is `'proposal'` (with `proposal: CommandProposal`), `'clarify'` (with `candidates`) or `'invalid'`.
  - For non-proposal results only the reply is shown.
- **Hook.** `useCommandReview(userId, surface)` from `src/ui/hooks/useCommandReview.ts` returns `{ proposal, expired, busy, present(review), confirm({ speakReply? }), cancel({ silent? }), dismiss() }`.
  - It restores the open proposal for the owner and surface on mount.
  - `confirm` calls `chatOrchestrator.confirmReview(userId, opId, { speakReply })`, which returns `ReviewDecisionResult { outcome, assistantMessage, reply }`.
  - `cancel` calls `chatOrchestrator.cancelReview(userId, opId, { recordInChat })`.
- **Card.** `CommandReviewCard` takes `{ proposal, expired, busy, onConfirm, onCancel, onDismiss, testIDPrefix }`.
- **Phase 05 drafts.** The flow is draft text → `processMessage` (prepare) → `present(result.review)` → card → `confirm()` / `cancel()`. A draft must never call `confirmReviewedCommand` on its own. Unmount and close should call `cancel({ silent: true })`, as VoiceModal already does.
- **Lower level.** `prepareReviewedCommand`, `confirmReviewedCommand`, `cancelReviewedCommand`, `latestPendingReview(ownerId, surface)` and `endReviewSession()` from `src/ai/nlu`.

## Deferrals and continuation

- No UI passes `ringingCall` into Chat or Voice yet. The call screen keeps its own fenced buttons, so nothing regresses. If Phase 05 shares the microphone with a ringing call, wire `ringingCall` there.
- A parser fix for the "on YYYY-MM-DD" time quirk is left for a later phase.
- No broken experiment is active.

Next action: NEXT_PHASE (AGY-PORT 05), once the parent commits this phase. No human review pause under this pack's authorization.

## Review follow-up

The coordinator reviewed the first worker pass and reported one MEDIUM and five LOW findings. All six are fixed in the same uncommitted working tree. `RUN-STATE.json` and the run log were not touched.

| # | Finding | Fix | Files | Test |
|---|---|---|---|---|
| 1 MEDIUM | `update_task` renamed the task but its reminder kept the old `reminders.task`, and the alarm was registered with the old title | `planReminderChanges`, `verifyReminderChanges` and `applyReminderChanges`. In the same transaction, linked and legacy same-title reminders get the new `task` text (`remindersStore.updateReminderText` also drops the stale pre-recorded speech and enqueues the outbox update). After commit each alarm is re-registered with the new title. Each reminder is revision-checked at Confirm. The same applies to event and time-block updates, where the reminder shifts by the item's move and keeps its lead. `description` holds notes, never the title, in AGY, so it is not changed | `commandReview.ts`, `remindersStore.ts` | "renaming a task renames its linked and legacy reminders…", "renaming and moving a task…", "renaming and moving a time block … keeps its lead time" |
| 2 LOW | Revision triggers bumped on no-op upserts | Update triggers are now `AFTER UPDATE OF <tracked columns> WHEN OLD.c IS NOT NEW.c OR …`. `created_at`, `updated_at` and `precast_audio_path` are not tracked. Migration 20 was edited in place (still uncommitted) and still has one simple step | `assistantOperationSchema.ts` | full `runSyncPass` with a fake server: an identical echo keeps the review confirmable and the revision unchanged; a real change refuses it. schemaMigrations: an identical rewrite plus an `updated_at`-only touch leaves revision 1 |
| 3 LOW | Legacy reminder matching was case-sensitive | `legacyTitleKey`: trim, collapse inner spaces, lower case, scoped to the owner, empty title matches nothing. This is the base assistant/Calendar rule. AGY's store cascades compared exactly, so they now also catch case and spacing variants for the same owner. ADR-018 corrected | `sourceReminders.ts`, ADR-018 | "legacy reminder cleanup ignores case and spacing but stays within the owner" |
| 4 LOW | The delete card said "only its own reminders" even when the legacy title fallback applied | The card lists each reminder that goes with the item (title and time) and marks those with no link but the same title. With none, it says so. The card's reminder set is bound into the operation, and Confirm refuses as stale if it changed | `commandReview.ts` | "the delete card lists every reminder…, and a changed set refuses", "an item with no reminders says so…" |
| 5 LOW | `processAndExecuteIntent` still wrote without review | Marked `@deprecated`, test-only. No `src/` caller exists. `check-architecture.mjs` now fails on any `src/` reference outside `intentService.ts`, and on `executeNluAction` outside its module, the barrel, `intentService` and `chatOrchestrator`. Probe evidence: a temporary file gave exit 1 and its removal gave exit 0. Phase 07 tests keep using it as a regression harness | `intentService.ts`, `scripts/check-architecture.mjs` | "no product module calls the unreviewed end-to-end helper", `followup-architecture-guard-probe.log` |
| 6 LOW | `endReviewSession` was never called | `App.tsx` calls it whenever the active user changes (sign-in, sign-out, switch). The owner epoch now also includes `active_session.created_at`, so signing out and back in as the same account refuses a card prepared before the sign-out, even without App | `App.tsx`, `commandReview.ts` | "a card prepared before sign-out cannot be confirmed after signing back in", "App ends open reviews when the active account changes" (source check; App behaviour itself is not rendered here) |

Correction to the first pass: the coverage map said reviewed time blocks get a linked reminder. They do not, and never did in AGY. The row is fixed above.

### Follow-up commands and evidence

| Command | Tested HEAD | Result | Evidence |
|---|---|---|---|
| `npx jest` on agyPort04ReviewedCommands, agyPort04ReviewUi, phase06, phase07, phase08, schemaMigrations, agyPort03Delivery, agyPreservedContracts | f5ae9aa + worktree | exit 0. 8 suites, 206 tests passed | `evidence/agy-port-20261106/phase-04/followup-targeted-tests.log`, `followup-targeted-exit.txt` |
| `npm run preflight` | f5ae9aa + worktree | exit 0. 24 suites, 376 tests passed (366 + 10 new). Typecheck and lint clean. 194 modules, 0 cycles. Act warnings 14, all pre-existing | `followup-preflight.log`, `followup-preflight-exit.txt` |
| Architecture guard probe (temporary `src/zzGuardProbe.ts`, removed afterwards) | same | exit 1 with the probe, exit 0 after removal | `followup-architecture-guard-probe.log` |
| `git diff --stat`, `git status --short` | same | 22 tracked files changed (includes the parent's own edits to the two state files) | `followup-diff-stat.txt`, `followup-git-status.txt` |

New behaviour from these fixes:

- A reviewed rename changes the alert text of the item's reminders.
- A reviewed move of an event or time block moves its reminders and keeps their lead time.
- The store cascades now match same-title legacy reminders without regard to case or spacing.
- Signing out and back in ends any open review.

Device status is unchanged: NOT_RUN. Add to the manual checklist:

- Rename a task that has a reminder via Chat ("Rename task X to Y"), Confirm, then let it ring. The call shows and speaks "Y".
- Delete a task whose title matches an older manual reminder. The card lists both reminders before Confirm.
