# PHASE06 — Offline hold-to-talk / Completion report

Build, test, direct-PCM, emulator UI and restoration rows below are executed
results. Physical-phone speech acceptance remains **HUMAN REQUIRED**; the
successful spoken capture-to-transcript path has not yet passed human review.

**Branch/base commit:** `codex/phase-06-offline-stt` / `b3eefb853be7c658a38186d330eb8aaf4be8eea2`  
**Date:**2026-10-26, Asia/Manila; timestamps of actual runs belong to their logs.  
**Build evidence UTC:** `2026-10-25T17:14:48.7393088Z`; benchmark UTC
`2026-10-25T17:22:19.079026Z`–`2026-10-25T17:22:37.105588Z`.  
**Device available:** `Medium_Phone`, API37 `sdk_gphone16k_x86_64` emulator,
x86_64 installed ABI,16KiB pages, kernel MemTotal4,008,368KiB; no physical phone.  
**Status:** `AWAITING DEVICE VALIDATION`; installed emulator build and cleanup verified.  
**Approval:** owner wrote **`APPROVE PHASE 06`**, reviewed Phase05, requested this
phase on the emulator and a manual checklist. Phase07 is not authorized. Earlier
physical-phone gates remain pending; approval is not a fabricated phone PASS.

Uncommitted Phase04/05 work remains preserved. The
[123-file Phase05 handoff manifest](evidence/phase-05-source-hashes-handoff.json)
defines the preceding source cohort; cumulative Git diff is not a Phase06-only
change list. The [249-file Phase06 cohort](evidence/phase-06-source-hashes-initial.json)
records9 changed and126 added files relative to that baseline, including95
reviewed vendor files. [Seven APKs](evidence/phase-06-artifacts-initial.json) have
exact hashes, sizes and manifest/model/license/JNI inspection. The installed
model-bearing x86_64 dataQa APK is SHA256
`84665ac178a315f539effeb32c632795acbd73a6493ff16bf693b3740741afbb`.
No commit, push, PR, legacy write or database reset was performed. The application
contains no model-download client.

## 1. Scope implemented

| Requirement | Observable behavior | Acceptance boundary |
|---|---|---|
| F-010 | Chat hold/release, contextual mic permission, local recognition candidates, cancellation and editable transcript/manual draft. Denial, idle-after-grant and manual draft safety observed on emulator. | Full capture-to-transcript path is not verified by the failed virtual-microphone attempt; real phone review remains required. |
| F-010, Android baseline | API31+ uses only the on-device recognizer factory; API33 checks installed local languages when supported. API30 requires the reviewed optional Whisper model or shows text-only unavailable state. | Candidate flags do not establish installed-language accuracy or offline success. |
| F-007/F-008 extension | Native Answer durably ACKs first and offers optional visible dictation; no microphone starts on Answer. Emulator manual draft left task TODO while reminder/job were ACKNOWLEDGED. | Confirming draft text never changes planner data. Physical secure-lock, spoken input and concurrent alert review remain pending. |
| F-015, phase-local | No generic/network recognizer, cloud STT, automatic model download or background microphone service. Existing manual planning is independent of speech. | Full offline-core acceptance remains a Phase08 gate; provider/phone behavior needs offline testing. |
| Performance/provenance | Reviewed CPU-only source/model, bounded inference, six real decoder results on synthetic PCM, WER evaluator and source/APK inspection. | Six clean synthetic English clips are not Filipino-accent/noise/physical-mic evidence. |

This phase does not implement F-009/F-013 scheduling commands, automatic ACK,
intent execution, online Gemini, handbook retrieval or a language model planner.
Schema remains2; no audio/transcript table or new preference schema is introduced.
Drafts are transient, with an explicit reviewed-copy action before confirmation.

## 2. Changes and architecture

