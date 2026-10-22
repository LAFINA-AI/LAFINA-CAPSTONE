# Phase 03 execution checklist

Approval: owner wrote `APPROVE PHASE 03` and requested emulator installation,
manual checks, and independent audit verification (2026-10-23).

Branch: `codex/phase-03-native-reminders`, based on `7d4105e` with the existing
uncommitted Phase 02 work preserved. No commit/push or legacy mutation.

- [x] Read AGENTS, PHASE-03, report template, prior reports, schema and relevant native source.
- [x] Review audit findings; distinguish observations from overclaims.
- [x] Select native architecture, durable identities and shared-database process boundary.
- [x] Harden date formatting, unsaved settings navigation, ABI declarations and bounded QA reads.
- [x] Implement transactional reminders, cancellation, reconciliation and permission fallbacks.
- [x] Add status/permission controls and private QA without Phase 04 planner UI.
- [x] Run JS gates, native unit/instrumentation checks, build and inspect both supported APKs.
- [x] Install on emulator and exercise AlarmManager → notification → reminder actions.
- [x] Record actual evidence and honest NOT RUN physical/OEM/low-RAM results.
- [x] Update ADRs, diagrams, QA steps, risks and phase report.
- [x] Stop before Phase 04; await explicit approval and human device validation.

Final local gates: 156 Jest tests, 30 native JVM tests, 23 API37 emulator
instrumentation tests; ARM64/x86_64 builds and APK inspection pass. Actual
emulator alarm/notification/actions, overlap/expiry, force-stop/reopen and
unattended reboot repeat are recorded in the [phase report](phase-03-report.md).
First inconclusive automation attempts remain recorded. Delivery/FSI opt-in are
off at handoff, active native counts zero, original connectivity restored.

**HUMAN REQUIRED / NOT RUN:** physical Android11/API30 and ARM64 execution,
OEM/low-RAM/Doze, sound/vibration, accessibility and matched phone performance.
The phase is **AWAITING DEVICE VALIDATION**, not passed by emulator evidence.

Phase 02 physical phone checks have not been independently confirmed. Explicit
Phase 03 approval permits this work; it does not convert those checks into PASS.
