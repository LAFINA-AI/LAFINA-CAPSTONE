# PHASE AUDIT-02 — Call, Chat and existing Skills edge cases / Completion Report

**Branch / starting commit:** `main` / `14bc7f07af84a977f450744f1e4831974f2af5ad`; changes remain uncommitted.  
**Date:** 2026-11-24, Asia/Manila.  
**Final automated verification completed (UTC):** 2026-11-24T07:23:55Z.  
**Device(s) used:** NONE. Device model, API level and physical audio behaviour: NOT TESTED.  
**Status:** `AWAITING DEVICE VALIDATION`.  
**Approval provenance:** Owner requested an audit of Call, Chat and the existing LAFINA Skills, a findings list and fixes. Earlier instructions authorize regression tests, prioritizing P1, preserving existing changes and avoiding Claude's concurrent USTP knowledge work.

## 1. Scope completed

Working brief: audit the existing call controllers, Chat request lifecycle and Skills generation/persistence paths; reproduce confirmed edge cases with regressions; fix P1 first; preserve the dirty checkout; leave USTP retrieval/content, backend and release work to their current owner. This is one remediation phase, not approval to start a subsequent feature phase.

| ID / priority | Confirmed edge case | Implemented behaviour |
|---|---|---|
| F-001 / P1 | Account access, Online Mode or voice consent changes while a voice session grant is being created. The initial checks have already passed. | Repeat admission checks after asynchronous startup stages and before sending text/context. A late grant is closed without opening native audio when access is gone. |
| F-002 / P1 | Study jobs survive page navigation by design, but also survived sign-out or personal-data reset. Their late result could restore cleared Skills data. | Session and owner-work revisions abort pending jobs, remove retained job results and invalidate callbacks. Ordinary navigation still preserves progress. Reset invalidation is owner-scoped and does not replace the active session or invalidate reset authorization. |
| F-003 / P1 | Study AI checks the active owner and Online Mode before awaiting connectivity, but could send source text after those conditions changed during that wait. | Recheck session lifetime, owner and Online Mode after connectivity and before sending. Recheck ownership after the model reply before it can be saved. |
| F-004 / P1 | A delayed Chat reply could write after its originating chat/message was deleted, all history was cleared, or its owner session was retired. | Capture owner-work lifetime and verify the originating question still exists in an owned session. Check asynchronous continuations and reply writes; retired requests end with a quiet cancellation. Opening another chat preserves a reply in the original chat. |
| F-005 / P2 | Chat's streaming callback and returned skill/review/undo offers could update the newly displayed account or conversation. | Guard partial text, scheduled stream paints and result presentation by owner-work lifetime plus visible owner, chat and temporary-mode identity. Drop stale proposals. |
| F-006 / P2 | An offline call could remain muted beyond its maximum duration because its loop waited indefinitely for an unmute nudge. | An independent deadline ends the call even while the loop is muted or waiting for work. Its timer is cleared at termination. |
| F-007 / P2 | Offline speech completed after hang-up and could repopulate cleared history; handoff always reported success even when cancellation failed or a speech token was pending. An old capture's cleanup could also remove a restarted call's transcription watchdog. | Commit an interrupted spoken turn once at termination; ignore stale speech completion. Stop late-issued tokens and refuse successful handoff while token ownership is unresolved. Propagate release failures. Capture cleanup only clears its own watchdog/current capture. |
| F-008 / P2 | Summary-to-Flashcards did not pass cancellation to card generation or recheck cancellation before saving the deck. | Pass the job's AbortSignal and check cancellation before persisting generated cards. |
| F-009 / P2 | Deleting a GWA semester used a settings key without the `.v1` suffix. Grades remained and could return when reopened. | Delete the actual versioned semester key transactionally; other semesters remain intact. |
| F-010 / P2 | Pausing/resetting a Pomodoro while the notification permission dialog was open could be undone by the delayed Start continuation. | Each timer change has a revision; recheck it and owner lifetime after permission before writing the running deadline or scheduling native notifications. A pause also retires a pending start. |
| F-011 / P2 | Document format validation accepted inherited object-property names. Generated file data accepted malformed/unbounded base64 and trusted the server's byte count. | Restrict formats to own keys, validate base64 structure and bound decoded data to 20 MiB. Derive byte size from actual returned data. Fail visibly without saving a corrupt/oversized file. |

