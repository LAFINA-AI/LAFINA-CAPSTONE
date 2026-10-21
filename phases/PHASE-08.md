# PHASE 08 — Integrated offline reminder voice loop and release gate

**Work authorization:** ONE PHASE ONLY. **Previous gate:** PHASE-07. **Prerequisites:** Human approval `APPROVE PHASE 08` after previous phase report reviewed; Phase 08 offline gate must pass before 09/10.

## In-scope work

- Integrate prior modules end-to-end: scheduled alarm -> OS notification/call UI -> Answer -> system TTS speaks reminder -> user presses mic to respond or taps button -> offline intent interpretation -> atomic ACK/SNOOZE update -> OS alarm reconcile -> closes. No actual cellular call, no auto mic in disallowed background context.
- Ensure interruption/restart/double-trigger/late transcript/audio-focus-loss/revoked permission handling and fallback to buttons. Service ownership, timeout, lifecycle and no infinite loops. Keep voice/TTS models unloaded until necessary where benchmark validates.
- Execute full requirements traceability for F-001–F-017 (where SHOULD separately marked), test on minimum and newer Android reference devices if available, benchmark p50/p95 STT/TTS/full interaction, peak RAM, startup, battery and alarm delivery. Record unsupported OEM/platform conditions.
- Fix high severity defects and slow/unsupported flows; preserve minimal theme and onboarding. Do not begin backend/Gemini/RAG while any MUST offline core remains unverified.
- Generate **Offline Core Release Gate** report with PASS/HUMAN REQUIRED/FAIL and user review. This is mandatory approval barrier before Phases 09+.

## Required evidence / exit gate

**Deliver:** functional offline capstone core APK (if build environment), full E2E results, defects, device matrix, performance comparison and signed human review checklist.
**Automated:** all suites, static boundary checks, Android bridge tests, release-like build and reproducible benchmarks where environment enables.
**Human:** 30+ alarms across lifecycle/permissions; 10+ voice interactions per test voice, real airplane-mode confirmation, reboot, concurrent alarms, TTS unavailable, app restart, accessibility. Validate core offline end-to-end on device.
**Fail if:** offline core not reliable, cloud dependency introduced, device QA not performed, security flaws or critical bad intent outcomes. STOP until approved as stable offline baseline.

## Phase execution checklist

1. Read root `AGENTS.md`, current phase and relevant docs. Check git status/branch and requirement IDs. If files differ from proposal, inspect and record discrepancies.
2. Create/update a brief phase execution plan and acceptance checklist. Inspect only relevant old repo files **read-only** at the pinned SHA.
3. Implement in small reviewable patches; do not modify unrelated features, business code or future phase features. Add tests alongside changes.
4. Execute focused tests, then full available `preflight`, build and instrumentation where configured. Report `PASS`, `FAIL`, `NOT RUN`, `HUMAN REQUIRED` accurately with commands/logs and device IDs only at general model/API level.
5. Update architecture docs and ADRs, domain schema and manual QA checklist if touched. Run Graphify/import cycle checks when applicable and record whether they ran.
6. Write `docs/reports/phase-08-report.md` using the report template, link commits/PR if allowed, list human validation steps and open risks.
7. **STOP, do not open the next phase.** End the message `STATUS: READY FOR REVIEW` or `STATUS: AWAITING DEVICE VALIDATION` or `STATUS: BLOCKED`; then `STOPPED — awaiting explicit human approval`.

## Hard boundaries

- New repo writable, old repo never writable. No full old repo copy, auto model downloads of unknown provenance, or remote secrets in mobile.
- No account/signup/business team functionality and no large UI redesign.
- Before Phase 09, absolutely no online API/backend runtime dependency for essential student flows. After Phase 09, online mode must remain optional.
- If manual phone checks cannot run here, stop with `AWAITING DEVICE VALIDATION` and supply exact steps. Never claim pass by mocking native Android.
