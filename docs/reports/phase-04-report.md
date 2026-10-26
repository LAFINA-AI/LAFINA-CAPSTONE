# PHASE 04 — Manual calendar, tasks and reminders offline / Completion Report

**Branch / base commit SHA:** `codex/phase-04-manual-planner` / `b3eefb853be7c658a38186d330eb8aaf4be8eea2`  
**Date/time UTC:** 2026-10-23–2026-10-24; exact times are in the linked manifests/logs; handoff date 2026-10-24 Asia/Manila  
**Device available:** API 37 `sdk_gphone16k_x86_64` emulator; physical-phone validation NOT RUN  
**Status:** `AWAITING DEVICE VALIDATION`  
**Phase approval provenance:** owner wrote “inspect if this is accurate and fix it. so far so good, you can proceed to phase 04” after reviewing Phase 03 and supplying the independent audit. This explicit instruction authorizes Phase 04 despite the standing literal approval wording. It does not certify earlier physical-phone checks or authorize Phase 05.

The initial working tree was clean on `main` at the base above; prior phases had
been committed by the owner. Phase 04 changes are on the approved work branch and
are not represented by that base commit alone. No commit, push, deployment, legacy
write or Phase 05 implementation was performed by this phase's agents.

## 1. Scope completed

| Requirement | Implemented Phase 04 behavior | Acceptance boundary |
|---|---|---|
| F-003 | Product Add/Edit task and event forms persist through the existing transactional repository. Tasks distinguish undated, date-only and timed due values. Events have explicit start/end. Title, notes, timezone and reminders are editable; item deletion requires confirmation. | Actual manual-device behavior remains to be confirmed. A date-only task has no invented midnight alarm. |
| F-004 | Today and Calendar show selected-week navigation and a selected-day agenda, plus paged Active/Completed/All task lists. Local mutations refresh the view; events appear even without reminders. | A week/day agenda is the feasible calendar for this phase. No month grid or search is introduced. |
| F-005, F-006, F-007 | Successful manual mutations request existing native reconciliation after the local commit. The existing Android notification/simulated reminder screen remains the delivery path. Permission/channel/inexact warnings stay visible without blocking local CRUD. | Native registration is not proof of delivery. Phase 04 does not replace the Phase 03 Android delivery architecture. |
| F-008 | Detail actions separately acknowledge, snooze or cancel an alert. Task start/completion and Undo completion are explicit source actions. Snooze exposes the next alert time without changing the academic due/start/end. | ACK never completes a task. The native shell snoozes ten minutes; detail actions use the saved snooze preference. ACKNOWLEDGED/MISSED occurrences are not replayed by undo or metadata edits. Reopening an unhandled cancelled occurrence can rearm it, including a recent-overdue alert. |
| F-014, UI portion | Foreground return refreshes lists, permissions and the selected item's durable reminder state. Dirty forms have Cancel/Back/tab keep-or-discard protection; storage errors retain entered drafts. | Native reboot/force-stop/OEM behavior retains its existing platform limits and physical acceptance requirements. |
| F-016 | Forms support bounded weekly classes, explicit selected weekdays including the start weekday, inclusive end date, strict timezone/DST gap refusal and explicit repeated-hour choice. | Edits/deletes affect the whole series. No individual occurrence exceptions or broader RRULE support is added. |
| F-017, partial | Local item details, explicit confirmed item deletion, existing settings inspection and setup review are available. | Whole-database erase/export and unrelated data tooling are not added. |

Form time entry remains canonical 24-hour `HH:mm`; a labelled 12h/24h choice
changes the mounted view's display and native picker presentation, not a saved
preference. Android pickers return wall-clock components, and domain conversion
owns timezone resolution. Picker failure leaves manual fields usable. Past due,
start or reminder times require an explicit **Save past schedule** decision.
Metadata-only edits preserve pre-existing subminute timestamps and saved DST fold
choices instead of silently moving an alarm to a displayed minute.

