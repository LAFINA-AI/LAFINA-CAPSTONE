# Phase 08 — remaining emulator cases / final follow-up report

**Historical checkpoint:** the [current input-loss report](phase-08-input-loss-report.md) and [current case ledger](evidence/phase-08-input-loss-case-ledger.json) supersede the verification counts below. The fresh full campaign has44PASS/3FAIL/1NOT RUN; original results/failures below remain historical. Physical acceptance is pending.


**Branch / base HEAD:** `codex/phase-07-audit-hardening` / `98bef88c3ae0fabee677c1466417fc34c0af738c`.  
**Date:** 2026-10-29 Asia/Manila; evidence timestamps are UTC.  
**Status:** AWAITING DEVICE VALIDATION. Work remains local; Phase09+ is not approved.

## 1. Outcome and acceptance boundary

The ten remaining cases are closed for this emulator run: **9 PASS, 0 FAIL, 1 NOT RUN**, across 18 retained attempts. V05 remains NOT RUN by explicit owner decision until suitable reviewed public/consented local-accent audio is available. The complete mixed-cohort matrix is **47 PASS, 0 FAIL, 1 NOT RUN**. These counts describe latest scoped outcomes; they are not an all-attempt success rate or a fresh run of all 48 cases on this APK.

Gain-sensitive decoding was corrected and interruption cancellation now names the audio reason. Intermittent SDK synthetic-input loss remains a documented test limitation: a completed virtual stream sometimes produced no app signal. Later unchanged-transport trials passed, but no client protocol defect or definitive installed-SDK cause was established. Do not describe that intermittency as fixed or as proof of a phone microphone defect. See the [transport finding](evidence/phase-08-remaining-audio-transport-finding.md).

All 48 physical rows remain NOT RUN; physical alarm/live-human certifications remain zero and the human release gate is unsigned. No phase acceptance, phone accuracy, audible TTS or stable offline release approval follows from emulator results.

## 2. Changes and architecture

- English answered-reminder decoding uses `max(16/32768, capturedPeak * 0.001)` for boundary selection. The previous absolute threshold selected onsets 82 frames/5.125ms apart for two gain-varied captures of the same synthetic ACK. The relative rule aligned them; both exact saved-capture replays independently parsed ACK. Sample amplitudes, model, hint, beam 3, general decoding and strict command grammar are unchanged. [Analysis](evidence/phase-08-remaining-boundary-analysis.json), [nonzero replay](evidence/phase-08-remaining-replay-old-nonzero-relative.json), [faithful replay](evidence/phase-08-remaining-replay-old-faithful-relative-copywait.json).
- Audio-mode interruption is a cancellation in the existing recorder. Its visible message now exposes AUDIO_INTERRUPTED/AUDIO_FOCUS_LOST while keeping the typed draft. The failure driver accepts the actual cancellation outcome and still requires Recording before interruption, stop/no late result, manual reviews and unchanged SQLite state.
- Test-only unavailable-engine, busy-audio, interruption and exact synthetic replay drivers were added. The noise helper accepts only fixed checksum-pinned 20dB derivatives. No automatic recording, restart or confirmation is added.
- Capture remains capped at 15 seconds, derived context 16.345 seconds, decoder deadline 30 seconds and ringing 60 seconds. ACK is receipt of the reminder and leaves the task TODO. No schema/model/dependency/permission change, account, backend, Gemini, RAG or Kokoro was added.

The [31-file source ledger](evidence/phase-08-remaining-relative-source-hashes-final.json), [ADR024](../decisions/ADR-024-reminder-speech-vocabulary.md) and [flow contract](../phase-08-offline-loop.md) identify the retained implementation.

## 3. Fresh tests and actual outcomes

