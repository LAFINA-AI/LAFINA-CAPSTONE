# AGY-PORT 09: reminder health, explicit event defaults and statistics

Implementation: CODE_COMPLETE

Automation: PASS. Build: PASS (native unchanged). Device: NOT_RUN. Live service: NOT_RUN.

Run ID / UTC timestamp: `agy-port-20261106`, 2026-11-06T05:0xZ–07:5xZ (the run paused for a usage-limit reset partway through)
Repository/worktree / branch: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` / `codex/agy-preservation-improvements`
Phase base / tested HEAD: base `9a451c1` (the AGY-PORT 08 result `7dd3454` plus its index commit) / tested `9a451c1+worktree`
Phase result commit: recorded in RUN-STATE.json and the run log after commit (no self-referential SHA)
Owner authorization: [OWNER-AUTHORIZATION.md](../OWNER-AUTHORIZATION.md), plus the owner's resume prompt of 2026-11-06.
Inventory areas / prerequisites: 15, 16, 20. Prerequisites 03 (`f5ae9aa`, with remediation R1 `541dbfb`), 04 (`c36eec9`) and 06 (`a077b10`) are committed.

## Outcome in plain language

**Profile → Notifications → Reminder Health** shows two separate things:

- **Android access:** notifications, exact alarms and full-screen calls. Each reads Allowed, Not allowed, or Unavailable when it could not be read.
- **Reminders on this device,** for the signed-in account only:
  - upcoming;
  - accepted by Android, and how many of those are inexact (may be late);
  - waiting to register;
  - registration failed;
  - held back (already done);
  - ringing now;
  - the 20 newest delivery records, as plain labels with no reminder text.

The sheet says plainly that access does not show that a reminder rang. It refreshes when it opens and again whenever the app returns from Android settings. Buttons open the notification, exact-alarm and full-screen settings.

**Retry reminder registration** asks the existing delivery reconciler to register the account's upcoming reminders again. It reports how many were registered, already in place, or failed, and ends with "This does not confirm that any reminder will ring." Retry is refused unless a signed-in session names this account, because a pass for any other account would cancel the signed-in account's alarms.

**Profile → Preferences → Event Defaults** holds an optional start time and/or length (15–480 minutes) for new events. Rules:

- The student types the values, taps **Review**, reads the summary and taps **Save these defaults**. Nothing is saved before that.
- An expiry is chosen: 30 days, 90 days or never.
- Offers can be turned off; the start time, the length or everything can be forgotten.
- A new event draft shows "Your saved defaults: …" with an **Apply** button. Apply changes the draft only, and the student still saves the event. A task draft, an edit, or defaults that changed since the draft opened get no offer, or are refused with "Saved defaults changed" and the draft is left alone.
- Nothing is learned from chats, notes or reminders. Saved events are never rewritten.

**Profile statistics** now count real records:

- **Tasks Done:** completed, not-deleted tasks.
- **Notes Saved:** not-deleted notes.
- **On Time:** replaces "Voice Uses", which counted voice-transcribed notes plus tasks whose notes contained the word "voice". It is defined below.

A failed read shows "—" on all three cards instead of zeros.

## Metric definition: On Time

```
On Time = reminders with status 'acknowledged' and snooze_count = 0
          ÷ reminders with status 'acknowledged' or 'missed'
