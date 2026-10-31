# Phase 08 — emulator expansion and reconciliation report

**Current candidate and remaining-case results:** [remaining emulator report](phase-08-remaining-emulator-report.md), [current APK ledger](evidence/phase-08-remaining-relative-artifacts-final.json). The sections below preserve the earlier cohort; its hashes, failures and restoration are historical.

**Branch / HEAD:** `codex/phase-07-audit-hardening` / `98bef88c3ae0fabee677c1466417fc34c0af738c`.  
**Date:** 2026-10-28–29 Asia/Manila; evidence uses UTC.  
**Candidate:** `0.8.0-data-qa`, versionCode 11, `com.lafina.capstone`, schema 3.  
**Device:** saved Medium_Phone AVD, `emulator-5554`, `sdk_gphone16k_x86_64`, API 37 preview, 16 KiB pages, headless/no audio output.  
**Status:** `AWAITING DEVICE VALIDATION`. Phase 09+ and publishing are not authorized.

This preserves the earlier expansion cohort, `ex20261028`. The [original Phase 08 report](phase-08-report.md) preserves the earlier implementation/test cohort. The [48-case matrix](evidence/phase-08-emulator-expansion-matrix.json) records actual outcomes, narrower scopes, candidate cohorts and failed attempts. Its emulator results do not sign off physical acceptance. Work remains an uncommitted local patch. No remote pull/merge, push, uninstall, data clear, database replacement or legacy edit occurred.

## 1. Scope and actual fixes

The integrated flow remains reminder → Answer → optional installed offline TTS → visible hold-to-talk, typed draft or manual button → review/Confirm → atomic ACK/snooze → reconciliation and close. Answer alone does not ACK. ACK leaves the task TODO. No callback automatically starts microphone capture. The original deadline and single-use, source-version-checked review remain enforced. Manual text/buttons remain available when speech fails.

Two different findings must be distinguished:

1. **Notification ACK test completion race.** The initial actual System UI ACK test observed saved ACK/TODO while a registration remained. Instrumentation could finish and stop its target before the asynchronous receiver finished reconciliation. The driver now waits through the existing `capabilities` provider's shared store lock. This does not invoke reconcile or repair SQL. Actual notification ACK and cached-action replay verified paired ACKNOWLEDGED, task TODO and zero registrations on the final candidate. The initial failure is preserved. See the [finding and evidence](evidence/phase-08-notification-harness-finding.md).
2. **Production reminder reopening defect.** Reopening after visiting Chat could bring forward a task with Chat above the reminder. OPEN now uses `NEW_TASK | CLEAR_TOP | SINGLE_TOP`; ReminderActivity has a separate `${applicationId}.reminders` task affinity. The final actual notification regression reopened the reminder, retired the old review and preserved an unsent Main Chat draft. Independent SQL retained RINGING/TODO, generation, original deadline and one registration until explicit action. See the [reopening finding](evidence/phase-08-reminder-reopen-finding.md) and [ADR 023](../decisions/ADR-023-foreground-reminder-response.md).

No schema, command grammar, model, dependency or permission was added for these fixes. The earlier CLEAR_TOP-only build is a preserved intermediate cohort.

The expanded mic-denial probe also exposed a harness re-entry problem: after the
permission dialog it relaunched the same reminder while an old Answer node was
still visible. Its next click could race the new intent's reload. The corrected
probe uses the returned window's visible Answer control. Denial and
release-before-grant then passed: no automatic recording was observed, the manual
draft was editable and independent SQL retained the original RINGING/TODO state,
identity, deadline and registration. The failed attempt is preserved in A23's
matrix history. This correction changed only instrumentation; the refreshed
artifact ledger confirms all six production APK hashes are unchanged.

## 2. Change inventory

| Area | Purpose |
|---|---|
| ReminderIntents / Android manifest | Reliable reopening and a distinct reminder task while preserving planner drafts |
| Notification/lifecycle instrumentation | Actual owned System UI interactions, completion barrier, duplicate/stale review and unsent draft regressions |
| Qa08UiDriver | Bounded active-window accessibility; empty editable hints do not become recognized text |
| Microphone instrumentation | Real pointer DOWN/UP, visible recording gate, explicit copy/edit/review; no hidden host recording |
| Decoder/system TTS probes | Opt-in real native capability observations; green JUnit alone is not a voice-quality pass |
| Emulator suite/audio/APK scripts | Owned synthetic titles, reviewed UI writes, independent SQLite snapshots, pinned loopback PCM, host mic disabled, restoration and static verification |
| Reports, matrix, ADR, manuals | Evidence cohorts, preserved failures and pending human acceptance |

