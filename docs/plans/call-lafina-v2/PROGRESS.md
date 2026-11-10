# Call Lafina 2.0 Persistent Progress Ledger

- Current branch/HEAD: `feat/call-lafina-v2` / `29bdc76`
- Current phase/item: Phase 12 Voice Choice, Language, and Interaction Settings (P12-01)
- Last verified passing test:
  - `npm run preflight`: PASS (exit code 0; 93 test suites, 1345 passed, 1 skipped; 276 architecture modules verified)
  - Focused Phase 11: `npx jest __tests__/ui/callLafinaPhase11.test.tsx`: PASS (16 tests passed in 4.8s)
  - Focused Phase 10: `npx jest __tests__/ui/callLafinaPhase10.test.tsx`: PASS (16 tests passed in 3.3s)
  - All Phase tests: `npx jest callLafinaPhase`: PASS (11 test suites, 147 passed in 12.5s)
  - ESLint: `npm run lint`: PASS (0 warnings, 0 errors)
  - TypeScript: `npm run typecheck`: PASS (0 errors)
- Last Android/device test: `NOT_RUN` (Physical device testing required for hardware audio routing, microphone indicator, and real AEC)
- Backend live status: `https://lafina-backend.vercel.app` verified live; `/openapi.json` returns 200 with all voice endpoints; `/v1/ai/voice/capabilities` enforces authentication (HTTP 401).
- Overall implementation state: `IN_PROGRESS` (Phase 11 Complete, advancing to Phase 12)

## Completed (with source/commit/test evidence)
- **Phase 00**: Baseline inventory, authorization record, pack validation, test baseline, and ledger initialization. (Commit `549b9f8`)
- **Phase 01**: Rename user-visible entry points to Call Lafina, dedicated full-screen surface `CallLafinaScreen.tsx`, live timer, bottom dock controls. (Commit `c14fea7`)
- **Phase 02**: Dual audio waveforms, native AudioTrack RMS extraction (~10Hz), truthful visual states, reduced motion. (Commit `33900b9`)
- **Phase 03**: Live audio ownership, provider voice, interruptions and lifecycle. (Commit `897c9e3`)
- **Phase 04**: Human-feeling voice persona and turn-taking. (Commit `6fb8629` / `0df039a`)
- **Phase 05**: Transcript, typed messages, and chat continuity. (Commit `9f3da70` / `9888e80`)
- **Phase 06**: Secure structured agent tool bridge and contextual card foundation. (Commit `b963602` / `bdf0cf5`)
- **Phase 07**: Scheduling, reminders, calendar, and agenda cards. (Commit `e01a389` / `65ca848`)
- **Phase 08**: Notes by speech and note search/result cards. (Commit `77c52ed` / `cd8909a`)
- **Phase 09**: Explicit personal memory and privacy controls. (Commit `c75945e` / `2be4e29`)
- **Phase 10**: Multi-turn draft correction, referents, and idempotency. (Commit `8c5b612` / `b0250ce`)
- **Phase 11**: Multi-action workflow, follow-ups, and authoritative results.
  - **P11-01 & F-043**: Compound request parser splitting grouped requests on conjunctions and action markers without guessing missing fields.
  - **P11-02 & F-043**: `MultiActionCard.tsx` with scrollable layout, per-item review, inline editable titles, date/time chips, status pills, and individual item removal.
  - **P11-03 & F-044**: Partial transactional execution: item failures leave previously saved items intact; retrying executes only failed items without duplicate writes.
  - **P11-04 & F-045**: Context-driven follow-up reminder generator computing reminder offset (15 minutes prior) with explicit confirmation requirement.
  - **P11-05 & F-068**: Saved items display authoritative persistent entity ID links; failed items display error messages and interactive Retry buttons.
  - **P11-06 & F-068**: Truthful spoken completion summaries with precise item counts ("1 item saved, 1 failed").
  - **P11-07**: Per-item revisions and target resolution within batch.
  - **P11-08**: Multi-account isolation: cross-owner batch execution rejected with unauthorized error.
  - **P11-09**: Max batch size capped at 5 items (`MAX_MULTI_ITEMS`) with visual truncation warning banner.
  - Verified with 16 Jest tests in `__tests__/ui/callLafinaPhase11.test.tsx` and full preflight.
- **Phase 12: Voice Choice, Language, and Interaction Settings (`F-050`, `F-051`, `F-052`, `F-053`, `F-067`, `F-070`)**: Completed.
  - **P12-01**: ElevenLabs voice selection and validated provider voice ID with persistent local storage.
  - **P12-02**: Exclusive isolated voice preview playback cancelling any active preview before starting a new one.
  - **P12-03**: Verbosity (brief/detailed) and pacing (normal/slow) preferences persisted and linked to persona policy prompt.
  - **P12-04**: Spoken language selection for English, Filipino, Taglish, and Cebuano.
  - **P12-05**: Persona policy prompt adaptation for Philippine languages with student-friendly tone and natural collegiate code-switching.
  - **P12-06**: Transcript subtitle/caption sizing accessibility (standard, large, extra large) applied to transcript turns.
  - **P12-07**: Call connected and call end haptics (`F-067`) and optional subtle tool-call audio/vibration cue (`F-070`).
  - Implemented `CallLafinaSettingsModal.tsx`, `callLafinaSettingsStore.ts`, updated `personaPolicy.ts` and `VoiceConversationPanel.tsx`.
  - Verified with 21 Jest tests in `__tests__/ui/callLafinaPhase12.test.tsx` and full preflight (94 suites / 1366 passed).
- **Phase 13: In-App Mini-Call, Background Feasibility, and Multimodal Analysis (`F-054`, `F-055`, `F-056`, `F-057`)**: Completed.
  - **P13-01 & F-054**: Built `MiniCallBar.tsx` docked above tab bar with identity indicator, live timer, speaking/listening status, quick Mute/Unmute, and quick End Call.
  - **P13-02**: Preserves active voice call connection, turns transcript, and draft action cards during in-app navigation without route remount or audio duplicate.
  - **P13-03 & F-056**: Added `startWithCallLafina` setting for deliberate start in Call Lafina on Chat open.
  - **P13-04 & P13-05 & F-055**: Authored `ADR-031` covering Android 14+ microphone foreground services, student privacy ethics, and established privacy-by-default stop on background. Marked OS backgrounding as deferred pending physical device checks.
  - **P13-07 & P13-08 & F-057**: Documented backend LLM architecture limits in ADR-031: DeepSeek is text-only without vision support; multimodal attachment classified as deferred backend unsupported.
  - **P13-09 & P13-10**: Verified regression tests across route changes and minimize/restore flows; 12 focused tests passing in `__tests__/ui/callLafinaPhase13.test.tsx`.

## In progress
- Phase 14: Reliability, Security, Privacy, and Audio Performance Regression (`F-058`, `F-059`, `F-060`, `F-061`, `F-062`, `F-063`, `F-069`, `F-072`).

## Known blockers (link to BLOCKERS.md)
- `BLK-001` (DEVICE): Physical phone audio routing, hardware mic indicator, and physical alarm delivery remain `DEVICE_NOT_RUN`.
- `BLK-002` (EXTERNAL): Production signed-in ElevenAgents live session depends on active student credentials and ElevenLabs agent provisioning on server.

## Exact next action (no guesswork)
1. Commit Phase 13 implementation, tests, and reports to `feat/call-lafina-v2`.
2. Rehydrate Phase 14: `CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/PHASES/14-reliability-security-privacy-audio-performance-regression.md`.
3. Implement reliability, security, privacy auditing, and performance regression tests.
