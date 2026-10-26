# Phase06 — measured offline STT cohort

The current result is **six direct synthetic PCM decoder requests on an API37
x86_64 emulator**. It establishes successful local Whisper inference for those
fixtures with radios off. It does not establish real-microphone recognition,
Android on-device recognizer quality, Filipino accents, phone energy or low-RAM
acceptance. The pinned legacy STT baseline is **BASELINE NOT RUN**; no old/new
speed ratio is claimed.

## Conditions and identity

| Item | Recorded condition |
|---|---|
| Cohort | `emulator-initial-20261026`, started `2026-10-25T17:22:19.079026Z`, finished `2026-10-25T17:22:37.105588Z` |
| Device | `Medium_Phone`, `sdk_gphone16k_x86_64`, API37, x86_64 installed ABI,16KiB pages; emulator, not a physical phone |
| Build | `0.6.0-data-qa`, versionCode6, model-bearing, JS bundled; not a release-phone benchmark |
| Installed APK SHA256 | `84665ac178a315f539effeb32c632795acbd73a6493ff16bf693b3740741afbb` |
| Model | Tiny multilingual Q5_1,32,152,673 bytes, SHA256 `818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7` |
| Decoder | Reviewed Whisper.cpp v1.9.5 source; CPU-only, two decoder threads, per-request context load/free |
| Input | Six fixed Microsoft David Desktop/en-US synthetic WAVs,16kHz mono signed16; no microphone capture |
| Network | Airplane mode1, Wi-Fi0, mobile data0 verified after run; host microphone disabled |
| Cache | Private model copy absent before first request. Contexts load/free per request; OS/page caches may be warm. This is not a cold-OS cohort. |
| Memory sampling | Android process PSS sampled nominally every200ms during each request; not absolute peak or full UI/provider/system memory |

[Raw samples](phase-06-whisper-emulator-initial.json),
[derived scores](phase-06-whisper-scores-initial.json),
[frozen phrase corpus](phase-06-corpus.json),
[synthetic audio metadata](phase-06-synthetic-audio.json),
[source hashes](../reports/evidence/phase-06-source-hashes-initial.json) and
[APK inspection](../reports/evidence/phase-06-artifacts-initial.json) retain exact
conditions and identities. The corpus audio/model payloads remain ignored locally.

## Actual results

| Metric | Observed value | Interpretation |
|---|---|---|
| Requests / failures |6 /0 | All real decoder outcomes were RESULT; no clip was dropped from scoring. |
| Word-weighted WER |0 errors /36 reference words =0 | Levenshtein S/D/I after documented text normalization. |
| Normalized exact transcript rate |6/6 =1.0 | Transcript equality; no intent parser or scheduling action is evaluated. |
| Preparation/hash/copy/load/decode p50 |2,939ms | Median over all six request durations. |
| Preparation/hash/copy/load/decode p95 |3,206ms | Nearest-rank p95 for n6, equal to max; minimum2,875ms. |
| Sampled maximum process PSS |167,689KiB | Instrumentation-process observation only; not an absolute peak or phone RAM minimum. |

The timing starts from checked supplied PCM and includes model preparation,
verification/loading and decoding. It excludes UI holding, microphone recording
and release-to-result latency. One voice, six short clean English clips and a
single emulator are insufficient for language-quality or product-speed claims.

| APK (reviewed model included) | Exact bytes |
|---|---:|
| ARM64 release preview |60,706,193 |
| x86_64 release preview |61,293,850 |
| ARM64 dataQa |83,509,536 |
| x86_64 dataQa |83,292,001 |

The private verified model copy has32,152,673 logical payload bytes in addition
to the APK asset. Filesystem allocation and the full installed footprint were
not measured.
All main APKs have the reviewed model/source MIT notices; fixtures occur only in
the test APK. Every inspected new JNI ELF LOAD alignment is at least16,384 bytes.
No matched model-free APK delta or retained-memory/battery saving was measured.

## Reproduce without overwriting this cohort

Stage the exact reviewed model with `scripts/prepare-whisper-model.ps1` and use
a new output directory for audio reproduction. The generator refuses changed
fixture hashes; a different Windows voice/build needs a separately documented
cohort. See [manual setup](../../qa/PHASE-06-MANUAL.md) for model staging.

```powershell
& "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -NoProfile -File scripts/generate-stt-synthetic-corpus.ps1 -OutputDirectory .local/phase06-corpus-repro
$phaseRoot = (Get-Location).Path
$phaseModel = Join-Path $phaseRoot '.local/phase06-whisper-assets'
$phaseCorpus = Join-Path $phaseRoot '.local/phase06-corpus-repro'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
$env:NODE_OPTIONS = '--max-old-space-size=512'
.\android\gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDebug :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest "-PwhisperModelDir=$phaseModel" "-PsttCorpusDir=$phaseCorpus" '-PreactNativeArchitectures=arm64-v8a,x86_64' '-Dorg.gradle.jvmargs=-Xms64m -Xmx768m -XX:MaxMetaspaceSize=512m -XX:+UseSerialGC -Dfile.encoding=UTF-8' '-Pkotlin.compiler.execution.strategy=in-process' --max-workers=1 --no-daemon --console=plain
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/androidTest/dataQa/app-dataQa-androidTest.apk
adb -s TEST_DEVICE shell am instrument -w -e notClass com.lafina.capstone.voice.WhisperCorpusBenchmarkTest com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner
adb -s TEST_DEVICE shell am instrument -w -e class com.lafina.capstone.voice.WhisperCorpusBenchmarkTest -e runSttBenchmark true -e cohort NEW_COHORT com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner
adb -s TEST_DEVICE exec-out run-as com.lafina.capstone cat no_backup/phase06-stt-benchmark-NEW_COHORT.json
node scripts/evaluate-stt.cjs --input NEW_RAW_JSON --output NEW_SCORES_JSON
```

