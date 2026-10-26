# Phase 04 review of the independent Phase 03 audit

**Reviewed:** 2026-10-23, Asia/Manila.  
**Input:** owner's pasted “Independent Phase 03 & Audit Hardening Comprehensive Report”, attachment SHA256 `e986985447dcf03119a135dea5f4dbfca45517abc65480d98c77dedc1410615d`.  
**Scope:** verify claims against Phase 03 source, captured evidence and primary platform documentation; identify changes justified for the approved manual planner phase.  
**Conclusion:** substantially accurate implementation inventory and historical test counts, with several unsupported safety/performance claims and incorrect implementation names. No additional reproducible native correctness defect was established by this targeted review. Physical-device acceptance is still incomplete.

The owner asked to inspect/fix the audit and explicitly authorized proceeding to
Phase 04 in plain language. The embedded “ready-to-paste” prompt is reference
material, not a new instruction or permission to reset/clean the repository.
The owner did not supply completed physical-phone results. Their approval does
not relabel earlier NOT RUN checks as PASS or finish the Phases 01–08 offline gate.

## Evidence boundary

The audit names the Phase 03 working branch/base from its historical report. At
the start of this review the local implementation is committed on `main` at
`b3eefb853be7c658a38186d330eb8aaf4be8eea2`; this does not change the provenance
of the earlier uncommitted build/evidence. Phase 04 works from the current source
on its own approved branch. The following are historical results checked by
reading actual files, not newly executed tests:

- [Final Phase 03 preflight](../reports/evidence/phase-03-release-preflight.log):
  156 Jest tests / 11 suites; strict TypeScript, lint, formatting and AST checks
  passed. AST output covers 25 TypeScript modules and defined native boundaries;
  it is not a complete Kotlin graph or a proof of every runtime behavior.
- [Native reviewed build](../reports/evidence/phase-03-native-reviewed.log),
  [JUnit results](../reports/evidence/phase-03-jvm-results.json) and
  [instrumentation](../reports/evidence/phase-03-instrumentation-reviewed.log):
  30 JVM tests and 23 API 37 emulator tests passed. Instrumentation comprises
  21 Android SQLite tests and two real PendingIntent tests using isolated files.
- [Reviewed APK manifest](../reports/evidence/phase-03-artifacts-reviewed.json):
  both quoted dataQa hashes and the four quoted APK byte sizes match. These
  artifacts are development-signed previews/QA builds, not production releases.
- [Emulator ledger](../reports/evidence/phase-03-emulator-final.json),
  [benchmark samples](../benchmarks/phase-03-emulator.json),
  [cleanup](../reports/evidence/phase-03-emulator-cleanup.json) and
  [integrity record](../reports/evidence/phase-03-integrity.txt) retain their
  stated limitations and earlier inconclusive attempts.

The Phase 04 report owns fresh test/build/device outcomes after new changes.
Historical Phase 03 baseline samples and reports are preserved.

## Corrections to the supplied audit

