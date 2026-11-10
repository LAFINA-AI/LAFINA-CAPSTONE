# Call Lafina 2.0 Persistent Progress Ledger

- Current branch/HEAD: `feat/call-lafina-v2` / `0df039a`
- Current phase/item: Phase 06 Secure Structured Agent Tool Bridge and Contextual Card Foundation (P06-01)
- Last verified passing test:
  - `npm run preflight`: PASS (exit code 0; 87 test suites, 1255 passed, 1 skipped; 261 architecture modules verified)
  - Focused Phase 05: `npx jest __tests__/ui/callLafinaPhase05.test.tsx`: PASS (7 tests passed)
  - ESLint: `npm run lint`: PASS (0 warnings, 0 errors)
  - TypeScript: `npm run typecheck`: PASS (0 errors)
- Last Android/device test: `NOT_RUN` (Physical device testing required for hardware audio routing, microphone indicator, and real AEC)
- Backend live status: `https://lafina-backend.vercel.app` verified live; `/openapi.json` returns 200 with all voice endpoints; `/v1/ai/voice/capabilities` enforces authentication (HTTP 401).
- Overall implementation state: `IN_PROGRESS` (Phase 05 Complete, advancing to Phase 06)

## Completed (with source/commit/test evidence)
- **Phase 00**: Baseline inventory, authorization record, pack validation, test baseline, and ledger initialization. (Commit `549b9f8`)
- **Phase 01**: Rename user-visible entry points to Call Lafina, dedicated full-screen surface `CallLafinaScreen.tsx`, live timer, bottom dock controls. (Commit `c14fea7`)
- **Phase 02**: Dual audio waveforms, native AudioTrack RMS extraction (~10Hz), truthful visual states, reduced motion. (Commit `33900b9`)
- **Phase 03**: Live audio ownership, provider voice, interruptions and lifecycle. (Commit `897c9e3`)
- **Phase 04**: Human-feeling voice persona and turn-taking. (Commit `6fb8629` / `0df039a`)
- **Phase 05**: Transcript, typed messages, and chat continuity.
  - **P05-01 & F-022**: Collapsible transcript pane showing provisional/final turns and interruption markers accurately.
  - **P05-02 & F-023**: Auto-scroll behavior when at bottom, manual scroll tracking, and floating "Jump to latest" control.
  - **P05-03 & F-024**: Typing during live voice call sends user message through controller without terminating voice or duplicating audio echo.
  - **P05-04 & F-025**: Finished conversational turns persisted to SQLite `chatStore` under authenticated `userId` isolation.
  - **P05-05**: Prevent stale state when conversation ends, restarts, or unmounts.
  - **P05-06**: Transcript layout adapts to accessible fonts and scroll container insets.
  - **P05-07**: Interrupted answer status persists as `voiceInterrupted: true` in chat store.
  - **P05-08**: Graceful text alternative preserved if cloud voice is unavailable.
  - **P05-09**: Component layout verified in Jest suite.
  - Verified with 7 new Jest tests in `__tests__/ui/callLafinaPhase05.test.tsx` and full 87-suite preflight.

## In progress
- Phase 06: Secure Structured Agent Tool Bridge and Contextual Card Foundation (`F-027`, `F-028`, `F-029`, `F-076`, `F-078`).

## Known blockers (link to BLOCKERS.md)
- `BLK-001` (DEVICE): Physical phone audio routing and hardware mic indicator tests remain `DEVICE_NOT_RUN`.
- `BLK-002` (EXTERNAL): Production signed-in ElevenAgents live session depends on active student credentials and ElevenLabs agent provisioning on server.

## Exact next action (no guesswork)
1. Commit Phase 05 implementation, tests, and reports to `feat/call-lafina-v2`.
2. Rehydrate Phase 06: `CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/PHASES/06-secure-structured-agent-tool-bridge-and-contextual-card-foundation.md`.
3. Implement structured action envelope (`ActionEnvelope`), action registry, card host component, and schema validators.
