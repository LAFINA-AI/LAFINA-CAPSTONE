# PHASE 09 — Live voice conversation (ElevenLabs + DeepSeek) / Completion Report

Date: 2026-11-08. Branches:
- Mobile: `Lem-branch`.
- Backend: `codex/voice-conversation` in `LAFINA-AI/LAFINA-backend`, worked in the authorized clone `.local/elevenlabs-backend-work` and based on production main `0ab2b60`.

Handoff: `docs/handoffs/claude-code-realtime-voice-conversation-20261108.md`. Design: `docs/decisions/ADR-030-live-voice-conversation.md`.

Status: **AWAITING DEVICE VALIDATION.**
- Implementation, automated tests and emulator checks are done.
- The live provider is blocked on an ElevenLabs key permission and on owner deployment steps.
- No physical-phone check was run.

## 1. Scope completed

Signed-in users (`student`, `student_pro`, `admin`) can hold a hands-free conversation from the voice sheet, in explicitly enabled Online Mode, after a one-time consent notice.

- **Turns and transcripts.** ElevenAgents handles listening, patient turn-taking, spoken interruption and the selected voice. Each answer comes from LAFINA's server and DeepSeek through a new custom-LLM route. Live and final transcripts are shown.
- **Controls:** Mute (releases the microphone), Stop (silences the answer), End, Close, Type instead, Start again, and an explicit "Turn on Online Mode and start".
- **System stops.** Background, lock, audio-focus loss, a reminder call, network loss, Online Mode off, sign-out and account switch all end the session. None restarts it.
- **Chat history.** Finished turns are saved once to Chat. Interrupted answers are marked and labelled.
- **Planner changes** go only through the existing review card.
- **Offline features** are untouched. Push-to-talk stays the default.

## 2. Change summary

**Mobile, new:**
- `src/cloud/voiceConversation/{types,controller,voiceConversationApi,nativeTransport,index}.ts`
- `src/ui/hooks/useVoiceConversation.ts`
- `src/ui/components/voice/VoiceConversationPanel.tsx`
- `android/.../LafinaVoiceConversationModule.kt` (OkHttp WebSocket, AudioRecord/AudioTrack, focus and routing)
- `android/.../VoiceConversationRules.kt`
- Tests: `VoiceConversationRulesTest.kt`, `__tests__/cloud/voiceConversationController.test.ts` (42), `__tests__/ui/voiceConversationUi.test.tsx` (10)

**Mobile, changed:**
- `VoiceModal.tsx`: conversation mode and entry link.
- `chatOrchestrator.ts`: `reviewSpokenTurn`, which saves nothing.
- `chatStore.ts`: `voiceInterrupted` metadata.
- `ChatMessageItem.tsx`: interrupted label.
- `ChatScreen.tsx`: follows Online Mode turned on from the panel.
- `App.tsx`: a reminder call or account switch ends the conversation.
- Kotlin: mic-lease holder `VOICE_CONVERSATION`; module registration.

**Backend (`codex/voice-conversation`):**
- `app/api/v1/voice.py`
- `app/clients/elevenlabs_agents.py`
- `app/services/voice_conversation.py`
- `app/models/voice_session.py`
- `alembic/versions/013_voice_sessions.py`
- `scripts/provision_voice_agent.py`
- `tests/test_voice_conversation.py` (37)
- Config: `ELEVENLABS_AGENT_*` and `VOICE_CONVERSATION_*`
- DeepSeek `max_tokens` parameter
- `.env.example` placeholders

Existing chat, SSE and TTS routes are unchanged.

**Docs:**
- ADR-030
- `docs/07-RAG-AND-ONLINE.md` (API)
- `qa/PHASE-09-VOICE-CONVERSATION-MANUAL.md`
- `backend_integration/README.md` (activation)
- this report and its evidence folder
- Graphify outputs refreshed

**Not added:** no new npm or Gradle dependencies, permissions, mobile schema migrations or hosting projects.

## 3. Tests and real outcomes

