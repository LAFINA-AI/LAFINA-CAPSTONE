# Call Lafina 2.0 Persistent Progress Ledger

- Current branch/HEAD: `feat/call-lafina-v2` / `9888e80`
- Current phase/item: Phase 07 Scheduling, Reminders, Calendar and Agenda Cards (P07-01)
- Last verified passing test:
  - `npm run preflight`: PASS (exit code 0; 88 test suites, 1274 passed, 1 skipped; 267 architecture modules verified)
  - Focused Phase 06: `npx jest __tests__/ui/callLafinaPhase06.test.tsx`: PASS (19 tests passed)
  - All Phase tests: `npx jest callLafinaPhase`: PASS (6 test suites, 76 passed)
  - ESLint: `npm run lint`: PASS (0 warnings, 0 errors)
  - TypeScript: `npm run typecheck`: PASS (0 errors)
- Last Android/device test: `NOT_RUN` (Physical device testing required for hardware audio routing, microphone indicator, and real AEC)
- Backend live status: `https://lafina-backend.vercel.app` verified live; `/openapi.json` returns 200 with all voice endpoints; `/v1/ai/voice/capabilities` enforces authentication (HTTP 401).
- Overall implementation state: `IN_PROGRESS` (Phase 06 Complete, advancing to Phase 07)

## Completed (with source/commit/test evidence)
- **Phase 00**: Baseline inventory, authorization record, pack validation, test baseline, and ledger initialization. (Commit `549b9f8`)
- **Phase 01**: Rename user-visible entry points to Call Lafina, dedicated full-screen surface `CallLafinaScreen.tsx`, live timer, bottom dock controls. (Commit `c14fea7`)
- **Phase 02**: Dual audio waveforms, native AudioTrack RMS extraction (~10Hz), truthful visual states, reduced motion. (Commit `33900b9`)
- **Phase 03**: Live audio ownership, provider voice, interruptions and lifecycle. (Commit `897c9e3`)
- **Phase 04**: Human-feeling voice persona and turn-taking. (Commit `6fb8629` / `0df039a`)
- **Phase 05**: Transcript, typed messages, and chat continuity. (Commit `9f3da70` / `9888e80`)
- **Phase 06**: Secure structured agent tool bridge and contextual card foundation.
  - **P06-01 & F-027**: Official ElevenAgents and DeepSeek tool definitions registered in `actionRegistry.ts` (`read_lafina_data`, `prepare_lafina_action`, `save_lafina_memory`, `read_calendar`, `search_notes`).
  - **P06-02 & F-078**: Strict runtime schema validators (`actionValidator.ts`) enforcing `ActionEnvelope` format, date/time syntax, string bounds, and rejecting cross-owner spoofing.
  - **P06-03 & F-076**: Release-safe capability and consent checks (`actionSecurity.ts`) checking session token, guest role, user consent, and online entitlement.
  - **P06-04**: Action phase service (`actionService.ts`) with unique IDs, source turn, and `isCurrent()` cancellation guards against stale callbacks.
  - **P06-05 & F-049**: Real tool lifecycle event feed (`checking/preparing/waiting/confirming/saving/done/failed`) derived from actual actions.
  - **P06-06 & F-028**: Typed `ActionCardHost` component keeping cards readable and interactive over active call with fallback for unknown kinds.
  - **P06-07 & F-029**: Card states `prepare`, `edit`, `cancel`, `confirm`, `result`, `failed`, `expired` preserving `CommandReviewCard` transaction semantics.
  - **P06-08**: Staged backend contract proposal `backend_integration/call_lafina_v2_proposals/agent_tools_contract.md`.
  - **P06-09**: Prompt injection detection and context sanitization preventing instruction tampering.
  - **P06-10**: Verified with 19 new Jest tests in `__tests__/ui/callLafinaPhase06.test.tsx` and full 88-suite preflight.

## In progress
- Phase 07: Scheduling, Reminders, Calendar and Agenda Cards (`F-030`, `F-031`, `F-032`, `F-033`).

## Known blockers (link to BLOCKERS.md)
- `BLK-001` (DEVICE): Physical phone audio routing and hardware mic indicator tests remain `DEVICE_NOT_RUN`.
- `BLK-002` (EXTERNAL): Production signed-in ElevenAgents live session depends on active student credentials and ElevenLabs agent provisioning on server.

## Exact next action (no guesswork)
1. Commit Phase 06 implementation, tests, and reports to `feat/call-lafina-v2`.
2. Rehydrate Phase 07: `CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/PHASES/07-scheduling-reminders-calendar-and-agenda-cards.md`.
3. Implement task/reminder review card, calendar event review card, read-only agenda card, and conflict checker.