| Supplied claim | Verified correction / evidence | Action |
|---|---|---|
| “Zero dangerous permissions” | `POST_NOTIFICATIONS` has Android protection level **dangerous** and is runtime-granted on API 33+. Five platform permissions plus the AndroidX signature permission are present in dataQa/release. Debug additionally declares development INTERNET and SYSTEM_ALERT_WINDOW. | Correct the description; preserve explicit permission request, denied-state warning and fallback. No permission removal is justified. |
| “Safe SQLite concurrency” / eliminates corruption hazards | Separate processes avoid the specific POSIX-lock hazard from two SQLite implementations in one process. DELETE journal avoids the documented WAL-reset race. `busy_timeout=5000` bounds lock waiting; it cannot guarantee success or exclude all I/O, storage, crash or platform failures. | Retain the qualified rationale in [ADR-015](../decisions/ADR-015-native-reminder-delivery.md), recoverable errors and phone crash/lifecycle tests. |
| Queue bounded at 256 / “negligible RAM (<1 MB)” | `ReminderStore.listCurrent()` materializes all PENDING/RINGING rows, with no SQL LIMIT. `MAX_DUE_PER_PASS=256` bounds later due processing; `MAX_REGISTERED=128` bounds future OS registrations. Neither bounds the query allocation. No measured incremental queue-memory result exists. | Keep native paging/capacity as an open risk. Use filtered, bounded product queries for Phase 04 UI; do not mistake the QA snapshot cap for native paging. |
| Historical jobs “should be excluded” / indexes should be added | `listCurrent()` already has `WHERE j.status IN ('PENDING','RINGING')`; terminal history is excluded. Schema already creates `reminder_jobs_pending(status,run_at,id)` and related reminder/source indexes. Their use and allocation under realistic workload still need query-plan/capacity evidence. | Do not add duplicate indexes or an unapproved destructive 90-day archival sweep. Large numbers of active recurring jobs, not terminal history in this query, remain the relevant risk. |
| “100% test coverage” of date fallback | Three formatter regressions exist and passed: valid zone, unsupported zone and invalid date. The logged preflight did not collect a coverage report proving a percentage. | Say three passing behavioral regressions; avoid a numerical coverage claim. |
| Complete F-015 “Strict Offline Core Gate” PASS | No cloud/account/model runtime was introduced in Phase 03. STT/TTS/intent and the complete offline workflow are not implemented/accepted yet. F-015's full gate spans Phases 01–08 and physical QA. | Describe Phase 03 scope compliance; keep the full gate pending. |
| All five 33/37/77/101/169 ms samples are “awake” notification latency | Raw values, median 77 ms and nearest-rank p95 169 ms match the final **non-reboot** cohort. It includes a screen-off full-screen case, force-stop/reopen, and overlap attempts. Timings are persisted UTC due time to `NOTIFICATION_POSTED` after `notify()` returns, not first visible/audible output. | Keep scenario labels and small-n descriptive status. No Android target PASS, speedup or reliability rate follows. |
| Reboot 41,459 ms “after OS boot broadcast” | `2026-10-22T18:32:54.059Z - 2026-10-22T18:32:12.600Z = 41,459 ms`: **scheduled due time to post**, including restart/unlock/broadcast delay. No boot-broadcast timestamp defines this subtraction. The first inconclusive probe also recorded 262,511 ms; both remain in raw evidence. | Keep successful unattended-delivery assertion separate from performance; do not pool reboot and non-reboot samples. |
| Timeout latency 6/17 ms establishes prompt expiry | These two values correctly describe the final overlapping pair after their persisted 60-second deadlines. Another final single-reminder sample is 24 ms; initial-build samples differ. Inexact/Doze/OEM expiry can be later. | Report actual case/cohort, not universal timing. |
| Single PSS “ACCEPTABLE”, native process “small” | Snapshot main 91,348 KiB (89.2 MiB), native 42,531 KiB (41.5 MiB) matches evidence. It is one dataQa x86_64 emulator snapshot, not peak, incremental queue memory, release-like physical baseline or a low-end budget pass. | Retain raw observations; no acceptable-capacity or memory-saving claim without comparable measurement. |
| Release APK within “40 MB capstone budget” | Byte values match: ARM64 27,356,493 and x86_64 27,714,777. No 40 MB acceptance budget is established by the inspected Phase 03 report/protocol. APK bytes are not installed size or RAM. | Report bytes/variant; omit an invented target verdict. |
| Every operation collision is “completely prevented” | Lossless encoded identity eliminates the prior integer-hash aliasing mechanism for valid identities and dimensions. Tests establish selected delimiter/unicode/generation cases. This is not a proof against arbitrary external OS/app defects. | Describe the specific mechanism and stale-generation validation. |
| Answer/Dismiss leaves task “strictly TODO” | Native actions never write task completion. A synthetic TODO task stays TODO; the general semantic guarantee is that acknowledgement does not change the source task status. | Use the invariant rather than promising that a previously completed task becomes TODO. |