| Case | Latest scoped outcome | Attempts | Scope | Evidence |
|---|---|---|---|---|
| A08 | PASS | 1 | Unsecured keyguard/noninteractive due condition and actual notification opened; reviewed ACK/task TODO/zero registrations. No secure-lock/full-screen/OEM claim. | [latest](evidence/phase-08-emulator-expansion/ex20261028/20261029T072200133653Z-6cbc5a-A08-power.json) |
| A25 | PASS | 1 | Actual zero enabled TTS services and unavailable offline-voice UI; typed/manual reviews cancelled; independent SQL unchanged; exact engine inventory/state restored. | [latest](evidence/phase-08-emulator-expansion/ex20261028/20261029T074017125079Z-A25-failure.json) |
| A26 | PASS | 1 | Actual communication mode before hold blocked capture; preserved draft and working typed/manual reviews with unchanged SQL. Not removed Whisper/vendor engine absence. | [latest](evidence/phase-08-emulator-expansion/ex20261028/20261029T073138056128Z-A26-failure.json) |
| A27 | PASS | 4 | Actual Recording before OS audio-mode change; visible cancellation/failure, no late transcript, preserved draft and cancelled manual/typed reviews; unchanged SQL and exact audio-mode restore. | [latest](evidence/phase-08-emulator-expansion/ex20261028/20261029T142119182799Z-A27-failure.json) |
| V01 | PASS | 4 | Pinned synthetic ACK through actual visible hold/capture, copy/review/Confirm, paired ACK/task TODO/zero registrations. | [latest](evidence/phase-08-emulator-expansion/ex20261028/20261029T142355292045Z-V01-microphone.json) |
| V02 | PASS | 1 | Pinned synthetic ten-minute snooze through actual visible hold/capture, copy/review/Confirm, generation+1/task TODO/one replacement at independently checked time. | [latest](evidence/phase-08-emulator-expansion/ex20261028/20261029T074514532353Z-V02-microphone.json) |
| V03 | PASS | 2 | Two independent repeated pinned synthetic ACK flows; review/Confirm and paired SQL checks. Earlier failures remain; no speaker variation/quiet human claim. | [latest](evidence/phase-08-emulator-expansion/ex20261028/20261029T140353132735Z-V03-microphone.json) |
| V04 | PASS | 2 | Two independent repeated pinned synthetic ten-minute snooze flows; review/Confirm and exact replacement-time/paired SQL checks. | [latest](evidence/phase-08-emulator-expansion/ex20261028/20261029T140741900136Z-V04-microphone.json) |
| V05 | NOT_RUN | 0 | NOT RUN by explicit owner decision; reviewed public/consented local-accent recording unavailable. | Owner deferred |
| V06 | PASS | 2 | One defined 20dB synthetic-noise snooze through visible capture/review/Confirm and exact paired SQL/time checks; not room-noise/human acoustic tolerance. | [latest](evidence/phase-08-emulator-expansion/ex20261028/20261029T140930466578Z-V06-microphone.json) |

Every attempt remains linked with its original outcome/hash in the [closed ledger](evidence/phase-08-remaining-case-ledger.json). The [pre-remaining matrix](evidence/phase-08-emulator-expansion-matrix-pre-remaining.json) preserves 38 PASS/10 NOT RUN. A08/A25/A26/V02 passed earlier in this follow-up; V03/V04/V06 passed on the relative-boundary candidate before the final interruption-message build. V01/A27 final retries and native/GENERAL controls identify their later cohort in linked timestamps. Earlier 38 passes were not rerun wholesale.

| Check executed in this follow-up | Result | Evidence |
|---|---|---|
| Final Android build / both ABIs / matching test APK | PASS;8m12s | [build](evidence/phase-08-remaining-relative-final-build.log) |
| JVM task explicitly rerun |81 tests /8 suites, zero failures/errors/skips | [XML summary](evidence/phase-08-remaining-relative-jvm-results-final.json) |
| Final native instrumentation |52 tests PASS | [native log](evidence/phase-08-remaining-relative-native.log) |
| Peak-relative offset/floor controls |16/16 exact references and independent expected commands; two originals, offsets0/250/500/1000ms, floors0/8PCM | [controls](evidence/phase-08-remaining-relative-offset-results.json) |
| Unsupported speech / digital silence |4 inputs produced no ACK/snooze proposals; safe refusal is separate from transcript quality | [controls](evidence/phase-08-remaining-relative-negative-controls.json) |
| GENERAL six-clip corpus |6/6 exact, 0/36 word errors on these synthetic references | [analysis](../benchmarks/phase-08-remaining-relative-general-corpus-analysis.json) |
| APK/model/native alignment |7 APKs /84 ELFs /six pinned model copies PASS; QA/release no INTERNET | [artifact ledger](evidence/phase-08-remaining-relative-artifacts-final.json) |
| Temporary exporter removal |Source exporter/call and removed identifiers absent in all 7 APKs | [absence](evidence/phase-08-remaining-relative-diagnostic-absence-final.json) |
| Final data/settings/audio restoration |10/10 checks PASS | [restoration](evidence/phase-08-remaining-relative-restoration-final.json) |

