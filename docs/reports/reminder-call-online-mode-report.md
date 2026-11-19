# Reminder call: online conversation without Acknowledge/Snooze — Completion Report

**Branch / base commit:** written on `feature/lafina-floating-assistant` @ `0082d1c`; committed as `458ca1e` on `feature/cor-accuracy-calendar-call-updates`
**Date/time UTC:** 2026-11-18
**Device(s) available:** NONE (owner's phone was not connected; owner will test on return)
**Status:** `AWAITING DEVICE VALIDATION`
**Approval provenance:** owner chat request 2026-11-18: "remove the acknowledge or snooze if the user is online but leave as is if the user is using the offline mode … use the default lafina call feature we have in the chat but its the call reminder … plan and implement it without stopping."

## 1. Scope completed

How students realistically use the reminder call, and what this change does about it (decision record: [ADR-038](../decisions/ADR-038-online-reminder-call-without-buttons.md)):

| Real use | Online call (new) | Offline call (unchanged) |
|---|---|---|
| "Okay, thanks" / just hang up | Say it, or tap **End**. Both count as **received** (acknowledged, task not completed). | Acknowledge button, End, or say "acknowledge". |
| Needs more time | Say "call me back in 20 minutes" / "remind me later" (uses their usual snooze length), or type it with **Type**. | Snooze button and 5/10/15/30m chips, or say "snooze". |
| Can't talk right now | Decline while ringing (rings again later), or answer and use **Type**. | Buttons. |
| Talk it through ("what's due today?", "move it to 7 PM") | Online conversation; planner changes still appear as review cards that need Confirm. | Not available offline. |

Newly implemented:

- **Online answered view** `OnlineReminderCallView`, drawn like Call LAFINA (SynthWave avatar ring, timer + "Ends in", status line, live waveform, Mute / Type / Stop / End dock). **No Acknowledge or Snooze buttons.** Footnote: "Need more time? Say 'call me back in 15 minutes'. Hanging up counts the reminder as received."
- Ringing screen sub-label under Answer reads "Talk with LAFINA" when Online Mode is on, "Hear the reminder" otherwise.
- Answer opens straight into the online view ("Connecting…") when Online Mode is on for a signed-in account, so the buttons do not flash while the network, consent and microphone checks run.
- Every fallback returns to the **offline call with its buttons**: Online Mode off, guest, no internet, "Use offline voice" in the disclosure, microphone denied, app left the screen during setup, online startup failure, connection lost (also resumes offline voice when on screen), 2-minute inactivity stop, or a failed spoken acknowledge/snooze.
- **Online opening line:** "Hi, it's lafina. Your reminder: "…". Need more time? Just tell me when to call you back. Otherwise, hang up whenever you're ready." The offline line (mentions on-screen choices) is unchanged. The pre-cast offline audio is no longer used as the online fallback because its words name buttons this screen does not have.
- **Agent context** now says the screen has no buttons, never to tell the student to tap one, hanging up counts as received, and gives the student's usual snooze length for "remind me later". A `snooze_reminder` call without minutes uses that length (was a fixed 10).
- **10-minute limit, online:** if the student said or typed anything, the call ends as received (same as End) instead of auto-snoozing. Silent online calls and all offline calls keep the automatic snooze.

Refactored: `OnlineReminderConversation` is headless (draws nothing) and exposes `setMuted`, `stopResponse`, `sendText`; `CallResultView` extracted from `CallAnsweredView` and shared by both views.

Not changed: backend, schema, sync, native Android code, permissions, dependencies, alarm scheduling, offline voice flow.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `src/ui/components/call/OnlineReminderCallView.tsx` (new) | Call-LAFINA-style answered online reminder call | Owner request | `onlineReminderCall.test.tsx` "online reminder call: a conversation, not buttons" |
| `src/ui/screens/IncomingCallScreen.tsx` | `onlineView` state; online vs offline view; fallbacks; Mute/Stop/Type handlers; time-limit rule; ringing sub-label | Show online view only while the online conversation can run | `onlineReminderCall.test.tsx`, `reminderCallScreenAudit20261116.test.tsx` |
| `src/ui/components/call/OnlineReminderConversation.tsx` | Headless; handle gains mute/stop/typed turn; `snoozeMinutes` prop | UI now drawn by the new view | `onlineReminderConversation.test.tsx` |
| `src/ui/components/call/CallAnsweredView.tsx` | `CallResultView` extracted (no behaviour change) | Shared result display | existing call screen tests |
| `src/scheduler/callDispatcher.ts` | `buildOnlineAnnouncement`; `prepareCallSpeech(…, online)`; online call speaks it | No on-screen choices to point at | `callDispatcherAndCallScreen.test.tsx` |
| `src/cloud/voiceConversation/controller.ts` | `reminderCallContext(task, defaultSnoozeMinutes?)` wording | Agent must not mention buttons | `voiceConversationController.test.ts` |
| `__tests__/…` (4 files) | Updated to new behaviour; 12 new tests | Coverage | see section 3 |
| `docs/MANUAL-PHONE-TESTING.md` | INC-14 note; new INC-28 to INC-33 | Phone checks | — |
| `docs/qa-provider-testing.md`, `docs/decisions/ADR-038-…` | Behaviour description, decision record | Docs | — |

## 3. Tests and real outcomes

| Check | Command | Result | Evidence |
|---|---|---|---|
| Typecheck | `npm run typecheck` (in preflight) | PASS | `docs/reports/evidence/reminder-call-online/preflight.log` |
| Lint | `npm run lint` (in preflight) | PASS | same |
| Jest (full) | `npm test` (in preflight) | PASS — 160/160 suites, 2170 passed, 1 skipped | same |
| Architecture check | `npm run check:architecture` (in preflight) | PASS — 399 modules, 0 import cycles, 0 forbidden deps | same |
| Re-run after last edit (typecheck, lint, 5 call suites) | `npx tsc --noEmit && npx eslint src __tests__ --max-warnings 0 && npx jest …call suites` | PASS — 58/58 | `docs/reports/evidence/reminder-call-online/call-suites-rerun.log` |
| Android JS bundle (release) | `npx react-native bundle --platform android --dev false --entry-file index.js …` | PASS (exit 0) | `docs/reports/evidence/reminder-call-online/android-js-bundle.log` |
| Gradle | `gradlew :app:testDebugUnitTest` (JDK 17) | PASS — BUILD SUCCESSFUL (no native change in this task) | `docs/reports/evidence/reminder-call-online/gradle-unit.log` |
| Device manual | INC-28 to INC-33 | **NOT RUN** (no device connected) | — |

Jest proves screen logic with the scheduler and conversation mocked. It does **not** prove audio, ElevenLabs, the microphone, alarms or the look on a phone.

## 4. Performance and device matrix

N/A for automated checks. One extra re-render path: the call screen now re-renders on each conversation snapshot (as the Call LAFINA panel already does). Smoothness on a mid-range phone is NOT RUN.

## 5. Reliability, privacy, permissions, licenses

- No new permission, network call, data sent, or dependency. The online disclosure and consent flow is unchanged.
- Risk: a student in an online call who cannot speak must use Type or End (End = received). Decline before answering still snoozes.
- Risk: the online view relies on the conversation reporting `restart_required`/`failed` to fall back; the controller does this for connection loss, backgrounding, audio focus loss, inactivity and provider errors.
- "Acknowledged" still means the alert was received, never that the task is done.

## 6. Human phone verification

See the checklist in the chat handoff and `docs/MANUAL-PHONE-TESTING.md` INC-28 to INC-33 (plus INC-14).

## 7. Docs/ADRs changed

`docs/decisions/ADR-038-online-reminder-call-without-buttons.md`, `docs/MANUAL-PHONE-TESTING.md`, `docs/qa-provider-testing.md`.

## 8. Open items

1. Device validation (INC-28 to INC-33).
2. Owner decision to confirm: online 10-minute limit acknowledges when the student talked (ADR-038 item 6). Easy to revert to auto-snooze if preferred.

## 9. Review decision

- [x] All automated required checks passing
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change
- [ ] Report accurate, links validated, docs updated

`STATUS: AWAITING DEVICE VALIDATION`
