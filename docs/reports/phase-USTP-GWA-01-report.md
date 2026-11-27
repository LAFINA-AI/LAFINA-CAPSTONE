# PHASE USTP-GWA-01 — USTP call cards and GWA subject names

**Branch / base SHA:** `main` / `e2afa500` (working tree; pre-existing call/reminder changes preserved).  
**Date:** 2026-11-27, Asia/Manila; verification recorded at `2026-11-26T19:26:51Z`.  
**Device(s) available:** NONE verified; `adb devices -l` failed to start its daemon. The attached screenshot is owner-supplied evidence, not a new device run.  
**Status:** `BLOCKED` — implementation ready for review; repository gates and phone validation remain outstanding.  
**Approval provenance:** Owner's request to fix the USTP cards/flow, check edge cases, and show subject names instead of codes in GWA. This is one scoped corrective phase, with no subsequent phase started.

## 1. Scope completed

- Replaced the in-call list with a dedicated compact USTP source preview: question, highest-ranked passage title, source/page/date, short excerpt, and one action opening all matching passages in the existing source sheet.
- Removed the vertically expanding `flex: 1` source rows responsible for the screenshot's large blank gaps. The card uses content height and the existing bounded call ScrollView; its scrollbar now makes overflow discoverable. Call controls remain outside that scroll area.
- Added explicit UI for no evidence, wrong academic year, disabled sources, pending eligibility, unavailable sources, and empty successful results. Failed lookups hide passage actions and cannot display old successful passages. The online fallback now sends no-evidence results to the model as well.
- Deduplicated nonempty passage IDs in relevance order. Kept freshness/caveat warnings from all matches visible without line truncation; full passages retain their existing detailed reader. Closing a card does not end the call.
- Cleared pending citations after failed lookups, preventing previous-query references from being attached to the next answer.
- GWA COR imports now display `subjectTitle` (legacy `title` fallback), never the course code. Missing titles become editable `Unnamed subject` rows. Course codes remain internal matching metadata.
- Restored code-only saved rows when uniquely matched to the current semester's COR. Preserved grades, units, IDs and custom names. Existing historical rows are not guessed from a different semester's COR; ambiguous/unmatched rows remain editable. Corrected names persist on the student's next ordinary save.
- Repeated imports do not duplicate matched courses; distinct codes with the same subject title are retained. Invalid/nonpositive credit units are skipped.

## 2. Change summary

| File/module | Change | Evidence |
|---|---|---|
| `src/ui/components/callLafina/UstpCallSourceCard.tsx` | Dedicated themed, content-sized source preview, accessible dismissal/action, status states | `__tests__/ui/ustpCallSourceCard.test.tsx` |
| `src/ui/components/callLafina/CallReadResults.tsx` | Delegate USTP results; leave other read cards intact | Existing real-corpus card test and new UI suite |
| `src/ui/components/voice/VoiceConversationPanel.tsx` | Visible failed-search results, citation cleanup, no-evidence fallback, scroll indicator; type guard for string results | Call/offline UI suites and typecheck diagnostics |
| `src/ai/voiceActions/actionService.ts` | Emit both successful and failed lookup cards; clear stale citations | `__tests__/ai/callUstpSourcesRag.test.tsx` |
| `src/skills/gwaSubjects.ts`, `src/skills/studyLogic.ts` | Title-based COR rows, optional code identity, safe legacy-label restoration and merge | `__tests__/skills/gwaSubjects.test.ts` |
| `src/ui/screens/skills/GwaSkill.tsx` | Use title helpers for initial load, semester switching and import | `__tests__/skills/skillsUi.test.tsx` |

## 3. Tests and real outcomes

Evidence directory: `docs/reports/evidence/ustp-gwa-01/`.

| Check | Exact command/procedure | Outcome / evidence |
|---|---|---|
| Initial targeted tests | `npm test -- --runTestsByPath __tests__/ui/ustpCallSourceCard.test.tsx __tests__/skills/gwaSubjects.test.ts __tests__/ai/callUstpSourcesRag.test.tsx __tests__/skills/skillsUi.test.tsx __tests__/ui/ustpSourcesLibrary.test.tsx` | PASS: 5 suites / 57 tests at that checkpoint; `targeted-tests.log`. Later assertions recorded separately. |
| Final targeted tests | Same targeted command above, after all source and assertion changes | PASS: 5 suites / 61 tests; `targeted-final.log` (31.686 seconds). |
| Required aggregate gate | `npm run preflight` | FAIL at typecheck; `preflight.log`. It did not reach lint/Jest/architecture, so these were run independently. |
| Latest typecheck | `npm run typecheck` | FAIL: five diagnostics in existing unrelated changes; `typecheck.log`. No diagnostics remain in this phase's source changes. |
| Repository lint | `npm run lint` | PASS; `lint.log`. |
| Scoped lint | Exact paths/command in `verification.json` | PASS after final edits; `scoped-lint.log` (empty output, exit 0). |
| Format | Exact paths/command in `verification.json` | PASS after final edits; `format.log`. |
| Architecture | `npm run check:architecture` | PASS: 548 modules, zero cycles/forbidden dependencies; `architecture.log`. |
| Full Jest | `npm test` | FAIL / STOPPED after an unrelated Quick Chat integration failure; `jest-full.log`. The run was interrupted after the failure was confirmed; this is not an exhaustive full-suite result. |
| Android | From `android`: `.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --console=plain` | BLOCKED before Gradle tasks: access denied to `C:\Users\USER-PC\.gradle\wrapper\dists\gradle-9.3.1-bin\23ovyewtku6u96viwx3xl3oks\gradle-9.3.1-bin.zip.lck`; `gradle.log`. No APK built. |
| Device inventory | `adb devices -l` | FAILED: daemon could not start / cannot connect. No actual device identifier obtained. |
| Phone layout/audio/TalkBack | Checklist below | NOT RUN / HUMAN REQUIRED. |

