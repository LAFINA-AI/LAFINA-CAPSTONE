# Offline Chat/Call and Reminder Call audit fixes — Completion Report

**Branch / commit SHA:** `main` @ `3d27e3d` plus uncommitted working-tree changes (nothing committed)
**Date/time UTC:** 2026-11-22T14:43Z
**Device(s) available:** NONE. No phone or emulator was run in this task.
**Status:** `AWAITING DEVICE VALIDATION`
**Approval provenance:** the owner wrote "ok proceed and fix all" after two read-only audits (offline Chat/Call; the reminder call). Earlier the owner asked "do we really need the popup? i feel like it breaks the immersion" and accepted removing the reminder consent pop-up.

## 1. Scope completed

### Reminder call (the owner's direct complaint)

| # | Problem | Fix |
|---|---|---|
| R1 | Did not go online automatically: it required `chat.onlineMode === 'true'`, while Call Lafina treats only an explicit `'false'` as offline. | `expectsOnlineCall` uses the Call Lafina rule: signed in, Offline Mode not picked, Call Lafina consent given, and the phone is connected. |
| R2 | A consent pop-up appeared mid-ring, with an extra reminder-only key `voiceConversation.reminderConsent.v2`. | The pop-up and that key are removed. The call reuses the Call Lafina consent (`hasOnlineCallConsent`). Without consent the call **answers offline silently** and shows a one-line hint (`OFFLINE_CONSENT_HINT`). Nothing is agreed to on the student's behalf. |
| R3 | After LAFINA read the reminder, the agent restarted with "Hi, I'm listening. What's on your mind?". | **Quiet opening.** The native start option `suppressOpeningAudio` drops the agent's audio. The controller's `quietOpening` hides its text until the student's first spoken or typed turn. A typed `user_message` also unmutes. No backend or agent change was needed. |
| R4 | A screen timeout paused the app and ended the call. | Keep-screen-on while a call is live: reminder, online Call Lafina and offline call. This uses the ref-counted `src/utils/keepScreenOn.ts` and the native `LafinaVoiceConversation.setKeepScreenOn`. |
| R5 | The Answer button said "Talk with LAFINA" without checking the connection. | Connectivity is checked while it rings. When offline, the button shows "Hear the reminder" and the offline opening is prepared. |
| R6 | A running Call Lafina kept the mic and speaker when a reminder was answered. | `endActiveVoiceConversation('A reminder call was answered.')` runs on Answer. |
| R7 | The announcement used ElevenLabs only under `chat.onlineMode === 'true'`. | ElevenLabs reads the announcement only when the call is going online. An offline call never sends the reminder text out. |

Disclosure text was updated:
- the Call Lafina consent card now mentions reminder calls;
- the help text for the reminder answer mode "Online AI when available" was rewritten.

### Offline Chat / offline Call Lafina

| # | Problem | Fix |
|---|---|---|
| O1 | The call checked `isAvailable` (mic granted) before asking for permission, so the first call said "not ready". | Permission is asked first. Native `isAvailable` also checks that the bundled Whisper model exists. `isRequestingPermission()` guards the AppState stop while the permission prompt is open. |
| O2 | No filter for whisper ghosts: "Thank you." or "Bye." on noise hung up the call, and "Yes" could confirm a card. | Shared `src/ai/stt/speechGhosts.ts`. Junk such as "you" or "thanks for watching" is always dropped. Plausible words ("thank you", "bye", "okay", "yes") are dropped only when the Silero VAD peak is below 0.6; native now returns `maxVadProbability`. Chat push-to-talk keeps its old list when the score is unknown. |
| O3 | LAFINA's own voice could be heard back as the student. | The first 300 ms of the capture after she speaks is ignored (`leadInIgnoreMs`). An exact repeat of the last 3–6 words of her line is ignored; short answers like "yes" or "save it" never are. |
| O4 | The TTS safety timeout ignored speech rate and did not stop the engine. | The timeout scales with 1/rate (60 s cap). On timeout `Tts.stop()` is called if the line still owns the engine. |
| O5 | Whisper and llama could not be cancelled. A JS timeout left native busy, which caused `CAPTURE_BUSY` ("Another recording is using the microphone") and an SLM backlog. | Whisper: JNI `setVoiceAbort` plus `abort_callback`, for voice `transcribe` only; meeting transcription is untouched. Cancel, release and invalidate set it. llama: a per-context atomic `cancel`, checked in the prompt and token loops and set as llama's abort callback. Kotlin `cancelExtraction(requestId)`; JS cancels when `slmTimeoutMs` passes. |
| O6 | The call failed with "another recording" when it was our own unfinished capture. | `CAPTURE_BUSY` now gives its own message. Two whisper timeouts in a row end the call with a clear reason instead of looping. |
| O7 | Offline Chat waited for the SLM with no limit, and the question appeared only with the reply. | Chat waits at most 10 s for the SLM. `onUserMessage` shows the question at once. |
| O8 | A review card from another chat appeared after the student switched chats. | If the chat changed while a proposal was being prepared, the proposal is cancelled silently. |
| O9 | The respond-timeout line said "Nothing was changed" while a save could still finish. Stop during "thinking" was lost. | New wording. A Stop during thinking shows the next answer without speaking it. |
| O10 | Latency. | End-of-turn pause in the call cut from 1000 ms to 700 ms. Whisper warms up first, then the SLM (no longer in parallel). The SLM warms on Chat input focus when offline (at most once every 45 s). The call uses a confident fast-path parse without waiting for the SLM (`trustConfidentFastPath`). The native capture loop reuses its frame buffer. "Load earlier" dedupes with a Set. |

