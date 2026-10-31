# PHASE 08 — Emulator capture coordination and evidence / Completion Report

**Branch / base HEAD:** `codex/phase-07-audit-hardening` / `98bef88c3ae0fabee677c1466417fc34c0af738c`. All changes remain local/uncommitted.
**Date:** 2026-10-31, Asia/Manila; individual evidence retains UTC timestamps.
**Device:** saved Medium_Phone / emulator-5554, API37 preview, x86_64/16KiB, SDK emulator37.1.11. No physical phone.
**Candidate:** 0.8.0-data-qa/code11, package `com.lafina.capstone`, schema3.
**Status:** BLOCKED — emulator reliability; physical acceptance AWAITING DEVICE VALIDATION. **Automation:** BLOCKED BY RETAINED EMULATOR FAILURES.
**Approval:** owner explicitly approved Phase08, then requested A03/V03/V04 fixes, the controlled ten-trial comparison, report and checklist. Phase09+ is not approved.

## 1. Scope completed

This follow-up addresses the emulator test producer and diagnostics for F-008/F-010/F-014; the integrated reminder implementation is retained. Current aggregate: **45 PASS / 2 FAIL / 1 NOT RUN**. The44 unaffected PASS rows retain their prior scoped evidence; ten predeclared case attempts cover A03 twice, V03 four times and V04 four times. This includes 0 retained pre-controller navigation failure(s), with 10 actual source submissions; these are not ten recognition trials,47 fresh reruns or an ASR accuracy percentage. See the [closed case ledger](evidence/phase-08-capture-fix-case-ledger.json) and [current matrix](evidence/phase-08-emulator-expansion-matrix.json).

- Cold cohort 1: [serial campaign](evidence/phase-08-capture-fix-host-gpu-cold1-20261030T205317724025Z-9354cd.json); [preserved-data cold boot](evidence/phase-08-capture-fix-host-gpu-cold-1-verification-complete.json).
- Cold cohort 2: [serial campaign](evidence/phase-08-capture-fix-host-gpu-cold2-20261030T210707359332Z-e16ad6.json); [preserved-data cold boot](evidence/phase-08-capture-fix-host-gpu-cold-2.json).



ACK remains acknowledgement, not task completion. Answer alone starts neither ACK nor microphone. Deliberate visible hold, editable recognition, explicit copy/review/Confirm and typed/manual fallbacks remain. Production capture15s/ringing60s limits and test coordination12s remain unchanged. V05 owner-deferred; all48 physical rows NOT RUN, human review NOT SIGNED; stable release and Phase09+ unapproved.

## 2. Change summary

| File/module | Change | Reason / evidence |
|---|---|---|
| `scripts/phase08-emulator-audio.mjs` | Anchor20ms deadlines to the original PCM timeline with minimum5ms post-prefill spacing; retain200ms prefill and100ms lateness/lag aborts | Rebased waits accumulated ordinary Windows oversleep; [30 host tests](evidence/phase-08-capture-fix-reviewed-host-tests.log) and [five Windows-clock dry runs](evidence/phase-08-capture-fix-windows-clock.json) |
| Same sender | Separate planned PCM duration, source-RPC attempted/completed outcome, privacy guards and offered-counter boundary | RPC0 and generated packets do not prove SDK delivery, app capture or recognition |
| `ReminderMicrophoneUiTest.kt` (AndroidTest only) | Gate start/deadline/elapsed, marker state and literal ABORT versus authorization diagnostics; fail-safe confirmation fence | [three actual gate controls](evidence/phase-08-capture-fix-reviewed-controls.json) |
| Reviewed local controllers/dispatcher | Preserve sanitized producer/native diagnostics on PASS and FAIL; separate pre-controller navigation, producer, native comparison and durable outcomes | Exact selected campaign/parent hashes in ledger; failures remain failures |
| Two MJS host-test files | Packet identity, timing recovery/limits, evidence classification and inert imports |30 tests PASS; no SDK/audio used by host tests |

Of the previous31 reviewed source entries, exactly two changed and29 other reviewed entries are unchanged; two host-test files expand the final ledger to33. The29 entries include test/tool sources and are not labelled29 production files. No production source changed in this capture follow-up. All six production APKs remain unchanged; only the test APK was rebuilt. No model, parser, dependency, schema or permission change. [source ledger](evidence/phase-08-capture-fix-source-hashes-final.json); [seven-APK ledger](evidence/phase-08-capture-fix-artifacts-final.json).

