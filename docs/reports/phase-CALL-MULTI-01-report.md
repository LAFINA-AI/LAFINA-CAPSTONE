# PHASE CALL-MULTI-01 — Two reminders in one call

**Branch / base SHA:** `main` / `e2afa500`, working tree. Existing Antigravity audit and previous USTP/GWA changes were preserved.  
**Date/time UTC:** `2026-11-26T19:52:47Z` (2026-11-27 Asia/Manila).  
**Device(s):** NONE verified during this phase. Owner screenshot supplied; no new phone capture, device identifier or live provider session.  
**Status:** `AWAITING DEVICE VALIDATION`; this is not a declaration that all repository gates or the phase passed.  
**Approval provenance:** Owner requested analysis/fix of adding two tasks in a call, explicitly leaving the unrelated errors to Antigravity. Owner supplied the exact phrase: “remind me to go walking tomorrow at 7am and then on monday 8am to go jogging”.

## 1. Scope completed and findings

1. **Shared reminder verb:** The old splitter did not split “and then on Monday 8am to go jogging”, because it required a repeated action verb. The compound guard also missed it. The new shared, dependency-free splitter recognizes that dated continuation and restores only the spoken reminder verb/activity. It does not inherit the first reminder's date/time.
2. **Older agent tool fallback:** When the model sends a single-item `prepare_lafina_action` for a compound request, the app now prepares a grouped review from the student's actual words. It no longer rejects the request or flattens the two reminders into one. Nothing saves until student confirmation.
3. **Provider payload compatibility:** The tool schema allowed a summary with structured items, but validation rejected that combination. Structured items now take precedence after validation. Nested optional `null` fields now receive the same normalization already applied at the top level. Unknown keys, invalid dates/times and missing required fields still fail closed.
4. **Typed contract:** `MultiPrepareItem` previously described an unrelated nested action envelope. It now describes the actual flat grouped item schema used by the registry, validator and service.
5. **Grouped spoken approval:** “save both”, “save both reminders” and “save both of them” now count as explicit approval. Qualified changes such as “save both but change jogging to 9am” do not.
6. **Edge cases:** Quotes protect conjunctions/semicolons in titles; ordinary “bread and milk” and trailing “save it” remain one item. Missing date/time on the second explicit reminder is left missing for review. Existing partial-save/retry, cancellation and owner-isolation behavior is preserved.

At reference time Friday November 27, 2026, the exact request is verified to produce:

| Reminder | Date | Local time |
|---|---|---|
| Go walking | Saturday November 28, 2026 | 07:00 |
| Go jogging | Monday November 30, 2026 | 08:00 |

Those dates are test expectations for that reference date; production parsing uses the phone's current local date. The screenshot does not expose the provider's actual rejected payload, so the optional-null/summary issues are independently reproduced compatibility defects, not claimed device-log diagnoses.

## 2. Change summary

| File/module | Change | Test evidence |
|---|---|---|
| `src/ai/nlu/groupedClauses.ts` | Shared quote-aware splitting and timed reminder continuation | `groupedReminderRegression.test.ts` |
| `src/ai/voiceActions/multiActionService.ts` | Use shared splitter; correctly read quoted titles without treating contractions as quotes | Grouped regression and Phase 11 suites |
| `src/cloud/voiceConversation/turnPolicy.ts` | Same compound detection as parsing; grouped approval phrases | Save approval and grouped suites |
| `src/ui/components/voice/VoiceConversationPanel.tsx` | Route a compound student request from the older single tool to grouped preparation | Simulated call regression |
| `src/ai/voiceActions/actionValidator.ts` | Validated structured items plus summary; nested optional-null normalization | Invalid/nullable payload regressions |
| `src/ai/voiceActions/types.ts`, `actionService.ts` | Align grouped payload types with the existing runtime schema | Typecheck diagnostic review, service tests |
| `__tests__/ai/groupedReminderRegression.test.ts` | Exact utterance, offline spoken-turn route, quote/approval/missing-field cases, transaction/outbox and repeat-save checks | Final regression log |
| `__tests__/ui/callDraftCardSync.test.tsx` | Online call with older single tool and structured nullable grouped tool; tap/voice confirmation, repeated save | Final regression log |

## 3. Tests and real outcomes

Logs and exact machine-readable commands: `docs/reports/evidence/call-multi-01/verification.json`.

