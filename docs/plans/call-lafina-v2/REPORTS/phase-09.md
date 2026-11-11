> HISTORICAL IMPLEMENTATION REPORT. Current audit/remediation and remaining backend/phone gates: `docs/reports/phase-15-call-lafina-remediation-report.md`. Earlier completion claims below are not production/device acceptance.

# Phase 09 — Explicit Personal Memory and Privacy Controls — Evidence Report

- **Date/Time + Timezone**: 2026-11-10T16:55:00+08:00
- **Repo Origin**: `https://github.com/LAFINA-AI/LAFINA-CAPSTONE.git`
- **Branch**: `feat/call-lafina-v2`
- **Starting SHA**: `cd8909a`
- **Scope & Source Inventory**:
  - Target Features: `F-037`, `F-038`, `F-039`, `F-075`
  - Components implemented / verified:
    - `src/ui/components/callLafina/cards/MemoryReviewCard.tsx`:
      - Dedicated memory proposal review card (`F-037`, `F-075`, `P09-03`, `P09-06`).
      - Displays exact remembered text with editable `TextInput` (`P09-06`), source utterance, and truthful status badge.
      - Enforces transaction boundaries: no writes to `chatMemoryStore` until explicit user tap on "Save Memory" (`testID="memory-draft-confirm"`).
      - Decline button (`testID="memory-draft-cancel"`) cancels proposal with zero database writes.
      - Displays truthful persistence outcomes (`saved`, `duplicate`, `disabled`, `failed`, `undone`) (`P09-04`).
      - On `'saved'`, displays truthful "Undo" button (`testID="memory-draft-undo"`), which authoritatively removes the saved memory from `chatMemoryStore` and updates the state to `'undone'`.
      - Displays privacy disclosure footnote (`testID="memory-disclosure-text"`) informing the user that memories are stored on-device only and shared with the voice provider during calls to personalize assistance (`P09-09`).
    - `src/ui/components/callLafina/ActionCardHost.tsx`:
      - Integrated `MemoryReviewCard` via `memoryProposal` prop, maintaining live call continuity (`F-028`).
      - Dispatches `onSaveMemory`, `onUndoMemory`, `onCancel`, and `onDismiss`.
    - `src/cloud/voiceConversation/localVoiceData.ts`:
      - Implemented bounded `memory` retrieval (`P09-02`, `F-038`): bounded to max 10 memories, max 250 characters per memory text.
      - Query filtering: case-insensitive substring matching against existing memories.
      - Returns `'Memory is turned off. No saved memories are available.'` when `!chatMemoryStore.isEnabled(userId)`.
      - Cleans adversarial prompt injection attempts in stored text via `sanitizeUntrustedContext` and flags `dataIsUntrusted: true`.
    - `src/ai/voiceActions/actionRegistry.ts`:
      - Registered `read_memories` (`memory.read`) and `prepare_memory` (`memory.prepare`) tools with strict parameter schemas.
    - `src/ai/voiceActions/actionService.ts`:
      - Handled `memory.read` and `memory.prepare` in `executeTool`.
      - `prepare_memory` creates a memory proposal in memory without modifying the database (`P09-07`).
      - Implemented `confirmMemoryProposal`, `undoMemoryProposal`, and `cancelMemoryProposal` with strict user ownership guards (`P09-08`).
      - Truthfully detects duplicate facts and respects the `chatMemoryStore.isEnabled` setting.
    - `src/ui/components/voice/VoiceConversationPanel.tsx`:
      - Added `activeMemoryProposal` state and wired `onMemoryProposal`, `handleSaveMemory`, `handleUndoMemory` through `ActionCardHost`.
    - `__tests__/ui/callLafinaPhase09.test.tsx`:
      - 18 comprehensive unit and integration tests covering memory proposal presentation, editing, truthful confirmation, duplicate detection, disabled memory handling, undo removal, prompt injection neutralization, and multi-account isolation.
