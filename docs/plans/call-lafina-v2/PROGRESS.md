# Call Lafina 2.0 Persistent Progress Ledger

- Current branch/HEAD: `feat/call-lafina-v2` / `549b9f8`
- Current phase/item: Phase 02 Audio Waveforms and Visual Transitions (P02-01)
- Last verified passing test:
  - `npm run preflight`: PASS (exit code 0; 83 test suites, 1203 passed, 1 skipped; 259 architecture modules verified)
  - Focused Phase 01: `npx jest __tests__/ui/callLafinaPhase01.test.tsx __tests__/ui/voiceConversationUi.test.tsx`: PASS (18 tests passed)
- Last Android/device test: `NOT_RUN` (Physical device testing required for audio routing, AEC, and live turn-taking)
- Backend live status: `https://lafina-backend.vercel.app` verified live; `/openapi.json` returns 200 with all voice endpoints; `/v1/ai/voice/capabilities` enforces authentication (HTTP 401).
- Overall implementation state: `IN_PROGRESS` (Phase 01 Complete, advancing to Phase 02)

## Completed (with source/commit/test evidence)
- **Phase 00**: Baseline inventory, authorization record, pack validation, test baseline, and ledger initialization. (Commit `549b9f8`)
- **Phase 01**:
  - **P01-01**: Renamed user-visible entry points to Call Lafina while keeping Hold to talk distinct (`VoiceModal.tsx`, `ChatScreen.tsx`, `ChatMessageItem.tsx`, `controller.ts`).
  - **P01-02**: Implemented dedicated full-screen surface `CallLafinaScreen.tsx` without 75% height cap.
  - **P01-03**: Centered Lafina identity, live duration timer (`MM:SS`), truthful online/muted badges, and clean header (`VoiceConversationPanel.tsx`).
  - **P01-04**: Ergonomic bottom control dock with Mute, Type toggle, Stop response, and End call (`VoiceConversationPanel.tsx`).
  - **P01-05**: Responsive light/dark layout with theme tokens, safe area insets, and keyboard avoiding insets.
  - **P01-06**: Navigation and state transition between Call Lafina, Chat CTA, and offline push-to-talk.
  - **P01-07**: Accessibility roles, labels, focus order, minimum hit targets >= 48dp.
  - **P01-08**: Comprehensive unit and UI test suite authored in `__tests__/ui/callLafinaPhase01.test.tsx` (18 focused tests passing, full preflight 83/83 suites passing).
  - **P01-09**: Compiled Phase 01 evidence report with explicit physical-device `NOT_RUN` markers.

## In progress
- Phase 02: Dual audio-reactive waveforms and truthful visual state transitions (`F-006` through `F-009`, `F-066`).

## Known blockers (link to BLOCKERS.md)
- `BLK-001` (DEVICE): Physical phone audio routing and turn-taking latency tests remain `DEVICE_NOT_RUN`.
- `BLK-002` (EXTERNAL): Production signed-in ElevenAgents live session depends on active student credentials and ElevenLabs agent provisioning on server.

## Exact next action (no guesswork)
1. Commit Phase 01 implementation and report to `feat/call-lafina-v2`.
2. Rehydrate Phase 02: `CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/PHASES/02-audio-waveforms-and-truthful-visual-state-transitions.md`.
3. Discover exact waveform rendering, amplitude event stream in native module and JS controller, and reduced motion fallbacks.
