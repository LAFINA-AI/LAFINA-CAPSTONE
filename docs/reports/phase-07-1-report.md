# Phase 07.1 — selective incoming integration / Completion report

**Branch:** `codex/phase-07-1-integration`  
**Checkpoint:** `0d06b24f0e650df03baf4e0f6abbe5e385e48916`  
**Incoming:** `9c183a20eca2377b5e54f219c5f83460b18af81b`  
**Integration commit:** `ac6ea2a0fbe693c67289491c1b0179cbfee9ebdc` (local merge;
parents are the saved checkpoint and incoming revision). A final documentation/
verification commit records this result without changing application source.
**Date:** 2026-10-26, Asia/Manila; exact UTC run times in evidence.  
**Device:** existing Medium_Phone, `sdk_gphone16k_x86_64`, API37 beta,
x86_64/16KiB-page emulator (`emulator-5554`); no physical phone.  
**Status:** `AWAITING DEVICE VALIDATION`; available automation/current-build
emulator checks, fixture cleanup and original-settings restoration are complete.
**Approval:** owner requested git pull, thorough audit, integration and tests of
the friend's changes as Phase07.1 before Phase08, then wrote `continue`.
No Phase08 or online-service authorization is inferred.

## 1. Scope and merge decision

Requirements preserved/extended: F-001/F-002 anonymous setup/local preferences;
F-003/F-004 manual planner and calendar; F-005–F-008 native reminder state and
ACK separation; F-009 confirmed offline commands; offline/architecture/theme
constraints. Existing speech requirements remain conditional/device-pending.

Fetched12 incoming commits:1417 changed paths against `b3eefb8`, including1129
vendor-source paths and288 other paths;434,526 insertions/11,598 deletions.
The incoming branch is an application replacement, not a compatible incremental
addition. Saved all existing Phase04–07 work first, then executed:

```powershell
git switch -c codex/phase-07-1-integration
git add -A
git commit -m "chore: checkpoint reviewed Phase 04 through 07 offline core before integration"
git pull --no-commit --no-ff origin main
# 73 conflicts recorded. Resolve replacement conflicts to the saved checkpoint:
git restore --source=0d06b24f0e650df03baf4e0f6abbe5e385e48916 --staged --worktree -- .
# Then selectively adapt reviewed presentation and save the merge locally.
git commit -m "merge: integrate reviewed LAFINA presentation with confirmed offline core"
```

The [pull log](evidence/phase-07-1-pull.log),
[73 conflict paths](evidence/phase-07-1-conflicts.txt) and
[integration inventory](evidence/phase-07-1-integration-inventory.json) retain the
actual operations and source IDs. No main edit, force push, remote publication,
legacy write, uninstall or student-data reset. Upstream history remains retained
even for features excluded from this integrated working tree.

| Incoming area | Decision / resulting behavior |
|---|---|
| Month calendar | Adapt layout/date selection into current Calendar. Default Month, optional Day, Previous/Next month, Today, selected/today styling. Maximum42cells; date-only UTC calendar math; actual planner bounds2000–2100. Existing20-item day agenda remains authoritative. No invented item counts or full-history scan. |
| Navigation/theme/brand | Rounded tab styling, reviewed decorative logo and warm light/dark neutral surfaces. Preserve Today/Calendar/Chat/Settings, existing semantic contrast pairs, navigation guards and normal layout. Grid-only horizontal scroll preserves48dp targets on narrow screens. |
| Database | Keep `lafina-capstone.sqlite` schema2, existing migrations/settings and atomic writes/receipts. Incoming `lafina.db` schema17 has no migration from our schema and is excluded. Existing friend installations need a separately reviewed import if required; no automatic import/delete. |
| Alarms/reminder calls | Keep current native isolated process/provider, generation/occurrence identities, legal transitions and paired SQLite state. No SharedPreferences replacement scheduler/poller. ACK still leaves a task TODO. |
| STT/TTS/intent engine | Keep verified optional Whisper Tiny path, Android on-device candidate, native offline system TTS/text fallback, editable transcript and private expiring Confirm change boundary. No direct incoming voice actions. |
| Models/dependencies | No new package, ONNX runtime, larger Base English model or Silero asset accepted. Incoming binaries remain in Git history; not the integrated build. |
| Accounts/cloud/sync/updater/notes/import-export | Excluded/deferred. No login, Pro entitlement, automatic sync, cloud speech, backend or self-updater is activated. Phase08+ gates remain intact. |
| Instructions/reports/tests | Preserve owner standing instructions, prior factual reports/baselines and existing behavioral suites. Incoming phase rewrites/reports do not grant authorization or replace prior evidence. |