Source is newly implemented for capstone interfaces. Familiar legacy interaction
concepts were selectively inspected at
`f7e70aec54e6d16e627f444f2a67114cbfb07b5e`, without copying source, assets,
database, dependencies or business screens. The local pinned object remained
unavailable, so exact public tree/blob reads were used; no alternate revision was
substituted. See [the selective legacy audit](../audits/phase-04-legacy-selection.md).

Schema remains **2**, with one primary database and no new runtime dependencies,
permissions, model, microphone, STT/TTS, cloud account, Gemini or handbook service.
Chat remains an honest unavailable placeholder. The complete F-015 offline gate
still belongs to the full Phases 01–08 review.

## 2. Change summary

| File/module | Change and reason | Test evidence |
|---|---|---|
| `src/features/calendar/PlannerScreen.tsx`, `plannerDisplay.ts` | Shared Today/Calendar week/day agenda, finite task pages, create/detail routes, explicit delivery warning, retry states, selected-detail foreground refresh and bounded clock fallback. | Seven production controller tests, six display tests; actual emulator cases below. |
| `src/features/scheduling/PlannerForm.tsx`, `plannerFormModel.ts` | Typed task/event drafts, explicit reminder opt-in, dates/times/weekly rules, past/fold/discard confirmation, retained errors and guarded picker lifecycle. | **17** behavioral RNTL form tests. |
| `src/features/scheduling/PlannerItemDetails.tsx` | Fresh source/history reads; versioned edit/status/delete; completion undo; separate alert outcomes; actual next-alert caption; failed reads hide stale mutation controls. | Production controller tests and existing real SQLite mutation tests. |
| `src/core/storage/plannerQueries.ts`, `plannerRows.ts`, `plannerRepository.ts`, `src/core/domain/planner.ts` | Typed single-source and product page/window APIs; stable scoped agenda cursor; recurring occurrences independent of reminders; finite result allocation without QA snapshot dependence. | **17** real host SQLite query regressions, including records beyond the 500-row debug cap, DST/window/cursor/filter and SQL result bounds. |
| `src/core/native/dateTimePicker.ts`, Android `DateTimePickerModule.kt`, `CapstoneBuildPackage.kt` | Strict date/time component bridge; native date/time dialogs, one-dialog guard, cancel/dismiss once and manual-entry fallback. | Two bridge tests, successful native compile, actual emulator date/time picker interaction. No new permission/dependency. |
| `src/app/App.tsx`, `src/core/ui/controls.tsx`, `src/features/onboarding/PreferencesForm.tsx` | Production planner integration, guarded dirty tab/Back transitions, semantic accessible date labels, keyboard/scroll container and corrected quiet-hours help text. | App foundation tests plus production planner draft-navigation regressions. |
| `android/app/build.gradle` | VersionCode **4**, `0.4.0-data-qa`/preview identity for review. Existing ARM64/x86_64 target and experimental ARMv7 policy retained. | Final native build and artifact manifests below. |
| `__tests__/App.test.tsx`, `PlannerHarness.test.tsx`, `ReminderSettings.test.tsx` | Preserve foundation/QA coverage while adding production query fixtures and correctly distinguishing legitimate Today opens from guarded QA harness opens. Verify failed native effects preserve saves and the next successful mutation clears the warning. | App focused **17/17 PASS**, no act warnings; full preflight results below. |
| `scripts/check-architecture.mjs`, `scripts/benchmark-planner-queries.cjs` | Phase 04 offline/native boundary checks and reproducible synthetic product-read measurements with hashes/raw samples. | Architecture **32 modules PASS**; two measured host cohorts. |
| Audit, architecture, ADR-016/017, QA/report documents | Correct independent audit overclaims; record new UI review fixes, product-query contracts, actual evidence boundaries and human checklist. | Linked documents and final integrity check. |

