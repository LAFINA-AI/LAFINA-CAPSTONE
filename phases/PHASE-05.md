# PHASE 05 — Fast Android system TTS and output modes

**Work authorization:** ONE PHASE ONLY. **Previous gate:** PHASE-04. **Prerequisites:** Human approval `APPROVE PHASE 05` after previous phase report reviewed; Phase 08 offline gate must pass before 09/10.

## In-scope work

- Benchmark legacy Kokoro as possible (baseline), then implement native `TextToSpeech` bridge with deterministic engine initialization, installed-voice enumeration, offline-only voice selection/verification, appropriate lifecycle/UtteranceProgressListener callbacks, stop/queue/audio-focus controls.
- Default chat reply = text; settings allow text/voice/both, reminder call = visible text with audio when offline-capable voice available. Never block scheduling DB confirmation while TTS speaks.
- Implement spoken canned reminder strings and context-specific replies without generative processing; decide whether caching fixed sounds is worth complexity based on data.
- If device lacks offline TTS voice or language, show setup guidance and remain fully usable with text+notification; do not falsely claim offline speech works on that phone. Do not port/ship Kokoro unless approved after performance evaluation.
- Instrument cold/warm first-audible-voice delay and init/cancel/stop, memory, language fidelity, interrupts/phone call audio focus, missing network voice. Compare to old measured baseline only where available.

## Required evidence / exit gate

**Deliver:** Android built-in TTS integration, preference toggles, speech failure fallback, instrumentation, old/new report.
**Automated:** typed bridge tests, missing voice and fallback, stop/cancel, multi-utterance, lifecycle and output-mode tests.
**Human:** airplane-mode voice preview and reminder reading; no network voice, text unaffected on TTS failure, audio interruption and rapid responses; record latency from speech request to audibility on device.
**Fail if:** speech silently uses online engine, UI blocked until audio finished, resource leak/unbounded queue, or fallback absent.

## Phase execution checklist

1. Read root `AGENTS.md`, current phase and relevant docs. Check git status/branch and requirement IDs. If files differ from proposal, inspect and record discrepancies.
2. Create/update a brief phase execution plan and acceptance checklist. Inspect only relevant old repo files **read-only** at the pinned SHA.
3. Implement in small reviewable patches; do not modify unrelated features, business code or future phase features. Add tests alongside changes.
4. Execute focused tests, then full available `preflight`, build and instrumentation where configured. Report `PASS`, `FAIL`, `NOT RUN`, `HUMAN REQUIRED` accurately with commands/logs and device IDs only at general model/API level.
5. Update architecture docs and ADRs, domain schema and manual QA checklist if touched. Run Graphify/import cycle checks when applicable and record whether they ran.
6. Write `docs/reports/phase-05-report.md` using the report template, link commits/PR if allowed, list human validation steps and open risks.
7. **STOP, do not open the next phase.** End the message `STATUS: READY FOR REVIEW` or `STATUS: AWAITING DEVICE VALIDATION` or `STATUS: BLOCKED`; then `STOPPED — awaiting explicit human approval`.

## Hard boundaries

- New repo writable, old repo never writable. No full old repo copy, auto model downloads of unknown provenance, or remote secrets in mobile.
- No account/signup/business team functionality and no large UI redesign.
- Before Phase 09, absolutely no online API/backend runtime dependency for essential student flows. After Phase 09, online mode must remain optional.
- If manual phone checks cannot run here, stop with `AWAITING DEVICE VALIDATION` and supply exact steps. Never claim pass by mocking native Android.
