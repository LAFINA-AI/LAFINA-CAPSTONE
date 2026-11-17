# 08 — Implementation Handoff (for Claude Opus 5.5)

- **Prepared:** 2026-11-17, from research only. No application code was written.
- **Read with:** documents `00` to `07` in this directory. This file is a summary and a starting prompt; the details live in those documents.

## 1. Project objective

Add **Floating LAFINA**: an optional floating orb that stays available over other apps on Android and opens **Quick Chat**, a compact panel where a student types a request, reviews LAFINA's confirmation card, confirms, and returns to what they were doing. Example: "add my networking exam this Friday at 9 AM" → "Create event" card → Confirm → saved with its reminder.

It must reuse LAFINA's existing assistant, scheduling, reminder and note logic. It must be off by default, never listen or read the screen on its own, and never save anything without Confirm.

## 2. Research summary

- The assistant pipeline (`chatOrchestrator.processMessage`) and the confirmation system (`useCommandReview`, `CommandReviewCard`, `confirmReviewedCommand`) are independent of the Chat screen and can be called from a new screen.
- Proposals awaiting confirmation live in JavaScript memory, so Quick Chat must run in the same JS runtime as the rest of the app.
- A "Temporary chat" mode already runs the pipeline without saving transcript rows.
- Android allows an app with the overlay permission to draw a small window over other apps and to start an activity from it. It does not allow microphone use from a bare overlay, and React Native features such as timers, `Alert` and permission prompts need a resumed activity.
- The right foreground-service type is `specialUse`. Bubbles are meant for conversations between people and are not used.
- Details: `00-RESEARCH-SUMMARY.md`, `01-REPOSITORY-AUDIT.md`, `02-ANDROID-TECHNICAL-RESEARCH.md`.

## 3. Selected architecture

| Part | Implementation |
| --- | --- |
| Orb | Kotlin view in a `TYPE_APPLICATION_OVERLAY` window, owned by `LafinaFloatingAssistantService` (foreground service, type `specialUse`), with an ongoing notification (Open, Hide) |
| Quick Chat | `QuickChatActivity`, a second translucent `ReactActivity` on the existing `ReactHost`, rendering a second registered root component `LafinaQuickChat` |
| Logic | `quickChatController` calls `chatOrchestrator.processMessage` with `temporaryChat: true` and `reviewSurface: 'quick'`; confirmation through `useCommandReview(userId, 'quick')` and the existing `CommandReviewCard` |
| Bridge | Native module `LafinaFloatingAssistant` for status, permission screen, enable/disable, close, open main app |
| Settings | One row in the Profile screen opening a settings sheet with a permission explainer |

Full design: `04-ARCHITECTURE-DESIGN.md`. UX: `03-UI-UX-SPECIFICATION.md`.

## 4. Critical repository findings

| Finding | Where |
| --- | --- |
| React Native 0.86.0, New Architecture, Hermes, no Expo; `minSdk 30`, `targetSdk 36`, `compileSdk 36` | `package.json`, `android/build.gradle:4-6`, `android/gradle.properties` |
| One `ReactHost`; one registered component today (`LafinaCapstone`) | `MainApplication.kt:12-21`, `index.js` |
| Native modules registered by hand | `CapstoneBuildPackage.kt:13-28` |
| Pipeline entry point and options | `src/ai/chatOrchestrator.ts:621`, options at `:108-136` |
| Review surfaces `'chat' \| 'voice'`; other values are normalised to `'chat'` | `src/ai/nlu/commandReview.ts:75, 2819` |
| Proposals in memory; cleared by `endReviewSession()` | `commandReview.ts:359-360, 4722` |
| `App.tsx` ends the review session when the user id changes, including first set | `App.tsx:237-259` |
| `App.tsx` restarts the reminder poller on `AppState` "active", and `AppState` is shared by all activities on the host | `App.tsx:477-507`, `src/scheduler/reminderPoller.ts` |
| Confirm is one transaction with a receipt carrying `entityType` and `entityId` | `commandReview.ts:3844`, `src/storage/assistantOperationStore.ts:6-16` |
| Online Mode rule (setting `chat.onlineMode`, connectivity, `authorizeOnlineMode`) exists only inside the Chat screen | `src/ui/screens/ChatScreen.tsx:885-935, 1057-1100` |
| The build fails on any manifest permission outside an allow-list | `scripts/check-architecture.mjs:170-198` |
| React host asserts on pausing a non-current activity | `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/runtime/ReactHostImpl.kt:269-292` |
| Live calls stop when the app is backgrounded; background calls are deferred | `docs/decisions/ADR-031-background-call-and-multimodal-feasibility.md` |
| No "Settings → Assistant" screen; settings are rows in the Profile screen | `src/ui/screens/ProfileScreen.tsx`, `src/ui/components/profile/SettingItem.tsx` |
| The app is a sideloaded preview signed with the debug key | `android/app/build.gradle:61-64` |

