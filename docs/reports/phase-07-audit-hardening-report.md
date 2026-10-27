# Phase 07 / 07.1 — independent-audit hardening report

**Branch/base:** `codex/phase-07-audit-hardening` / `a186bfceeb05db038bb0b7a2a35b6fe17d1fab62`.
**Date:** 2026-10-27 Asia/Manila; exact UTC timestamps in evidence.
**Audit preservation commit:** `0ff4002` (original report plus25 evidence files).
**Candidate:**0.7.3-data-qa, versionCode10, same capstone package/schema3.
**Device:** Medium_Phone API37 beta `sdk_gphone16k_x86_64`,16KiB; no physical phone.
**Status:** AWAITING DEVICE VALIDATION; available automated/emulator checks and
restoration pass; physical acceptance and owner backup authorization pending.
**Approval:** owner explicitly requested Phase7/7.1 hardening here, confirmed-audit
fixes, emulator execution and manual checks; explicitly prohibited Phase8.

## 1. Scope and audit disposition

This is a rework of the approved offline core, not Phase08. The independent
[Claude audit](phase-07-independent-claude-audit.md) remains unchanged with its
cloud/Linux results and NOT RUN declarations. Its26 files were hashed and
preserved in a local commit; [provenance](evidence/phase-07-hardening-audit-provenance.json).

| Finding | Independently verified disposition / change | Remaining boundary |
|---|---|---|
| AUD-01 | Confirmed misleading removal wording. Notes now says Remove and discloses hidden rows/counts, retained saved text/versions and discarded unsaved edits, before saving and in confirmation. Real-SQLite UI regression verifies cancellation, removal and retained row/result/fingerprint content. | No purge, schema change or secure-erasure promise. Retention remains app-private and indefinite; permanent erasure needs separate design/approval. |
| AUD-02 | Confirmed custody risk. Fresh fetch and ls-remote find main/Nol still9c183a2; no remote review branch. Original audit is now locally committed. No merge/push/main change. | Local commits do not resolve off-machine custody; owner remote-backup authorization remains pending. |
| AUD-03 | Confirmed wrong package guidance; qualified the certificate assertion. Current QA/preview and incoming Nol both use com.lafina.capstone; actual cross-lineage signing compatibility is UNKNOWN until both artifacts are checked. | Known capstone upgrades only. Nol schema17/lafina.db has no automatic import into our schema3. No uninstall/clear/downgrade workaround. |
| AUD-04 | Confirmed stale app-route text. Calendar/details/lead/timezone/onboarding now reference Profile routes; preference draft guard says Stay in preferences. Genuine Android Settings routes remain. QA caption now points to existing Calendar controls. | Internal Settings type/module names remain implementation details; no route redesign. |
| AUD-05 | Confirmed enabled Send white/accent dark ratio2.1826:1. Existing onPrimary/accent now measures8.0163:1 dark; light remains3.1988:1. Independent luminance and actual rendered SVG/background tests pass. | Narrow contrast repair, not full accessibility certification; no palette/dependency change. |
| AUD-06 | Accepted documentation gap; ADR022 enumerates omitted incoming features and usable alternatives, linked to pinned reconciliation. | Time blocks/holidays/layers/rich text/tags/reorder/tour/etc are not silently implemented or committed to Phase08. |
| AUD-07 | Qualified notice scope using the auditeda186bfc Metro graph and independent APK inspection. Source/npm attribution is distinct from shipped runtime inclusion; original notices retained unchanged. | Historical graph is not a fresh native call graph or blanket publication approval. |

Requirements preserved: F-001/F-002 local setup/preferences; F-003/F-004 manual
planner/calendar; F-005–F-008 reminder consistency and ACK separation; F-009/
F-013 confirmed offline commands; Notes F-017; offline/manual fallback/privacy.
Existing physical speech/delivery acceptance remains pending.

## 2. Files and implementation

