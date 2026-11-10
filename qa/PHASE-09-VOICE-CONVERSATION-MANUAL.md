# Phase 09 live voice conversation phone checks (ADR-030)

Status 2026-11-08: emulator checks against a local backend and a local stand-in agent were run; see `docs/reports/phase-09-voice-conversation-report-20261108.md`. **Every check below on a physical phone with real ElevenAgents is NOT RUN.**

**Preconditions**
- The owner has completed the activation steps in `backend_integration/README.md`: key permission, secret, agent, `ELEVENLABS_AGENT_ID`, merge and migration 013.
- Install a fresh ARM64 `dataQa` APK with `adb install -r`. Never uninstall or clear data.
- Use a synthetic **student** account, not a classmate's account, voice or schedule.
- Keep a headset handy for routing checks.
- Record phone model, Android version, build, voice id and network. Do not paste transcripts of real people, tokens or signed URLs into reports.

**Access and gating**
1. **Guest:** open the voice sheet, then **Voice conversation (Online)**, then Start. Expect "Sign in to use voice conversation…" and no microphone indicator.
2. **Signed in, Online Mode off:** Start. Expect "needs Online Mode" and a **Turn on Online Mode and start** button. Nothing should start until you tap it.
3. **First use:** expect the consent card ("microphone audio streams to ElevenLabs…") before anything listens. Later sessions skip it for that account.

**Conversation**

4. Talk with natural pauses (stop mid-sentence for 1–2 s, then continue).
   - Expect live italic words while you speak, then one final line.
   - LAFINA should answer only after you finish, with the voice named under the status (the voice chosen in Profile).
5. Interrupt LAFINA mid-answer by speaking.
   - Expect its audio to stop almost at once and your new words to appear.
   - The cut answer shows "LAFINA · interrupted", and Chat later shows "Interrupted in voice conversation".
6. Tap **Stop** during an answer. Audio stops and the status returns to Listening.
7. Tap **Mute**. The status says "Muted. LAFINA cannot hear you", and the Android microphone indicator goes off. Speak: nothing is transcribed. Tap **Unmute**: listening resumes.
8. Say "Add task: read chapter 5 tomorrow at 5 pm".
   - Expect a review card. The spoken answer must not claim it was saved.
   - Nothing is in Calendar until **Confirm**. Cancel leaves nothing.
9. Ask a USTP handbook question with the handbook toggle on. The answer cites a section or page, or says plainly that the handbook could not be checked.
10. Try speaker and wired/Bluetooth headset. Check for echo: LAFINA must not answer its own voice.
11. Tap **End**.
    - The microphone indicator goes off and status says "Conversation ended".
    - Chat contains each finished turn once.
    - Push-to-talk works immediately afterwards (microphone released).

**System stops (none may restart by themselves)**

12. During a conversation, press Home, lock the screen, receive a phone call, let a LAFINA reminder call fire, turn on airplane mode, switch Online Mode off, or sign out. Each should stop the conversation; returning shows **Start again** with the reason.
13. Stay silent for 2 minutes. The conversation ends with the silence reason. After 5 minutes it ends with the time-limit reason.

**Offline independence (airplane mode)**

14. Push-to-talk dictation and typed commands, reminders, Calendar, Notes and offline TTS all work as before. Voice conversation shows "Connect to the internet…" and never opens the microphone.

**Server problems**

15. With the agent unset, the app shows "not available on the server yet". With DeepSeek billing exhausted, a turn shows the server's reason within about 25 s. Neither may look like an offline or invented answer.

Measure, if possible:
- end of speech → first answer text;
- end of speech → first audio;
- interruption → silence.

Note the sample size. An emulator cannot certify audibility, echo, routing or real turn-taking.
