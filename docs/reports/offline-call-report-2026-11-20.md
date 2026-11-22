# OFFLINE CALL LAFINA — Completion Report

**Branch / commit SHA:** `codex/skills-hub`, uncommitted on top of `b35a494`
**Date/time UTC:** 2026-11-19T20:31Z (2026-11-20 local)
**Device(s) available:** one Android phone on adb (`13195704C2004480`); nothing was installed or run on it
**Status:** `AWAITING DEVICE VALIDATION`
**Phase approval provenance:** owner, 2026-11-20: "we need to implement this offline call feature as this is the main feature for the capstone, i approve anything you recommend - no need for the chitchat model for now - as long as i can schedule it with my voice - i can reschedule it if needed etc. model should always use the online mode if the user is online, then offline mode if the user is offline unless the user chose the offline ai model in the chat tab. integrate this nicely."

## 1. Scope completed

Call Lafina now works with no internet, on the phone alone:

- **Listening:** the existing whisper.cpp + Silero VAD capture (`startOfflineSpeechCapture`, automatic end of speech). English only, as the bundled model is `ggml-base.en`.
- **Speaking:** react-native-tts (no Kokoro, no cloud).
- **Understanding:** the same on-device reviewer offline push-to-talk uses (`chatOrchestrator.reviewSpokenTurn` with `onlineMode: false`). No language model is used; no chit-chat model was added, as instructed.
- **Saving:** the same review cards and confirm-before-write rules as the online call. Nothing is written until the student says "save it" / "yes" to "Should I save it?" or taps Confirm.

What a student can do by voice offline:

| Say | Lafina |
|---|---|
| "Schedule a capstone meeting tomorrow from 10am to 11am" | Shows the card, says *Create event "Capstone meeting": Sat, Nov 21, 10:00 AM to 11:00 AM. Should I save it?* |
| "Change it to 10:30 to 11 instead" | Updates the card, says *Updated. … Should I save it?* |
| "Save it" / "Yes" / "Okay, save it" | Saves it, says the receipt (*Saved locally. Alarm registered.*) |
| "Change it to 3pm and save it" | Changes and saves in one step |
| "Move the capstone meeting tomorrow to 2pm" | Reschedule card for the saved event, *Should I go ahead?*, then "yes" |
| "Schedule a capstone meeting" … "tomorrow 10 to 11" | The two are read as one request (event card), not a task due at 10 |
| "Cancel that" | Drops the card, nothing saved |
| "Save it" with nothing open / again after saving | *There's no card waiting…* / *That's already saved.* |
| "What do I have tomorrow?" | Reads the answer from the phone's planner (long answers are cut at a sentence; the rest is on screen) |
| "Hi", "thanks", "who are you" | Short local reply (existing `localConversation`) |
| "Bye" | Says goodbye and hangs up |
| Tap Confirm / Cancel on the card | Saves/cancels and Lafina says so out loud |

**Which call starts (decided when Call is tapped; a running call never switches):**

| Situation | Call |
|---|---|
| Signed in, connected, Chat engine not set to Offline | Online (ElevenLabs + DeepSeek), unchanged |
| No internet (NetInfo) | Offline |
| Guest or signed out | Offline (used to be "Sign in to Call Lafina") |
| Offline chosen in Chat's engine picker (`chat.onlineMode = 'false'`) | Offline, even when connected (used to be "Turn on Online Mode") |
| Online start fails because the internet is unreachable / cannot connect | Continues offline automatically |
| Online call unavailable for another reason, or drops mid-call | Problem card offers **Call offline instead** |

