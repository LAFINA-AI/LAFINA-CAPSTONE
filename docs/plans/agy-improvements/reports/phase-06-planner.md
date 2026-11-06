# AGY-PORT 06: bounded planner reads and factual replies

Implementation: CODE_COMPLETE

Automation: PASS. Build: PASS (native unchanged; see below). Device: NOT_RUN. Live service: NOT_RUN.

Run ID / UTC timestamp: `agy-port-20261106`, 2026-11-06T03:0xZ–03:45Z
Repository/worktree / branch: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` / `codex/agy-preservation-improvements`
Phase base / tested HEAD: base `28a9867dbdc4220952dca0361d2b42f99af46d83` / tested `28a9867+worktree`
Phase result commit: recorded in RUN-STATE.json and the run log after commit (no self-referential SHA)
Owner authorization: [OWNER-AUTHORIZATION.md](../OWNER-AUTHORIZATION.md), plus the owner's resume prompt of 2026-11-06.
Inventory areas / prerequisites: 10 and 11. Prerequisite AGY-PORT 04 is committed (`c36eec9`). The pre-advance remediation for the Phase 03 gaps and title-only ownership is committed (`541dbfb`).

## Outcome in plain language

Calendar and the schedule answers in Chat no longer read a student's whole history.

- **Calendar:** Day, Week and Month ask SQLite only for the dates on screen. Recurring tasks, events and study blocks are expanded into that window, with the same rule and occurrence IDs Calendar always used. Layers, categories, holidays, week start and time format are unchanged.
- **Overdue strip:** shows at most 100 overdue tasks, oldest first, then "+N more" with the exact count. It used to read every task on every render.
- **Undated tasks:** stay in the paged "no date" list added in AGY-PORT 04.
- **Calendar export:** still exports every owned item, now read in batches of 500.

The Chat answer to "What's on my schedule …?" now comes from one bounded read of that day.

- It now includes recurring items. It used to miss them.
- If storage cannot be read, Chat says so. It used to report a clear day.
- When asked to schedule a study block, the conflict check reads the target day once, so recurring items count as conflicts too.

Online AI, the USTP Handbook and document generation take the same routes as before. Tests pin this.

A new **"What you can ask"** guide (lightbulb in the Chat header) lists seven example commands.

- All seven are tested against AGY's parser and review contract.
- Choosing one only puts it in the message box. If unsent text is there, the student chooses Keep (the default) or Replace. Nothing is sent, saved or confirmed.
- The four existing starter chips are unchanged, and still send when tapped. So are the Online, Handbook, document format and recorder controls.

While characterizing the Calendar form, three existing bugs turned up. All three are fixed:

- Editing an item opened from a chip, such as an overdue task, used the selected day for its reminder, and for an event, as its date. It now keeps the item's own date.
- Saving an item whose time had already passed rang a call one second later. It now creates no call.
- Editing a task with no date could create a reminder. It now removes the task's old reminders and creates none.

Incomplete: other full reads remain, listed under "Deferrals". Nothing here has run on a phone.

## Checklist and changes

| Requirement | Result | File/module | Reason / intentional behavior change |
|---|---|---|---|
| 1. Typed bounded query service, injectable executor | implemented | `src/storage/plannerQueries.ts` | `createPlannerQueries(executor)` provides `window`, `overdueTasks` and `exportAll`, each scoped by owner. Errors are thrown, not swallowed. There is no clock inside: callers pass dates. Row mappers are exported from `tasksStore` and `timeBlocksStore` and are unchanged. |
| 1. Recurrence, backlog, completed, undated | implemented | same | Fixed rows: `date BETWEEN`. Recurring rows: rule present and base date ≤ end, expanded with `getOccurrences`. Completed dated tasks are in windows, as Calendar showed them. The overdue backlog has open tasks only. Undated (`NULL` or `''`) tasks are never in a window or overdue. |
| 2. Calendar visible window | implemented | `src/ui/screens/calendar/hooks/useCalendarData.ts` | `loadBlocks` and `loadScheduleData` read `getViewRange()`, the range Calendar already used for recurrence. Layer visibility filters on the base ID, so occurrences of imported series follow their layer. |
| 2. Overdue bounded | implemented, intentional change | `useCalendarData.ts`, `components/WeekView.tsx` | At most 100 chips plus "+N more" (`calendar-overdue-more`). Loaded with the schedule, not on every render. |
| 2. Paged untimed tasks | existing (AGY-PORT 04) | `components/UndatedTasksModal.tsx`, `tasksStore.getUndatedTasksPage` | Reused. A duplicate strip and query drafted in this phase were removed in self-review. |
| 2. Full export in bounded batches | implemented | `plannerQueries.exportAll`, `handleExportCalendar` | Keyset by `id`, 500 per read. |
| 3. Factual replies | implemented | `src/ai/nlu/actionExecutor.ts` (`query_schedule`) | One `window(day, day)` read, including recurring items. A storage failure returns `success:false`, `error:'storage_unavailable'` and a truthful reply. |
| 3. Conflict check | implemented, intentional change | `src/ai/chatOrchestrator.ts` | `checkScheduleConflict` and `recommendAvailableSlot` read one bounded day, once per request. That used to be up to 48 full reads. Recurring blocks and events now conflict. If storage fails, there is no conflict hint, as with the legacy getters, and the change still waits for Confirm. |
| 3. Online/RAG/document paths intact | existing, tested | `chatOrchestrator.ts` (unchanged routes) | New tests: a general Online question goes to `onlineChatSkill` with the Handbook flag; a schedule question in Online mode stays local; a document request goes to `documentSkill.generate`. |
| 4. Guide with tested examples; draft only | implemented | `src/ai/nlu/commandGuide.ts`, `src/ui/components/chat/CommandGuide.tsx`, `src/ui/screens/ChatScreen.tsx` | Seven examples pinned by tests. Selection calls `useDraftProtection.offerText`, so Keep is the default and nothing is sent. Starter chips are preserved, and their send-on-tap behavior is unchanged. |
| Form fixes (found in characterization) | implemented, intentional change | `src/ui/screens/calendar/hooks/useScheduleItemModal.ts` | Own date on edit, no call for past times, and no reminder for undated task edits. |
| 5. Synthetic large collections | implemented | `__tests__/storage/agyPort06PlannerQueries.test.ts` | 2 owners × 1,500 dated tasks, events and blocks, plus 300 undated per owner, compared with the legacy full-read algorithm over 4 windows. |
| 5. Stable cursors at equal times, no cross-owner reads | implemented | same | 100 undated tasks share one `created_at`; paging returns each exactly once. A cursor from one owner never shows another owner's rows. |
| 5. Online/document/RAG + Calendar interactions | implemented | `__tests__/ai/agyPort06PlannerReplies.test.tsx` | 18 tests: replies, guide, routes, Chat UI and Calendar UI. |

## Provenance and compatibility

- **`CommandGuide.tsx`** is adapted from LAFINA `src/ui/components/CommandGuide.tsx`. Donor commit `7bdef5d0a616c7aef9898782f009aee639c592b3`, blob `1e06bf35ea4ba21282b6375fc7150c3747015eb9`, read only.
  - Kept: the sheet shape, the "never sends" rule and the example/explanation rows.
  - Rewritten: AGY's `ToolSheet`, theme tokens and test IDs. The example phrasings come from AGY's parser rather than the donor's, which uses quoted titles AGY does not need.
  - Dropped: the donor's `plannerConversation` module, its free-time/ML/semester features and its full-reply text.
- **`plannerQueries.ts`** is written against AGY's own schema and indexes. No donor source was copied.
- **Schema, sync and native:** no change. There is no new migration, index, outbox entity or wire field. The guide and queries add no network calls and no entitlement checks.

## Preserved AGY features

| PF ID | Baseline result | Current test/command | Actual result | Manual/live limitation |
|---|---|---|---|---|
| PF04 Sync | PASS (preservation PF04) | `npm run preflight` (full suite) | PASS | No outbox or payload change; live sync NOT_RUN |
| PF05 Offline/online Chat routing | PASS (PF05, phase07, phase08) | preflight; `agyPort06PlannerReplies` routes | PASS | Intentional: schedule replies include recurring items; storage failure is reported. Live backend NOT_RUN |
| PF06 Handbook RAG | PASS (phase10, PF06) | preflight; new Handbook-flag route test | PASS | Live RAG NOT_RUN |
| PF07 Documents | PASS (phase09, PF07) | preflight; new document route test | PASS | Live generation NOT_RUN |
| PF10 UI/navigation/settings | PASS (phase01, phase02 screens, App) | preflight; new Chat guide and Calendar UI tests | PASS | Intentional: new guide button; overdue "+N more"; form keeps the item's own date. Device NOT_RUN |
| PF11 Reminder calls | PASS (phase03, call tests, PF11) | preflight | PASS | Intentional: no call for a time already past. Device NOT_RUN |
| PF12 Data/error recovery | PASS | preflight; storage-failure tests | PASS | Calendar still shows an empty range on a read failure (logged), like the legacy getters |
| PF01–PF03, PF08, PF09, PF13 | PASS | preflight (full suite) | PASS | Untouched by this phase |

No existing test was modified or removed in this phase.

## Commands and evidence

All in `evidence/agy-port-20261106/phase-06/`. Every run is kept, including the failure.

| UTC / working directory | Exact command | Tested HEAD | Exit/result | Evidence path |
|---|---|---|---|---|
| 03:30–03:32Z / checkout | mutations M1–M4 with `npx jest` on both new suites, each followed by restore and `cmp` | 28a9867+worktree | each mutation fails ≥1 test; all restored byte-identical | `mutation-checks.log` |
| 03:33Z / checkout | `AGY_MEASURE=1 npx jest __tests__/storage/agyPort06PlannerQueries.test.ts -t "host fixture timing"` | 28a9867+worktree | exit 0 | `host-timing-1.log` |
| 03:34Z / checkout | `npm run preflight` | 28a9867+worktree | **exit 1**: lint `no-unused-vars` (`TODAY` in the new test) | `preflight-1.log` |
| 03:35Z / checkout | `npm run preflight` (after removing it and running Prettier on the 4 new files) | 28a9867+worktree | exit 0; 30 suites, 445 passed + 1 skipped; architecture PASS (200 modules) | `preflight-2.log` |
| 03:36Z / `X:\android` (subst alias) | `gradle-x.ps1 … testDebugUnitTest assembleDebug` | 28a9867+worktree | exit 0; BUILD SUCCESSFUL | `gradle-unit-assemble-1.log`, `apk-hashes.txt` |
| 03:38Z / checkout | `npm run preflight` (after the conflict-check change and its test) | 28a9867+worktree | exit 0; 30 suites, 446 passed + 1 skipped; architecture PASS | `preflight-3.log` |
| 03:40Z / checkout | temporary Jest probe that prints `EXPLAIN QUERY PLAN` for every statement; probe deleted after the run | 28a9867+worktree | output kept | `query-plans.txt` |

Mutations (the log keeps counts only; the per-test failure marker did not match the capture `grep`):

| Mutation | What it broke | Result |
|---|---|---|
| M1 | Removed the own-date and past-call guards | 1 failed |
| M2 | Storage failure reported as an empty day | 1 failed |
| M3 | Choosing a guide example sends it | 2 failed |
| M4 | Fixed tasks not bounded by the window dates | 3 failed |

Suite counts went from 418 (pre-advance remediation) to 446 passed and 1 skipped. That is 28 new tests plus 1 opt-in timing test, and no baseline failure.

## Native, performance and device facts

- **Native:** no Kotlin, C++, manifest or Gradle file changed in this phase (`git diff --stat HEAD -- android` is empty).
  - Gradle marked `:app:testDebugUnitTest` **UP-TO-DATE**, so the Kotlin results are the 43/43 from the remediation run's execution, with no failures. They were not re-executed.
  - `assembleDebug` succeeded.
  - The debug APKs are byte-identical to the remediation build (arm64 `3bbccbd4…`, x86_64 `63fcd54c…`). The debug variant loads JavaScript from Metro, so these APKs contain none of Phase 06's code.
- **Query plans** (`query-plans.txt`):
  - Every statement searches an owner index: `idx_tasks_user_due`, `idx_events_user_date` or `idx_time_blocks_user_date`. None is a full table scan.
  - Window rows are range searches on (owner, date).
  - Recurring-row selection uses only the owner prefix (tasks) or owner + `date < end` (events and blocks). SQLite therefore visits those index entries and filters on `recurrence_rule` inside SQLite; it does not load them into JavaScript. No new index was added, because that needs a migration (see Deferrals).
  - The sorts use small temporary B-trees over the bounded results.
- **Host fixture timing:** one run, 20 repetitions each (export: 3), Jest + Node `node:sqlite` on the development PC. It is **not** phone, UI or inference performance. Data: 2 owners × 10,000 tasks, 10,000 events and 10,000 blocks.

| Read | Mean (ms) |
|---|---|
| Week window | 12.2 |
| Month window | 28.0 |
| Legacy full read + JS filter, same week | 181.9 |
| Overdue (100 + count) | 4.1 |
| Full export, batches of 500 | 819.4 |

  - Export is slow on purpose: it is explicit and rare. Each batch re-sorts the owner's rows by `id`.
  - Recorded as `AGY_PORT_06_TIMING` in `host-timing-1.log`. No p50/p95 (means only).
- **Device:** none used. Nothing about Calendar rendering, Chat or calls was observed on a phone.

## Review findings and decisions

The parent self-reviewed the full Phase 06 diff on 2026-11-06. No independent reviewer was used.

1. **Duplicate undated paging (fixed).** The first draft added a "NO DATE" strip and `plannerQueries.undatedTasks`. AGY-PORT 04 had already shipped `UndatedTasksModal` and `getUndatedTasksPage`. The duplicate was removed and the existing one is now tested for equal timestamps and owner isolation.
2. **Empty-string due dates (fixed).** `due_date = ''` sorts before every date, so the overdue query would have counted such tasks as overdue. The legacy filter excluded them. Fixed, and tested.
3. **Conflict check read amplification (fixed).** `recommendAvailableSlot` made up to 24 conflict checks, each doing 2 full reads. It now reads the day once; the test asserts exactly one window read.
4. **Event edit moved events (fixed, intentional).** Editing an event saved `date: selectedDate`. Opening an event from another day and saving moved it. The form now keeps the item's own date.
5. **Verified unchanged.**
   - Calendar reload triggers (selected date, month, owner, refresh, layers) all feed `getViewRange`.
   - The Month grid only draws days of the current month, inside the window (prior 15th to the 15th two months ahead).
   - The Week pills draw no item dots, so ±3 days covers the visible day.
6. **Remaining risk.** If the window read fails, Calendar logs it and shows an empty range, as the legacy getters did. That is not a truthful on-screen message. Deferred; see below.

## Manual checklist still needed

1. Install/open: build a fresh debug APK from the Phase 06 commit and run it with Metro. The recorded APK hashes do not contain Phase 06 JavaScript. Alternatively, use a release bundle.
2. Actions:
   - Create a weekly study block starting last week, then open Week and Month views for today and next week.
   - Ask Chat "What's on my schedule tomorrow?" with a weekly item tomorrow.
   - Create more than 100 overdue tasks (or seed them), then open Week view.
   - Open the lightbulb, choose an example with the message box empty, then again with your own text typed.
   - Open an overdue task chip and tap Save.
   - Toggle Online and ask a Handbook question.
3. Expected:
   - The weekly block appears on each matching day.
   - The Chat reply names the weekly item.
   - Week view shows "+N more" after 100 chips.
   - An example fills the box without sending. With your text present, Keep and Replace are offered, and Keep leaves your text.
   - Saving the overdue task leaves its date and does not ring.
   - Online answers keep their citations.
4. Current execution status: NOT_RUN. No device or live backend was used.

## Deferrals and continuation

- **Other full reads remain outside this phase's acceptance.**
  - Target matching for reviewed changes: `commandReview` and the legacy `actionExecutor` update/delete paths, which need title search over owned items.
  - Profile statistics: `ProfileScreen`, which Phase 09 owns.
  - Notes: `useNotesData`.
  - Bounding the change-target search needs SQL title matching without weakening the AGY-PORT 04 clarification rules. Smallest safe unit: a later phase (09 or 12).
- **Recurring-row selection has no index.** A partial index on `recurrence_rule` needs a schema migration and a sync compatibility review. That belongs with AGY-PORT 08 (event time and sync compatibility).
- **Calendar read failure feedback.** An on-screen "couldn't load" state for the window read is not built. PF12 behavior is unchanged from baseline.
- **Starter chips send on tap.** This is existing AGY behavior and was kept as required ("preserve any existing starter prompts"). Only the new guide examples are draft-only.

Next action: NEXT_PHASE, AGY-PORT 07. No human review pause under this pack's authorization.
