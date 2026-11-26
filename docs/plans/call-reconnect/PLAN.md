# Call LAFINA — automatic reconnect and call memory (plan)

Status: IMPLEMENTED (RC-00 to RC-05), AWAITING DEVICE VALIDATION (RC-06). Owner approved D1, D2, D3 (a), D4 (a) and D5 on 2026-11-26 (`OWNER-AUTHORIZATION.md`); decision record: ADR-046. Reports: `docs/reports/phase-RC-*.md`.
Date: 2026-11-26. Amends ADR-030 §5 ("Nothing restarts by itself", "No automatic retries of billable calls") — needs a new ADR-046.

## 1. What the student sees today

1. The online call stops with "The conversation connection closed. Start again when you are ready." or "The internet connection dropped, so the online call stopped."
2. They tap Start again (or call again from the same chat). LAFINA greets them like a stranger and has no idea what was just said, even though every turn of the previous call is saved in that chat.

## 2. Root causes (from the code)

| # | Cause | Where |
|---|---|---|
| R1 | **A new call carries no chat history.** `buildStudentVoiceContext` sends profile, 7-day schedule, to-dos, notes and memories, but **zero chat messages**. Each call is a new ElevenLabs conversation, and the backend's custom LLM only sees that conversation's turns (`conversation_turns`, 12 messages). So call #2 cannot know call #1, even though `createVoicePersistence` saved #1 into the same chat. | `src/cloud/voiceConversation/localVoiceData.ts:213`, `index.ts:132`, backend `voice_llm_turn` |
| R2 | **Any socket close is final.** `closed` → `stopForSystem` → `restart_required`. This is by design (ADR-030 §5). | `controller.ts:1092-1118` |
| R3 | **A momentary network blip kills the call.** NetInfo `isConnected === false` (for example a Wi-Fi → mobile data handover, which reports false briefly) stops the call at once, even if the socket would have survived. | `src/ui/hooks/useVoiceConversation.ts` (NetInfo listener) |
| R4 | **Native teardown is all or nothing.** `onFailure` releases the socket, recorder, AudioTrack, audio focus, the comm route and the mic lease. Reconnecting therefore costs a full audio re-init, and there is nothing to "resume". | `LafinaVoiceConversationModule.kt:292-307, 679-751` |
| R5 | **Restart wipes the call.** `start()` resets `turns: []`, the panel's `resetCallState()` clears session actions, and a `restart_required` phase cancels any pending review card. | `controller.ts:537-550`, `VoiceConversationPanel.tsx` (effect on `restart_required`) |
| R6 | **The server's per-session limit ends the call.** The server default is 300 s, and ElevenLabs closes the socket at its own limit. The production value was not checked for this plan. | `controller.ts:830-844`, backend `VOICE_CONVERSATION_MAX_SECONDS` |
| R7 | **Transient upstream errors close the call.** After the 2026-11-19 fix these are rarer, but `custom_llm generation failed`, 1011 and 1006 closes still happen. Today they are final. | `docs/reports/call-connection-drops-20261119.md` |

**R1 is the "no recollection" bug.** It is independent of reconnect and is the cheapest, highest-value fix. Reconnect (R2–R4, R7) makes drops seamless, but it only feels seamless if R1's memory is fixed too.

## 3. Goals, non-goals, guardrails

**Goals**
- G1: A dropped online call reconnects by itself within a few seconds. The transcript, timer, mute state, speaker route, pending review card and reminder context are all kept, and LAFINA continues where it was.
- G2: Every new call, and every reconnect, knows the recent conversation in the chat it writes into.
- G3: If reconnect fails, the student gets **Continue call** (memory kept) and **Call offline instead**, never a stranger greeting.

**Non-goals**
- Resuming the *same* ElevenLabs conversation id. ADR-030 §3: a signed URL starts one conversation, and no documented resume is used. Every reconnect is a new server session and a new ElevenLabs conversation, with the memory carried in by us.
- Offline call reconnect. The offline call has no network, so it does not drop this way. It is only touched for the shared phase names.