The header shows an **Offline** badge (chip icon) and one line saying why. The consent card (about sending the microphone online) is not shown for the offline call; the OS microphone permission still is.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `src/ai/offlineCall/offlineCallController.ts` (new) | Half-duplex call loop: greet → listen → respond → speak → listen. Stop, mute, typed turns, `announce`, silence goodbye (3 quiet listens), time limit (20 min), mic busy/denied, no-voice text fallback, `stopForSystem`. Same `ConversationSnapshot` as the online call | Offline call engine | `offlineCallController.test.ts` (18) |
| `src/ai/offlineCall/offlineCallDeps.ts` (new) | Production wiring: native capture, `onSpeechStarted` event, react-native-tts owned speech, Chat history | Real device path | type-checked; device NOT RUN |
| `src/ai/offlineCall/callMode.ts` (new) | Online/offline decision and reason text | Mode routing | `offlineCallPanel.test.tsx` routing tests |
| `src/ai/offlineCall/spokenReplies.ts` (new) | One spoken line per card, `speakable` (strip markdown, cap ~320 chars), transcript cleaning, greeting, help line | Short, clear speech; TTS has a 30 s safety stop | controller + panel tests |
| `src/ui/hooks/useOfflineCall.ts` (new) | Hook: controller per account, registered app-wide (mini bar, end on sign-out), stops when the app leaves the foreground | Same contract as `useVoiceConversation` | panel tests |
| `src/ui/components/voice/VoiceConversationPanel.tsx` | Turn handling shared by both calls (`handleStudentTurn` returns the line Lafina says offline); `reviewOffline`; mode state, NetInfo, automatic fallback, "Call offline instead"; Offline badge/reason; offline status texts; tap results announced; consent card online-only | One screen for both calls | `offlineCallPanel.test.tsx` (17), all existing call suites pass |
| `src/cloud/voiceConversation/types.ts`, `index.ts` | `ConversationController` interface; registry typed by it | Both controllers share the registry and mini bar | type-check |
| `src/ai/voiceActions/actionService.ts` | `confirmMultiActionBatch` / `retryMultiActionItem` accept `{onDevice: true}` | A grouped card the device built from the student's own words is not gated on the cloud-tool check (guests can save offline); the student's confirmation still gates it | panel tests |
| `src/ui/hooks/useVoiceConversation.ts` | `NETWORK_DROP_REASON` exported; text no longer says "push-to-talk still works" (the screen now offers the offline call) | Fallback offer | existing suites |
| `src/ai/localConversation.ts` | Exports `studentFirstName` | Greeting by name | — |
| `__tests__/ui/voiceConversationUi.test.tsx` | Two tests updated to the new rule (guest → offline call; Offline chosen in Chat → offline call) | Behaviour changed on purpose | passes |

Earlier the same day (save-approval fix, already reported in chat): `turnPolicy.ts`, `useCommandReview.ts`, `structuredAction.ts`, `IncomingCallScreen.tsx`, `callSaveApproval.test.tsx`.

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | Result | Evidence |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS | terminal |
| Lint (files changed for this work) | `npx eslint --max-warnings 0 <changed files>` | PASS | terminal |
| Lint (whole repo, part of `npm run preflight`) | `npm run preflight` | FAIL — not this work: `src/ui/screens/skills/DocGenSkill.tsx` unused `Alert` import | edited by a concurrent session (file time 04:28) |
| Jest | `npx jest --runInBand` | PASS — 176 suites, 2,424 passed, 1 skipped | terminal |
| Architecture | `npm run check:architecture` | FAIL — not this work: `ACCESS_NOTIFICATION_POLICY` added to `AndroidManifest.xml` | edited by a concurrent session (file time 04:14) |
| Prettier (changed files) | `npx prettier --check <changed files>` | PASS | terminal |
| Android build | `gradlew assembleDebug` | NOT RUN — no native code changed in this work; the tree also holds another session's unfinished native changes | — |
| Device manual | §6 | HUMAN REQUIRED | — |

Jest proves screen and loop logic with a scripted microphone and voice. It does **not** prove whisper accuracy, react-native-tts audio, echo, or timing on a phone.

## 4. Performance and device matrix

NOT RUN. No device measurements were taken. Expected per-turn cost is one whisper `base.en` inference on the utterance plus the deterministic parser; record real numbers on the phone.

## 5. Reliability, privacy, permissions, licenses

