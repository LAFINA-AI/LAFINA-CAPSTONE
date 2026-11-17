# PHASE 16 — Onboarding redesign: COR-first student setup, single USTP eligibility gate, personalization / Completion Report

**Branch / commit SHA:** `feature/uniguide-inspired-ui-overhaul` @ `1757a0a` + uncommitted working tree (not committed, not pushed)
**Date/time UTC:** 2026-11-16
**Device(s) available:** Android Emulator AVD `Medium_Phone` (`sdk_gphone16k_x86_64`, Android 17 / API 37, 1080×2400 @ 420 dpi, font scale 1.0). No physical phone.
**Status:** `AWAITING DEVICE VALIDATION`
**Phase approval provenance:** Owner's pasted onboarding implementation prompt in this session (one scoped phase; no deploy, no push, no sibling-repo or backend changes).

Inputs read (not modified): `AGENTS.md`, `docs/plans/onboarding-redesign-plan.md`, `.design/onboarding-personalization-cor-review.md`, the owner's v3 prototype `lafina-onboarding-preview-v3.html` + `lafina-v3-layout-checks.json`. A durable copy of the prototype is in `docs/design/onboarding-v3/`.

> **Not a verification system.** "COR confirmed" means *the student reviewed a COR read on their phone and saved it*. Nothing is checked with USTP. The gate controls which product features appear; it is not identity verification and must not be described as such.

## 1. Scope completed

Newly implemented (no legacy port; no Kokoro, business, Gmail or study-tool code touched):

1. **Journey.** Intro (4 pages) → Name/tone → Student setup → Goal → Routine → Study/focus → Answer style → Reminder timing → Memory review → Ready → optional 3-step quick tour (Home → Schedule → AI), skippable, replayable from Profile.
2. **Intro demos** create no records, use no microphone and request no permissions. The handbook demo quotes the bundled pack verbatim (Ch. 14 Art. 1, p. 50, "USTP Student Handbook 2023 Edition") with a source page, and says the feature needs COR setup. Welcome keeps Sign in / Create account / Continue without an account.
3. **COR-first student setup:** "Set up my USTP COR", "I'll add my COR later", "I'm not a USTP student". No campus/program picker, manual entry or override anywhere (onboarding, Profile, Calendar class modal).
4. **Three states** (`src/storage/studentSetupStore.ts`): confirmed → school features on; pending/needs-review → scheduling only (a failed, cancelled or missing COR is never "not USTP"); not-USTP → scheduling only, never asked for campus/program/COR. Older installs with an unreviewed COR profile read as `needs_review` (not eligible), without rewriting data or creating a new guest identity.
5. **COR review** (`src/ui/screens/onboarding/CorReviewFlow.tsx`, model `src/ai/vision/corReviewModel.ts`):
   - real file picking + on-device OCR, kept as a draft;
   - reading / failed / retry / replace / cancel states, with a late result after Cancel ignored;
   - summary counts, read-only campus and program, editable name, year, section and term, and explicit first/last class dates with a recurrence preview;
   - paginated subjects with each meeting reviewed separately;
   - add/exclude/remove subjects and meetings, and TBA subjects kept with no timed block;
   - duplicate and overlap review, where keep-both resets when either meeting changes;
   - compare with the original file or recognized text without marking anything reviewed;
   - labels Detected / Needs review / Reviewed by you / Added / Excluded (no "Verified by USTP", no percentages);
   - no default Monday and no AM/PM guessing;
   - draft persistence and resume, owner-checked;
   - save failure with retry, and undo.
6. **Saving** (`src/storage/corImportStore.ts`): one SQLite transaction covering the blocks, `sync_outbox`, the reviewed profile with provenance, the setup state and the ledger. A failure at any stage rolls everything back. Re-imports and retries are deduplicated by subject/session/term identity. Undo reverses only the latest import. Replacing a draft keeps the active schedule. Everything is user-scoped and moves with guest → account linking. **No backend changes and no new synced fields.**
7. **One eligibility decision** — `getUstpEligibility` / `captureUstpEligibility` (`src/storage/ustpEligibility.ts`). Used by:
   - onboarding goals, Profile, the Calendar class modal and Home;
   - chat: the restored USTP chat is blocked with an explanation, the history sheet hides USTP rows, and handbook notes are stripped;
   - `chatOrchestrator` (offline and online, plus an async recheck after the network reply);
   - `onlineChatSkill` (`useHandbook` is forced false for ineligible users on send, stream and agent step);
   - VoiceModal and the local voice context;
   - memory and statistics readers (confirmed profile only).

   Switching to scheduling mode immediately disables school features, removes a handbook goal and removes academic memories. Returning to USTP needs an explicit choice plus a still-valid reviewed import.
