# PHASE 00 — Read-only audit, baseline and implementation blueprint

**Work authorization:** ONE PHASE ONLY. **Previous gate:** N/A. **Prerequisites:** None; startup prompt authorizes this phase only.

## In-scope work

- Check new repo status and branch, existing files/README; avoid overwriting existing content without inspection. Install missing planning files only.
- Inspect old pinned commit selectively using `docs/03-LEGACY-REFERENCE.md`. Confirm legacy stack, actually implemented features, Android native permissions, model asset sizes/licensing, and tests. Old repo is **read-only**.
- Create and validate repo tooling assessment: Node, npm, JDK, Android SDK/NDK, Kotlin/Gradle, Python, device access. Prefer Node/Java compatible with inspected RN version; pin versions after verification.
- Run old relevant unit tests/build and initial performance benchmarks **only if safe and environment available**. Capture executable commands and errors. Separate `BASELINE MEASURED` from `BASELINE NOT RUN` and from user-anecdotal slow Kokoro.
- Decide minimum capstone schema (no account), migration/port candidates, selected offline STT fallback strategy, Android TTS bridge plan, and freeze phase ordering.
- Draft ADRs and risk register. Find stale AGENTS vs dependencies and capstone paper vs runtime mismatches; document without changing old repo.
- Set up docs and `docs/reports/phase-00-report.md`; don't implement production app features yet.

## Required evidence / exit gate

**Deliver:** repository inventory, pinned SHA, file reuse classification, dependency/license security findings, baseline commands/results or not-run reasons, proposed Android test devices and permissions matrix, architecture/ADR list, complete updated scope matrix, Phase 01 readiness and report.
**Automated:** repo checkout/status; selected existing tests/lint/build where dependencies available; no fake assertion that new repo builds if it contains only Markdown.
**Human:** review target Android models and allow/deny source port and licenses; authorize Phase 01 explicitly.
**Fail if:** arbitrary business code imported, old repo written, baseline invented, scope unconstrained, or unresolved critical privacy/license concerns hidden.

## Phase execution checklist

1. Read root `AGENTS.md`, current phase and relevant docs. Check git status/branch and requirement IDs. If files differ from proposal, inspect and record discrepancies.
2. Create/update a brief phase execution plan and acceptance checklist. Inspect only relevant old repo files **read-only** at the pinned SHA.
3. Implement in small reviewable patches; do not modify unrelated features, business code or future phase features. Add tests alongside changes.
4. Execute focused tests, then full available `preflight`, build and instrumentation where configured. Report `PASS`, `FAIL`, `NOT RUN`, `HUMAN REQUIRED` accurately with commands/logs and device IDs only at general model/API level.
5. Update architecture docs and ADRs, domain schema and manual QA checklist if touched. Run Graphify/import cycle checks when applicable and record whether they ran.
6. Write `docs/reports/phase-00-report.md` using the report template, link commits/PR if allowed, list human validation steps and open risks.
7. **STOP, do not open the next phase.** End the message `STATUS: READY FOR REVIEW` or `STATUS: AWAITING DEVICE VALIDATION` or `STATUS: BLOCKED`; then `STOPPED — awaiting explicit human approval`.

## Hard boundaries

- New repo writable, old repo never writable. No full old repo copy, auto model downloads of unknown provenance, or remote secrets in mobile.
- No account/signup/business team functionality and no large UI redesign.
- Before Phase 09, absolutely no online API/backend runtime dependency for essential student flows. After Phase 09, online mode must remain optional.
- If manual phone checks cannot run here, stop with `AWAITING DEVICE VALIDATION` and supply exact steps. Never claim pass by mocking native Android.
