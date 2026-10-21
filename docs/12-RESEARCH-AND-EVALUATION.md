# 12 — Capstone Research Contribution and Evidence

## Positioning

Rebuilt student-only LAFINA is **not** novel because it has STT, TTS or reminders; the earlier project had these. Distinct contribution to demonstrate: performance-aware, modular hybrid voice engine and local intent routing while retaining native offline scheduling reliability; rigorous measured comparison, reproducibility, and robust handbook-source QA. Adviser should approve exact study design.

## Research questions

- RQ1: On minimum-spec Android hardware, does native offline-capable Android TTS reduce start-of-speech latency and memory use compared with old Kokoro engine at acceptable intelligibility?
- RQ2: Does adaptive STT (platform offline recognizer when supported / Whisper fallback) improve latency and/or WER for student academic commands without internet?
- RQ3: Can deterministic intent fast paths reduce command completion latency without increasing false acknowledgments or scheduling mistakes?
- RQ4: How reliably do OS-scheduled call-style reminders deliver given permissions, app lifecycle and OEM policy?
- RQ5: How accurately can online USTP Handbook RAG answer source-supported policy questions, cite printed pages, and abstain on unsupported questions?

## Study instruments

- Pinned old app build and new phased build on same testing phone(s), same speech phrases with varying length, battery/thermal state, locale/engine/model version.
- At least 30 repetition timing runs where possible. WER commands from labeled dataset; ensure no accidental train/test leakage for NLU.
- Battery assessment over defined identical idle/active workload and fixed window, with device thermal/charging conditions recorded. Don't infer energy from CPU time alone.
- Human speech quality/usability survey with informed consent, concise appropriate validated SUS instrument if adviser requests; cross-check ISO/IEC 25010:2023 attributes relevant to performance, reliability, usability, security and maintainability.
- RAG gold question set with known authoritative source page/section/version and abstention examples. Don't evaluate by comparing answers to a second LLM alone.

## Data handling

Consent before voice recordings; anonymize testers, avoid storing identifying student data in reports/public repo, define retention and removal. For public code use synthetic fixtures and share only aggregate metrics.

## Tables/charts to publish after measurements

1. TTS cold/warm first-audio (old Kokoro vs system TTS) median/p95/peak memory.
2. STT WER and post-speech latency for each engine by phone/room condition.
3. Intent classification accuracy/critical errors and command completion time.
4. Alarm delivery within time windows; denial/force-stop outcomes separately.
5. RAG retrieval recall, citation correctness, unanswerable handling and response latency.
6. Pilot feedback: clarity of voice, usability, perceived interruptions, accessible fallback.

## Honesty rules

No fabricated absolute improvements. If the old baseline cannot be built/run, call comparison `not established` and benchmark new choices against each other. No claims that Android system TTS or on-device recognizer is universally offline. RAG cannot claim offline until truly implemented and tested. No result is proof of policy compliance on every Android phone.