**Guardrails (AGENTS.md / ADR-030, unchanged)**
- No background microphone. **Backgrounding, screen lock and audio-focus loss (a phone call) never auto-reconnect.** They offer one-tap **Continue call** when the student returns.
- No reconnect after: the student hangs up, a goodbye or skill handoff (`endAfterReply`), Online Mode off, sign-out or account switch, consent withdrawn, a mic or audio error, auth rejection (401/403), a quota or limit error, or an unsupported audio format.
- All gates (`checkAdmission`, `isOnline`, consent) run again before every reconnect. Nothing about the grant or the signed URL is logged or stored.
- Reconnect never extends the call's time budget unless the owner chooses otherwise (D3).
- Bounded: a few attempts in a fixed window, and native never holds the mic more than ~35 s without a socket.

## 4. Design

### 4.1 Call vs segment

Introduce a **call** (what the student started) made of one or more **segments** (one server session + one socket each).

- `callGeneration`: bumped by `start`, `end`, `stopForSystem`, `dispose`. It invalidates everything, as `generation` does today.
- `segmentGeneration`: bumped per segment. Socket events, tool results and timers check both.
- Call-scoped state, kept across segments: `turns`, persona preferences, `muted`, `endsAt`/`connectedAt`, `limitReason`, reminder `extraContext`, the persisted-turn ledger (`seen` ids), and the unanswered-turn record.
- Segment-scoped state, reset per segment: `live` (key, sessionId, conversationId), `pending` answer, `provisionalUserId`, `typedEcho`, timing marks, the `thinking` and `settle` timers.

Refactor `start()` into:
- `admit(gen)`: today's gates, unchanged.
- `openSegment(gen, {kind: 'start' | 'reconnect' | 'resume'})`: capabilities (reused), `createSession`, initiation, `transport.start` or `transport.reconnect`.

`start` = clear the call, `admit`, `openSegment('start')`.

### 4.2 Classifying a drop

A new pure function `classifyDrop(event, context)` returns `reconnect | stop | limit | fail`. It is shared in spirit with a Kotlin twin in `VoiceConversationRules.kt`, so native knows whether to keep the audio pipeline.

| Signal | Decision |
|---|---|
| `onFailure` (IOException, timeout, EOF), close 1006, 1001, 1011, 1012, 1013, 1014 | reconnect |
| Close with reason matching `custom_llm generation failed` / `llm_error` | reconnect (at most once per call; the second time → stop with the provider notice) |
| Close within 15 s of `endsAt` | limit (see D3) |
| Close 1000 with no client end (agent `end_call`, server ended the session) | stop |
| Close 1008 or 4xxx (policy, auth, quota), handshake 401/403 | fail, no reconnect |
| `backgrounded`, `audio_focus_lost` | stop → **Continue call** button |
| `error` MIC_FAILED / AUDIO_* / UNSUPPORTED_AUDIO_FORMAT | fail |
| A drop while `endAfter` or a goodbye or skill handoff is in progress | end (the student was leaving anyway) |
| NetInfo `isConnected === false` | **not a drop.** Mark `networkUnstable` and wait for the socket's own verdict (OkHttp pings every 10 s). If the socket dies, reconnect once NetInfo says connected. |

**Flap guard.** Two segments that die within 10 s of connecting, or 3 drops in 2 minutes, mean stop auto-reconnecting. Show the restart card with **Continue call**. There is also a cap of 5 reconnects per call.

### 4.3 Reconnect state machine

New phase `reconnecting`. It is in `ACTIVE`, so the registry, keep-screen-on and the mini bar treat it as live, and it is not `restart_required`, so the panel does not cancel review cards.

```
listening/thinking/speaking/tool_working
   │ drop → classifyDrop = reconnect
   ▼
reconnecting ──(wait for NetInfo connected, ≤ window)──► attempt n
   │                                                      │ ok
   │ window over / flap guard / gate fails                ▼
   ▼                                           listening (same call) + recap + replay
restart_required (Continue call / Call offline instead)
```

- Timing: attempt immediately when online, then back off 1 s, 2 s, 4 s, 8 s. Total window 30 s (`limits.reconnectWindowMs`). Per-attempt connect timeout 10 s (shorter than the 20 s first start). All values go in `VoiceConversationLimits`, so tests use a fake clock.
- During `reconnecting`, timers pause: `inactive`, `thinking` and the limit timer do not fire. `endsAt` keeps counting (wall clock).
- `sendText` and `sendContext` return false. The UI disables the typed input and shows "Reconnecting…".
- `end()` during `reconnecting` aborts the attempt, closes any late session (`closeLateSession`, as today) and tears native down.
- On success: re-apply `muted` (native) and re-send persona preferences. Do not reset `turns`. Do not play the greeting (§4.5). Log `reconnected attempt=n in Xms reason=…`: timings and close codes only, never transcripts or URLs.
- The old segment's server session is ended with `api.end(oldSessionId, oldConversationId)`, as teardown does today.

