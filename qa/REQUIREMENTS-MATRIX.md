# Requirements-to-phase traceability — through Phase07.1 integration

Updated through Phase07.1,2026-10-26 Asia/Manila. F-001/F-002 have implementation,
automated and emulator evidence; physical-device acceptance is still pending.
Future test IDs remain planned, not executed tests. Phase ownership does not grant
approval. F-001–F-015 remain offline MUSTs. No physical phone has been tested; an API37 emulator supplied the separately labeled native and planner evidence.

| ID | Confirmed scope | Owner phase | Planned automated evidence | Human/device evidence | Status |
|---|---|---:|---|---|---|
| F-001 | Anonymous offline onboarding; no account | 01 | App.test.tsx completion/retry/validation tests PASS | Release preview offline emulator exercised; physical phone pending | IMPLEMENTED, DEVICE PENDING |
| F-002 | Local theme/voice/lead/snooze/quiet-hour preferences | 01 | App.test.tsx + storage.test.ts real host-SQLite reopen/failed-write tests PASS | Native emulator persistence exercised; physical phone pending | IMPLEMENTED, DEVICE PENDING |
| F-003 | Manual task/event CRUD | 02,04 | Repository + PlannerForm/PlannerScreen real host-SQLite/UI tests PASS; manual forms implemented | Emulator outcomes in Phase 04 report; physical phone pending | IMPLEMENTED, DEVICE PENDING |
| F-004 | Month selector, week/day calendar and paged tasks reflect mutations | 04,07.1 | plannerQueries/PlannerScreen plus CalendarMonth cover date selection, leap/month bounds, create/edit/delete, paging and carry-in | Integrated emulator month/day/detail and mutation checks in Phase07.1 report; physical pending | IMPLEMENTED, DEVICE PENDING |
| F-005 | Reminder/job create/update/cancel | 02,03 | Paired SQL/generation tests; native reconciliation and identity tests, see Phase03 report | Emulator outcomes in report; physical pending | IMPLEMENTED, DEVICE PENDING |
| F-006 | Native due notification/alarm within OS limits | 03,08 | AlarmManager adapter, capability/denial and native store tests | Locked/background/idle/API/OEM drift still requires phone | IMPLEMENTED, DEVICE PENDING |
| F-007 | Conditional simulated-call UI + notification fallback | 03,04 | Explicit FSI opt-in and eligible intent; same-screen notification fallback | API30/33/34+ phone permission matrix pending | IMPLEMENTED, DEVICE PENDING |
| F-008 | ACK independent of completion; atomic snooze | 02,04,08 | Paired SQL tests + manual detail ACK/snooze/completion/undo/foreground refresh tests PASS | Ordinary planner emulator flow in Phase 04 report; phone pending | IMPLEMENTED, DEVICE PENDING |
| F-009 | Validated offline typed scheduling commands | 07 | Pure parser/strict validator; confirmed commandSession against real host SQLite; Chat UI tests and frozen text evaluation implemented, actual current gates in Phase07 report | Current Phase07 offline emulator create/move/query/refusal/persistence and live named ringing ACK exercised; remaining emulator and physical spoken/device acceptance in report | IMPLEMENTED, DEVICE PENDING |
| F-010 | Visible hold-to-talk offline STT | 06 | Typed bridge/session/UI denial/release/stale/cancel tests, native lease/policy tests and synthetic WER harness implemented; actual results in Phase06 report | Real hold/offline recognizer/Whisper, accents/noise/API30/newer/low-RAM/call review pending; direct synthetic PCM is separate | IMPLEMENTED, NATIVE/DEVICE ACCEPTANCE PENDING |
| F-011 | Android system offline-capable TTS default | 05 | Strict typed bridge, offline/not-installed rejection, bounded replacement, timeout/cancel and lifecycle tests implemented; see Phase 05 report for executed native outcomes | Airplane-mode audibility, missing voice, quality, interruption and actual phone timing pending | IMPLEMENTED, DEVICE PENDING |
| F-012 | Immediate durable text reply; optional voice | 05,07 | Confirmed commands/queries feed written replies; optional system TTS does not gate repository mutation; current Chat/App gate evidence in Phase07 report | Text/Voice/Both audibility, focus loss and rapid responses on phone pending | IMPLEMENTED COMMAND OUTPUT, DEVICE PENDING |
| F-013 | Rules first; ambiguity/contradiction safe | 07 | Exact grammar/JSON-shaped validation, refusal suite, expiring target/version/generation reviews; first text corpus62/64 and retained regression64/64, zero unsafe-ready proposals on32 refusal labels | Contradictory/misrecognized spoken inputs, exact date/target review and physical-device no-false-action checks pending | IMPLEMENTED, DEVICE PENDING |
| F-014 | Restart/reboot/permission/time recovery | 03,08 | Native stale/duplicate/source fencing, restore receivers and launch/resume reconciliation | Emulator outcomes separately logged; phone/OEM checks pending | IMPLEMENTED, DEVICE PENDING |
| F-015 | No internet/server dependency for offline core | 01–08 | OFF-01 import boundary/failed-adapter paths | Full lifecycle airplane mode/traffic review | PLANNED |
| F-016 | Bounded weekly classes with timezone semantics | 02,04 | Weekly form/domain/windowed-query DST fixtures PASS, even without reminders | Whole-series manual UI; phone review required | IMPLEMENTED, DEVICE PENDING, SHOULD |
| F-017 | Inspect/delete local data; export only if reviewed | 01,04 | Phase01 settings inspection/reopen implemented; full local-data deletion/export later | Full privacy walkthrough pending | PARTIAL, SHOULD |
| F-018 | Optional Gemini via secure backend | 09 | API-01 timeout/429/abuse/secret isolation | Opt-in/offline fallback after 08 review | DEFERRED |
| F-019 | Verified handbook sources/revision/pages/refusal | 10 | RAG-01 100+ reviewed citation/abstention cases | Adviser/source-rights review | DEFERRED |
| F-020 | Online handbook toggle/status/source UI | 10 | ONLINE-01 unavailable/offline/source display | Offline unavailable, true page/edition | DEFERRED |