Line numbers were taken from branch `feature/uniguide-inspired-ui-overhaul` at `1757a0a` with uncommitted changes. They may have moved. Search for the symbol.

## 5. Phase order

| Phase | Result | Depends on |
| --- | --- | --- |
| FLOAT-00 | Baseline recorded, owner approvals, four device spikes, ADR drafted | — |
| FLOAT-01 | `'quick'` surface, controller, Online Mode gate, presence store, native wrapper (JS only) | 00 |
| FLOAT-02 | Service, orb, native module, permissions, minimal toggle | 00 |
| FLOAT-03 | Quick Chat activity shell, lifecycle guard, reminder gate, navigation and refresh hooks | 01, 02 |
| FLOAT-04 | Composer, transcript, processing and error states | 03 |
| FLOAT-05 | Review card, success card, quick actions, View in LAFINA | 04 |
| FLOAT-06 | Settings sheet, permission explainer, help | 02 |
| FLOAT-07 | Device validation, measurements, fixes, MVP gate | 05, 06 |
| FLOAT-08 | Hold-to-speak voice input (1.1) | 07 |

Each phase's tasks, acceptance criteria and failure conditions are in `05-IMPLEMENTATION-ROADMAP.md`.

## 6. Dependencies

- **No new npm or Gradle dependency.** Everything uses what is installed.
- **Owner approvals before code:** Q-00 (feature and `AGENTS.md` notice) and Q-01 (two permissions and the allow-list change). Both were answered yes on 2026-11-17; the record is `OWNER-AUTHORIZATION.md`. Q-08 (test devices) is still open.
- **Devices:** an emulator or Pixel-class device at minimum; OEM devices as available (Q-08).

## 7. Required validations

- Every phase: `npm run preflight` (typecheck, lint, Jest, architecture check); Kotlin compile and unit tests (`.\gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest -PreactNativeArchitectures=x86_64` from `android/`); `.\gradlew.bat :app:assembleDebug` when native code changed.
- Device checks listed per phase and in `06-TEST-PLAN.md`. A device behaviour counts as verified only with device model, Android version and build recorded.
- A phase report at `docs/reports/float-NN-report.md` from `templates/PHASE-REPORT.md`.

## 8. Constraints

1. Follow `AGENTS.md`: one approved phase at a time; only this repository is writable; never touch `LAFINA` or `LAFINA-backend`; no Kokoro; no API keys in the app; truthful reporting; required status lines.
2. No Accessibility Service, no screen capture, no usage-stats access, no clipboard reading, no wake word, no always-on microphone.
3. Nothing is saved without the user pressing Confirm. Do not add any path that calls `executeNluAction` or `processAndExecuteIntent` (the build guard forbids it).
4. No second AI pipeline. Quick Chat calls the existing orchestrator.
5. Keep changes to existing files to the list in `04-ARCHITECTURE-DESIGN.md` §2.4. No refactoring of `ChatScreen`, `ChatInput`, the orchestrator or the stores.
6. The feature is off by default and asks for the overlay permission only after an explicit toggle and an explanation.
7. Do not commit, push, switch branches or open pull requests unless the owner asks.
8. Do not claim Google Play approval, benchmark results or device behaviour that was not observed.

## 9. Definition of done (MVP)

