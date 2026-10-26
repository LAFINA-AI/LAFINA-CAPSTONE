# Phase06 — hold-to-talk and offline recognition manual checks

**Acceptance boundary:** a typed bridge test, an engine candidate flag and direct
synthetic PCM inference are different from a real microphone test. Physical
Android11+, accents/noise, interruption, low-RAM, peak memory and battery remain
**NOT RUN / HUMAN REQUIRED** until a reviewer records them. Actual completed
automation/emulator rows belong to [the phase report](../docs/reports/phase-06-report.md).
No phrase in Phase06 executes a task/event/reminder command.

## Install and record the test conditions

Use0.6.0-data-qa/versionCode6 and the **model-bearing** APK/hash recorded in the
report. x86_64 is for the matching emulator; ARM64 is for a matching physical
phone. Upgrade with `-r`; do not uninstall, clear app data or replace the database.

The agent leaves host microphone input disabled on the emulator. To test your
own speech there, deliberately enable **Extended controls → Microphone → Enable
host microphone input** (wording varies), then grant the app permission on its
first hold. Otherwise use a physical phone. Emulator recording of silence and
direct synthetic PCM decoding have been tested separately; the attempted virtual
audio injection disconnected the host emulator and did not produce a verified
spoken transcript. See the report for the distinct results.