| Area | Change / reason | Verification |
|---|---|---|
| features/notes/NoteEditor,NotesScreen | Honest pre-save/removal disclosure and Remove naming; same repository API. | Notes UI tests with real host SQLite. |
| ChatScreen +themeContrast/ChatScreen tests | Existing contrasting foreground on existing Send accent. | WCAG reference calculations and actual rendered SVG stroke in both themes. |
| App,PlannerScreen,PlannerItemDetails,PreferencesForm,commandSession,formatOverviewDate,PlannerHarness | Correct Profile recovery routes and legacy QA caption. | Calendar recovery/system-settings action, preference dirty guards and fallback tests. |
| package/lock +app/build.gradle | Candidate0.7.3/code10; lock root version only. | Full gate/native artifact identity. |
| README,data/privacy,ADR022,provenance,manuals | Correct signing/schema guidance, retention copies, exclusions and notice scope. | Source/reconciliation inspection and local links. |

Storage/migrations, native scheduler and speech engines, model, dependencies and
permission policy are intentionally unchanged. `fingerprint` stores canonical
JSON payloads, not one-way hashes. Clearing only a note row/result would leave
other content copies and would not establish physical erasure; no partial purge
or shared-receipt deletion is performed.

## 3. Tests and actual results

| Gate | Actual result / evidence |
|---|---|
| Doctor | Java17/Node24.19/SDK36/NDK27.1/CMake present on Windows; [log](evidence/phase-07-hardening-doctor.log). |
| Notes red/green | Before fix8PASS/2FAIL; after fix10/10PASS9.731s; lint/format pass. Failed evidence retained. |
| Contrast/render |19/19PASS10.936s; initial2 failures were new test-provider fixture setup, corrected without weakening original rerender behavior. Historical/actual pair ratios recorded. |
| Navigation/foundation |73tests/5suites PASS19.799s; [log](evidence/phase-07-hardening-navigation-tests.log). |
| Full preflight |528tests/35suites PASS45.241s; type/lint/format and61-module architecture gate PASS. [Log](evidence/phase-07-hardening-preflight-initial.log). |
| Android build |PASS5m19s,376tasks74executed302up-to-date; all variants/ABIs and test APK. [Log](evidence/phase-07-hardening-android-initial.log). |
| JVM |62tests/6suites PASS0.175s, freshly executed using task-specific --rerun; [XML summary](evidence/phase-07-hardening-jvm-results-initial.json). |
| Native instrumentation |44tests PASS6.317s on the installed candidate; [log](evidence/phase-07-hardening-instrumentation-initial.log). |
| Actual emulator UI |Owned note survived upgrade; actual disclosure/Cancel/Remove, Profile recovery, light/dark Send, create/query/refusal, draft review/Discard, isolated SQLite, font1.3 and dirty-note/preferences guards PASS. Original settings restored. |
| Physical phone/live voice/low-RAM |NOT RUN / HUMAN REQUIRED. |

Commands: `npm run doctor`; `npm run preflight`; focused Jest paths are in the
linked logs. Current bounded Android command from the repository root:

```powershell
$env:JAVA_HOME='C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME='C:/Users/USER-PC/AppData/Local/Android/Sdk'
$env:NODE_OPTIONS='--max-old-space-size=512'
$phaseModel=Join-Path (Get-Location) '.local/phase06-whisper-assets'
$phaseCorpus=Join-Path (Get-Location) '.local/phase06-corpus'
./android/gradlew.bat -p android :app:testDataQaUnitTest --rerun :app:assembleDebug :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' "-PwhisperModelDir=$phaseModel" "-PsttCorpusDir=$phaseCorpus" '-Dorg.gradle.jvmargs=-Xms64m -Xmx768m -XX:MaxMetaspaceSize=512m -XX:+UseSerialGC -Dfile.encoding=UTF-8' '-Pkotlin.compiler.execution.strategy=in-process' --max-workers=1 --no-daemon --console=plain
```