8. **Personalization:** each answer is stored in `student.setup.v1` and preferences. Skipped answers stay unknown, and `explicit` separates choices from defaults. Name, tone and answer style shape the greeting, local replies and online reply instructions (`src/ai/personalization.ts`). The goal picks the landing tab and orders sample prompts. Lead time sets the reminder default.
9. **Memory review:** categories (with academic shown only when eligible), per-item edit, and memory off. Academic memory comes only from a confirmed COR and never includes the student number, registration number, age, gender or nationality. The screen states that memory is stored on this phone and that selected facts may be sent with online requests.
10. **Lifecycle:** intro-seen (device), setup progress and tour are tracked separately. Back and interruptions keep answers (progress is saved on every change). Notification and alarm permission prompts are suppressed while onboarding is showing (`App.tsx`).
11. **Layout:** a shared `OnboardingPage` with a fixed bottom action and keyboard handling, light/dark and UI-variant tokens, and reduced motion (`useReducedMotion`). Accessibility labels and states are set on every control. Large font (≥1.3) or a short window (<560 dp) falls back to a scrolling body. No WebView.

**Approved deviations / limits (stated honestly):**
- Memory categories are the existing `MemoryCategory` set, not v3's "Goals & answer style" grouping.
- Answer length affects online replies and local reply framing only. Offline model output length is not controlled.
- The Profile academic card no longer shows the student number (the plan forbids treating it as a memory or display fact).
- The legacy 7-step `buildTourSteps` is kept for compatibility. The new quick tour is used after onboarding and on replay.
- Formatting: `npm run format:check` was already failing before this phase (287+ files, plus `.eslintrc.js`). Files I touched that were clean at baseline are formatted. The 16 touched files that were already dirty at baseline were **not** reformatted, to avoid rewriting other in-progress work.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `src/storage/studentSetupStore.ts` (new) | Affiliation/COR status/answers/explicit/memory choices; legacy read → `needs_review`; guest transfer | Three-state model, personalization persistence | `onboardingCorEligibility.test.ts` |
| `src/storage/ustpEligibility.ts` (new) | Authoritative gate + `captureUstpEligibility` + messages | One place for every school feature | same + `onboardingCorReviewFlow.test.tsx` |
| `src/storage/corImportStore.ts` (new) | Draft, transactional commit with outbox, dedupe ledger, undo, fault injection for tests | No partial saves, no duplicates | `saving a reviewed COR` suite |
| `src/ai/vision/corReviewModel.ts`, `corDocument.ts` (new) | Draft model, strict day/time rules, overlaps, recurrence planning; file pick/copy | No guessed days/AM-PM/dates | `COR draft rules` suite |
| `src/storage/studentMode.ts` (new) | `chooseUstpMode` / `chooseNotUstpMode` | Mode switching with memory cleanup | `switching to scheduling mode…` |
| `src/storage/onboardingProgressStore.ts`, `deviceScope.ts` (new) | Progress resume; device intro-seen | Lifecycle separation | `phase01AuthAndProfileScreens` Back/restart test |
| `src/storage/onboardingMemory.ts`, `academicProfileStore.ts` | Academic memory only from confirmed COR; provenance; no IDs/demographics | Privacy | `onboardingMemory.test.ts`, `ustpCorParser.test.ts` |
| `src/storage/guestMigration.ts`, `accountDataReset.ts` | Transfer setup/COR keys; reset returns COR to pending | Guest → account, reset | guest transfer test |
| `src/ui/screens/onboarding/*` (new) | `OnboardingPage` kit, `IntroPager`, `CorReviewFlow` | v3 layout | UI tests |
| `src/ui/screens/OnboardingScreen.tsx`, `WelcomeScreen.tsx` | Rewritten journey | Requirements 1–3, 8–10 | `phase01AuthAndProfileScreens`, `storageRecovery` |
| `src/handbook/handbookDemo.ts` (new) | Verbatim excerpt + citation from the bundled pack | No invented citations | Welcome test |
| `App.tsx`, `src/ui/tour/*` | No permission prompts during onboarding; quick tour; landing tab by goal | Lifecycle, walkthrough | preflight |
| `ProfileScreen.tsx`, `ClassScheduleModal.tsx`, `CalendarScreen.tsx`, `ViewClassesModal.tsx`, `profileStatisticsStore.ts`, `useDashboardData.ts`, `ModernHomeContent.tsx` | Manual COR fields removed; COR via review only; confirmed-profile readers; Student Setup row; Undo last import | Single gate, no manual override | `calendarClassScheduleModal.test.tsx`, Profile tests |
| `ChatScreen.tsx`, `ChatHistorySheet.tsx`, `chatOrchestrator.ts`, `onlineChatSkill.ts`, `VoiceModal.tsx`, `localConversation.ts`, `voiceConversation/*`, `chatMemoryService.ts`, `CommandGuide.tsx` | Gate applied to chat, voice, handbook and online requests; async recheck | No bypasses | `school features cannot be reached…` suite, restored-chat UI test |
| `src/ui/screens/onboarding/IntroPager.tsx` (device fix) | Hardware Back: source page → intro, page N → N−1 | Emulator showed Back exiting the app | new phase01 Back test |
| `__tests__/**` | 2 new suites; 17 suites updated to enable eligibility where they test USTP features | Coverage | preflight |
| `docs/11-UX-AND-ONBOARDING.md`, `docs/design/onboarding-v3/` | New onboarding section, local-only key table; prototype copy | Documentation | — |

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | Result | Evidence |
|---|---|---|---|
| Typecheck | `npm run typecheck` | PASS | in preflight log |
| Lint | `npm run lint` (`--max-warnings 0`) | PASS | in preflight log |
| Jest | `npm test` (`jest --runInBand`) | PASS — 140/140 suites, 1943 passed, 1 skipped (pre-existing skip) | preflight log |
| Architecture | `npm run check:architecture` | PASS — 368 modules, 0 cycles, 0 forbidden deps, 105 offline leaves reach no network | preflight log |
| Preflight (after formatting) | `npm run preflight` | PASS — rerun after the IntroPager Back fix: 140/140 suites, 1944 passed, 1 skipped; typecheck, lint and architecture PASS. The emulator was later stopped by the host for low memory and was not restarted. | `gate-preflight-final.log` |
| Format | `npm run format:check` | FAIL (pre-existing) — 288 files; no file touched in this phase is newly unformatted; the only file not in the earlier baseline list is `.eslintrc.js`, unchanged in git | `gate-format.log` |
| Android build | `android/gradlew assembleDebug testDebugUnitTest --console=plain` | PASS — BUILD SUCCESSFUL; `app-arm64-v8a-debug.apk`, `app-x86_64-debug.apk` | `gate-gradle.log` |
| Android unit tests | `testDebugUnitTest` | PASS — 76 tests, 0 failures (task up to date; no Kotlin edited in this phase) | `android/app/build/test-results/testDebugUnitTest/` |
| QA APK (bundled JS) | `android/gradlew :app:assembleDataQa -PreactNativeArchitectures=x86_64 -PlafinaProviderTesting=true` | PASS — `app-x86_64-dataQa.apk`, app id `com.lafina.capstone.providers` (fresh install; the existing `com.lafina.capstone*` apps on the emulator were not touched) | `gate-dataqa.log` |
| Native rendering 360×640 / 320×640 | Emulator, see §4 | PARTIAL — 360×640 dp: intro pages 1–3 and the handbook source page captured. **Bug found and fixed:** Android Back on the source page closed the app (IntroPager had no hardware Back handler). Setup pages, COR review and 320×640 were NOT captured before the session ended. | `docs/reports/phase-16-screens/360-01-intro.png`, `360-02-intro-say.png`, `360-03-intro-handbook.png`, `360-04-handbook-source.png` |
| Physical phone | — | NOT RUN — no phone connected | — |

