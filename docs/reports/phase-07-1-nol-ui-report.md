# Phase07.1 — Nol reference UI follow-up report

**Branch/base:** `codex/phase-07-1-nol-ui` / `589508d18257c91103056fc8c6ebce5e88c513d3`.
**Date:** 2026-10-27 Asia/Manila; exact UTC evidence timestamps retained.
**Incoming:** `Nol-branch@9c183a20eca2377b5e54f219c5f83460b18af81b`.
**Approval:** owner explicitly requested pulling Nol-branch and matching five
reference screenshots, then authorized continuation and usage monitoring.
**Device:** Medium_Phone API37 beta `sdk_gphone16k_x86_64`,16KiB pages; no phone.
**Status:** AWAITING DEVICE VALIDATION; emulator checks pass, physical acceptance pending.
No Phase08 or online backend authorization.

## 1. Scope and branch verification

Explicit `git pull --no-commit --no-ff origin Nol-branch` returned **Already up to
date**. Nol/main point to the same9c183a2 commit, already in our merge ancestry.
The previous presentation adaptation was incomplete. This follow-up implements
the actual compositions around our confirmed local services, rather than
replacing safety logic with the incoming app root or schema17.

- Chat: centered Assistant empty state, message composer, chronological bubbles,
  explicit review card and tools. Central mic opens editable speech input only.
- Calendar: compact range/Month–Week controls, rounded date cards, actual paged
  hourly timeline, floating add menu and existing editors/details/manual fallback.
- Notes: local CRUD/search/pin/category,20-record pages, explicit save/discard/
  delete, version/idempotency checks, exact Profile counts.
- Profile: anonymous local name/avatar, static gradient, real counts, working
  clock/week-start switches and links to existing preferences/native tools.
- One semantic light/dark system and lightweight SVG dependency. Rounded dock
  uses four icon tabs plus mic; no automatic capture or raw voice side effect.

Intentional deviations: no accounts/email/Pro/camera/updater, invented voice-use
count, automatic transcription category, unsupported import/export, or handbook
claim. These are deferred functions, not silently reintroduced through UI reuse.

## 2. Changes / architecture

| Area | Change and evidence boundary |
|---|---|
| App/StudentTabBar/Icon/theme | Guarded icon routes and mic, semantic SVG outlines, native keyboard/safe-area handling. |
| ChatScreen/ProfileScreen | New composition; private confirmed command/session and native speech ownership retained. |
| Calendar components/timeline |20-record day pages, recurrence/overnight/timezone/overlap mapping; runtime formatter failure retains manual access. Current-time line refreshes on foreground/refresh, no background polling. |
| Notes domain/repository/screens | Validated title/body, literal search, bounded pages, atomic/idempotent mutations, stale-version rejection. Search can scan history; paging bounds returned JS rows, not SQL latency. |
| DB schema3/native reader | Add notes table/indexes atomically; frozen schema2 tests preserve all prior11 tables/settings/jobs/receipts. Native accepts2/3, refuses4+. No foreign DB import/reset. |
| Preferences | Legacy missing clock/week keys default24h/Monday; malformed values rejected. Toggles persist through existing atomic settings snapshot. |
| Dependency | Exact react-native-svg15.15.5 plus its declared dependencies; existing body-parser tooling2.3→2.4 advisory fix. No new model/speech/cloud runtime. |

[ADR-022](../decisions/ADR-022-nol-ui-local-notes.md) records this contract.
Prior reports/baselines remain unchanged. Owner code/brand reuse authorization
exists; detailed publication attribution remains pending. See
[provenance](../third-party/phase-07-1-nol-ui-provenance.md).

## 3. Tests / actual outcomes

