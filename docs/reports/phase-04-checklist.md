# Phase 04 execution checklist

Owner authorization (2026-10-23, Asia/Manila): “inspect if this is accurate and fix
it ... you can proceed to phase 04.” This explicitly authorizes Phase 04 and the
audit verification, overriding the standing literal approval wording for this
turn. It does not certify unreported physical-phone checks from Phase 03.

Starting state: clean `main` at `b3eefb8`; the owner has committed the prior Phase
02/03 work. Work branch: `codex/phase-04-manual-planner`. Legacy stays read-only
at `f7e70aec54e6d16e627f444f2a67114cbfb07b5e`. No commit/push requested.

- [x] Inspect instructions, Phase 04 scope, source/API, current branch and audit.
- [x] Verify external findings; fix real defects and document inaccurate claims.
- [x] Review selected pinned legacy Today/Calendar patterns without copying modules.
- [x] Add bounded product agenda/task/detail read APIs and query benchmark.
- [x] Implement manual task/event forms, week/day agenda, item actions and recovery.
- [x] Connect committed mutations to existing native alarm reconciliation.
- [x] Verify automated gates, Android build/instrumentation and emulator offline flow.
- [x] Update architecture/ADRs, actual evidence, physical QA and completion report.
- [x] Stop before Phase 05; physical-device acceptance remains human required.

Scope: manual offline planner only. No voice, AI commands, cloud or large redesign.

Final evidence updated 2026-10-24: 208 Jest tests / 16 suites; 30 JVM tests
from the initial native run (unchanged task/XML reused afterward); 23 Android
instrumentation tests on the handoff APK; 12 handoff emulator assertions plus
six separately identified initial-cohort assertions. Driver failures and the
corrected Undo expectation remain in the ledgers. Settings restored and no active
alarms remain. See [report](phase-04-report.md) and final integrity record.

- [ ] Human physical-phone acceptance: NOT RUN, including API30/ARM64/low-RAM,
  locked/idle/OEM, audio/vibration/accessibility and matched performance cases.

**STATUS: AWAITING DEVICE VALIDATION**

**STOPPED — awaiting explicit human approval for Phase 05.**
