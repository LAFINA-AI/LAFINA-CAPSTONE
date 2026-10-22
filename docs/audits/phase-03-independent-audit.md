# Phase 03 — independent verification of the external audit

Reviewed 2026-10-23, Asia/Manila. This checks the findings identified in the
owner-supplied Antigravity review against actual capstone source and recorded
evidence. The external review is reference material, not authorization to execute
a phase or evidence that a device test passed. The owner separately authorized
Phase 03. Phase 04 is not authorized.

## Findings checked

| Finding | Source verification | Disposition |
|---|---|---|
| AUD01: timezone formatting can fail during Today rendering | `src/app/App.tsx` directly constructed `Intl.DateTimeFormat` with the saved timezone inside rendering. Validation when saving does not guarantee the device's formatter will continue to accept that timezone or option set. | Confirmed. `core/ui/formatOverviewDate.ts` catches formatting failure, displays an explicit UTC date fallback and warning, and keeps Settings reachable. Invalid device dates show a recoverable clock warning. No persisted timezone or schedule instant is rewritten. |
| AUD02: unsaved Settings edits can disappear on navigation | The preferences form held its draft locally while App's tab/hardware Back handlers could unmount it immediately. The form's original discard control also discarded immediately. | Confirmed. The form reports dirty/saving state. Tab changes, hardware Back, entry to the data harness and reopening onboarding now request keep/discard confirmation. Saving blocks navigation until it finishes; failed saves keep the draft, successful saves establish a clean baseline. Direct discard also asks for confirmation and restores the last successful save. |
| AUD03: unverified ARMv7 included by default | At review start, `android/app/build.gradle` defaulted to `armeabi-v7a,arm64-v8a,x86_64`; recorded build evidence covered ARM64 and x86_64. | Confirmed. Phase03 defaults to ARM64/x86_64 and rejects ARMv7 unless explicitly enabled with `-PenableExperimentalArmv7=true`. ARMv7 is still NOT BUILT / NOT DEVICE TESTED. Preview development signing remains a separately disclosed distribution limitation. |
| AUD04: unpaged snapshot reads | At review start, `PlannerRepository.snapshot()` selected all task/event/reminder/job rows, then the harness sliced rendered lists. | Confirmed. The QA-only snapshot now queries LIMIT501 and returns at most500 rows per table, with an explicit truncation warning. Phase04 must add filtered/paged product APIs. Receipts and cancellation history are retained for retry/cancel safety. No low-end phone capacity is inferred from host tests. |

The second audit finding concerns settings drafts. It does not establish that all
future planner forms or Android navigation paths have draft protection. New
Settings subpanels must use the same guarded navigation path.

## Claims requiring qualification

- **F-015 scope:** the requirements matrix explicitly assigns the complete offline
  requirement to Phases01–08. Phase01/02 import, manifest, local persistence and
  emulator evidence do not pass the full offline gate. Alarm, speech and later
  command paths require their own evidence and human review.
- **Port declarations:** `src/core/domain/ports.ts` defines TypeScript interfaces
  and result types. Interfaces have no runtime implementation; declaring an
  `unavailable` union member does not mean calling a service returns it. Actual
  adapters and failure paths must be tested in their approved phases.
