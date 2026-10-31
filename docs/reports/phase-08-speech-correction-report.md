# Phase 08 — spoken ACK/snooze correction report

**Historical correction cohort:** the [current input-loss report](phase-08-input-loss-report.md)
and [current APK ledger](evidence/phase-08-input-loss-artifacts-final.json)
supersede this candidate. The fixed-floor profile, counts, timings, hashes and
restoration below are retained as historical evidence. The follow-up uses a
peak-relative boundary and separately records all new attempts, including
intermittent synthetic input loss. Physical acceptance remains pending.

**Branch / base HEAD:** `codex/phase-07-audit-hardening` / `98bef88c3ae0fabee677c1466417fc34c0af738c`.  
**Date:** 2026-10-29 Asia/Manila; linked evidence records UTC.  
**Device:** saved Medium_Phone, `emulator-5554`, `sdk_gphone16k_x86_64`, API37 preview, x86_64, 16KiB pages.  
**Candidate:** `0.8.0-data-qa`, code11, package `com.lafina.capstone`, schema3.  
**Status:** `AWAITING DEVICE VALIDATION`. Work remains local and uncommitted.

The owner approved Phase 08 and explicitly requested this spoken-response correction and affected emulator reruns while retaining physical-device gates. This is the current speech-correction cohort. The [original implementation report](phase-08-report.md), [earlier expansion report](phase-08-emulator-expansion-report.md) and [pre-correction matrix](evidence/phase-08-emulator-expansion-matrix-pre-speech.json) preserve their historical results and failures. No next phase, remote merge, publication, uninstall, app-data clear, database replacement or legacy edit occurred.

## 1. Scope completed

F-010/F-013 and the F-006/F-008 foreground reminder loop receive a reminder-only speech decoder correction. Recognition still produces an editable draft. The user must explicitly copy it, review the exact action/title/duration and Confirm. The parser, source/generation/deadline checks, 60-second ringing window and transactional ACK/snooze semantics are unchanged. ACK leaves the task TODO. No microphone starts at Answer, permission grant, TTS completion or a background callback. Manual buttons and typing remain available.

The pinned short synthetic response clips exposed lexical decoding errors independently of microphone transport. Additional silence alone did not fix them. A fixed vocabulary hint corrected snooze but not ACK; a bounded beam alone still added an unsupported prefix to ACK, which was refused. A single successful boundary alignment was insufficient: offset tests still failed. These [diagnostic candidates](evidence/phase-08-speech-diagnosis.json) remain preserved.

The retained candidate gives only English answered-reminder dictation a fixed vocabulary hint, deterministic beam 3 and bounded floor-aware signal context. It locates samples with absolute magnitude at least 16/32768 (the measured emulator floor was at most 8 PCM), retains 250 ms before/750 ms after that signal and anchors it with 345 ms leading/1,000 ms trailing context. Without a signal above that floor it adds 250 ms each side. This can remove quiet input outside the margins; it is not general voice-activity detection or word substitution. General/Chat transcription keeps its original unhinted greedy path. The captured-input limit remains 15 seconds; the largest derived buffer is 16.345 seconds, under the unchanged 30-second cancellation deadline. Model weights/checksum, dependencies, schema and Android permissions are unchanged. See [ADR024](../decisions/ADR-024-reminder-speech-vocabulary.md).

## 2. Change summary

| Area | Change and reason | Evidence |
|---|---|---|
| AnsweredDictationPanel / SpeechInput | Select a typed REMINDER_RESPONSE vocabulary only in the visible reminder; default remains GENERAL | [29-file source ledger](evidence/phase-08-speech-floor-source-hashes-final.json) |
| WhisperTranscriber / JNI | Fixed local vocabulary, beam 3 and bounded floor-aware context for short reminder responses | Decoder controls and actual UI results below |
| QA diagnostics / decoder probe | Content-free DataQa frame/nonzero/RMS diagnostics; opt-in pinned hypotheses stay private; positive and unsupported-speech controls | [diagnosis](evidence/phase-08-speech-diagnosis.json) |
| Synthetic parent controller | SDK server pacing, calibrated test-only gain 500/1000, bounded zero pre/post-roll and optional onset delay; app capture still requires the actual visible hold | Current matrix and UI logs below |
| Reports / manuals / ADR | Preserve failed cohorts and distinguish emulator evidence from human acceptance | Sections6–9 |

