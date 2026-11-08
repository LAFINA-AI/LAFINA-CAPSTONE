# ADR-030 — Live voice conversation (ElevenAgents + LAFINA custom LLM on DeepSeek)

Date: 2026-11-08. Status: implemented on `Lem-branch` (mobile) and `codex/voice-conversation` (backend). Production merge, migration and the ElevenLabs agent setup are waiting for the owner. Physical-phone validation is pending.

## Context

The owner asked for natural voice conversations for active signed-in users, only in explicitly enabled Online Mode. Requirements: natural pauses, automatic turn-taking, spoken interruption (barge-in), live transcripts, the selected ElevenLabs voice, and Mute and End controls. Every offline feature must keep working on its own (handoff `docs/handoffs/claude-code-realtime-voice-conversation-20261108.md`).

Before this ADR, voice in LAFINA was push-to-talk only: offline whisper.cpp produced a draft, the student reviewed it, and the reply was read by ElevenLabs (ADR-028/029) or `react-native-tts`. Nothing streamed audio continuously, and nothing could be interrupted by voice.

## Options considered

| Option | Why not chosen / chosen |
|---|---|
| **ElevenLabs React Native SDK** (`@elevenlabs/react-native`) | Documented as designed for Expo and built on LiveKit/WebRTC native packages. This bare RN 0.86 app would gain a large native dependency set, plus build risk on Windows long paths, for what one WebSocket provides. |
| **Speech Engine / a server-held WebSocket** | The server would have to hold a WebSocket per conversation. Vercel functions close at `maxDuration` (this project uses 60 s), so a 5-minute conversation needs a different host. A new hosting project is out of scope. |
| **Build our own pipeline** (stream STT + VAD + DeepSeek + streaming TTS) | Re-implements turn detection, echo handling and interruption, which ElevenAgents already does. It costs more round trips and more code to maintain. |
| **ElevenAgents over its documented WebSocket, driven by a small native Kotlin bridge, with LAFINA's server as the agent's custom LLM** | **Chosen.** ElevenLabs handles listening, turn-taking (`turn_eagerness: patient`), interruption and the chosen voice. Each answer still comes from LAFINA's server and DeepSeek under our rules, limits and logging. The phone uses OkHttp (already present) plus AudioRecord/AudioTrack. No new JS or Gradle dependency. |

## Decision

1. **Transport.** The new `LafinaVoiceConversationModule` (Kotlin) opens one `wss://*.elevenlabs.io/v1/convai/conversation` signed URL. It streams `pcm_16000` microphone audio (`VOICE_COMMUNICATION` source, with AEC and noise suppression when available) and plays `pcm_16000` agent audio through `USAGE_VOICE_COMMUNICATION`. The audio mode is `MODE_IN_COMMUNICATION`, routed to a headset when present and to the loudspeaker otherwise. The bridge answers pings, flushes queued audio the moment an `interruption` arrives, and forwards other frames (64 KB maximum) to JS. Only `user_message`/`user_activity` may be sent from JS. Plain `ws://localhost` is accepted only in builds compiled with an API override (local test harness).
2. **Access gates, in order, before any network call:** native support → signed-in owner (guests are told to sign in) → saved Online Mode → one-time consent notice → internet → microphone permission → readable saved voice. The server then checks the account (active; `student`, `student_pro` and `admin` all allowed; no Pro gate), whether the feature is configured, the daily session cap, and the voice (unknown voice → 422 "Choose another voice in Profile", never replaced).
3. **Credentials.** `POST /v1/ai/voice/sessions` returns a signed URL that is valid briefly to *start* one conversation. It also returns a short-lived RS256 **grant** (aud `lafina-voice-llm`, sub = account, vsid = session row). Both are held in memory only and passed once to native. They are never logged, synced or persisted (`Cache-Control: no-store`). The ElevenLabs key and the custom-LLM shared secret stay server-side.
4. **Custom LLM.** The agent (private, `enable_auth: true`) calls `POST /v1/ai/voice/llm/chat/completions` with the shared secret (from the ElevenLabs secret store), the grant (dynamic variable → `X-Lafina-Voice-Grant` header, or `elevenlabs_extra_body`) and `system__conversation_id`. The server:
   - verifies the secret, the grant, the session row, the owner, the account state, the expiry and the conversation binding;
   - drops the agent's own prompt and keeps only bounded user/assistant turns (12 messages, 6,000 chars). An empty or noise turn, or a re-engagement ping, costs nothing;
   - enforces per-minute and per-day turn limits and an atomic per-session turn budget. A duplicate turn is paid once;
   - adds LAFINA's system prompt and a spoken-style instruction: no markdown, never claim something was saved, point to the confirmation card, and cite the handbook or say it could not be checked;
   - streams DeepSeek as OpenAI chunks, capped at 300 tokens. Reasoning content is never sent.