These are confirmed source-level defects covered by regression tests, not a claim that every possible device/provider failure has been reproduced. Existing meeting, quiz, flashcard, material, document and call tests are included in the full automated gate. No new Skills, permission, dependency, schema migration or backend change was added. No legacy repository was written.

## 2. Change summary

| File/module | Change / reason | Regression evidence |
|---|---|---|
| `src/storage/sessionEpoch.ts`, new `ownerWorkEpoch.ts`, `accountDataReset.ts` | Session-change observers and reset-scoped retirement of asynchronous work | `studyJobs.test.tsx`, `auditAsyncEdges.test.ts`, `chatPendingLifetime.test.ts` |
| `src/skills/studyJobs.ts`, `studyAi.ts` | Abort and discard retired jobs; repeat source-sharing gates | `studyJobs.test.tsx`, `auditAsyncEdges.test.ts`, existing `studyAi.test.ts` |
| `src/cloud/voiceConversation/controller.ts` | Revalidate permission/consent/account admission during startup and send | `voiceConversationController.test.ts` |
| `src/ai/offlineCall/offlineCallController.ts` | Independent call deadline, exactly-once interruption persistence, honest release results, capture ownership | `offlineCallController.test.ts` |
| `src/ai/chatOrchestrator.ts`, `src/ui/screens/ChatScreen.tsx` | Fence retired requests and stale UI updates | `chatPendingLifetime.test.ts`, `auditChatSkillsUi.test.tsx`, existing conversation/stream/agent/history tests |
| `src/ui/screens/skills/SummarizerSkill.tsx` | Cancel generated cards before persistence | `auditChatSkillsUi.test.tsx` |
| `src/ui/screens/skills/GwaSkill.tsx` | Remove the actual persisted semester key | `skillsUi.test.tsx` |
| `src/skills/pomodoroService.ts` | Retire stale permission continuations | `auditAsyncEdges.test.ts` |
| `src/skills/documentSkill.ts` | Bound/validate format and returned file data | `auditAsyncEdges.test.ts` |

Task-start source copies and SHA-256 manifest: `.local/call-chat-skills-audit/baseline/` and `baseline-hashes.json`. Existing edits were preserved with targeted changes; no reset, checkout, stash, commit or push was performed. Claude's USTP knowledge files, database migration and release metadata were not edited by this phase. Chat's shared orchestrator received lifecycle guards around existing operations; its retrieval prompts, algorithms and source-selection logic were not rewritten.

React checklist: existing hooks remain unconditional; asynchronous UI updates check current ownership/visibility; existing theme and accessibility patterns are retained. No UI redesign was introduced.

## 3. Tests and real outcomes