## 3. Tests and real outcomes

| Check | Outcome | Evidence |
|---|---|---|
| Final Android build | PASS; six production APKs/both ABIs, matching test APK and JVM task;4m55s | [build](evidence/phase-08-speech-final-build.log) |
| JVM results |81 tests / 8 suites, 0 failures/errors/skips | [JVM XML summary](evidence/phase-08-speech-floor-jvm-results-final.json) |
| Data-preserving QA/test upgrade | PASS; original non-diagnostic rows/full preferences preserved, native flags unchanged, schema3 | [upgrade](evidence/phase-08-speech-final-candidate-upgrade.json) |
| APK/model/alignment inspection | PASS ; 7 APKs / 84 ELFs, 16 KiB alignment and six pinned model copies ; QA/release no INTERNET | [artifacts](evidence/phase-08-speech-floor-artifacts-final.json) |
| Exact short responses / startup offsets | 16/16 calls across both originals, 0/250/500/1000ms offsets and zero/eight-PCM floors matched exact responses and independently parsed; retained decoder profile before diagnostic-export removal | [offset/floor archive](evidence/phase-08-speech-floor-offset-results.json) |
| Actual visible speech → copy → review → Confirm → SQL | PASS ; 2 fresh ACK and 2 fresh exact ten-minute snoozes on final APKs; explicit copy/review/Confirm, task TODO, correct paired state/registrations | [ACK](evidence/phase-08-speech-final-visible-A03.log), [snooze](evidence/phase-08-speech-final-visible-A06.log), [per-trial matrix](evidence/phase-08-emulator-expansion-matrix.json) |
| Unsupported speech / maximum-input silence | PASS ; 4 inputs produced no response command (3/3 known utterances exactly transcribed ; 15 s digital silence separately recorded) | [controls](evidence/phase-08-speech-final-negative-controls.json) |
| Native boundary regression | PASS ; 52 instrumentation tests on matching final APK | [native log](evidence/phase-08-speech-final-native.log) |
| General six-clip corpus | 6/6 normalized exact; 0/36 word errors on these synthetic clips only | [raw synthetic results](../benchmarks/phase-08-speech-general-corpus.json), [analysis](../benchmarks/phase-08-speech-general-corpus-analysis.json) |
| Matched decoder timing/PSS | 6 alternating invocations, 3 trials/mode, two clips each; measured separately below | [comparison](evidence/phase-08-speech-decoder-comparison.json) |
| Host integrity / current restoration | PASS ; 10 device restoration checks; current candidate/source/APK hashes matched. Host integrity is separately linked below | [restoration](evidence/phase-08-speech-floor-restoration-verified.json) |
| JS preflight | NOT RERUN in this correction; unchanged JS/TS. Prior expansion 528 Jest / 35 suites, typecheck/lint/format/architecture PASS remain historical evidence | [prior log](evidence/phase-08-expansion-preflight.log) |
| Physical devices / live speech / audibility | NOT RUN | [manual](../../qa/PHASE-08-MANUAL.md) |

From `android/`, the build used the installed JDK17 and existing verified inputs, with no downloads:

```powershell
$env:JAVA_HOME='C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot'
$env:PATH=$env:JAVA_HOME+'/bin;'+$env:PATH
$qa08Model=(Resolve-Path '../.local/phase06-whisper-assets').Path
$qa08Corpus=(Resolve-Path '../.local/phase06-corpus').Path
.\gradlew.bat :app:assembleDataQa :app:assembleDataQaAndroidTest :app:assembleDebug :app:assembleRelease :app:testDataQaUnitTest '-PreactNativeArchitectures=arm64-v8a,x86_64' "-PwhisperModelDir=$qa08Model" "-PsttCorpusDir=$qa08Corpus" '-Dorg.gradle.jvmargs=-Xms64m -Xmx768m -XX:MaxMetaspaceSize=512m -XX:+UseSerialGC -Dfile.encoding=UTF-8' '-Pkotlin.compiler.execution.strategy=in-process' --offline --max-workers=1 --no-daemon --console=plain
```

The two original synthetic WAVs and model pins are unchanged. Decoder probes opt in with `runPhase 08ResponseDecoderProbe=true`; exact positives additionally require `responseVocabulary=true` and `requireSyntheticResponseExact=true`. The visible parent uses `A03`/`A06`, `--transport-padding-ms 1000 --transport-gain-permille 500`, optional `--injection-delay-ms 500` and fresh owned fixtures. These are ignored local controllers; public logs/JSON contain the independently checked outcomes, with raw diagnostic hypotheses/audio kept private.