| Check | Command | Result |
|---|---|---|
| Mobile preflight | `npm run preflight` (tsc, ESLint `--max-warnings 0`, Jest `--runInBand`, `check-architecture`) | PASS. Final run: 70 suites, 1,063 passed, 1 skipped (§3a). An earlier run before the last fixes: 1,061 passed. |
| Focused Jest | `npx jest __tests__/cloud/voiceConversationController.test.ts __tests__/ui/voiceConversationUi.test.tsx` | PASS, 52 |
| Android JVM | `gradlew :app:compileDebugKotlin :app:testDebugUnitTest` (from the `X:` alias) | PASS, 7 suites / 51 tests / 0 failures. Includes `VoiceConversationRulesTest` (8) and `MicrophoneLeaseTest` (14). `testDataQaUnitTest -x createBundle…` cannot run: React Native's bundle provider refuses the exclusion. |
| Backend tests | `.venv/Scripts/python -m pytest -q` | PASS, 238. The voice file alone: 37. |
| Backend Ruff | `ruff check` / `ruff format --check` on the new files | Format clean after formatting the script. Lint findings are the existing house-style categories (FastAPI `Depends` B008, `timezone.utc` UP017, two deliberate provider catch-alls BLE001). Existing `ai.py`/`auth.py` show the same categories (41 findings). |
| Provisioning script | `python -m scripts.provision_voice_agent --server-url https://lafina-backend.vercel.app` | Dry run prints the agent config with the secret id redacted |
| Local auth boundaries | curl against the local backend | Capabilities without a token → 401. LLM route without the secret → 401. With the secret but a forged grant → 401 `invalid_grant`. |
| Fresh JS bundle | `gradlew :app:createBundleDataQaJsAndAssets` from the physical path | PASS (twice; the final build is 1m36s). The bundle contains the final controller and Chat label. |
| x86_64 APK | `gradlew :app:assembleDataQa --init-script X:/.local/elevenlabs-emulator-standalone.init.gradle -PlafinaApiBaseUrl=http://127.0.0.1:8000 -PreactNativeArchitectures=x86_64` | PASS. SHA-256 `62fc7e0c…0c64`, 154,881,677 bytes. Kotlin recompiled. |
| Provider access | Private script, prints codes only | The ElevenLabs key is denied `/v1/convai/agents` and `/v1/convai/secrets` (401 `missing_permissions`); TTS still works. A 5-token DeepSeek completion with the local key: 200 in 439 ms. |
| Production | `GET https://lafina-backend.vercel.app/v1/ai/voice/capabilities` | 404: not deployed (expected) |

### 3a. Final rerun

Final `npm run preflight` after all fixes (log `.local/voice-conv-preflight-final.log`, exit 0): **PASS**, 70 suites, 1,063 passed, 1 skipped (the same pre-existing skip). Architecture: 241 modules, 0 cycles, 0 forbidden dependencies, 77 offline leaves reach no network API or online module.

## 4. Performance and device matrix

**Setup:**
- Emulator `emulator-5554`, AVD `Medium_Phone`, `sdk_gphone16k_x86_64`, Android 17 (SDK 37).
- `dataQa` APK as above, package `com.lafina.capstone.elevenlabs`, installed with `adb install -r`.
- Local backend on `codex/voice-conversation`, with real DeepSeek.
- A local stand-in agent in place of ElevenLabs. It accepts typed turns and plays a synthetic `pcm_16000` tone (`.local/voice-agent-harness/`).

Six typed turns, measured on the phone from the final user turn:

| Measure | Observed | Notes |
|---|---|---|
| First answer text | 3675, 2248, 2308, 2090, 2400, 2394 ms | Real DeepSeek streamed through the custom-LLM route |
| First audio | 4184, 3366, 3061, 2516, 3448, 3176 ms | The stand-in plays audio only after the full answer text; ElevenAgents streams speech sooner. Not a prediction for real use. |
| Stop → silence | 33 ms | From the tap to the native playback-ended event |
| Interruption frame → silence | 2 ms (after the fix) | Before the fix the bridge emitted silence before forwarding the interruption, so the timer measured 13,084 ms against the next answer. Fixed in Kotlin (forward first) and JS (time only while speaking), with a regression test. ElevenLabs' own detection and network time are not included. |

