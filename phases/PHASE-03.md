# PHASE 03 — Android-native alarms, permissions and simulated call shell

**Work authorization:** ONE PHASE ONLY. **Previous gate:** PHASE-02. **Prerequisites:** Human approval `APPROVE PHASE 03` after previous phase report reviewed; Phase 08 offline gate must pass before 09/10.

## In-scope work

- Evaluate selective port of old `LafinaReminderModule.kt`, `LafinaReminderReceiver.kt`, service and `src/scheduler/reminderAlarm.ts`. Implement AlarmManager adapter, stable distinct pending-intent IDs, alarm reconciliation and cancel/update lifecycle.
- Deliver Android-supported, **simulated** incoming reminder experience: eligible full-screen intent when approved and permitted, otherwise heads-up/normal notification that opens same screen; clear Answer, Snooze, Acknowledge/Dismiss, no actual telephony.
- Handle Android 11–newer exact alarm/full-screen/notification permissions and policy restrictions; avoid unrestricted background UI launches or mic capture. Recognize OEM/force-stop limitations and document them.
- Implement event callback id/occurrence version, duplicate broadcast protections, missed call timeout policy, restart/BOOT_COMPLETED reconciliation, permission revocation status and user education.
- No AI, STT, or TTS requirement at this phase; simple ringtone/vibration and text are enough. Ensure app can alert with process backgrounded according to platform permission and supported use case.
- Add Kotlin platform tests + native JS bridge tests and physical-device QA guide.

## Required evidence / exit gate

**Deliver:** real local alarm-to-notification/UI loop, status diagnostics, native capability/fallback behavior, tests and device logs.
**Automated:** mocked scheduling adapter state, native argument correctness, unique IDs, stale intents, race/double trigger, denial and reboot reconciliation logic.
**Human:** actual phone, screen locked/unlocked, app backgrounded, permission granted/denied, alarm scheduled and cancelled, reboot, concurrent alarms. Record Android API/device and outcomes.
**Fail if:** no working fallback when FSI denied, illegal mic launch, stale alarm causes wrong task mutation, or all native tests simulated without documented hardware validation.

## Phase execution checklist

1. Read root `AGENTS.md`, current phase and relevant docs. Check git status/branch and requirement IDs. If files differ from proposal, inspect and record discrepancies.
2. Create/update a brief phase execution plan and acceptance checklist. Inspect only relevant old repo files **read-only** at the pinned SHA.
3. Implement in small reviewable patches; do not modify unrelated features, business code or future phase features. Add tests alongside changes.
4. Execute focused tests, then full available `preflight`, build and instrumentation where configured. Report `PASS`, `FAIL`, `NOT RUN`, `HUMAN REQUIRED` accurately with commands/logs and device IDs only at general model/API level.
5. Update architecture docs and ADRs, domain schema and manual QA checklist if touched. Run Graphify/import cycle checks when applicable and record whether they ran.
6. Write `docs/reports/phase-03-report.md` using the report template, link commits/PR if allowed, list human validation steps and open risks.
7. **STOP, do not open the next phase.** End the message `STATUS: READY FOR REVIEW` or `STATUS: AWAITING DEVICE VALIDATION` or `STATUS: BLOCKED`; then `STOPPED — awaiting explicit human approval`.

## Hard boundaries

- New repo writable, old repo never writable. No full old repo copy, auto model downloads of unknown provenance, or remote secrets in mobile.
- No account/signup/business team functionality and no large UI redesign.
- Before Phase 09, absolutely no online API/backend runtime dependency for essential student flows. After Phase 09, online mode must remain optional.
- If manual phone checks cannot run here, stop with `AWAITING DEVICE VALIDATION` and supply exact steps. Never claim pass by mocking native Android.