| Check | Command / procedure | Outcome | Evidence |
|---|---|---|---|
| Focused regressions | `npx jest --runInBand __tests__/skills/auditAsyncEdges.test.ts __tests__/skills/studyJobs.test.tsx __tests__/skills/skillsUi.test.tsx __tests__/ai/chatPendingLifetime.test.ts __tests__/ai/offlineCallController.test.ts __tests__/cloud/voiceConversationController.test.ts` | PASS: 6 suites, 181 tests at this checkpoint; final added capture regression verified separately and in full preflight | `.local/call-chat-skills-audit/regression-tests.log` |
| Existing related flows + UI regressions | `npx jest --runInBand __tests__/ui/auditChatSkillsUi.test.tsx __tests__/ai/chatConversation.test.ts __tests__/ai/chatStreaming.test.tsx __tests__/ai/chatAgent.test.ts __tests__/ai/chatNotesAgent.test.ts __tests__/ai/chatSkillLaunch.test.ts __tests__/skills/studyAi.test.ts __tests__/skills/skillsLifecycle.test.ts` | PASS: 8 suites, 96 tests | `.local/call-chat-skills-audit/related-tests.log` |
| Document UI compatibility | `npx jest --runInBand __tests__/skills/docGenSkill.test.tsx` | PASS: 11 tests; size display uses the fixture's real 9 bytes rather than claimed 2 KB | `.local/call-chat-skills-audit/document-ui-final-tests.log` |
| Chat streaming lifecycle / query cost | `npx jest --runInBand __tests__/ai/chatPendingLifetime.test.ts` | PASS: 6 tests, including 100 partial updates without repeated existence queries and immediate suppression after deletion | `.local/call-chat-skills-audit/chat-final-tests.log` |
| Final offline-controller regressions | `npx jest --runInBand __tests__/ai/offlineCallController.test.ts` | PASS: 44 tests, including delayed old-capture cleanup after restart | `.local/call-chat-skills-audit/offline-final-tests.log` |
| TypeScript, ESLint, all Jest suites, architecture | `npm run preflight` | PASS, exit 0: 230 suites; 3,097 tests passed, 1 optional benchmark skipped; 520 modules, zero import cycles/forbidden dependencies; 123 offline leaves reach no online API/module | `.local/call-chat-skills-audit/preflight-final.log` |
| Android Kotlin compile + JVM unit tests | See exact command below | PASS: build successful; 12 JVM suites, 110 tests, zero failures/errors | `.local/call-chat-skills-audit/android-verification.log`, `android/app/build/test-results/testDebugUnitTest/TEST-*.xml` |
| Targeted formatting | `npx prettier --write` on the changed source/tests only | PASS | `.local/call-chat-skills-audit/format*.log` |
| Signed-in production calls / live model requests | No live network/paid call was made | NOT RUN | Requires owner device/account |
| Phone install and microphone/speaker validation | No phone used or installed | HUMAN REQUIRED / NOT RUN | Checklist below |

Initial test-fixture issues (React Native's getter-backed `Platform.Version`, then lint's async-expect and shadowing rules) were corrected. The first full Jest run had 229 passing suites and one failing document-size assertion: its fixture supplied 9 bytes but expected a claimed 2 KB. The test now verifies the actual byte count and passes; a complete final preflight rerun is recorded above. The first run is retained in `.local/call-chat-skills-audit/preflight.log`. Tests use actual in-memory SQLite for persistence, controlled deferred promises for races and mocked native audio/provider boundaries. They do not prove physical audio release.

Android command (existing JDK 17 / installed Gradle, offline dependencies; separate writable Gradle home):

```powershell
$env:JAVA_HOME='C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot'
$env:GRADLE_RO_DEP_CACHE='C:/Users/USER-PC/.gradle/caches'
& 'C:/Users/USER-PC/.gradle/wrapper/dists/gradle-9.3.1-bin/23ovyewtku6u96viwx3xl3oks/gradle-9.3.1/bin/gradle.bat' -p android --gradle-user-home .local/audit-remediation/gradle-home :app:compileDebugKotlin :app:testDebugUnitTest --offline --no-daemon --console=plain --max-workers=2 '-Pkotlin.compiler.execution.strategy=in-process'
```

The shared working tree includes concurrent work, so full-suite/build results describe the observed combined tree, not an isolated release commit. Tests may log expected warnings for deliberately simulated failures.

## 4. Performance and device matrix