Verified model/corpus assets are existing ignored prerequisites, not automatic
downloads. Native instrumentation after installing the matching QA/test APKs:

```powershell
$adb='C:/Users/USER-PC/AppData/Local/Android/Sdk/platform-tools/adb.exe'
& $adb -s emulator-5554 shell am instrument -w -e notClass com.lafina.capstone.voice.WhisperCorpusBenchmarkTest com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner
```

## 4. Performance and artifact evidence

[Frozen command regression](../benchmarks/phase-07-hardening-intents-host.json):
64/64 exact,88/88 selected slots,0unsafe-ready/false-ACK/false-scheduling refusal
cases,0throws/nondeterminism;6,400 repeated calls. Host p50/p95
0.0259/0.2579ms,max4.1803ms,0source drift. Ran with build/emulator load and is
not a new held-out set, phone latency or matched legacy comparison. Reproduction:
`node scripts/benchmark-intents.cjs --evaluation regression --output <new-file>`.

No new Notes/storage timing cohort is needed for this wording repair; existing
cohorts remain historical. No startup/PSS/battery/speech-accuracy improvement is
claimed. [Current artifact/source cohort](evidence/phase-07-hardening-artifacts-initial.json)
records7APKs and the verified model/notices. [Source manifest](evidence/phase-07-hardening-source-hashes-initial.json)
contains291files:19changed/1added versus the Nol UI cohort. Storage/domain/native
source diff againsta186bfc is empty. Lockfile changes are root version metadata,
so previous baseline lockfile hashes are historical, not relabeled current.

Installed x86_64 QA:88,491,138bytes SHA256
`5f635943bb3ef20a97d7f2561189ae9dbb1a3cf06740e5c6bd749867ed63db1a`.
ARM64 preview:62,923,840bytes SHA256
`2a1fc647963bc212897475241cc15d2dab3dc0612c6b93c30cfe6c2c85286dc6`.
Installed QA hash matches the artifact; upgrade succeeded over the known local
capstone lineage. [Signing verification](evidence/phase-07-hardening-qa-signing.log)
checks this candidate only, not the friend's unknown artifact.

[Fresh native/bundle inspection](evidence/phase-07-hardening-native-bundle-inspection.json):
84libraries across6appAPKs have16KiB-or-greater ELF LOAD alignment and uncompressed,
16KiB-aligned ZIP payloads. The fresh release packager map has704sources,
112fromSVG and0from each audited CSS-parser/boolbase group. This independently
qualifies AUD-07 for this JS cohort; no notice is removed. QA/release have no
INTERNET permission; the separate development debug variant retains Metro's
documented development permissions. These are static/build facts, not phone
delivery, audibility, low-RAM or performance acceptance.

## 5. Reliability, privacy, installation and custody

No account/cloud/backend/credential/model/dependency additions. No native alarm,
schema or idempotency change. Remove only hides Notes content; prior saved
versions remain in rows and receipt results/fingerprints. New wording fixes the
claim, not the retention policy. No restore or purge control exists.

The current review branch is local. After reviewing the final changes, the
owner may authorize a normal backup push:

```text
git push -u origin codex/phase-07-audit-hardening
```

No push/PR/merge, remote main edit, tag/protection change or co-developer message
is performed. A same-disk/local commit does not resolve off-machine backup risk.

## 6. Manual verification / emulator restoration

[Manual install/actions/expected results](../../qa/PHASE-07-HARDENING-MANUAL.md).
[Current emulator ledger](evidence/phase-07-hardening-emulator.json) separates the
old installed APK from candidate checks. The known0.7.2 app was upgraded with
`adb install -r`; the final installed hash matches0.7.3. Owned saved note/task
fixtures were removed by exact confirmed actions; the unsaved large-text note,
speech draft and lead-preference draft were discarded without saving.
Only synthetic owned fixtures are used; private names/schedules/audio must not
enter public screenshots. Host mic input is OFF. Actual speech and audibility
cannot be certified by manually typed drafts or mocked tests.