The independent audit accurately described much of Phase 03, including historical
test counts, artifact values and ACK semantics, but did not establish a new native
correctness defect. Corrections in
[the verified audit](../audits/phase-04-independent-audit.md) include the dangerous
notification permission, unbounded native active-row materialization despite
later work limits, existing indexes/terminal filters, unsupported coverage/RAM/
capacity claims, precise implementation names and properly labelled latency/PSS
cohorts. No speculative archival purge or duplicate indexes were added.

The new UI review established and fixed four defects: unsupported clock dates
could crash week rendering; an open detail screen could remain stale after native
outcomes; and a failed reminder write could show an unrelated ignored/expired
notice; and a stale delivery warning was not cleared by a later successful
manual reconciliation. A follow-up corrected the caption to distinguish the
original alert from the next alert and the academic deadline. See [the code review](../audits/phase-04-code-review.md).

## 3. Tests and real outcomes

Commands run from the repository root are listed with their actual status. Native
builds require the installed SDK/JDK and matching ABI; compile does not establish
execution on a phone. Earlier failed or warning-bearing attempts are retained in
evidence rather than relabelled as the final clean run.

```powershell
npm run preflight
npm test -- --runTestsByPath __tests__/App.test.tsx

$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
.\android\gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDebug :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' --max-workers=2 --no-daemon --console=plain

adb -s TEST_DEVICE install -r android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/androidTest/dataQa/app-dataQa-androidTest.apk
adb -s TEST_DEVICE shell am instrument -w com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner
```

Replace TEST_DEVICE locally. Use the matching ARM64 APK for an ARM64 phone;
`install -r` upgrades while preserving data. Do not reset a live database to make a
test pass. Main dataQa bundles JavaScript and needs no Metro/server.

| Check | Actual result | Evidence |
|---|---|---|
| Strict TypeScript, ESLint zero-warning gate, Prettier | PASS. | [Handoff preflight](evidence/phase-04-preflight-handoff.log). |
| Jest | PASS **208 tests / 16 suites**, 35.207 s; no console/act warnings in this run. | Same final preflight log. |
| Focused App recovery/navigation | PASS **17/17**, 9.075 s, no console/act warnings. | [Recovery test log](evidence/phase-04-recovery-tests.log). |
| AST architecture | PASS **32 TypeScript modules**, no import cycles/forbidden offline dependencies; native permission/process boundary checks. | Final preflight; this is not a complete Kotlin call graph. |
| Native JVM | PASS **30 tests / 3 suites**, zero failures/errors/skips, total XML duration 0.152 s. Executed in the initial Phase 04 build; reviewed and handoff builds reused the unchanged task/XML as UP-TO-DATE. | [Handoff XML manifest](evidence/phase-04-jvm-results-handoff.json), [initial build](evidence/phase-04-android-build.log). |
| Debug/dataQa/release and AndroidTest APKs | PASS ARM64/x86_64 compile/package. Initial build 3m 59s; reviewed build 1m 19s; handoff build **2m 17s**, 320 tasks (27 executed / 293 up-to-date). | [Handoff native build](evidence/phase-04-android-handoff.log). |
| APK metadata, SHA256, permissions | PASS seven APKs inspected with SDK aapt2 and SHA256; identities below. | [Handoff artifacts](evidence/phase-04-artifacts-handoff.json). |
| Real Android SQLite/PendingIntent instrumentation | PASS **23 tests**, 4.914 s, API 37 x86_64 emulator on the installed handoff APK. | [Handoff instrumentation](evidence/phase-04-instrumentation-handoff.log). |
| Actual emulator production planner | Executed scenarios and exact installed cohorts are recorded below, without pooling them into phone acceptance. | Emulator ledgers below. |
| Physical API 30/ARM64/low-RAM/OEM/accessibility/idle matrix | **NOT RUN / HUMAN REQUIRED.** | [Manual phone guide](../../qa/PHASE-04-MANUAL.md). |
| Matched legacy/new physical performance | **NOT RUN.** | [Baseline protocol](../benchmarks/phase-00-baseline.md). |
| Remote GitHub Actions | **NOT RUN** in this session. | Local checks do not imply remote CI execution. |

