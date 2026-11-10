# Call Lafina 2.0 Persistent Progress Ledger

- Current branch/HEAD: `feat/call-lafina-v2` / `897c9e3`
- Current phase/item: Phase 05 Live Provisional/Final Captions, Collapsible Transcript, and Typed Input (P05-01)
- Last verified passing test:
  - `npm run preflight`: PASS (exit code 0; 86 test suites, 1248 passed, 1 skipped; 261 architecture modules verified)
  - Focused Phase 04: `npx jest __tests__/ui/callLafinaPhase04.test.tsx`: PASS (13 tests passed)
  - ESLint: `npm run lint`: PASS (0 warnings, 0 errors)
  - TypeScript: `npm run typecheck`: PASS (0 errors)
- Last Android/device test: `NOT_RUN` (Physical device testing required for hardware audio routing, microphone indicator, and real AEC)
- Backend live status: `https://lafina-backend.vercel.app` verified live; `/openapi.json` returns 200 with all voice endpoints; `/v1/ai/voice/capabilities` enforces authentication (HTTP 401).
- Overall implementation state: `IN_PROGRESS` (Phase 04 Complete, advancing to Phase 05)

## Completed (with source/commit/test evidence)
- **Phase 00**: Baseline inventory, authorization record, pack validation, test baseline, and ledger initialization. (Commit `549b9f8`)
- **Phase 01**: Rename user-visible entry points to Call Lafina, dedicated full-screen surface `CallLafinaScreen.tsx`, live timer, bottom dock controls. (Commit `c14fea7`)
- **Phase 02**: Dual audio waveforms, native AudioTrack RMS extraction (~10Hz), truthful visual states, reduced motion. (Commit `33900b9`)
- **Phase 03**: Live audio ownership, provider voice, interruptions and lifecycle. (Commit `897c9e3`)
- **Phase 04**: Human-feeling voice persona and turn-taking.
  - **P04-01 & F-021**: Voice system prompt staged in `backend_integration/system_prompt_voice.txt` and `personaPolicy.ts`; tone and pacing preference prompts.
  - **P04-02 & F-017**: Markdown syntax stripping (`sanitizeSpeechText`) so headers, bold, bullets, links, and code fences are never spoken as punctuation symbols.
  - **P04-03 & F-016**: Patient turn-taking verified; tentative pauses in user speech do not trigger early replies until final turn.
  - **P04-04 & F-018**: Genuine tool progress phrases (`getToolWorkingPhrase`), transitioning to `tool_working` strictly when real `client_tool_call` starts.
  - **P04-05 & F-019**: Single soft-timeout notice on delay without repeated filler sounds ("umm", "uhh").
  - **P04-06 & F-020**: Explicit "Wait, I am thinking" directive puts Lafina in patient listening hold without unsolicited responses.
  - **P04-07**: DeepSeek reasoning and CoT content (`<think>`) strictly scrubbed from speech and transcript.
  - **P04-08**: Truthful error copy across 401, 402, 503, and tool failures.
  - **P04-09**: Timing metrics tracked (`toFirstText`, `toSilence`).
  - Verified with 13 new Jest tests in `__tests__/ui/callLafinaPhase04.test.tsx` and full 86-suite preflight.

## In progress
- Phase 05: Live provisional and final captions, collapsible transcript, and typed input (`F-022`, `F-023`, `F-024`, `F-025`).

## Known blockers (link to BLOCKERS.md)
- `BLK-001` (DEVICE): Physical phone audio routing and hardware mic indicator tests remain `DEVICE_NOT_RUN`.
- `BLK-002` (EXTERNAL): Production signed-in ElevenAgents live session depends on active student credentials and ElevenLabs agent provisioning on server.

## Exact next action (no guesswork)
1. Commit Phase 04 implementation, tests, and reports to `feat/call-lafina-v2`.
2. Rehydrate Phase 05: `CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/PHASES/05-live-provisional-final-captions-collapsible-transcript-and-typed-input.md`.
3. Implement live captions, collapsible transcript drawer, and mixed typed/voice input in Call Lafina.