| Module | Change/reason | Evidence |
|---|---|---|
| `speechToText.ts`, `useSpeechInputSession`, `SpeechInputPanel` | Strict bounded bridge, explicit hold, delayed-work fencing, readable failure and separate manual/recognized editors. |39 focused injected-adapter tests PASS; final phase gate below. |
| `App.tsx` | Chat integration stops/disposes TTS before capture; fixed help now describes draft-only speech. | AppDictation/AppSpeech9 tests PASS; no planner mutation from draft confirmation. |
| Native `SpeechInput`, policy, PCM capture and microphone lease | Main-thread lifecycle, one cross-process lease, API31 factory, bounded in-memory recording, worker decoding and cancellation. |62 JVM tests and42 emulator functional instrumentation tests PASS; real phone capture remains pending. |
| `AnsweredDictationPanel`, `ReminderActivity` | Optional local draft after durable Answer/ACK; permission completion requires a fresh hold; dismiss/snooze stay separate. | Real emulator alarm/Answer/manual draft and task-TODO versus reminder/job-ACK checks PASS; physical spoken/secure-lock checks pending. |
| Whisper JNI/CMake/reviewed source | CPU-only decoder, per-request context, two threads, cooperative cancellation, no persistent audio/model daemon. | Six actual decoder RESULTs; [provenance](../third-party/phase-06-provenance.md), [legacy review](../audits/phase-06-legacy-stt.md). |
| Gradle/manifest | VersionCode6/0.6.0; RECORD_AUDIO permission at use, recognition-service visibility; explicit optional main-model and androidTest-corpus flags. | Seven inspected APKs; main model/source MIT notices and16KiB-aligned new JNI ELF verified. |
| Synthetic corpus, generator, benchmark and `stt-metrics.cjs`/evaluator | Checked PCM, opt-in real decoder, word-weighted WER and exact transcript rate; no command execution. |5 metric tests, exact six-fixture reproduction and real inference/scoring PASS. |

[ADR-019](../decisions/ADR-019-offline-stt.md) records the decision and Mermaid
diagram. Capture is15 seconds/240,000 samples at16kHz mono, preparation8 seconds,
session transcription60 seconds, transcript2,000 UTF-16 characters and replay
history128 IDs. Native Whisper has a30-second cooperative deadline and128 output
tokens. These are bounds, not measured latency guarantees. The simple energy
threshold is not VAD or a proof against noise/hallucinations.

The optional Tiny multilingual Q5_1 payload is32,152,673 bytes, SHA256
`818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7`.
It is a reviewed upstream artifact, not a copied legacy binary. The exact source,
model and MIT notice pins are in [model metadata](../third-party/phase-06-model.json).
The binary stays ignored and requires `whisperModelDir`. All current inspected
main APKs include the exact reviewed asset; a separate default no-model build
was not installed/tested. The first worker use creates a verified private disk
copy; the decoder context is freed after each request.

## 3. Tests and actual results