| Gate | Actual result / evidence |
|---|---|
| Initial full preflight |519PASS/1FAIL: Back toolbar parent route; initial log preserved. |
| Reviewed full preflight |520tests/34suites PASS56.565s; type/lint/format/AST61modules pass. |
| Final visual preflight |520tests/34suites PASS53.896s; same gates pass. [Final log](evidence/phase-07-1-nol-ui-preflight-final.log). |
| App integration |29tests/4suites PASS13.984s; original behavior retained, new persisted switches and dirty Notes/mic tests. |
| Notes/migrations |60focused tests passed before modular presentation split; final9NotesUI tests passed. Frozen v2→3 data/rollback tests included in full gate. |
| Calendar |28focused tests passed; final full gate includes week-start/formatter/overlap/real-SQLite paging cases. |
| Native build |Initial all variants/ABIs PASS13m22s,376tasks151executed225up-to-date. |
| Visual rebuild |PASS2m29s,371tasks27executed344up-to-date. [Build log](evidence/phase-07-1-nol-ui-android-reviewed.log). |
| JVM |62tests/6suites PASS0.157s from actual initial task; later cached XML is not relabeled fresh. |
| Android instrumentation |44tests PASS10.059s on final installed APK; includes native schema3/future-schema checks. [Log](evidence/phase-07-1-nol-ui-instrumentation-final.log). |
| Physical voice/audio/phone matrix |NOT RUN / HUMAN REQUIRED. |

Caught real regressions without weakening tests: unguarded locale formatting and
settings-panel Back ancestry. Initial selector/test-fixture failures and quota
interruption remain documented separately; native UI proof is not inferred from
SVG stubs or Jest.

Commands: `npm run preflight`; existing bounded Gradle command from
[Phase07.1 report](phase-07-1-report.md), with the same model/corpus directories
and `:app:testDataQaUnitTest :app:assembleDebug :app:assembleDataQa
:app:assembleRelease :app:assembleDataQaAndroidTest`, ARM64+x86_64, one worker.
For device tests install the current androidTest APK, then run:

```powershell
$adb="$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
& $adb -s emulator-5554 shell am instrument -w -e notClass com.lafina.capstone.voice.WhisperCorpusBenchmarkTest com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner
```

Current build command (PowerShell, from repository root):

```powershell
$env:JAVA_HOME='C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME="$env:LOCALAPPDATA/Android/Sdk"
$env:NODE_OPTIONS='--max-old-space-size=512'
$phaseModel=Join-Path (Get-Location) '.local/phase06-whisper-assets'
$phaseCorpus=Join-Path (Get-Location) '.local/phase06-corpus'
./android/gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDebug :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' "-PwhisperModelDir=$phaseModel" "-PsttCorpusDir=$phaseCorpus" '-Dorg.gradle.jvmargs=-Xms64m -Xmx768m -XX:MaxMetaspaceSize=512m -XX:+UseSerialGC -Dfile.encoding=UTF-8' '-Pkotlin.compiler.execution.strategy=in-process' --max-workers=1 --no-daemon --console=plain
```

Prerequisites: existing verified Tiny model and synthetic test corpus in these
ignored local directories, Android SDK36/NDK27.1.12297006 and Java17. Do not
replace missing assets with unverified downloads. Corpus timing/accuracy was not
rerun: the benchmark class is explicitly excluded from instrumentation above.

## 4. Performance, artifacts and constraints

[Final source/APK metadata](evidence/phase-07-1-nol-ui-artifacts-reviewed.json)
records seven APKs, packaged notices, unchanged verified Tiny asset and new
Whisper/SVG16KiB ELF alignment checks. DataQa x86_64:90,024,072bytes SHA256
`0edc3b64d46759d355f7ce2e02a43e395915f0b2b6a81c5ffe04355950cc87f6`.
ARM64 release:62,923,108bytes SHA256
`8b38f17c2dad7ad3a36c3d0de80b6f97a2b0a5c0cd59f28c9d00705d30449596`.
This adds2,065,283bytes to the previous ARM64 release; no phone speed/memory gain
is claimed. The model/source engine is unchanged; no new ASR accuracy cohort.

[Notes host benchmark](../benchmarks/phase-07-1-nol-ui-notes.md):600 measured calls,
zero failures.500seed notes,100samples per metric plus warmups. Create/edit p95
6.3229/5.9581ms;20-row read/search/count p95 below1ms in this cohort. This is a
file-backed host SQLite measurement under uncontrolled build/emulator load, not
Android, low-RAM, startup, battery or matched legacy performance.

## 5. Actual emulator and restoration

[Live ledger](evidence/phase-07-1-nol-ui-emulator-handoff.json) records pre-upgrade
synthetic data, installed hashes, actual controls and screenshots. The initial
0.7.2 build's UI cases are distinguished from the final visual rebuild.
The final APK was installed without uninstall/reset, then passed44 native tests,
the actual JSI migration/Notes checks and the manual-draft→composer→Send→review→
Discard path. The initial0.7.2 cohort verified retained upgrade data, real saved
calendar events/details, task correction/refusal, local Notes create/edit/delete
and dirty planner/Notes/mic navigation guards. No mocked result substitutes for
these actual emulator controls.

