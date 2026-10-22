# Phase 02 execution checklist

Approval: owner, “so far phase 01 looks good, proceed phase 02”, 2026-10-22.
Screenshots and owner acceptance acknowledge the reviewed Phase01 UI; they do not
establish specific phone model/API/RAM, offline reboot, or performance results.
Base: `7d4105e`; branch `codex/phase-02-data-domain`. Clean start on main; branch
created before implementation. Phase01 had been committed by the owner since the
previous report. No legacy files are writable in this task.

- [x] Read AGENTS, Phase02, report template, actual foundation and data policies.
- [x] Inspect current APIs/tests and targeted pinned legacy audit (read only).
- [x] Add versioned schema preserving Phase01 preferences; real SQLite migrations.
- [x] Implement typed task/event/reminder APIs, guarded transactions and receipts.
- [x] Test rollback/crash recovery, duplicate/stale outcomes, ACK vs completion.
- [x] Implement bounded timezone-aware weekly classes and explicit time policies.
- [x] Expose debug-only CRUD harness; no Android alarms, speech, cloud or Phase03.
- [x] Run preflight, native builds, emulator SQLite/task UI checks where available.
- [x] Update schema, architecture, ADR, traceability, manual QA and phase report.
- [x] Stop for review with exact checks and actual not-run limits.

Final:108 tests/7 suites;14 migration/transaction cases including failed-rollback
quarantine; native debug/dataQa/release builds for ARM64+x86_64; emulator isolated
SQL and task create/edit/ACK/restart/delete pass. The interrupted emulator was
reopened by the owner and original connectivity restored. Full physical phone,
event/weekly/snooze UI and accessibility review remain HUMAN REQUIRED.