| Check | Command/procedure | Actual result | Evidence |
|---|---|---|---|
| Verified full JS gate | `npm run preflight` | PASS,308 tests/24 suites in23.599s; strict TS/lint/format and38-module AST gates pass. Initial25.457s log retained separately. | [Verified log](evidence/phase-06-preflight-verified.log), [initial log](evidence/phase-06-preflight-first.log) |
| UI/typed bridge | `npx jest __tests__/SpeechInputPanel.test.tsx __tests__/speechToText.test.ts --runInBand` | PASS,39 tests/2 suites in6.608s. | [Focused log](evidence/phase-06-ui-bridge-fixed.log) |
| Metric harness | `npx jest __tests__/speechMetrics.test.js --runInBand` | PASS,5 tests; no STT accuracy claim. | [Metric log](evidence/phase-06-metrics-tests.log) |
| App integration | `npx jest __tests__/AppDictation.test.tsx __tests__/AppSpeech.test.tsx --runInBand` | PASS,9 tests/2 suites in8.31s. Earlier integration assertion failure retained. | [Reviewed log](evidence/phase-06-app-reviewed.log), [earlier failure](evidence/phase-06-app-integration.log) |
| UI strict review | Scoped ESLint/Prettier plus `npx tsc --noEmit` | PASS after correcting two fixture type annotations; initial type failures retained. | [React review](../audits/phase-06-react-review.md) |
| Native JVM policy tests | `:app:testDataQaUnitTest` | PASS,62 tests/6 suites,0 failures/errors/skips,0.129s XML total. Executed by initial task group; successful retry marked task UP-TO-DATE and reused unchanged XML. | [XML/hash manifest](evidence/phase-06-jvm-results-initial.json), [initial execution](evidence/phase-06-android-first.log) |
| First complete native task group | Assemble debug/dataQa/release and test APKs with reviewed assets | FAIL after3m24s,119 tasks (33 executed/86 up-to-date): `whisper.h` missing when React Native's root C++ source discovery selected the JNI wrapper as an application OnLoad source. | `evidence/phase-06-android-first.log`; passing JVM tests above do not turn this APK build into PASS |
| Native build correction/retry | Move wrapper into `cpp/jni/whisper_jni.cpp`, update CMake path and bound Ninja compile/link concurrency | PASS,11m59s,320 tasks (68 executed/252 up-to-date); no engine algorithm change. SDK XML/deprecation warnings retained. | [Successful build](evidence/phase-06-android-cmake-fix.log) |
| Synthetic audio reproduction | Windows PowerShell generator, new local output directory | PASS,6 exact byte/hash matches to frozen synthetic fixtures. No microphone used. | `evidence/phase-06-corpus-reproduction.log` |
| ARM64/x86_64 APKs and current manifest | Gradle assemble task group with model/corpus flags | PASS, debug/dataQa/release per ABI plus test APK. Main model SHA/notices, test-only fixtures and every new JNI ELF LOAD alignment≥16KiB verified. | [Artifact manifest](evidence/phase-06-artifacts-initial.json) |
| Android functional instrumentation | `adb -s emulator-5554 shell am instrument -w -e notClass com.lafina.capstone.voice.WhisperCorpusBenchmarkTest com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner` | PASS,42 tests,4.207s on offline API37 emulator. No human-mic success inferred. | [Instrumentation log](evidence/phase-06-instrumentation-initial.log) |
| Permission denial and grant | First visible hold, deny, retry/grant; inspect idle state and Android AppOps | PASS: denial gives readable typing fallback; grant requires a fresh hold, stays idle and shows no prior capture use in AppOps. | [Emulator ledger](evidence/phase-06-emulator-handoff.json), [speech options](evidence/phase-06-speech-options.png) |
| Manual draft and navigation | Save synthetic QA task; confirm a destructive-looking text draft; inspect task; explicitly delete only the QA fixture and leave/reopen Chat | PASS: confirmed draft did not delete/complete the task (still TODO); explicit cleanup succeeded and navigation cleared transient draft. | [Ledger](evidence/phase-06-emulator-handoff.json), [draft screenshot](evidence/phase-06-manual-draft.png) |
| Android on-device unsupported local language | Explicit Android engine hold in airplane mode | PASS for refusal/recovery: selected-language-unavailable guidance and idle microphone. Candidate flag was true but did not establish installed English support; accuracy NOT RUN. | [Ledger](evidence/phase-06-emulator-handoff.json), [language refusal](evidence/phase-06-android-language-unavailable.png) |
| Whisper silence and manual fallback | Explicit approximately4-second visible Whisper hold/release with host microphone disabled | PASS: no-speech fallback and manual typing remain available. One native diagnostic showed recording3,955ms/transcribing69ms; this error-path observation is not speech performance/accuracy evidence. | [Emulator ledger](evidence/phase-06-emulator-handoff.json) |
| Active capture cancelled by Home | Explicit foreground Whisper touch-down; inspect Recording now and Android AppOps; press Home and return | PASS: visible recording and AppOps running during hold; Home removed running mic use, and reopening showed hidden-screen cancellation without auto-resume. No spoken accuracy claim. | [Ledger](evidence/phase-06-emulator-handoff.json), [background cancellation](evidence/phase-06-chat-background-cancel.png) |
| Native answered reminder safety | New15-second synthetic real AlarmManager alert, opened via QA; Answer, type destructive-looking draft and Confirm; inspect task/reminder/job | PASS: Answer ACKed and displayed optional draft without running mic; confirmation kept task TODO, reminder/job ACKNOWLEDGED. Explicitly deleted only the new QA fixture and restored delivery OFF. | [Ledger](evidence/phase-06-emulator-handoff.json), [answered screen](evidence/phase-06-native-answered.png), [confirmed draft](evidence/phase-06-native-draft-confirmed.png) |
| Virtual-microphone capture attempt | Synthetic `injectAudio` concurrent with visible Whisper hold, host microphone disabled | NOT VERIFIED: emulator process exited, helper reported RPC_STREAM_ERROR and ADB swipe exited255; no capture/transcript PASS. No evidence establishes app causation. | [Attempt log](evidence/phase-06-virtual-mic-whisper.log), [host limitations](evidence/phase-06-host-emulator-limitations.json) |
| Final emulator restoration/integrity | App diagnostics UI, Android permission/AppOps, radio settings, installed APK and SHA256 checks | PASS: original airplane OFF/Wi-Fi ON/mobile ON restored; mic permission denied, host mic disabled, no running recording. Delivery OFF; native jobs 0 pending/0 ringing/0 registered/0 failed. Both new fixtures deleted; Chat open. All249 source files and7 APKs still match the tested cohort. | [Cleanup](evidence/phase-06-emulator-cleanup.json), [final integrity](evidence/phase-06-final-integrity.json), [handoff screen](evidence/phase-06-chat-handoff.png) |
| Direct synthetic PCM inference/WER | Opt-in `WhisperCorpusBenchmarkTest`, then `node scripts/evaluate-stt.cjs --input docs/benchmarks/phase-06-whisper-emulator-initial.json --output docs/benchmarks/phase-06-whisper-scores-initial.json` | PASS, one benchmark test18.056s; six real RESULTs,0 failed requests,0/36 word errors,6/6 normalized exact matches. | [Benchmark log](evidence/phase-06-whisper-benchmark-initial.log), [raw](../benchmarks/phase-06-whisper-emulator-initial.json), [scores](../benchmarks/phase-06-whisper-scores-initial.json) |
| Real phone mic, accents, interruption/low-RAM/battery | [Manual guide](../../qa/PHASE-06-MANUAL.md) | NOT RUN / HUMAN REQUIRED | No physical phone results supplied |

