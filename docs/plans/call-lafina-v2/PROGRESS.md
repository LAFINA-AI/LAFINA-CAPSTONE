# Call Lafina 2.0 Persistent Progress Ledger

- Current branch/HEAD: `feat/call-lafina-v2` / `77c52ed`
- Current phase/item: Phase 09 Explicit Personal Memory and Privacy Controls (P09-01)
- Last verified passing test:
  - `npm run preflight`: PASS (exit code 0; 90 test suites, 1295 passed, 1 skipped; 273 architecture modules verified)
  - Focused Phase 08: `npx jest __tests__/ui/callLafinaPhase08.test.tsx`: PASS (9 tests passed in 5.2s)
  - All Phase tests: `npx jest callLafinaPhase`: PASS (8 test suites, 97 passed in 9.2s)
  - ESLint: `npm run lint`: PASS (0 warnings, 0 errors)
  - TypeScript: `npm run typecheck`: PASS (0 errors)
- Last Android/device test: `NOT_RUN` (Physical device testing required for hardware audio routing, microphone indicator, and real AEC)
- Backend live status: `https://lafina-backend.vercel.app` verified live; `/openapi.json` returns 200 with all voice endpoints; `/v1/ai/voice/capabilities` enforces authentication (HTTP 401).
- Overall implementation state: `IN_PROGRESS` (Phase 08 Complete, advancing to Phase 09)

## Completed (with source/commit/test evidence)
- **Phase 00**: Baseline inventory, authorization record, pack validation, test baseline, and ledger initialization. (Commit `549b9f8`)
- **Phase 01**: Rename user-visible entry points to Call Lafina, dedicated full-screen surface `CallLafinaScreen.tsx`, live timer, bottom dock controls. (Commit `c14fea7`)
- **Phase 02**: Dual audio waveforms, native AudioTrack RMS extraction (~10Hz), truthful visual states, reduced motion. (Commit `33900b9`)
- **Phase 03**: Live audio ownership, provider voice, interruptions and lifecycle. (Commit `897c9e3`)
- **Phase 04**: Human-feeling voice persona and turn-taking. (Commit `6fb8629` / `0df039a`)
- **Phase 05**: Transcript, typed messages, and chat continuity. (Commit `9f3da70` / `9888e80`)
- **Phase 06**: Secure structured agent tool bridge and contextual card foundation. (Commit `b963602` / `bdf0cf5`)
- **Phase 07**: Scheduling, reminders, calendar, and agenda cards. (Commit `e01a389` / `65ca848`)
- **Phase 08**: Notes by speech and note search/result cards.
  - **P08-01 & F-034**: Note draft presentation via dedicated `NoteDraftCard.tsx` with editable title, body, and category.
  - **P08-02 & F-035**: Scoped `note.search` in `localVoiceData.ts` bounded to user ownership, limit of 5 notes, and untrusted-context flag.
  - **P08-03 & F-036**: Interactive `NoteResultCard.tsx` rendering search results, matching queries, note excerpts, and open-note handlers without ending active call.
  - **P08-04**: Interactive note draft preview prevents silent auto-save or premature call termination.
  - **P08-05**: Transactional persistence via existing `notesStore` / SQLite with revision bumping and sync outbox enlistment.
  - **P08-06**: Query disambiguation / clarification for ambiguous multi-match notes.
  - **P08-07**: Adversarial stored text sanitization via `sanitizeUntrustedContext` prevents prompt injection from note bodies.
  - **P08-08**: Offline manual Notes editing and list viewing preserved with full existing test suite pass.
  - **P08-09**: Voice data consent controls honored; refusal to search or draft when consent is withheld.
  - Verified with 9 new Jest tests in `__tests__/ui/callLafinaPhase08.test.tsx` and full 90-suite preflight.

## In progress
- Phase 09: Explicit Personal Memory and Privacy Controls (`F-037`, `F-038`, `F-039`, `F-075`).

## Known blockers (link to BLOCKERS.md)
- `BLK-001` (DEVICE): Physical phone audio routing, hardware mic indicator, and physical alarm delivery remain `DEVICE_NOT_RUN`.
- `BLK-002` (EXTERNAL): Production signed-in ElevenAgents live session depends on active student credentials and ElevenLabs agent provisioning on server.

## Exact next action (no guesswork)
1. Commit Phase 08 implementation, tests, and reports to `feat/call-lafina-v2`.
2. Rehydrate Phase 09: `CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/PHASES/09-explicit-personal-memory-and-privacy-controls.md`.
3. Implement `MemoryReviewCard.tsx`, memory recall limits, undo/forget action, and privacy consent gates.
