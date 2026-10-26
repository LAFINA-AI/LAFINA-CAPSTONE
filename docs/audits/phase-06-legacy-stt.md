# Phase06 — pinned legacy STT review

Reviewed2026-10-26, Asia/Manila. Legacy reference remains
`f7e70aec54e6d16e627f444f2a67114cbfb07b5e`. The local legacy path did not expose a
usable `.git` checkout, so the exact public pinned files below were read through
the GitHub connector. No alternative revision was used. No legacy checkout,
build, database, model, credential, dependency tree or benchmark audio was
modified or copied.

## Files actually inspected

| Pinned file and range | Git blob | Observation and capstone decision |
|---|---|---|
| [LafinaOfflineSpeech.kt,1–360][speech] | `12f92c218db0ef3851c5482d5bf5f8a28f7fc441` | Captures16kHz mono PCM, uses a capture identity and stop/discard flags, Silero/ONNX VAD and an English Tiny Q5_1 asset. The module retains Whisper/VAD fields between requests. Keep a bounded PCM boundary and explicit capture identity; use foreground hold only, a cross-process microphone lease and per-request decoder ownership. Do not import VAD/ONNX, automatic/barge-in capture, meeting dependencies or the old binary. These reviewed ranges do not establish every legacy cleanup path. |
| [whisper_jni.cc,entire file][jni] | `30817bd54718e4d681bbaf32174fa188b9ea76bb` | Separate context init/transcribe/free JNI functions, greedy English decode, caller thread count1–4 and academic/call prompts. Its no-speech threshold is deliberately set to1 because the legacy relies on upstream VAD. Preserve useful decoder API concepts; use validated PCM, two CPU threads, no retained context, cooperative cancellation, bounded output and normal no-speech gating. No prompt biases are imported. |
| [CMakeLists.txt,entire file][cmake] | `995e4fb84d377c33fe1844faf05d6c272f59ce45` | Includes the RN application CMake before a separate Whisper JNI target and disables host-native/OpenMP settings. Retain that integration sequence and optimized debug kernel rationale, with a new pinned minimal CPU-only upstream selection and16KiB shared-library alignment. Build flags do not themselves prove speed. |
| [speechCapture.ts,entire file][capture] | `442d85b0baf7f7a87033f6370f53b8a74e5a7ae2` | Typed capture identity, one JS owner, stop/cancel and90s watchdog. Retain strict session correlation and terminal outcomes; use shorter native recording bounds and cancellation across lifecycle loss. The capstone does not import this module or its legacy bridge contract. |
| [voicePipeline.ts,1–160][pipeline] | `8e2ce8c5608f7b75dda91fc2e4c27f59239e7a1f` | Couples capture to local model/NLU scheduling and a user identifier. Exclude this pipeline. Phase06 recognized/confirmed words are local drafts with no scheduling/storage side effect; Phase07 remains unapproved. |

The current wrappers are capstone implementations against the narrow public
Whisper/Android contracts. The copied dependency is the reviewed upstream
Whisper/GGML selection, not the legacy application. Its provenance is recorded
in [the Phase06 third-party ledger](../third-party/phase-06-provenance.md).

## Baseline and reuse limits

No traceable matched-device legacy STT WER, latency, peak PSS, power or accent
quality baseline was established by this review. **LEGACY BASELINE NOT RUN.**
The earlier Phase00 inventory found a debug float fixture of unknown consent/
redistribution provenance; it remains excluded. Static model pointer sizes and
source comments about speed/hallucinations are not measured capstone results.

The legacy name is Tiny **English** Q5_1. The new optional artifact is Tiny
**multilingual** Q5_1 from a pinned upstream publisher. They are different model
cohorts; no accuracy/speed ratio should be inferred from their similar sizes.
The conversion/quantization has not been independently reproduced. New synthetic
Windows-SAPI clips do not represent Filipino accents, microphones, noise or real
phone interruptions. Actual new execution belongs in the phase report.

[speech]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina/LafinaOfflineSpeech.kt
[jni]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/cpp/whisper_jni.cc
[cmake]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/cpp/CMakeLists.txt
[capture]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/native/speechCapture.ts
[pipeline]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/native/voicePipeline.ts
