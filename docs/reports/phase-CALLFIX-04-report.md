# PHASE CALLFIX-04 — Reminder call: one spoken change, faster online connect / Completion Report

**Branch / commit SHA:** `main` @ `340e83c` + uncommitted working tree (not committed)
**Date/time UTC:** 2026-11-24T10:30Z
**Device(s) available:** NONE in this session
**Status:** `AWAITING DEVICE VALIDATION`
**Phase approval provenance:** owner, 2026-11-24: "proceed and fix all" (after the reminder-call audit in the same conversation)

## 1. Scope completed

The problems, reproduced before the fix with the real parser and planner on node:sqlite:

1. **LAFINA asked the student to repeat a change she had already heard.** In an online reminder call:
   - every agent planner tool (`prepare_lafina_action`, `confirm_draft`, …) was refused with *"Ask the student to say the change they want"*;
   - the device's own reading of "move it to 7 PM" became `update_task` targeting a task named **"It"** (*"I could not find a task matching 'It'"*);
   - a third message (the card-claim check) told the agent to *"Ask the student to say the change again"*.
2. **Some phrases turned into junk new tasks.** "Push it to 8 PM" and "Call me back at 8" became new tasks named "Push It" and "Call Me Back". "Move my reminder to 7 PM" and "Change the reminder to 6 PM" were ignored completely.
3. **The online connection was slow.** The online conversation only began after the app had finished reading the reminder aloud (about 6–8 s), and then made its backend requests one after another.

What was fixed:

- **F1: "it" means the ringing reminder.** New pure helper `parseRingingReminderChange` reads "move/reschedule/push/change it|this|the reminder to <time/day>", "call me back / remind me again at <time>":
  - a call-back within 120 minutes is a snooze (the call ends, as with "call me back in 20 minutes");
  - anything later becomes a **Move reminder** review card for exactly that reminder (through `prepareReviewedCommand` with `ringingCall`);
  - "move it" with no time asks only *"When should the reminder ring instead?"*;
  - a time already past today is read as the next one;
  - other items ("move my quiz task"), creating something new, questions and plain talk are left alone.
- **F2: one reading per student turn.** The call screen reads each turn once and stores the result. The agent's planner tools now go to the call screen (`onPlannerTool`) instead of being refused. They wait for that same reading (up to 8 s) and answer with what is on screen ("Review card is now on screen: Move reminder …"). The model's tool arguments never write anything.
  - `confirm_draft` and `cancel_draft` report the student's own spoken or tapped decision; they never save by themselves.
  - If the device found no planner request but the agent did, the planner runs once on the same words. The worst outcome is a card the student still has to confirm.
- **F3: no more "say it again".** The three repeat instructions now describe what is on screen. When a detail such as the time is missing, LAFINA asks only for that detail. The start-of-call context also tells the agent that "it" means this reminder.
- **F4: connect while the reminder is read aloud.**
  - New `beforeAudio` hook on `VoiceConversationController` (passed through `useVoiceConversation` and `OnlineReminderConversation`). The controller makes the server session (capabilities, then createSession) at once and waits before opening the microphone and speaker.
  - The call screen mounts the online conversation as soon as Answer passes its checks, not after `answerCall` finishes reading. Audio opens when the reading ends (capped at 20 s).
  - Ending during the reading closes the server session and never opens audio.
  - A connection failure during the reading starts offline voice only after the reading ends.
- **F5: tests** for all of the above (section 3).

