# PHASE 02 — Offline data domain, SQLite and scheduling operations / Completion Report

**Branch / base:** `codex/phase-02-data-domain` / `7d4105e`  
**Date:** 2026-10-22 Asia/Manila; raw evidence uses UTC (2026-10-21 evening)  
**Source:** uncommitted working tree; no commit/push/PR/merge performed  
**Device:** running API37 x86_64 emulator, reported MemTotal4008376kB; physical phone unavailable  
**Status:** `AWAITING DEVICE VALIDATION`  
**Approval:** owner: “so far phase 01 looks good, proceed phase 02”, with five
screenshots of the reviewed foundation. This is explicit natural-language approval
for only Phase02. Model/API/RAM and unreported offline/phone checks are not inferred
from the screenshots. Phase01's original report remains historical; the owner
subsequently committed the foundation and CI fix before this clean branch began.

## 1. Scope completed

- **F-003 data APIs:** typed task/event create/read/update/delete and upcoming
  queries. Source versions reject stale edits. Date-only, undated and timed tasks
  remain distinct; title/notes are bound parameters, with size limits.
- **F-005 data portion:** task/event + occurrence reminders + desired jobs + retry
  receipt commit atomically. A failed write never produces a successful UI result.
  Edits/cancellation/snooze carry stable occurrence identities and generations.
- **F-008 data portion:** legal reminder outcomes, duplicate/stale callbacks,
  explicit ACK vs task completion, bounded atomic snooze and retained cancellation
  tombstones. Metadata edits and weekly-series extension preserve terminal ACK/MISS.
- **F-016 data portion:** bounded weekly classes, inclusive end within366 calendar
  dates, explicit timezone anchor, unique weekdays and DST gap/fold handling.
  Upcoming windows are half-open and include overlapping events/date-only dates.
- Fresh capstone schema1 migrates from Phase01's unversioned SQLite schema0,
  preserving its preference JSON exactly. One anonymous `local` profile; no auth,
  business, legacy schema, demo seed, cloud or model dependencies. Preferences and
  planner use one lazy app-private database connection with explicit failure.
- Limited local chat repository (latest100 text messages); no chat commands,
  transcript harvesting, audio capture or assistant generation implemented.
- Debug-only CRUD/outcome harness and isolated synthetic native SQL checks in
  Settings. Private bundled `dataQa` works without Metro, preserves the preview's
  existing app ID/settings, and clearly states **delivery UNAVAILABLE**. Release
  disables the harness. Ordinary Calendar/Chat product UI remains deferred.
- Deterministic future/overdue/quiet policy: more than15min overdue becomes MISSED;
  quiet intervals defer eligible jobs to their end; no background polling/retries.
- Synthetic fixtures, migration/fault/process-termination tests, architecture
  diagrams, schema/ADR/manual QA and reproducible host-only timing evidence.

**Legacy:** targeted read-only reinspection at
`f7e70aec54e6d16e627f444f2a67114cbfb07b5e` of `remindersStore.ts`,
`rruleHelper.ts` and `reminderActions.ts`. Their native-first effects, swallowed DB
errors, host-local recurrence and unguarded outcomes were not copied. The new code
implements reviewed behavior independently; no legacy code/asset/model was ported.
Source-owner authorization remains recorded; no new redistribution assumption.

**Not implemented:** Android alarm registration/delivery/reconciliation, native
call reminders, notifications, STT/TTS, NLU, production calendar/forms, backend,
Gemini/RAG. Phase03 was not started. A QA RINGING state is not an actual delivered
alert. No legacy data migration or full RFC5545 recurrence support is promised.

## 2. Change summary