The three unsupported utterances transcribed exactly. The 15-second digital-silence control produced nonempty text, which the strict parser refused; this is a safe command-refusal result, not a silence-recognition quality pass.

The final build used the existing JDK17, model and corpus from the `android` directory:

```powershell
$env:JAVA_HOME='C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot'
$env:PATH=$env:JAVA_HOME+'/bin;'+$env:PATH
$qa08Model=(Resolve-Path '../.local/phase06-whisper-assets').Path
$qa08Corpus=(Resolve-Path '../.local/phase06-corpus').Path
.\gradlew.bat :app:testDataQaUnitTest --rerun :app:assembleDataQa :app:assembleDataQaAndroidTest :app:assembleDebug :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' "-PwhisperModelDir=$qa08Model" "-PsttCorpusDir=$qa08Corpus" '-Dorg.gradle.jvmargs=-Xms64m -Xmx768m -XX:MaxMetaspaceSize=512m -XX:+UseSerialGC -Dfile.encoding=UTF-8' '-Pkotlin.compiler.execution.strategy=in-process' --offline --max-workers=1 --no-daemon --console=plain
```

From the repository root, artifact and source navigation commands were:

```powershell
python scripts/verify-phase08-apks.py --previous docs/reports/evidence/phase-08-speech-floor-artifacts-final.json --output docs/reports/evidence/phase-08-remaining-relative-artifacts-final.json
node --check scripts/phase08-emulator-audio.mjs
& 'C:/Users/USER-PC/.local/bin/graphify.exe' update .
```

Use a new output filename when repeating evidence collection. The native runner
was `com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner` on
`emulator-5554`. The opted-in decoder probe used `runPhase08ResponseDecoderProbe=true`;
the GENERAL benchmark used `runSttBenchmark=true`, cohort `phase08relative20261029`.
Visible case drivers require the owned fixture/source identifiers and safeguards
specified in the [execution protocol](../../qa/PHASE-08-EMULATOR-EXPANSION.md).

Historical528Jest/35suite preflight and prior phase/expansion tests were not rerun merely to orient this continuation. Final integrity is recorded separately after documentation is saved; it does not certify phone acceptance.

## 4. Device, timings and limits

Saved `Medium_Phone`, `emulator-5554`, `sdk_gphone16k_x86_64`, API 37 preview,16KiB pages; SDK 37.1.11/build15917651. Final installed0.8.0-data-qa/code11, package `com.lafina.capstone`, schema3. QA SHA256: `7300f2aefeb8d5f90882655d46435b100a12531e16a7c70df4f81230f4160454`. ARM64 APKs were built/inspected; ARM64 execution is NOT RUN.

Fresh paired alternating mode observations use three invocations per mode and two unchanged synthetic clips. Cached model, DataQA emulator, per-call load/free, requested500ms PSS sampling including ADB overhead; sampled PSS is not an absolute peak. These small samples establish no stable p95, phone energy, full interactive latency or speed improvement.

| Mode | Calls | Median prepare/load/decode ms | Max ms | Max sampled PSS KiB | Exact expected/parsed |
|---|---|---|---|---|---|
| GENERAL | 6 | 4517 | 5165 | 166617 | 0/6 |
| REMINDER_RESPONSE | 6 | 4295.5 | 4918 | 185875 | 6/6 |

[Timing/PSS evidence](evidence/phase-08-remaining-relative-decoder-comparison.json). The six-clip GENERAL corpus measured median3962.5ms, max5212ms and max sampled PSS168636KiB for that separate synthetic corpus. No microphone was opened by either direct-decoder benchmark.

V06 used centered deterministic synthetic noise only over the source utterance, measured19.999960dB SNR for snooze, no clipping; transport zero padding is separate. It does not establish real-room, echo, accent or quiet-voice tolerance. [Noise provenance](../benchmarks/phase-08-synthetic-noise-audio.json).

## 5. Reliability, privacy and restoration

