# Phase 07 execution checklist

Owner explicitly wrote `APPROVE PHASE 07`, reviewed Phase 06, and requested
emulator execution and a manual checklist. Earlier phone/STT acceptance is still
pending; this approval does not fabricate physical-device results. Only Phase 07
is authorized. Branch: `codex/phase-07-offline-intents`; existing uncommitted
Phase 04–06 files are preserved. Phase 06's frozen 249-file source manifest is the
comparison baseline, rather than the cumulative Git diff.

- [x] Read AGENTS, phase instructions, report template, relevant docs and APIs.
- [x] Record approval and branch; preserve existing work and legacy read-only pin.
- [x] Audit pinned legacy intent/date/dispatch code and tests selectively.
- [x] Implement bounded deterministic parser, strict structured validation and
      ambiguity/contradiction refusal; no additional language model.
- [x] Add one confirmed executor with exact target/version/occurrence fencing,
      durable repository transactions and idempotency; queries never mutate.
- [x] Connect text and reviewed STT to transient local chat and optional system
      TTS; retain manual planner and cancellation on errors/navigation.
- [x] Add labeled command evaluation, adversarial/date/SQLite/UI tests; record
      actual results, timings, errors and unavailable matched legacy baseline.
- [x] Run preflight, current Android builds, instrumentation and offline emulator
      UI checks; restore device settings and delete only new synthetic fixtures.
- [x] Update ADR, architecture, requirements, risks, manual guide and phase report.
- [x] Verify source/artifact/evidence integrity and stop before Phase 08.

Physical speech, accents/noise, API30/ARM64/low-RAM, real-call/lock-screen and
battery acceptance remain HUMAN REQUIRED unless actual new evidence is recorded.

Actual gates:453 JS tests/27 suites and44-module AST;62 JVM tests/6 suites;
42 emulator instrumentation tests; seven inspected ABI/build APKs. Frozen first
held-out command evaluation:62/64 exact, zero unsafe-ready proposals on32 refusal
cases; post-fix unchanged-label regression:64/64. Real emulator typed create,
query/correct, event operations, explicit completion/deletion, refused commands,
Home cancellation, force-stop persistence, Chat-created real alarm/named ACK with
task TODO, TTS Stop and explicit draft copying passed. Original emulator settings
were restored and all new fixtures removed. This does not pass the physical
spoken or full offline-core Phase08 human gate.