### 4.4 Memory: what LAFINA is told on every start and reconnect

One builder, `buildCallRecap(userId, {callTurns, unanswered, appState})`, in `src/cloud/voiceConversation/callRecap.ts`. Its result goes **first** in `student_context`. Both the client (12,000) and the server (`VOICE_CONVERSATION_MAX_STUDENT_CONTEXT_CHARS` 12,000) cut from the end, so whatever is at the front survives.

Order: `[reminder context] → [recap ≤ 3,000 chars] → [student summary, trimmed to the rest]`.

**a. Chat recap (every call, fixes R1).** These are the last messages of *the chat the call will write into*. That target is computed with `addGeneralMessage`'s rules, read-only: the open chat, or none if the open chat is a USTP handbook chat (then the call writes to a new general chat).
- Newest-first until 16 messages or 3,000 chars, then output oldest-first. Format: `Student: …` / `LAFINA: …`, 300 chars each, put through `sanitizeUntrustedContext`.
- An attachment becomes `[attachment: <description>]`, as chat sync does (ADR-040). Handbook passages are dropped, but the answer text is kept. A `voiceInterrupted` answer gets `(cut off)`.
- A header with relative time, for example `Earlier in this chat (last message 3 minutes ago):`. Old chats then read as history, not "just now".
- Messages already in the current call's segments are not repeated. They come from (b).

**b. Call recap (reconnect and resume only).** The finished turns of this call so far (call-scoped `turns`, final and interrupted), under the header `This call reconnected after a dropped connection. What was said so far:`.

**c. Unanswered turn and app state.** Examples: "The line dropped while you were answering: '<last user turn>'. The student heard up to: '<partial answer>'." and "A review card for '<title>' is on screen waiting for Confirm." (from the panel: pending review, open skill handoff). This uses an `appState` callback in `VoiceConversationDeps`, so the controller stays UI-free.

**d. Replay rule (so LAFINA actually continues).** After a reconnect, if the last student turn has no committed complete answer, it was finalized less than 20 s before the drop, and **no client tool ran for it**:
- send it once as `user_message` through a new `replayUserTurn(text)`. It is **not persisted again**, adds no new bubble, does **not** call `onFinalUserText` (the on-device review already ran), and uses the `typedEcho` guard so its echo is ignored;
- the recap tells LAFINA to continue the cut-off answer rather than start over.

If a tool ran (a card exists), there is no replay. The recap says what is on screen, and LAFINA waits for the student. Each turn is replayed at most once.

**Persistence stays exactly-once.** Partial answers are committed as `interrupted` at the drop (today's `teardown` behaviour). The `seen` ledger is call-scoped, so a re-sent event id cannot double-save.

### 4.5 Opening on reconnect

- Capabilities `openingLine: true`: send `first_message` = a short fixed line (D4; recommended "Sorry, I lost you for a second. I'm back."). It is `''` when a replay will follow, because the replayed answer is the first thing heard.
- Agent does not allow the override: use today's `suppressOpeningAudio` + `openingQuiet` path (the reminder call's quiet opening), so the agent's stock greeting is neither heard nor shown.
- Reminder calls (`quietOpening`): always quiet, and the reminder context is re-sent.

### 4.6 Native soft reconnect (`LafinaVoiceConversationModule.kt`)

Goal: no audio re-init and no route flap, so the student hears nothing but a short gap.

- Split the socket from the `Session`. On a socket failure that `VoiceConversationRules.isRecoverableClose(code, reason, httpStatus)` accepts, **do not teardown**. Instead:
  - emit `closed` with `recoverable: true`;
  - `flushPlayback`; set `socket = null`; the capture loop keeps reading but **drops frames** (nothing is buffered or sent), so AEC state and the route stay warm;
  - start a native hold timer (`RECONNECT_HOLD_MS` = 35 s). When it expires: teardown with reason `reconnect_timeout`. This is a hard backstop even if JS dies.
- New `@ReactMethod reconnect(sessionKey, url, initiation, options)`:
  - only for the current, non-ended session that is in the socket-lost state;
  - the same URL allow-list and initiation size checks as `start`;
  - opens a new socket with a fresh `Listener`. Listeners are bound to a **socket epoch**, so late callbacks from the old socket are ignored;
  - on open: send the initiation and resume sending frames. It resolves without touching audio.
