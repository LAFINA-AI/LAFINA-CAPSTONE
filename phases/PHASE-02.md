# PHASE 02 — Offline data domain, SQLite and scheduling operations

**Work authorization:** ONE PHASE ONLY. **Previous gate:** PHASE-01. **Prerequisites:** Human approval `APPROVE PHASE 02` after previous phase report reviewed; Phase 08 offline gate must pass before 09/10.

## In-scope work

- Implement minimal capstone SQLite schema, versioned migrations, domain types and repository; do not transplant 17-version legacy business schema. Single anonymous local profile, Task, Event, Reminder, ReminderJob, limited ChatMessage and preferences.
- Implement task/event CRUD, upcoming queries, timezone/date-time handling, atomic paired reminder/job creation/mutation, idempotent reminder outcome updates, clear ACK vs Task COMPLETE semantics.
- Add pure test clock, calendar recurrence boundaries where approved (weekly classes), deterministic overdue/missed/quiet-hours policy, data validation and synthetic fixtures. A database write is authoritative even if Android alarm registration later fails; surface delivery-unavailable state for reconciliation.
- Add fault-injection tests: duplicate operations, transaction rollback, app termination during mutation, invalid timestamps and migration from previous **capstone** schema version; no legacy data migration guarantee.
- Expose tested use-case APIs to UI and a simple debug-only CRUD harness; don't integrate actual Android alarm until Phase 03. Preserve RAG/online exclusions.

## Required evidence / exit gate

**Deliver:** SQLite repositories, typed domain/use cases, migration and transaction tests, schema docs, test fixture builder and report.
**Automated:** CRUD tests, atomic rollback, idempotency, invalid times, recurrence edge fixtures, database migration replay; Jest and on-device SQL checks if possible.
**Human:** inspect persisted items after app restart with phone offline; verify no account prompt and no task auto-completion upon ACK.
**Fail if:** two records can partially update, duplicate occurrence created, or manual data disappears on restart.

## Phase execution checklist

1. Read root `AGENTS.md`, current phase and relevant docs. Check git status/branch and requirement IDs. If files differ from proposal, inspect and record discrepancies.
2. Create/update a brief phase execution plan and acceptance checklist. Inspect only relevant old repo files **read-only** at the pinned SHA.
3. Implement in small reviewable patches; do not modify unrelated features, business code or future phase features. Add tests alongside changes.
4. Execute focused tests, then full available `preflight`, build and instrumentation where configured. Report `PASS`, `FAIL`, `NOT RUN`, `HUMAN REQUIRED` accurately with commands/logs and device IDs only at general model/API level.
5. Update architecture docs and ADRs, domain schema and manual QA checklist if touched. Run Graphify/import cycle checks when applicable and record whether they ran.
6. Write `docs/reports/phase-02-report.md` using the report template, link commits/PR if allowed, list human validation steps and open risks.
7. **STOP, do not open the next phase.** End the message `STATUS: READY FOR REVIEW` or `STATUS: AWAITING DEVICE VALIDATION` or `STATUS: BLOCKED`; then `STOPPED — awaiting explicit human approval`.

## Hard boundaries

- New repo writable, old repo never writable. No full old repo copy, auto model downloads of unknown provenance, or remote secrets in mobile.
- No account/signup/business team functionality and no large UI redesign.
- Before Phase 09, absolutely no online API/backend runtime dependency for essential student flows. After Phase 09, online mode must remain optional.
- If manual phone checks cannot run here, stop with `AWAITING DEVICE VALIDATION` and supply exact steps. Never claim pass by mocking native Android.