## 3. Tests and real outcomes

| Check | Command / actual procedure | Outcome | Evidence |
|---|---|---|---|
| Sender host checks | `node --test scripts/phase08-emulator-audio.test.mjs scripts/phase08-emulator-audio-realtime.test.mjs` |30 PASS | [host log](evidence/phase-08-capture-fix-reviewed-host-tests.log) |
| Real Windows monotonic clock | Five generated-byte streams: repeated4255/4320ms and12000ms; no SDK/RPC/audio device |5 PASS; maximum observed lag 24.0801ms | [dry-run JSON](evidence/phase-08-capture-fix-windows-clock.json) |
| Native diagnostic test build | Existing offline AndroidTest build; one worker and pinned local toolchain/models |PASS2m49s | [build log](evidence/phase-08-capture-fix-gate-diagnostics-test-build.log) |
| Test-only upgrade / identity | Upgrade in place; original rows/preferences/delivery checked; installed test hash matches host |PASS | [upgrade](evidence/phase-08-capture-fix-gate-diagnostics-test-upgrade.json); [installed hash](evidence/phase-08-capture-fix-gate-diagnostics-installed-hash.json) |
| Gate negative controls | Actual visible hold; literal ABORT, invalid marker, absent-marker timeout; no source PCM/RPC |3 PASS (expected native refusal), excluded from ten comparison trials | [controls](evidence/phase-08-capture-fix-reviewed-controls.json) |
| Final affected cases | Explicit two host-GPU cold cohorts; A03 once/V03 twice/V04 twice per cohort; pinned PCM gain500/pad1000/delay0 |{'FAIL': 5, 'PASS': 5} across10 retained trials | [exact attempts](evidence/phase-08-capture-fix-case-ledger.json) |
| Original-state restoration | Compare four saved baselines, settings/permissions/audio, owned fixtures, zero active jobs/registrations and final host OFF |10 PASS | [restoration](evidence/phase-08-capture-fix-restoration-final.json) |
| Final host integrity | Source/APKs, matrix/ledger, links/Git gates; executed after report generation | PASS, six groups | [integrity record](evidence/phase-08-capture-fix-validation-final.json) |
| Physical phone / V05 | Human protocol / reviewed consented local-accent audio |NOT RUN | [manual](../../qa/PHASE-08-MANUAL.md) |

| Cold | Case/trial | Outcome | Source submission | Native marker | Native reference metadata | Failure layer/code | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | A03/1 | FAIL | SOURCE_RPC_COMPLETED_HOST_OFF | ALLOW | mismatched | NATIVE_REFERENCE_COMPARISON | [parent](evidence/phase-08-emulator-expansion/ex20261028/20261030T205338144113Z-A03-microphone.json) |
| 1 | V03/1 | FAIL | SOURCE_RPC_COMPLETED_HOST_OFF | ALLOW | no usable audio | NO_AUDIO_SIGNAL | [parent](evidence/phase-08-emulator-expansion/ex20261028/20261030T205551784902Z-V03-microphone.json) |
| 1 | V03/2 | FAIL | SOURCE_RPC_ABORTED | ABORT | not observed | SOURCE_PRODUCER_OR_PRIVACY_GUARD | [parent](evidence/phase-08-emulator-expansion/ex20261028/20261030T205753249610Z-V03-microphone.json) |
| 1 | V04/1 | PASS | SOURCE_RPC_COMPLETED_HOST_OFF | ALLOW | matched | NONE | [parent](evidence/phase-08-emulator-expansion/ex20261028/20261030T205959763871Z-V04-microphone.json) |
| 1 | V04/2 | PASS | SOURCE_RPC_COMPLETED_HOST_OFF | ALLOW | matched | NONE | [parent](evidence/phase-08-emulator-expansion/ex20261028/20261030T210211307141Z-V04-microphone.json) |
| 2 | A03/1 | FAIL | SOURCE_RPC_COMPLETED_HOST_OFF | ALLOW | mismatched | NATIVE_REFERENCE_COMPARISON | [parent](evidence/phase-08-emulator-expansion/ex20261028/20261030T210729924062Z-A03-microphone.json) |
| 2 | V03/1 | PASS | SOURCE_RPC_COMPLETED_HOST_OFF | ALLOW | matched | NONE | [parent](evidence/phase-08-emulator-expansion/ex20261028/20261030T210937583606Z-V03-microphone.json) |
| 2 | V03/2 | FAIL | SOURCE_RPC_COMPLETED_HOST_OFF | ALLOW | mismatched | NATIVE_REFERENCE_COMPARISON | [parent](evidence/phase-08-emulator-expansion/ex20261028/20261030T211135653500Z-V03-microphone.json) |
| 2 | V04/1 | PASS | SOURCE_RPC_COMPLETED_HOST_OFF | ALLOW | matched | NONE | [parent](evidence/phase-08-emulator-expansion/ex20261028/20261030T211331703662Z-V04-microphone.json) |
| 2 | V04/2 | PASS | SOURCE_RPC_COMPLETED_HOST_OFF | ALLOW | matched | NONE | [parent](evidence/phase-08-emulator-expansion/ex20261028/20261030T211528745132Z-V04-microphone.json) |