| Files/module | Change and reason | Evidence |
|---|---|---|
| `src/core/domain/{planner,plannerValidation,scheduleTime}.ts` | Typed commands/records, strict time/rule validation, fixed-clock contract, bounded recurrence and due policy | Domain/real-SQLite tests |
| `src/core/storage/plannerDatabase.ts` | Atomic0→1 migration, FK/checks/indices, synchronous transaction owner and failed-rollback quarantine |14 migration/transaction cases |
| `src/core/storage/{plannerRepository,plannerRows,reminderOperations}.ts` | Separate CRUD/receipt orchestration, typed decoders and paired outcomes |30 real-SQLite repository cases |
| `src/core/storage/{openLocalDatabase,openPlanner,openPreferences}.ts` | One lazy app DB for settings/planner, no fallback | Native open/build/UI checks |
| `src/core/storage/runPlannerSqlChecks.ts` | Dedicated synthetic QA database, migration replay/rollback/ACK/integrity checks | Actual Android OP-SQLite PASS screenshot |
| `src/features/scheduling/PlannerHarness.tsx`, `src/app/App.tsx` | Review-only forms/outcome controls, delete confirmation/errors, gated lazy opening; foundation tabs retained |9 harness tests, App gate/error test, emulator |
| `android/app/build.gradle`, `MainApplication.kt`, `CapstoneBuildPackage.kt`, `src/dataQa/AndroidManifest.xml` | Version0.2.0/code2; native build flag; bundled no-dev-support QA variant; remove unused inherited overlay permission | Debug/QA/release builds + APK inspection |
| `__tests__/{plannerMigrations,plannerRepository,scheduleTime,PlannerHarness}.test.*`, helpers and App test | Migrations/CRUD/faults/real host process crash/DST/manual-control behavior |108 tests /7 suites overall |
| `scripts/benchmark-planner.cjs`, benchmark JSON/MD | Reproducible host-only workload, immutable evidence and source hashes |100 samples per transaction type;0 errors |
| CI workflow, architecture checker, README, architecture/schema, ADR014, traceability/risk/manual QA/report | Current phase scope, build commands and review limits | Preflight/import checks; remote CI NOT RUN |

No dependency, lockfile, secret, model, legacy application/database, business module
or unrelated file was imported. APKs remain generated ignored outputs, not source.

## 3. Tests and real outcomes

| Check | Exact command/procedure | Result | Evidence/limit |
|---|---|---|---|
| Full JS gate | `npm run preflight` | **PASS** | [Final raw log](evidence/phase-02-final-preflight.log): strict TS, ESLint0warnings, formatting,108 tests/7suites,21module import graph; [earlier107-test gate](evidence/phase-02-preflight.log) retained |
| Migration/transaction tests | `npm test -- plannerMigrations.test.ts` | PASS within gate |14 real host-SQLite cases; Phase01 preservation/replay, DDL/profile/version/commit faults, failed-rollback quarantine, constraints, async/nested refusal |
| Repository/termination tests | `npm test -- plannerRepository.test.ts` | PASS within gate |30 cases; paired create/edit/ACK rollback, receipts, optimistic versions, tombstones, simultaneous jobs, persistence, child process SIGKILL before COMMIT |
| Time/weekly policy | `npm test -- scheduleTime.test.ts` | PASS within gate |35 cases incl leap/month, invalid UTC, New York fold/gap, Lord Howe30min transition, Apia skipped date, quiet/missed and interval boundaries |
| UI tests | `npm test -- PlannerHarness.test.tsx App.test.tsx` | PASS within gate | Draft/error/retry tokens, delete confirmation, ACK no taskwrite, sourcelead/timezone, production gate and recoverable open |
| Native builds | Select JDK17/SDK; `android/gradlew.bat -p android :app:assembleDebug :app:assembleDataQa :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 --no-daemon --console=plain` | **PASS** | [Final guard build](evidence/phase-02-final-guard-build.log), both ABIs; [earlier successful build](evidence/phase-02-android-final.log) retained |
| Final minimal-permission QA build | Same env/wrapper, `:app:assembleDataQa -PreactNativeArchitectures=arm64-v8a,x86_64 --no-daemon --console=plain` | PASS | [Final QA log](evidence/phase-02-qa-minimal-permissions.log) |
| APK inspection | SDK36 `aapt2 dump badging`, `aapt2 dump permissions`, `apksigner verify --verbose` on four QA/release APKs | **PASS** | [Manifest/signing evidence](evidence/phase-02-apk-inspection.txt): validv2, expected IDs/ABIs/flags, no Internet/mic/notification/alarm/overlay permission |
| Native SQL on emulator | Install matching `dataQa` with `adb -s emulator-5554 install -r ...`; Settings → test harness → Run isolated SQLite checks | **PASS** | [Actual Android SQL screenshot](evidence/phase-02-emulator-sql.png); synthetic separate DB, OP-SQLite JSI, no alarms |
| Offline emulator CRUD/restart | Airplane1/Wi-Fi0/data0; native task create/edit, due-state simulation/ACK, force-stop/relaunch, delete cancel/confirm | **PASS for exercised task paths** | [Final smoke record](evidence/phase-02-emulator-final.json), [ACK screenshot](evidence/phase-02-emulator-ack.png), [post-delete records](evidence/phase-02-emulator-records.png); original connectivity restored. Event form, native snooze UI, TalkBack and physical phone remain NOT RUN |
| Host data benchmark | `node scripts/benchmark-planner.cjs --output docs/benchmarks/phase-02-host-current.json` | PASS workload | [Raw timing/source-hash JSON](../benchmarks/phase-02-host-current.json),0errors; host memory SQLite only |
| Graphify | CLI/tool unavailable | **NOT RUN** | Executed AST import graph substitute: `npm run check:architecture` PASS; not Kotlin/JNI graph certification |
| Documentation/artifact integrity | Local helper `python .local/phase02-integrity.py`; `git diff --check` | PASS | [Integrity log](evidence/phase-02-integrity.txt): local links, JSON parsing,4 final APK hashes and10 current benchmark source hashes. The local helper is ignored tooling; manual procedures remain in versioned QA docs |
| Remote GitHub CI | Workflow updated; no push/run invoked | **NOT RUN** | No invented Actions result |
| Fresh dependency audit | No dependency/lock change; prior findings retained | **NOT RUN / OPEN** | [Phase01 advisory snapshot](evidence/phase-01-dependency-audit.json) remains unresolved, not a clean scan |
| Android instrumentation/JUnit | No alarm/native feature instrumentation configured in this phase | **NOT RUN** | Native SQL UI integration is actual emulator evidence, not JUnit |
| Physical phone/API30/OEM/low-end/reboot/TalkBack/performance | [Full manual procedure](../../qa/PHASE-02-MANUAL.md) | **NOT RUN / HUMAN REQUIRED** | No attached physical phone |