- `suppressAgentAudio` is set from options (quiet opening).
- `end`, `onHostPause`, `audio_focus_lost` and `invalidate` still tear down fully in the socket-lost state.
- A **debug-only** `debugDropSocket(sessionKey)` (`BuildConfig.DEBUG` or an API override build) cancels the socket. It reproduces a real 1006 on device. Release builds reject it.
- `nativeTransport.ts`: add `reconnect`, `supportsReconnect()` (old builds → JS falls back to full teardown + `start` with a new key), and parse `recoverable`.

**Fallback path.** JS reconnect works without native soft reconnect, because the controller can do teardown + `transport.start` with a new session key. RC-02 ships with that. RC-03 makes it seamless. The design never depends on RC-03 for correctness.

### 4.7 UX

- Status line: "Reconnecting…" with the connecting pulse (`reducedMotion` respected). The avatar and waveform show their connecting look. The mini bar shows "Reconnecting…". The call timer keeps running.
- One soft haptic at the drop, none at success (the existing connected haptic is suppressed for reconnect segments), and a 2 s "Back" chip on success.
- Transcript, pending card and read results stay on screen.
- Restart card, when reconnect gives up or after background or focus loss: **Continue call** (primary; new segment with the full recap, transcript kept, no greeting) and **Call offline instead** (existing). The plain "Start again" becomes "New call" (secondary; clears the screen, but still has the chat recap from §4.4a).
- `IncomingCallScreen` / `OnlineReminderConversation` get the same phase handling. A reminder call that drops mid-call reconnects quietly.
- Accessibility: announce "Reconnecting" and "Reconnected" once each (`AccessibilityInfo.announceForAccessibility`).

### 4.8 Limits and cost

- Each reconnect is a new server session, so it counts against `VOICE_CONVERSATION_SESSIONS_PER_DAY` if that is set. It is unlimited by default since `voice-unlimited`, but check production.
- Client default (no backend change): the call keeps the **first** segment's `endsAt`. A reconnect never gives more time. The limit timer is re-armed against the call's `endsAt`, and a segment shorter than 20 s is not attempted (go straight to the limit message).
- The optional backend change (RC-05) makes this server-enforced and stops reconnects from counting as new daily sessions.

### 4.9 Privacy and consent

- Consent v2 says a 7-day summary, notes and memories are shared at call start. **Recent chat messages are a new category.** Bump to `voiceConversation.consent.v3` with one added sentence: "and the last few messages of this chat, so LAFINA remembers what you were talking about." Students see it once (D2).
- `student_context` is sent today in both `dynamic_variables` and `custom_llm_extra_body`. ElevenLabs keeps dynamic variables in its conversation history. RC-00 checks whether the agent prompt uses `{{student_context}}`. If it does not, send the recap (or all of `student_context`) only in `custom_llm_extra_body`, to reduce what the voice provider stores.
- The recap obeys memory-off: no `chatMemoryStore` facts when memory is disabled. Chat messages are the student's own and visible in Chat. Guests never reach the online call.

### 4.10 Optional backend change (patch only, owner deploys)

Delivered as `backend_integration/call-reconnect/LAFINA-backend-call-reconnect.patch` + `OWNER-HANDOFF.md`. Nothing is pushed or deployed from here.

1. `POST /v1/ai/voice/sessions` accepts `resumeOf: <sessionId>`. The session must be owned by the account, must have ended in the last 2 minutes, and must not have ended by `client` or `limit`. The new row stores `resumed_from_id`. It is not counted as a new daily session. Its `maxDurationSeconds` is what is left of the chain (or the full value, if D3 = rollover). This needs migration `0xx_voice_session_resume`. **On Vercel, run `alembic upgrade head` by hand** (`create_all` is skipped there).
2. The custom LLM accepts `call_recap` in `custom_llm_extra_body`: a list of `{role: 'user'|'assistant', text}` (≤ 12 items, ≤ 3,000 chars). It is fence-stripped like `student_context` and put **before** the new conversation's turns as real user/assistant messages, inside `VOICE_CONVERSATION_MAX_CONTEXT_MESSAGES`. That beats prose in `<student_data>`, because the model then sees an actual conversation.
3. `GET /v1/ai/voice/capabilities` adds `resume: true`. The app sends `resumeOf` / `call_recap` only when it is present. Old servers keep the client-only path (§4.4 prose recap), so nothing breaks.
4. Tests: an ownership mismatch is rejected (403), an expired chain gets a fresh budget only if configured, `call_recap` with fences or the wrong roles is cleaned, and the turn ordering is right.