## 2. Audit findings and resolution

Detailed pinned evidence and limits:
[data audit](../audits/phase-07-1-data-audit.md),
[native audit](../audits/phase-07-1-native-audit.md),
[final integration source review](../audits/phase-07-1-integration-review.md).

| Confirmed incoming problem | Evidence / resolution |
|---|---|
| Different DB hides existing data; failure returns empty success | Actual incoming source under inert injected SQLite stubs returned accepted/afterCommit with0affected rows. Keep current fail-visible driver/repository and existing file. |
| Async callback writes after transaction commit | Probe recorded BEGIN → COMMIT → async write. Keep current synchronous-only boundary and rollback quarantine. |
| Negated/contradictory speech triggers ACK; first substring task mutation | Extracted actual parser yields ACK for `do not acknowledge`, `acknowledge but remind me later`, and `knowledge`. Incoming modal mutates directly. Keep strict validation, exact target uniqueness/version checks and review/confirmation. |
| Alarm IDs collide / stale or concurrent alarms lose state | `FB`/`Ea` both Java hash2236; SharedPreferences single payload and unguarded dispatch lack current generations/duplicate fences. Keep existing native runtime. Collision probe is not a registered Android alarm. |
| Missing network flag accepted as offline voice | Actual selector accepts unknown network requirement; default TTS availability can be true without selected offline voice. Keep fail-closed native voice selection and text fallback. |
| Calendar UTC slicing changes chosen local date | Reproduced UTC+08 October27 midnight → October26. Adapted calendar passes date-only strings; repository owns timezone conversion. |
| Non-atomic task/reminder edits and title-based deletion | Incoming source can duplicate reminders/cancel another same-title source. Keep source-ID/generation atomic current repository. |
| Broadened permissions/cloud scope and weakened tests | Retain restricted manifest, complete preflight including format check, current62JVM/42Android checks and all prior453JS tests. |

The positive incoming ACK/task separation was also verified in inert SQL stubs;
not every incoming behavior was defective. Source probes reproduce specific
defects, not complete incoming Android acceptance. Incoming full preflight,
Android runtime, inference and matched device performance were **NOT RUN**.

## 3. Files changed

| Files/modules | Change / reason |
|---|---|
| `features/calendar/CalendarMonth.tsx`, `calendarMonthModel.ts`, `PlannerScreen.tsx` | Adapt incoming visual month selector to current typed date/paged planner API; retain existing manual tools. |
| `app/App.tsx`, `core/theme/theme.ts`, `assets/lafina_app_logo.png` | Reviewed brand/rounded tabs/theme; preserve routing/dirty-state guards. |
| `scripts/check-architecture.mjs` | Verify static local image leaves exist inside src; executable dependency/network/cycle checks retained. |
| `android/app/build.gradle`, `package.json`, lock metadata | Matching0.7.1/versionCode8 for local upgrade; dependency versions unchanged. |
| `__tests__/CalendarMonth.test.tsx` | Eleven new date/selection/boundary and repository-backed integration tests; previous453 tests retained. |
| Two `scripts/audit-incoming-*.cjs`, audits/evidence | Reproducible pinned pure/inert source probes; no cloud/native/studentDB execution. |
| README, architecture/decision log, ADR-021, risk/provenance/manual docs | Explicit accepted/deferred integration contract and human checks. |