The sixteen acceptance criteria in `06-TEST-PLAN.md` §6 are met; reports for FLOAT-00 to FLOAT-07 exist; ADR-036 is accepted; every device claim names its device; untested items are listed as untested; existing behaviour (Chat tab, Voice, reminders, alarms, sync) is unchanged, shown by the existing test suites and the reminder checks M-23 and M-24.

## 10. Starting prompt for Claude Opus 5.5

Copy everything in the block below into a new session opened at the repository root.

````text
You are implementing a planned feature in the LAFINA-CAPSTONE repository: "Floating LAFINA", an optional Android floating orb that opens a compact "Quick Chat" panel over other apps. A research and planning pack already exists. Your job is to implement it exactly as planned, one phase at a time, and to report truthfully.

BEFORE ANYTHING ELSE

1. Read AGENTS.md at the repository root, in full. Its rules outrank this prompt wherever they are stricter. Note in particular: one approved phase at a time; only this repository is writable; never modify LAFINA or LAFINA-backend; never claim device behaviour from Jest alone; end phase work with the required STATUS line and "STOPPED — awaiting explicit human approval".

2. Read the entire task pack in docs/plans/lafina-floating-assistant/, in this order:
   00-RESEARCH-SUMMARY.md
   01-REPOSITORY-AUDIT.md
   02-ANDROID-TECHNICAL-RESEARCH.md
   03-UI-UX-SPECIFICATION.md
   04-ARCHITECTURE-DESIGN.md
   05-IMPLEMENTATION-ROADMAP.md
   06-TEST-PLAN.md
   07-RISKS-AND-DECISIONS.md
   08-OPUS-IMPLEMENTATION-HANDOFF.md
   OWNER-AUTHORIZATION.md
   Do not skim. The pack marks claims as verified, assumed or unverified; keep that distinction in your own work.

3. Validate the repository state. Run git status and git log -1, and record the branch and HEAD. The pack was written against branch feature/uniguide-inspired-ui-overhaul at commit 1757a0a with many uncommitted changes, so line numbers in the pack may have moved: locate code by symbol name, not by line. Do not commit, push or stash on your own. The branch decision is recorded in OWNER-AUTHORIZATION.md (Q-07): a new branch created from feature/uniguide-inspired-ui-overhaul after the owner has committed the existing work there. Creating that one branch is authorised. If the working tree still has uncommitted changes that are not yours, do not commit them and do not branch: stop and ask the owner.

4. Check the owner approvals. The pack lists owner questions in document 07, section 3, and the owner's answers are recorded in OWNER-AUTHORIZATION.md. Q-00 (feature authorised, AGENTS.md notice) and Q-01 (two new manifest permissions, SYSTEM_ALERT_WINDOW and FOREGROUND_SERVICE_SPECIAL_USE, plus the allow-list change in scripts/check-architecture.mjs) must be answered "yes" in writing before you write any feature code. If that file is missing, or does not say yes to both, ask for them and stop. Stay inside the limits that file states. Q-08 (which test devices are available) is still open: ask it at the start of FLOAT-00.

HOW TO WORK

5. Start with phase FLOAT-00 in document 05 and nothing else. It records the baseline (npm run preflight and the Gradle tasks on the untouched tree), collects approvals, and runs four short device spikes whose code is thrown away. Its results decide details of later phases, especially the guard for two React activities on one host and the reminder-delivery behaviour.

6. Implement one phase at a time, in the order FLOAT-00, 01, 02, 03, 04, 05, 06, 07, then 08 only if the owner approves release 1.1. FLOAT-01 and FLOAT-02 may be done in either order; FLOAT-06 may be done any time after FLOAT-02. After each phase: stop, write docs/reports/float-NN-report.md from templates/PHASE-REPORT.md, give a short manual-check list in chat (what to install, what to do, what to expect, what was not run), and wait for the owner's explicit approval before the next phase.

7. Review current code before editing it. Each phase in document 05 lists "Relevant files". Read them first, and read any file you are about to change in full around the change. If the code differs from what the pack describes, trust the code, say what differs, and adjust the plan in the smallest way that keeps the architecture.