## 5. Phases

Each phase stops for owner review (AGENTS phase control). Each ends with `docs/reports/phase-RC-NN-report.md`, `npm run preflight` and the Gradle checks.

| Phase | Scope | Main files | Exit criteria |
|---|---|---|---|
| **RC-00** Decision | ADR-046 (amends ADR-030 §5), `OWNER-AUTHORIZATION.md` recording D1–D5, the AGENTS.md task notice. Read-only checks: the agent prompt's use of `{{student_context}}`, the production `VOICE_CONVERSATION_MAX_SECONDS` and `SESSIONS_PER_DAY`, and the close codes of the last 40 calls (`call_history_check.py`). | `docs/decisions/ADR-046-call-reconnect.md` | Owner approves |
| **RC-01** Call memory | §4.4a chat recap on every start, budgeted context order, consent v3. No reconnect yet. **On its own this fixes "no recollection" when the student calls again.** | `callRecap.ts` (new), `localVoiceData.ts`, `useVoiceConversation.ts` (context order), `index.ts` (consent key), consent UI copy | Jest: recap target chat, ordering, budget, sanitizing, memory-off, USTP chat; device: call, hang up, call again, ask "what were we talking about?" |
| **RC-02** JS reconnect | Call/segment split, `classifyDrop`, the `reconnecting` phase, backoff, flap guard, NetInfo grace, the timer pause, the call recap (b), the unanswered turn (c), `replayUserTurn` (d), the quiet reconnect opening, the endsAt carry-over, `resume()` for **Continue call**. Native fallback = full teardown + new `start`. | `controller.ts`, `types.ts`, `useVoiceConversation.ts`, `index.ts` | Jest (§6.1) green; existing `voiceConversationController.test.ts` unchanged in meaning |
| **RC-03** Native soft reconnect | §4.6: socket epoch, recoverable close, hold timer, `reconnect`, `supportsReconnect`, the debug drop hook. | `LafinaVoiceConversationModule.kt`, `VoiceConversationRules.kt` (+ `VoiceConversationRulesTest.kt`), `nativeTransport.ts` | `gradlew :app:testDebugUnitTest`; device: debug drop → audio resumes, no route change, mic lease held ≤ 35 s |
| **RC-04** UI | §4.7 across the panel, mini bar, waveform and avatar, reminder call views; do not cancel reviews on `reconnecting`; skip `resetCallState` on resume; Continue call / New call; a11y. | `VoiceConversationPanel.tsx`, `LiveMiniCallBar.tsx`, `CallWaveform.tsx`, `SynthWaveAvatar.tsx`, `IncomingCallScreen.tsx`, `OnlineReminderConversation.tsx` | UI tests (`callLafinaPhase02/03`, `onlineReminderCall`) updated + new; device checklist |
| **RC-05** Backend (optional, D5) | §4.10 patch + handoff; app sends `resumeOf` / `call_recap` when `capabilities.resume`. | `backend_integration/call-reconnect/*`, `voiceConversationApi.ts`, `types.ts` | Backend pytest on a scratch clone; owner deploys + runs the migration |
| **RC-06** Validation | Device matrix (§6.2) on the owner's phone + emulator, a release build, the report, and `call_history_check` after real calls. | `docs/reports/phase-RC-06-report.md` | AWAITING DEVICE VALIDATION until the owner confirms |

RC-01 is independent and can ship alone as an app release. RC-02 + RC-04 can ship without RC-03 (reconnect works, with about a 0.5–1 s extra audio re-init gap) and without RC-05.

## 6. Tests

### 6.1 Jest (controller, fake transport + fake clock)

