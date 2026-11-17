# Call flow audit and fixes (2026-11-16)

- **Scope:** Call Lafina (the live voice call), the reminder call (ringing, answered, online conversation), Acknowledge / Snooze, and the call UI.
- **Branch:** `feature/uniguide-inspired-ui-overhaul`, working tree. Nothing is committed.
- **Status:** AWAITING DEVICE VALIDATION. Automated gates pass (see the end). Nothing here was observed on a phone: no audio, alarm, speech or real ElevenLabs session was run.

## 1. "It says a card is shown, but there is no card"

Five separate causes. The first two were reproduced with failing tests before the fix.

| # | Cause | Where | Fix |
|---|---|---|---|
| C1 | **A finished card hid the next one.** The card host shows a memory card first, then a grouped card, then the review card. A memory card that was already *saved* stayed on stage, so the next task or event card was prepared, announced, and invisible behind it. | `ActionCardHost` order; `VoiceConversationPanel` | One card is in front at a time, the newest. A saved or cancelled memory/grouped card steps aside when a new review card arrives. If two cards really are open, a "2 cards open · Show next" chip switches between them. |
| C2 | **A pending draft that was not on stage was reported as "on screen".** `prepare_lafina_action` answered "Review card is now on screen" for any pending draft in the store without checking the stage. | `VoiceConversationPanel` tool path | The tool puts the pending draft on stage before it answers. |
| C3 | **A stale answer from an earlier turn.** `groundedReply` kept "Review card is now on screen: …" after that card was confirmed or cancelled. On a later turn with nothing to prepare, the tool returned the old sentence and LAFINA announced a card that was gone. | `VoiceConversationPanel` | The answer is reset at the start of every spoken turn and after Confirm/Cancel. The "nothing prepared" answer now tells the model no card is on screen. |
| C4 | **The call was minimized.** While minimized, the call screen is mounted but hidden (`display: none`). A card prepared then was "on screen" only in name. | `App.tsx` | A new card that needs an answer brings the minimized call forward (`onAttention`). |
| C5 | **Tall cards were clipped.** The stage does not scroll and hides overflow, so a tall card (conflict alternatives, the edit row, a typed-input row) lost its top and its Confirm button on small screens or with the keyboard open. | `VoiceConversationPanel` styles | Cards and notes sit in a scrolling area inside the fixed stage. |

Also fixed:

- **Two readings of the same words.** The device read each spoken turn, and the model's `prepare_lafina_action` read the same words again when the first reading was still running. That made two cards, and the second cancelled the first (the store keeps one open draft per surface), so a later `confirm_draft` could point at a cancelled card. The tool now waits for the device's reading and reuses it.
- **A claim with no card behind it.** The model can still say "I put a card on your screen" on its own. The panel now checks: if LAFINA mentions a card and none is on stage after the device finishes reading the turn, it restores the pending draft if there is one, and otherwise shows "No card was prepared, so nothing was saved…" and tells the model so.

### Reminder call (online conversation)

| # | Cause | Fix |
|---|---|---|
| R1 | **The card was inside a 148 px scroll box** under the reminder and LAFINA's reply, with no scroll indicator. It was there, below the fold. | The card has its own place directly under the reminder ("NEEDS YOUR CONFIRMATION"), in the scrolling body. |
| R2 | **The agent was told the app makes a card from the student's words, but the app only did so for a few fixed openings** ("add a task…", "schedule…"). "I need to add a task to…", "remind me to…", "take a note that…" made no card while LAFINA said one was coming. | Any clear planner request makes a card (on-device parser plus a command verb, so ordinary talk does not). The agent is told exactly what happened: "a review card is now shown" or "no review card is on screen". The same no-card check as above runs here. |
| R3 | **"I finished it" discarded its own card.** The request made a card and then acknowledged the reminder at once, which closes the call and silently drops an unanswered card. | It acknowledges only when nothing is waiting for Confirm. |
| R4 | App notes were overwritten by the next conversation update within a moment. | Notes from the app stay in their own line until the next turn. |

## 2. Acknowledge / Snooze

| # | Finding | Fix |
|---|---|---|
| A1 | **No feedback after a tap.** Acknowledge cancels alarms, clears duplicates, schedules the next recurrence and then *speaks a full sentence* before the screen changed. For several seconds the buttons looked untouched. | The tapped button shows "Acknowledging…" / "Snoozing…" at once and the others are disabled. The result ("Reminder acknowledged") appears as soon as it is saved, while the confirmation is spoken. |
| A2 | **Buttons were disabled for the whole announcement** in the online path (greyed out for about as long as LAFINA reads the reminder). | They work as soon as the call session exists. |
| A3 | **A tap could do nothing, silently**, when the scheduler had no session for the call. | The button still acts, fenced by the delivery generation the screen captured. If the reminder cannot be changed, the reason is shown and the buttons come back. |
| A4 | **The prepared confirmation was never the one spoken.** The call prepared "Great! Task acknowledged…", the action returned "Great! Reminder acknowledged. Have a productive day!." (also a typo), so the audio was generated late. | One shared sentence, typo fixed. |
| A5 | **The microphone opened over the spoken confirmation** when a button was tapped while the reminder was being read, and the screen flipped to "Listening". | No capture starts once the call is being settled. |
| A6 | **A stuck speech engine kept the call open.** | The confirmation has an 8-second limit. |
| A7 | **Only exact words worked by voice.** "Okay", "yes", "later", "ten more minutes" failed three times and ended in an automatic snooze. "Don't snooze" snoozed. | In the offline call (which has just asked for one of two choices) short everyday answers count, as the whole reply only. Negated commands do nothing. In the online conversation these words stay ordinary talk; there "okay, got it, thanks" works and "I got it from the library" does not. |
| A8 | Only one snooze length was offered. | Chips for 5 / 10 / 15 / 30 minutes next to the default. |