- **SQLite locking:** `BEGIN IMMEDIATE` begins a write transaction immediately.
  It should not be described as an exclusive lock preventing all other readers.
  SQLite distinguishes IMMEDIATE from EXCLUSIVE outside WAL mode and documents
  that only one write transaction can be active. See the
  [official SQLite transaction documentation](https://www.sqlite.org/lang_transaction.html).
  The repository's synchronous callback contract and SQLite's cross-connection
  locking are related safeguards, not interchangeable guarantees.
- **Performance:** Phase02 benchmark JSON explicitly labels its host-only,
  in-memory SQLite conditions and excludes filesystem durability cost, Android
  bridge, UI and delivery. Its timings do not establish Android p50/p95, a phone
  RAM floor, startup, battery use or an old/new speedup. The final Phase02 report
  points to later timestamped measurements; older immutable JSON is historical.
  The six rounded p50/p95 figures supplied by Antigravity match
  `phase-02-host-current.json` (measured2026-10-21T17:35:08.455Z), including
  create0.7339/2.2738ms and weekly75.3578/117.7429ms. This is a numerical
  cross-check of existing evidence, not a fresh Phase03 benchmark run or proof
  that the audit's Android targets were met.
- **Weekly counts:** finite weekly expansion uses inclusive calendar dates and
  selected weekdays. A start date through the same weekday fourteen days later
  contains three occurrences of that one weekday. With two selected weekdays,
  the result depends on the exact endpoints and start anchor; it is not always
  four. Use explicit dates and assert the actual occurrence list.
- **Lifecycle labels:** removing a task from Recent Apps and an explicit Android
  force-stop are different test actions. Phase02's saved evidence records an
  actual `adb shell am force-stop com.lafina.capstone` followed by launch. A
  reviewer doing only a Recent Apps swipe must record that action separately.
  Neither action proves physical-phone alarm recovery or reboot delivery.
- **QA output:** the isolated SQLite check's actual success string begins
  `PASS: native SQLite migration replay/settings preservation, paired rollback,
  create retry, ACK vs task completion, duplicate outcome, integrity and foreign
  keys.` It continues with the synthetic-QA/no-alarm limitation. A shorter audit
  paraphrase is not an exact string assertion. Match the current source output
  and record the APK/version actually used.

## Verification of the small UI fixes

Actual command:

```powershell
npx jest __tests__/App.test.tsx __tests__/PreferencesForm.test.tsx __tests__/formatOverviewDate.test.ts --runInBand
```

Result: **PASS — 16 tests, three suites**. Cases cover the formatter's UTC fallback
and invalid date, tab/hardware Back draft protection, failed-save retry, blocked
navigation while saving, successful-save cleanup, harness entry and explicit
discard cancellation/restoration. Tests use injected preferences storage and
React Native test rendering. They are not physical-device or native alarm tests.
TypeScript and targeted ESLint also passed during this review; the phase-wide
report records the final checks after all Phase03 integration changes.

The React best-practices skill's component, effect-dependency, event-listener,
typing and accessibility checklist was applied to these TSX changes. Existing
semantic theme tokens, native controls and minimum touch targets were retained.
No new UI dependency or broad visual redesign was introduced.

**Manual checks still required:** on the installed Phase03 APK, edit a Settings
field and use hardware Back, each bottom tab and the test-harness entry. Keep
editing must retain the draft; discard must restore saved values; a completed
save must permit leaving without a warning. Verify large text and TalkBack focus
on the confirmation controls. Actual phone checks and native alarm acceptance
remain separate and are not certified by this document.

## Evidence inspected

- [App](../../src/app/App.tsx),
  [preferences form](../../src/features/onboarding/PreferencesForm.tsx),
  [UI formatter](../../src/core/ui/formatOverviewDate.ts).
- [Planner repository](../../src/core/storage/plannerRepository.ts),
  [transaction owner](../../src/core/storage/plannerDatabase.ts),
  [contracts](../../src/core/domain/ports.ts),
  [native SQL checks](../../src/core/storage/runPlannerSqlChecks.ts).
- [Build configuration](../../android/app/build.gradle),
  [requirements matrix](../../qa/REQUIREMENTS-MATRIX.md),
  [Phase02 manual QA](../../qa/PHASE-02-MANUAL.md),
  [Phase02 report](../reports/phase-02-report.md),
  [recorded emulator evidence](../reports/evidence/phase-02-emulator-final.json).

Source links may show subsequent Phase03 integration. Findings above explicitly
distinguish the pre-change observation from the completed UI correction. Final
native results, residual issues and phase status belong to the Phase03 report.