Git diff against checkpoint confirms no content change in existing domain,
storage, command, native adapter/voice, Kotlin, C++ or main manifest. Frozen
raw-file hashes show97 changes/6 additions across266files. The
[normalization check](evidence/phase-07-1-line-ending-check.json) separates90
line-ending-only changes from7 changed existing source/configuration files;
do not label all97 as logical code changes.
The current source manifest records actual disk bytes, separate from normalized
Git content.

## 4. Automated tests and actual build results

| Check | Actual result | Evidence |
|---|---|---|
| Initial full preflight | FAIL:463pass/1fail; new brand caption matched onboarding-only heading. Corrected caption; did not weaken existing test. | [initial log](evidence/phase-07-1-preflight-initial.log) |
| Reviewed `npm run preflight` | PASS: strict TS, ESLint0warnings/errors, formatting,464JS tests/28suites22.883s, AST46modules/no cycles or forbidden dependencies. | [reviewed log](evidence/phase-07-1-preflight-reviewed.log) |
| Final preflight after large-text navigation fix | PASS: same464tests/28suites43.697s and46-module AST gate; all type/lint/format gates passed. This is a second cohort, not a faster/slower performance comparison. | [final log](evidence/phase-07-1-preflight-final.log) |
| Native builds | PASS12m44s;320tasks80executed240up-to-date; debug/dataQa/release ARM64+x86_64 and dataQaAndroidTest. | [build log](evidence/phase-07-1-android-initial.log) |
| Final APK rebuild after layout fix | PASS2m31s;315tasks27executed288up-to-date, same ABI/build variants. Native implementation unchanged; no fresh JVM run claimed here. | [final build log](evidence/phase-07-1-android-reviewed.log) |
| JVM `:app:testDataQaUnitTest` | PASS62tests/6suites0failures0.135s; task executed, XML hashes recorded. | [JVM evidence](evidence/phase-07-1-jvm-results-initial.json) |
| Android native instrumentation | PASS42tests21.578s on integrated installed0.7.1, emulator. Excluded old Whisper corpus benchmark; no new STT accuracy cohort implied. | [current device log](evidence/phase-07-1-instrumentation-reviewed.log) |
| Final installed APK instrumentation | PASS42tests5.868s after final replacement/hash verification. Separate functional cohort, not an alarm/STT speedup measurement. | [final device log](evidence/phase-07-1-instrumentation-final.log) |
| Incoming data/helper probes | PASS assertions reproducing defects, not safe incoming acceptance. No app/network/nativeDB/mic. | [data](evidence/phase-07-1-incoming-data-probes.json), [native](evidence/phase-07-1-incoming-native-probes.json) |
| Physical phone, actual spoken/audio/low-RAM/Doze/OEM/battery | NOT RUN / HUMAN REQUIRED | [manual guide](../../qa/PHASE-07-1-MANUAL.md) |

Exact reproducible native command from repository root:

```powershell
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME="$env:LOCALAPPDATA/Android/Sdk"
$env:NODE_OPTIONS='--max-old-space-size=512'
$phaseModel=Join-Path (Get-Location) '.local/phase06-whisper-assets'
$phaseCorpus=Join-Path (Get-Location) '.local/phase06-corpus'
.\android\gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDebug :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' "-PwhisperModelDir=$phaseModel" "-PsttCorpusDir=$phaseCorpus" '-Dorg.gradle.jvmargs=-Xms64m -Xmx768m -XX:MaxMetaspaceSize=512m -XX:+UseSerialGC -Dfile.encoding=UTF-8' '-Pkotlin.compiler.execution.strategy=in-process' --max-workers=1 --no-daemon --console=plain
$adb="$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
& $adb -s emulator-5554 install -r android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk
& $adb -s emulator-5554 install -r android/app/build/outputs/apk/androidTest/dataQa/app-dataQa-androidTest.apk
& $adb -s emulator-5554 shell am instrument -w -e notClass com.lafina.capstone.voice.WhisperCorpusBenchmarkTest com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner
```

Prerequisites: existing installed dependencies/SDK and verified ignored model/
synthetic test assets per Phase06. No credential file required. SDK XML3/4,
Gradle deprecation and Node color warnings retained; do not claim a warning-free
native build. Initial emulator-absent instrumentation attempt was NOT RUN, then
the same AVD was reopened without wipe and the current suite passed.