The five typecheck blockers are `App.tsx:976` (nullable argument), `deliveryReconciler.ts:159` (missing symbol), `CallAnsweredView.tsx:133` and `OnlineReminderCallView.tsx:101` (missing `answeredAtMs` props), and `ActionCardHost.tsx:299` (edit callback return type). They appeared in the initial typecheck of the already-dirty checkout. The in-scope `LocalVoiceResult` string/object guard was corrected.

The broader Jest run failed at `__tests__/ui/appQuickChatIntegration.test.tsx:97`: after Quick Chat closed, the foreground poller start count was expected to be 2 and was 3. App/poller startup behavior is outside this phase's changes. Existing tests also emitted React `act` warnings. The final targeted run separately passed all 61 tests against the final changes; no unrelated assertions were weakened.

## 4. Performance and device matrix

Benchmarks, p50/p95, PSS and speech/alarm measurements: NOT RUN; no benchmark JSON produced. This phase changes source presentation and labels, with no model, speech-engine, alarm or network-performance claims. No Android model/API version is verified for this run.

## 5. Reliability, privacy, permissions and scope

Confirmed-COR eligibility, handbook settings, source ranking and read-only search remain enforced. No permissions, dependencies, backend changes, deployments, models or cloud credentials were added. Codes are retained only as local GWA identity metadata. Grade arithmetic is unchanged. Existing source-sheet library failures are already caught by `prepareKnowledgeLibrary`; no redundant failure handler was retained.

Design and React checklist: existing theme tokens/hooks and `StyleSheet.create`; component extracted at module scope; no hooks in conditional branches; no new effect-driven derived state; stable passage IDs; explicit button labels and 44/48dp minimum action targets. These are source/test checks, not a TalkBack or rendered contrast certification. Existing design reports were read; their unrelated onboarding advice did not widen this phase.

## 6. Human phone verification — all NOT RUN

After resolving repository/build blockers, build/install this checkout's debug APK (`npm run android` with Metro) and open LAFINA:

1. With a confirmed USTP COR and sources enabled, open Call LAFINA and ask about attendance or tattered jeans. Expect a compact source preview with page and excerpt, no stretched blank rows, and a working **See passages** action. Check offline and online modes separately.
2. Open passages, scroll/read the complete matching sources, close/back to the call, then dismiss the card. Expect the call and controls to remain usable. Ask an unrelated question afterward; previous sources must not reappear as its evidence.
3. Try an unsupported academic year/question, sources turned off, and an account without confirmed COR. Expect the actual limitation and no stale passage link/citation. Check a campus-date result for its as-of date and caveats.
4. Repeat with the largest Android font/display settings, a short landscape viewport, light/dark themes and TalkBack. Expect scroll access to long warnings and all call controls, readable source details and named actions. Live screenshot comparison and screen-reader focus are still unverified.
5. Open Skills → GWA with `IT414 / IT Elective 3` in the current COR. Expect **IT Elective 3** on initial import and saved matching rows. Change a grade, reopen, and import again; expect the grade preserved and no duplicates. Check another saved semester remains unchanged. Resolve missing/ambiguous subject names with the existing edit control.

## 7. Documentation / ADRs

This report only; existing ADR-047 behavior is refined without changing eligibility or source contracts. No ADR needed. Import-cycle check passed as above.

## 8. Open blockers

Resolve the five existing repository type errors, run Android verification in an environment with a writable Gradle cache, then perform the phone checklist. No updated APK or phone validation is claimed. Do not advance to another phase on this report.

## 9. Review decision

- [ ] All required automated gates pass (typecheck and Android blocked).
- [ ] Human phone checks completed and acknowledged.
- [x] Changes stay within the requested UI/GWA scope.
- [x] Existing unrelated working-tree changes preserved; no commit/push/deploy.

STATUS: BLOCKED  
STOPPED — awaiting explicit human approval
