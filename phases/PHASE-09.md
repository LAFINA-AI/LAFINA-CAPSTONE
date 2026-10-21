# PHASE 09 — Optional secure online Gemini gateway

**Work authorization:** ONE PHASE ONLY. **Previous gate:** PHASE-08. **Prerequisites:** Human approval `APPROVE PHASE 09` after previous phase report reviewed; Phase 08 offline gate must pass before 09/10.

## In-scope work

- Only start if Phase 08 is explicitly human-approved as passing. Implement minimal FastAPI backend and mobile optional online mode, without user registration, login, business functions or remote schedule sync. Keep backend out of offline path and uninstalled/not required for offline builds.
- Gemini via server-held secret only, configurable currently supported low-latency model, bounded request and response length, safe structured outputs, streaming if helpful, timeout/retry/rate limiting, error mapping, costs/usage budget and minimal transcript/privacy policy.
- Build public proxy abuse threat model for anonymous deployment: since there are no user accounts, require technical anti-abuse or limit to supervised demo with approved access; **never deploy unrestricted paid Gemini proxy**. No Gemini key in mobile. No account/identity collection hidden in workaround.
- Offline toggle keeps local intent processing and no outbound traffic. Internet loss mid-request fails gracefully; scheduling remains local and never waits on online service.
- Compare online time-to-first-text vs offline capabilities; measure response quality, cost and failure modes. No handbook RAG yet except zero dependency placeholder UI disabled.

## Required evidence / exit gate

**Deliver:** minimal secure backend optional online chat, tests and privacy/usage limits; stable core unaffected.
**Automated:** Pytest mocked provider responses, timeout, 429, injection/oversize, missing env secret, security lint, offline build tests, service boundary imports.
**Human:** opt-in toggle, test with demo backend if available; disconnect network during request, verify no schedule lost; confirm budget/rate limits and no credentials in APK.
**Fail if:** API key in client/public code, open unlimited Gemini proxy, loss of offline capabilities, account creation required, or RAG sneaked in prematurely.

## Phase execution checklist

1. Read root `AGENTS.md`, current phase and relevant docs. Check git status/branch and requirement IDs. If files differ from proposal, inspect and record discrepancies.
2. Create/update a brief phase execution plan and acceptance checklist. Inspect only relevant old repo files **read-only** at the pinned SHA.
3. Implement in small reviewable patches; do not modify unrelated features, business code or future phase features. Add tests alongside changes.
4. Execute focused tests, then full available `preflight`, build and instrumentation where configured. Report `PASS`, `FAIL`, `NOT RUN`, `HUMAN REQUIRED` accurately with commands/logs and device IDs only at general model/API level.
5. Update architecture docs and ADRs, domain schema and manual QA checklist if touched. Run Graphify/import cycle checks when applicable and record whether they ran.
6. Write `docs/reports/phase-09-report.md` using the report template, link commits/PR if allowed, list human validation steps and open risks.
7. **STOP, do not open the next phase.** End the message `STATUS: READY FOR REVIEW` or `STATUS: AWAITING DEVICE VALIDATION` or `STATUS: BLOCKED`; then `STOPPED — awaiting explicit human approval`.

## Hard boundaries

- New repo writable, old repo never writable. No full old repo copy, auto model downloads of unknown provenance, or remote secrets in mobile.
- No account/signup/business team functionality and no large UI redesign.
- Before Phase 09, absolutely no online API/backend runtime dependency for essential student flows. After Phase 09, online mode must remain optional.
- If manual phone checks cannot run here, stop with `AWAITING DEVICE VALIDATION` and supply exact steps. Never claim pass by mocking native Android.