## 5. Measurements and artifacts

[Final seven APKs, model/license/permissions and16KiB ELF metadata](evidence/phase-07-1-artifacts-reviewed.json),
[final266-file source cohort](evidence/phase-07-1-source-hashes-reviewed.json).
Installed final x86_64 dataQa:84,767,058bytes, SHA256
`91772a0767fe5dc57f4b2e4d50271cdfb0ab8d6d26b9e470cdae42855916f026`.
ARM64 release preview:60,857,825bytes, SHA256
`f07f43d3a20bac2cc06aaa6b61c54ef6ab78650e588768423491ca3466d2b095`.
ARM64 dataQa84,984,593bytes. Compared with frozen Phase07 artifacts, QAx86 is
1,433,953bytes larger and ARM64release110,528bytes larger. These are file-size
comparisons under the named build configuration, not phone memory/startup gains.
The initial pre-layout-correction artifacts/source hashes remain separately
preserved in the `*-initial.json` cohorts. Final model metadata and new JNI hashes
match the initial integration cohort; QA packaging-size differences are not
interpreted as runtime memory/latency changes.

The same32,152,673-byte Tiny model SHA256 and license notices remain. Incoming
Base+VAD raw payload61,010,614bytes is excluded; its larger raw payload does not
prove worse accuracy/speed/memory. No new model/language accuracy, PSS peak,
startup, battery or old/new speech benchmark run. Existing Phase06/07 cohorts stay
unchanged and retain their original limitations.

One synthetic Chat-created alarm on the initial integration APK was planned for
`2026-10-26T15:28:23.120Z`. Visible native diagnostic metadata records durable
CLAIM_RING at`.144Z` (**24ms**) and NOTIFICATION_POSTED at`.200Z` (**80ms**).
This is **n=1 per milestone**: not audible onset, screen rendering, p50/p95,
matched old/new performance or physical reliability. The
[cleanup ledger](evidence/phase-07-1-emulator-cleanup.json) retains the two raw
timestamps and the sample limitation.

Final [integrity/merge verification](evidence/phase-07-1-final-integrity.json)
checks all266 source hashes and7 APKs, retained core content, document links,
current candidate secret patterns and actual merge parents/ancestry. Strict
source `git diff --check` passes. The broad whitespace check flags intentional
Markdown hard breaks and raw tool-log trailing spaces/blank EOF lines; preserve
those logs byte-for-byte rather than rewriting hashed diagnostic evidence.

## 6. Emulator-visible checks / cleanup

[Current ledger](evidence/phase-07-1-emulator-handoff.json) distinguishes synthetic
pre-upgrade0.7.0 seed from post-install0.7.1 checks. Upgrade `install -r` preserved
the seeded TODO task; no uninstall/clear-data/import. Installation hash matched
the built APK. The early functional cases used initial integration APK
`9e63c984...`; the final layout-only build is `91772a07...`. The ledger records
the replacement timestamp and final cases' APK hashes, rather than relabeling
initial cases as execution on the later artifact. Native/data/command source is
identical between them; only CalendarMonth navigation layout changed.

Confirmed on-screen outcomes:

- Calendar selected the exact synthetic task date, opened its matching detail,
  round-tripped Next/Previous month and retained the Day/week view.
- Typed create/query/correction showed19:00 then20:00 only after confirmation.
  Event creation/move preserved one-hour duration; deletion was separately
  reviewed. Explicit task completion was tested separately.
- Negated ACK, mixed okay/later, bare Friday and bulk delete were refused without
  a mutation review. Home invalidated a pending review. Force-stop/reopen retained
  the confirmed source while clearing transient conversation/composer/review.
- A real timed native reminder created through Chat rang while backgrounded.
  Named ACK required confirmation, then its underlying task still showed TODO.
  That fixture was individually deleted. Sound audibility was not certified.
- Rounded tabs and Android Back required a stay/discard decision for dirty
  preferences. Alternate light/dark Calendar navigation worked, then original
  appearance was restored.