5. **Lifecycle (`VoiceConversationController`).**
   - Every start has a generation. Late answers, events or timers from an older start are ignored.
   - Ending during session creation closes the server session and never opens the mic.
   - Background, screen lock, audio-focus loss (calls, reminder calls), socket close, network loss, Online Mode off, sign-out or an account switch all stop the session and show **Start again**. Nothing restarts by itself.
   - Bounds: 20 s to connect, a 5-minute server limit, 2 minutes of silence, and a 25 s slow-turn notice that asks the server once for the real reason (for example billing).
   - No automatic retries of billable calls.
6. **Mute** stops and releases `AudioRecord` (verified: no recording client while muted). **Stop** flushes playback and suppresses the rest of that answer until the next user turn.
7. **Transcripts and persistence.** Provisional words are shown in italics. A final turn is de-duplicated by event id; noise-only finals are dropped. Each finished user turn and each answer is saved once to the account's Chat. An answer cut short by an interruption, Stop or End is saved with `voiceInterrupted` and labelled in Chat. A completed answer is saved after playback drains, with a 1.2 s grace for audio underruns, and does not depend on an optional completion event.
8. **Scheduling.** A finished spoken turn also goes through `chatOrchestrator.reviewSpokenTurn`, which is the existing on-device NLU and review path and saves nothing. Planner changes appear as the existing review card and need Confirm. Read-only schedule questions get the on-device answer as a note.
9. **Offline separation.** The new code lives in `src/cloud/voiceConversation/`. Offline leaves (`storage`, `scheduler`, `ai/{nlu,stt,tts,native}`) do not import it; the architecture checker verifies this. Push-to-talk stays the default and the two modes never share the mic: the native mic lease adds holder `VOICE_CONVERSATION`, so a busy mic is reported, not stolen.

## Limits and costs

Server defaults (`VOICE_CONVERSATION_*`): 300 s per session (plus a 120 s start grace), 30 turns per session, 6 sessions per day, 12 turns per minute and 150 per day per account, and a 300-token reply. ElevenAgents bills per conversation minute on the owner's ElevenLabs plan. DeepSeek bills per token, recorded as `voice_turn` usage. These are configurable env values, not measured targets.

## Consequences

- Production needs, in order (owner/Vercel owner):
  1. An ElevenLabs key with ElevenAgents read/write. The current key returns `missing_permissions`.
  2. `ELEVENLABS_AGENT_LLM_SECRET`.
  3. A run of `scripts/provision_voice_agent.py --apply`.
  4. `ELEVENLABS_AGENT_ID` set in Vercel.
  5. Migration `013_voice_sessions`.
  6. The backend merge.

  Until then `/v1/ai/voice/capabilities` reports "not set up", and the app says so plainly.
- New Android code paths for audio focus and routing need physical-phone validation (speaker or Bluetooth, echo, real speech turn-taking). An emulator cannot certify them.
- Existing JSON/SSE chat and TTS routes are unchanged.