- Drop (1006) during listening → `reconnecting` → one `createSession` → `listening`. Turns kept, `connectedAt` and `endsAt` unchanged, mute re-applied, prefs re-sent.
- Drop during thinking / speaking → the partial answer saved once as interrupted, replay sent once, not persisted twice, `onFinalUserText` not called again.
- Drop after a client tool ran → no replay; the recap mentions the on-screen card.
- Non-recoverable closes (1000 server end, 1008, 401 handshake, quota, MIC_FAILED, unsupported format) → no reconnect.
- `backgrounded` / `audio_focus_lost` → `restart_required`, no attempt; `resume()` → a new segment with the recap and no greeting.
- Backoff timing; a window expiry → `restart_required`; the flap guard; the 5-per-call cap.
- NetInfo false then true within 3 s with the socket alive → no reconnect at all; with the socket dead → reconnect after connectivity returns.
- `end()` / `dispose()` / `stopForSystem()` mid-reconnect → the late session is closed on the server, no native start, no state change after dispose.
- A stale socket event (old segment) after a reconnect is ignored.
- Gate change during reconnect (sign-out, Online Mode off, consent revoked) → stop, no network call.
- Limit: a reconnect near `endsAt` → the limit message, not a new segment.
- `endAfterReply` pending + drop → end, not reconnect.
- Recap builder: target chat rules, 16/3,000 bounds, sanitizing, attachments, interrupted marks, relative time header, memory-off, ordering inside the 12,000 cap (the reminder context always survives).

### 6.2 Device matrix (RC-06, manual)

| # | Action | Expected |
|---|---|---|
| 1 | Talk, then the debug **Drop connection** button while listening | "Reconnecting…" < 3 s, then LAFINA continues; the transcript is intact |
| 2 | Drop while LAFINA is mid-answer | LAFINA picks the answer up ("…as I was saying"), and Chat shows the cut-off part once |
| 3 | Airplane mode 5 s mid-call, then off | Reconnects after the network returns; no "connection dropped" card |
| 4 | Airplane mode 60 s | Gives up after ~30 s, then Continue call / Call offline instead |
| 5 | Walk from Wi-Fi to mobile data | No stop, or one quick reconnect |
| 6 | Make a review card, then drop | The card stays; LAFINA says it is still on screen |
| 7 | Home button mid-call, return | No auto reconnect; Continue call resumes with memory |
| 8 | Incoming phone call mid-call | Stops; after the phone call, Continue call works |
| 9 | Hang up, call again from the same chat, ask "what were we talking about?" | Correct answer (RC-01) |
| 10 | Online reminder call, then drop | Quiet reconnect; the reminder context is kept; no re-announcement |
| 11 | Say goodbye, then drop during the goodbye | The call ends; no reconnect |
| 12 | Infinix (XOS Hiber), screen on | Same as 1; note any vendor socket kills |

Afterwards: `python -m backend_integration.call_history_check --limit 20 --agent-id <id>` should show the dropped segments as 1006 and the hang-ups as 1000. There must be no `custom_llm generation failed` loops.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Duplicate actions from a replayed turn | No replay if any tool ran for the turn; planner writes are confirm-before-write anyway; one replay per turn |
| Reconnect loops burning ElevenLabs minutes or DeepSeek tokens | Flap guard, the 5-per-call cap, the 30 s window, no reconnect on auth, quota or policy closes |
| Holding the mic while nothing is connected | Frames are dropped, not sent or buffered; the native 35 s hard stop; the status says "Reconnecting…"; mute still works |
| The recap makes the prompt too long or slows the first answer | 3,000-char cap; the summary is trimmed to fit; the server cap is unchanged |
| The recap leaks into ElevenLabs history via dynamic variables | RC-00 check; send it only in `custom_llm_extra_body` if possible |
| LAFINA treats old chat as "just now" | The relative-time header; only the call recap is described as "this call" |
| The agent's fixed greeting replays on reconnect | Quiet-opening path (already proven on reminder calls) |
| Behaviour change contradicts ADR-030 and its tests | ADR-046 + owner sign-off first; old tests are rewritten for the new rule, not deleted |
| Old app builds without native `reconnect` | `supportsReconnect()` false → full teardown + start fallback |

## 8. Owner decisions needed

- **D1 (required).** Allow automatic reconnect for network/server drops only (not background, phone calls or the student's own actions), amending ADR-030. *Recommended: yes.*
- **D2 (required for RC-01).** Share the last few messages of the current chat with the online call, with consent v3 shown once. *Recommended: yes.*
- **D3.** At the session time limit: (a) end with the limit message, as today (*recommended*, keeps costs capped); or (b) roll over silently into a new segment with memory, so calls are effectively unlimited.
- **D4.** On reconnect, LAFINA (a) says a short "Sorry, I lost you for a second. I'm back." (*recommended*), or (b) stays silent with an on-screen "Back" chip only.
- **D5.** Do the optional backend patch (real prior turns, the session chain, no daily-session cost for reconnects)? *Recommended: yes, after RC-02 proves the client path.*
