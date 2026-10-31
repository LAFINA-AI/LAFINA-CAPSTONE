# PHASE 08 — Integrated offline reminder response / Completion Report

**Current verification:** [stable-emulator report](phase-08-stable-emulator-report.md) and [stable case ledger](evidence/phase-08-stable-case-ledger.json) (2026-10-31): aggregate unchanged at 45 PASS / 2 FAIL / 1 NOT RUN; retained A03/V03 failures coincide with observed emulator audio-path (virtio-snd/HAL) faults, an evidence-supported localization rather than an established root cause; STATUS BLOCKED. Low-load H3b comparison: NOT RUN (host admission unmet; [record](evidence/phase-08-stable-lowload1-not-run.json)). Previous: [capture-fix report](phase-08-capture-fix-report.md), [case ledger](evidence/phase-08-capture-fix-case-ledger.json) and [APK ledger](evidence/phase-08-capture-fix-artifacts-final.json): 45 PASS / 2 FAIL / 1 NOT RUN.44 prior scoped passes retained plus10 selected affected trials; all failures remain. V05 and all physical acceptance/signatures remain pending. The implementation/results below preserve historical cohorts. No stable offline release or Phase09+ approval.

**Branch / base HEAD:** `codex/phase-07-audit-hardening` / `98bef88c3ae0fabee677c1466417fc34c0af738c`.
Changes are a local working-tree patch; no commit, push, PR, merge or deployment.
**Date:** 2026-10-27–28 Asia/Manila; UTC timestamps are retained in the evidence.
**Original-cohort integrity check UTC:**2026-10-28T01:44:25Z.
**Device:** Medium_Phone / `sdk_gphone16k_x86_64`, API37 beta, x86_64,16KiB pages.
No physical phone. **Candidate:**0.8.0-data-qa/code11, `com.lafina.capstone`, schema3.
**Status:** `AWAITING DEVICE VALIDATION`.
**Approval:** owner wrote `APPROVE PHASE 08`, explicitly retaining NOT RUN physical
gates, then instructed continuation through the report and manual checklist.

This report preserves the original Phase 08 implementation and verification
cohort. Its test counts, artifact hashes, restoration state and notification-entry
limits below are historical results for that cohort. The later
[emulator expansion addendum](phase-08-emulator-expansion-report.md),
[case matrix](evidence/phase-08-emulator-expansion-matrix.json) and
[expansion artifact manifest](evidence/phase-08-expansion-artifacts-matched.json)
identify the earlier task-isolated candidate and subsequent results. The addendum
records the notification-harness completion barrier, real reminder-reopening fix
and synthetic speech failures. Physical acceptance remains pending in both cohorts.

## 1. Scope completed

F-006/F-007/F-008/F-010/F-011/F-012/F-014 share a native foreground response
flow. Answer opens the visible response screen **without ACK**. Optional Android
offline system TTS respects the saved reply preference. The user deliberately
holds the microphone, types, or chooses a manual control. Recognition is first
reviewed/copied into a draft; **Review response → Confirm** is required before
ACK/snooze. ACK leaves the task TODO. A successful action reconciles Android
alarms and closes; an OS-reconciliation failure reports the saved action with
delivery uncertainty instead of falsely saying it was unsaved.

The strict contextual English grammar accepts explicit ACK or snooze1–120minutes;
bare snooze/manual button means10minutes. It refuses extra clauses, task completion,
deletion, controls and unsupported input. It cannot execute Chat's general
scheduling commands. No schema/model/dependency/permission change or legacy copy.
Notification ACK/snooze remain explicit direct receiver actions with their prior
identity/state checks. No account/backend/Gemini/RAG/Kokoro or Phase09+ work.

The original ringing deadline remains in force after Answer. Pending reviews are
single-use and invalidated by edits, cancellation, capture, timeout, pause or
replacement. Wall-clock and bounded monotonic checks prevent a view from
extending its response window. The transaction rechecks source version and the
reviewed deadline, including a title edit that kept the alarm identity. Manual
text/buttons remain available on speech failure; no callback starts recording.

## 2. Change summary