The [26-file source ledger](evidence/phase-08-expansion-source-hashes-permission-ui.json) identifies the frozen code/configuration cohort. Private parent controllers, raw captures and database snapshots stay ignored under `.local`. Removed QA tasks retain text/history and operation receipts under the existing soft-removal disclosure.

## 3. Verification

| Check | Actual outcome | Evidence |
|---|---|---|
| Fresh host preflight | PASS: 528 Jest / 35 suites; typecheck, lint, format, 61-module architecture/cycle/offline-boundary checks | [log](evidence/phase-08-expansion-preflight.log) |
| Final task-isolated native build | PASS: six production APKs, both ABIs; 4m15s | [build](evidence/phase-08-expansion-android-task-isolation.log) |
| JVM archive from that build | 81 tests / 8 suites; zero failures/errors/skips | [XML summary](evidence/phase-08-expansion-jvm-results-task-isolated.json) |
| Matching opt-in test APK | PASS; explicit pinned model/corpus inputs, task-removal, real recording and decoder probes included | [build](evidence/phase-08-expansion-matched-test-build.log), [install](evidence/phase-08-expansion-matched-test-install.log) |
| Final native functional regression | PASS: 52 tests, 11.797s on the matching test APK | [log](evidence/phase-08-expansion-matched-functional.log) |
| APK/model/alignment inspection | PASS: 7 APKs / 84 ELF libraries, 16 KiB PT_LOAD/ZIP checks, six pinned model copies; QA/release no INTERNET | [artifact ledger](evidence/phase-08-expansion-artifacts-matched.json) |
| Installed candidate and resumed offline condition | PASS: installed hash matches final x86_64 DataQa; airplane 1 / Wi-Fi 0 / mobile 0; no active default network | [resume ledger](evidence/phase-08-expansion-resume-offline.json) |
| Final data-preserving upgrade | Original non-diagnostic rows/full preferences preserved, schema 3 | [upgrade](evidence/phase-08-expansion-task-isolation-upgrade.json) |
| Expanded UI/OS/SQLite cases | 36 scoped PASS, 2 FAIL (synthetic spoken ACK/snooze), 10 NOT RUN; each PASS is limited to its recorded scope | [matrix](evidence/phase-08-emulator-expansion-matrix.json) |
| Syntax / final AST graph | PASS; 2,887 nodes / 6,396 edges / 179 communities | [syntax](evidence/phase-08-expansion-static-syntax.json), [graph](evidence/phase-08-expansion-graphify-permission-ui.log) |
| Frozen code formatting | PASS in repository formatter scope; docs/qa are excluded by `.prettierignore`. Document links/gates checked separately below | [log](evidence/phase-08-expansion-format-check-permission-ui.log) |
| Final restoration and integrity | Restoration PASS (10 checks); host-only ledger/link/Git verification does not certify phase acceptance | [restoration](evidence/phase-08-expansion-restoration-final.json), [handoff integrity](evidence/phase-08-expansion-validation-handoff.json) |
| Physical phone / human speech / audibility | NOT RUN | [manual](../../qa/PHASE-08-MANUAL.md) |

Graphify reports partial Kotlin/Gradle parsing, 19 files without symbols and skipped unclassified files including AndroidManifest.xml. Compiler, APK and actual UI/storage results verify the manifest change. No semantic extraction, key, tool upgrade or paid extraction was used.

Two unsuccessful native regression attempts remain preserved. The [earlier early-boot runner exit](evidence/phase-08-expansion-instrumentation-functional.log) was followed by [52 passing checks in 7.14s](evidence/phase-08-expansion-instrumentation-functional-retry.log); its crash cause was not established. After the permission-test-only correction, a rebuild omitted the explicit model/corpus options. That test APK expected no bundled model while the unchanged production app correctly reported Whisper availability: [51/52 passed](evidence/phase-08-expansion-permission-ui-functional.log). Rebuilding with the existing pinned inputs resolved this test-configuration mismatch. The final 52/52 run above uses that matching APK; all six production APK hashes stayed unchanged.

The final matching test build used the installed JDK 17, existing verified assets and no downloads, from `android/`:

```powershell
$env:JAVA_HOME='C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot'
$env:PATH=$env:JAVA_HOME+'/bin;'+$env:PATH
$qa08Model=(Resolve-Path '../.local/phase06-whisper-assets').Path
$qa08Corpus=(Resolve-Path '../.local/phase06-corpus').Path
.\gradlew.bat :app:assembleDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' "-PwhisperModelDir=$qa08Model" "-PsttCorpusDir=$qa08Corpus" '-Dorg.gradle.jvmargs=-Xms64m -Xmx768m -XX:MaxMetaspaceSize=512m -XX:+UseSerialGC -Dfile.encoding=UTF-8' '-Pkotlin.compiler.execution.strategy=in-process' --offline --max-workers=1 --no-daemon --console=plain
```