```powershell
adb devices -l
Get-FileHash android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk -Algorithm SHA256
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

Replace TEST_DEVICE locally. Record date/reviewer, general model/API/RAM/ABI,
APK hash/build type/model flag, recognizer/voice versions, selected engine and
language, network state, audio route, charging/thermal state and room/noise.
Do not publish unique serials, personal schedules, private transcripts or audio.
Note original radios, microphone permission, output mode and reminder delivery
before changing them. Keep existing planner fixtures/data.

The source can build with or without the optional model. For a reviewed local
build, stage the exact verified artifact using the versioned preparation script,
then pass an absolute directory explicitly:

```powershell
.\scripts\prepare-whisper-model.ps1 -ModelPath '<reviewed-local-ggml-tiny-q5_1.bin>'
$phaseRoot = (Get-Location).Path
$phaseModel = Join-Path $phaseRoot '.local/phase06-whisper-assets'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
.\android\gradlew.bat -p android :app:assembleDataQa "-PwhisperModelDir=$phaseModel" '-PreactNativeArchitectures=arm64-v8a,x86_64' --max-workers=1 --no-daemon --console=plain
```

Use the exact completed command/flags and hashes from the report when reproducing
its cohort. Without the model flag, do not expect Whisper. Android11/API30 has no
API31 on-device factory and must show unavailable if the model is absent.
Separate deliberate Android language setup may need Internet; turn airplane mode
on and explicitly turn Wi-Fi/mobile data off **after** setup for offline checks.
The application must never download speech/model data automatically.

## Chat: permission, holding and review

1. Open **Chat → Offline speech draft**. No permission dialog or microphone
   indicator should appear merely on entry. Type “Read chapter one” in **Draft
   text**, confirm it, then inspect Calendar. No task/event/reminder was created.
   The draft is transient; leaving Chat clears it, not planner records.
2. Choose **English** and **Automatic**. Hold **Hold to talk**. If a permission
   dialog appears, deny it first. Expect a readable refusal and the typed draft
   still usable. Try again and grant only when ready. **Grant alone must not
   record**; release and start a fresh hold.
3. Hold until **Recording now** is visible, say a synthetic phrase, then release.
   Expect **Transcribing** followed by recognized text or a clear error. The
   microphone must stop on release. Keep speaking brief; capture is limited to
   15 seconds. An Android recognizer may end early; it must not restart while
   your finger is still held. Do not infer capture from the press label alone.
4. Edit **Recognized speech (review before use)**. Check that a separately typed
   manual draft was not replaced automatically. Tap **Replace draft with
   recognized speech**, review it, and then **Confirm draft text**. Confirmation
   must explicitly say no schedule changed. Say a destructive command such as
   “cancel my library reminder”; it still must only produce reviewable words.
5. Release immediately while permission/TTS cleanup/engine preparation is still
   pending. Expect cancellation, no later microphone start and no stale text.
   Press **Cancel speech input** during capture and transcription. A new hold
   may briefly report busy while a cancelled decoder releases its lease; it must
   not silently queue or restart another recording.
6. Try silence, a very quiet phrase and noise without speech. Record all empty,
   wrong and hallucinated results. The simple energy guard is not VAD. Text
   confirmation and manual planner controls must remain available on every error.

## Engine/language matrix and failure recovery

Repeat the phrase set in airplane mode with Wi-Fi/mobile data off for each
available engine, with both **English** and **Filipino** where applicable.
An unavailable language/recognizer should give guidance or permit another engine
on the next explicit hold; it must not switch to online STT or re-record silently.
On API31+ test Android on-device explicitly; on API30 test the model-bearing
Whisper build and a separate no-model build. Record refusals rather than passing
an unsupported row. Candidate availability and supported language labels are
not transcript accuracy measurements.

While on the draft screen, revoke microphone access in Android App Settings,
return and hold. Expect denial/recovery and an intact manual draft, no crash or
unhandled engine message. **Open Android speech settings** currently opens this
app's Android details page for permissions; system recognition/language setup
paths vary by device. Do not uninstall/disable the owner's speech service or
delete downloaded voices merely to simulate absence.

During capture and transcription, press Home, lock/unlock and return; speech
must stop and not resume itself. Try quick repeated holds, a competing recorder
and a real consenting incoming call/audio interruption. One foreground owner
must hold the microphone; another request must report busy or stop safely.
Returning from the OS permission/settings UI must require a fresh hold. Repeat
with large font and TalkBack, recording any gesture/visibility limitation; manual
text remains the fallback. Do not infer real telephony/OEM behavior from emulator
calls or mocked focus events.

## Visible answered reminder

1. Deliberately enable reminder delivery and required notification/exact access.
   Create a synthetic timed reminder2–3 minutes ahead, lead0, outside quiet hours.
2. Open the due alert. **Answer (acknowledge)** must durably ACK the alert and
   leave the task TODO, then show the optional answered draft. Answer itself
   must not request permission or start a microphone. **Acknowledge / Dismiss**
   remains the close action; Snooze is a separate scheduling action.
3. Type and confirm a local draft, then explicitly hold **Hold to talk in answered
   reminder**. On first use, permission completion requires a fresh hold. The
   native panel currently uses English/Automatic; use Chat for engine/language
   choices. Review recognized text and copy explicitly. Nothing said or confirmed
   here changes a task, snooze time or reminder state.
4. Cancel, Home/return, close, or let a new reminder replace the screen. Capture
   must stop, stale callbacks must not populate the newer screen, and the task
   stays incomplete. Check the final ACK status independently in the planner.
   Complete the task only through the explicit task action if testing completion.
5. Repeat under secure lock, denied mic and concurrent reminders on physical
   hardware. OS restrictions may refuse microphone access; text/ACK/Snooze must
   remain usable. No foreground-service or background-microphone workaround exists.

## Measurements and reproducible automation

Use public/synthetic/consented phrases; never collect classmates' voices without
consent. The fixed six-phrase [corpus](../docs/benchmarks/phase-06-corpus.json) and
[generated audio metadata](../docs/benchmarks/phase-06-synthetic-audio.json) concern
an installed Windows SAPI English voice, not Filipino accents or a physical mic.
Corpus WAVs stay ignored locally; `sttCorpusDir` includes them only in androidTest.

```powershell
& "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -NoProfile -File scripts/generate-stt-synthetic-corpus.ps1 -OutputDirectory .local/phase06-corpus-repro
$phaseCorpus = Join-Path (Get-Location) '.local/phase06-corpus-repro'
.\android\gradlew.bat -p android :app:assembleDataQaAndroidTest "-PwhisperModelDir=$phaseModel" "-PsttCorpusDir=$phaseCorpus" '-PreactNativeArchitectures=arm64-v8a,x86_64' --max-workers=1 --no-daemon --console=plain
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/androidTest/dataQa/app-dataQa-androidTest.apk
adb -s TEST_DEVICE shell am instrument -w com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner
adb -s TEST_DEVICE shell am instrument -w -e class com.lafina.capstone.voice.WhisperCorpusBenchmarkTest -e runSttBenchmark true -e cohort OWNER_COHORT com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner
adb -s TEST_DEVICE exec-out run-as com.lafina.capstone cat no_backup/phase06-stt-benchmark-OWNER_COHORT.json
```

The generator requires a new output directory and verifies exact bytes/hashes
against the frozen synthetic corpus. A different installed Windows voice/build
may fail that check; it requires a separately documented new cohort, not an
overwrite of historical fixtures. The [generator](../scripts/generate-stt-synthetic-corpus.ps1)
and [evaluator](../scripts/evaluate-stt.cjs) are versioned; use the evaluator's
usage for checked raw JSON and a new output path.

Choose a new cohort name; do not overwrite old evidence. This opt-in test calls
the real decoder with checked synthetic PCM and opens no microphone. Report
its load/hash/decode duration separately from a real hold's release-to-result
interval. New contexts may still benefit from warm filesystem/page caches; app
force-stop alone is not a cold vendor-service control. Record raw hypotheses,
failures, sample count, p50/p95 and word-weighted WER using the versioned metrics
harness. Normalized exact text match is not semantic command/action accuracy.

For real phone tests, freeze the same phrases, hardware, engine/model, language,
route and noise conditions for old/new runs. Measure recording/prepare/release/
result with a common clock; do not subtract unrelated host/device clocks. A
sampled maximum PSS is not absolute peak and does not establish whole-system or
battery use. Physical low-RAM, energy, Filipino-accent/noise and matched legacy
measurements remain NOT RUN until actually recorded. Do not fabricate a baseline.

## Restore and record

Restore original radios, microphone permission, output mode, reminder delivery
and any changed settings. Delete only newly created synthetic items/alerts;
check no pending/ringing test jobs remain. Leave the app usable, with no active
microphone or queued inference. Record actual results separately below.

| Row | Device/build/engine/language/conditions | Result/evidence |
|---|---|---|
| Chat hold/release/cancel | Reviewer fills | NOT RUN / HUMAN REQUIRED |
| Denied/revoked permission, rapid/late callbacks | Reviewer fills | NOT RUN / HUMAN REQUIRED |
| Native answered reminder and ACK remains TODO | Reviewer fills | NOT RUN / HUMAN REQUIRED |
| Android on-device versus Whisper offline | Reviewer fills | NOT RUN / HUMAN REQUIRED |
| Accents/noise/secure lock/call/audio/TalkBack | Reviewer fills | NOT RUN / HUMAN REQUIRED |
| Low-RAM/peak/battery/old-new comparison | Reviewer fills | NOT RUN / HUMAN REQUIRED |
