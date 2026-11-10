# Call Lafina 2.0 Persistent Progress Ledger

- Current branch/HEAD: `feat/call-lafina-v2` / `c75945e`
- Current phase/item: Phase 10 Multi-turn Draft Correction, Referents, and Idempotency (P10-01)
- Last verified passing test:
  - `npm run preflight`: PASS (exit code 0; 91 test suites, 1313 passed, 1 skipped; 274 architecture modules verified)
  - Focused Phase 09: `npx jest __tests__/ui/callLafinaPhase09.test.tsx`: PASS (18 tests passed in 4.8s)
  - All Phase tests: `npx jest callLafinaPhase`: PASS (9 test suites, 115 passed in 14.9s)
  - ESLint: `npm run lint`: PASS (0 warnings, 0 errors)
  - TypeScript: `npm run typecheck`: PASS (0 errors)
- Last Android/device test: `NOT_RUN` (Physical device testing required for hardware audio routing, microphone indicator, and real AEC)
- Backend live status: `https://lafina-backend.vercel.app` verified live; `/openapi.json` returns 200 with all voice endpoints; `/v1/ai/voice/capabilities` enforces authentication (HTTP 401).
- Overall implementation state: `IN_PROGRESS` (Phase 09 Complete, advancing to Phase 10)

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
- **Phase 09**: Explicit personal memory and privacy controls.
  - **P09-01 & F-037**: Integrated strictly with existing `chatMemoryStore` and `chat_memories` table; zero secondary databases created.
  - **P09-02 & F-038**: Bounded, owner-scoped `readLocalVoiceData(userId, 'memory', query)` with query keyword filtering, disabled setting gate, and prompt injection neutralization via `sanitizeUntrustedContext`.
  - **P09-03 & F-037**: Dedicated `MemoryReviewCard.tsx` rendering exact remembered fact, source utterance quote, status badge, and Save/Decline actions.
  - **P09-04 & F-039**: Truthful outcomes (`saved`, `duplicate`, `disabled`, `failed`, `undone`); verified authentic `Undo` removal from `chatMemoryStore`.
  - **P09-05**: Strict expiry, consent revocation, and owner account switch enforcement.
  - **P09-06**: Editable `TextInput` draft allowing student fact correction before confirming.
  - **P09-07**: Zero automatic continuous harvesting; non-explicit speech creates zero memory rows.
  - **P09-08**: Multi-account isolation prevents cross-owner spoofing or undo; rejected adversarial `<system>` prompt tokens.
  - **P09-09 & F-075**: Documented provider data disclosure footnote on card.
  - Verified with 18 new Jest tests in `__tests__/ui/callLafinaPhase09.test.tsx` and full 91-suite preflight.

## In progress
- Phase 10: Multi-turn Draft Correction, Referents, and Idempotency (`F-040`, `F-041`, `F-042`, `F-048`, `F-073`).

## Known blockers (link to BLOCKERS.md)
- `BLK-001` (DEVICE): Physical phone audio routing, hardware mic indicator, and physical alarm delivery remain `DEVICE_NOT_RUN`.
- `BLK-002` (EXTERNAL): Production signed-in ElevenAgents live session depends on active student credentials and ElevenLabs agent provisioning on server.

## Exact next action (no guesswork)
1. Commit Phase 09 implementation, tests, and reports to `feat/call-lafina-v2`.
2. Rehydrate Phase 10: `CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/PHASES/10-multi-turn-draft-correction-referents-and-idempotency.md`.
3. Implement persistent pending draft across conversational turns, spoken relative corrections, and idempotency guards.
