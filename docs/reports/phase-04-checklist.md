# Phase 04 execution checklist

Approval: human user wrote `APPROVE PHASE 04` and requested proactive Android permission onboarding and simulated reminder call interface (2026-10-24).

Branch: `main` (commit SHA `3edffec731f348af7ec973f8f7fb0270caf54c77`). Only `LAFINA-CAPSTONE` modified; `LAFINA` and `LAFINA-backend` remain untouched and read-only.

- [x] Read AGENTS.md, PHASE-04.md, report template, and legacy `LAFINA` call components.
- [x] Verified zero business dashboard, zero Gmail, zero study tools (Pomodoro, Flashcards, Study Notes, Meetings), zero Kokoro ONNX model binaries.
- [x] Migrated simulated incoming call UI (`src/ui/screens/IncomingCallScreen.tsx`) matching LAFINA design tokens (`useTheme`, `useThemedStyles`, avatar pulse, theme styling).
- [x] Migrated connected call interface (`src/ui/components/call/CallAnsweredView.tsx`) with real-time timer, 11-bar waveform, live transcription status, quick actions, and manual buttons.
- [x] Implemented educational permission modal (`src/ui/components/call/ReminderPermissionModal.tsx`) and settings integration in `PreferencesSettingsScreen.tsx`.
- [x] Added `openNotificationSettings` native bridge in `LafinaReminderModule.kt` and exposed in `src/scheduler/reminderAlarm.ts`.
- [x] Implemented call state machine and actions in `src/scheduler/callDispatcher.ts` with fuzzy keyword matching (`detectCallKeyword`), answering, declining, snoozing, and acknowledging.
- [x] Preserved strict decoupling invariant: acknowledging a reminder marks reminder as `'acknowledged'`, but leaves the underlying academic task strictly incomplete (`isCompleted = false`).
- [x] Wired incoming alarm listeners in `App.tsx` (`EVENT_CALL_TRIGGER`, `LAFINA_NATIVE_CALL_TRIGGER`, and cold-start `consumePendingNativeCall()`).
- [x] Added proactive Android 13+ `POST_NOTIFICATIONS` permission prompt and modal trigger on app startup.
- [x] Created comprehensive test suite (`__tests__/scheduler/callDispatcherAndCallScreen.test.tsx`, 10 tests).
- [x] Ran full preflight pipeline: Typecheck PASS, ESLint PASS (0 warnings, 0 errors), Jest PASS (9 suites, 52 tests), Architecture Guardrails PASS (131 modules).
- [x] Verified Android Kotlin compilation with Gradle (`compileDebugKotlin`, `compileDataQaAndroidTestKotlin`).
- [x] Author Phase 04 completion report (`docs/reports/phase-04-report.md`).
- [x] Await human physical device validation before requesting Phase 05.

**HUMAN REQUIRED / NOT RUN:** Physical Android device testing of full-screen lock screen call display over keyguard, hardware microphone capture during simulated call, and audio output via speakerphone. The phase is **READY FOR REVIEW** / **AWAITING DEVICE VALIDATION**.
