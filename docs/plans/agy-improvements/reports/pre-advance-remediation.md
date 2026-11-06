# Pre-advance remediation — Phase 03 delivery gaps and title-based reminder ownership

Implementation: CODE_COMPLETE.

| Gate | Status |
|---|---|
| Automation (Jest, preflight) | PASS |
| Native unit tests and debug build | PASS |
| Instrumentation | NOT_RUN (no device) |
| Device | NOT_RUN |
| Live service | NOT_RUN (no cloud call in scope) |

| Item | Value |
|---|---|
| Run ID / UTC | agy-port-20261106 / 2026-11-06T02:4xZ–03:2xZ (resumed parent session, no subagent) |
| Repository/worktree / branch | `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` / `codex/agy-preservation-improvements` |
| Base / tested HEAD | `c36eec984a91457a8cfd75c0296a756b913508e8` plus the Phase 05 working tree and this remediation, uncommitted |
| Result commit | Recorded in RUN-STATE.json and the log (no self-referential SHA) |
| Owner authorization | [OWNER-AUTHORIZATION.md](../OWNER-AUTHORIZATION.md), plus the owner's resume prompt, which asked for items 1–3 before dependent work |
| Inventory areas | #2, #3 (AGY-PORT 03 follow-up), #4, #5 (AGY-PORT 04 follow-up) |
| Decision records | ADR-017 and ADR-018 addenda |

## Outcome in plain language

**1. A reminder can no longer ring twice, or ring after it was retired, because of the gaps Phase 03 documented.**

- **Double ring.**
  - Before the in-app fallback rings, it now asks Android for that exact reminder generation.
  - The Android alarm receiver takes the same entry under the same lock and remembers every claim. Whichever comes first wins; the other stays silent.
  - This closes the "native fired between the poller's listing and its dispatch" window.
- **Stale alert.**
  - Android cannot read SQLite. So when a writer retired or moved a reminder without cancelling its alarm (for example a sync upsert), Android could still ring it once while the app was closed.
  - Now the app reconciles Android's registrations whenever it leaves the foreground.
  - While it is open, the poller reconciles within one 15 s pass whenever this owner's delivery jobs change.

**2. A shared title alone no longer decides which item a reminder belongs to.** Before this change:

- Editing one "Study" task in Calendar deleted another "Study" task's reminder.
- A completed "Lab report" task, or yesterday's acknowledged "Lab report" reminder, silently acknowledged today's unrelated "Lab report" call.
- Acknowledging one reminder acknowledged every reminder with the same title.

Now:

- **Exact links.** New Calendar reminders get an exact link to their item, as reviewed assistant creations already did.
- **Older unlinked reminders** belong to an item only under a strict evidence rule. All of these must hold:
  - same owner;
  - same title, ignoring case and spacing;
  - scheduled at that item's own due date and minute, which is how AGY's form and assistant schedule them;
  - no other item qualifying.

  Anything else is a standalone reminder, and other items never touch it.
- **Promotion to an exact link.** When the student confirms a reviewed change that includes such a matched reminder, it gets an exact link before the move or rename can make the evidence stale.

**3. Lost evidence.** The two Phase 05 intermediate logs the worker deleted cannot be restored. Their surviving console excerpts are recorded in `evidence/agy-port-20261106/phase-05/deleted-intermediate-preflight-RECOVERED-EXCERPTS.md`. Every run since the resume is kept.

**Unchanged:**

- Call UI, speech (Whisper and `react-native-tts`, with entitled online speech), permissions, entitlements, sync payloads and schema.
- "Acknowledged is not completed".
- Nothing has been observed on a phone.

## Checklist and changes

| Requirement | Result | File/module | Reason / intentional behavior change |
|---|---|---|---|
| Close JS↔native double ring in the listing→dispatch gap | implemented | `LafinaDeliveryContract.kt` (`claimForeground`, claim markers), `LafinaReminderModule.kt` (`claimForegroundDelivery`), `deliveryReconciler.claimForegroundRing`, `reminderPoller` | Ring only on `claimed`. On a claim error JS stays silent (native remains the engine, the same rule as an unreadable listing). A build without the method behaves as before |
| A foreground claim makes the native broadcast inert | implemented | `claimForeground` removes the registry entry and cancels its PendingIntent | — |
| Native fired first → foreground refused | implemented | `claim()` now records a bounded per-reminder claim marker (256) | — |
| Stale registration while the app is closed | implemented | `App.tsx` (reconcile on `background`), `reconcileIfDeliveryChanged` + `deliveryStore.changeFingerprint`, poller | Each poll pass makes one fingerprint query, and reconciles only when it changed |
| Title-only ownership in the Calendar form (edit and delete) | replaced | `useScheduleItemModal.ts` | **Intentional:** only the item's own reminders are replaced or removed. New reminders are linked exactly, in one transaction |
| Title-only "task done" and "already acknowledged" suppression | replaced | `callAdmission.ts`, `callDispatcher.answerCall`, `reminderPoller` via `alertSuppression` | **Intentional:** suppression needs the reminder's own task, or the same alert |
| Title-only acknowledge siblings | replaced | `reminderActions.acknowledgeReminderAction` via `isSameAlert` | **Intentional:** other reminders of the same item are still acknowledged together, and title-only ones are not. Acknowledge never completes the task |
| Store cascades and the reviewed card (Phase 04) | tightened | `sourceReminders.remindersForSource` | **Intentional:** an unlinked reminder joins a delete, rename or move only under the evidence rule. The card wording now says "older reminder with no link, matched by its title and this item's time" |
| Confirmed evidence match becomes an exact link | implemented | `commandReview.applyReminderChanges` | Same transaction as the change; card text says so |
| Deleted Phase 05 logs | documented loss; excerpts recovered | `evidence/.../phase-05/deleted-intermediate-preflight-RECOVERED-EXCERPTS.md` | — |