```

The count is per owner, excludes deleted reminders, and is rounded to a whole percent.

- **No data:** shown when the denominator is 0. Pending, snoozed and ringing reminders are not outcomes yet.
- **Unavailable ("—"):** shown on any read failure.
- **Accessibility label:** "On-time reminders: N of M acknowledged without snoozing".
- **Acknowledged is not completed.** An acknowledged reminder is never counted as a completed task, and no keyword or flag is counted as a spoken command.
- **Known limitation:** AGY also marks a task's live reminders acknowledged when the task is completed (`tasksStore.updateTask`, pre-existing). An early completion therefore counts as on time. This matches the spec's suggested formula and is stated in the code comment.

## Local-only preference notes

- **Storage:** `local_settings`, key `event_memory_v1`, in the existing table. There is no new schema.
- **Format:** `{version:1, revision, enabled, value:{startTime, durationMinutes, expiresAt}, createdAt, updatedAt}`.
- **Never sent:** not in any of the seven sync payloads, never uploaded, and not read by the sync worker.
- **Writes:** every write runs in one transaction and checks the owner (the AGY-PORT 07 rule: a signed-in session naming someone else refuses) and the revision. A sheet holding an older revision cannot overwrite a newer save.
- **Reviews:** a review lives 5 minutes in memory, at most 16 at once. A new review for the same account replaces the old one.
- **Clock checks:** an offer is refused when the clock reads earlier than the last save, because expiry cannot be trusted then.
- **Corrupt rows:** malformed stored JSON is "unavailable", never treated as defaults.
- **Guest link:** an account that already has defaults on this device keeps them (`INSERT OR IGNORE`). Otherwise the guest's defaults move to it. The guest row keeps only a disabled revision fence, so an old guest review cannot bring them back for a later guest. This follows the donor's guest-migration logic.
- **Not covered:** Clear All Data does not clear event defaults. It is about scheduling records, and Forget does this. Another device, or a reinstall, starts with none.

## Checklist and changes

| Spec item | Done |
|---|---|
| 1. Owner-scoped health; permissions apart from evidence; refresh on return; bounded recovery; registration ≠ rang; reject stale owners | `src/storage/reminderHealthStore.ts`, `src/scheduler/reminderHealth.ts`, `src/ui/components/profile/ReminderHealth.tsx` |
| 2. Opt-in event defaults with review, Apply, correction, expiry, disable, Forget; guest link keeps destination | `src/storage/personalMemoryStore.ts`, `src/ui/components/profile/PersonalMemory.tsx`, `useScheduleItemModal.ts` / `types.ts` / `AddTaskEventModal.tsx`, `guestMigration.ts` (one call) |
| 3. Real counts; labeled outcome metric; No data; failure unavailable | `src/storage/profileStatisticsStore.ts`, `ProfileStats.tsx`, `ProfileScreen.tsx` |
| 4. Preserve hierarchy/theme, pro/account/subscription controls | Two `SettingItem` rows added inside the existing Preferences and Notifications groups; nothing removed or reordered |
| 5. Tests | 27 new tests in two suites (below), plus full gates |

Bounds:

- Permission read: 3 s.
- Recovery: 10 s. A timeout says "Still working. Refresh in a moment"; the serialized reconciler keeps running.
- Recent records: at most 20.

The sheet discards a result when a newer refresh started, the sheet closed, or the owner prop changed.

## Provenance and compatibility

Donor: LAFINA `0d4bbe39`. Blobs read:

- `reminderHealthStore` `2b49d511`
- `reminderHealth` `ef634098`
- `ReminderHealth.tsx` `5cd1421a`
- `personalMemoryStore` `472536a9`
- `PersonalMemory.tsx` `f7022cff`
- `profileStatisticsStore` `3171ee8c`
- `ProfileStats.tsx` `19852fd6`
- the donor tests

Adaptations:

- **Health.** The donor's columns (`delivery_state`, `delivery_reason`, state `pending`) do not exist in AGY's schema 19. Health is rewritten over AGY's `state` / `registration_state` / `registered_generation`, and over native `registered_inexact` receipts from `reminder_delivery_events`. The donor's native `reconcileDelivery` call is replaced by AGY's own `reconcileReminderDelivery(userId)`.
- **Owner rule.** The donor's strict check is relaxed for reads to AGY's rule. Recovery stays strict.
- **Event defaults.** The donor's store logic is kept, with typed errors, an optional expected revision, and blank-field normalization: forgetting the last remaining field clears the value. The draft offer allows overnight ends, per AGY-PORT 08. The donor's speech-engine key and study-tool guest moves are not copied.

Compatibility:

- No schema change and no sync payload change. The seven-type freeze test is unchanged.
- No native change.
- No backend call added. Only `reconcileReminderDelivery` and the existing permission and settings bridges are used.

## Preserved AGY features

| PF ID | Baseline result | Current test/command | Actual result | Manual/live limitation |
|---|---|---|---|---|
| PF01 Accounts/auth | PASS | preflight | PASS | Live NOT_RUN |
| PF02 Subscriptions/entitlements | PASS | preflight; Profile still shows the StudentPro tag path and all account rows | PASS | Live NOT_RUN |
| PF03 Guest linking | PASS | preflight; new guest-link defaults test | PASS | Device NOT_RUN |
| PF04 Sync | PASS | preflight (seven-type freeze unchanged) | PASS | Live NOT_RUN |
| PF06 Reminders/calls | PASS | preflight (AGY-PORT 03 suites unchanged); new health and recovery tests | PASS | Device alarms NOT_RUN |
| PF09 Speech/TTS settings | PASS | preflight; Profile test confirms Test TTS Voice | PASS | Device NOT_RUN |
| PF10 UI/navigation/settings | PASS | preflight (`phase01AuthAndProfileScreens` unchanged); new Profile test lists every existing row | PASS | Intentional: "Voice Uses" became "On Time"; two new rows |
| PF11 Calendar/planner | PASS | preflight (AGY-PORT 08 form suite unchanged); new offer tests | PASS | Intentional: Apply offer on new event drafts |
| PF12 Data/error recovery | PASS | preflight; unavailable statistics, health and defaults tests | PASS | Device NOT_RUN |
| PF05, PF07, PF08, PF13 | PASS | preflight (full suite) | PASS | Untouched |

## Commands and evidence

Evidence folder: `evidence/agy-port-20261106/phase-09/`.

| UTC / working directory | Exact command | Tested HEAD | Exit/result | Evidence path |
|---|---|---|---|---|
| ~07:3xZ / checkout | `npm run preflight` | 9a451c1+worktree | exit 0; 36 suites, 524 passed + 1 skipped; architecture PASS (212 modules, 0 cycles) | `preflight-1.log` |
| ~07:3xZ / `X:\android` | `gradle-x.ps1 … testDebugUnitTest assembleDebug` | 9a451c1+worktree | exit 0; BUILD SUCCESSFUL, 9 executed / 362 up-to-date; 0 `createBundle` lines (debug build bundles no JS) | `gradle-unit-assemble-1.log` |
| ~07:3xZ / checkout | `python mutate09.py` (run 1, then an unintended identical rerun) | 9a451c1+worktree | **harness error**: 0 tests matched (Jest reads a backslash path as a regex), so every row reads SURVIVED with `Tests: ?`; files restored | `mutation-checks.log` |
| ~07:4xZ / checkout | `python mutate09.py` (run 2, tests selected by basename) | 9a451c1+worktree | M2–M9 killed; **M1 survived**; test strengthened (see below) | `mutation-checks-2.log` |
| ~07:4xZ / checkout | `python mutate09.py` (run 3) | 9a451c1+worktree | M1–M9 all killed; all restored byte-identical (sha256) | `mutation-checks-3.log`, `mutate09.py` |
| ~07:4xZ / checkout | `node plans09.js query-plans.txt` | n/a | indexed except the recent-records read (see below) | `query-plans.txt`, `plans09.js` |
| ~07:4xZ / checkout | `npm run preflight` (final, after the strengthened test) | 9a451c1+worktree | exit 0; 36 suites, 524 passed + 1 skipped; architecture PASS | `preflight-2.log` |

**Evidence honesty.**

- `mutation-checks.log` holds the broken first harness. My first harness fix failed to apply, and the old script then ran again and overwrote that log with the same broken output. Both runs were the same harness on the same tree, so no different result was lost. The overwrite is recorded here.
- Runs 2 and 3 went to new files.
- The Gradle run overlapped the first mutation run. The debug build has no JS bundle task, so the temporary JS mutations could not reach it.

| Mutation | What it broke | Killed by |
|---|---|---|
| M1 | An inexact receipt from an older alarm time still counts | "counts a time change…" (after strengthening) |
| M2 | Health read ignores the signed-in owner | "refuses a read for an owner…" |
| M3 | Retry allowed without a signed-in session | "runs the existing reconciler only…" |
| M4 | Event defaults skip the revision check | "saves only after review…" |
| M5 | Guest link overwrites the account's defaults | "guest link keeps…" |
| M6 | Snoozed acknowledgements counted as on time | "counts actual records…" |
| M7 | A read failure is shown as zeros | "reports a read failure…" |
| M8 | Defaults offered on task drafts | "offers saved defaults on a new event draft…" |
| M9 | A stale offer is applied without revalidation | "refuses a stale offer…" |

**Counts:** 497 tests before this phase and 524 after: 27 new, none removed, no existing test changed.

## Native, performance and device facts

- **Native:** no Android file changed (`git diff --stat HEAD -- android` is empty). `assembleDebug` succeeded.
- **Query plans (node:sqlite 3.53.3):**
  - **Health aggregate:** searches `reminder_delivery_jobs` by owner, plus one indexed `idx_delivery_events_reminder` lookup per job.
  - **Statistics:** each count uses an owner index (`idx_tasks_user_due`, `idx_notes_user_sort`, `idx_reminders_user_trigger`).
  - **Defaults:** read by primary key.
  - **Recent records:** this read scans `reminder_delivery_events`, which the schema-19 trigger caps at 500 rows. No index was added, to keep this phase schema-free.
- **Timing:** none measured.
- **Device:** none used. Real permission values, the return-from-settings refresh, and Android's exact/inexact behaviour are NOT_RUN.

## Review findings and decisions

The parent self-reviewed the full Phase 09 diff on 2026-11-06. No independent reviewer was used.

1. **Mutation M1 survived run 2 (fixed).** The time-change test never re-registered the moved job, so the generation filter on inexact receipts went unexercised. The test now registers the new generation with only the old inexact receipt present, and M1 is killed.
2. **Recovery must not run for a non-signed-in owner.** `reconcileReminderDelivery(x)` cancels every other owner's registrations. Recovery therefore requires a session row naming exactly this owner, and checks it again after the pass.
3. **"Registered" is only acceptance.** No label, count or message says a reminder rang. A UI test asserts that the only on-screen mention of "rang" is the disclaimer.
4. **Remaining risks.**
   - The On Time limitation above (completing a task acknowledges its reminders).
   - The 3 s permission read may report Unavailable on a slow device.
   - Clear All Data leaves event defaults.

## Manual checklist still needed

1. **Install/open:** build the debug app from the Phase 09 commit and run it with Metro, signed in with a disposable account or as guest.
2. **Actions:**
   1. **Health:** open Profile → Reminder Health.
   2. **Exact alarms:** tap **Exact alarm access**, revoke it in Android settings, and return to the app. Grant it again and return.
   3. **Retry:** create a reminder 10 minutes ahead, open Reminder Health and tap **Retry reminder registration**.
   4. **Defaults:** open Profile → Event Defaults. Enter 18:30 and 90, choose 30 days, tap Review, then Save.
   5. **Apply:** open Calendar → new event and tap **Apply**. Then open a new task, and edit an existing event.
   6. **Forget:** in Event Defaults tap **Forget all event defaults**, then open a new event.
   7. **Statistics:** complete a task, let one reminder ring and acknowledge it, and snooze another before acknowledging. Return to Profile.
3. **Expected:**
   1. **Health:** three access rows and the counts; the disclaimer is visible.
   2. **Exact alarms:** the Exact alarms row flips to Not allowed and back without reopening the sheet.
   3. **Retry:** the message says how many were registered and that ringing is not confirmed. "Accepted by Android" includes the reminder, and "inexact" is nonzero only when exact alarms are off.
   4. **Defaults:** the summary appears before saving. Profile shows Event Defaults "On".
   5. **Apply:** the new event's draft becomes 6:30 PM–8:00 PM and nothing is saved until Save. The task and the edit show no offer.
   6. **Forget:** no offer appears.
   7. **Statistics:** Tasks Done increases by one, and acknowledging does not change it. On Time shows 50% (1 of 2).
4. **Current execution status:** NOT_RUN. No device was used. This is MANUAL-QA M13.

## Deferrals and continuation

- **Not done here:**
  - An index for the recent-records read (bounded at 500 rows).
  - Clearing event defaults from Clear All Data.
  - A cross-device copy of event defaults, deliberately local.
- **DEFERRED_EXTERNAL:** none new.
- **Continuation:** NEXT_PHASE (AGY-PORT 10) under the owner's unattended authorization.