| File/module | Change / reason | Evidence |
|---|---|---|
| ReminderActivity | Answer/response ownership, review, deadline/lifecycle fences, speech cancellation, separate saved/delivery outcomes | JVM/session tests; emulator section below |
| AnsweredDictationPanel | Explicit draft-to-review handoff, TTS stop before capture, no automatic microphone | Compiler/native speech tests; physical recording pending |
| ReminderResponsePolicy + Session | Bounded exact parser, immutable selected command, one-shot review, elapsed/wall expiry |19new JVM methods; synthetic native benchmark |
| ReminderStore.action | Optional source-version/deadline guards inside existing transaction |8new real Android SQLite/pipeline tests |
| ReminderResponseUiTest | Opt-in fixture UI driver; active-window accessibility actions and whole-field text replacement |11explicit emulator invocations; no default-argument pass claim |
| Version metadata |0.8.0/code11; root lock metadata only | APK identity/signature/upgrade evidence |
| .gitignore | Ignore generated Kotlin cache; preserve its local files | Git status |
| ADR023/contracts/manual/requirements/status | Current ownership, release barrier,36alarm cases and12voice cases per voice | Links below |

## 3. Tests and real outcomes

These were fresh executions for the original Phase 08 cohort. They are preserved
below and are not relabeled as expansion results. Earlier Phase 07 reports and
benchmarks remain historical.

| Check | Actual result | Evidence |
|---|---|---|
| Windows doctor | PASS for reported inventory; default shell Java25, build explicitly used Java17. Doctor's Graphify-not-installed line is stale PATH detection, not current tooling state. | [log](evidence/phase-08-doctor.log) |
| Full preflight | PASS:528Jest tests/35suites,124.374s; strict typecheck, ESLint, Prettier,61-module architecture/offline boundary/cycle check | [log](evidence/phase-08-preflight.log) |
| Android JVM | PASS:81tests/8suites,0.922s summed XML time, including19new policy/session tests; task-specific `--rerun` | [final XML summary](evidence/phase-08-jvm-results-final.json) |
| Android build | PASS after dialog fix: debug/dataQa/release, ARM64+x86_64, matching instrumentation APK;7m12s,376tasks/39executed | [final log](evidence/phase-08-android-final.log); [initial build](evidence/phase-08-android-initial.log)13m9s preserved |
| Native instrumentation | PASS on corrected candidate:53tests,16.769s;52functional +1synthetic component benchmark. Reviewed Whisper corpus benchmark explicitly excluded. | [final log](evidence/phase-08-instrumentation-final.log); [initial](evidence/phase-08-instrumentation.log) preserved |
| Frozen Chat command regression | PASS:64/64 exact,88/88 slots,0unsafe-ready refusal proposals,6,400repeated calls/0failures | [JSON](../benchmarks/phase-08-intents-host.json), [log](evidence/phase-08-intents-host.log) |
| APK inspection | PASS:7APKs,84native libraries;16KiB ELF/ZIP alignment, reviewed model/license digests; QA/release have no INTERNET permission | [final manifest](evidence/phase-08-artifacts-final.json); [initial manifest](evidence/phase-08-artifacts.json) preserved |
| Known-lineage upgrade | PASS: installed0.7.3→0.8.0 with matching certificates and `install -r`; schema/counts/preferences hash preserved | [before](evidence/phase-08-upgrade-before.json), [upgrade](evidence/phase-08-upgrade.json) |
| Actual emulator UI/storage | PASS:11opt-in UI invocations plus independent production-SQLite snapshots; Answer keeps RINGING/TODO, ambiguity refused, Keep editing, confirmed ACK/TODO, one snooze generation, original timeout/MISSED and owned-fixture cleanup | [ledger](evidence/phase-08-emulator-device-ui.json), [log](evidence/phase-08-emulator-device-ui.log) |
| Physical phone/live speech/audibility | NOT RUN / HUMAN REQUIRED | [manual](../../qa/PHASE-08-MANUAL.md) |

Initial sandbox Gradle execution could not open the existing global wrapper lock;
the authorized retry used the existing cache/SDK outside that sandbox, offline.
The failed environment log is [preserved](evidence/phase-08-jvm-initial.log).
Compiler/Gradle warnings remain visible, including data-class copy visibility,
existing store type-inference warnings and Gradle10 deprecations; no warning was
reclassified as a compiler failure. No dependency/tool upgrade was performed.