### Not changed (honest scope)

- **Legacy executor.** `actionExecutor.cleanupMatchingReminders` and the title-based acknowledge lookup in `actionExecutor` still exist, but no product code reaches them:
  - After AGY-PORT 04, Chat and Voice mutations go through `commandReview`.
  - `chatOrchestrator` calls `executeNluAction` only for `read_only` routes.
  - The other caller, `intentService.processAndExecuteIntent`, is marked test-only, and `scripts/check-architecture.mjs` fails the build if product code references it.

  So these lines are kept only for the Phase 07 regression tests, and are not fixed here. Retiring them belongs with AGY-PORT 06, which owns the executor's read paths.
- **Exactly-once is still not guaranteed.** A crash between a native claim and `notify` loses that ring (receipt `fired` without `posted`). The listing remains as the first filter.
- **App killed before the background reconcile finishes.** The registration stays until the next start. JS admission still dismisses the call on open, but the ringtone may already have played. This window is now limited to the time it takes to kill the process, not the whole session.

## Provenance and compatibility

- **First-party code.** No donor code was copied. The strict evidence rule matches how AGY's own form (`useScheduleItemModal`) and assistant create reminders: `scheduledAt` is the item's local date and time.
- **No schema change.** Links use the existing local `reminder_delivery_jobs.source_type` and `source_id` columns. The native claim markers are a new key, `claims`, in the existing delivery state SharedPreferences, written with `commit()`.
- **No wire, sync, entitlement or speech-default change.** Links stay local (they are not synced), so on another device synced reminders use the evidence rule. No Kokoro.
- **Downgrade.** A build from before this change ignores the `claims` key and the links, and returns to title pairing.
- **ADRs.** The ADR-017 and ADR-018 addenda are dated 2026-11-06.

## Preserved AGY features

Every row uses the same command: full `npm run preflight` (28 suites / 418 tests), with the suites named in the "Current test" column.

| PF ID | Baseline | Current test | Result | Device/live |
|---|---|---|---|---|
| PF04 Seven-type sync | PASS | preservation PF04, `syncWorker` suites | PASS (payloads untouched) | NOT_RUN |
| PF05 Chat routing and reviews | PASS | agyPort04ReviewedCommands (53), agyPort04ReviewUi, agyPort05Drafts | PASS | NOT_RUN |
| PF10 UI (Calendar form) | PASS | phase02 screens, agyPortReminderOwnership (form create/edit/delete) | PASS | NOT_RUN |
| PF11 Reminder calls and identity | PASS | callDispatcherAndCallScreen (15), agyPort03Delivery (39), agyPortReminderOwnership, agyPort05CallBusyMic; Kotlin `LafinaDeliveryContractTest` 15 | PASS (host, fakes) | NOT_RUN: ringing, the lock-screen call, Doze, and kill during background |
| PF01–PF03, PF06–PF09, PF12, PF13 | PASS | full suite | PASS | NOT_RUN |

### Existing tests that changed, and why

All the changes below are intentional: they replace title-only fixtures with the evidence rule, and none weakens an assertion.

**`callDispatcherAndCallScreen`**

- "completing a task cancels and acknowledges all pending reminders for it" and "answerCall immediately suppresses call if task is already completed": the reminder is now scheduled at the task's own time, like the form does. The assertions are unchanged.
- Two new negative tests were added.

**`agyPort04ReviewedCommands`: five tests now seed form-style reminders (`seedItemReminder`)**

| Test | Change |
|---|---|
| "a reviewed delete removes only its exactly linked reminder…" | Renamed. Adds a title-only standalone reminder that must survive |
| "renaming a task renames its linked and legacy reminders…" | Asserts the confirmed match is now linked. Adds a title-only reminder that keeps its text |
| "renaming and moving a time block…" | New card wording. Asserts the link |
| "legacy reminder cleanup ignores case and spacing…" | The item now has a due time. Adds a same-title, other-time reminder that must survive |
| "the delete card lists every reminder…" | Adds a same-title reminder at another time that is never listed and survives |

- Card regexes follow the new wording.
- One new test: an ambiguous reminder belongs to neither item.

## Commands and evidence

Evidence directory: `evidence/agy-port-20261106/pre-advance-remediation/`. Nothing in it was deleted or overwritten.