- Nothing leaves the phone in the offline call. No new permission. Mic only after tapping Call and the OS permission; the call stops when the app leaves the foreground.
- Half-duplex: the mic is closed while Lafina speaks, so she cannot hear herself. Interrupting is by the Stop button, not by talking over her.
- react-native-tts has a 30 s safety stop per line; spoken lines are capped near 320 characters so the mic does not open over a still-speaking voice. Device check needed.
- English only (`ggml-base.en`). Taglish and Filipino will transcribe poorly.
- The deterministic parser is less forgiving than the online model with unusual phrasing; the help line suggests a working phrase.
- Grouped (multi-item) cards, undo and question answers reuse existing tested paths; they were not all exercised end-to-end in the offline call tests.

## 6. Human phone verification

1. Install a build with these changes. Turn on airplane mode (or pick **Offline** in Chat's engine picker).
2. Open Call Lafina. Expected: **Offline** badge and a reason line; no consent card.
3. Tap **Call Lafina**. Expected: the phone voice says *Hi …, Lafina here. I'm working offline…*; status shows *Listening* after it finishes.
4. Say "Schedule a capstone meeting tomorrow from 10am to 11am". Expected: a card with 10:00–11:00 AM; Lafina reads it and asks *Should I save it?*
5. Say "Change it to 10:30 to 11 instead". Expected: card updates; *Updated … Should I save it?*
6. Say "Save it". Expected: *Saved…*; the event is in Calendar at 10:30–11:00.
7. Say "Move the capstone meeting tomorrow to 2pm", then "yes". Expected: the event moves to 2:00 PM.
8. Start another card and tap **Confirm** instead of speaking. Expected: Lafina says it was saved.
9. While she is speaking, tap **Stop**. Expected: she stops at once and listens.
10. Stay silent. Expected: after about 30–40 s she says goodbye and hangs up.
11. Turn airplane mode off, sign in, set Chat to Online, call again. Expected: the normal online call (no Offline badge).

Watch for: Lafina's own voice being transcribed as you (echo), lines cut off mid-sentence, and the delay between finishing a sentence and her reply.

## 7. Docs/ADRs changed

This report only. Import-cycle check: NOT RUN.

## 8. Open blockers and recommended next steps

1. Phone validation (§6) — required before calling this done.
2. The concurrent Skills work currently fails `npm run preflight` (lint in `DocGenSkill.tsx`, manifest permission). That session must fix it; this work did not touch those files.
3. Later options (not started): talk-over-Lafina barge-in using the existing `bargeIn` echo-cancelled capture; a Filipino-capable whisper model; an optional small on-device chat model.

## 9. Review decision

- [ ] All automated required checks passing — Jest and type-check pass; repo-wide lint and architecture fail on another session's files
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change (no Kokoro, no wake word, no always-on mic, no backend change)
- [x] Report accurate

`STATUS: AWAITING DEVICE VALIDATION`
`STOPPED — awaiting explicit human approval`

---

## Follow-up (same day): two device reports

### A. Online call: a card saved by voice came back with a conflict warning

**Cause (confirmed in code):** after "save it" the app saved the card, then LAFINA called `prepare_lafina_action` with the same meeting. The app built a new card for it; that card replaced the saved one on screen and warned that it overlapped the meeting just saved (itself). Nothing stopped a saved item from being prepared again.

**Fix:** the call remembers what it saved (`src/ai/voiceActions/recentSaves.ts`).
- `prepare_lafina_action` describing a just-saved item (same kind, title ignoring case/punctuation/articles, and any date/time/end time it gives) makes no card; LAFINA is told it is already saved and not to prepare it again. A different time still gets its own card.
- A prepare that arrives while the save is still running waits for the save first.
- `revise_draft` / `cancel_draft` naming a saved card change nothing and tell LAFINA to prepare an update/delete instead.
- Applies to spoken saves and tapped Confirm.

Tests: `__tests__/ui/callSaveApproval.test.tsx`, "a saved card never comes back as a new card" (6 cases).

### B. Offline call: greeting played, then nothing after the student spoke

**What the phone showed** (system log; the app's own log lines had been overwritten): greeting 04:51:58–04:52:04, microphone recorded 04:52:04–04:52:13 (speech, then silence), then no reply and no new recording for 77 s. Jest could not reproduce it, and the exact step that stalled is **not yet known**.

**Fixes so a turn can never end in silence:**
- The screen shows "You said: …" and, once recording ends, "Writing down what you said…" (new native event `onSpeechCaptureEnded`).
- Writing the words down is limited to 25 s; then LAFINA says she couldn't make it out and listens again.
- Speech heard but no words: "Sorry, I didn't catch that."
- Reading the request is limited to 20 s; a late answer is dropped (no late card).
- The on-device model gets 4 s in a call before the parser's reading is used (`slmTimeoutMs`).
- A microphone still being released is retried for up to 4 s.
- `[OfflineCall]` log lines give recording, whisper and reply timings (never the student's words).

Tests: `__tests__/ai/offlineCallController.test.ts` (23, five new).

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npx jest --runInBand` | PASS — 181 suites, 2,461 passed, 1 skipped |
| `npm run check:architecture` | PASS |
| Android build | Not run by me. The dataQa build installed at 05:15 by the other session in this checkout contains these changes (verified in the installed APK: native event in `classes14.dex`, new strings in the JS bundle) |
| Phone | HUMAN REQUIRED — retest with logging running |

`STATUS: AWAITING DEVICE VALIDATION`
`STOPPED — awaiting explicit human approval`

---

## Follow-up 2 (same day): offline model, titles, duplicate save line

Evidence from the phone (`adb`, Infinix X6880, MT6789): `files/models/gemma-3-1b-it-Q4_K_M.gguf` (806 MB) installed; `offline_ai_model_id = gemma-3-1b` for the account. The call log showed `respond took 57–81ms` on every turn, so the model never ran.

**C. The installed offline model was skipped.** `intentService.extractIntent` returned the parser result for any clear request (confidence ≥ 0.85, clean title) and only asked the model about unclear ones. Nothing passed `preferOnDeviceSlm`.
- Offline (no internet, or the offline model chosen in Chat), `reviewSpokenTurn` and Chat's `processMessage` now pass `preferOnDeviceSlm: true`: the model gives the title; the parser keeps date/time (existing fusion).
- `llama_jni.cc` keeps the KV cache of the shared instruction prefix (~450 tokens) and reads only the new tokens per request (was: clear and re-read the whole prompt every time).
- New native `warmupModel(path, format, minBytes)` loads the model and reads the instructions; the offline call starts it as it connects (`warmUpOfflineModel`).
- In a call the model gets 10 s, then the parser's reading is used.
- Logcat: `LafinaIntentExtractor` load/prime/answer times and reused-token counts; `[IntentService] gemma-3-1b: model answered in N ms`.
- Speed on the G99 is **not measured yet**.

**D. Rename titles.** "Rename the event to just capstone meeting" saved the title "the event to just capstone meeting". `renamedTitleIn` (commandReview) now strips the named thing ("the event", "it", "my …") and fillers ("just", "instead"). 17 phrasing tests in `__tests__/ai/renamedTitle.test.ts`.

**E. "Saved locally. Alarm registered." shown twice.** The save replaced the reply with the alarm status; the screen showed it as LAFINA's line and again as a note, and Chat got the receipt plus the spoken line.
- One line now: `Saved "capstone meeting": Sat, Nov 21, 2026, 10:00 AM to 11:00 AM. The reminder alarm is set.` (or that the alarm is not set yet / could not be checked).
- The note is hidden when it repeats LAFINA's line.
- The offline call does not write a save line to Chat when the save receipt is already there (`inChat`), for spoken saves and taps.

Tests: `__tests__/ui/offlineCallPanel.test.tsx` (+4).

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx jest --runInBand` | PASS — 182 suites, 2,482 passed, 1 skipped |
| `npm run check:architecture` | PASS |
| `npm run lint` | FAIL — 3 errors, all in `src/ui/contexts/MeetingsContext.tsx` (the concurrent Skills session's file; not changed here). My files lint clean. |
| Android dataQa build | see handoff |
| Phone | HUMAN REQUIRED |

`STATUS: AWAITING DEVICE VALIDATION`
`STOPPED — awaiting explicit human approval`