**Deferred / not done**
- Online `prepare()` at ring time. It belongs to each controller instance, which only exists once the conversation mounts, so a short gap remains between the announcement and connecting.
- Parse memoization: skipped as low value.

**Correction to the earlier audit.** A bare "okay" does **not** confirm a reminder-call card. A bare "yes" confirms and a bare "no" cancels (`SPOKEN_CONFIRM_RE` / `SPOKEN_CANCEL_RE`). This was left unchanged, because LAFINA asks "save it?". In the offline call, a "yes" that the detector was not confident about is now dropped as a ghost.

## 2. Change summary

| File/module | Change | Test evidence |
|---|---|---|
| `src/ui/screens/IncomingCallScreen.tsx` | Online rule; pop-up removed; hint; ring-time connectivity; keep-screen-on; ends active call | `__tests__/scheduler/onlineReminderCall.test.tsx` (27) |
| `src/cloud/voiceConversation/{index,controller,types,nativeTransport}.ts` | `hasOnlineCallConsent`; reminder key removed; `quietOpening` | `voiceConversationController.test.ts` "quiet opening" (4) |
| `src/ui/hooks/useVoiceConversation.ts`, `src/ui/components/call/OnlineReminderConversation.tsx` | `quietOpening` passed through; keep-screen-on | as above |
| `LafinaVoiceConversationModule.kt` | `suppressOpeningAudio`; unmute on typed `user_message`; `setKeepScreenOn` | Gradle build |
| `src/ai/offlineCall/offlineCallController.ts`, `offlineCallDeps.ts`, `src/ui/hooks/useOfflineCall.ts` | Permission order, ghost and echo filter, capture tuning, sticky Stop, timeout limits, own-busy message, AppState guard, keep-screen-on | `offlineCallController.test.ts` (12 new, 39 total) |
| `src/ai/stt/speechGhosts.ts` (new), `src/ui/components/chat/ChatInput.tsx` | Shared ghost and echo filter | `offlineAudit20261122.test.ts` |
| `src/ai/native/speechCapture.ts`, `LafinaSpeechToTextModule.kt`, `whisper_jni.cc` | `endSilenceMs`, `leadInIgnoreMs`, `maxVadProbability`, model check, buffer reuse, whisper abort; warmup returns a Promise | Gradle build + symbol check |
| `src/ai/nlu/intentService.ts`, `LafinaIntentExtractorModule.kt`, `llama_jni.cc` | `requestId` + cancel on timeout; `trustConfidentFastPath` | `offlineAudit20261122.test.ts`; `phase07…` updated for `requestId` |
| `src/ai/chatOrchestrator.ts`, `src/ui/screens/ChatScreen.tsx` | `onUserMessage`, Chat `slmTimeoutMs`, stale-card cancel, focus warmup, Set dedupe | `offlineAudit20261122.test.ts` |
| `src/ai/tts/ttsService.ts` | Rate-scaled timeout + `Tts.stop()` | `agyPort10Speech.test.ts` "time limit" |
| `src/ui/components/voice/VoiceConversationPanel.tsx`, `ReminderCallSettings.tsx` | Staggered warmup; disclosure text | preflight |
| `src/utils/keepScreenOn.ts` (new) | Ref-counted screen holder | `offlineAudit20261122.test.ts` |

## 3. Tests and real outcomes

