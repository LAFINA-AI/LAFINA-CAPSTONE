# PHASE FLOAT-01 — JS foundations / Completion Report

**Branch / commit SHA:** `feature/lafina-floating-assistant` (from `d331b97`). No commit made in this phase.
**Date/time UTC:** 2026-11-17
**Device(s) available:** Infinix X6880 (Android 15). Not used in this phase: FLOAT-01 has no native code and nothing on screen.
**Status:** `READY FOR REVIEW`
**Phase approval provenance:** Unattended run FLOAT-00 to FLOAT-07, owner 2026-11-17 ("proceed and finish everything without human interaction as much as possible"), recorded in `docs/plans/lafina-floating-assistant/OWNER-AUTHORIZATION.md`.

## 1. Scope completed

| Task (`05` FLOAT-01) | Result |
| --- | --- |
| 1. `'quick'` review surface, kept through normalisation; audit every other surface use | Done. Audit in section 2.1. |
| 2. `onlineModeGate.resolveOnlineMode(userId)` with reasons, same three checks as Chat; `ChatScreen` unchanged | Done |
| 3. `quickChatController` (send, stop, transcript, clear, last result, data-changed event, owner change, 30-minute idle) | Done |
| 4. `quickChatPresence` (open flag, navigation hand-off, subscribe) | Done |
| 5. `floatingAssistantNative` typed wrapper with safe defaults | Done |
| 6. Tests J-01 to J-08 | Done: 5 new suites |

Nothing was ported from `LAFINA`. No native code, UI, manifest or permission change.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `src/ai/nlu/commandReview.ts` | `ReviewSurface` gains `'quick'`; `prepareReviewedCommand` keeps `'quick'` instead of folding it into `'chat'` (2 edits, no other change) | Quick Chat gets its own card slot (ADR-036) | J-01 |
| `src/cloud/onlineModeGate.ts` (new) | `resolveOnlineMode(userId)` → `{enabled, reason, message?}`; reasons `on`, `auth_required`, `setting_off`, `offline`, `unavailable`. Reads `chat.onlineMode` through the existing `readInitialOnlineMode`; never writes it | Quick Chat uses the Chat tab's rule without changing `ChatScreen` | J-06 |
| `src/ai/quickChat/quickChatController.ts` (new) | The only Quick Chat caller of `chatOrchestrator.processMessage`, always with `temporaryChat: true`, `temporaryHistory`, `reviewSurface: 'quick'`, `onlineMode`, `onReplyText`, `isCurrent`. Memory-only transcript (max 20), one request at a time, `stop()`, `recordDecision()`, `undo()` (with `recordInChat: false`), `getLastResult()`, owner change and 30-minute idle reset (checked on access; no timers). Emits `LAFINA_QUICK_CHAT_DATA_CHANGED` after an applied confirm, an undo, or a low-risk action the pipeline applied. A proposal that arrives after Stop is cancelled so it cannot be confirmed later | `05` FLOAT-01 task 3; `04` §2.5 | J-02 to J-05 |
| `src/ui/quickChat/quickChatPresence.ts` (new) | Memory-only open flag (for the R-03 gate in FLOAT-03) and one-shot, owner-checked navigation hand-off | `05` task 4 | J-07 |
| `src/utils/floatingAssistantNative.ts` (new) | Typed wrapper for `NativeModules.LafinaFloatingAssistant`; strict boolean status; missing module, non-Android or a throw → safe default; orb colour validated | `05` task 5 | J-08 |
| `__tests__/ai/quickReviewSurface.test.ts` (new) | J-01, 4 tests | | PASS |
| `__tests__/ai/quickChatController.test.ts` (new) | J-02 to J-05, 12 tests | | PASS |
| `__tests__/cloud/onlineModeGate.test.ts` (new) | J-06, 10 tests | | PASS |
| `__tests__/ui/quickChatPresence.test.ts` (new) | J-07, 5 tests | | PASS |
| `__tests__/utils/floatingAssistantNative.test.ts` (new) | J-08, 7 tests | | PASS |

No new dependencies. No calls to `executeNluAction` or `processAndExecuteIntent`. None of the new modules is exported from a barrel `index.ts`.

### 2.1 Review-surface audit (task 1)