- Narrow840×2000/font-scale1.3 controls were functional but initial button words
  fragmented. Font-aware wrapping of whole buttons corrected this. The
  [final screenshot](evidence/phase-07-1-calendar-large-text.png) and final-APK
  navigation case verify readable stacked controls; original dimensions/font
  restored. Two initial attempts had also swiped on the taller fixed navigation
  rather than content; corrected only the ignored test helper's coordinates.
- Optional system-TTS Stop retained the written response. Final-build manual
  speech-panel fallback copied reviewed words into Message only; Send produced a
  separate review, and Discard left no saved source. No actual spoken recording
  or ASR accuracy result is claimed. Initial Discard selector needed scrolling;
  corrected the ignored driver and reran successfully.

[Cleanup verification](evidence/phase-07-1-emulator-cleanup.json), recorded
`2026-10-26T15:43:14.580314Z`, confirms final installed hash, radios restored to
airplane0/Wi-Fi1/mobile1, original app microphone grant retained, no active
RECORD_AUDIO AppOps, host microphone input off via read-only local probe, delivery
OFF and native counts0pending/0ringing/0registered/0failed. Original Dark/Text,
font-scale1.0 and1080×2400/no size override are restored. All owned saved QA071
fixtures are removed; discarded drafts were never confirmed. Historical user
records were not enumerated/exported or broadly deleted. The final app is open
on Chat with an empty composer: [handoff screen](evidence/phase-07-1-chat-handoff.png).

## 7. Security, reliability and documentation

Pasted production admin/provider/database/deployment credentials are exposed.
They were **not saved, used, tested or committed**. Owner must revoke/rotate them.
No production backend, Neon/Pinecone/Gemini/DeepSeek/Vercel service is contacted by
the application or audit probes. Git fetch/pull only contacted the capstone Git
remote; normal existing Android build dependencies use their toolchain behavior.
No new dangerous/runtime permission. dataQa/release stay without INTERNET,
overlay or foreground-microphone service; debug's development permissions are
separately recorded in artifact metadata.

[ADR-021](../decisions/ADR-021-selective-upstream-integration.md),
[provenance](../third-party/phase-07-1-provenance.md),
[architecture](../02-ARCHITECTURE.md), [decision log](../04-DECISION-LOG.md),
[risk register](../../qa/RISK-REGISTER.md), README and manual guide document the
integration. [Graphify availability/result](evidence/phase-07-1-graphify.json)
records CLI unavailable; executed AST
gate and Mermaid architecture review must not be misrepresented as Graphify.
Owner source/brand reuse authorization exists; publication/attribution details
remain pending. No remote push/publication is performed.

## 8. Human verification and open gates

Full install/action/expected-result/restore checklist:
[PHASE-07-1-MANUAL](../../qa/PHASE-07-1-MANUAL.md).
Check existing preferences/data after upgrade; month/day selection, large font,
theme, unsaved navigation; offline reviewed commands/ambiguous refusal; one real
alarm ACK leaving TODO and snooze; actual offline speech and TTS Stop; force-stop/
reboot durability. Restore radios/output/theme/font/delivery afterward. The
emulator deliberately leaves host microphone input off; it is not a physical or
audible speech test.

Physical ARM64/Android11/API30/31, low-RAM, live speech intelligibility/accents,
actual ringtone/TTS sound, calls/audio focus, reboot/Doze/OEM reliability and
battery/PSS/startup acceptance remain NOT RUN. Incoming alternative database
import and out-of-scope cloud/accounts remain deferred. No Phase08 begins.

## 9. Review decision

- [x] Current automated required checks pass; initial full preflight log preserved.
- [x] Current emulator visible checks/restoration finalized.
- [ ] Physical phone acceptance completed/human-confirmed.
- [x] Disallowed incoming runtime excluded; existing offline data/core retained.
- [x] Final links, evidence/source integrity and local merge commit recorded.

**STATUS: AWAITING DEVICE VALIDATION**  
**STOPPED — awaiting explicit human approval for Phase08**
