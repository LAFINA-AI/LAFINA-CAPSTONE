# PHASE 11 — Hardening, capstone evaluation and release handoff

**Work authorization:** ONE PHASE ONLY. **Previous gate:** PHASE-10. **Prerequisites:** Human approval `APPROVE PHASE 11` after previous phase report reviewed; Phase 08 offline gate must pass before 09/10.

## In-scope work

- Comprehensive test matrix for offline core and online add-ons (when enabled), stress and battery, Android API/device coverage and permission edge cases. Fix defects, simplify complicated modules, update docs, dependency/license audit.
- Formal comparative analysis with pinned legacy baseline measured or marked unavailable: native Android TTS vs Kokoro, STT engine WER/speed, intent success/latency, memory, alarms, app launch and offline reliability. Report effect size and limitation without promotional extrapolation.
- Capstone research: anonymized usability studies, SUS/quality evaluation aligned to adviser protocol, reproducible RAG benchmark, raw aggregated metrics, risk register and known limitations.
- Produce releasable APK/AAB only if toolchain and signing available and authorized, update installation instructions; avoid distributing proprietary handbook or production API keys. Generate exact repository status/commit tags and final reviewer manual QA checklist.
- No new business features, accounts or aesthetic rework. Final deliverables reflect what actually works, not what planning documents envisioned.

## Required evidence / exit gate

**Deliver:** verified release candidate or documented blockers, full test/benchmark evidence, architecture/docs current, capstone evaluation packet, remaining limitations.
**Automated:** full CI, static security/architecture checks, instrumentation/regression, Pytest, RAG eval, artifact/package analysis.
**Human:** review final build on device, adviser sign-off on evaluation/handbook claims, secret/license/privacy check, choose release/stop.
**Fail if:** major regressions, fabricated evaluation, missing consent, undocumented API costs, or unsupported performance claims.

## Phase execution checklist

1. Read root `AGENTS.md`, current phase and relevant docs. Check git status/branch and requirement IDs. If files differ from proposal, inspect and record discrepancies.
2. Create/update a brief phase execution plan and acceptance checklist. Inspect only relevant old repo files **read-only** at the pinned SHA.
3. Implement in small reviewable patches; do not modify unrelated features, business code or future phase features. Add tests alongside changes.
4. Execute focused tests, then full available `preflight`, build and instrumentation where configured. Report `PASS`, `FAIL`, `NOT RUN`, `HUMAN REQUIRED` accurately with commands/logs and device IDs only at general model/API level.
5. Update architecture docs and ADRs, domain schema and manual QA checklist if touched. Run Graphify/import cycle checks when applicable and record whether they ran.
6. Write `docs/reports/phase-11-report.md` using the report template, link commits/PR if allowed, list human validation steps and open risks.
7. **STOP, do not open the next phase.** End the message `STATUS: READY FOR REVIEW` or `STATUS: AWAITING DEVICE VALIDATION` or `STATUS: BLOCKED`; then `STOPPED — awaiting explicit human approval`.

## Hard boundaries

- New repo writable, old repo never writable. No full old repo copy, auto model downloads of unknown provenance, or remote secrets in mobile.
- No account/signup/business team functionality and no large UI redesign.
- Before Phase 09, absolutely no online API/backend runtime dependency for essential student flows. After Phase 09, online mode must remain optional.
- If manual phone checks cannot run here, stop with `AWAITING DEVICE VALIDATION` and supply exact steps. Never claim pass by mocking native Android.