Separate overlapping layer counts: source eligible for native inspection 9; literal producer ABORT 1; authorization blocked 1; gate timeout 0; native comparison metadata observed 9, true 5, false 4; strict assertions proven passed 5. App capture NO_AUDIO_SIGNAL occurs 1 time(s), classified APP_CAPTURE_NO_AUDIO_SIGNAL instead of an ASR word error. Unknown strict-assert attempts remain unknown. A pre-controller navigation failure is not a source abort or recognition failure. These counts are not an ASR accuracy denominator.

| Intentional control | Outcome | Marker | Actual gate wait ms | Literal producer ABORT |
|---|---|---|---:|---|
| abort | PASS (expected native refusal) | ABORT | 157 | true |
| invalid | PASS (expected native refusal) | INVALID_CONTENT | 154 | false |
| timeout | PASS (expected native refusal) | MISSING | 12032 | false |

Historical checks were **NOT RERUN in this capture follow-up**: JS preflight528 Jest tests/35 suites plus typecheck/lint/format/architecture, JVM81/8 suites, ordinary native53, frozen command64, four host storage harnesses,16 floor/offset decoder calls, four saved-capture replays, six GENERAL clips and six TTS callback conditions. Their recorded PASS results remain in the [input-loss report](phase-08-input-loss-report.md); they do not erase current failures or certify phones.

## 4. Performance and device matrix

Windows pacing5/5 is a host producer dry run using generated bytes, not a recording or phone-performance benchmark. Its maximum observed lag 24.0801ms is not STT latency. The final ten trials are two pinned synthetic responses on the saved preview emulator using temporary hardware graphics. Both cohorts had zero pre-controller navigation failures; this bounded observation does not prove that freezes are eliminated. Native clock/byte fields still do not prove successful capture. SDK implementation cause remains unproven; this is not broad SDK reliability, live-speech accuracy, real audibility or a vendor fix.

Release-like physical p50/p95, peak PSS, startup, natural alarm drift and battery measurements remain NOT RUN. ARM64 execution, low-memory phones, API30/31/newer phone coverage and physical audio routes remain pending. No speed or quality improvement percentage is claimed.

## 5. Reliability, privacy, permissions, licenses

The8s-gate experiment, both blocking12s cohorts and the rebased real-time cohort remain historical evidence in the ledger. Blocking passed 8 of 10 trials but still had no-signal/misrecognition failures. Rebased real-time had five source aborts, zero native reference comparisons and zero confirmed actions; its unchanged second cohort was NOT RUN. See [retained producer-abort analysis](evidence/phase-08-capture-fix-rebased-analysis.json). All final failures remain visible; passing reruns cannot erase them.