No reset, branch switch, pull/merge, uninstall, clear-data, DB replacement, legacy edit or publication occurred. The saved emulator was reopened with authenticated SDKgRPC and existing userdata. [Resume verification](evidence/phase-08-remaining-resume-20261029.json) and [final compatible upgrade](evidence/phase-08-remaining-relative-final-upgrade.json) preserved original non-diagnostic rows and full preferences. A replay attempted while the emulator was closed copied no files; a later transfer-drain race was corrected in the private replay controller by waiting only for an exact growing prefix of newly copied owned bytes, then enforcing full hash equality. Failed records remain.

Final restoration compared both original baselines, exact preference payload/delivery flags, permission flags/AppOps, radios/time/display/power, normal audio mode, original GoogleTTS enabled setting/inventory, stopped recording history, zero active jobs/registrations and source/installed/APK hashes. Only two exact size/SHA-pinned decoder WAVs were removed. Temporary request/exports were absent. No unknown files were deleted. Owned QA items were soft-removed through reviewed UI; saved text/history/receipts remain, so this is not permanent erasure.

Only deliberate visible holds opened recording. The controller never requested host microphone enable. Synthetic waveform/transcript diagnostics and unrestricted route snapshots remain ignored/private; public evidence contains fixed outcomes, counts and hashes. A stream success is never promoted to capture/ASR success without the actual expected transcript and durable-state checks.

## 6. Concrete manual checklist

Use the [current APK ledger](evidence/phase-08-remaining-relative-artifacts-final.json) and [full phone manual](../../qa/PHASE-08-MANUAL.md). Upgrade only known compatible capstone lineage/signing with data preserved; stop on signature/schema/lineage problems.

1. Open Profile, Calendar and Notes after the compatible ABI upgrade; verify saved data/preferences. Record original settings, enable delivery deliberately and create an owned reminder two minutes ahead with lead0.
2. Enable airplane mode with Wi-Fi/mobile data OFF, background/lock the phone and wait. Open its notification and Answer. Expect visible reminder/optional offline TTS and no automatic microphone.
3. Deliberately hold, speak ACK and release. Review/edit/copy the words, inspect exact reminder/action and Confirm. Expect reminder closed and task TODO. Use a fresh reminder for a reviewed ten-minute snooze; expect one replacement at the intended time.
4. Repeat quiet/soft speech and supported durations. Cancel/unsupported speech must make no change. Revoke mic, make speech unavailable and interrupt actual recording/audio; expect stop/warning, preserved draft, no late result and working typed/manual review.
5. Restore settings/permissions/radios/delivery and remove only owned fixtures through reviewed UI. Record phone model/OS/APK hash, actual outcomes and missed/delayed alarms in the physical matrix.

NOT RUN: all 48 physical rows, ARM64/low-memory/minimum/newer phones, live accents/quiet/noisy speech, actual offline audibility, OEM/naturalDoze/reboot/force-stop behavior, TalkBack, phone battery/performance and signed human review. V05 remains owner-deferred until suitable audio exists.

## 7. Documentation and verification navigation

The [compact status](CURRENT-STATUS.md), [requirements](../../qa/REQUIREMENTS-MATRIX.md), [execution checklist](../../qa/PHASE-08-EXECUTION.md), [manual](../../qa/PHASE-08-MANUAL.md), architecture and ADR point to this cohort. Earlier reports retain historical measurements. AST-only [Graphify update](evidence/phase-08-remaining-relative-graphify-final.log) completed with 2951 nodes / 6567 edges / 209 communities and no semantic API cost. Three Kotlin/Gradle files were partially parsed; compiler/tests, rather than the graph, verify behavior. No model/key/paid extraction was requested.

[Final host integrity](evidence/phase-08-remaining-relative-validation-verified.json) verifies hashes, all public JSON, current local links, Git identity, physical 48 NOT RUN and the unsigned gate. It is an integrity check, not another device run.

## 8. Open limitations and next steps

Intermittent emulator synthetic input loss remains open at the SDK/routing investigation layer. Its documented reference-implementation hypotheses are not proven causes in the installed binary. Preserve the failed trials; do not hide them with relaxed grammar or automatic recording. If it recurs, collect bounded content-free route/capture diagnostics as specified in the transport finding.

V05 and all physical acceptance/performance gates remain pending. A real phone must establish offline recognition, audibility, lifecycle delivery and usability before the unsigned offline release gate can be accepted. Phase09+, remote publication and new models/features remain unapproved.

## 9. Handoff

STATUS: AWAITING DEVICE VALIDATION  
STOPPED — awaiting explicit human approval
