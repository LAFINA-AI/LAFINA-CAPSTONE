# Phase 08 emulator voice probes

This is an execution protocol, not a record of successful playback or recognition. The phase report and evidence files record actual runs. Keep physical ARM64, real speech, audibility, OEM behavior, battery, and device performance pending.

## Real Android system TTS

`com.lafina.capstone.voice.Phase08VoiceProbeTest#probeForegroundOfflineSpeech` is opt-in. Install the matching application and test APKs without clearing app data, unlock the emulator, and run only one device/UI test at a time. Use the installed test package/runner reported by `adb shell pm list instrumentation`:

```powershell
adb -s <serial> shell am instrument -w -r -e class com.lafina.capstone.voice.Phase08VoiceProbeTest -e runPhase08VoiceProbe true -e voiceProbeMode inventory <test-package>/androidx.test.runner.AndroidJUnitRunner
```

Repeat with `voiceProbeMode` set to `speak`, `stop`, or `cancel_init`. Optional `voiceProbeLocale`, `voiceProbeEngine`, and `voiceProbeName` select already installed inventory; these arguments never install voices. No microphone is opened. Speech uses only fixed synthetic QA08 text.

The probe opens the real `MainActivity`, checks AndroidX lifecycle `RESUMED` on the main thread and the active accessibility window's package on the instrumentation thread, and supplies those observations to the real `SystemSpeech` visibility guard. It polls visibility during asynchronous initialization/playback and stops if visibility is lost. Engine operations run on the Android main thread. It does not inject a constant `visible = { true }`, modify preferences, or send commands.

Read the `INSTRUMENTATION_STATUS: phase08_voice_probe=<JSON>` payload. A green JUnit result alone does **not** establish voice support:

| JSON status | Meaning |
| --- | --- |
| `OFFLINE_VOICE_AVAILABLE` | Installed voice inventory selected an installed offline voice. Playback not attempted. |
| `UTTERANCE_CALLBACKS_VERIFIED` | Real engine accepted the utterance and emitted `requested`, `start`, and `done` while the foreground checks remained satisfied. |
| `REQUEST_CANCELLED` | Stop cancelled an accepted request; this does not prove audible mid-sentence interruption. |
| `INITIALIZATION_CANCELLED` | Explicit stop cancelled pending initialization. |
| `UNAVAILABLE` | Missing engine/voice, failed initialization/focus/playback, or another explicit unsupported condition. Keep text and manual controls available. |
| `ERROR` | Harness/invariant failure or bounded timeout; inspect the recorded stage and test failure. |

JSON records engine inventory, voice offline/installed flags, selected voice, initialization time, request/start/terminal event times and total probe time. `enginePackage` is the reported/requested default package; Android's public constructor can fall back, so this is not verified binder identity. No arbitrary exception text, personal schedule text, audio, or transcript is emitted.

