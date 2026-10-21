# 00 — Project Charter and Non-Negotiables

## Identity

**Product:** LAFINA-CAPSTONE — student-focused offline-first conversational scheduling assistant, initially for USTP students on Android. **Not** the commercial LAFINA business product. **Stage:** greenfield *repository* with *legacy reference code available*, not a mandate to rewrite every component.

## One-line goal

Reliable student scheduling and proactive call-like alarms, accessible through manual controls and optional voice, with offline STT, low-latency TTS and structured local AI; afterward, a secure online USTP handbook question-answering service with verifiable sources.

## Capstone novelty / evaluation question

How much does a **lightweight hybrid voice-processing pipeline**—Android built-in offline-capable TTS, adaptive offline STT, fast deterministic intent dispatch, and modular fallbacks—improve response latency, peak memory, battery overhead, task completion, and usability over the old Kokoro-centric pipeline, while maintaining alarm reliability and scheduling correctness? Secondary objective: verify trustworthy handbook RAG with page-accurate citations and abstention.

Do **not** promise a specific percentage improvement before benchmarking. Compare a pinned legacy revision with the capstone version on same hardware and conditions. Distinguish engineering improvement from new research contribution; seek adviser sign-off on research instruments and scope.

## Immutable MVP scope

1. Local anonymous onboarding / local profile (optional display name, timezone auto detect, academic reminder defaults, notification/audio permissions at appropriate time). No account creation.
2. Local events, tasks, due times, reminder lead times, snooze, recurrence as agreed (weekly class recurrence prioritized), calendar agenda/day/week/month view as feasible, with text/manual CRUD.
3. OS-scheduled alert, simulated call-style notification/UI with Answer / Snooze / Dismiss; after answer, optionally listen via push-to-talk. User accessible button fallback at all times.
4. Fast local STT / TTS; text output should not wait on audio. Voice/text/both setting. Offline AI with safe structured intents for scheduling.
5. Offline without network at any time. Handle cold start, app background, permission denial, reboot/recovery and conflicts within platform limits.
6. Minimal functional UI, original styling as reference, scalable theme foundation; avoid large UI redesign.

## Post-MVP scope

- Online Gemini via backend **opt-in**, never API key from APK.
- Official USTP Student Handbook Q&A through vetted PDF ingestion, search/reranking, grounded answer, printed-page citation and revision manifest; online RAG may be unavailable offline and must say so.
- Research evaluation, final capstone deliverables and evidence.

## Strict exclusions

Business version: company/admin/employee roles, invites, billing, shared organization calendars, timesheets, work assignments, business chat, CRM, LAFINA Skills, meeting recording, Gmail integrations. Student edition also excludes institution-login integration, auto scraping portals, automatic email parsing, watchful always-on microphones, extensive file-generation tools, and generic AI agent autonomous execution. Do not import associated database tables/backend features.

## Stakeholder and release gates

- Developers: student capstone team + Codex.
- Adviser: confirms scope, approved USTP policy corpus, research evaluation methodology and privacy requirements.
- Testers: consenting students with diverse Android phones.
- Human project owner approves each phase separately. Automated tools are insufficient to certify device behavior.

## Scope deviations

Any later request to add a feature must produce a change request with value, risk, dependencies, added data retention, test cases, performance cost and phase impact. No silent expansion or partial implementation.