Logs are in the session scratchpad: `C:\Users\USER-PC\AppData\Local\Temp\claude\99f29b548b908825\b3ed8066-39eb-4e31-855e-23849a767f15\scratchpad\` (temporary; re-run the commands to regenerate).

New test coverage, all run on the host (Jest + in-memory `node:sqlite`, not a device):
- `__tests__/storage/onboardingCorEligibility.test.ts` (24 tests):
  - states, a forged profile, legacy installs;
  - strict day and AM/PM rules, explicit real dates and recurrence, multiple and multi-day meetings, TBA;
  - keep-both and review resets;
  - the single transaction with outbox; retry and re-import with no duplicates; excluding a subject keeps the student's own blocks;
  - rollback at each of `blocks`, `profile` and `setup`; an unreviewed draft refused; undo;
  - draft ownership; guest → account;
  - mode switch and memory; restored USTP chat offline and online; general chat; the `useHandbook` request flag; mid-request eligibility loss; `captureUstpEligibility`.
- `__tests__/ui/onboardingCorReviewFlow.test.tsx` (4 tests): the full rendered review through save and undo; cancel-while-reading and a failed read; draft resume after unmount; restored USTP chat panel.
- Updated:
  - `phase01AuthAndProfileScreens` (Welcome intro + citation; scheduling-mode journey; COR later + memory off; Back/restart; set-up-COR opens review);
  - `calendarClassScheduleModal`; `onboardingMemory`; `ustpCorParser`; `storageRecovery`;
  - handbook/online suites now enable eligibility explicitly.

## 4. Performance and device matrix

Emulator `Medium_Phone` (`sdk_gphone16k_x86_64`), Android 17 / API 37, physical 1080×2400 @ 420 dpi, font scale 1.0. A 360×640 dp window was simulated with `wm size 720x1280` + `wm density 320`; both were reset afterwards. 360×640: intro pages fit with no scrolling, and the bottom action is stable. **320×640 (`wm size 640x1280`, density 320): NOT RUN.** Onboarding setup pages, memory review, COR review, dark theme, font scale 1.3: NOT RUN on device. No performance numbers were collected (N/A for this UI phase).

## 5. Reliability, privacy, permissions, licenses

- No new Android permissions. Onboarding requests none; notification/exact-alarm prompts are deferred until onboarding ends.
- The COR file is copied into app storage only for "compare with original" and is deleted on replace. Student number, registration number, age, gender, nationality and address are never written to memory or shown in the Profile card.
- Memory screen discloses that selected facts can be sent with online requests.
- No backend fields, no keys, no network calls added. `check:architecture` confirms that offline modules reach no network code.
- Risk: the eligibility gate is client-side and can be defeated by anyone who edits the local database. That is acceptable for a product gate, and it must not be presented as verification.
- Risk: OCR quality on real CORs (photos, skewed scans) is unmeasured in this phase. The flow treats every result as a draft, but how much correction a student needs is unknown.

## 6. Human phone verification

See the manual checklist in the reviewer summary below (also suitable for an emulator). The agent cannot certify:
- real OCR on the owner's COR files;
- TalkBack reading order;
- the Android system font at 1.3×/2.0×;
- light/dark switching mid-flow on a device;
- keyboard overlap on a physical keyboard;
- guest → account linking against the live backend.

## 7. Docs/ADRs changed

- `docs/11-UX-AND-ONBOARDING.md` — new "Student onboarding redesign" section: states table, gate statement, local-only settings keys.
- `docs/design/onboarding-v3/` — read-only copy of the owner's v3 prototype, contact sheet and layout checks.
- Import-cycle check: `npm run check:architecture` → 0 cycles.

## 8. Open blockers and recommended next steps (not started)

1. Owner device pass at 360×640 and 320×640 with a real COR (PDF and photo), including TalkBack and font scale 1.3.
2. Decide whether offline answer length should be enforced (currently online only).
3. Optional: reformat the 288 pre-existing Prettier failures in a dedicated formatting-only change.
4. Optional: retire the legacy 7-step tour builder once nothing references it.

## 9. Review decision

- [x] All automated required checks passing, except the pre-existing `format:check` failure documented above
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change (no backend, sibling repo, Kokoro, business/Gmail/study-tool code)
- [x] Report accurate; docs updated

`STATUS: AWAITING DEVICE VALIDATION`
`STOPPED — awaiting explicit human approval`
