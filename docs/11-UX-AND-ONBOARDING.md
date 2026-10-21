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