The selected emulator cases include actual notification ACK/snooze and duplicate replay, stale review/expiry, reminder reopening with an unsent draft, forced Doze, battery saver, reboot/force-stop recovery, clock/timezone changes, revoked permissions, recording cancellation and 200% font reachability. These are narrower than the complete physical scenarios: app-task removal was not a Recents gesture, overlapping alerts were not exactly simultaneous, clock-back was during review, and large-font reachability did not certify TalkBack or keyboard behavior. A08, A25–A27 and V01–V06 remain NOT RUN. Per-case limitations and failed attempts remain in the matrix.

The saved AVD was rediscovered and booted without loading a snapshot or clearing data. Resumed cases use the explicit offline ledger; earlier expansion cases retain their recorded conditions and candidate cohorts. Only this x86_64 preview AVD was exercised. ARM64 builds do not prove ARM64 execution. Commands, timing, actual conditions and raw-log references are recorded in the linked JSON/logs; selected runner operations use `python scripts/phase08-emulator-suite.py --serial emulator-5554 --run-id ex20261028 <operation>`.

## 4. Speech outcomes and measurements

The six existing David Desktop synthetic clips decoded through real native Whisper with 36 reference words and zero normalized edits in this tiny corpus. The [benchmark](../benchmarks/phase-08-expanded-whisper-emulator.json) and [analysis](../benchmarks/phase-08-expanded-whisper-analysis.json) record median 3,281ms, nearest-rank p95/max 4,345ms (n=6), and maximum sampled PSS 164.82MiB at 200ms sampling. These are direct-PCM measurements with a cached model, not live accuracy, microphone latency, stable tail estimates or phone peaks.

V11 separately exercised real visible hold/capture with SDK-injected pinned `today.wav`, explicit copying, editing and refusal. Android recognition first reported LANGUAGE_UNAVAILABLE; a new explicit hold used the existing Whisper fallback. Host microphone input was false before/after. This is synthetic virtual-microphone evidence, not human speech.

**Spoken ACK/snooze remain unresolved.** Two new private QA clips from installed Microsoft Zira Desktop did not satisfy exact-reference gates in virtual-microphone A03/A06 attempts. One capture produced no audio signal; others produced mismatching hypotheses. The [direct decoder probe](evidence/phase-08-response-direct-decoder.log) decoded both pinned inputs but also reported `SYNTHETIC_REFERENCE_MISMATCH` and `commandParsedExpected=false` for both. Its one JUnit pass is a probe-execution pass, not ASR-quality success. [Hashes/provenance](../benchmarks/phase-08-synthetic-response-audio.json) are recorded; audio stays ignored and is not bundled or redistributed. No mismatch applied ACK/snooze. The exact grammar was not broadened to force a pass. Device/acoustic investigation remains required.

The [six real system TTS probes](evidence/phase-08-expansion-tts-probes.json) ran after restarting the same saved AVD without clearing data. Boot completion and retained airplane 1 / Wi-Fi 0 / mobile 0 were checked. The first attempt before restart [could not connect](evidence/phase-08-resumed-tts-inventory.log); it did not execute a probe. All six resumed JUnit invocations executed successfully, with these actual capability outcomes:

| Probe | Actual observation |
|---|---|
| Inventory | UNAVAILABLE / INITIALIZATION_TIMEOUT; foreground loss was also observed. No utterance queued; cause not established |
| Default speak | Installed offline `com.google.android.tts` / `en-US-language`; requested → start → done callbacks; request-to-start 478ms |
| Explicit saved Profile voice | Same installed offline voice; requested → start → done callbacks; request-to-start 460ms |
| Stop | Requested → cancelled / USER_STOPPED; no done callback |
| Cancel initialization | UNAVAILABLE / USER_STOPPED; no requested event or playback |
| Missing explicit engine | UNAVAILABLE / ENGINE_NOT_INSTALLED; no playback; text/manual fallback required |

No microphone was opened and no voice was downloaded. The two callback timings are individual observations, not a latency benchmark or speed claim. This AVD has no audio output: callbacks do not certify audibility, intelligibility, volume, real-call interruption or a phone voice's offline performance. The original V12 combined TTS/mic/review scenario remains NOT RUN despite these separate probes.

## 5. Restoration and preservation