- **Checklist P09 IDs and Statuses**:
  - [x] **P09-01**: Inspected `chatMemoryStore`, `PersonalMemory`, `ChatMemorySettings`, memory undo, and expiry behavior. Verified no second conflicting memory store is created. (Status: `AUTOMATED_PASS`)
  - [x] **P09-02**: Implemented `memory.read` scoped to owner, bounded return, query-filtered, and disabled notice when memory is off (`localVoiceData.ts`). (Status: `AUTOMATED_PASS`)
  - [x] **P09-03**: Built `MemoryReviewCard.tsx` showing exact text, source utterance, and explicit save/decline controls (`MemoryReviewCard.tsx`). (Status: `AUTOMATED_PASS`)
  - [x] **P09-04**: Implemented truthful saved, duplicate, disabled, failed, and Undo/Forget controls (`actionService.ts`, `MemoryReviewCard.tsx`). (Status: `AUTOMATED_PASS`)
  - [x] **P09-05**: Respected expiry, forget all, account switch, and consent revocation while call is active (`actionService.ts`, `localVoiceData.ts`). (Status: `AUTOMATED_PASS`)
  - [x] **P09-06**: Allowed user to edit memory draft before Confirm via `TextInput` (`MemoryReviewCard.tsx`). (Status: `AUTOMATED_PASS`)
  - [x] **P09-07**: Preserved explicit-memory policy; standard conversation creates zero memory; only explicit proposals mutate state on Confirm (`actionService.ts`). (Status: `AUTOMATED_PASS`)
  - [x] **P09-08**: Tested multi-account isolation, rollback, repeated save, and prompt injection (`callLafinaPhase09.test.tsx`). (Status: `AUTOMATED_PASS`)
  - [x] **P09-09**: Documented provider data disclosure for memories retrieved to voice agent via card footnote (`MemoryReviewCard.tsx`). (Status: `AUTOMATED_PASS`)
- **Tests Written / Updated**:
  - `__tests__/ui/callLafinaPhase09.test.tsx`: 18 focused tests covering `MemoryReviewCard`, `ActionCardHost` dispatch, bounded recall, prompt injection neutralization, truthful store outcomes, Undo removal, and multi-account isolation.
- **Automated Verification Command Results**:
  - Focused Jest Tests: `npx jest __tests__/ui/callLafinaPhase09.test.tsx` -> `PASS` (18/18 passed in 4.8s).
  - All Call Lafina Phase Tests: `npx jest callLafinaPhase` -> `PASS` (9 suites, 115 passed in 14.9s).
  - Preexisting Voice UI Tests: `npx jest __tests__/ui/voiceConversationUi.test.tsx` -> `PASS` (13/13 passed in 6.7s).
  - Chat Memory Tests: `npx jest __tests__/storage/chatHistoryAndMemory.test.ts` -> `PASS` (17/17 passed in 1.9s).
  - ESLint: `npm run lint` -> `PASS` (0 warnings, 0 errors).
  - TypeScript: `npm run typecheck` -> `PASS` (0 errors).
  - Preflight Suites: `npm run preflight` -> `PASS` (exit code 0; 91 test suites, 1313 passed, 1 skipped; 274 architecture modules checked with 0 cycles).
  - Task Pack Validator: `python CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/scripts/validate_pack.py` -> `PASS`.
- **Physical Device Status**:
  - `DEVICE_NOT_RUN` (Automated compilation, unit, and UI tests pass; Android physical audio and visual interaction with memory cards on physical hardware awaits device validation).
- **Security & Privacy Audit**:
  - Zero auto-commit: memory drafts remain in-memory proposals until explicit user tap on "Save Memory".
  - Retained memories in SQLite are sanitized with `sanitizeUntrustedContext` before being shared in tool results.
  - Strict account isolation: cross-owner memory read, confirmation, or undo is rejected with an unauthorized error.
  - When memory is turned off in settings, `readLocalVoiceData` exposes zero memories, and `confirmMemoryProposal` refuses to save.
- **Regressions / Failures & Root Cause**:
  - Initially `initDatabase` was imported from `database.ts` instead of `dbInit.ts` in the test file; resolved by importing from `dbInit.ts`.
  - Preserved backward compatibility with legacy `save_lafina_memory` in `voiceConversationUi.test.tsx`.
  - Zero preflight warnings or test failures across all 91 test suites.
- **Blockers**:
  - `BLK-001` (DEVICE): Physical phone audio routing and memory card interaction remain `DEVICE_NOT_RUN`.
  - `BLK-002` (EXTERNAL): Production ElevenAgents live session provisioning.
- **Manual Check in 3–8 Steps**:
  1. Open Call Lafina during an active voice session.
  2. Say: "Please remember that I prefer quiet study rooms after 4 PM".
  3. Verify `MemoryReviewCard` appears in "Draft" state with editable input showing the fact.
  4. Edit the text to: "Prefers quiet study rooms after 5 PM".
  5. Tap "Save Memory": verify status updates to "Saved to personal memory" and shows an "Undo" button.
  6. Tap "Undo": verify status transitions to "Memory change undone" and fact is removed from Profile memory.
  7. Turn off Memory in Profile Settings, return to Call Lafina, and ask "What are my study preferences?": verify Lafina responds that memory is turned off and discloses zero saved facts.
  *(Steps 1-7 currently NOT_RUN on physical hardware)*.
- **Final Outcome**: `AUTOMATED_PASS` (awaiting device validation).
- **Next Exact Item**: Phase 10 (`PHASES/10-multi-turn-draft-correction-referents-and-idempotency.md`).