| Place | Behaviour with `'quick'` |
| --- | --- |
| `commandReview.ts:2819` `prepareReviewedCommand` | The only place a surface was normalised. Now keeps `'quick'`; an unknown value still becomes `'chat'` (tested). |
| `latestPendingReview(owner, surface = 'chat')` | Looks up by exact surface, so `'quick'` has its own slot (tested). |
| Edit and delivery changes to a proposal | Keep `current.proposal.surface`, so an edited quick card stays quick. |
| `chatOrchestrator.ts:1110, 1264, 1290` | Pass `options.reviewSurface` through to the low-risk and reviewed paths. |
| `chatOrchestrator.ts:819` conversational "yes / cancel" on an open card | Skipped when `temporaryChat` is set, so it never runs for Quick Chat. Quick Chat confirms only with the card's buttons. |
| `chatAgent.ts:166` hard-codes `'chat'` | The Chat agent runs only when `!isTemp` (line 1470) or `followUpAgent`, which itself needs `!isTemp` (line 1248). It is never reached from Quick Chat. |
| `chatOrchestrator.ts:590, 606` voice turns | Hard-code `'voice'`; unrelated to Quick Chat. |

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | Result | Evidence path / error |
|---|---|---|---|
| FLOAT-01 suites | `npx jest --runInBand __tests__/ai/quickReviewSurface.test.ts __tests__/ai/quickChatController.test.ts __tests__/cloud/onlineModeGate.test.ts __tests__/ui/quickChatPresence.test.ts __tests__/utils/floatingAssistantNative.test.ts` | PASS: 5 suites, 38 tests | console output (included in the preflight log) |
| Typecheck, lint, Jest, architecture | `npm run preflight` | Run 1 (FLOAT-01 code before `getLastResult`): PASS, 151 suites, 2,065 passed, 1 skipped. Its log was overwritten by run 2. Run 2 (final FLOAT-01 code, run while Gradle was compiling FLOAT-02 Kotlin, 550 s instead of 297 s): 1 failure, `phase10HandbookRAG.test.tsx` › "separates Ask LAFINA about USTP…", a 1 s `waitFor` timeout in a test FLOAT-01 does not touch. The same suite alone: PASS, 16/16. Clean run on the combined FLOAT-01+02 tree with nothing else running: PASS, 152 suites, 2,070 passed, 1 skipped (FLOAT-02 report). | `docs/reports/evidence/float-01/preflight-run2-under-gradle-load.log`, `docs/reports/evidence/float-01/phase10HandbookRAG-isolated.log`, `docs/reports/evidence/float-02/preflight.log` |
| Kotlin compile + JUnit | `android> .\gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest -PreactNativeArchitectures=x86_64` | PASS: BUILD SUCCESSFUL (no Kotlin changed in this phase) | `docs/reports/evidence/float-01/gradle-kotlin-unit.log` |
| `assembleDebug` | Not run | Not required: no native code changed | — |
| Device | Not run | Nothing to show on a device in this phase | — |

Acceptance criteria (`05` FLOAT-01):

| Criterion | Evidence |
| --- | --- |
| A `'quick'` and a `'chat'` proposal for one owner coexist; neither replaces the other; each confirms | J-01 "coexist" test (also with a `'voice'` card) |
| The controller writes no chat rows | J-02: counts of `messages` plus `chat_sessions` are unchanged after send and confirm; a control send without Temporary Chat in the same test does add rows. (The plan says `chat_messages`; the table in this schema is `messages`.) |
| The example sentence gives a "Create event" proposal through the controller | J-02 with "add my networking exam this Friday at 9 AM": "Create event", surface `'quick'`; after Confirm, one event on 2026-11-20 at 09:00 and one reminder |
| Online Mode matches the Chat tab for guest, offline and signed-in cases | J-06 |
| Existing tests still pass | Preflight above |

## 4. Performance and device matrix

No performance claims; nothing measured in this phase. Device matrix unchanged from FLOAT-00.

## 5. Reliability, privacy, permissions, licenses

- The Quick Chat transcript is memory-only; nothing is written to disk, synced or logged. It is dropped on owner change, sign-out (`retainOnly(null)`) and after 30 minutes without use.
- Planner writes still happen only through the existing review flow (Confirm) or the pipeline's existing low-risk actions with Undo. The controller adds no write path.
- `resolveOnlineMode` never turns Online Mode on: the opt-in setting is required, as in Chat. Guests always get `auth_required` without a server call.
- No permission, manifest or licence change.

## 6. Human phone verification

None needed for this phase (no UI or native code). The first device checks are in FLOAT-02 (orb) and FLOAT-03 (Quick Chat window).

## 7. Docs/ADRs changed

- This report and `docs/reports/evidence/float-01/`.
- ADR-036 unchanged (still proposed).

## 8. Open blockers and recommended next steps

No blockers. Notes for later phases:
1. FLOAT-04 and FLOAT-05 must call `quickChatController.recordDecision()` after the card's Confirm or Cancel. That is what emits the data-changed event and adds the outcome line. The review card itself comes from `useCommandReview(userId, 'quick')`, with `confirm({temporaryChat: true})` and `cancel({temporaryChat: true})`.
2. FLOAT-03: `App.tsx` subscribes to `QUICK_CHAT_DATA_CHANGED_EVENT` to refresh, and reads `quickChatPresence.isOpen()` for the R-03 gate.
3. The account-switch handler should call `quickChatController.retainOnly(newUserId)` next to the existing `chatDraftStore.retainOnly`. This is part of the App.tsx work in FLOAT-03.

## 9. Review decision

- [x] All automated required checks passing
- [x] No device check needed for this phase
- [x] No disallowed scope/code change
- [x] Report accurate; evidence linked

STATUS: READY FOR REVIEW
