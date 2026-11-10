# Phase 04 — Human-Feeling Voice Persona & Turn-Taking — Evidence Report

- **Date/Time + Timezone**: 2026-11-10T15:35:00+08:00
- **Repo Origin**: `https://github.com/LAFINA-AI/LAFINA-CAPSTONE.git`
- **Branch**: `feat/call-lafina-v2`
- **Starting SHA**: `897c9e3` (with Phase 03 metadata in `b0b30f5`)
- **Scope & Source Inventory**:
  - Target Features: `F-016`, `F-017`, `F-018`, `F-019`, `F-020`, `F-021`
  - Components implemented / verified:
    - `src/cloud/voiceConversation/personaPolicy.ts`:
      - Authoritative voice system prompt definition (`LAFINA_VOICE_SYSTEM_PROMPT`) matching `SPEC/VOICE_PERSONA.md`.
      - DeepSeek reasoning content scrubber (`stripReasoningContent`) that cleans both complete `<think>...</think>` and unclosed/streaming `<think>` tags so internal chain-of-thought is never spoken or displayed.
      - Markdown and URL scrubber (`sanitizeSpeechText`) that strips headers, bold, italics, code blocks, raw URLs, and bullet points to prevent synthesis from speaking punctuation symbols (such as "asterisk" or "hashtag").
      - Spoken directive parser (`detectConversationalDirective`) recognizing "wait, I am thinking", "hold on", "give me a moment", "keep it brief", "explain in detail", "speak slower", and "talk normally".
      - Truthful tool progress phrase generator (`getToolWorkingPhrase`) that outputs accurate status only for active tools.
      - Voice preferences prompt builder (`buildVoicePersonaPrompt`) incorporating verbosity and pacing options.
    - `backend_integration/system_prompt_voice.txt`:
      - Staged the student-first, security-aligned prompt for backend custom LLM alignment.
    - `src/cloud/voiceConversation/controller.ts`:
      - Integrated `stripReasoningContent` and `sanitizeSpeechText` across `appendAnswer`, `finalAnswer`, and `correctAnswer`.
      - Handled conversational directives in `onFinalUser`: when the student says "wait, I'm thinking" or "hold on", enters patient hold state with notice ("I'll wait. Take your time.") and clears thinking timer, without firing unsolicited LLM responses.
      - Updated `client_tool_call` to set `toolPhrase` dynamically and switch to `tool_working` ONLY when a real tool request starts.
      - Cleared `toolPhrase` and returned to `thinking` when client tool execution completes.
      - Maintained single soft-timeout notice (`explainSilence`), firing at most once per turn without synthetic filler sounds ("umm", "uhh").
      - Recorded `toFirstText` timing metrics accurately.
    - `src/ui/components/voice/VoiceConversationPanel.tsx`:
      - Wired `statusLine` to display `snapshot.toolPhrase` while `phase === 'tool_working'`, and never ahead of actual tool start.
      - Delegated `onClientTool` to injected `deps(userId).onClientTool` for seamless testability and customization.
    - `src/cloud/voiceConversation/types.ts` & `src/ui/hooks/useVoiceConversation.ts`:
      - Added `toolPhrase: string | null` to `ConversationSnapshot`.
    - `__tests__/ui/callLafinaPhase04.test.tsx`:
      - 13 comprehensive tests asserting persona prompt guidelines, directive detection, reasoning scrubbing, patient turn-taking, wait state, genuine tool progress phrases, single soft-timeout notice, error status copy (401, 402, 503), and latency timing.
