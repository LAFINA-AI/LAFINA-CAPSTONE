# Requirements-to-phase traceability — through Phase01

Updated for Phase01, 2026-10-21 Asia/Manila. F-001/F-002 now have implementation,
automated and emulator evidence; physical-device acceptance is still pending.
Future test IDs remain planned, not executed tests. Phase ownership does not grant
approval. F-001–F-015 remain offline MUSTs. No physical phone has been tested; a
temporary read-only API37 emulator supplied the separately labeled smoke evidence.

| ID | Confirmed scope | Owner phase | Planned automated evidence | Human/device evidence | Status |
|---|---|---:|---|---|---|
| F-001 | Anonymous offline onboarding; no account | 01 | App.test.tsx completion/retry/validation tests PASS | Release preview offline emulator exercised; physical phone pending | IMPLEMENTED, DEVICE PENDING |
| F-002 | Local theme/voice/lead/snooze/quiet-hour preferences | 01 | App.test.tsx + storage.test.ts real host-SQLite reopen/failed-write tests PASS | Native emulator persistence exercised; physical phone pending | IMPLEMENTED, DEVICE PENDING |
| F-003 | Manual task/event CRUD | 02,04 | CRUD-01 real DB/validation/rollback | Offline create/edit/delete/relaunch | PLANNED |
| F-004 | Calendar/agenda reflects mutations | 04 | CAL-01 query/UI integration | Inspect local dates and updates | PLANNED |
| F-005 | Reminder/job create/update/cancel | 02,03 | JOB-01 atomicity/generation/reconcile | Edit/delete around due time | PLANNED |
| F-006 | Native due notification/alarm within OS limits | 03,08 | ALM-01 native args/identity/capability | Locked/background/idle/API/OEM drift | PLANNED |
| F-007 | Conditional simulated-call UI + notification fallback | 03,04 | CALL-01 denied FSI/notification states | API30/33/34+ permission matrix | PLANNED |
| F-008 | ACK independent of completion; atomic snooze | 02,04,08 | STATE-01 legal transitions/duplicates/faults | Button ACK/snooze with speech failed | PLANNED |
| F-009 | Validated offline typed scheduling commands | 07 | CMD-01 parser/validator/executor | Airplane-mode command-to-record | PLANNED |
| F-010 | Visible hold-to-talk offline STT | 06 | STT-01 session/denial/stale/cancel; WER | Low-end/newer offline accents/noise | PLANNED |
| F-011 | Android system offline-capable TTS default | 05 | TTS-01 readiness/voice/error/cancel | Audibility in airplane mode/missing voice | PLANNED |
| F-012 | Immediate durable text reply; optional voice | 05,07 | REPLY-01 text not awaiting TTS | Text/voice/both, audio-focus loss | PLANNED |
| F-013 | Rules first; ambiguity/contradiction safe | 07 | SAFE-01 no false ACK/delete/wrong time | Review contradictory spoken commands | PLANNED |
| F-014 | Restart/reboot/permission/time recovery | 03,08 | REC-01 stale events/reconcile/crash windows | Reboot/process death/force-stop limits | PLANNED |
| F-015 | No internet/server dependency for offline core | 01–08 | OFF-01 import boundary/failed-adapter paths | Full lifecycle airplane mode/traffic review | PLANNED |
| F-016 | Bounded weekly classes with timezone semantics | 02,04 | RR-01 BYDAY/DST/travel/uniqueness | Verify recurring class instances | PLANNED, SHOULD |
| F-017 | Inspect/delete local data; export only if reviewed | 01,04 | Phase01 settings inspection/reopen implemented; full local-data deletion/export later | Full privacy walkthrough pending | PARTIAL, SHOULD |
| F-018 | Optional Gemini via secure backend | 09 | API-01 timeout/429/abuse/secret isolation | Opt-in/offline fallback after 08 review | DEFERRED |
| F-019 | Verified handbook sources/revision/pages/refusal | 10 | RAG-01 100+ reviewed citation/abstention cases | Adviser/source-rights review | DEFERRED |
| F-020 | Online handbook toggle/status/source UI | 10 | ONLINE-01 unavailable/offline/source display | Offline unavailable, true page/edition | DEFERRED |

| Cross-cutting scope | Gate/evidence | Current evidence |
|---|---|---|
| Low-end priority | Test 2–3 GB ARM64 Android11+ where available, ~4 GB reference and newer OS; report CPU/RAM/startup/battery | Confirmed user preference; no certified RAM floor/32-bit support |
| Performance | Same-device old/new cold/warm n/p50/p95/peak/failures, TTS quality, STT WER, alarms/battery | BASELINE NOT RUN; protocol in docs/benchmarks |
| Theme/accessibility | Central semantic light/dark tokens, keyboard/TalkBack/large font/manual states | Theme implemented; selected200% font emulator checks pass; physical/TalkBack pending |
| Architecture/quality | Strict TS, tested migrations/state machines, native instrumentation, documented contracts/ADRs, import checks | Foundation TS/import checks pass; ADR-013 added; migrations/future state machines remain later; Graphify NOT RUN |
| Privacy/provenance | No credentials/private data/audio in repo; reviewed model/library terms and attribution | Source-owner authorization recorded; details/third-party review pending |
| Phase gating | One approved phase, factual report and explicit stop | Phase01 approved;02–11 unapproved |

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