Completed build recipe (absolute model/corpus directories resolved from this repo):

```powershell
$phaseRoot = (Get-Location).Path
$phaseModel = Join-Path $phaseRoot '.local/phase06-whisper-assets'
$phaseCorpus = Join-Path $phaseRoot '.local/phase06-corpus'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
$env:NODE_OPTIONS = '--max-old-space-size=512'
.\android\gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDebug :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest "-PwhisperModelDir=$phaseModel" "-PsttCorpusDir=$phaseCorpus" '-PreactNativeArchitectures=arm64-v8a,x86_64' '-Dorg.gradle.jvmargs=-Xms64m -Xmx768m -XX:MaxMetaspaceSize=512m -XX:+UseSerialGC -Dfile.encoding=UTF-8' '-Pkotlin.compiler.execution.strategy=in-process' --max-workers=1 --no-daemon --console=plain
```

Failures and successful retry remain separate evidence. Generated model/audio
preparation is distinct from actual Android execution. See the
[benchmark protocol](../benchmarks/phase-06-stt.md) and manual guide for exact
install, permission, opt-in benchmark and score commands.
The constrained-host retry uses768MB JVM heap,512MB metaspace, SerialGC, one
Gradle worker and a512MB Node heap; exact environment/command belongs in the
completed build record. These host bounds are not app memory measurements.