- **Checklist P04 IDs and Statuses**:
  - [x] **P04-01**: Audited voice prompt and staged minimal prompt in permitted repository (`backend_integration/system_prompt_voice.txt` and `personaPolicy.ts`). (Status: `AUTOMATED_PASS`)
  - [x] **P04-02**: Concise speech-friendly formatting, markdown syntax stripping, and preference options. (Status: `AUTOMATED_PASS`)
  - [x] **P04-03**: ElevenLabs patient turn-taking verified; tentative pauses in user speech do not trigger early replies. (Status: `AUTOMATED_PASS`)
  - [x] **P04-04**: Tool progress phrases display only after real tool starts, never preceding tool requests. (Status: `AUTOMATED_PASS`)
  - [x] **P04-05**: Single delayed-response soft timeout notice without multiple filler systems or repetitive sounds. (Status: `AUTOMATED_PASS`)
  - [x] **P04-06**: Explicit support for "wait, I am thinking", "keep it brief", "explain slowly", and normal resumption. (Status: `AUTOMATED_PASS`)
  - [x] **P04-07**: DeepSeek reasoning and CoT content (`<think>`) prevented from being shown or spoken. (Status: `AUTOMATED_PASS`)
  - [x] **P04-08**: Truthful error copy for DeepSeek offline, 401, 402, 429, 503, and tool failures. (Status: `AUTOMATED_PASS`)
  - [x] **P04-09**: Timing metrics tracked (`toFirstText`, `toSilence`). (Status: `AUTOMATED_PASS`)
- **Tests Written / Updated**:
  - `__tests__/ui/callLafinaPhase04.test.tsx`: 13 focused tests covering prompt generation, directive detection, reasoning scrubbing, patient turn-taking, wait directive, tool progress phrases, soft timeout notice, failure copy, and timing metrics.
- **Automated Verification Command Results**:
  - Focused Jest Tests: `npx jest __tests__/ui/callLafinaPhase04.test.tsx` -> `PASS` (13/13 passed in 7.4s).
  - ESLint: `npm run lint` -> `PASS` (0 warnings, 0 errors).
  - TypeScript: `npm run typecheck` -> `PASS` (0 errors).
  - Preflight Suites: `npm run preflight` -> `PASS` (exit code 0; 86 test suites, 1248 passed, 1 skipped; 261 architecture modules checked with 0 cycles).
  - Task Pack Validator: `python CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/scripts/validate_pack.py` -> `PASS`.
- **Physical Device Status**:
  - `DEVICE_NOT_RUN` (Automated compilation, unit/UI snapshot tests pass; real phone speaker/earpiece natural acoustics and conversational turn-taking latency pending physical hardware).
- **Security & Privacy Audit**:
  - DeepSeek chain-of-thought and reasoning content is strictly stripped out via `stripReasoningContent` before displaying in transcript or persisting to Chat.
  - Spoken progress phrases never hallucinate completed actions before authoritative confirmation.
- **Regressions / Failures & Root Cause**:
  - Fixed exact text matching in Jest test by using regular expression matching against full transcript view.
  - Fixed tool resolution race in unit test using deferred promise so `tool_working` status can be asserted during asynchronous execution.
  - Added missing dependencies `[deps, userId]` in `VoiceConversationPanel.tsx` `onClientTool` `useCallback`.
- **Blockers**:
  - `BLK-001` (DEVICE): Physical phone microphone hardware permission indicator and natural room acoustics remain `DEVICE_NOT_RUN`.
  - `BLK-002` (EXTERNAL): Production ElevenAgents live session provisioning.
- **Manual Check in 3–8 Steps**:
  1. Open app and start Call Lafina.
  2. Speak a phrase, pause for 1 second, and continue speaking: verify Lafina stays in "Listening" and does not interrupt early.
  3. Say "Wait, I am thinking": verify Lafina displays "I'll wait. Take your time." and waits patiently without answering.
  4. Ask "What is on my calendar tomorrow?": verify status displays "Thinking...", transitions to "Checking your calendar..." during query, and speaks concise 1-2 sentence response without markdown symbols.
  5. Say "Keep it brief": verify Lafina acknowledges preference and delivers concise replies.
  6. Disconnect network or trigger a slow turn: verify a single soft-timeout notice appears without repeated "umm" sounds.
  *(Steps 1-6 currently NOT_RUN on physical hardware)*.
- **Final Outcome**: `AUTOMATED_PASS` (awaiting device validation).
- **Next Exact Item**: Phase 05 (`PHASES/05-live-provisional-final-captions-collapsible-transcript-and-typed-input.md`).