## 3. Call UI

- **Reminder call, answered:** rebuilt on the overhaul's tokens (24 px cards, pill buttons, soft surfaces, themed accent). Header with an "On call · 00:12" pill, the reminder as the hero card, a compact status, the conversation, then two large actions (Acknowledge, Snooze), snooze chips, and End call with the line "Ending the call counts the reminder as received".
- **Reminder call, ringing:** new header ("REMINDER CALL", "LAFINA"), sub-labels under Decline ("Rings again later") and Answer ("Hear the reminder"), and the footer now says "Simulated reminder call from the app, not a phone call".
- **Call Lafina:** header uses the same circular buttons as Chat with the title and status pill centered; the "Push-to-talk" text link is now a back button. The control dock is round buttons with labels underneath.

## 4. Not changed, and why

- **The server-side voice agent prompt and tools** live in `LAFINA-backend` / the ElevenLabs agent, which this task may not touch. Two follow-ups for the owner: (1) add "only say a card is shown when a tool result says so" to the agent prompt; (2) give the reminder-call agent an `acknowledge_reminder` tool. Until then the app corrects a false card claim after the fact, and the agent is told it cannot acknowledge.
- **The draft card components** (`ReminderDraftCard`, `CalendarDraftCard`, …) were not restyled.
- **`MiniCallBar`** has no "card waiting" badge; the call comes forward instead.
- **Offline announcement wording** ("Choose one of the two responses shown on screen") is unchanged. Naming the keywords aloud risks the microphone picking up the app's own voice.

## 5. Risks to check on a device

- **Short spoken answers (A7).** Whisper can output "Okay." for noise. A false "okay" would acknowledge a reminder. Capture starts only after the prompt ends and needs detected speech, but this has to be heard on a phone. If it misfires, remove the bare words from `CASUAL_ACKNOWLEDGE_RE` in `callDispatcher.ts`.
- **Auto-expand (C4)** interrupts whatever screen the student was on. If that is too abrupt, switch to a badge on the mini bar.
- **Layout** was checked by tests only; no screenshot was taken.

## 6. Tests

New (39 tests):

- `__tests__/ui/callFlowAudit20261116.test.tsx` (6): C1, C2, C4, C5 and the false-claim check.
- `__tests__/scheduler/reminderCallDispatcherAudit20261116.test.ts` (24): A1, A3, A4, A7 and double taps.
- `__tests__/scheduler/reminderCallScreenAudit20261116.test.tsx` (9): A1, A2, R1–R4.

Changed expectations in existing tests (4 assertions): the two screen headings, and the manual actions now receive the delivery generation.

Gates on this working tree:

| Gate | Command | Result |
|---|---|---|
| TypeScript strict | `npx tsc --noEmit -p .` | exit 0 |
| ESLint | `npm run lint` (`--max-warnings 0`) | exit 0 |
| Architecture | `npm run check:architecture` | PASS: 368 modules, 0 cycles, 0 forbidden deps, 105 offline leaves with no network import |
| Jest | `npx jest --runInBand --ci` | 143/143 suites, 1983 passed, 1 skipped, 0 failed |

Before the fixes, the 10 call suites were green (165 tests), so none of the bugs above was covered by a test.

Not run: `gradlew testDebugUnitTest` (no Kotlin changed in this task), any device or emulator check, a live voice session.

## 7. Manual check (short)

1. Install the debug build, sign in, turn on Online Mode, open **Call Lafina**.
2. Say "remember that I study best at night", save the memory card, then say "add a task to submit slides tomorrow at 3 PM". The task card must be in front.
3. Minimize the call, say "add a task to print handouts tomorrow at 9". The call must come forward with the card.
4. Confirm a card, then say "thanks". LAFINA must not announce a card.
5. Create a reminder a minute ahead. When it rings: check the ringing screen, tap **Answer**, and tap **Acknowledge** while the reminder is still being read. It must show "Acknowledging…" at once and "Reminder acknowledged" before the sentence ends.
6. Repeat and tap a snooze chip (10m). Check the reminder rings again after 10 minutes.
7. Offline call (Online Mode off): answer and say "okay". It should acknowledge. Repeat and stay silent: it must *not* acknowledge.
8. Online reminder call: say "I need to add a task to buy milk tomorrow at 5 PM". The card appears under the reminder; say "confirm".
9. Check both light and dark, and a Classic and a Modern theme.