The first native QA build **failed**, retained in
[initial log](evidence/phase-02-android-build.log): a debuggable app linked release
React Native C++ prefabs and lacked debug symbols. Aligning the QA variant and
library fallbacks with debug fixed it. An unused debug-library overlay permission
was then removed explicitly; all final QA/release manifests were inspected.
Kotlin legacy-package deprecation/parameter-name and SDK XML/Gradle dependency
warnings remain visible in logs; they are not hidden or treated as runtime proof.

A final reliability review added connection quarantine when rollback itself fails.
Shared reads/writes then reject until app restart, including a one-statement
preference save that must never appear durable inside an uncertain transaction.
The new real-SQLite regression exercises this actual open-transaction condition.

Initial emulator automation attempts passed isolated SQL checks but overscrolled
fields or tapped a clipped Edit control. Their partial records are retained:
[attempt1](evidence/phase-02-emulator-attempt-01.json),
[attempt2](evidence/phase-02-emulator-attempt-02.json),
[attempt3](evidence/phase-02-emulator-attempt-03.json). Shorter swipes and fully
visible control bounds corrected the driver. No production validation was disabled.

The subsequent run created and edited a synthetic task, then ADB reported
`device offline`; later enumeration returned no devices and no emulator process
was running. The emulator was not killed by this phase. The last attempt's
connectivity-restoration commands could not complete at that moment. The owner
reopened the emulator; the agent reconnected and restored the observed original
airplane0/Wi-Fi1/mobile-data1 settings. These were the restoration commands:

```powershell
adb -s emulator-5554 shell cmd connectivity airplane-mode disable
adb -s emulator-5554 shell svc wifi enable
adb -s emulator-5554 shell svc data enable
```

The [interruption record](evidence/phase-02-emulator-interrupted.json) is historical.
The subsequent [final smoke record](evidence/phase-02-emulator-final.json) supersedes
it: the final rebuilt APK was installed with `install -r`; native SQL checks and
persisted task/version2 survived reopening. A timed edit, simulated due/ACK,
force-stop/relaunch persistence and deletion passed offline. All tested source
items were synthetic. The final test restored original connectivity again and
left the app open. No physical-phone or actual alarm/audio result is inferred.

