# Phase06 execution checklist

Owner explicitly approved **APPROVE PHASE06** (written as `APPROVE PHASE 06`)
after reviewing Phase05 and requested emulator installation and manual checks.
Earlier physical-phone acceptance remains pending; it is not inferred from this
approval. Only Phase06 is authorized; no Phase07 intent/scheduling execution.

Branch: `codex/phase-06-offline-stt`. Existing uncommitted Phase04/05 work is
preserved. The123-file Phase05 handoff manifest is the preceding source cohort;
cumulative Git diff is not a Phase06-only change list.

- [x] Read AGENTS, phase scope, report template, current native/voice contracts.
- [x] Record approval, branch and prerequisites without resetting existing work.
- [x] Selectively inspect pinned legacy STT, upstream licenses/source/model hashes.
- [x] Implement explicit hold-only recording, one cross-process microphone lease,
      on-device Android recognition and reviewed local Whisper fallback.
- [x] Add typed boundary, editable transcript/manual draft, permission recovery,
      cancellation, foreground lifecycle and visible answered-reminder use.
- [x] Add session/native/UI tests and synthetic WER/accuracy evaluation harness.
- [x] Run full gates, ARM64/x86_64 builds, real emulator instrumentation and UI.
- [x] Record actual offline inference/latency/memory samples where feasible;
      accents, real microphone, phone interruption/battery remain NOT RUN unless
      actually tested. Never substitute mocked transcripts for offline proof.
- [x] Update ADR, architecture, provenance, risks, manual guide and phase report.
- [x] Restore emulator settings; stop before Phase07.

Executed evidence:308 JS tests/24 suites;62 JVM policy tests/6 suites;
42 functional instrumentation tests;7 inspected APKs;6 direct-PCM synthetic
Whisper results with0/36 word errors. Emulator permission/draft/silence/Home and
native answered-reminder safety checks are distinct from spoken recognition.
The virtual microphone attempt disconnected the emulator and is NOT VERIFIED.
Physical speech, API30/ARM64/low-RAM, accents/noise, calls/secure lock, battery
and matched legacy benchmarks remain HUMAN REQUIRED / NOT RUN. This checklist
does not mark the human Phase06 gate passed.
