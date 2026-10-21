# PHASE 01 — Minimal app foundation, theme, local onboarding

**Work authorization:** ONE PHASE ONLY. **Previous gate:** PHASE-00. **Prerequisites:** Human approval `APPROVE PHASE 01` after previous phase report reviewed; Phase 08 offline gate must pass before 09/10.

## In-scope work

- Bootstrap fresh capstone Android-first React Native+TypeScript using tested/compatible versions; choose from old baseline when practical. Keep only required Java/Kotlin native setup. Validate debug/release-like Android build and physical device launch where possible.
- Create minimal navigation `Today`, `Calendar` placeholder, `Chat` placeholder, `Settings`; use central semantic light/dark theme tokens, reusable minimal accessible controls, no costly animations/gradients. Borrow old brand/theme design as reference, not full old app.
- Implement **no-account anonymous local onboarding**: optional nickname, timezone autodetect, reminder lead/snooze defaults, optional quiet hours, reply voice/text/both, permissions explanation (avoid premature mic request). Persist `onboarding_complete` locally and provide reset/retake controls.
- Create typed interface skeletons for future SQLite, alarm, STT, TTS and AI, with no fake success states. Support airplane-mode startup and fresh install.
- Configure stable test/lint/typecheck/format scripts, CI starter, small debug diagnostics page, `README` with exact commands. Write `docs/decisions` for RN stack, dependency choice and onboarding data.
- Verify all identifiers, copies and app icons/license; never include bundled AI models until relevant phase.

## Required evidence / exit gate

**Deliver:** runnable minimal Android application, functional offline no-account onboarding, shared theme, basic tabs, initial Jest UI tests, working preflight and device instructions.
**Automated:** TS strict, formatting, lint, unit/UI tests, Android assemble if available; verify offline imports contain no backend dependencies.
**Human:** fresh install in airplane mode, onboarding screens; close/reopen preserves settings; light/dark and big-font navigation; no login screen or blocked network calls.
**Fail if:** app requires internet/account, default app includes business modules, UI tests fail, or physical app not usable.

## Phase execution checklist

1. Read root `AGENTS.md`, current phase and relevant docs. Check git status/branch and requirement IDs. If files differ from proposal, inspect and record discrepancies.
2. Create/update a brief phase execution plan and acceptance checklist. Inspect only relevant old repo files **read-only** at the pinned SHA.
3. Implement in small reviewable patches; do not modify unrelated features, business code or future phase features. Add tests alongside changes.
4. Execute focused tests, then full available `preflight`, build and instrumentation where configured. Report `PASS`, `FAIL`, `NOT RUN`, `HUMAN REQUIRED` accurately with commands/logs and device IDs only at general model/API level.
5. Update architecture docs and ADRs, domain schema and manual QA checklist if touched. Run Graphify/import cycle checks when applicable and record whether they ran.
6. Write `docs/reports/phase-01-report.md` using the report template, link commits/PR if allowed, list human validation steps and open risks.
7. **STOP, do not open the next phase.** End the message `STATUS: READY FOR REVIEW` or `STATUS: AWAITING DEVICE VALIDATION` or `STATUS: BLOCKED`; then `STOPPED — awaiting explicit human approval`.

## Hard boundaries

- New repo writable, old repo never writable. No full old repo copy, auto model downloads of unknown provenance, or remote secrets in mobile.
- No account/signup/business team functionality and no large UI redesign.
- Before Phase 09, absolutely no online API/backend runtime dependency for essential student flows. After Phase 09, online mode must remain optional.
- If manual phone checks cannot run here, stop with `AWAITING DEVICE VALIDATION` and supply exact steps. Never claim pass by mocking native Android.
