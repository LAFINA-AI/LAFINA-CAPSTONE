# 11 — Minimal Mobile UX / Onboarding / User Flows

## Design objective

Use the original LAFINA app as a reference for visual language and assets where compatible; **do not spend early phases making polished visuals**. Implement the smallest functional accessible Android UI and centralized semantic theme. Every screen should show correct states and enable user tests.

## Anonymous onboarding (no accounts)

1. Welcome: LAFINA student secretary, privacy and offline-first explanation, skip network sign-in because none exists.
2. Name optional and defaults to 'Student'; no email/password, no remote registration.
3. Choose default academic reminder lead time (e.g. 15 minutes), default snooze duration, preferred local timezone (autodetect), quiet hours, text/voice/both output.
4. Explain exact alarm/notification/full-screen limitations and request permission when relevant; defer microphone permission until first hold-to-talk to reduce onboarding friction.
5. TTS availability check: try installed offline voice, select locale, preview sound if ready; if missing, continue with text fallback.
6. Done -> Today dashboard. Completion persists through relaunch and airplane mode; onboarding may be re-opened for preferences. Data is not connected to other devices.

## Student onboarding redesign (2026-11-16, phase-16)

Supersedes the numbered list above for the current app. Reference prototype: `docs/design/onboarding-v3/` (copied read-only from the owner's v3 visualization; the HTML is a design reference, not app code).

Journey: Intro (4 pages, skippable; no records, mic or permission requests) → Name/tone → Student setup → Goal → Routine → Study/focus → Answer style → Reminder timing → Memory review → Ready → optional 3-step quick tour (Home → Schedule → AI), replayable from Profile.

Student setup is COR-first: **Set up my USTP COR**, **I'll add my COR later**, or **I'm not a USTP student**. There is no campus/program picker, no manual academic entry and no override. States:

| State | Meaning | School features |
|---|---|---|
| `ustp` + `confirmed` | A reviewed COR import was saved | On |
| `ustp` + `pending` / `needs_review` | Chosen USTP, COR not (yet) reviewed — including failed, cancelled or missing COR, and older installs with an unreviewed profile | Off (scheduling only) |
| `not_ustp` | Scheduling mode | Off; never asked for campus, program or COR |

`getUstpEligibility(userId)` (`src/storage/ustpEligibility.ts`) is the single decision used by onboarding, Profile, Calendar, chat, voice, handbook search, source viewers, online requests and async rechecks (`captureUstpEligibility`). **This is a client-side product gate, not university identity verification**: a COR read on the phone and reviewed by the student is not checked with USTP.

COR review keeps OCR output as a draft. Every subject and every meeting must be confirmed by the student; dates are chosen explicitly; a missing AM/PM or unclear day is never guessed; TBA subjects create no timed blocks. Saving is one SQLite transaction (blocks + `sync_outbox` + reviewed profile + setup state + ledger); re-imports are deduplicated by subject/session/term identity; undo reverses only the latest import.

### Local-only settings (no backend fields)

All live in `local_settings`, are never synced, and move with guest → account linking (`guestMigration`).

| Key | Scope | Holds |
|---|---|---|
| `student.setup.v1` | user | affiliation, COR status, confirmed import id, preferred name, tone, goal, answer style, which answers were explicit, memory choices, setup completion time |
| `onboarding.progress.v1` | user | in-progress page and answers (resume after Back/interruption); cleared on completion |
| `onboarding.intro_seen.v1` | device | intro was shown on this phone |
| `onboarding.memory.v1` | user | ids of memories created by onboarding (so they can be refreshed/removed) |
| `cor.draft.v1` | user | the current COR review draft (owner-checked) |
| `cor.import.ledger.v1` | user | last 12 imports with block entries and previous profile/setup, for dedupe and undo |
| `academic.profile.v1` | user | existing key; now carries `provenance: {source: 'cor_review', importId}` for reviewed imports |
| `product_tour` | user | existing tour-seen flag |

Skipped answers stay unknown (not written to preferences); defaults are distinguishable from explicit choices via `explicit`. Tone and answer length shape online replies only; offline replies do not yet vary length. Academic memory is created only from a confirmed COR and never includes student number, registration number, age, gender or nationality.

## Navigation (minimum)

Tabs: **Today**, **Calendar**, **Chat**, **Settings**. Today = upcoming events/reminders and quick create; Calendar = dated and weekly views; Chat = text + press/hold mic; Settings = local profile, reminder, speech and privacy controls; USTP handbook entry added only Phase 10 and clearly labelled online.

## Important UI flows

### Manual event/reminder
`Today/Calendar -> + -> Task/Event -> title/due/time/reminder lead -> Save -> stored locally -> Android alarm scheduled -> overview updates`

### Chat voice schedule
`Chat -> press mic -> see recording state -> speak -> release -> transcript -> local intent -> validate & confirm -> store -> immediate text reply -> optionally speak with system TTS`

### Proactive simulated call
`OS alarm -> ring/vibrate + allowed FSI/heads-up -> student taps Answer -> call-style screen -> fast TTS announcement + on-screen message -> tap Acknowledge or Snooze or hold mic to respond -> DB update + cancel/reschedule -> close`; if no permission/show, notify normal and surface capability warning.

### Handbook (post-Phase 08)
`Chat/Handbook -> explain online requirement/consent -> ask USTP policy question -> backend retrieve -> verify -> Gemini summarize with page/edition -> show source links`; if offline, index missing, insufficient evidence -> refuse with clear message and do not improvise.

## Accessible UI states

Every feature has idle, loading/recording, success, empty, denied permission, timeout, unavailable, and recovery states. TTS playback must not lock navigation; voice can be stopped. Buttons are always available even if AI fails. Full-screen call UI supports large text, TalkBack labels, quiet/dismiss action; no dark-pattern 'must answer' lock screen. Chat and calendar support keyboard and local 12/24-hour date formatting.

## Theme system minimum

`theme/colors.ts` semantic names (`background`, `surface`, `text`, `muted`, `primary`, `danger`, `success`, `border`), `spacing.ts`, `typography.ts`, `radii.ts`; dark/light variants. Components use theme hooks, no one-off arbitrary colors. Avoid gradients and costly animation until performance testing supports them.