The first reviewed cohort retained two NO_AUDIO_SIGNAL captures despite source RPC0, host OFF and native ALLOW; passing captures had RMS about0.065 while empty captures were near the emulator input floor. See [filtered capture metadata](evidence/phase-08-capture-fix-reviewed-cold1-signal.json); no raw audio exporter was added. Its V03/2 navigation failure occurred before controller launch on an empty Main accessibility surface. A separately declared [navigation supplement](evidence/phase-08-capture-fix-navigation-supplement.json) added bounded pre-recording readiness observations; [six host readiness checks](evidence/phase-08-capture-fix-navigation-readiness.json) document the narrow change. The original preflight FAIL is retained; source/ASR retries, sender/native APK/PCM changes were not introduced by that navigation fix.

The original second-attempt batch retained five pre-controller FAIL results: an observed Android System UI ANR dialog blocked navigation, so no source stream or native reference comparison started. See the [System UI ANR evidence](evidence/phase-08-capture-fix-system-ui-anr.json). Root clicked the exact observed **Wait** action once; Chat returned without app reset/restart, data clear or settings change. A [separate preregistered resume plan](evidence/phase-08-capture-fix-system-ui-resume-plan.json) redeclared only the five capture interactions that had not started, on the same verified cold boot with unchanged sender/test/controller/PCM. The resumed batch completed one PASS/four FAIL: one producer lateness abort, one NO_AUDIO_SIGNAL capture and two pre-controller timeouts. It remains historical with the OS-blocked five and first reviewed cohort; no executed failure is discarded. The final ledger separately identifies the two later hardware-graphics cohorts; this is a changed emulator launch condition, not a passing reinterpretation of those earlier attempts.

The [cached Android recording-history review](evidence/phase-08-capture-fix-recording-history.json) contains owned OS start/stop entries reported as not silenced with VOICE_RECOGNITION source at observed endpoints. This is not continuous PCM-health monitoring, proof of successful input delivery or proof of an SDK/vendor cause.

The current comparison protocol uses one anchored real-time source stream after actual visible Recording. The optional format-only initializer is historical/experimental and is not used in this comparison protocol. Host input must remain OFF; no automatic/background mic, source replay, recording export or capture-threshold/model weakening was added. Gate ABORT/invalid/timeout prevents copy/review/Confirm; controls independently verified unchanged reminder/task state and zero ACK/snooze actions.

Production app SHA256 `7300f2aefeb8d5f90882655d46435b100a12531e16a7c70df4f81230f4160454`. Installed diagnostic test APK SHA256 `abb103afe1dab0bef0646734d126391a355cf2a1a7fb664401544db57b71b0a9`. Upgrade/data checks do not imply compatibility with the incompatible Nol replacement app. No uninstall/data clear/reset, DB replacement, legacy write, pull/merge/push or publication. Soft removal retains saved text/history/receipts. Existing pinned model/licence decisions remain unchanged.

A later fresh launch found no connected emulator; its termination cause is unknown, not a proven crash. Read-only host inspection and cached startup output identified software GLES/Vulkan rendering on the earlier launch. A temporary `-gpu host` override uses the existing NVIDIA GPU while retaining the same saved userdata, installed candidate, 2048MiB/four cores, source PCM and timing guards. The saved AVD configuration is unchanged. The two selected final cohorts use that override. See [host diagnosis](evidence/phase-08-capture-fix-host-health.json), [predeclared hardware-graphics plan](evidence/phase-08-capture-fix-host-gpu-plan.json), and numeric post-batch capture metadata for [cold1](evidence/phase-08-capture-fix-host-gpu-cold1-signal.json) / [cold2](evidence/phase-08-capture-fix-host-gpu-cold2-signal.json). GPU acceleration is a test-platform experiment, not a production app change or proof of the audio-loss cause. Any remaining capture/recognition/preflight failures continue to block reliability.

One separately predeclared opt-in pinned-synthetic hypothesis diagnostic ran after the ten fixed trials. Outcome: FAIL_OR_UNSUPPORTED_REVIEW_REQUIRED; classification: NO_AUDIO_SIGNAL_NO_LEXICAL_HYPOTHESIS_AVAILABLE. Its existing fixture-SHA guard permits only this synthetic clip; the hypothesis remains in ignored local instrumentation evidence, with no raw transcript published or PCM exported. It is excluded from all ten comparison scores, never replaces a failed trial and does not establish the cause of earlier mismatches. See [sanitized diagnostic record](evidence/phase-08-capture-fix-pinned-hypothesis.json).

## 6. Human phone verification

