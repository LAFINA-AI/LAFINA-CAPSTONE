# 01 — Product Requirements, Traceability and Definition of Done

## Actors

- **Student / local device owner:** single default anonymous local profile; no login.
- **Android OS:** alarm delivery, permissions, offline TTS/STT service, clock/timezone changes, audio focus.
- **Optional online backend (after Phase 08):** Gemini proxy and handbook retrieval. Never required for reminders.

## Functional requirements with stable IDs

| ID | Priority | Requirement | Primary acceptance evidence |
|---|---|---|---|
| F-001 | MUST | First launch onboarding; no account, no internet requirement | Fresh-install airplane-mode recording |
| F-002 | MUST | Persist local preferences incl. theme, voice reply mode, default snooze/lead time, notification prefs | Cold restart test |
| F-003 | MUST | Manually create/edit/delete task and scheduled event with title, description, start/due date/time | CRUD tests + manual UI |
| F-004 | MUST | Calendar/agenda lists scheduled items and reflects mutations | UI integration test |
| F-005 | MUST | Create/update/cancel reminders for scheduled items (default lead minutes, exact time; optional recurrence) | DB + alarms integration tests |
| F-006 | MUST | Native alarm/notification triggers at due time within platform/permission limits | Physical-device alarm matrix |
| F-007 | MUST | Call-style full-screen/headsup UI where allowed; visible actions and notification fallback | Android 11, 13/14+ permission matrix |
| F-008 | MUST | Acknowledge reminder without completing underlying task; snooze re-queues atomically | State-machine and fault tests |
| F-009 | MUST | Text-based structured commands create/retrieve/update scheduling records locally | Airplane-mode end-to-end |
| F-010 | MUST | Hold-to-talk voice input, release to transcribe on device if an offline engine available | Real-device offline STT and permission tests |
| F-011 | MUST | Native Android offline-capable TTS as default, with text fallback | Offline voice test and diagnostics |
| F-012 | MUST | App message can display text immediately and optionally read response aloud | UI + audio focus tests |
| F-013 | MUST | Fast path for clear intents; offline model optional for complex requests; ambiguity -> clarify | Command dataset, no false auto ACK |
| F-014 | MUST | Interrupted/remissed alarms, restarts and permission change reconciled safely | Fault injection and reboot QA |
| F-015 | MUST | No external account, server, mobile data, or cloud for F-001 through F-014 | Airplane mode, traffic audit, fresh install |
| F-016 | SHOULD | Weekly recurring class/reminder rules with timezone-aware occurrence generation | recurrence fixture tests |
| F-017 | SHOULD | Student can inspect/delete local data, export locally if privacy reviewed | privacy walkthrough |
| F-018 | POST-OFFLINE | Opt-in online Gemini via backend with timeout and offline graceful fallback | Phase 09 API tests |
| F-019 | POST-OFFLINE | USTP handbook RAG with source page/version, relevant evidence and unsupported-query refusal | Phase 10 100+ case eval |
| F-020 | POST-OFFLINE | Clear source/toggle/status UI for online handbook feature | airplane mode and UI tests |

## UX stories

The owner's Phase07.1 Nol-reference follow-up adds a local Notes screen and
Chat/Calendar/Notes/Profile shell under [ADR-022](decisions/ADR-022-nol-ui-local-notes.md).
Notes support explicit CRUD/search/pin/Personal–Coursework categories and retain
local privacy semantics; Profile uses actual task/note counts and saved calendar
display choices. These supplementary UI functions do not create an account,
authorize cloud services or replace any existing stable requirement ID. Full
export/purge and physical-device acceptance remain separate gates; current
evidence is in [the follow-up report](reports/phase-07-1-nol-ui-report.md).

- As a student, I can open the app without signing up and immediately create a reminder in airplane mode.
- As a student, I can hold the microphone, say a date/time command, release and review a recognized transcript; ambiguous dates ask me to confirm before saving.
- As a student, I can hear 'You have a class in 15 minutes' through a call-like alert and snooze or acknowledge even if speech processing fails.
- As a student, I can see a week of classes and one-off tasks using a calendar without connecting a university account.
- As a student, I can ask 'What does the USTP handbook say about academic honors?' and get a sourced, appropriately scoped answer **when online**, or an explicit unavailable notice **when offline**.

## Noteworthy semantic acceptance rules

- ACK is confirmation that alert was seen; COMPLETE is separate explicit task action.
- Alert delivery success is different from content acknowledgment; missed call, dismissed notification, and denied permission are distinct states.
- Date/time parsing must distinguish local timezone, 12h/24h clock, 'tomorrow', weekdays, past times, daylight-saving crossing if device timezone changes, and explicit user edits. No silent guess.
- An ambiguous voice command must never create/update/delete data silently; present transcript/confirmation.
- Race between alarm broadcast and reminder delete/edit must not show stale alert as current action.

## Required test policy

Every MUST has at least one automated test and, where the Android OS/audio is involved, one documented physical-device test. Trace requirement ID -> code -> test ID -> measured result -> phase report. Use `qa/REQUIREMENTS-MATRIX.md` as living traceability source.

## Definition of complete capstone

Offline gate passed, online RAG evaluated on approved USTP documents, reproducible experiments show measured differences, UX usable with permissions/accessibility, critical failures documented/resolved, advisor-reviewed research/ethics, accurate docs and clean release artifact. A green test suite alone is not enough.