Inspected final Light screenshots: [Week](evidence/phase-07-1-nol-ui-calendar-week-light.png),
[Month](evidence/phase-07-1-nol-ui-calendar-month-light.png),
[Notes](evidence/phase-07-1-nol-ui-notes-light.png),
[Profile](evidence/phase-07-1-nol-ui-profile-light.png),
[Chat](evidence/phase-07-1-nol-ui-chat-light.png). Screenshots show only synthetic
QA identity/empty agenda. At840x2000/font1.3, add controls, scrollable settings
and the composer remained reachable. Dates and the Calendar tab wrap heavily;
this is a known cosmetic limitation, not full accessibility certification.
TalkBack and real soft-keyboard/device combinations remain HUMAN REQUIRED.

[Restoration record](evidence/phase-07-1-nol-ui-emulator-cleanup.json): restored
private nickname, Dark theme,24h/Monday, original radios (airplane0/Wi-Fi1/data1),
1080x2400/font1.0. Reply Text and delivery OFF were not changed. Deleted only
owned confirmed QA fixtures; unsaved/review-discarded drafts were never
confirmed. Tombstones/receipts remain locally. App is open on Calendar.
[Read-only microphone probe](evidence/phase-07-1-nol-ui-host-mic-final.json)
confirmed `realAudioEnabled:false`; no active app recording was observed.

## 6. Human checks / remaining gates

[Concrete install/action/expected-result checklist](../../qa/PHASE-07-1-NOL-UI-MANUAL.md).
Verify screenshot composition in Light, saved display switches, manual calendar
actions, Notes search/edit/delete and dirty guards, explicit Chat confirmation,
real phone offline STT/TTS/alarms/ACK/snooze. Restore preferences and remove only
owned QA fixtures. Agent leaves emulator host input off and does not certify
speech/audibility from synthetic drafts or mocked tests.

Physical ARM64/API30/31/low-RAM, TalkBack, speech/accent/audio quality, real calls,
reboot/Doze/OEM timing, peak PSS/startup/battery remain NOT RUN. Boolbase declares
ISC but bundles no standalone copyright/license notice; published metadata is
retained and attribution needs verification before public distribution. Pasted
credentials remain unused; no backend/contact/upload or remote publication.

## 7. Documentation / architectural review

Updated README, product requirements, architecture, decision log, data/scheduling,
UX and requirements matrix alongside ADR022, provenance and the manual checklist.
[Final integrity check](evidence/phase-07-1-nol-ui-integrity-final.json) verifies
290source hashes and7APK hashes without drift. Graphify: **NOT RUN**, CLI
unavailable; `npm run check:architecture` passed for61TypeScript modules with no
cycles/forbidden dependencies. ADR022 contains the Mermaid substitute. This does
not claim a complete Kotlin/C++ dynamic call graph.
[Documentation/benchmark check](evidence/phase-07-1-nol-ui-docs-final.json)
records resolved Markdown links, unchanged7benchmark hashes and Nol ancestry.

## 8. Remaining work / limits

Physical-phone acceptance and the complete existing speech/reminder/OEM test
matrix remain HUMAN REQUIRED. New-schema native instrumentation/JSI checks do
not establish a fresh real alarm delivery, audibility or speech-accuracy cohort;
those live checks are NOT RUN in this UI follow-up. The QA-only legacy harness
still contains an outdated “Calendar screens arrive in a later phase” caption;
the production Calendar is implemented. No Phase08 work is authorized.

## 9. Review decision

- [x] Required available automated JS/build gates pass.
- [x] Final Android native/UI verification completed.
- [x] Emulator settings restored and owned fixtures cleaned.
- [ ] Physical-device acceptance completed/human-confirmed.
- [x] No accounts/cloud/direct-voice mutation or incompatible DB replacement.
- [x] Final evidence links/integrity recorded; local checkpoint on this branch.

**STATUS: AWAITING DEVICE VALIDATION**

**STOPPED — awaiting explicit human approval for Phase08**