In the original cohort, the opt-in UI test APK was compiled separately after the production artifacts
were frozen. Its initial accessibility-constant compile failure and later
driver-label/window corrections remain in the `phase-08-ui-driver-build*.log`
files. The final [active-window build](evidence/phase-08-ui-driver-build-active-window.log)
passed1m8s. All six production APKs and the13previous source/config/test hashes
remain unchanged; the final cohort has14files including this driver. The53base
instrumentation results predate only that added test driver, not a production
change; the11explicit UI invocations verify the added driver against the same app.

The original emulator UI cohort ran with airplane mode ON and Wi-Fi/mobile data OFF
([radio ledger](evidence/phase-08-emulator-offline.json)). Real scheduled alarms
became RINGING and recorded notification posting. The successful native UI
cohort opened the same private Activity through a test-UID intent; final
**System UI notification tapping/full-screen eligibility was not certified in
that original cohort**. Later actual notification interactions have their own
bounded assertions in the expansion addendum; physical full-screen eligibility
is still pending.
This is typed/manual UI integration evidence, not live STT/TTS/audibility or a
physical-phone release gate. The answer-only run also observed no active audio
recording configuration.

Commands from the repository root:

```powershell
npm run doctor
npm run preflight
node scripts/benchmark-intents.cjs --evaluation regression --output docs/benchmarks/phase-08-intents-host.json
$env:JAVA_HOME='C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME='C:/Users/USER-PC/AppData/Local/Android/Sdk'
$env:NODE_OPTIONS='--max-old-space-size=512'
$phaseModel=Join-Path (Get-Location) '.local/phase06-whisper-assets'
$phaseCorpus=Join-Path (Get-Location) '.local/phase06-corpus'
./android/gradlew.bat -p android :app:testDataQaUnitTest --rerun :app:assembleDebug :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' "-PwhisperModelDir=$phaseModel" "-PsttCorpusDir=$phaseCorpus" '-Dorg.gradle.jvmargs=-Xms64m -Xmx768m -XX:MaxMetaspaceSize=512m -XX:+UseSerialGC -Dfile.encoding=UTF-8' '-Pkotlin.compiler.execution.strategy=in-process' --offline --max-workers=1 --no-daemon --console=plain
$phaseAdb='C:/Users/USER-PC/AppData/Local/Android/Sdk/platform-tools/adb.exe'
& $phaseAdb -s emulator-5554 install -r android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk
& $phaseAdb -s emulator-5554 install -r android/app/build/outputs/apk/androidTest/dataQa/app-dataQa-androidTest.apk
& $phaseAdb -s emulator-5554 shell am instrument -w -e notClass com.lafina.capstone.voice.WhisperCorpusBenchmarkTest com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner
graphify update .
```

`ReminderResponseUiTest` is opt-in and assumes/skips without `qa08_mode`. Use the
compiled DataQa test APK and class
`com.lafina.capstone.reminders.ReminderResponseUiTest`; supported modes are
`compose`, `answer`, `ack`, `snooze`, `timeout`. Compose accepts only synthetic
QA08 create/quoted-delete commands in `qa08_command_base64`. Native modes take
`qa08_job_base64`, `qa08_occurrence_base64`, `qa08_generation` and
`qa08_title_base64` for an already-created, currently ringing owned fixture.
Job IDs are the existing compound IDs, not UUIDs. Invocation examples and stages
are in the ledger and `phase-08-ui-focused-*.log`; the human checklist remains
the reproducible phone entry point. Never use student fixtures or interpret a
missing-argument skip as a successful UI run.

Model/corpus inputs already existed locally and Gradle verified their pinned
license/size/checksums. No download or new model approval is inferred.

## 4. Performance and device matrix