## 4. Performance and device matrix

The raw decoder returned nonempty text on the 15-second digital-silence control;
the strict parser refused it. That control certifies no response proposal for
that input, not correct silence recognition or a human false-action rate.

Three alternating invocations per mode used the same two pinned clips/model and
final DataQa APK, cached model storage and the same emulator. Prepare/load/decode
includes per-request context creation. PSS is sampled over each invocation at a
requested 500 ms plus ADB overhead; it is not the absolute peak or full UI footprint.

| Mode | Decoder calls | Median ms | Max ms | Max sampled process PSS KiB | Expected command parsed |
|---|---:|---:|---:|---:|---:|
| GENERAL |6|3623.5|5734|167247|0/6|
| REMINDER_RESPONSE |6|3849.5|4101|185871|6/6|

The unchanged GENERAL six-clip corpus had median 3406.5 ms,
max 3759 ms and max sampled PSS 169457 KiB.
The bounded observations document this decoder tradeoff; they establish no
speed improvement, stable p95 or human accuracy rate.

Only this x86_64 preview emulator executed. Building ARM64 does not prove ARM64 execution. No stable p95, speed improvement, phone peak RAM, battery, human acoustic accuracy or full voice-loop performance is certified. The fixed hint mentions ten minutes: other durations/aliases require separate checks and must be reviewed before confirmation.

## 5. Reliability, privacy and restoration