## 4. Performance matrix

| Metric/cohort | Actual result | Limit |
|---|---|---|
| Pinned legacy Whisper STT baseline | BASELINE NOT RUN | No independently prepared matched legacy APK/device cohort. |
| Android on-device recognition, airplane mode | Local-language refusal observed; recognition accuracy NOT RUN | Candidate available did not imply installed English support. Explicit hold returned guidance with idle mic, not a transcript. |
| Current Whisper synthetic PCM preparation/hash/load/decode |6 requests,0 failures; p50=2,939ms, nearest-rank p95=max=3,206ms, min=2,875ms; WER0/36 and6/6 normalized exact matches | Supplied synthetic PCM; no microphone/post-release timing, intent accuracy or human-accent evidence. |
| Successful spoken hold release-to-transcript latency | NOT RUN | A single silent/error-path diagnostic (recording3,955ms, transcription69ms) is not a successful speech latency benchmark or p50/p95 cohort. |
| Model-bearing APK bytes | ARM64 release60,706,193; x86_64 release61,293,850; ARM64 dataQa83,509,536; x86_64 dataQa83,292,001 | No matched model-free APK delta; private verified model copy has32,152,673 logical payload bytes. Filesystem allocation/full installed footprint was not measured. |
| Sampled maximum process PSS |167,689KiB during direct PCM benchmark, nominal200ms samples | Instrumentation-process observation, not absolute peak, full UI/vendor/system memory or phone minimum RAM. |
| Physical peak memory, energy/battery and thermal | NOT RUN / HUMAN REQUIRED | Build heap flags and model payload size are not app memory/energy measurements. |
| Filipino-accented English, Tagalog/noise quality | NOT RUN / HUMAN REQUIRED | Windows SAPI English fixtures are not representative. |
| Matched old/new performance | NOT RUN | No speedup or minimum-RAM/phone acceptance claim. |

[Raw samples](../benchmarks/phase-06-whisper-emulator-initial.json),
[scores](../benchmarks/phase-06-whisper-scores-initial.json) and the
[measurement protocol](../benchmarks/phase-06-stt.md) contain full conditions.
The private model copy was absent before the first request; OS/page caches may
be warm, so no cold-OS timing is claimed. Every request frees its decoder, but
allocator/page caches may remain. No measured benefit justifies keeping Tiny
resident. Android on-device offline accuracy remains separate from Whisper.

The later virtual-microphone attempt did not produce a verified transcript and
is excluded from the direct-PCM cohort: it is a failed separate test, not a seventh
decoder success or a reason to erase the six recorded results. Host software
graphics restart then failed loading `opengl32sw` and displayed crash-report
consent. The existing AVD was recovered using host GLES with Vulkan disabled and launch-only
`crash-report-mode never`, `no-metrics` and `no-display-layout`; no report was
uploaded, app data wiped or emulator replaced. [Host limitations](evidence/phase-06-host-emulator-limitations.json)
separate host startup from app assertions and leave final state to cleanup evidence.

Final restoration at `2026-10-26T00:48:33Z` is recorded in the cleanup JSON.
An initial shell `run-as ... content call` diagnostics probe was denied by
Android's external-provider permission policy. The app's own visible diagnostics
were used instead; no provider export, permission or security policy was weakened.
Host microphone input remains disabled deliberately. Human emulator speech tests
require the owner to enable its host input, or use a physical phone, as described
in the manual guide. No further automatic capture is queued.

## 5. Reliability, privacy, permissions and licenses

No capture on entry, permission grant, Answer or background return. Release,
Cancel, hiding/replacement and terminal callbacks stop/invalidate the session;
cooperative model cleanup may keep a lease briefly busy. Manual draft and planner
controls remain independent of the engine. PCM is memory-only/best-effort cleared;
transcripts are displayed for local review, not logged or stored in planner data.
There is no online recognizer, automatic retry recording or background mic service.