The [final restoration ledger](evidence/phase-08-expansion-restoration-final.json) passed all 10 checks. All 53 registered QA titles were already hidden by reviewed soft removal. Independent SQLite comparison found original non-diagnostic rows unchanged, exact full preference payload/hash restored, schema 3, delivery/full-screen OFF, zero active PENDING/RINGING jobs and zero registrations. QA tombstones/history and operation receipts remain by design.

The explicitly captured settings match baseline: airplane OFF, Wi-Fi/mobile ON, automatic time/timezone ON, GMT, font scale 1.0 and the original screen/keyboard settings. The guest clock was within five seconds of host time. All four permission grants/flags and three touched AppOps modes match baseline. Battery source/override state matches, forced idle is OFF and battery saver is OFF. These checks cover recorded settings and test overrides; they do not certify volume, acoustics or untouched standby policy.

Host microphone input was false before/after verification and Android's RecordActivityMonitor contained no active recording configuration. Only the two size/hash-pinned temporary decoder WAVs were deleted. All seven host APK hashes and 26 frozen source hashes match their ledgers, and the installed x86_64 DataQa APK matches SHA-256 `80f6a89ab7c783a58cca55b46a668faae8a3d8d709d104aeb64b6559860b13f7`. No uninstall, data clear, model deletion or database restore occurred.

The private baseline covers complete preferences, original non-diagnostic rows, permission grants/user flags, AppOps modes, radios, clock/timezone, display, power and native-delivery settings. AppOps last-use history can advance during tests; modes/grants/flags are compared separately. Bounded diagnostic history may rotate. QA text/history remains after soft removal; no snapshot is written back to the device database.

## 6. Concrete human checklist

Use the [current APK hashes](evidence/phase-08-expansion-artifacts-matched.json) and [full manual](../../qa/PHASE-08-MANUAL.md). Upgrade only a known compatible capstone installation with matching signing lineage using `install -r`; preserve existing data.

1. Open the installed Phase 08 app, Profile and Calendar; verify existing items/preferences. Record settings, enable delivery deliberately, choose lead 0 and create a uniquely named QA08 reminder two minutes ahead.
2. In airplane mode with Wi-Fi/mobile data off, background/lock the phone. Open the actual due notification and Answer. Expect text/manual controls, no automatic mic, no ACK yet and task TODO.
3. Review manual ACK, cancel, then review/Confirm. Expect one closed alert, ACKNOWLEDGED and task TODO after reopen. Repeat with actual notification ACK; no repeated delivery should remain.
4. On a new reminder review/Confirm Snooze 10 minutes. Expect one replacement and task TODO; verify redelivery. Try typed and explicit hold-to-talk responses, copied draft and review. Ambiguous/unrecognized speech must allow editing/manual fallback and apply no action.
5. During review visit Chat, leave an unsent draft, then reopen the reminder notification. Expect a fresh review, the original deadline and preserved Chat draft. Check timeout, changed/deleted source, duplicate Confirm, denied speech, background cancellation, large font/keyboard and TalkBack.
6. Complete physical reboot, clock/timezone, force-stop recovery, natural Doze, revoked permission and OEM battery cases. Test audible offline TTS, live speech, accents/noise and real interruptions. Restore settings, remove owned QA fixtures, record results and sign the release gate.

**NOT RUN:** every physical A01–A36 / V01–V12 acceptance row; physical ARM64, API30/31/stable newer OS and low-memory coverage; human acoustics/audibility, TalkBack certification, real calls, OEM/natural-idle delivery, battery and matched phone performance. Physical alarm and per-voice interaction sample counts remain unsatisfied.

## 7. Documentation and architecture

[ADR 023](../decisions/ADR-023-foreground-reminder-response.md), [flow contract](../phase-08-offline-loop.md), [execution checklist](../../qa/PHASE-08-EXECUTION.md), [requirements](../../qa/REQUIREMENTS-MATRIX.md), [current status](CURRENT-STATUS.md), [emulator protocol](../../qa/PHASE-08-EMULATOR-EXPANSION.md) and the matrix distinguish current evidence from the original cohort. The [offline-core release gate](phase-08-offline-core-release-gate.md) remains unsigned and closed.

## 8. Remaining risks and next steps

The ACK completion barrier is covered by an actual notification regression and independent SQL. Production reopening has a preserved-draft regression. Spoken response quality remains an open finding. Emulator passes do not establish physical punctuality, live voice quality or an offline-core release. No backend, account, Gemini, handbook RAG, Kokoro or unapproved model/feature was introduced.

## 9. Review decision

The implementation and available evidence require human review. The phase is **not passed**: physical acceptance remains pending, and failed speech-quality attempts remain visible. Do not begin Phase 09+.

`STATUS: AWAITING DEVICE VALIDATION`  
`STOPPED — awaiting explicit human approval`