Native build output retains Gradle deprecation warnings; the initial compile also
reported existing React Native package deprecation and ReminderStore typing
warnings. Handoff bundling also emitted a NO_COLOR/FORCE_COLOR environment warning.
No zero-warning native-build claim is made. Handoff SHA256 source,
benchmark and XML checks are in [handoff static integrity](evidence/phase-04-integrity-handoff-static.txt).

### Handoff artifacts and explicit earlier cohorts

| Artifact | Bytes | SHA256 |
|---|---:|---|
| x86_64 dataQa, emulator | 50,373,959 | `668d7957695b96ea7d69c8efb7b40f2e7cf8a56783808f41e8476cac57cd5ee5` |
| ARM64 dataQa, matching phone | 50,853,635 | `00c853256b30f19d7c048291c4fc25fcca153acc3712689c5236395685f46b9f` |
| ARM64 release preview | 27,407,609 | `ae1798aa2bfa4cee45715b0444852ec99cf7e758e0dede90ca6b96b399a73c39` |
| x86_64 release preview | 27,765,893 | `ed298d64e98460208744e58d06675d456123d61cd86518d5541fdbc23f6baf7b` |

Paths are `android/app/build/outputs/apk/{dataQa,release}/app-ABI-VARIANT.apk`.
Seven complete identities/permissions are in the artifact manifest. Only the
matching x86_64 dataQa was executed here; ARM64 and release APKs were compiled and
inspected, not run. Existing developer signing is a local review mechanism, not
store release approval. No APK binary is added to version control.

The first emulator cohort used x86_64 dataQa
`f4cb59e616c749689d0888132a9ef365ac69f9226f1411889d63f392b9eaac6e`.
Its tests precede the delivery-warning recovery fix. A second reviewed build
(`abb5bece778afbbbcaf51358bf6288d39f45e847c9891ca9d64600338e0507b8`)
passed all 23 instrumentation tests in 5.181 s on 2026-10-24
([rerun log](evidence/phase-04-instrumentation-reviewed.log)); it was then superseded
only to correct the quiet-hours help sentence. These cohorts remain explicit. The initial
[artifact manifest](evidence/phase-04-artifacts.json) and initial source capture
remain historical records; the latter was captured during integration and must
not be treated as proof of the first APK's exact source. The final
[handoff source manifest](evidence/phase-04-source-hashes-handoff.json) records
111 source/test/config files after source freeze and the handoff build. Only the
quiet-hours help sentence changed after the reviewed source cohort. All earlier
source and artifact manifests remain available as historical evidence.

### Executed emulator flows

Device: **sdk_gphone16k_x86_64, API 37, x86_64**, nonphysical emulator.
The [initial ledger](evidence/phase-04-emulator-initial.json) records the first APK's
six assertions: ordinary undated save with delivery off; invalid-date draft
retention; actual Android date-picker cancel/confirm; date-only edit and explicit
completion/undo; offline force-stop/reopen persistence; and native 12h picker PM
selection returning canonical `21:00`. Those are initial-cohort results.

The [handoff ledger](evidence/phase-04-emulator.json) records these actual
production-UI assertions on the installed handoff SHA above:

| Scenario | Actual outcome |
|---|---|
| Upgrade and native preconditions | Existing onboarding/preferences remained saved. Delivery temporarily enabled; notifications/exact allowed, full-screen off, quiet hours off. |
| Ordinary timed task offline | Normal Add task form saved UTC deadline 2026-10-24 15:02 with explicit lead 0. Detail showed TODO and the scheduled next alert while airplane mode was on and Wi-Fi/mobile data off. No QA quick-create/direct SQL was used. |
| Home → notification → native snooze → reopen | Android posted the synthetic notification; tapping it opened the real simulated reminder screen. Native Snooze 10 minutes updated the still-selected detail to SNOOZED/REGISTERED. Next alert changed 15:02→15:12 UTC; original academic due stayed 15:02 and task stayed TODO. |
| Explicit completion and Undo | Completing cancelled the outstanding snoozed alert. Reopening that **unhandled** occurrence rearmed its original recent-overdue alert under existing policy. After it expired to MISSED, completion/Undo preserved MISSED with task TODO and no further replay. This differs from reopening an unhandled cancellation; the latter does not restore its old snooze time. |
| Weekly class with verified fields | Normal event form saved UTC Mon/Wed 09:00–10:00, February 1–10 2027, reminders off. Every input was read back from its EditText. The class appeared on Feb 1 and Feb 8, on inclusive final Wednesday Feb 10, and not after the end on Feb 11. |
| Actually revoked notification permission | API 37 POST_NOTIFICATIONS was revoked, the app reopened offline, and an ordinary future timed task with explicit reminder still saved TODO with an honest blocked-notification warning. Permission was restored afterward. |
| Delete confirmation | Keep item cancelled the synthetic test deletion; Confirm delete then removed only that test task and cancelled its alert. |
| Cleanup | Original radios, delivery off, full-screen off, notification permission and exact access restored. Native diagnostics verified zero pending/ringing/registered/failed jobs. Synthetic review fixtures remain; no owner/legacy data was reset. See [cleanup](evidence/phase-04-emulator-cleanup.json). |

Screenshots show only synthetic data: [native reminder](evidence/phase-04-native-reminder.png),
[snoozed detail](evidence/phase-04-snoozed-detail.png),
[weekly source](evidence/phase-04-weekly-detail.png),
[blocked-permission save](evidence/phase-04-blocked-save.png) and
[handoff Calendar](evidence/phase-04-calendar-handoff.png).

Driver failures remain in both ledgers: initial native-switch lookup skipped a
short control; a weekly draft was not saved because validation found an over-24h duration
while the end-date input had not been read back (the original cause was not established); overlapping UI drivers caused a dump exit 137;
default redacted notification output hid an actually posted alert until its
response window expired; and the first Undo assertion incorrectly assumed an
unhandled cancellation was terminal. The corrected serial driver uses explicit
EditText readbacks and keeps unredacted notification output only in private
memory, publishing synthetic observations alone. These attempts are not relabelled
app PASS, app-delivery failure rates or new source defects.

Fresh Phase 04 notification interaction used native **Snooze**. Native **Answer/ACK**
on a new manual item, 24h native-dialog presentation, physical keyboard/TalkBack,
API 30/ARM64/low-RAM/OEM, secure lock, reboot and idle/audio/vibration scenarios
remain **NOT RUN** for this handoff. Existing unit/instrumentation and historical
Phase 03 checks remain separately identified; they do not complete physical QA.


## 4. Performance and device matrix

Fresh **host-only synthetic** measurements used Windows x64, AMD Ryzen 5 6600H,
Node **24.19.0**, SQLite **3.53.3**, TypeScript **5.9.3**, and fresh in-memory
schema-2 databases. Each query used five warmups, **50 measured successful calls**,
page size 20 and nearest-rank p50/p95. Every metric had **zero errors**.
The timer includes SQL/read decoding, timezone/recurrence and paging; it excludes
fixture generation, disk/fsync durability, Android/Hermes/bridge/rendering and
native alarms. Host scheduling/JIT/GC were not controlled. There is no matched
legacy cohort or device speed claim.

| Query | Student p50 / p95 ms: 200 tasks, 12 events | Stress p50 / p95 ms: 5,000 tasks, 60 events |
|---|---:|---:|
| Active task first page | 0.9117 / 1.5499 | 2.8070 / 4.2040 |
| Completed task first page | 0.7305 / 1.1737 | 1.3861 / 2.2012 |
| Day agenda first page | 8.7604 / 13.0962 | 62.7289 / 80.8611 |
| Day agenda next page | 7.9312 / 11.4538 | 68.7186 / 87.2658 |
| Week agenda first page | 14.0218 / 17.9263 | 140.1805 / 160.7152 |
| Source reminder history first page | 0.7022 / 1.2543 | 1.1225 / 1.4802 |