Not changed: what decides online vs offline (signed in, Offline Mode not picked, Call LAFINA agreement, connection, `auto_online`). The audit found it already correct; the slowness was the wait described in problem 3. Nothing was changed in the backend.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `src/ai/nlu/ringingReminderChange.ts` (new) | Reads a spoken change to the ringing reminder (snooze / reschedule / ask_time) | F1 | `reminderCallChangeFlow.test.tsx` (22 phrase cases) |
| `src/ui/screens/IncomingCallScreen.tsx` | One `TurnReading` per turn; `handlePlannerTool`; ringing-reminder moves via `prepareReviewedCommand`; no-repeat wording; greeting gate + early mount; fallback after the reading | F1–F4 | `reminderCallChangeFlow.test.tsx`, `reminderCallScreenAudit20261116.test.tsx`, `onlineReminderCall.test.tsx` |
| `src/ui/components/call/OnlineReminderConversation.tsx` | Routes planner tools to `onPlannerTool`; passes `beforeAudio`; new `REMINDER_CALL_WRITE_NOTE` wording. The large diff is mostly Prettier re-indenting the existing `forwardRef` body | F2, F3, F4 | `onlineReminderConversation.test.tsx` |
| `src/cloud/voiceConversation/controller.ts` | `beforeAudio` dep, awaited after the session is created and before `transport.start`; reminder context explains "it" and forbids asking for a repeat | F3, F4 | `voiceConversationController.test.ts` (3 new) |
| `src/ui/hooks/useVoiceConversation.ts` | Passes `beforeAudio` to the controller | F4 | same |
| `__tests__/scheduler/reminderCallScreenAudit20261116.test.tsx` | Wording only: "Review card is now on screen", "No card is on screen" | F3 | — |

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | Result | Evidence path / error |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit -p .` | PASS for this change; see note | Note: during the run, another session's uncommitted edits to `src/ui/theme/palettes.ts` / `src/storage/modernThemeStore.ts` made `__tests__/CustomTabBar.test.tsx(205)` fail with TS2740 (missing new AI-button design ids). That error is not from this phase; those files were not touched. |
| Lint | `npx eslint src __tests__ App.tsx index.js --max-warnings 0` | PASS | console |
| Architecture | `npm run check:architecture` | PASS (523 modules, 0 cycles, 0 forbidden deps, 124 offline leaves clean) | console |
| Targeted Jest | `npx jest __tests__/scheduler/reminderCallChangeFlow.test.tsx __tests__/scheduler/onlineReminderCall.test.tsx __tests__/scheduler/reminderCallScreenAudit20261116.test.tsx __tests__/ui/chatAndCallAuditFixes20261121.test.tsx __tests__/scheduler/onlineReminderConversation.test.tsx __tests__/cloud/voiceConversationController.test.ts` | PASS | console |
| Full Jest | `npx jest --runInBand` | 229/231 suites, 3158 passed, 3 failed, 1 skipped (413 s). The 3 failures are all in `__tests__/ModernColorThemes.test.tsx` and `__tests__/CustomTabBar.test.tsx`, which belong to the other session's uncommitted theme work (those test files and `palettes.ts` / `modernThemeStore.ts` were being changed during the run). This phase did not touch them. Every call, voice and planner suite passed. | `docs/reports/logs/callfix-04/jest-full.log` |
| Android build | `gradlew` | NOT RUN: JavaScript/TypeScript-only change, no native, manifest or Gradle file touched | — |
| Device manual | Section 6 | HUMAN REQUIRED | — |

## 4. Performance and device matrix

No device was available, so there are no timings. The expected gain is that the server session setup (capabilities + createSession, two backend round trips) now overlaps the 6–8 s reading instead of following it. Only the WebSocket/audio start remains after the reading. To measure it, run `adb logcat | grep "connected in"` (the controller logs server and audio milliseconds) on the old and new builds. Baseline and new numbers: NOT RUN.

## 5. Reliability, privacy, permissions, licenses

- No new permissions, network endpoints or data sent. The student context and the reminder text are unchanged.
- The microphone still opens only after Answer, OS permission and the Call LAFINA agreement. The session made during the reading opens no audio until the reading ends.
- Nothing is saved without the student: a move is a review card, and `confirm_draft` reports the student's decision instead of saving. A call-back within 2 h snoozes, the same rule the existing "call me back in 20 minutes" already followed.
- Risk: the controller's AppState listener can still stop the conversation if the app leaves the screen during the reading. That is the same behavior as before, then shown with the offline buttons.

## 6. Human phone verification

Build: `npm run android` (debug) or a release APK. Preconditions: signed-in account, Call LAFINA agreed once, Offline Mode not picked in Chat, Wi-Fi or data on.

1. Create a reminder 2 minutes from now and wait for the call. Tap **Answer**.
   - Expected: "LAFINA is reading your reminder…" while the reminder is read, then the online conversation is ready almost immediately afterwards (no long "Connecting to LAFINA…").
   - Log: `adb logcat | grep "connected in"`.
2. Say **"Move it to 8 PM"** (or "Move this reminder to tomorrow at 9 AM").
   - Expected: a **Move reminder** card for that reminder appears once. LAFINA describes it and asks you to confirm. She does **not** say she couldn't prepare it, and does not ask you to say it again.
3. Say **"Confirm"**. Expected: LAFINA says it is saved, and the reminder shows the new time in Calendar.
4. On a new call, say **"Can you move it?"**. Expected: LAFINA asks only *when*.
5. On a new call, say **"Call me back at <a time 30 minutes from now>"**. Expected: the call ends and rings again about 30 minutes later.
6. Say **"Push it to 9 PM"**. Expected: a Move reminder card. **No** new task named "Push It".
7. Turn off Wi-Fi and data, then repeat step 1. Expected: an offline call with the Acknowledge and Snooze buttons.

Not certified by the agent: actual speech, timing, ElevenLabs agent behavior, and whether the agent always calls `prepare_lafina_action`. The device-side reading makes the card even if it doesn't.

## 7. Docs/ADRs changed

This report only. No ADR. The behavior follows ADR-041's rule that changes come from the student's own words.

## 8. Open blockers and recommended next steps

1. Device validation (section 6), including the "connected in" timings.
2. Optional: have the online voice read the reminder itself through the agent `first_message` override (pending agent step, see the online-greeting memory). That would remove the remaining audio-start gap.
3. The other session's in-progress theme work currently breaks `CustomTabBar.test.tsx` typecheck; it needs finishing before preflight is green.

## 9. Review decision

- [ ] All automated required checks passing (see the typecheck note and full Jest result)
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change
- [x] Report accurate, links validated, docs updated

STATUS: AWAITING DEVICE VALIDATION
STOPPED — awaiting explicit human approval