The current emulator launch uses `-no-audio`. Android's command-line documentation describes this as disabling audio support; AOSP's implementation more precisely says it forces the `none` backend to disable sound output while retaining audio emulation. Thus `-audio none` is not an independent way to prove virtual microphone support. Test the current configuration before considering a restart. Even `UTTERANCE_CALLBACKS_VERIFIED` proves callback behavior only. `physicalAudibilityVerified` remains false. See [Android Emulator command-line options](https://developer.android.com/studio/run/emulator-commandline) and [AOSP audio option normalization](https://android.googlesource.com/platform/external/qemu/+/refs/heads/emu-master-dev/android/android-emu/android/main-common.c).

## Existing synthetic Whisper corpus

The existing class is `com.lafina.capstone.voice.WhisperCorpusBenchmarkTest`, method `measurePinnedSyntheticCorpusWithoutOpeningMicrophone`. Run against the model-included matching APK/test APK using a fresh cohort (the test refuses to overwrite an existing result):

```powershell
adb -s <serial> shell am instrument -w -r -e class com.lafina.capstone.voice.WhisperCorpusBenchmarkTest -e runSttBenchmark true -e cohort QA08_FRESH_ID <test-package>/androidx.test.runner.AndroidJUnitRunner
```

`cohort` must match `[A-Za-z0-9_-]{1,40}`. The result is in the target application's `noBackupFilesDir/phase06-stt-benchmark-<cohort>.json`; retrieve it with a bounded `run-as` read into a new host evidence file. Do not overwrite Phase 06 baseline results.

The benchmark verifies the manifest and six synthetic Windows SAPI fixtures' hashes, parses 16 kHz mono PCM16, and calls the real local Whisper decoder directly. It never opens `AudioRecord`, enables the host microphone, executes interpreted commands, or accesses a network voice. Results contain every reference/hypothesis/outcome, prepare/load/decode time, model checksum/size, API/model/ABIs, cache state, and sampled PSS. The test's assertions require six rows and a successful first decode; reviewers must inspect all six outcomes and word accuracy before drawing conclusions. The corpus covers assignment, biology, today, calculus, cancel, and complete; it does not establish reminder ACK/snooze recognition. It does not exercise the app's visible microphone button or capture path. PSS is sampled every 200 ms and is not a guaranteed absolute peak. Emulator timings are not phone benchmarks.

## Virtual microphone injection investigation

Read-only inspection of the installed SDK's `emulator/lib/emulator_controller.proto` establishes these separate APIs:

- `injectAudio(stream AudioPacket)` supplies PCM to the Android virtual microphone. The first packet defines the format. `AUD_FMT_S16` is little-endian PCM16, `Mono` is channel value 0, and an explicit `samplingRate=16000` avoids the default 44100 Hz. Default delivery mode blocks as the emulator requests packets; the experimental real-time mode can overwrite queued data. The documented buffer is approximately 300 ms.
- `getMicrophoneState` reports `MicrophoneState.realAudioEnabled`, which the proto defines as **host microphone access**. `setMicrophoneState` is a separate operation and must never be used to enable real host input for this protocol.
- Injection may fail with `FAILED_PRECONDITION` (code 9) if another microphone stream exists or the virtual microphone cannot be registered. `INVALID_ARGUMENT` (code 3) includes unsupported sampling rates or oversized packets.

The historical `docs/reports/evidence/phase-07-hardening-host-mic-final.json` records `realAudioEnabled=false`; it is not a fresh runtime observation. The initial investigation did not invoke a gRPC method, open a microphone, inject audio, or alter emulator configuration. The proto establishes interface availability, not working injection under `-no-audio`.

If an authorized test exercises the visible push-to-talk capture path, obtain a fresh loopback `getMicrophoneState=false` before and after, use only the already verified public synthetic PCM fixtures, activate recording solely by the visible app microphone control, and stream only fixture PCM via `injectAudio`. Stop/cancel through the visible UI and preserve manual fallback checks. Do not capture or read host microphone audio. Record actual gRPC status and decoded result. If the current configuration prevents registration, record the check as **NOT RUN/UNSUPPORTED IN CURRENT CONFIGURATION**. A controlled, data-preserving emulator restart is a separate possible prerequisite, not evidence already collected. Keep `Enable Host Microphone Access` disabled and never launch with `-allow-host-audio`; [Android's microphone controls](https://developer.android.com/studio/run/emulator-extended-controls) document that toggle as the host-input gate.

## Dependency-free loopback client

`scripts/phase08-emulator-audio.mjs` uses Node's built-in HTTP/2 and a small bounded protobuf codec for the verified installed SDK fields. It needs no Python runtime, grpc/protobuf package, new dependency, model, key generation, or file containing a token. The default Python interpreter lacks `grpcio`/protobuf, so it is not used.

Status is read-only and requires an explicit emulator serial:

```powershell
node scripts/phase08-emulator-audio.mjs --serial emulator-5554
```

The client reads exactly one current `%LOCALAPPDATA%/Temp/avd/running/pid_*.ini` discovery file, matches its serial, reads `grpc.token` only in memory, and connects only to `127.0.0.1`. If several emulators are discovered, provide `--discovery <current-pid-file>`. It emits fixed redacted codes and booleans; no credentials, discovery contents, UI text, transcript, or raw server error message is printed. `HOST_MICROPHONE_DISABLED` requires two actual `getMicrophoneState=false` replies. Missing authentication/h2c support or bounded RPC failures produce `BLOCKED`, never a fabricated successful status. There is no unprotected-server or host-input enabling fallback.

Injection additionally requires `--inject`, an explicit WAV directly under `.local/phase06-corpus/`, and a fresh ignored proof file created by the device-test operator after activating recording through the visible microphone control. The client pins the six reviewed fixture SHA256/byte counts as well as checking the synthetic manifest, mono 16 kHz PCM16 format, and duration no longer than 15 seconds. It cannot inject arbitrary WAV files. Example proof schema:

```json
{
  "kind": "PHASE08_VISIBLE_RECORDING",
  "package": "com.lafina.capstone",
  "serial": "emulator-5554",
  "recordingVisible": true,
  "manualInteraction": true,
  "observedAtUtc": "<fresh UTC ISO timestamp>"
}
```

`--visible-proof` must resolve to a JSON file under this checkout's ignored `.local/`. Its observation must be no older than 10 seconds; proof freshness is checked again immediately before injection. It is an operator's contemporaneous UI observation, not an independent accessibility measurement. Do not create proof until recording is visibly active. Then run:

```powershell
node scripts/phase08-emulator-audio.mjs --serial emulator-5554 --inject --wav .local/phase06-corpus/today.wav --visible-proof .local/phase08-visible-recording.json
```

The script streams only the validated fixture in 20 ms PCM chunks using the
SDK's existing blocking delivery for pacing, applies a duration-based RPC
deadline, and reads host microphone state again even when injection fails. It
never calls `setMicrophoneState`, reads host audio, saves recordings, changes app
settings, or activates app recording. `SYNTHETIC_STREAM_COMPLETED` means gRPC
accepted and completed the PCM stream. It does not prove that the app captured
it or recognized words; inspect the visible app result separately.
`recognitionVerified` and `audibilityVerified` remain false. The six fixture
utterances do not establish ACK/snooze accuracy.

### Optional format-only input initialization

`--initialize-input` is optional and requires the same explicit injection,
verified fixture and independently observed visible Recording proof. After
confirming fresh host-input OFF, it sends a **separate format-only
`AudioPacket`, with zero source PCM bytes**, using a two-second RPC deadline.
The initializer must finish with gRPC status 0. The client then checks host input
OFF and proof freshness again before sending the same pinned PCM **once**
through the existing blocking stream. Keep host input OFF after the source
stream as well. A successful initializer alone is not a capture result.

This step does not start/restart the app microphone or retry actual source
PCM. It changes neither the app's capture/response deadline nor its model,
parser, gain or padding. Keep each case's already declared gain and padding;
initialization is a separate transport operation. Missing visible Recording,
stale proof, host input enabled, failed initialization or failed source capture
must remain a failure or blocked result, with manual fallback available.

Four actual-capture ACK cases passed across two cold boots on the original SDK
emulator **37.1.11**:
[first pair](../reports/evidence/phase-08-input-loss-initialized-capture-pair.json)
and [second pair](../reports/evidence/phase-08-input-loss-initialized-capture-pair-2b.json).
The [initial pair's two failures](../reports/evidence/phase-08-input-loss-cold-pair-1.json)
remain preserved. The underlying SDK cause is unproven. The isolated SDK
**37.2.13** experiment had a cold failure and warm pass and was rejected; it is
not the selected runtime or an established fix.

The temporary capture exporter and its hook were removed from source. The
clean DataQa emulator APK, installed in place with schema 3, has SHA-256
`7300f2aefeb8d5f90882655d46435b100a12531e16a7c70df4f81230f4160454`,
the same checksum as the previous clean candidate. This identifies the
emulator artifact, not a physical-phone ABI build or a release acceptance.
Initialization remains an experimental, unreliable workaround. A later A03
actual-capture case failed recognition despite successful initialization,
host-input OFF and a captured signal. Four focused passes do not establish a
reliability fix. The completed campaign has44PASS/3FAIL/1NOT RUN;
A03/V03/V04 remain failed and V05 owner-deferred.
V05 remains owner-deferred until reviewed public/consented local-accent audio is
available. All physical-device, human speech and audibility gates remain pending.

## Distinct Phase 08 synthetic response fixtures

[Response audio metadata](phase-08-synthetic-response-audio.json) records two newly generated, ignored WAVs in `.local/phase08-corpus/`: `acknowledge.wav` says exactly `acknowledge this reminder`; `snooze.wav` says exactly `snooze for ten minutes`. Both use mono 16 kHz PCM16. Generation used the actually available installed **Microsoft Zira Desktop (en-US)** through Windows `System.Speech.Synthesis.SpeechSynthesizer` in PowerShell 7.6.5; the runtime did not enumerate David. The operator explicitly authorized Zira for this distinct cohort. The six historical David clips and their pins remain unchanged.

Generation wrote directly to new WAV files, refused existing outputs, and used no microphone, human recording, cloud, new voice/model/dependency, or speaker playback. WAVs and the private manifest remain ignored; public metadata contains only fixed synthetic text, actual voice/runtime, sizes and SHA256 checksums. Synthetic quality is not human speech, accent, noise or phone validation.

The Node client now also accepts exactly these two checksum-pinned files and their synthetic manifest, under the same explicit-injection, fresh visible-recording proof and host-microphone-disabled guards. It continues to accept the original six clips independently of whether the new private response directory exists.

The test-only microphone driver accepts `qa08_after=confirm-ack` or `confirm-snooze`. After actual recognition it requires the expected synthetic phrase (snooze allows `ten` or `10`), explicitly copies recognized words into the draft, opens review, and verifies the **entire exact review message for the owned title and expected action** before clicking Confirm. The review must disclose that the task stays open. A mismatched/absent transcript or review prevents confirmation. Normal review/reminder closure is then observed; the parent must independently assert ACK/task-TODO/zero registration or snooze generation/run-at/task-TODO through SQLite. These fixture/harness changes do not themselves establish a successful emulator run.

## Completed campaign and diagnostic error preservation

The [current ledger](../reports/evidence/phase-08-input-loss-case-ledger.json)
retains all51 terminal attempts and the separately reviewed V08 interruption.
V04 reproduced NO_AUDIO_SIGNAL with initializer/source gRPC0 and host OFF, so
configuration/transport completion do not prove captured PCM. V03's failed old
output cannot establish source-RPC entry: `injectionAttempted` was set before
setup, and the final host-ON guard masked the earlier error. No enable was requested;
final host input was OFF. The client now records `sourceStreamAttempted` and the
original redacted `injectionFailureReason`/gRPC status before that final check.
This is diagnostic reporting, not a repair or a change to streaming/safety behavior.
[Protocol review](../reports/evidence/phase-08-input-loss-protocol-review.json).
The late logging-only change passed Node/format and six no-device argument guards;
a live dual-error path was not deliberately induced by enabling host input.

<!-- phase08-capture-fix-current -->

## Current capture transport evidence — 2026-10-31

See the [capture-fix report](../reports/phase-08-capture-fix-report.md) and [closed ledger](../reports/evidence/phase-08-capture-fix-case-ledger.json): 45 PASS / 2 FAIL / 1 NOT RUN. The current scoped path uses a single source RPC after real visible Recording, source gain500/pad1000/delay0, <=200ms prefill, start-anchored20ms deadlines and minimum5ms post-prefill spacing. Both100ms lateness/lag guards remain; native test coordination12s, production capture15s/ringing60s are unchanged. No new production/decoder/model/schema/permission decision is introduced.

Earlier initializer/blocking/rebased protocol observations above are historical/experimental, not the current comparison protocol. All failed experiments remain. Planned PCM duration, source RPC completion/host-OFF eligibility, generator-yield counters, native comparison metadata and strict review/Confirm are distinct; source success does not prove capture/recognition. Literal ABORT differs from invalid authorization or absent-marker timeout. A pre-controller navigation failure is neither a source abort nor a recognition failure. No ASR accuracy denominator is constructed.

30 host checks,5 real Windows-clock dry runs (no SDK/audio) and3 gate controls passed; the controls are excluded from the10 selected affected trials. SDK cause remains unproven;10 pinned trials do not establish broad reliability, phone accuracy or audibility. Manual/typed fallback and ACK-not-completion remain. V05 owner-deferred; all48 physical rows NOT RUN, human review NOT SIGNED; stable release and Phase09+ unapproved.