Use the matching ARM64 APK on a physical ARM64 phone. Save captured JSON as a new
UTF-8 evidence file and preserve source/APK hashes, radios, cache conditions and
all errors. Never overwrite the initial raw or scored JSON with later results.
The first completed native build took11m59s; these host build limits are not app
performance measurements. Functional instrumentation passed42 tests in4.207s;
the explicit benchmark passed one JUnit test in18.056s with six actual decoder
results. See [build log](../reports/evidence/phase-06-android-cmake-fix.log),
[functional log](../reports/evidence/phase-06-instrumentation-initial.log) and
[benchmark log](../reports/evidence/phase-06-whisper-benchmark-initial.log).

## Still NOT RUN

Android on-device recognizer offline accuracy; successful spoken full
capture-to-transcript and repeated release-to-result latency; physical microphone
and API30/ARM64/2–3GB devices; Filipino-accented English, Tagalog,
noise and false-speech quality; calibrated cold/warm speech startup; real calls,
audio interruption and secure lock; absolute peak/system memory; battery/thermal
effects; matched legacy/new measurements. Emulator UI checks are recorded
separately in the [phase report](../reports/phase-06-report.md).

## Separate emulator capture attempt and UI evidence

An explicit Android on-device engine hold in airplane mode returned
selected-language-unavailable guidance with an idle microphone. Its QA candidate
flag was true; that did not establish installed English support or provide a
recognition-accuracy sample. Permission denial gave a typing fallback; granting
permission required a fresh hold and did not itself capture (AppOps showed no
prior use). A destructive-looking manual draft left a synthetic task TODO;
only explicit task deletion removed the QA fixture, and navigation cleared the
draft. These are UI/error-handling checks, separate from decoder timing/WER.
See the [emulator ledger](../reports/evidence/phase-06-emulator-handoff.json),
[manual draft](../reports/evidence/phase-06-manual-draft.png),
[speech options](../reports/evidence/phase-06-speech-options.png) and
[language refusal](../reports/evidence/phase-06-android-language-unavailable.png).

A separate approximately4-second explicit Whisper hold with host microphone
disabled recovered through the no-speech fallback; manual typing remained usable.
Its single native diagnostic recorded3,955ms of capture and69ms transcribing for
that error path. These are not successful recognition measurements or a latency
distribution. A later explicit touch-down showed **Recording now** and Android
AppOps running; Home stopped running mic use and returning showed cancellation
without restarting. See [background cancellation](../reports/evidence/phase-06-chat-background-cancel.png).

A new15-second real AlarmManager QA alert opened the native answered view.
Answer ACKed before presenting the optional draft and did not start the mic.
Confirming a typed destructive-looking draft left the task TODO while reminder
and job were ACKNOWLEDGED. Only the new fixture was explicitly deleted; delivery
was restored OFF. See [answered screen](../reports/evidence/phase-06-native-answered.png)
and [confirmed draft](../reports/evidence/phase-06-native-draft-confirmed.png).
These observations validate emulator UI/ACK/manual-fallback behavior; they do
not establish physical spoken recognition, secure lock or real-call handling.

The later virtual-microphone Whisper attempt is **NOT VERIFIED**: synthetic
`injectAudio` concurrent with the visible hold ended in RPC_STREAM_ERROR,
ADB255 and emulator process exit. No transcript/capture success from this attempt is claimed, and
no evidence establishes that app code caused the host exit. The six earlier
direct-PCM successes remain an independent cohort; this attempt is not added to
its WER/timing sample count or hidden as a successful capture. A software-graphics
restart failed to load `opengl32sw`; the existing AVD was subsequently recovered
using host GLES with Vulkan disabled and launch-only no-report/no-metrics options, without
data wipe or uploaded reports. See the [attempt log](../reports/evidence/phase-06-virtual-mic-whisper.log)
and [host limitations](../reports/evidence/phase-06-host-emulator-limitations.json).
Final restoration is verified in [cleanup evidence](../reports/evidence/phase-06-emulator-cleanup.json):
original radios restored, microphone permission denied, host input disabled,
no running microphone, delivery OFF and native jobs0 pending/ringing/registered/failed.
The installed x86_64 APK hash and all249 source/7 APK hashes still match the
tested cohort. Physical-phone validation remains required.
