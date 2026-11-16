# Phase 00 — Baseline Audit & Architectural Inventory

> **Branch:** `feature/uniguide-inspired-ui-overhaul`  
> **Branched From:** `Lem-branch` (`d86a0fe`)  
> **UniGuide-Mobile Reference SHA:** `0d44b4e62b08626774e43ad37a6943c3e7c104c3`  
> **Device Status (`adb devices -l`):** NONE connected

---

## 1. Baseline Verification Measurements (Before Code Changes)

| Check | Command | Outcome | Notes |
|---|---|---|---|
| TypeScript | `npm run typecheck` | PASS | 0 errors |
| ESLint | `npm run lint` | PASS | 0 errors, 0 warnings (`--max-warnings 0`) |
| Architecture & Offline Boundary | `npm run check:architecture` | PASS | 333 TS modules; 0 cycles; 0 forbidden deps; 94 offline leaves clean |
| Jest Suite | `npm test -- --runInBand` | PASS | 129/129 suites passed; 1,798 passed, 1 skipped (1,799 total) in 159.32 s |
| Android Device / Emulator | `adb devices -l` | NONE | Empty attached device list; visual on-device QA deferred to device attachment |

---

## 2. Current LAFINA Architecture & Screen Inventory

### Navigation & App Shell
- [App.tsx](../../../App.tsx): Custom state-driven root shell wrapped in `SafeAreaProvider` and `ThemeProvider`. Renders `StorageRecoveryScreen`, `SynthSplash`, `AuthBackdrop` (`WelcomeScreen`, `LoginScreen`, `RegisterScreen`), `OnboardingScreen`, main tab container (`dashboard`, `calendar`, `chat`, `notes`, `profile`), floating `CustomTabBar`, `MiniCallBar`, `CallLafinaScreen` modal overlay, `ProductTour`, `IncomingCallScreen`, and `ReminderPermissionModal`.
- [CustomTabBar.tsx](../../../src/ui/components/CustomTabBar.tsx): 5 tabs in `TAB_ORDER` (`dashboard` -> Home, `calendar` -> Schedule, `chat` -> AI in center badge slot, `notes` -> Notes, `profile` -> Profile) with `ProductTour` anchor refs and accessibility tab roles.

### Theme & Storage Foundations
- [ThemeContext.tsx](../../../src/ui/contexts/ThemeContext.tsx): Provides `isDarkMode`, `colors` (`ThemeColors` interface), and `toggleTheme(origin)` with circular reveal animation helper (`themeReveal.ts`).
- `src/ui/theme/`: `colors.ts` (`#FAF9F6` warm cream / `#121212` dark canvas, `#F75A5A` red & `#E6003A` crimson primary accents), `typography.ts` (`sans-serif-medium` heading, `sans-serif` body), `layout.ts` (16px cards, 12px buttons, 72px navbar), `spacing.ts`, `shadows.ts` (Android `elevation`).
- [localSettingsStore.ts](../../../src/storage/localSettingsStore.ts): SQLite `local_settings(user_id, key, value, updated_at)` store supporting offline-safe per-user and device-level preferences without altering user records.

