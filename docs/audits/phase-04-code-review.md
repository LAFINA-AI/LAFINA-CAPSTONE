# Phase 04 independent manual planner code review

**Date:** 2026-10-23, Asia/Manila.  
**State:** findings addressed in source; actual test/build/device outcomes belong
to the Phase 04 completion report. The reviewer made no application-source changes.

## Reviewed boundary

- `src/features/calendar/PlannerScreen.tsx` and `plannerDisplay.ts`: page/view
  state, foreground refresh, save boundary, date navigation, warning/error states.
- `src/features/scheduling/PlannerItemDetails.tsx`: fresh-item reads, optimistic
  mutations, delete confirmation, reminder outcomes and task completion.
- `src/features/scheduling/PlannerForm.tsx` / `plannerFormModel.ts`: inspected as
  relevant context for synchronous saves, draft/picker lifecycle and wall-clock
  conversion. A separate form owner maintains implementation/tests.
- `src/core/native/dateTimePicker.ts` and Android `DateTimePickerModule.kt`:
  argument/return validation, cancellation, one-dialog guard and no implicit
  timezone-to-instant conversion.
- Existing domain/storage/decorated reconciliation contracts were read to check
  caller assumptions. Bounded query implementation was being completed by its
  owner; this review does not claim a finished SQL paging review or benchmark.

## Actionable findings sent to implementation owner

| ID | Priority / problem | Reproduction or evidence | Required resolution / verification |
|---|---|---|---|
| CR04-01 | P2: unsupported clock dates can crash planner rendering | Original `localToday()` caught domain errors but returned unvalidated UTC date. `localToday(new Date('1999-01-01T00:00:00.000Z'),'UTC')` returned `1999-01-01`; `weekDates()` then threw during render. The same happened for 2101. Both were directly reproduced using the installed TypeScript transpiler and Node, without changing device clock. | Validate successful local dates and fallback dates, keep a bounded display-only fallback with a visible clock warning, and preserve authoritative scheduling validation. Add tests for invalid Date, years outside 2000–2100 and UTC-boundary/local-timezone rollover. Initial corrective code was observed; final regression results pending. |
| CR04-02 | P2: detail screen misses external native outcome refresh | `PlannerScreen` listened for AppState active and incremented its revision. With a selection open it skipped its page read, while `PlannerItemDetails` did not depend on that revision. Native snooze/ACK/timeout while backgrounded could remain stale in the still-mounted detail view after return until manual Refresh item. | Pass a foreground refresh signal to detail reads (observed in integration) or subscribe there. Add a regression that changes repository reminder state externally and resumes the app, then shows the new status/run time without another mutation. Final test/device result pending. |
| CR04-03 | P3: failed reminder write can also show an expiry/ignored explanation | `reminderAction()` initialized its result as `ignored`; `changed()` caught a thrown write and returned void; the caller subsequently displayed “alert changed or expired.” An actual storage failure could therefore show both its error and an unrelated explanation, or retain a prior success notice. | Return a success/result from the mutation boundary, clear stale notices, and show ignored/expired only after a successful repository response. A failed latest-item read should also prevent stale mutation controls from looking current until refresh succeeds. Verification pending. |

The boundary follow-up for CR04-01 matters even with a valid UTC year:
`2000-01-01T00:00:00.000Z` in `America/Los_Angeles` is local `1999-12-31`, and
`2100-12-31T23:59:00.000Z` in `Asia/Manila` is local `2101-01-01`.
`localDateTime()` validates the input UTC range, so the returned local date must
also be checked by display/navigation code. A display fallback must not silently
rewrite a saved timezone, deadline or recurrence.

## Positive checks and remaining limits

- Main form save callback is synchronous and returns after the repository write;
  follow-up selection/page reads are outside that mutation boundary. Native alarm
  reconciliation is a post-commit effect, so an unavailable Android service does
  not masquerade as a failed local save and invite duplicate creation.
- Delete uses explicit confirmation and expected source version. Task completion
  is an explicit status update; reminder ACK/snooze uses occurrence/generation
  identity and cannot mark a task complete. Storage decides late/expired outcomes.
- Form picker callbacks check mounted state and use in-flight guards; manual date
  and time fields remain available when the native picker is missing or fails.
  Picker values are validated wall-clock components; domain conversion retains
  DST gap/fold rules and does not treat Android device timezone as schedule time.