Raw samples, SQL result sizes, source hashes and environment are in the
[student cohort](../benchmarks/phase-04-queries-host-student.json), measured
2026-10-23T00:42:11.484Z, and
[current stress cohort](../benchmarks/phase-04-queries-host-current.json), measured
2026-10-23T00:42:31.477Z. The earlier
[initial cohort](../benchmarks/phase-04-queries-host.json) is retained as superseded
source evidence. Reproduction commands:

```text
node scripts/benchmark-planner-queries.cjs --cohort student --output NEW_STUDENT_OUTPUT.json
node scripts/benchmark-planner-queries.cjs --cohort stress --output NEW_STRESS_OUTPUT.json
```

Use new output paths for reruns; do not overwrite a baseline as a fresh result.
Task/history SQL returned 21 rows for page 20. Largest single agenda SQL batch was
50 rows; the stress day/week scan returned 682/858 candidate rows across multiple
batches. Results are finite, but query work is not constant: agenda pages rescan
matching candidates; offsets and ended weekly source history can still cost CPU.
The desktop stress week p95 **160.7152 ms** is a reason to measure larger agendas
on target phones, not a phone performance PASS.

Maximum observed host RSS across discrete checkpoints was **121,102,336 bytes**
for the student cohort and **129,851,392 bytes** for stress. These are Node process
checkpoints, not continuous peaks, Android PSS, incremental planner allocation or
a low-end memory budget result. The native active-job materialization limitation
from Phase 03 is unchanged by product paging.

The handoff emulator had 16,384-byte pages and kernel MemTotal **4,008,368 KiB**;
this is environment metadata, not a low-RAM phone result. The functional ledger
retains one ordinary scheduled-due→`NOTIFICATION_POSTED` sample of **47 ms**
(native claim **14 ms**) at 15:02 UTC. These timestamps are after the native post
call, not first visible/audible output. A later **109,324 ms** due→post interval
belongs to explicit Undo rearming the same original recent-overdue deadline;
it is not latency from the Undo command. Do not pool those scenarios. Diagnostics
show only the latest ten events; the earlier first reminder's timing aged out.
This small functional capture is not a repeatable baseline, percentile estimate,
reliability rate, physical target PASS or comparison with Phase 03/legacy.

| Required device metric | Phase 04 status |
|---|---|
| Actual physical reminder drift/reliability, notification/audio/vibration | NOT RUN on a physical phone; emulator scenarios below do not establish physical reliability or audible output. |
| Physical release-like cold/warm startup n/p50/p95/failures | NOT RUN. |
| Peak main/native PSS and low-RAM capacity | NOT RUN. |
| Battery/idle/Doze/OEM behavior | NOT RUN. |
| Matched pinned legacy/new comparisons | NOT RUN. |
| STT WER/latency, system TTS/Kokoro comparison | NOT RUN; speech engines are outside Phase 04. Kokoro remains excluded. |

Use the [Phase 00 protocol](../benchmarks/phase-00-baseline.md) and
[Phase 04 manual guide](../../qa/PHASE-04-MANUAL.md) for exact device conditions,
repeat measurements and command procedures. Do not substitute host figures or a
single emulator PSS snapshot for those physical results.

## 5. Reliability, privacy, permissions, licenses

- Local saves remain synchronous transactional writes through the existing
  repository, followed by optional native effects. A delivery failure cannot
  report the committed item as lost. Version conflicts/read failures are visible;
  inputs stay available for correction/retry, and stale detail actions are hidden
  until a fresh read succeeds.