Android classifies notification permission in its
[Manifest.permission reference](https://developer.android.com/reference/android/Manifest.permission#POST_NOTIFICATIONS).
SQLite documents the specific
[multiple-engine locking risks](https://www.sqlite.org/howtocorrupt.html) and
[WAL-reset race/fixed versions](https://www.sqlite.org/wal.html#walreset).
Those sources support conservative choices, not a blanket corruption-free claim.

## Exact implementation names

The supplied architecture diagram is conceptual and contains these naming errors:

| Audit name | Actual Phase 03 name / location |
|---|---|
| `AlarmReceiver.kt`, `BootReceiver` | `ReminderReceiver` and `ReminderRestoreReceiver`, both in `android/app/src/main/java/com/lafina/capstone/reminders/ReminderReceiver.kt`. |
| `queryActiveJobs` | `ReminderStore.listCurrent()`. |
| `ReminderStore.acknowledge()` / `.snooze()` | `ReminderStore.action(identity, ReminderAction.ACK/SNOOZE, ..., nowUtc)`; paired transitions occur in its transaction. |
| `cancelObsoleteRegistrations()` | Reconciliation/cancellation loops inside `ReminderRuntime.reconcileLocked()` and `cancelIdentity()`. |
| `reminder://<jobId>/<occurrenceKey>/<generation>/<operation>` | `lafina-reminder://<package>/<kind>/<encodedJobId>/<encodedOccurrenceKey>/<generation>`, produced by `ReminderIdentityKey.value()`. Explicit PendingIntent components/flags also participate in Android identity. |
| `lafina.db` | `lafina-capstone.sqlite`, `ReminderStore.PRIMARY_DATABASE`. |
| `TurboModule Bridge` | Registered `ReactContextBaseJavaModule` named `CapstoneReminders`, via `ReminderPackage`; main-process Binder `ContentResolver.call()` reaches private provider `${applicationId}.reminders`. Do not imply a generated codegen TurboModule spec exists. |
| `__tests__/reminders.test.ts` proves paired ACK/snooze DB transitions | This file validates bridge/decoder/reconcile behavior. Paired durable outcomes are covered in `__tests__/plannerRepository.test.ts` and Android `ReminderStoreTest`; real emulator outcome checks are separate. |

`AlarmRegistrationPolicyTest` covers cache trust/restoration/reuse decisions.
It does not itself execute native cancellation or prove the whole F-005 workflow.
The real PendingIntent assertions, storage tests and emulator observations support
their respective, narrower behaviors.

## Prior fixes remain verified

- **AUD-01:** formatter catches invalid/unavailable timezone formatting, produces
  explicit UTC/date-unavailable text and a warning, without changing stored
  scheduling instants. Existing regression file has three cases.
- **AUD-02:** `onDraftStateChange` reports dirty/saving state; App guards Back,
  tabs and subpanels with keep/discard behavior. Failed save retains the draft.
- **AUD-03:** both Gradle defaults select ARM64/x86_64. ARMv7 requires the explicit
  experimental flag; the logged expected rejection is a gate check, not an ARMv7
  build/device PASS. ARMv7 remains NOT RUN.
- **AUD-04:** the QA `snapshot()` SQL returns at most 501 rows/table, exposes at
  most 500 and signals `truncated`. A repository regression verifies the bound
  without deleting records beyond it. This is a defensive QA limit; product
  agenda/calendar must use date/state/page queries so valid later items are not
  hidden behind early history.

## Manual guide corrections and remaining checks

The existing [Phase 03 manual guide](../../qa/PHASE-03-MANUAL.md) is the detailed
platform matrix. The supplied condensed checklist needs these qualifications:

- `adb install -r` is an upgrade preserving data, not a clean install. Do not
  clear/uninstall a real user's data to test an upgrade. Use a separate device or
  explicitly disposable installation for first-run tests.
- Enabling delivery and requesting notifications are separate app controls; use
  the visible notification-permission button. Exact access and channel settings
  must be checked separately. An inexact fallback cannot promise 15–20 seconds.
- Create the synthetic reminder while the app is open **before** locking the
  screen. FSI requires in-app opt-in, OS access and suitable channel state;
  Android/OEM controls presentation. The actual button is
  **Acknowledge / Dismiss**. It acknowledges the alert and closes its Activity;
  it does not bypass a secure phone lock/PIN.
- The QA quick-create control schedules **15 seconds**, not three minutes.
  A future manual timed item can use a longer lead-in through Phase 04's planner.
- Distinguish Recent Apps swipe from Android Force stop. The tested case reopens
  before the due time; it does not establish delivery while still force-stopped.

Physical API 30/ARM64/OEM, secure lockscreen, audible/vibration output, Doze,
low-RAM capacity, battery, repeated cold start and controlled legacy/new
comparisons remain NOT RUN. A passing emulator or a third-party audit cannot
complete those acceptance checks. Phase 04's fresh report must state its own
actual results and retain the outstanding human checklist.