8. Follow the approved architecture in document 04:
   - The orb is a native Kotlin view in a TYPE_APPLICATION_OVERLAY window owned by a foreground service of type specialUse. No JavaScript runs for the idle orb. No timers, polling or wake locks while idle.
   - Quick Chat is a second, translucent ReactActivity on the app's existing ReactHost, rendering a second registered root component. It is not an overlay window.
   - Quick Chat calls the existing chatOrchestrator.processMessage with temporaryChat: true and reviewSurface: 'quick', and confirms through the existing useCommandReview hook and CommandReviewCard.
   - Changes to existing files are limited to the list in document 04, section 2.4.
   If you believe the architecture must change, stop and explain why with evidence before doing so.

9. Reuse existing LAFINA functionality. Do not build a second AI pipeline, a second confirmation card, a second theme, or a new storage layer. Do not call executeNluAction or processAndExecuteIntent from new code. Do not add npm or Gradle dependencies; if you think one is needed, stop and ask.

10. Avoid unnecessary refactoring. Do not restructure ChatScreen, ChatInput, chatOrchestrator, commandReview or the stores. The only change to commandReview.ts is adding the 'quick' review surface. Do not reformat files you touch.

11. Preserve existing application functionality. The Chat tab, Voice, Call LAFINA, reminders, alarms, sync and onboarding must behave as before. Pay special attention to reminder delivery while Quick Chat is open (risk R-03) and to the React host lifecycle with two activities (risk R-02).

12. Run the relevant tests after every phase: npm run preflight; from the android directory, .\gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest -PreactNativeArchitectures=x86_64; and .\gradlew.bat :app:assembleDebug when native code changed. Add the tests listed for the phase in document 06. Run device checks where a device or emulator is available.

13. Address failures; do not hide them. If a test fails, find the cause and fix it, or show that the same failure exists in the FLOAT-00 baseline. Never delete, skip or weaken a test to make a run pass. Never bypass the architecture check; the only allowed edit to its permission allow-list is adding the two approved permissions with a dated comment.

HARD LIMITS

14. Product and privacy limits that are not negotiable:
   - Off by default. The overlay permission is requested only after the user turns the feature on and has seen the explanation.
   - Nothing is saved without the user pressing Confirm.
   - No Accessibility Service, no screen capture, no usage-stats access, no clipboard reading, no reading of other apps' content.
   - No wake word and no always-on microphone. Voice (phase FLOAT-08 only) is hold-to-speak inside the visible Quick Chat activity.
   - Not shown on the lock screen. New components are not exported.
   - No API keys in the app. No Kokoro.

REPORTING

15. Report implementation results accurately. For every claim, say how you know: which command, which test, which device. Include the command output that matters, including failures. Do not state benchmark, battery or memory numbers you did not measure. Do not state that Google Play will approve anything.

16. Distinguish verified functionality from work that needs real-device testing. Overlay display, foreground-service behaviour, activity launch from the orb, OEM restrictions, keyboard and back behaviour, accessibility with TalkBack, and microphone capture can only be verified on a device. If you could not run a device check, say "NOT RUN" and end the phase with STATUS: AWAITING DEVICE VALIDATION. Record device model, Android version and build for every device result.

17. If you are blocked, say exactly what is blocking you and ask for one concrete thing. Use STATUS: BLOCKED.

Begin now with steps 1 to 4, then phase FLOAT-00. Do not start FLOAT-01 until the owner approves.
````

## 11. Coverage of the required prompt instructions

| Required instruction | Prompt step |
| --- | --- |
| Read `AGENTS.md` first | 1 |
| Read the entire research task pack | 2 |
| Validate the repository state and branch | 3 |
| Review current code before editing | 7 |
| Follow the approved implementation architecture | 8 |
| Implement one phase at a time | 5, 6 |
| Reuse existing LAFINA functionality | 9 |
| Run relevant tests after each phase | 12 |
| Address failures rather than hiding them | 13 |
| Avoid unnecessary refactoring | 10 |
| Preserve existing application functionality | 11 |
| Report implementation results accurately | 15 |
| Distinguish verified functionality from work requiring real-device testing | 16 |