Resources:
- While muted, Android listed no LAFINA recording client. Unmuted, it listed one `VOICE_COMMUNICATION` 16 kHz client.
- After End or backgrounding: no recording client, no LAFINA audio-focus entry, and audio mode back to normal (0).
- The server session was ended (`/end` 200).

Server row for the first session: `ended/client`, 4 turns, 2,195 prompt and 252 completion tokens, voice and conversation id bound. The stand-in answered 37 pings, received one `user_activity` (Stop) and sent one interruption.

Evidence: `docs/reports/evidence/phase-09-voice-conversation-20261108/` holds `emulator.json`, a redacted `fake-agent-summary.json` and 10 screenshots of the synthetic account. Two screenshots of another account's profile and reminder were deliberately left out.

## 5. Reliability, privacy, permissions, licenses

**Gates and credentials:**
- Guest, Online Mode off, no consent, offline and denied microphone are each refused before any network call (Jest and emulator).
- The signed URL and grant are held in memory only and never logged; the logs carry only timings and lifecycle lines.

**Shared emulator account:**
- The emulator's app data held another account's expired session, which this test build could not refresh. I signed it out (sign-out only clears the active session; local rows stay) and used a synthetic local account.
- That account's owner may need to sign in again on this emulator.

**Privacy and dependencies:**
- The consent notice and README state plainly that the microphone streams to ElevenLabs during a conversation.
- No new runtime permission is used: `RECORD_AUDIO` was already requested.
- No new third-party library: OkHttp ships with React Native.

**Pre-existing issue seen (not changed):** on the emulator the voice sheet's review-card Confirm and Cancel buttons sit at the bottom edge (the sheet is capped at 75% height without scrolling). A tap still confirmed the task, but this needs a layout fix in its own change.

## 6. Human phone verification

NOT RUN. Use `qa/PHASE-09-VOICE-CONVERSATION-MANUAL.md` after the owner's activation. Still unverified on a physical phone:
- real speech;
- natural pauses and spoken barge-in;
- echo cancellation on the speaker;
- headset and Bluetooth routing;
- the selected non-default voice;
- phone and reminder calls, lock, account switch and network loss mid-session;
- a handbook answer in a conversation;
- an ARM64 build.

## 7. Docs/ADRs changed

- ADR-030 (new)
- `docs/07-RAG-AND-ONLINE.md`: API section
- `qa/PHASE-09-VOICE-CONVERSATION-MANUAL.md` (new)
- `backend_integration/README.md`: activation, privacy
- backend `.env.example`
- Graphify: `graphify update src` rebuilt the code graph (2,245 nodes / 6,630 edges, up from the older 1,320-node graph), and its outputs were copied into the tracked `graphify-out/`. A first attempt at the repository root also indexed Android build outputs; it was reverted and its files removed.

## 8. Open blockers and recommended next steps

Each needs the owner; order and commands are in `backend_integration/README.md`.
1. Grant the ElevenLabs key the ElevenAgents read/write permission.
2. Create `ELEVENLABS_AGENT_LLM_SECRET` (Vercel plus the private `.env`).
3. Run `python -m scripts.provision_voice_agent --server-url https://lafina-backend.vercel.app --apply`, then set `ELEVENLABS_AGENT_ID` in Vercel.
4. Approve the merge of `codex/voice-conversation` into main.
5. Run `alembic upgrade head` (migration 013) on production.
6. Build ARM64 and run the manual checklist on a phone.

Deployment status: the backend branch is pushed as commit `a3d1671` (on top of production main `0ab2b60`; 238 tests pass on it) and is not merged. Production does not expose `/v1/ai/voice/*`.

## 9. Review decision

STATUS: AWAITING DEVICE VALIDATION. STOPPED — awaiting explicit human approval.
