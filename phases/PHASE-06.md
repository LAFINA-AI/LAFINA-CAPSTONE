# PHASE 06 — Offline STT hold-to-talk and engine benchmarks

**Work authorization:** ONE PHASE ONLY. **Previous gate:** PHASE-05. **Prerequisites:** Human approval `APPROVE PHASE 06` after previous phase report reviewed; Phase 08 offline gate must pass before 09/10.

## In-scope work

- Implement press-hold-release mic capture in chat and (where allowed) visible answered reminder UI; protect microphone and enforce one recording session. Permission requested at use, visual recording/transcribing state, cancellation and recovery.
- Benchmark Android on-device recognizer where supported with airplane-mode proof, and selectively port old Whisper.cpp Tiny quantized as fallback/alternative subject to licensing, package size/RAM performance and target device feasibility.
- Compare WER/command accuracy, cold startup, warm transcription post-release p50/p95, memory, battery and language quality on consented/public sample corpus incl Filipino-accented English.
- Support unavailable/permission denied/no speech/mic occupied/timeout/interrupted recordings and late callbacks. UI may show transcript and let user edit/confirm it. No online STT, no Gemini at this phase.
- Test native platform version constraints (Android 11 recognizer fallback). Do not keep Whisper loaded forever without measured reason. Keep recording off outside explicit hold.

## Required evidence / exit gate

**Deliver:** verified offline push-to-talk pipeline with adaptive engine selection/fallback, benchmark logs and model licenses.
**Automated:** session lifecycle, native bridge, recognizer unavailable fallback, no-speech handling, stale callback rejection, UI tests and WER harness.
**Human:** airplane mode spoken schedule commands, denied/revoked mic, different accents/noise, quick repeated holds, interruption by calls/audio, older/newer Android.
**Fail if:** captured voice sent online, constant mic on, missing transcript/error fallback, or offline speech claim unverified.

## Phase execution checklist

1. Read root `AGENTS.md`, current phase and relevant docs. Check git status/branch and requirement IDs. If files differ from proposal, inspect and record discrepancies.
2. Create/update a brief phase execution plan and acceptance checklist. Inspect only relevant old repo files **read-only** at the pinned SHA.
3. Implement in small reviewable patches; do not modify unrelated features, business code or future phase features. Add tests alongside changes.
4. Execute focused tests, then full available `preflight`, build and instrumentation where configured. Report `PASS`, `FAIL`, `NOT RUN`, `HUMAN REQUIRED` accurately with commands/logs and device IDs only at general model/API level.
5. Update architecture docs and ADRs, domain schema and manual QA checklist if touched. Run Graphify/import cycle checks when applicable and record whether they ran.
6. Write `docs/reports/phase-06-report.md` using the report template, link commits/PR if allowed, list human validation steps and open risks.
7. **STOP, do not open the next phase.** End the message `STATUS: READY FOR REVIEW` or `STATUS: AWAITING DEVICE VALIDATION` or `STATUS: BLOCKED`; then `STOPPED — awaiting explicit human approval`.

## Hard boundaries

- New repo writable, old repo never writable. No full old repo copy, auto model downloads of unknown provenance, or remote secrets in mobile.
- No account/signup/business team functionality and no large UI redesign.
- Before Phase 09, absolutely no online API/backend runtime dependency for essential student flows. After Phase 09, online mode must remain optional.
- If manual phone checks cannot run here, stop with `AWAITING DEVICE VALIDATION` and supply exact steps. Never claim pass by mocking native Android.
