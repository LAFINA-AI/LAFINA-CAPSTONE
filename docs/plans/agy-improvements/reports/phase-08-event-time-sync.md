# AGY-PORT 08: overnight/timezone metadata with compatible sync

Implementation: CODE_COMPLETE

Automation: PASS. Build: PASS (native unchanged). Device: NOT_RUN. Live service: NOT_RUN.

Run ID / UTC timestamp: `agy-port-20261106`, 2026-11-06T04:3xZ–04:5xZ
Repository/worktree / branch: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` / `codex/agy-preservation-improvements`
Phase base / tested HEAD: base `02bbe44` (the AGY-PORT 07 result `168e022` plus its index commit) / tested `02bbe44+worktree`
Phase result commit: recorded in RUN-STATE.json and the run log after commit (no self-referential SHA)
Owner authorization: [OWNER-AUTHORIZATION.md](../OWNER-AUTHORIZATION.md), plus the owner's resume prompt of 2026-11-06.
Inventory areas / prerequisites: 14, and the client side of 29. Prerequisites 01 (`8ab83b2`), 03 (`f5ae9aa`, with its stale-alert gaps closed by remediation R1 `541dbfb`) and 06 (`a077b10`) are committed.

## Outcome in plain language

**Overnight events work everywhere, on the sync format AGY already uses.**
- **Form:** the Calendar form now accepts an end before the start, for example 11 pm to 1 am, and says "Ends the next day (date)".
- **Calendar:** the event fills the end of its day and the top of the next, labelled "next day".
- **Conflicts:** chat conflict checks now see an overnight event from the day before, and an overnight proposal that runs into the next day.
- **Reviews:** reviewed moves say "Ends the next day, …".
- **ICS export:** writes the end on the next date, where it used to write an end before the start.
- **Sync:** nothing new is sent. Every AGY device already reads an end before the start as overnight.

**This device now remembers which timezone an event was saved in. Nothing new is synced.**
- **What is kept:** the timezone, the exact UTC start and end, and an earlier/later choice for a time that happens twice. They are kept in a local table and never sent.
- **Different timezone:** if the phone is now in another timezone, Calendar names the saved one ("· Asia/Manila"). Editing such an event says the saved timezone is on this device only and that a changed time is saved in the current one.
- **Changes elsewhere:** if another device changes the event's time, or the event is deleted, the local timezone is dropped. The event is then floating again, exactly as other devices see it. A rename elsewhere keeps it.

**No time is invented or moved.**
- **Form refusals:**
  - an equal start and end;
  - a time the clocks skip (a daylight-saving gap), which used to shift the reminder by an hour.
- **Repeated time:** the form asks **Earlier** or **Later**, and the reminder rings at the chosen instant.
- **ICS import.**
  - Skipped and counted, with the prompt saying how many: invalid dates (which used to become today), ends before starts, spans over a day, and skipped `TZID` times.
  - Converted exactly into this device's timezone: UTC and `TZID` times. A UTC time used to be read as a wall time, eight hours off in Manila.

**Unchanged:**
- Existing events and their meaning.
- The seven-type sync requests, and every endpoint.
- Recurring events and their reminders.
- Time blocks, apart from the export end date and the import checks.
- Text-only operation when timezone data is unavailable.

## Checklist and changes

| Requirement | Result | File/module | Reason / intentional behavior change |
|---|---|---|---|
| 1. Characterize floating, recurring, same-day ordering, overnight, wire | done | report and tests | Layout and fast path already used "end ≤ start means next day". The form refused it, the conflict check skipped it and ICS exported it wrongly. Wire: seven fields per event. |
| 1. Additive local end date/zone/instant/ambiguity, old rows unchanged | implemented | `src/storage/eventTime.ts`, `eventTimeSchema.ts` (schema 22), `eventTimeStore.ts` | The end date is derived from the wall times. Zone, instants and folds live in `event_time_local`. Legacy rows get no row. |
| 2. Form/edit/review/queries/layout/recurrence/alarms/ICS together | implemented, intentional change | `useScheduleItemModal.ts`, `AddTaskEventModal.tsx`, `commandReview.ts`, `plannerQueries.ts`, `timeGridLayout.ts`, `chatOrchestrator.ts`, `icsHelper.ts`, `calendarImportPersistence.ts`, `useCalendarData.ts` | See Outcome. The linked alarm uses the resolved instant from the form. Reviewed moves keep their existing reminder shift, and metadata is recorded on the moved event. Recurring occurrences keep the zone but not the base date's instants. |
| 2. Tests: overnight/month/year, invalid dates, gaps, folds, zone change, round trip | implemented | `__tests__/storage/agyPort08EventTime.test.ts` (21), `__tests__/ui/agyPort08EventForm.test.tsx` (5) | Explicit IANA zones (Asia/Manila, America/New_York), so the cases hold on any host. |
| 2. "Yesterday interpretation" | covered as conflict and layout of the previous day's overnight span | same | There is no NLU grammar change. The phase spec forbids prompt or model JSON changes beyond scope. |
| 3. Freeze the seven-type request schemas; new fields local-only | done | no change to `syncWorker.ts` or the payload builders | Tests assert the exact seven event keys for create, update, guest re-create and reviewed move. `agyPreservedContracts` still freezes all seven types unchanged. |
| 4. Omission-aware pull; changed timing invalidates; no false instant | implemented | triggers and `VALID_EVENT_TIME_JOIN` | A title-only pull keeps the metadata. A time change or remote delete drops it, and the event reverts to floating. There are no explicit-null semantics, because no server is evidenced to send them. |
| 4. Account switch, guest link, revisions/jobs, remote delete | tested | `agyPort08EventTime.test.ts` | Owner-scoped reads. The guest link moves the row with the event. Metadata adds no revision or outbox row. Delivery jobs are unaffected because metadata is not an input to them, and the AGY-PORT 03 suites pass unchanged. |
| 5. Fake old-server round trip | tested | `agyPort08EventTime.test.ts` (real `runSyncPass`) | The fake server rejects any unknown event field. Everything is accepted, and nothing is left pending. |
| 6. Fall back where unsafe | applied | ADR-021 | Cross-device zone retention when another device changes the time is not possible on the frozen wire; the event becomes floating. Events longer than 24 h are deferred. |

**Intentional test updates:**
- **`schemaMigrations`:** the added-table list includes `event_time_local`, which must be empty after a schema-17 upgrade.
- **`agyPort06PlannerQueries`:** the plan copy includes `event_time_local`, and the no-scan check also covers the `t`/`m` aliases.
- **`agyPort06PlannerReplies`:** the conflict check now reads one window from the day before to the day after, and the "read once" assertion is kept.

## Provenance and compatibility

- **Donors** (LAFINA `0d4bbe39e106c29fb90792cf5d2f916b5c0d6480`, read only, design reference):
  - `src/storage/eventTime.ts` (blob `bf62db10`): zone conversion adapted.
  - `eventTimeSchema.ts` (`3deee0ee`)
  - `icsHelper.ts` (`1a467a8a`)
  - `ADR-004` (`ace75823`)
  - backend `event_payload.py` (`4b6206b9`) and `test_event_time_contract_isolated.py` (`0f8d7595`), as contract reference only.
- **Not adopted:**
  - the donor's six synced `events` columns;
  - its wire fields;
  - its backend merge, which is DEFERRED_EXTERNAL.
- **Adapted:**
  - **Storage:** a side table, invalidated by triggers, replaces new columns.
  - **End date:** derived from the frozen wire convention (≤ 24 h), not stored.
  - **Folds:** kept only where a time really repeats.
  - **Engine self-check:** if formatting is off, metadata is off, so the form never refuses a valid time.
  - **ICS UTC detection:** read from the file text. The parser appends `Z` to floating values; mutation M4 proves this matters.
- **Schema 22** is additive (one table, one index, three triggers) and runs in the single upgrade transaction (ADR-016). There is no outbox, payload or endpoint change. See [ADR-021](../../../decisions/ADR-021-event-time-local-metadata.md).

**Local-only metadata (exact):** `time_zone`, `start_at`, `end_at`, `start_fold` and `end_fold` in `event_time_local`. The overnight end is not local-only: it is the existing wire convention.

**Cross-device limitation:** other devices, and this device after reinstalling and syncing, see the event as floating wall time.

## Preserved AGY features

| PF ID | Baseline result | Current test/command | Actual result | Manual/live limitation |
|---|---|---|---|---|
| PF03 Guest linking | PASS | preflight; new guest-link metadata test | PASS | Device NOT_RUN |
| PF04 Sync | PASS | preflight (`agyPreservedContracts` seven-type freeze unchanged); new old-server `runSyncPass` round trip | PASS | Live sync NOT_RUN |
| PF05 Offline intents/reviewed commands | PASS | preflight; new reviewed overnight move test | PASS | Intentional: reviews state "Ends the next day" |
| PF06 Reminders/calls | PASS | preflight (AGY-PORT 03 suites unchanged); form reminder uses the resolved instant | PASS | Device alarms NOT_RUN |
| PF10 UI/navigation/settings | PASS | preflight; new form tests | PASS | Intentional: overnight accepted; equal or gap times refused; Earlier/Later prompt; next-day and zone hints and labels |
| PF11 Calendar/planner | PASS | preflight; new layout, conflict, recurrence and ICS tests | PASS | Intentional: invalid or impossible ICS items are skipped and counted; UTC/TZID converted |
| PF12 Data/error recovery | PASS | preflight; schema-17 upgrade test | PASS | Device NOT_RUN |
| PF01, PF02, PF07, PF08, PF09, PF13 | PASS | preflight (full suite) | PASS | Untouched |

## Commands and evidence

Evidence folder: `evidence/agy-port-20261106/phase-08/`.

| UTC / working directory | Exact command | Tested HEAD | Exit/result | Evidence path |
|---|---|---|---|---|
| 04:44Z / checkout | `npm run preflight` | 02bbe44+worktree | exit 0; 34 suites, 496 passed + 1 skipped; architecture PASS (206 modules, 0 cycles) | `preflight-1.log` |
| 04:45Z / `X:\android` | `gradle-x.ps1 … testDebugUnitTest assembleDebug` | 02bbe44+worktree | exit 0; BUILD SUCCESSFUL, 9 executed / 362 up-to-date (native unchanged; the debug build bundles no JS) | `gradle-unit-assemble-1.log` |
| 04:46Z / checkout | `mutate08.py` (M1–M7, each applied, both new suites run with `jest --json`, restored, byte compare) | 02bbe44+worktree | each mutation fails named tests; all restored byte-identical | `mutation-checks.log` |
| 04:47Z / checkout | `node plans08.js` (node:sqlite, DDL copied from `dbInit.ts` / `eventTimeSchema.ts`), plus the legacy-shape comparison | n/a | indexed; the join adds one indexed lookup per row; same sort steps as before | `query-plans.txt` |
| 04:49–04:50Z / checkout | `npm run preflight` (final, after the legacy-row fixture test) | 02bbe44+worktree | exit 0; 34 suites, 497 passed + 1 skipped; architecture PASS | `preflight-2.log` |

The mutation and plan scripts were run from the session scratchpad and are not committed. Their logs are.

The mutation run overlapped the Gradle run. The debug build has no JS bundle task (0 `createBundle…JsAndAssets` lines in the log), so the temporary JS mutations could not reach it.

| Mutation | What it broke | Tests failed |
|---|---|---|
| M1 | The wall-change trigger never fires | 2, including the real sync pull |
| M2 | Every update records the zone again | 1 |
| M3 | The valid join ignores the base wall time | 1 |
| M4 | ICS trusts the parser's `Z` (floating read as UTC) | 1 |
| M5 | The conflict check ignores the day before | 1 |
| M6 | An equal start and end is accepted | 2 (pure and form) |
| M7 | Recurring occurrences keep the base instants | 1 |

**Counts:** 471 tests before this phase, 497 after: 26 new and none removed. Three existing tests were updated intentionally (above).

## Native, performance and device facts

- **Native:** no Android file changed (`git diff --stat HEAD -- android` is empty). Alarms already use absolute instants. `assembleDebug` succeeded.
- **Query plans:** every event read uses `idx_events_user_date` or the primary key. The metadata join uses `idx_event_time_local_owner (user_id, event_id)`. The temporary sort steps are the same as before the join. The conflict check reads three days in one query instead of one day.
- **Engine:** conversion uses `Intl.DateTimeFormat` with `timeZone`, `hourCycle: 'h23'` and `formatToParts`. These were verified on node 24.19 only. Hermes on a device is NOT_RUN. If its formatting is off, the self-check turns metadata off and the app behaves as before this phase.
- **Timing:** none measured.
- **Device:** none used.

## Review findings and decisions

The parent self-reviewed the full Phase 08 diff on 2026-11-06. No independent reviewer was used.

1. **Floating times read as UTC on import (fixed before commit).** `ical-js-parser` appends `Z` to floating `DTSTART`/`DTEND` values, so the first version converted every floating time. UTC-ness is now read from the file text. A test and mutation M4 cover it.
2. **An engine error could block an event write (fixed).** Metadata recording now treats any resolution failure as "stay floating". Only a database error rolls the write back. The form likewise saves floating on a non-time error.
3. **An engine quirk could make the form refuse valid times (fixed).** `deviceTimeZone()` self-checks 24-hour formatting once and returns null if it fails. Tested with a 12-hour formatter.
4. **The form hint used today for a new event (fixed).** The new-event date is the selected day, which the form does not carry. The hint then says "Ends the next day." without a date.
5. **An invalid date in the conflict check could throw (fixed).** Neighbouring days are computed only for a real date.
6. **Remaining risks.**
   - A remote time change drops the local zone. This is deliberate and documented.
   - Recurring ICS imports keep the legacy floating expansion, so a UTC recurring source is still read as wall time.
   - The 12-hour Calendar display (`formatTimeForDisplay` ignores the 24-hour flag) is pre-existing and unchanged.

## Manual checklist still needed

1. **Install/open:** build the debug app from the Phase 08 commit and run it with Metro. Use a disposable account for the sync steps.
2. **Actions:**
   1. **Overnight event.** Create an event 11:00 PM → 1:00 AM for tomorrow. Then open the Calendar on tomorrow and the day after.
   2. **Equal times.** Try a 9:00 → 9:00 event.
   3. **Timezone change.** In Android settings, set the timezone to America/New_York.
      - Open the event from step 1.
      - Create an event on 2027-03-14 at 2:30 AM.
      - Create one on 2027-11-07 at 1:30 AM and choose Later.
      - Set the timezone back.
   4. **ICS round trip.** Export the calendar. Import the file into another account or app.
   5. **Invalid ICS.** Import a file with an invalid date.
   6. **Sync.** With the controlled server: rename the overnight event on a second device and sync. Then change its time there and sync.
3. **Expected:**
   1. **Overnight event:** "Ends the next day" shows in the form. The event fills 11 PM–midnight and the top of the next day, labelled "next day", and its reminder rings before 11 PM.
   2. **Equal times:** refused.
   3. **Timezone change:**
      - The step 1 event shows "· Asia/Manila" and its saved wall position.
      - 2:30 AM on 2027-03-14 is refused as a skipped time.
      - 1:30 AM on 2027-11-07 asks Earlier/Later, and its reminder follows the choice.
   4. **ICS round trip:** the overnight event ends on the next date. The zoned event carries exact UTC times.
   5. **Invalid ICS:** the import prompt says how many items were left out. Nothing lands on today.
   6. **Sync:**
      - Both devices show the same wall times.
      - After the rename, the phone keeps "· Asia/Manila" while in another timezone.
      - After the time change, the label is gone.
      - No sync error appears on either device.
4. **Current execution status:** NOT_RUN. No device or live backend was used. This is MANUAL-QA M11.

## Deferrals and continuation

- **DEFERRED_EXTERNAL (inventory 29):**
  - A backend contract that stores and returns timezone metadata, with old-client merge and omission/null semantics.
  - Any cross-device timezone guarantee.

  Both need a backend change and a controlled server. Nothing here was deployed or edited.
- **Events longer than 24 hours.** The frozen wire cannot express them, so the form cannot create them and imports skip them with a count.
- **Recurring and `RECURRENCE-ID` imports.** These keep the legacy floating expansion. Converting them exactly needs per-occurrence zone handling.
- **"Yesterday" NLU wording.** There is no grammar change. Overnight spans from yesterday are handled in conflicts and layout.

Next action: NEXT_PHASE, AGY-PORT 09. No human review pause under this pack's authorization.