### Active Screens Inventory
| Category | Screen / Module | Target Refactor Strategy |
|---|---|---|
| Dashboard | `src/ui/screens/dashboard/` (`DashboardScreen`, `DashboardHeader`, `UpNextWidget`, `NextAlarmCard`, `FreeStudyBlocksWidget`, `TodayScheduleWidget`, `TasksDueWidget`, `UpcomingRemindersWidget`, `PinnedNotesWidget`, `CustomizeDashboardModal`) | Shared data hook (`useDashboardData`); Modern mode uses UniGuide-inspired indigo hero `UpNext`, pastel bento cards (`blueSoft`, `mint`, `peach`, `lilac`), 24px corners, pill filters; Classic mode preserves exact layout & colors |
| Calendar & Alarms | `src/ui/screens/calendar/` (`CalendarScreen`, `WeekView`, `MonthView`, `DayView`, `AlarmsView`, modals) | Shared schedule hooks & SQLite stores; Modern mode uses pill segmented switcher, rounded week strip card, pastel timeline/alarm cards |
| Chat LAFINA | `src/ui/screens/ChatScreen.tsx`, `src/ui/components/chat/` (`ChatInput`, `ChatMessageItem`, `ChatHistorySheet`, `CommandGuide`, `CommandReviewCard`) | Shared orchestrator & `chatDraftStore`; Modern mode updates empty state cards, pill suggestion grid, rounded bubbles (`22px`), and pill composer while preserving all `testID`s & STT gestures |
| Notes & To-Do | `src/ui/screens/notes/` (`NotesScreen`, `NoteCard`, `NoteFilters`, `TodoListView`, `NoteEditor`, `TodoEditorModal`) | Shared notes/todo hooks; Modern mode applies pill switcher, `darkInkBtn` active filter chips, 24px note cards, pastel category pills |
| Profile & Settings | `src/ui/screens/ProfileScreen.tsx`, `PreferencesSettingsScreen.tsx`, `src/ui/components/profile/` (`ProfileStats`, `SettingItem`, modals) | Add orthogonal **App Interface** selector (`Modern` vs `Classic`) above `Dark Mode` toggle; Modern profile header card vs Classic SVG yellow arc header |
| Auth & Onboarding | `AuthBackdrop.tsx`, `WelcomeScreen.tsx`, `LoginScreen.tsx`, `RegisterScreen.tsx`, `OnboardingScreen.tsx` | Keep `<Grainient>` in `AuthBackdrop` (`testID="auth-backdrop"`); Modern mode uses soft violet/lavender academic gradient backdrop, 24px cards, pill CTAs; Classic keeps vibrant warm gradient |
| Voice & Calls | `CallLafinaScreen.tsx`, `VoiceConversationPanel.tsx`, `MiniCallBar.tsx`, `IncomingCallScreen.tsx` | Preserve all native alarm fences, consent checks, and voice transport hooks; Modern mode softens card surfaces to 24px and violet badges |
| Meetings | `src/ui/screens/meetings/` (`MeetingsScreen.tsx`, `RecorderCard.tsx`, `meetingStyles.ts`) | Authorized under `OWNER-AUTHORIZATION.md`; Modernize cards & pills cleanly |
| Product Tour | `src/ui/tour/ProductTour.tsx` | Adapt tooltip card radius & pill controls in Modern mode; preserve anchor refs |

---

## 3. Scope Reconciliation (`AGENTS.md` + `OWNER-AUTHORIZATION.md`)

- `scripts/check-architecture.mjs` strictly forbids any reference to removed legacy modules (`businessStore`, `businessService`, `CompanyChatScreen`, `ManagerOverviewScreen`, `EmployeeTodayScreen`, `WorkScreen`, `TeamManagementModal`, `gmailService`, `GmailInboxScreen`, `pomodoro`, `flashcards`, `studynotes`, `PomodoroContext`, `kokoro`, `LafinaTTSModule`).
- Therefore, Phase 06 audits and confirms these modules remain absent from `LAFINA-CAPSTONE`, while all existing authorized student, auth, onboarding, call, and meetings screens receive dual Modern/Classic support.
- `scripts/offline-boundary.cjs` prohibits `src/storage/`, `src/scheduler/`, and `src/ai/{nlu,stt,tts,native}/` from importing UI or network modules. Accordingly, `uiVariantStore.ts` lives in `src/storage/` with zero external UI/network dependencies.

---

## 4. Legacy Compatibility & Regression Risks

1. **Test Contract Fragility**: Existing UI tests check exact `accessibilityLabel`s (`Home tab`, `Schedule tab`, `AI tab`, `Notes tab`, `Profile tab`), exact `testID`s (`auth-backdrop`, `dashboard-customize-btn`, `notes-subtab-todo`, `chat-mic-button`), and negative assertions (`queryByTestId('dashboard-ask-lafina-btn') === null`, `queryByText('Customize') === null`). All existing test contracts must be preserved in both Modern and Classic variants.
2. **Offline Boundary Violations**: `ThemeContext.tsx` (in `src/ui/`) can safely import `uiVariantStore` (in `src/storage/`), whereas `src/ui/theme/modern.ts` must only use `import type` when referencing `ThemeColors` or `uiVariantStore` types so no import cycle occurs.
3. **Overlay / Modal State on Variant Switch**: Switching between Modern and Classic updates context state in place without clearing navigation tab state, active drafts, or SQLite records.