- Android picker work runs on the UI thread, rejects a second concurrent dialog,
  and resolves cancellation/dismissal once. No runtime dependency, permission,
  calendar-account access, audio, cloud call or private-data logging was added by
  this bridge. Activity/reload lifecycle and TalkBack/large-font behavior still
  require actual Android checks; source review is not that evidence.
- Product UI uses page/window APIs rather than the QA-only 500-row snapshot.
  This alone does not certify total native queue memory, query-plan efficiency,
  low-end capacity or physical alarm reliability. Native active-job materialization
  remains a separately documented Phase 03 risk.

No full preflight, build, new instrumentation or phone test was run by this
reviewer. The only executed defect probe was the two unsupported-date helper
calls described above. Integration must run its focused regressions, full gates,
emulator scenario and physical manual checklist before acceptance is declared.

## Resolution addendum — source reinspection

The implementation owner addressed all three findings; source was reinspected
after the fixes, without changing application code in this review:

- **CR04-01:** `localToday` validates successful local dates too, clamps only its
  display fallback within the supported range, and `plannerDateWarning` exposes
  clock/timezone failure. This covers UTC-year and local-timezone rollover at the
  boundary. Stored schedule values and strict conversion are unchanged.
- **CR04-02:** `PlannerScreen` passes `refreshSignal={revision}` to details and the
  detail read effect depends on it. Native ACK/snooze/expiry becomes visible when
  the parent handles foreground return; no polling was added.
- **CR04-03:** `changed()` clears stale notice and returns an explicit boolean.
  Ignored/expired notice is conditional on a successful response. Failed detail
  reads clear both item and reminder data, hiding stale mutation controls.

Regression cases are present in
[`PlannerScreen.test.tsx`](../../__tests__/PlannerScreen.test.tsx) and
[`plannerDisplay.test.ts`](../../__tests__/plannerDisplay.test.ts), including
foreground native snooze/ACK, failure-state honesty, unsupported clock dates,
timezone boundaries and date-based navigation. Presence and source reinspection
are not a claim that the final suite/device run passed. Use the Phase 04 report's
actual executed results, artifacts and physical checklist for acceptance.

## Recovery-state regression evidence

Integration additionally found and corrected an App warning-recovery issue:
after one native reconciliation failure, a subsequent successful manual mutation
could leave the old delivery error visible until foreground/resume. The App's
post-commit reconcile callback now clears the old warning after actual native
success and advances its delivery revision while mounted. A failed reconcile
still retains the locally committed item and shows the delivery warning.

The focused, actually executed
[recovery test log](../reports/evidence/phase-04-recovery-tests.log) reports
**17 App tests passed, one suite**, in 9.075 seconds, including:
“keeps a committed task after native reconcile fails and clears the old delivery
error after the next successful mutation without resuming.” This verifies that
specific UI recovery sequence with injected services; it is not an Android
delivery/device test or a claim about the later full-suite count. Final preflight,
build and device outcomes remain in the Phase 04 report.

Graphify was freshly checked on PATH and was unavailable, so Graphify execution
is **NOT RUN**. The [availability record](../reports/evidence/phase-04-graphify.json)
links the captured preflight's real **32-module** AST/import-cycle/offline boundary
check; the architecture Mermaid diagram is the documented substitute. The AST
check does not prove all Kotlin dependencies or native correctness.

## Final handoff help-text correction and source check

The quiet-hours explanation in `PreferencesForm.tsx` previously said reminders
would become available later, despite Phase 03 native delivery and the Phase 04
manual planner now being present. The handoff changes that sentence to explain
that quiet hours can defer alerts and do not change Android Do Not Disturb. This
is a help-text correction; it changes no quiet-hours or scheduling behavior.

The read-only [handoff static integrity record](../reports/evidence/phase-04-integrity-handoff-static.txt)
freshly verifies all **111** source/test/config files, seven built APKs, three JVM
XML files and both host benchmarks' ten source hashes each. Only
`PreferencesForm.tsx` differs from the earlier reviewed source manifest. The
handoff JVM task was **UP-TO-DATE**, reusing the initial build's actual **30**
passing test results; it is not a new native test execution. APK metadata and
hashes do not establish installation, emulator outcomes or physical acceptance;
those remain the completion report's separately recorded evidence.