| Cross-cutting scope | Gate/evidence | Current evidence |
|---|---|---|
| Low-end priority | Test 2–3 GB ARM64 Android11+ where available, ~4 GB reference and newer OS; report CPU/RAM/startup/battery | Confirmed user preference; no certified RAM floor/32-bit support |
| Performance | Same-device old/new cold/warm n/p50/p95/peak/failures, TTS quality, STT WER, alarms/battery | BASELINE NOT RUN; protocol in docs/benchmarks |
| Theme/accessibility | Central semantic light/dark tokens, keyboard/TalkBack/large font/manual states | Theme implemented; selected200% font emulator checks pass; physical/TalkBack pending |
| Architecture/quality | Strict TS, tested migrations/state machines, native instrumentation, documented contracts/ADRs, import checks | Phase07.1 preflight464 tests/28 suites and AST46 modules PASS; current62 JVM tests/7 inspected APKs and42 API37 functional instrumentation tests PASS; installed hash verified; integration restoration/evidence in Phase07.1 report; ADR-013–021 document boundaries. |
| Privacy/provenance | No credentials/private data/audio in repo; reviewed model/library terms and attribution | Source-owner authorization recorded; details/third-party review pending |
| Phase gating | One approved phase, factual report and explicit stop | Phase07 explicitly approved; owner separately authorized07.1 integration/audit; earlier physical-phone checks pending;08–11 unapproved |

Explicitly excluded: registration/login/accounts/passwords, business roles/team
management, subscriptions/paywall, unrelated LAFINA Skills, Gmail/account calendar
sync, meeting capture, document generation, generic autonomous agents, always-on
mic/wake word, official portal integration, whole-app/history/database/model copying,
and broad UI redesign. Kokoro is excluded from initial MVP. Gemini/RAG remain
post-08 only; no backend may become an offline dependency.

## Phase 01 evidence update

User approved Phase01 explicitly in natural language. The overview above retains
future phase ownership; only F-001/F-002 and part of F-017 have implementation.
[Phase01 report](../docs/reports/phase-01-report.md) distinguishes RNTL tests,
host SQLite, native compilation, emulator UI and physical-phone checks. F-015 has
foundation-only import/manifest evidence; the full offline gate remains Phase08.
No alarm, speech, scheduling or handbook requirement is marked implemented.

Later replace PLANNED only with actual code/test IDs, dated build SHA, result and
privacy-safe evidence/device model/API. Mocked native tests do not pass phone gates.

## Phase 02 evidence update

Owner reviewed Phase01 with screenshots and authorized Phase02, 2026-10-22.
The [Phase02 report](../docs/reports/phase-02-report.md) records actual automated,
native build and emulator results. F-014 has host process-death/SQLite recovery
coverage only; Android alarm reboot/reconciliation remains unimplemented. F-015
retains import/manifest evidence and no backend dependency; full offline core is
still a Phase08 gate. Host benchmarks do not resolve low-end phone uncertainties.
No screen capture establishes unknown phone model/API/RAM or unreported results.