| Cohort | Measured | Limit |
|---|---|---|
| Host frozen Chat parser | p50/p95:0.03195/0.42310ms;max23.767ms,6,400calls | Frozen synthetic regression, under build/emulator load; no phone/legacy comparison |
| API37 x86_64 DataQa response component (final) |1,200samples,240warmups,0failures;p50/p95:458.4/2,141.6µs;max21,363.1µs | Parse+new session+review consume/refusal only; no SQL/UI/audio/full loop |
| Physical ARM64/API30/31/newer/2–3GB phones | NOT RUN | No supported-device/RAM-floor or performance acceptance claim |
| Live STT/TTS/full interaction p50/p95, peak PSS, release startup, battery, alarm drift | NOT RUN | Human/device measurement required; no matched old/new baseline |

[Final native benchmark JSON](../benchmarks/phase-08-native-response-emulator-final.json);
[initial cohort](../benchmarks/phase-08-native-response-emulator.json) remains preserved.
The [device-status JSON](../benchmarks/phase-08-device-status.json) keeps unmeasured
phone metrics null, explicitly NOT RUN.
The [device protocol](../benchmarks/phase-08-device-protocol.md) defines the
remaining matched release-like cohorts. One emulator launch during a concurrent
build is not a startup benchmark. Architecture performance acceptance remains
pending; no speed, battery, memory or voice-quality improvement is claimed.

## 5. Reliability, privacy, permissions, licenses

One schema3 database and existing native transactions remain authoritative.
ACK changes reminder delivery only; snooze advances one generation. SQLite
rollback, stale edits/deadlines, competing reviewed responses and duplicates have
native coverage. UI confirmation is memory-only and cannot survive a hidden or
replaced view. Already-submitted confirmation may finish durably after hiding;
resume rereads the store rather than retrying an old proposal.

No new permissions, cloud client, account or network voice fallback. In the
original cohort, host mic input was not enabled; emulator startup used
`-no-audio` and automated UI did not attempt recording. The later expansion
used explicit visible capture with pinned synthetic virtual input and host mic
OFF; neither cohort establishes live human speech or audibility. Private DB/APK/UI
captures used for upgrade inspection stay in ignored `.local/`; public evidence
contains only synthetic fixtures, counts/hashes and non-sensitive device details.
Notes removal still hides saved text/history, including receipts; it is not purge.
Existing third-party/model licenses and notices remain unchanged.

The original-cohort [restoration/integrity ledger](evidence/phase-08-restoration.json) verifies every
original preference value and its exact payload hash, all original non-diagnostic
database rows, and the installed final APK hash. An early setup-driver edit
unintentionally changed the nickname; the final comparison caught it and the
original was restored privately through the UI. No private value is disclosed.
All7owned synthetic tasks are removed, with their disclosed tombstones/receipts
retained. Active jobs and alarm registrations are0. Delivery/full-screen are
back to OFF/OFF; radios are restored to airplane0/Wi-Fi1/mobile1. No active
RECORD_AUDIO operation was reported. Saved theme/clock/week-start and all other
preferences match the baseline. The headless emulator is foreground on Calendar.
No uninstall, data reset, database replacement or downgrade occurred. These
restoration counts/settings describe the original cohort only; current expansion
restoration is recorded separately in the addendum.

## 6. Human phone verification

Follow [the concrete manual](../../qa/PHASE-08-MANUAL.md). First establish known
capstone lineage/signature compatibility, install the ABI-matching0.8.0candidate
with `adb install -r`, and verify saved data. No uninstall/clear-data/downgrade.
Open Profile, deliberately enable delivery and temporarily set lead0. In Chat
review/confirm a named two-minute QA08 reminder, then test airplane-mode locked
delivery. Answer must not ACK or record. Read/Stop, deliberate hold/release or
manual input, Review response/Keep editing/Confirm, ACK-task-TODO and one snooze
generation must all be observed on the phone. Remove only owned fixtures and
restore preferences, permissions, radios and volume.

The36-case alarm matrix and12-case voice matrix per tested voice remain unsigned
and NOT RUN on phones. API30/31, ARM64/low-memory/OEM/Doze/reboot/time changes,
audio interruptions, live speech/actual audibility, keyboard/TalkBack and device
performance/battery require human evidence. Emulator/mocks do not fill those cells.

## 7. Docs/ADRs changed