| Check | Command/procedure | Result / evidence |
|---|---|---|
| Initial relevant tests | `npm test -- --runTestsByPath __tests__/ai/groupedReminderRegression.test.ts __tests__/ui/callLafinaPhase11.test.tsx __tests__/ui/callDraftCardSync.test.tsx __tests__/ui/callSaveApproval.test.tsx` | PASS: 4 suites / 123 tests; `targeted-tests.log`. |
| Expanded relevant tests | Same test command plus `__tests__/ai/onlineIntentAndEditableReview.test.tsx __tests__/ui/offlineCallPanel.test.tsx` | PASS: 6 suites / 166 tests, 41.42 seconds; `targeted-final.log`. Existing offline-panel capability fallback emitted a no-response warning; suite passed. |
| Final changed regressions | `npm test -- --runTestsByPath __tests__/ai/groupedReminderRegression.test.ts __tests__/ui/callDraftCardSync.test.tsx` | PASS: 2 suites / 35 tests, 14.292 seconds, after adding the offline exact-utterance case and strengthening save-receipt synchronization; `final-regressions.log`. Counts overlap the expanded run and must not be summed. |
| Repository lint | `npm run lint` | PASS; `lint.log`. |
| Final scoped lint | Exact command in JSON | PASS, exit 0; `scoped-lint-final.log` is empty. |
| Final formatting | Exact command in JSON | PASS; `format.log`. |
| Architecture | `npm run check:architecture` | PASS: 549 modules, zero cycles/forbidden dependencies; 128 offline leaves reach no online/network module; `architecture.log`. |
| Required preflight attempt | `npm run preflight` | FAIL at typecheck; `preflight.log`. A local grouped-validator type diagnostic was corrected. |
| Latest typecheck | `npm run typecheck` | Five existing unrelated errors remain; no diagnostics in this phase's changes; `typecheck-final.log`. Left to Antigravity as requested. |
| Android attempt | From `android`: `.\gradlew.bat :app:testDebugUnitTest --console=plain` | BLOCKED before tasks by access denied to the Gradle distribution `.zip.lck`; `gradle.log`. No new APK built. |
| Live phone/provider/microphone/alarm | Checklist below | NOT RUN / HUMAN REQUIRED. |

The remaining type errors are in `App.tsx:976`, `deliveryReconciler.ts:159`, `CallAnsweredView.tsx:133`, `OnlineReminderCallView.tsx:101` and `ActionCardHost.tsx:299`. The owner explicitly asked this task to skip those unrelated fixes. A full Jest run was not repeated after the preflight typecheck stop; the relevant suites above were run independently.

## 4. Performance and device matrix

No device performance baseline, p50/p95, PSS, STT/TTS benchmark or alarm-drift measurement was run. Benchmark JSON: N/A. `verification.json` is check metadata, not benchmark data. No Android identifiers/API versions were verified.

## 5. Reliability, privacy, permissions and scope

No new permissions, dependencies, backend writes/deployments, provider configuration or model changes. The review remains confirm-before-write. Tests verify two independent SQLite reminders and corresponding transactional outbox entries, repeat saves without duplicates, and no writes before confirmation. Saved rows do not establish verified Android alarm delivery. Reminder acknowledgment still does not complete a task.

## 6. Human phone verification — NOT RUN

After Antigravity's build/audit fixes are ready, build/install this checkout's updated debug app using the normal project workflow (`npm start`, then `npm run android` with an attached phone). No fresh installable APK was produced by this task.

1. Open **Call LAFINA → Online** and say the owner's exact sentence. Expect one grouped card containing **Go walking**, tomorrow **7:00 AM**, and **Go jogging**, upcoming Monday **8:00 AM**. Before approval, neither reminder should exist in the planner.
2. Say **save both** or tap **Confirm All**. Expect two separately scheduled reminders. Say **save both** again; expect an already-saved response and still exactly two reminders.
3. Prepare a fresh pair, edit only the second time on the card, then confirm. Expect the first reminder unchanged and the second at its edited time. Prepare another pair and cancel/remove one before confirmation; expect only the remaining item saved.
4. Repeat the exact request in **Offline** mode with speech models ready; also try typing it. Expect the same independent review entries. Denied speech or alarm permissions must retain manual/text/review paths and honest delivery status.
5. Verify actual scheduled alarm/call delivery on the phone. Check permission-denied delivery messaging separately. Neither live speech nor alarm delivery is certified by these Jest results.

## 7. Documentation / ADRs

This report only; no new ADR or authorization file is needed for the owner's corrective request. Existing confirmation, transaction and reminder semantics are preserved. Import-cycle check passed as above.

## 8. Open blockers and next steps

Live device validation and an Android build remain outstanding. Existing audit/typecheck fixes remain with Antigravity under the owner's instruction. Do not mark the phase passed or start another phase on the strength of these simulated-call tests.

## 9. Review decision

- [x] Relevant automated regression, lint, format and architecture checks passed.
- [ ] Repository-wide typecheck and Android gates passed (delegated/blocked as above).
- [ ] Phone checks completed and acknowledged.
- [x] Existing unrelated changes preserved; no commit, push, deployment or writes outside this checkout.

STATUS: AWAITING DEVICE VALIDATION  
STOPPED — awaiting explicit human approval
