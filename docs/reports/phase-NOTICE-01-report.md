# PHASE NOTICE-01 — Chat sync notice refinement

**Date:** 2026-11-24, Asia/Manila.  
**Observed head during verification:** main / 340e83c3552e130e1b4145c05dde103e7aef9b6d; concurrent work and existing edits preserved. Starting SHA was not separately captured for this task.  
**Approval:** Owner requested improving the appearance of the notice explaining chats saved to the account.  
**Device used:** NONE; model/API identifiers N/A.  
**Status:** AWAITING DEVICE VALIDATION.

## 1. Scope completed

Refined only the Chat account-sync notice using the Design Partner refine workflow. Existing design reports concern onboarding and do not prescribe changes to this notice. The student needs to understand where conversations are stored and choose whether syncing stays enabled.

## 2. Change summary

- Added `src/ui/components/chat/ChatSyncNotice.tsx`: cloud icon, clear heading, readable supporting copy, separate attachment note, stacked 48dp-minimum action buttons, pressed feedback, theme tokens and scaling text without fixed text-container heights.
- Updated the existing notice slot in `src/ui/screens/ChatScreen.tsx`; removed its obsolete action-row style. Existing callback, visibility, temporary-chat exclusion, test IDs and accessible action names are preserved.
- Copy describes sync when online rather than claiming every upload is complete. It explains that attached files stay on the phone and disabling sync retains the existing cloud copy.
- No dependency, permission, backend, sync logic, database, release metadata or USTP retrieval changes. No commit/push/install. Task-start ChatScreen copy: `.local/chat-sync-notice/ChatScreen.before.tsx`.

## 3. Tests and outcomes

| Check | Command | Outcome / evidence |
|---|---|---|
| Formatting | `npx prettier --write src/ui/components/chat/ChatSyncNotice.tsx` | PASS; `.local/chat-sync-notice/format.log` |
| Chat integration | `npx jest --runInBand __tests__/ui/chatHistorySyncUi.test.tsx __tests__/ui/chatHistoryAndMemoryUi.test.tsx` | PASS: 2 suites / 16 tests; `.local/chat-sync-notice/targeted.log` |
| Required automation | `npm run preflight` | TypeScript and lint PASS; full Jest: 229 suites PASS, 1 suite FAIL; 3,097 tests PASS, 1 FAIL, 1 skipped. The failing call-memory case passed its isolated rerun. Full preflight exit 1; `.local/chat-sync-notice/preflight.log` |
| Android | Installed Gradle 9.3.1, JDK 17; `-p android --gradle-user-home .local/audit-remediation/gradle-home :app:compileDebugKotlin :app:testDebugUnitTest --offline --no-daemon --console=plain --max-workers=2 -Pkotlin.compiler.execution.strategy=in-process` | PASS: BUILD SUCCESSFUL; app unit-test task UP-TO-DATE; `.local/chat-sync-notice/android.log` |
| Architecture | `npm run check:architecture` | PASS: 522 modules, zero cycles/forbidden dependencies; `.local/chat-sync-notice/architecture.log` |
| Rendered device / TalkBack / large text | Checklist below | NOT RUN |

Gradle uses the existing read-only dependency cache at `C:/Users/USER-PC/.gradle/caches`, with a separate writable Gradle home in this checkout. Automated tests verify code and existing interactions, not the rendered physical screen.

The full run exposed a timing-sensitive failure in the existing call-memory review test (`callFlowAudit20261116.test.tsx`, finished memory card hides next review). It passed on an isolated rerun: 9 tests, `.local/chat-sync-notice/call-flow-recheck.log`. No call logic or test timeout was changed for this notice task. Final full-run outcome is recorded above.

## 4. Performance and device matrix

N/A: small static notice component; no new animation, network request or data read. Device p50/p95, PSS and benchmark JSON: NOT RUN / N/A. No measured performance claim.

## 5. Reliability, privacy and permissions

Keep-syncing and phone-only choices call the existing acknowledgment handler. No change to default sync, storage or cloud deletion. Existing semantic foreground/background tokens support theme changes. Source review confirms wrapping content, minimum touch targets, accessible button labels and a heading; measured rendered contrast and TalkBack are NOT RUN.

## 6. Human phone verification

Install a current debug build and open Chat on a signed-in account after a successful online sync whose one-time sync notice has not been acknowledged. No notice should appear for guests or temporary chats.

- Check light/dark themes, a narrow screen and large system text. Expect readable copy, no clipped text, two stacked buttons and a clearly separated attachment note.
- Choose Keep syncing. Expect notice dismissal and sync still enabled in Preferences.
- On another fresh test account, choose Use this phone only. Expect notice dismissal and sync off in Preferences; existing cloud history is retained.
- With TalkBack, expect a heading and both named buttons in reading order; decorative icons should not duplicate the message.

All phone checks are NOT RUN.

## 7. Documentation / architecture

This report only; no ADR/schema change. Architecture verification is included in preflight. Graphify NOT RUN.

## 8. Open work

Device visual and accessibility checks remain outstanding. Full preflight is not green: the existing call-memory review case failed under the full run and passed alone. Its timing sensitivity remains unresolved outside this notice scope; no call code/test changes were made. This phase is not marked passed. No further product scope started.

## 9. Review decision

- [x] TypeScript, lint, focused Chat tests, architecture and Android gates passed.
- [ ] Full preflight green — one call-memory failure; isolated rerun passes.
- [ ] Device visual/accessibility checks completed — NOT RUN.
- [x] Scope limited to notice; prior and concurrent edits preserved.

STATUS: AWAITING DEVICE VALIDATION  
STOPPED — awaiting explicit human approval