[ADR023](../decisions/ADR-023-foreground-reminder-response.md),
[flow contract](../phase-08-offline-loop.md),
[architecture](../02-ARCHITECTURE.md), [requirements](../../qa/REQUIREMENTS-MATRIX.md),
[execution checklist](../../qa/PHASE-08-EXECUTION.md),
[manual](../../qa/PHASE-08-MANUAL.md), [performance protocol](../benchmarks/phase-08-device-protocol.md),
README and [current index](CURRENT-STATUS.md).
Graphify AST update passed with the known partial Kotlin/Gradle coverage; its
[final UI-inclusive log](evidence/phase-08-graphify-ui-final.log) is navigation evidence, not compiler/device
proof. No paid semantic extraction/key/watcher was invoked. TS cycle/boundary
gate passed in preflight. Schema remains3; no migration is needed.

## 8. Open blockers and recommended next steps

1. Complete physical acceptance and matched performance cohorts; investigate any
   failed case before a stable offline release decision.
2. Record actual unsupported OS/OEM conditions and signed human results in the
   [Offline Core Release Gate](phase-08-offline-core-release-gate.md).
3. Keep Phase09+ blocked by that release decision. No online work is authorized.

During concurrent build/emulator startup a **System UI** not-responding dialog
appeared; Wait recovered navigation. `dumpsys activity lastanr` reported no app
ANR since boot. This emulator condition is recorded, not a phone-performance pass.
The initial UI driver treated the empty composer placeholder as unknown text;
its failed attempt is [preserved](evidence/phase-08-emulator-flow-attempt-1.log).
Form-label targeting/keyboard settling were also corrected before alarm checks;
these are driver setup errors, not successful product trials. The next attempt
found a real `BadTokenException` when opening a native response dialog. The
[failing UI attempt](evidence/phase-08-emulator-flow-attempt-2.log) and
[capstone-only crash trace](evidence/phase-08-dialog-crash-initial.log) remain.
The original correction made the themed context wrap the Activity and apply its configuration before
resources are accessed, preserving the dialog window token. That correction
triggered the final native build/JVM/instrumentation reruns above. Initial
crashing-candidate hashes are historical. The corrected manifest below also
belongs to the original cohort; use the expansion manifest for current artifacts.

Later failed driver cohorts remain preserved: the host notification selector
opened a System UI screen ([attempt3](evidence/phase-08-emulator-flow-attempt-3.log));
the initial device driver missed uppercase native button labels, then selected
closing/background dialog nodes ([attempt1](evidence/phase-08-emulator-device-ui-attempt-1.log),
[attempt2](evidence/phase-08-emulator-device-ui-attempt-2.log)). The independent
SQLite check rejected that second driver's apparent success because no ACK had
been saved. The final active-window driver waits for dialog transitions and
verifies against SQL; only its final11invocations are counted as passing. No
failed result was discarded or relabeled as physical acceptance.

Original-cohort x86_64 QA SHA256 (historical; superseded):
`dee84d363d44ab58befdbc7ee7aa2d36fe7c568381e4c90e8680ac888d154a4e`.
Original-cohort ARM64 QA SHA256 (historical; superseded):
`ee63ef8e6f541cc4c7495ab5d4e50ee036c45fc983672bdfd0bfe6146ae45ba0`.
Original-cohort ARM64 release preview SHA256 (historical; superseded):
`c05dd963c53eead87e7405cfc16c822143532e29cca424248acbe1c7aaaa56ec`.
All use the existing development signing configuration; these are local QA/preview
artifacts. [Source/config/test hashes](evidence/phase-08-source-hashes-final.json)
identify that original compiled cohort. Use the expansion manifest linked above
for the current artifacts.

## 9. Original-cohort review decision

These checkboxes preserve the original handoff; the expansion addendum records
the current verification and restoration decision.

- [x] Fresh available JS/native automated checks and builds pass.
- [x] Available emulator typed/manual UI/storage subset finalized and settings restored.
- [ ] Physical-device matrix, performance and signed human review completed.
- [x] No disallowed feature/model/dependency/schema/legacy or remote change.
- [x] Final evidence links/integrity and current status checked: [validation ledger](evidence/phase-08-validation-final.json).

**STATUS: AWAITING DEVICE VALIDATION**

**STOPPED — awaiting explicit human approval. Phase09+ has not been started.**