- Product UI uses scoped pages/window reads rather than QA `snapshot()`. Cursor
  scope validation and parameterized values prevent cross-window misuse. Finite
  returned arrays do not remove agenda rescans, native active-job allocation or
  SQLite's internal cache/sort costs. No automatic archival/deletion policy was
  introduced.
- Existing Phase 03 Android permissions remain: `POST_NOTIFICATIONS`,
  `SCHEDULE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `RECEIVE_BOOT_COMPLETED` and
  `VIBRATE`, plus the AndroidX signature permission. Notification access is a
  dangerous runtime permission on API 33+. Debug additionally has development
  INTERNET/overlay declarations; bundled dataQa/release should retain no network,
  microphone, telephony or foreground-service permission. Actual aapt2 inspection
  confirmed these QA/release declarations; Debug development permissions differ.
- Native picker work adds no permission, account calendar, runtime dependency,
  audio recording or cloud request. It validates components and cancellation;
  timezone/instant semantics remain in the domain.
- Lock-screen/full-screen behavior is OS-controlled and opt-in. Normal/inexact
  alarms can be delayed by permission, quiet hours, idle/Doze and OEM restrictions.
  Force-stop prevents delivery until the user reopens the app. Neither source
  review nor mocked tests certify phone behavior.
- Synthetic titles/fixtures only belong in public evidence. Do not publish real
  schedule titles, local databases, personal notifications, serials, audio or
  transcripts. No legacy source/asset copy or dependency/model binary was added;
  owner reuse authorization remains recorded, with detailed provenance terms still
  to follow. Existing third-party advisory/provenance limitations are not relabelled
  as a fresh clean dependency audit.

## 6. Human phone verification

All physical checks remain **NOT RUN / HUMAN REQUIRED**. Record phone model,
Android API/RAM/ABI, installed version/hash, schedule timezone, permission/channel/
battery settings, scheduled/observed times and failures. Use synthetic titles and
the matching **0.4.0-data-qa**, versionCode **4**, APK from the handoff artifact manifest.
Upgrade with `adb install -r`; preserve existing preferences/items. Do not clear
app data or uninstall a live installation. Exact full procedures and acceptance
matrix are in [PHASE-04-MANUAL](../../qa/PHASE-04-MANUAL.md).

1. Open Today/Calendar in airplane mode with Wi-Fi/data off. Create undated,
   date-only and timed tasks plus an event without a reminder. Expect durable
   records, correct task filters/day dates and no account, internet or speech
   dependency. Reopen after closing the app and confirm persistence.
2. Use Previous week/Today/Next week, named weekdays, date picker and manual date
   entry. Change the view between 12h/24h. Expect the same schedule instants; invalid
   dates retain the prior valid day. Test keyboard reachability, TalkBack and large
   font on the real phone.
3. Create a bounded weekly class on two selected weekdays, including the start
   weekday. Inspect the inclusive end-date occurrences and whole-series edit
   warning. Invalid end/time/lead/day/horizon must keep the draft and show a clear
   error. Test DST gaps/folds with synthetic future schedules without changing the
   phone clock. Changed forms must ask before Back/tab/Cancel discards them.
4. In Settings → Reminder delivery, enable delivery, request notification access
   and check exact access/channel settings. Create a timed task several minutes
   ahead, lead 0, then press Home. Expect an actual Android notification when
   settings permit. Tap the simulated reminder and snooze. Return to the still-open
   detail: next alert time changes, academic due time does not, task remains active.
   Wait for the next alert and acknowledge; expect ACKNOWLEDGED, not COMPLETED.
5. Explicitly Mark task complete, then Undo completion. Expect the corresponding
   source status and no replay of ACKNOWLEDGED/MISSED alerts. Reopening an unhandled
   cancelled occurrence can rearm its original alert, including a recent-overdue
   alert; the cancelled snooze time is not restored. Cancel a pending alert and confirm
   deletion of a separate item; source/other items and unrelated alerts must remain
   correct. Test denied notifications/exact/full-screen access with manual CRUD
   still available and honest delivery warnings.
6. Repeat the detailed background/locked/secure-lock, concurrent reminders,
   time/timezone, reboot/unlock, force-stop/reopen, expiry, revoked access and
   idle/OEM cases from the guide. Check audible output and vibration physically;
   emulator visuals are insufficient. Collect privacy-safe timing/error outcomes
   and low-RAM/startup/battery observations using the linked protocol.

For synthetic storage fault injection use the automated tests/disposable test
installation; never corrupt a real database or fill a phone to manufacture an
error. If a real error occurs, record the visible result and retry behavior, without
publishing private SQL/database/notification dumps.

## 7. Docs/ADRs changed

- [Execution checklist](phase-04-checklist.md),
  [manual planner architecture and Mermaid diagram](../phase-04-manual-planner.md),
  [ADR-016 finite product queries](../decisions/ADR-016-planner-queries.md),
  [ADR-017 manual UI/save boundaries](../decisions/ADR-017-manual-planner-ui.md).
- [Independent audit verification](../audits/phase-04-independent-audit.md),
  [new UI code review](../audits/phase-04-code-review.md),
  [pinned selective reuse](../audits/phase-04-legacy-selection.md),
  [physical manual checklist](../../qa/PHASE-04-MANUAL.md), host benchmark JSON above.
- README, architecture, requirement matrix, decision log and risk register updated.
  Schema stays 2; no migration is added. [Phase 04 provenance](../third-party/phase-04-provenance.md) records unchanged dependencies and selective reference boundaries.
- `npm run check:architecture` actually passed for 32 TypeScript modules. Graphify
  was unavailable in a fresh [tool availability check](evidence/phase-04-graphify.json); the AST boundary/cycle check and
  explicit Mermaid ownership diagram are the documented substitute. They do not
  establish a complete native graph or runtime proof.

## 8. Open blockers and recommended next steps

1. **Human acceptance gate:** real Android API 30+/ARM64/low-RAM/OEM, secure
   lockscreen, audibility/vibration, accessibility and lifecycle matrix remain
   unconfirmed. Complete the guide and record actual results before calling this
   phase passed.
2. **Native capacity:** `listCurrent()` still materializes all active rows before
   applying its work cap. Product paging does not fix that allocation. No unsafe
   hard limit or unapproved archival deletion policy was introduced; measure the
   real capacity on target phones before choosing a native query change.
3. **Capacity/performance:** physical release-like startup/peak memory/battery and
   matched legacy comparison remain NOT RUN. Measure realistic semesters and dense
   synthetic agendas; product array bounds do not guarantee short scans. Any
   performance-driven query/schema/native paging change needs measured evidence
   and its own ADR.
4. **Known omissions:** month grid/search, persistent display-format preference,
   occurrence exceptions, whole-data export/erase, speech/intent/model and online
   work are not part of this implementation. The existing native ten-minute snooze
   differs explicitly from preference-based in-app snooze. Undo of an unhandled
   cancellation can rearm the original deadline rather than its cancelled snooze
   time; terminal ACKNOWLEDGED/MISSED outcomes remain protected.

No Phase 05 work is authorized or started. System TTS, STT, offline scheduling
commands, model decisions and Gemini/RAG retain their approved later-phase gates.

## 9. Review decision

- [x] All automated required checks passing in current-source evidence: 208 Jest
      tests, 30 JVM tests, native build and actual instrumentation results above.
- [ ] Manual physical-device tests completed and human-confirmed.
- [x] No disallowed feature, runtime dependency, schema migration, legacy write,
      account/cloud/speech or later-phase implementation introduced.
- [x] Report evidence/links validated and integration documentation updated;
      [final integrity record](evidence/phase-04-final-integrity.txt) records the checks.

**STATUS: AWAITING DEVICE VALIDATION**

**STOPPED — awaiting explicit human approval for Phase 05.**