RECORD_AUDIO is the new runtime permission. Actual bundled dataQa/release APKs
retain the existing notification/exact-alarm/full-screen/boot/vibration
permissions plus mic, without INTERNET, telephony, overlay or
foreground-microphone-service permission. Debug adds development INTERNET/overlay
permissions and is reported separately in the artifact manifest; do not use its
manifest as offline release evidence.
Source/model notices and optional-model packaging are described in provenance.
A separately installed Android provider has its own behavior; test in airplane
mode instead of equating app permission absence with audited vendor traffic.

Tiny can return wrong/noisy/hallucinated text. English and `fil-PH`/Whisper`tl`
configuration is not language-quality acceptance. Review/copy/confirm never
executes a command. No phone/low-RAM/OEM, secure-lock or battery guarantee is made.

## 6. Manual checks for the owner

Use the [full guide](../../qa/PHASE-06-MANUAL.md), preserving data and noting original
settings. Install the report's current ARM64 dataQa hash on a matching phone, or
open the installed emulator app in Chat. Enable emulator host microphone input
yourself for spoken tests; it was left disabled. Android's selected language was
unavailable in this cohort, so choose **Whisper local model** for the initial
spoken test. The Android option needs separate installed-language validation.

1. In airplane mode, open Chat; confirm no mic starts on entry. Type/confirm a
   draft and verify Calendar did not change.
2. Deny then grant mic on a hold. Grant alone must stay idle; a fresh hold records.
   Release to transcribe, edit recognized words, explicitly copy and confirm.
3. Try both available engines/languages, silence, rapid release/Cancel and
   revoked permission. Typed draft/planner must remain usable; no online retry.
4. Home/lock, competing audio and a consenting call must stop capture without
   auto-resume. Repeat real accents/noise, TalkBack and modest-RAM/API30 hardware.
5. Answer a synthetic alert: ACK stays separate from task completion. No mic
   starts until holding in the answered draft; confirmed words do not change data.
6. Restore radios/permission/output/delivery and delete only new synthetic items.

The agent cannot pass human speech quality, physical interruption or battery
checks through mocks, direct PCM inference or emulator UI screenshots.

## 7. Documentation

[ADR-019](../decisions/ADR-019-offline-stt.md),
[provenance](../third-party/phase-06-provenance.md),
[legacy review](../audits/phase-06-legacy-stt.md),
[React review](../audits/phase-06-react-review.md),
[README](../../README.md), [architecture](../02-ARCHITECTURE.md),
[decision register](../04-DECISION-LOG.md),
[requirements](../../qa/REQUIREMENTS-MATRIX.md),
[risks](../../qa/RISK-REGISTER.md),
[execution checklist](phase-06-checklist.md) and the manual guide are updated.
The verified preflight AST cycle/offline checks passed38 TS modules.
`Get-Command graphify` found no CLI; [fresh Graphify check](evidence/phase-06-graphify.json)
records **NOT RUN**, with the actual TypeScript AST checker and ADR019 Mermaid
as substitutes. This is not a complete C++/Kotlin dependency graph or mic proof.

## 8. Remaining work and review

Emulator restoration and source/APK integrity are complete. The unmet acceptance
gate is successful spoken capture-to-transcript review on a physical phone,
including accents/noise, API30/ARM64/low-RAM behavior, call/secure-lock restrictions,
energy and matched legacy measurements. The virtual-input attempt remains
NOT VERIFIED. Human review must record those results or explicitly acknowledge
the remaining limitations; the automated checks do not close them. Do not start
Phase07.

- [x] Available JS gates, current APK assembly, JVM and functional instrumentation pass.
- [ ] Physical device tests completed and human-confirmed.
- [x] Phase07/cloud/automatic transcript actions remain outside this work.
- [x] Final source/artifact integrity, links, evidence and cleanup verified.

**STATUS: AWAITING DEVICE VALIDATION**

**STOPPED — awaiting explicit human approval for Phase 07.**
