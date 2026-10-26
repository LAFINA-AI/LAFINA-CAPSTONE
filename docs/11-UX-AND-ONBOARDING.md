# 11 — Minimal Mobile UX / Onboarding / User Flows

## Design objective

Use the original LAFINA app as a reference for visual language and assets where compatible; early phases prioritize working offline controls. The owner-approved Phase07.1 follow-up now matches the Nol screenshot composition around those controls, with one semantic theme. It does not authorize unrelated redesign or incoming accounts/cloud modules. Every screen should show correct states and enable user tests. See [ADR-022](decisions/ADR-022-nol-ui-local-notes.md).

## Anonymous onboarding (no accounts)

1. Welcome: LAFINA student secretary, privacy and offline-first explanation, skip network sign-in because none exists.
2. Name optional and defaults to 'Student'; no email/password, no remote registration.
3. Choose default academic reminder lead time (e.g. 15 minutes), default snooze duration, preferred local timezone (autodetect), quiet hours, text/voice/both output.
4. Explain exact alarm/notification/full-screen limitations and request permission when relevant; defer microphone permission until first hold-to-talk to reduce onboarding friction.
5. TTS availability check: try installed offline voice, select locale, preview sound if ready; if missing, continue with text fallback.
6. Done -> Calendar. Completion persists through relaunch and airplane mode; onboarding may be re-opened through Profile's preferences. Data is not connected to other devices.

## Navigation (minimum)

Current reference shell: **Chat**, **Calendar**, **Notes**, **Profile**, with a central microphone button. Chat has the Assistant empty state, composer and explicit action review; Calendar has Month/Week selection, a paged day timeline and validated manual editors; Notes has local search/filter/pin and explicit save/delete; Profile has anonymous identity, real saved counts and existing settings panels. Today agenda functionality remains part of planner controls rather than a fifth dock tab. The central mic opens the visible speech panel without recording. USTP handbook UI remains deferred until its separately approved online phase.

Dirty planner/note/preferences routes guard tab, central mic and Android Back navigation. Note drafts are not auto-saved; failed saves retain entered text. Empty, error and unavailable counts are explicit, without invented voice-use statistics or a working transcription category. Clock-format and first-weekday choices persist independently of stored scheduling times.

## Important UI flows

### Manual event/reminder
`Calendar -> + -> Task/Event -> title/due/time/reminder lead -> Save -> stored locally -> Android reconciliation or visible delivery warning -> overview updates`

### Chat voice schedule
`Chat/central mic -> visible speech panel -> explicit hold -> speak -> release -> editable transcript -> Use draft in chat -> Send -> validate/review -> Confirm change -> store -> immediate text reply -> optional system TTS`

### Local note
`Notes -> + -> title/text/category/pin -> Save note -> durable local record`; opening a saved note allows version-checked edits or confirmed deletion. Search treats punctuation literally and pages at most20 notes. Import/export, attachments and automatic AI transcription are not exposed as working actions.

### Proactive simulated call
`OS alarm -> eligible FSI/heads-up or notification fallback -> visible reminder/message with optional system TTS -> explicit Answer/ACK or Snooze -> paired durable outcome + native reconciliation`; when delivery is restricted, surface the capability warning without claiming receipt.

In the retained implementation, Answer itself durably acknowledges the alert,
leaves the task incomplete, and may offer a separate visible local dictation
draft. That optional draft does not execute scheduling commands automatically.

### Handbook (post-Phase 08)
`Chat/Handbook -> explain online requirement/consent -> ask USTP policy question -> backend retrieve -> verify -> Gemini summarize with page/edition -> show source links`; if offline, index missing, insufficient evidence -> refuse with clear message and do not improvise.

## Accessible UI states

Every feature has idle, loading/recording, success, empty, denied permission, timeout, unavailable, and recovery states. TTS playback must not lock navigation; voice can be stopped. Buttons are always available even if AI fails. Full-screen call UI supports large text, TalkBack labels, quiet/dismiss action; no dark-pattern 'must answer' lock screen. Chat and calendar support keyboard and local 12/24-hour date formatting.

## Theme system minimum

The implemented central `core/theme/theme.ts` owns semantic colors, spacing,
type and dimensions, including reference accent/brand/profile-gradient roles.
Components use the same theme hook for light/dark variants. Small local SVG
outlines and a static Profile gradient reproduce the approved reference; no
remote SVG, animation daemon or new speech engine is introduced. Rendering/build
evidence is separate from unmeasured physical-phone performance and TalkBack QA.