All steps below remain NOT RUN on a physical phone. Use the [full48-row manual](../../qa/PHASE-08-MANUAL.md) and record non-sensitive device/API/RAM/build, outcome and scheduled/actual times.

1. Install the compatible ARM64 DataQa0.8.0/code11 APK identified in the final artifact ledger by an in-place upgrade after checking reviewed app lineage/signing. Open Profile, Calendar and Notes; expect existing settings/items/text preserved. Stop on unknown lineage or signature/schema mismatch; do not uninstall/clear data.
2. In Profile record original settings, enable reminder delivery and set lead time to0 for this fixture. In Chat create and Confirm a fresh reminder two minutes ahead. Enable airplane mode and turn Wi-Fi/mobile data off. Background/lock the phone. At due time expect the OS-permitted notification/reminder presentation. Tap Answer: visible text/optional offline system TTS, no ACK, completion or microphone start.
3. Deliberately hold/release speech input, inspect the transcript, explicitly copy/edit, Review and Confirm a supported ACK. Expect exactly one acknowledgement, window close/reconciliation and underlying task still TODO. Cancel/edit misrecognition; typed/manual ACK must work.
4. On a fresh reminder review/Confirm snooze10minutes. Expect exactly one future replacement reminder/job and task still TODO; verify replacement delivery and no duplicate original action. Check other supported durations separately.
5. Deny microphone/disable available speech, interrupt/background the response and exercise stale review. Expect clear recovery, preserved manual/typed fallback and no late transcript/action. Verify Read/Stop using an installed offline system voice; actual audibility/intelligibility remains a human check.
6. Complete at least30 physical alarms and10 live interactions per tested voice. Cover ARM64/low-memory/API30/31/newer, OEM/natural Doze/reboot/force-stop limits, permissions, quiet/noisy/soft speech, TalkBack/large text/keyboard, audio routes, battery and matched performance. Restore original settings and remove only owned fixtures; sign only after applicable outcomes are recorded.

V05 remains deferred until suitable reviewed public/consented local-accent audio is available. Generic synthetic voices do not satisfy it. V05 owner-deferred; all48 physical rows NOT RUN, human review NOT SIGNED; stable release and Phase09+ unapproved.

## 7. Docs/ADRs changed

Current report/index/README, main Phase08 verification paragraph, manual/current APK links, release gate, requirements note, execution checklist, emulator protocol, flow contract and ADR024 current transport note are updated while historical reports/results remain retained. Decoder/production architecture decisions are unchanged. AST-only `graphify update .`: see [actual update log](evidence/phase-08-capture-fix-graphify-final.log); navigation evidence does not replace compiler/device checks.

Final host integrity passed all six groups with zero errors. The [initial integrity record](evidence/phase-08-capture-fix-validation-final.json) precedes this result annotation; the final document-hash recheck is saved separately as `phase-08-capture-fix-validation-verified.json`. Integrity verifies the evidence package and does not convert retained emulator failures into a phase pass. Graphify reported its known partial Kotlin/Gradle extraction limitations; it is navigation evidence, not compilation proof.

## 8. Open blockers and recommended next steps

Retained affected-case failures still block an emulator reliability pass; use their separate preflight/producer/native layers for any further narrowly justified fix. Do not retry unchanged failures until evidence supports a distinct change. The next distinct platform comparison is the same candidate and pinned source on a stable Android system image; only the preview guest is currently installed. This is not proof that the SDK or guest is the cause, and it does not replace the physical-phone gates.

V05, all48 physical rows, real audio/speech/OEM behavior/performance and human signature remain pending. No Phase09 implementation or stable-release/publication approval follows. Complete the distinct platform diagnosis and the physical checklist; preserve manual fallbacks.

## 9. Review decision

- [ ] Selected emulator follow-up assertions passed (see exact limits and retained outcomes).
- [x] Original-state restoration and source/artifact ledgers completed for this follow-up.
- [x] Final integrity recorded after report generation: six groups PASS; emulator failures remain blocked.
- [ ] Physical manual tests completed and human-confirmed; V05 remains deferred.
- [x] No disallowed production/model/schema/online scope added in this follow-up.

**STATUS: BLOCKED**

**STOPPED — awaiting explicit human approval.**
