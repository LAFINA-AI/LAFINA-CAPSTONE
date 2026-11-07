# Phase 09 follow-up: signed-in online access and voice selection

Owner scope: all signed-in users; guests sign in for online features. Remove Student Pro checks only for Chat/DeepSeek and ElevenLabs. Preserve other paid capabilities, authentication and quotas. Keep offline voices independent.

- [x] Read current instructions, interfaces and saved-settings patterns; preserve unrelated dirty files.
- [x] Confirm voice-catalog key access (22 voices) and DeepSeek supported models (deepseek-flash, deepseek-v4-pro).
- [x] Regression tests for ordinary student/admin access, signed-out denial, disabled accounts, voice validation, offline no-network, selection persistence/cancellation and online response contract (mobile `phase09OnlineVoices` 33 tests; backend `test_online_voices.py` 9 tests).
- [x] Implement server catalogue, selected voice synthesis, mobile picker and correct chat integration.
- [x] Preflight (60 suites / 898 passed / 1 skipped), backend suite (186 passed), Android x86_64 build and emulator UI (offline/guard paths).
- [x] Live selected ElevenLabs output through real routes (200, 38,913 MP3 bytes; unknown voice 422).
- [ ] **BLOCKED:** live DeepSeek completion. The provider returned HTTP 402 "Insufficient Balance"; the owner must top up or confirm the production key.
- [x] ADR-029, report, backend_integration refresh, scoped pushes.
- [ ] **Owner/friend:** merge `codex/open-online-voices` to production `main`.
- [ ] **Human:** signed-in emulator/phone QA below. NOT RUN by the agent.

## Manual check (after merge + DeepSeek balance)

1. Install the fresh test build. On the emulator QA package, sign out and sign in once while online with an ordinary `student` account.
2. Chat → switch **Offline** to Online → ask a general question → expect a DeepSeek reply (or an explicit "DeepSeek could not reply" message, never a disguised offline answer).
3. Profile → **Online Voice · ElevenLabs** → voices load → tap a voice (✓ moves, "saved") → **Preview voice** → notice says "ElevenLabs preview finished". Close/reopen: the choice persists. In Chat, read aloud uses that voice.
4. Online Mode off or airplane mode: Offline Voice, text, local scheduling and reminders work; the picker says to enable Online Mode / connect and makes no request.
5. Guest: Online Mode asks to sign in. Account switch, Stop and closing the sheet must not play late audio.
