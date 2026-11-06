# AGY-PORT 11 provenance: bundled models and the ONNX runtime

Recorded 2026-11-06. These are facts about files already in the repository. No model was added, replaced or downloaded in this phase.

| Item | Path | Bytes | SHA-256 | First added | Upstream license (declared upstream, not verified against this exact distribution) |
|---|---|---|---|---|---|
| Whisper base.en, q5_1 (whisper.cpp GGML) | `android/app/src/main/assets/models/ggml-base.en-q5_1.bin` | 59,721,011 | `4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f` | `c43acb8` (2026-10-26) | MIT (openai/whisper weights; ggml conversion by whisper.cpp, MIT) |
| Silero VAD | `android/app/src/main/assets/models/silero_vad.onnx` | 1,289,603 | `7ed98ddbad84ccac4cd0aeb3099049280713df825c610a8ed34543318f1b2c49` | `4ad63e3` (2026-10-26) | MIT (snakers4/silero-vad) |
| ONNX Runtime Android | Maven `com.microsoft.onnxruntime:onnxruntime-android:1.22.0` | — | AAR `04a4617a9c797cf49225595e45b5546081cb34c86ac817581141577d3b7dbfe2` | AGY-PORT 11 (ADR-024) | MIT (declared in the 1.22.0 POM) |
| ONNX Runtime Android (previous) | Maven `…:1.19.2` | — | AAR `84737dd1fdb715f0ee695c0a9864f6949b66ecb4c46ca733bc9211bf0c2a7b5f` | before AGY-PORT 00 | MIT upstream (the 1.19.2 POM declares none) |

**Not present (an inference limit, not a build failure):**

- **SmolLM2/llama.cpp.** No SmolLM2/gguf model is bundled, and the `lafina_llama` native library is not built. `LafinaIntentExtractorModule` therefore uses the deterministic fast path. A user can trigger an optional download of Qwen2.5-0.5B (`src/ai/nlu/modelManager.ts`) from Preferences. That download was not exercised.
- **Kokoro.** No Kokoro asset or module exists. Both APK audits list zero Kokoro entries.

**Still open: upstream checksums.** The exact upstream release and checksum of the two model files were not re-verified against their publishers in this run, which had no network verification. The owner should compare these SHA-256 values with the publishers' released files before a public release.
