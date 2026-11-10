# Call Lafina 2.0 Persistent Progress Ledger

- Current branch/HEAD: `feat/call-lafina-v2` / `cae65fec4b0efc25dc343e3f30a4d216defa19aa`
- Current phase/item: Phase 00 Baseline and Architecture Setup (P00-01 through P00-09)
- Last verified passing test:
  - `npm run preflight`: PASS (exit code 0; 82 test suites, 1198 passed, 1 skipped; 258 architecture modules verified)
  - `.\android\gradlew.bat -p android :app:testDataQaUnitTest`: PASS (exit code 0; 187 actionable tasks)
- Last Android/device test: `NOT_RUN` (Physical device testing required for audio routing, AEC, and live turn-taking)
- Backend live status: `https://lafina-backend.vercel.app` verified live; `/openapi.json` returns 200 with all voice endpoints; `/v1/ai/voice/capabilities` enforces authentication (HTTP 401).
- Overall implementation state: `IN_PROGRESS` (Phase 00 Baseline Complete, transitioning to Phase 01)

## Completed (with source/commit/test evidence)
- **P00-01**: Verified repository origin (`LAFINA-AI/LAFINA-CAPSTONE`), base commit `cae65fec4b0efc25dc343e3f30a4d216defa19aa`, clean tree state; created isolated feature branch `feat/call-lafina-v2`.
- **P00-02**: Read `AGENTS.md` and pack files; recorded owner authorization record `docs/plans/call-lafina-v2/OWNER_AUTHORIZATION.md` with strict scope restrictions preserved.
- **P00-03**: Source inventory taken across all target components in `src/ui/components/voice/VoiceConversationPanel.tsx`, `VoiceModal.tsx`, `useVoiceConversation.ts`, `LafinaVoiceConversationModule.kt`, `chatOrchestrator.ts`, etc.
- **P00-04**: Traced audio capture and playback ownership, WebSocket events, AEC/focus handling, and identified gaps (such as lack of playback amplitude streaming and bottom-sheet height constraint).
- **P00-05**: Probed production backend `https://lafina-backend.vercel.app` via sanctioned non-secret HTTP probes; documented live contract.
- **P00-06**: Executed baseline tests: `npm run preflight` (exit 0) and `./android/gradlew.bat -p android :app:testDataQaUnitTest` (exit 0).
- **P00-07**: Initialized ledger structure in `docs/plans/call-lafina-v2/` with 78 seeded feature IDs, state, blockers, and progress tracking.
- **P00-08**: QA acceptance matrix, regression baseline, and physical device test protocol defined.
- **P00-09**: Compiled Phase 00 baseline report.

## In progress
- Preparing Phase 01 implementation: renaming user-facing Voice Conversation entry points to Call Lafina and building the full-screen call UI shell.

## Known blockers (link to BLOCKERS.md)
- `BLK-001` (DEVICE): Physical phone audio routing and turn-taking latency tests remain `DEVICE_NOT_RUN`.
- `BLK-002` (EXTERNAL): Production signed-in ElevenAgents live session depends on active student credentials and ElevenLabs agent provisioning on server.

## Exact next action (no guesswork)
1. Commit Phase 00 setup to `feat/call-lafina-v2`.
2. Rehydrate Phase 01: `CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/PHASES/01-call-lafina-navigation-and-premium-full-screen-screen.md`.
3. Discover exact UI components and navigation paths to replace 75% bottom sheet with dedicated full-screen `CallLafinaScreen.tsx` or full-screen modal shell.
