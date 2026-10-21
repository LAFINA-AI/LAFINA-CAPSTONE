# PHASE 04 — Manual calendar/tasks/reminders and offline core without voice

**Work authorization:** ONE PHASE ONLY. **Previous gate:** PHASE-03. **Prerequisites:** Human approval `APPROVE PHASE 04` after previous phase report reviewed; Phase 08 offline gate must pass before 09/10.

## In-scope work

- Adapt only useful old Calendar/Today UI patterns; implement functional calendar/agenda (month or week and day as feasible), task/event forms, due time/reminder lead, task status, edit/delete/snooze from UI, search/filter only if needed.
- Connect UI to local storage/use cases and native AlarmManager adapter, so a user can create->schedule->receive->answer/snooze->reopen entirely offline.
- Manage local timezone, 12h/24h display, validation, date picker accessibility, keyboard avoiding, empty/error/retry states. No account, cloud, business skills, new theme redesign.
- Keep all immediate UI states honest: storage failed != success, alarm permission denied != reminder guaranteed.
- Add basic end-to-end airplane-mode flow in automation where possible and physical tests; capture calendar coverage of relevant school days and recurrence if approved.

## Required evidence / exit gate

**Deliver:** fully usable manual offline academic planner and proactive simulated call notifications, no STT/TTS dependency.
**Automated:** React Native components, flows, mutation reflected in calendar, undo/invalid input, background alarm adapter tests, offline import restrictions.
**Human:** airplane-mode new student schedules class/exam, closes app, receives alert, snoozes, sees correct new time, marks task complete separately; test restart and notification-denied warning.
**Fail if:** app requires AI or network to set a reminder, recurring occurrences drift, reminder ACK completes task, or basic UI inaccessible.

## Phase execution checklist

1. Read root `AGENTS.md`, current phase and relevant docs. Check git status/branch and requirement IDs. If files differ from proposal, inspect and record discrepancies.
2. Create/update a brief phase execution plan and acceptance checklist. Inspect only relevant old repo files **read-only** at the pinned SHA.
3. Implement in small reviewable patches; do not modify unrelated features, business code or future phase features. Add tests alongside changes.
4. Execute focused tests, then full available `preflight`, build and instrumentation where configured. Report `PASS`, `FAIL`, `NOT RUN`, `HUMAN REQUIRED` accurately with commands/logs and device IDs only at general model/API level.
5. Update architecture docs and ADRs, domain schema and manual QA checklist if touched. Run Graphify/import cycle checks when applicable and record whether they ran.
6. Write `docs/reports/phase-04-report.md` using the report template, link commits/PR if allowed, list human validation steps and open risks.
7. **STOP, do not open the next phase.** End the message `STATUS: READY FOR REVIEW` or `STATUS: AWAITING DEVICE VALIDATION` or `STATUS: BLOCKED`; then `STOPPED — awaiting explicit human approval`.

## Hard boundaries

- New repo writable, old repo never writable. No full old repo copy, auto model downloads of unknown provenance, or remote secrets in mobile.
- No account/signup/business team functionality and no large UI redesign.
- Before Phase 09, absolutely no online API/backend runtime dependency for essential student flows. After Phase 09, online mode must remain optional.
- If manual phone checks cannot run here, stop with `AWAITING DEVICE VALIDATION` and supply exact steps. Never claim pass by mocking native Android.
