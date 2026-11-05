# Phase 10 Verification Checklist — USTP Student Handbook RAG & Citation-Backed Answers

**Date:** 2026-11-05  
**Branch:** `agy-development-cont`  
**Phase Status:** `READY FOR REVIEW` (Awaiting human device validation)

---

## 1. Automated Verification Gates

- [x] **TypeScript Strict Check:** `npm run typecheck` passed (0 errors).
- [x] **ESLint Check:** `npm run lint` passed (0 errors, 0 warnings).
- [x] **Architecture AST Guardrails:** `npm run check:architecture` passed (179 modules, 0 import cycles, 0 forbidden dependencies).
- [x] **Phase 10 Test Suite:** `npx jest __tests__/ai/phase10HandbookRAG.test.tsx` passed (15/15 tests).
- [x] **Full Jest Test Suite:** `npm test` passed (15/15 suites, 163/163 unit tests).
- [x] **Full Preflight:** `npm run preflight` passed all 4 gates consecutively.
- [x] **Native Android Debug Compilation:** `cd android && gradlew.bat :app:assembleDebug` passed (`BUILD SUCCESSFUL in 48s`).

---

## 2. On-Device Manual Check Steps

Install/open the debug build on your Android test device:

1. **Test Offline Handbook Fail-Closed Routing:**
   - In `ChatScreen` while header is set to `Offline`:
   - Send: `"What are the USTP Dean's List requirements?"`
   - [ ] Verify Lafina responds informing you that USTP Handbook queries require Online Mode.

2. **Test Online Mode USTP Chip Activation:**
   - Tap the `Offline` button in the top right to switch to `Online`.
   - [ ] Verify the header subtitle updates to `Online AI` and reveals the `[📖 USTP]` chip.
   - [ ] Verify tapping `[📖 USTP]` toggles between active and inactive states.

3. **Test Verified Citation-Backed Response:**
   - With `[📖 USTP]` enabled (highlighted):
   - Send: `"What are the requirements for Dean's List in USTP?"`
   - [ ] Verify Lafina replies with the criteria and shows the citation badge at the bottom of the response:
     `📖 Referenced USTP Student Handbook (p. XX)`

4. **Test Off-Topic / Non-Handbook Query:**
   - Send: `"What is the speed of sound?"`
   - [ ] Verify Lafina answers normally without attaching a handbook citation badge.

5. **Test Persistence:**
   - Toggle `[📖 USTP]` off, close/reopen the chat screen.
   - [ ] Verify the preference persists in local storage.

---

## 3. Human Sign-Off

- [ ] Device manual tests executed and confirmed on Android hardware.
- [ ] Explicit human approval command received: `APPROVE PHASE 11`.