Inspected screenshots: [before Send](evidence/phase-07-hardening-send-before-dark.png),
[dark Send](evidence/phase-07-hardening-send-dark.png),
[light Send](evidence/phase-07-hardening-send-light.png),
[native removal dialog](evidence/phase-07-hardening-notes-confirmation.png),
[full disclosure/Save at font1.3](evidence/phase-07-hardening-notes-large-text.png),
[Profile recovery guidance](evidence/phase-07-hardening-calendar-recovery.png).
All show synthetic or empty content. The changed paragraph/Save remain reachable
by scrolling at1080x2400/font1.3. Actual Keep/Discard preserved/discarded the
owned draft as intended. This is not TalkBack, soft-keyboard or full narrow-screen
acceptance. Empty-search test readback initially treated the placeholder as a
value; the driver was corrected without app changes or repeating note removal.

[Restoration](evidence/phase-07-hardening-emulator-cleanup.json) verifies original
Dark theme,24h/Monday display preferences,1080x2400/font1.0 and original radio
settings (airplane0/Wi-Fi1/mobile1). Saved nickname/timezone/lead/snooze/reply values
remain unchanged; the synthetic lead edit was only a discarded form draft.
Delivery remains OFF, its visible Enable control was checked, and the app is
foreground on Calendar. The final installed APK hash still matches the build.
[Read-only host microphone probe](evidence/phase-07-hardening-host-mic-final.json)
reports `realAudioEnabled:false`; AppOps showed no active app recording and the
pre-existing microphone grant was preserved. No data reset/uninstall/broad
deletion occurred. Local tombstones and receipt history remain as disclosed.

## 7. Documentation and architectural review

README, data/privacy docs, decision log, ADR022, provenance and both integration
manuals are updated; prior phase reports and the independent audit remain
historical. New hardening checklist/manual/report provide current instructions.
The61-module AST check passes. Graphify is NOT RUN: `Get-Command graphify` finds
no CLI. AST checks and ADR022's Mermaid diagram are the limited substitutes, not
a complete Kotlin/C++ call graph. React review found no new hooks, async
ownership, unbounded reads or speech/storage paths: the changed controls keep
existing typed handlers, cancellation, native confirmation and keyboard/scroll
structure. Tests cover rendered names/state/colors and retained dirty drafts.
No full accessibility or screen-reader certification is claimed.

[Integrity check](evidence/phase-07-hardening-integrity-final.json) verifies the
291source files,7APKs and26original audit files without drift; current text
credential-pattern scan has0hits (limited pattern scan, not complete detection).
[Documentation check](evidence/phase-07-hardening-docs-final.json) records local
link resolution, empty storage/domain/native diff, unchanged notice hash and Nol
ancestry. Earlier benchmark cohorts and reports were not overwritten.

## 8. Remaining work / limits

Physical ARM64/API30/31/low-RAM, live STT/TTS/audibility, real-call/audio
interruption, OEM/Doze/reboot/time changes, TalkBack/soft keyboards and phone
startup/PSS/battery remain HUMAN REQUIRED. Large-text wrapping remains a known
cosmetic limitation. Cross-lineage signing/data migration and permanent erasure
need deliberate owner decisions. Phase08's full loop/release matrix is not run.

## 9. Review decision

- [x] Independent audit preserved and findings verified/qualified.
- [x] Current JS automated gates pass; no future-phase implementation.
- [x] Current native build/JVM/instrumentation and final emulator checks complete.
- [x] Owned fixtures removed and original settings restored.
- [x] Final evidence integrity/links recorded; changes checkpointed locally on the review branch.
- [ ] Physical-device acceptance completed/human-confirmed.
- [ ] Off-machine backup authorized/completed by owner.

**STATUS: AWAITING DEVICE VALIDATION**

**STOPPED — awaiting explicit human approval. Phase08 has not been started.**