- Chat's originating-question existence check is cached by SQLite `messages`/`chat_sessions` revision. Streaming callbacks reuse that result until relevant data changes, rather than issuing a SELECT for every token. A regression drives 100 partial-text updates without additional existence queries, clears history, then verifies a new check immediately suppresses the late text/result.
- Retired Skills jobs abort fetch work; late continuations no longer generate/persist unwanted results. Model/native implementations that ignore cancellation may finish internally; their retired result is discarded.
- Document data is limited to 20 MiB decoded, bounding downstream file writes and duplicate allocations for accepted responses. This is validation after the HTTP response; it is not a transport-level download cap.
- Device baseline/new p50/p95, sample count, peak PSS, battery and call audio timing: NOT RUN. Benchmark CSV/JSON: N/A. No measured speedup is claimed.
- The existing opt-in `AGY_MEASURE=1` host-fixture timing test was not enabled; it is the one skipped test in final preflight.
- Android versionCode/release version were not changed by this phase; no new APK was installed or distributed.

## 5. Reliability, privacy, permissions, licenses

Text/manual UI remains available on voice/model/network failures. The cancellation fence supplements the existing session authorization; it does not change authentication, entitlement, billing or server enforcement. Ordinary page navigation preserves Skills work. Explicit sign-out/reset retires it. No new microphone access path, always-on recording or speech engine was added; local speech remains `react-native-tts`.

Document validation checks encoding and size, not the full PDF/Office container structure or authenticity. Live provider outages, Android OEM audio/permission behaviour and physical microphone handoff remain device checks. No production credentials, private student content or model responses were logged for this phase.

## 6. Human phone verification

Install an owner-built debug APK from this checkout, then open LAFINA. Use disposable test chats/materials and a test account for sign-out/reset checks. Record the actual device model and Android API in review feedback.

1. **Chat:** send a slow reply request, clear/delete the originating chat while it is pending using an available UI path, and reopen history. Expect no restored reply or action card. Send another request and switch accounts if the flow permits; expect no previous-account text/cards in the new account. Normal replies still save once in the original chat.
2. **Online Call:** start with explicit Online Mode/consent, test denied microphone permission, connection failure and ending during connection. Revoke access/sign out during a delayed startup if available. Expect no unauthorized audio, a useful reason and continued text Chat access.
3. **Offline Call:** speak, stop a response mid-sentence, mute/unmute, hang up while speaking, then immediately retry or start another audio feature. Expect speech to stop, one interrupted transcript entry, no overlapping mic/speaker ownership, and recovery or an honest busy message. Leave one call muted until its configured call deadline; expect it to end.
4. **Skills generation:** start Summary → Make flashcards or another AI job, navigate away/back (progress should survive), then test sign-out or personal-data reset on disposable data while generation is pending. Expect cancellation and no restored deck/summary after the late result arrives.
5. **GWA:** create grades for two semesters; delete one, close/reopen Skills, then open the remaining one. Deleted grades stay deleted; the other semester is unchanged.
6. **Pomodoro:** on Android 13+, open notification permission on Start and pause/reset through an available concurrent action before resolving permission. Expect the timer to remain paused/reset and no stale running notification. Ordinary Start/Pause/Resume still works.
7. **Documents:** create/open/share a small valid file in each supported format. Offline, malformed-response and oversized-response tests should show a recoverable error without saving an unusable file; malformed/oversized cases are automated unless a controlled test server is available.

All seven phone checks are **NOT RUN**. Collect privacy-safe logcat timings/errors only; omit voice grants, tokens and student transcripts.

## 7. Docs/ADRs changed

This report is the only documentation added by this phase. No new architecture decision, schema diagram or USTP knowledge document was required. Architecture/import gate result is recorded with final preflight above. Graphify: NOT RUN (no dedicated Graphify gate used).

## 8. Open blockers and recommended next steps

No confirmed source-level finding above is intentionally deferred. All required automated gates passed. Physical device checks and owner review remain outstanding. Device failures should be reported with the specific test action, device model/API and a privacy-safe error log; do not infer phone success from Jest.

## 9. Review decision

- [x] All automated required checks passing.
- [ ] Manual device tests completed and human-confirmed — NOT RUN.
- [x] No new disallowed scope; existing edits preserved.
- [x] Findings, implementation and test limitations documented.

**End of Codex message:** `STATUS: AWAITING DEVICE VALIDATION` then `STOPPED — awaiting explicit human approval`.
