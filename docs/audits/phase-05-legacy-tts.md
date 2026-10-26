# Phase 05 — selective legacy TTS audit and baseline boundary

**Reviewed:** 2026-10-25, Asia/Manila. **Legacy revision:**
`f7e70aec54e6d16e627f444f2a67114cbfb07b5e`.

The legacy repository remained read-only. The local legacy path did not expose a
usable Git repository to this audit, so the exact pinned public files below were
read through the GitHub connector. No alternate revision was substituted. No
legacy dependency install, build, model download, source copy, app installation
or runtime benchmark was performed. The reviewed ranges do not certify unexamined
callers or the entire legacy application.

## Source actually inspected

| Pinned file | Git blob SHA / reviewed range | Observed behavior | Phase 05 decision |
|---|---|---|---|
| [LafinaTTSModule.kt][native] | `7bf59f5b1db1f038b465d1ce402a6dacb2f5a57c`; lines 1–178, 437–754 | Kokoro v0.19 ONNX resources are copied from assets to app cache. Session/style/dictionary fields survive between synthesis calls; ONNX intra-op threads are set to two. Synthesis creates a raw `Thread`, produces a complete WAV, then a separate MediaPlayer path plays it. | Reference for explicit cancellation, completion and audio ownership scenarios only. Implement the Android system TTS adapter against capstone contracts; do not import this model pipeline. |
| Same native ranges | Same blob | Player ownership settles the previous playback promise before replacement and reports completion/errors. A failed audio-focus request can continue into playback, and the focus return value is ignored. Source logs include spoken excerpts and output paths. | Keep bounded replacement and terminal results; require granted focus, stop on loss, release ownership and redact diagnostics. Do not port text/path logging or forced speaker routing. |
| [ttsService.ts][service] | `d9a43f60a1f07e4b052be5a5aac19987264819ba`; lines 1–336 | RNFS-backed WAV caching, per-path single-flight synthesis, partial-file deletion, reminder precache paths stored in the legacy reminder store and an age-based cache sweep. Keys normalize case/punctuation before hashing. Availability checks native method presence, not an installed offline system voice. | Do not transfer the cache/store/filesystem coupling. Availability must describe the actual selected installed voice and errors, with text retained. Cache-hit and uncached legacy trials are distinct future cohorts. |
| Same TypeScript range | Same blob | Synthesis/cache logs include text excerpts. An email-cleaning/read-aloud helper imports unrelated scope. | Exclude logs containing student content, email helpers, legacy storage and unrelated business/account dependencies. |

The inspected native bridge is a Kokoro implementation, not an Android
`TextToSpeech` adapter. Its successful synthesis or MediaPlayer callback is not
evidence of first audible output, intelligibility, silence-free playback or
physical-device reliability.

## What can and cannot be compared

The [Phase 00 voice audit](phase-00-native.md) recorded static Git/LFS inventory:
Kokoro model **325,525,180** expected payload bytes, voice **5,758,648** and
dictionary **3,618,487**. Their arithmetic sum is **334,902,315 bytes / 319.39 MiB**.
These are declared source payload values, not freshly downloaded/verified files,
APK size, installed size, runtime memory, battery or timing measurements. The
exact ONNX conversion, voice and dictionary redistribution provenance remains
unresolved; filenames and pointer hashes are insufficient clearance.

The [frozen baseline](../benchmarks/phase-00-baseline.md) explicitly states
**BASELINE NOT RUN**. No later traceable Kokoro first-audible, cold/warm latency,
PSS, battery or listening score was found in the existing benchmark records.
The owner's observation that Kokoro felt slow is useful motivation, not a numeric
control. Phase 02/04 host database benchmarks and Phase 03/04 emulator reminder
timings do not measure TTS. Therefore:

| Outcome | Phase 05 comparison status |
|---|---|
| Pinned legacy Kokoro cold/warm request → first audible audio | NOT RUN |
| Matched Kokoro/system TTS p50/p95, memory, energy and listening quality | NOT RUN; no speedup or superiority claim |
| Avoiding bundled Kokoro assets in capstone | Source/dependency decision; actual capstone APK size belongs to the current artifact manifest |
| Android callback timings from a current test build, if collected | Label request/init/`onStart`/terminal milestones exactly; never relabel as audibility |
| Physical phone airplane-mode voice, language fidelity and interruption | HUMAN REQUIRED until a reviewer records it on the named phone |

Do not build the read-only checkout to fill this gap. A future independently
prepared baseline requires approved provenance, a demonstrably pinned build,
separate disposable workspace, distinct installation/signing plan and the same
consenting phone, phrases and conditions as capstone. No baseline preparation or
model distribution is authorized by this document.

## System TTS evidence limits

Android exposes installed engines/voices, asynchronous initialization and
utterance callbacks. The app must release its instance and add the Android 11+
TTS service discovery query. Enqueue success does not mean completed speech.
[TextToSpeech API](https://developer.android.com/reference/android/speech/tts/TextToSpeech).

A voice reports whether it requires a network connection. Reject network-required
voices and voices marked `notInstalled`; selecting the latter can initiate a
download or substitute a voice. Never use selection to fetch missing data.
[Voice API](https://developer.android.com/reference/kotlin/android/speech/tts/Voice),
[engine features](https://developer.android.com/reference/android/speech/tts/TextToSpeech.Engine).

Those are engine-reported metadata checks, not independent inspection of a vendor
service or proof of zero traffic. Capstone's lack of an INTERNET permission does
not constrain a separately installed engine's permissions. Keep the requested
engine/default label distinct from verified bound-service identity; Android may
fall back during constructor binding. Record what the public API actually reports
and require airplane-mode listening. No silent network voice is acceptable.

`UtteranceProgressListener.onStart` is an engine playback milestone, not a
microphone/loopback measurement of the speaker. Physical first audibility and
quality require separate observation.
[UtteranceProgressListener API](https://developer.android.com/reference/android/speech/tts/UtteranceProgressListener).

Focus must be granted before speech and relinquished on stop. With current target
SDKs, background focus requests can fail unless the app is topmost or has an
eligible foreground service. Phase 05 limits speech to visible interaction; a
denial keeps text and reminder actions usable.
[Android audio focus guide](https://developer.android.com/media/optimize/audio-focus).

The implementation decision and exact phone checks are recorded in
[ADR-018](../decisions/ADR-018-system-tts.md) and
[the Phase 05 manual checklist](../../qa/PHASE-05-MANUAL.md). There is no STT,
microphone, language model, Kokoro, cloud or handbook implementation in this audit.

[native]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina/LafinaTTSModule.kt
[service]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/tts/ttsService.ts