| Check | Command | Result | Evidence |
|---|---|---|---|
| Typecheck, lint, Jest, architecture | `npm run preflight` | **PASS**: 207 suites; 2850 passed, 1 skipped; 0 import cycles | `docs/reports/logs/offline-reminder-audit-fixes-preflight.log` |
| Android build + Kotlin unit tests | `JAVA_HOME=<JDK 17> gradlew :app:assembleDebug :app:testDebugUnitTest` | **PASS** (arm64-v8a + x86_64 APKs) | `docs/reports/logs/offline-reminder-audit-fixes-gradle.log` |
| New JNI symbols present | `grep` of `setVoiceAbort` / `setCancel` in the merged `.so` files | **PASS** (both ABIs) | — |
| Device manual | — | **NOT RUN** (no device) | — |

## 4. Performance

NOT RUN. No device timings were taken. The 700 ms end-of-turn pause, 300 ms lead-in, 0.6 VAD threshold and 10 s Chat SLM limit are chosen values, not measured ones.

## 5. Reliability and privacy

- Privacy is unchanged or stricter:
  - consent is never written automatically;
  - an offline reminder call never uses ElevenLabs for the announcement;
  - no new permissions.
- Keep-screen-on is released when the call ends or the screen unmounts. The power button still turns the screen off and ends the call, as designed.
- Risk: the VAD 0.6 threshold may drop a real, quietly spoken "yes" or "bye" in the offline call. The student repeats it. Tune on device if needed.
- Risk: if the ElevenLabs greeting audio is still arriving after the student's first words, its tail could play. This is unlikely because the greeting arrives right after connecting. Check on device.

## 6. Human phone verification

See the checklist in the chat handoff. Every item there is NOT RUN.

## 7. Docs

This report. Memory notes for both audits are updated. No ADR was changed.

## 8. Open items

1. Device validation of the checklist.
2. Optional: prepare the online session while it rings. This needs the controller lifted out of `OnlineReminderConversation`.

## 9. Review decision

- [x] All automated required checks passing
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change (no backend, no Kokoro, only this checkout)
- [x] Report accurate

`STATUS: AWAITING DEVICE VALIDATION`

---

## Addendum: Call Lafina greetings

**Request:** "add more greetings to the lafina call feature, it is the same in the casual mode."

**Cause**
- Offline, the greeting was one fixed line.
- Online, it is the ElevenLabs agent's fixed `first_message`. The conversational tone from Preferences was never used for either.

**Change**
- New `src/ai/callGreetings.ts`, a greeting picker:
  - separate pools for Default, Casual and Professional, each online and offline: 3 to 7 lines at any hour, 5 to 9 written per pool;
  - morning, afternoon, evening and late-night lines;
  - the student's name;
  - never the same line twice in a row;
  - every offline line says she is offline.
- Offline calls use it now (`offlineCallDeps.ts`).
- Online calls send it as `conversation_config_override.agent.first_message`, but only when `/v1/ai/voice/capabilities` returns `openingLine: true`.
  - The live agent does not allow this override yet (`first_message: false` in the saved agent snapshot), and an override it does not allow would make it refuse the call.
  - Until the backend is updated, online calls keep the fixed line.
  - The backend steps are in `backend_integration/call-greetings/OWNER-HANDOFF.md`. They are not applied; they need the owner's approval.
- A reminder call asks the agent for an empty opening when the override is allowed. The current suppression stays as the fallback.

**Tests**

| Check | Result |
|---|---|
| `npx jest __tests__/ai/callGreetings.test.ts` (new) | 8 pass |
| `voiceConversationController.test.ts` "opening line" | 4 new tests pass |
| Call-related suites (35) | 556 pass |
| `tsc --noEmit`, ESLint on changed files, `check:architecture` | pass |
| Full preflight and Gradle after this addendum | NOT RUN (JS-only change, no native code touched) |
| Device | NOT RUN |

### Backend part (owner approved "PROCEED ADD")

- Patch `backend_integration/call-greetings/LAFINA-backend-call-greetings.patch`, against LAFINA-backend `main` @ `94f0fa0`:
  - server flag `VOICE_OPENING_LINE_OVERRIDE` (off by default);
  - capabilities field `openingLine`;
  - provisioning `--allow-opening-line`, which patches only the agent's override permissions;
  - `--check` guards against turning the flag on before the agent allows it.
- Local tests:
  - 98 voice and config tests pass, including 6 new ones;
  - the full suite has 281 passed and 24 failed, and the same 24 fail on unmodified `main` here (documents, flashcards, study notes);
  - no new ruff findings.
- **Not pushed, not deployed, live agent unchanged.** The owner's steps are in `backend_integration/call-greetings/OWNER-HANDOFF.md`.
- Online greetings stay on the fixed line until steps 2 to 4 there are done.
- Pushed to LAFINA-backend `main` as `52f269c` (owner: "push the backend changes to main"). The agent permission step and the flag are still not done.