Synthetic capture also exposed a test-environment issue. An earlier restart used `-no-audio`, which disables virtual-device audio support, as confirmed by the [installed help](evidence/phase-08-speech-emulator-no-audio-help.log) and [Android documentation](https://developer.android.com/studio/run/emulator-commandline#advanced). The same saved AVD was restarted without that flag or `-allow-host-audio`; its data survived and [host input was false](evidence/phase-08-speech-audio-start.json). Audio-enabled attempts still returned NO_AUDIO_SIGNAL. Actual nonzero capture was established only with the SDK helper's bounded one-second zero pre/post-roll. A successful gRPC return alone is not capture or recognition proof; the precise emulator routing cause is not established.

The pre-roll is synthetic transport setup after actual visible Recording, not an automatic microphone start or a new production recording delay. No pre-arm protocol was applied. A cold-boot fixture-creation attempt also failed before any task existed; it is preserved separately from recognition results. No failed attempt applied a speculative ACK/snooze. Owned QA removal retains saved text/history and operation receipts.

A repeated visible ACK attempt with the earlier client-paced helper still produced a mismatch and was refused. The installed SDK proto specifies blocking delivery paced by emulator consumption. The helper now honors HTTP/2 backpressure and removes its additional 20 ms client timer. Earlier passing and failing captures remain separate cohorts; the final transport was then checked against actual reminder AudioRecord data. At gain 1000 the virtual input gain was 1.994819 with 64 clipped samples and a nonzero floor up to 8 PCM. Test-only gain 500 recovered correlation 0.999999987278, gain 1.000078 and zero clipping against the unchanged synthetic ACK waveform. [Before](evidence/phase-08-fidelity-analysis-native-20261029T025728002381Z.json), [after](evidence/phase-08-fidelity-analysis-native-20261029T031904526676Z.json). The temporary one-shot exporter/probe used to obtain that diagnosis was removed; [all seven final APKs exclude its identifiers](evidence/phase-08-speech-final-diagnostic-removal.json). No persistent recording feature was added. This is known-waveform transport evidence, not human acoustic validation.

The [final restoration](evidence/phase-08-speech-floor-restoration-verified.json)
passed 10 checks. Original non-diagnostic SQLite rows/full preferences survived;
owned synthetic fixtures were soft-removed, active jobs/registrations were 0,
delivery/full-screen OFF, original radio/time/display/permission/AppOps/power
settings restored, no active recording, host mic OFF and installed/source/APK
hashes matched. The two exact temporary decoder WAVs were removed after size/SHA
verification. The temporary diagnostic request/capture exports were also [verified absent](evidence/phase-08-speech-final-device-diagnostic-absence.json).
There was no app-data clear, uninstall, database replacement or permanent erasure
of fixture history. The initial restoration attempt passed 9/10 checks but
rejected closed Android recording history as unknown. Its
[failed result](evidence/phase-08-speech-floor-restoration-final.json) is preserved.
The corrected host checker permits only exact known package history with a final
stop per recording ID, rejects active/unknown/open records, and passed
[observed-dump plus unsafe-variant controls](evidence/phase-08-speech-restoration-history-checker.json)
before the full 10-check retry. [Final host integrity](evidence/phase-08-speech-floor-validation-verified.json)
checks links/JSON, ledgers, Git identity and the unsigned 48-row physical gate.

The matrix now has 38 scoped PASS, 0 FAIL, 10 NOT RUN. Only A03/A06 were rerun on these
speech APKs; other row cohorts are retained historical results, not a complete
new-candidate suite. Prior red attempts and the pre-speech failed matrix remain.
A failed optimization excluding the bundle task produced a Gradle provider-order
error ([log](evidence/phase-08-speech-floor-build.log)); the normal build then
passed. No successful claim is derived from that failed attempt.

## 6. Concrete human checklist

Use the current [artifact ledger](evidence/phase-08-speech-floor-artifacts-final.json) and [full manual](../../qa/PHASE-08-MANUAL.md). Upgrade only a known compatible capstone installation/signing lineage using `install -r`; preserve existing data.

1. Open Profile/Calendar/Notes after upgrading to 0.8.0-data-qa/code 11. Verify existing data/preferences, record settings, deliberately enable delivery and create a uniquely named QA08 reminder two minutes ahead with lead 0.
2. In airplane mode with Wi-Fi/mobile data OFF, open the actual due notification and Answer. Expect text/manual controls, no automatic microphone, no ACK and task TODO.
3. Deliberately hold, say `acknowledge this reminder`, release, inspect the words, copy and review. Confirm only an exact ACK review. Expect one closed alert and task TODO after reopen. Repeat typed/manual ACK and actual notification ACK.
4. On a fresh reminder say `snooze for ten minutes`, copy/review/Confirm. Expect one replacement exactly ten minutes ahead and later redelivery. Separately test 5/15-minute responses and aliases: cancel/edit any wrong duration; these variants are not established by the two-clip emulator result.
5. Exercise denied mic, no speech/noise, cancellation/background, stale/expired review, changed source, reopening with an unsent Chat draft, large font/keyboard and TalkBack. Every failure must retain typing/manual controls and save no unconfirmed action.
6. Complete physical ARM64/low-memory/API30/31/newer-phone checks, live speech/accents/noise, audible offline TTS, interruptions, OEM/reboot/natural-Doze delivery, battery/performance measurements and required 30 alarms/10 live interactions per tested voice. Restore settings and remove owned fixtures through the app.

**NOT RUN:** every physical A01–A36/V01–V12 acceptance row. Phone audibility, human speech quality and the signed release gate remain pending.

## 7. Documentation and architecture

[ADR024](../decisions/ADR-024-reminder-speech-vocabulary.md), [flow contract](../phase-08-offline-loop.md), [execution checklist](../../qa/PHASE-08-EXECUTION.md), [requirements](../../qa/REQUIREMENTS-MATRIX.md), [current status](CURRENT-STATUS.md) and the [matrix](evidence/phase-08-emulator-expansion-matrix.json) distinguish this correction from prior cohorts. `graphify update .` ran AST-only: 2,911 nodes / 6,440 edges / 195 communities. Its [log](evidence/phase-08-speech-floor-graphify-final.log) retains partial Kotlin/Gradle parsing (three syntax warnings) and 19 symbol-less files; compiler, source and actual tests remain authoritative. No paid semantic extraction, keys or tooling upgrade was used.

## 8. Remaining limits and next steps

The recorded synthetic cases do not certify robust live speech. Beam search and the empirically chosen boundary profile require phone accuracy, memory and deadline testing. General/Chat behavior must retain its recorded regression results. Manual fallback and explicit confirmation remain mandatory. No accounts, backend, Gemini, handbook RAG, Kokoro or new model was introduced. Do not start Phase 09+.

## 9. Review decision

The phase is not passed. Physical checks and human sign-off in the [offline release gate](phase-08-offline-core-release-gate.md) remain incomplete. Final automated and restoration outcomes are recorded above; none substitute for that gate.

`STATUS: AWAITING DEVICE VALIDATION`  
`STOPPED — awaiting explicit human approval`