## 4. Performance and device matrix

[Host protocol/results](../benchmarks/phase-02-host.md) and
[current JSON](../benchmarks/phase-02-host-current.json) preserve raw samples, ten
current source hashes (including the shared database guard), percentile method and
errors. Earlier repeated runs remain unchanged in the initial, `final`-named and
`verified`-named JSON files; all predate the final failed-rollback connection
quarantine fix. There is no before/after speedup claim. Windows Ryzen5 6600H, Node24.19.0,
SQLite3.53.3, one real **in-memory host** database;10 warmups then100 measured calls
per transaction type. These exclude filesystem fsync, Android native bridge, UI,
phone CPU and actual reminder delivery.

| Host-only workload | n | p50 ms | p95 ms | Failures |
|---|---:|---:|---:|---:|
| Create task + paired reminder/job/receipt |100|0.7339|2.2738|0|
| Metadata edit transaction |100|0.7649|3.8026|0|
| RING state transaction |100|0.6281|1.9566|0|
| ACK state transaction |100|0.3661|1.7608|0|
| SNOOZE state transaction |100|0.4596|4.1607|0|
|366-date weekly expansion |10|75.3578|117.7429|0|

Largest discrete host RSS checkpoint145,690,624bytes includes Node/compiler/fixtures;
it is **not Android PSS or a continuously sampled memory peak**. No phone RAM floor
or production save-latency guarantee follows. Weekly eager expansion is bounded,
but low-end latency and large-dataset snapshot reads remain to be measured.

Final artifact sizes/hashes are in [phase-02-artifacts.json](evidence/phase-02-artifacts.json):
ARM64 QA50,517,495bytes/x86_64 QA50,037,819bytes; release ARM6427,222,285bytes /
x86_6427,580,569bytes. QA includes debug native libraries; its larger size is not a
production regression measurement. APK bytes are not installed size or RAM.
ARMv7 remains NOT BUILT/TESTED. Android min30/target36; exercised emulator API37.

**NOT RUN:** comparable legacy baseline, physical startup p50/p95, peak PSS, battery,
alarm drift/reliability, offline STT accuracy/latency, Android TTS quality/latency,
Kokoro comparison, Android Go/low-RAM/OEM support. ADB smoke launch times are not
controlled capstone performance samples. Emulator MemTotal is not phone capacity.

## 5. Reliability, privacy, permissions and licenses

No Internet/server account is needed for storage. No audio, transcript, model,
analytics, private agenda or API key is uploaded. UI errors avoid SQL payloads.
Only synthetic QA data is committed as fixtures/evidence; the student's primary DB
is never extracted. Existing settings are preserved. Backups remain disabled.

Migration and paired mutations use `BEGIN IMMEDIATE`/COMMIT and rollback on failure.
No async work runs inside callbacks. Receipts make uncertain successful retries
idempotent; differing token reuse rejects. Old generations/terminal states ignore
stale outcomes. Native delivery is explicitly UNAVAILABLE and cannot undo durable
user data. Debug tests do not certify Android alarm or call-style behavior.
If rollback fails, the shared connection is quarantined; restart the app before
retrying. There is no attempt to treat uncertain writes as successful or reset data.

Logical deletion retains minimal source/job/outcome tombstones and receipts for
future reconciliation; it is **not secure erasure**. Production privacy purge and
paging/pruning remain later work. Chat alone is capped100messages. The QA harness
shows limited slices/counts; snapshot APIs currently read all rows. Weekly end is
finite; nonexistent local/quiet-boundary times refuse safely rather than shift.

No third-party dependency changed. Phase01's33 meta/affected advisory entries from
two unpatched leaf findings remain documented; this phase does not mark that audit
green. QA/release use development signing; QA is debuggable and not distributable
as a production build. The final QA manifest strips inherited overlay permission.
Only AndroidX's internal signature receiver permission remains in QA/release.

## 6. Human phone verification

Install the **matching dataQa** APK (release hides the test tool), using `install -r`
to preserve setup. [Full instructions/commands](../../qa/PHASE-02-MANUAL.md) cover:

1. Airplane mode/Wi-Fi/data off; open Settings → Open data test harness. Existing
   setup survives, with no account or permission request. Run isolated SQL checks:
   expect PASS without changing primary records.
2. Create/edit an undated task and a date-only task. Invalid dates/title/lead fail
   without losing the draft or partially writing. Timed reminder lead is explicit.
3. Create a synthetic due-current-minute task with lead0. Inspect reminder →
   Simulate due → ACK. Expect ACKNOWLEDGED and linked task TODO; no alarm/audio.
   In-progress/title edits preserve ACK; only explicit Completed changes the task.
4. Snooze another eligible reminder10; expect new generation/later run and atomic
   paired states. Reject0/fraction/>120. All delivery remains UNAVAILABLE.
5. Create a finite weekly class, inspect occurrence count/unique jobs, extend its
   end without replaying ACK/MISS; test gap/fold refusal and confirmed deletion.
6. Force-stop/reopen and reboot the physical phone offline. Records, setup,
   versions and ACK/task separation persist; test keyboard, large fonts, tabs and
   TalkBack. Record PASS/FAIL/NOT TESTED with model/API/RAM and artifact hash.

Physical checks above remain **HUMAN REQUIRED**. Send only synthetic steps/errors
and sanitized screenshots; no DB, serials, personal agenda/audio or full logcat.
No notification/alarm/speech is expected because those features are unimplemented.

## 7. Documentation and architectural decisions

[README](../../README.md), [schema/architecture/API](../phase-02-data.md),
[ADR-014](../decisions/ADR-014-planner-transactions.md),
[ADR-003 update](../decisions/ADR-003-local-state.md),
[architecture index](../02-ARCHITECTURE.md), [decision log](../04-DECISION-LOG.md),
[requirements matrix](../../qa/REQUIREMENTS-MATRIX.md),
[risk register](../../qa/RISK-REGISTER.md), [manual QA](../../qa/PHASE-02-MANUAL.md),
[execution checklist](phase-02-checklist.md) and host benchmark protocol/results.
The Mermaid diagram maps actual dependency and reminder state behavior. Graphify
was unavailable; the executed TS AST checker found no cycles/offline violations.
React review applied the `vercel:react-best-practices` skill:
lazy opening, caught errors, retained drafts, retry-safe tokens, source-derived
state and shared labeled/scalable controls. Web/server-only suggestions did not
change the Android stack. This is not comprehensive accessibility certification.

## 8. Open blockers, limitations and next steps

- Physical phone review, Android11/API30, OEM reboot, TalkBack and low-end performance
  remain unverified. Owner review is needed before Phase02 can pass.
- The emulator interruption was recovered after owner assistance; final task-path
  UI checks and connectivity restoration passed. Event CRUD/weekly/snooze UI and
  full accessibility still need the manual device review; their data APIs are tested.
- Prior dependency findings remain open; public distribution/production signing is
  not authorized. Remote CI and full security audit were NOT RUN this phase.
- Native alarm identity/cancellation/reconciliation and receiver-safe access to
  durable state require Phase03 implementation and phone evidence **after approval**.
- 15min overdue grace, strict DST gap policy, fixed elapsed class duration, finite
  horizon and logical deletion are explicit decisions for review, not hidden defaults.
- Snapshot paging, tombstone/receipt pruning and full user-data purge are deferred;
  large-dataset behavior is not certified. No unlimited recurring expansion/model.
- No user-facing calendar/task redesign or later-phase implementation was started.

## 9. Review decision

- [x] Required JS gates and ARM64/x86_64 debug/QA/release builds passed.
- [x] Native emulator isolated SQL and exercised task CRUD/ACK/restart UI checks passed; other evidence is separately labeled.
- [ ] Physical-device checks completed and owner-confirmed — HUMAN REQUIRED.
- [ ] Prior dependency findings resolved — NO, open historical findings retained.
- [x] No alarm/voice/cloud/business implementation or legacy modification.
- [x] Report, schema/ADR, risks and concrete manual instructions provided.
- [ ] Phase03 explicitly approved — NOT RECEIVED; no work started.

STATUS: AWAITING DEVICE VALIDATION

**STOPPED — awaiting explicit human approval for Phase 03.**
