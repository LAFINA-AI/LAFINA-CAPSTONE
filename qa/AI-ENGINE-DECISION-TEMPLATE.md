# Voice / Intent Engine Benchmark Decision

**Phase:** __  **Device(s):** __  **Build:** __  **Date:** __

| Engine | Supported offline? | Installed locally? | Model size | p50 post-utterance | p95 | Peak PSS | WER / critical intent errors | Voice quality | Result |
|---|---|---|---|---|---|---|---|---|---|
| Android on-device STT | unknown until measured | | | | | | | | |
| Whisper.cpp | verify bundled | | | | | | | | |
| Android offline-capable TTS | check voices | | | | | | n/a | human intelligibility | |
| Kokoro old baseline | verify on legacy | | | | | | n/a | human naturalness | |
| Rules-only NLU | local | n/a | | | | | false actions | n/a | |
| SmolLM2 optional | test | model on device | | | | | JSON/intent | n/a | |

## Decision

Choose __ because verified measurement __. Reject __ because __. Keep fallback __. Unknowns __. Human approval __. Do not claim speed improvement without measured baseline; if Android offline engine unavailable, do not count online results as offline.