| UTC / dir | Command | Tested HEAD | Result | Evidence |
|---|---|---|---|---|
| ~02:5xZ / checkout | `npx jest __tests__/scheduler __tests__/ai __tests__/storage __tests__/ui/agyPort04ReviewUi.test.tsx` | c36eec9 + worktree, before the test updates | **FAIL**: 7 of 320 failed. These were the title-only expectations listed above, then updated | session output only (no file; recorded here) |
| ~03:0xZ / checkout | Mutation T: the evidence rule accepts any title match | same | 11 tests fail as intended; file restored, `cmp` identical | `mutation-checks.log` |
| ~03:0xZ / checkout | Mutation C: `claimForegroundRing` ignores native | same | 1 test fails as intended; restored, `cmp` identical | `mutation-checks.log` |
| 2026-11-06T03:0xZ / checkout | `npm run preflight` | c36eec9 + worktree (final sources) | PASS, exit 0: typecheck, lint (0 warnings), 28 suites / 418 tests, architecture PASS (197 modules, 0 cycles, 0 forbidden imports) | `preflight-1.log` |
| 2026-11-06T03:03:35Z / `X:\android`, JDK 17 | `gradle-x.ps1 … :app:testDebugUnitTest :app:assembleDebug --console=plain` | same | PASS, `BUILD SUCCESSFUL`, exit 0. 43 Kotlin tests, 0 failures (38 before, plus 5 new claim tests) | `gradle-unit-assemble-1.log`, `kotlin-test-results/`, `apk-hashes.txt`, `gradle-x.ps1` (helper copy) |

Jest went from 405 to 418 tests, 13 new:

| Suite | New tests |
|---|---|
| agyPortReminderOwnership | 7 |
| agyPort03Delivery | 2 |
| callDispatcherAndCallScreen | 2 |
| agyPort04ReviewedCommands | 1 |
| agyPort05CallBusyMic | 1 (Phase 05 review fix R2) |

Repo-wide `format:check` still fails on files that were already unformatted before this run (Phase 00 baseline). Prettier was run only on the new test file.

## Native, performance and device facts

- **Debug APKs.** SHA-256 in `apk-hashes.txt`. Not installed anywhere.

  | APK | SHA-256 |
  |---|---|
  | arm64-v8a | `3bbccbd4624fd677dd46e03781788bd48665123854a21244e4d5467bdf424e46` |
  | x86_64 | `63fcd54c4265958ba492c0f03029582bab05533145a23b240984a0c1d1b53966` |
- **Host-only claim tests.** The claim race rules are pure-JVM tests of `DeliveryRegistryCore`. Real broadcast timing, process death and `commit()` durability on a phone are NOT_RUN.
- **Not measured:** the evidence rule's query cost. It runs three indexed-by-owner queries per unlinked candidate, and only for reminders whose title already matches.

## Review findings and decisions

Parent self-review of this diff; there was no separate reviewer agent.

Decisions:

1. **Strict evidence instead of a migration backfill.** It works the same on every device, including synced data, because links are local. An ambiguous match leaves the reminder alone instead of guessing.
2. **Identical duplicates.** Two standalone reminders with the same text and the same scheduled instant are treated as one alert, so acknowledging one acknowledges both. That is an exact duplicate, not a title guess.
3. **Claim error means silence.** If the claim fails, JS stays silent and native rings. The other choice risks the double ring this change closes.
4. **Background reconcile is best effort.** It is complemented by the change-driven reconcile while the app is open.

Remaining risks: see "Not changed" above.

## Manual checklist still needed

All items are NOT_RUN. Use an authorized test phone, synthetic data and a disposable account.

1. **Install** the debug APK `app-arm64-v8a-debug.apk` (hash above) over the previous debug build, with existing reminders.
2. **Two "Study" tasks.** Create task "Study" at 10:00 and another "Study" at 15:00 in Calendar. Edit the 10:00 one to 11:00.
   - Expected: the 15:00 task's reminder still rings at its time.
   - The 11:00 reminder rings once.
3. **Completed same-title task.** Complete a task "Lab report" due yesterday. Add a reminder "Lab report" for a few minutes from now.
   - Expected: it rings, and is not silently acknowledged.
4. **Double ring.** Make a reminder due in 2 minutes and keep the app open on Calendar.
   - Expected: exactly one call (native or in-app), never two.
   - Repeat with "Alarms & reminders" revoked, so JS is the fallback. Expected: one in-app call.
5. **Retired while closed.** Create a reminder due in 3 minutes. On another device signed into the same account, delete it and sync. On the test phone, open the app, let it sync, then press Home within 1 minute.
   - Expected: no call at the 3-minute mark.
6. **Older data.** Upgrade over a build with a form-created reminder. Rename its task through Chat: the card says "older reminder with no link, matched by its title and this item's time". After Confirm, rename it again in Calendar.
   - Expected: the reminder follows both renames.

## Deferrals and continuation

- **Legacy `actionExecutor` title cleanup:** AGY-PORT 06, the planner read-only and guide work, which owns `actionExecutor` read paths.
- **Device validation** of the items above.
- Next: AGY-PORT 06. Its dependency (04) and these remediations are committed. No experiment is left active, and both mutation edits were restored and verified with `cmp`.
