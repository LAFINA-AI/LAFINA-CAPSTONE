# PHASE 01 — LAFINA UI/UX Foundation, Theme, Auth, Onboarding & Profile

> Read `AGENTS.md` first. Execute **only Phase 01** in this turn and stop for human review.

## Objective

Migrate the `LAFINA` student UI/UX foundation, theme system, animated startup splash (`SynthSplash`), authentication & guest flows (`AuthBackdrop`, `Grainient`, `WelcomeScreen`, `LoginScreen`, `RegisterScreen`, `authService`, `accountLinkService`, `cloudClient`), 5-step student onboarding (`OnboardingScreen`), `ProfileScreen` + `PreferencesSettingsScreen`, student-only `CustomTabBar` (4 tabs + central Mic button without study-tool radial menu), `ProductTour` (student steps only), and the core SQLite database & stores (`database.ts`, `dbInit.ts`, `userStore`, `preferencesStore`, `onboardingStore`, `behaviorStore`, `localSettingsStore`, `productTourStore`, `syncOutboxStore`, `syncMetadataStore`, `syncStateStore`, `syncConflictStore`).

## Scope

1. **Theme & Visual Polish (`src/ui/theme/`, `src/ui/contexts/ThemeContext.tsx`, `src/ui/splash/`)**
   - Migrate `Colors`, `Fonts`, `FontSize`, `Spacing`, `Layout`, `Shadows`, `mixColors`, `getCategoryColor`, `useThemedStyles`, `themeReveal`, `ThemeProvider`, and `SynthSplash`.
   - Port native Android visual/platform modules: `LafinaGrainientView.kt`, `LafinaGrainientViewManager.kt`, `LafinaThemeRevealModule.kt`, `AndroidKeystoreModule.kt`, `AndroidConnectivityModule.kt`.
2. **SQLite Schema & Core Stores (`src/storage/`)**
   - Migrate `database.ts` and `dbInit.ts` matching `LAFINA-backend` personal tables (`users`, `user_preferences`, `behavior_logs`, `feature_snapshots`, `tasks`, `events`, `time_blocks`, `reminders`, `notes`, `custom_categories`, `chat_sessions`, `messages`, `local_settings`, `sync_outbox`, `sync_metadata`, `sync_state`, `sync_conflicts`, `sync_control`).
   - Exclude all business tables, Gmail cache tables, and study-tool tables (`pomodoro_*`, `flashcard_decks`, `study_summaries`, `recorded_meetings`).
   - Migrate `authUtils.ts`, `userStore.ts`, `preferencesStore.ts`, `onboardingStore.ts`, `behaviorStore.ts`, `localSettingsStore.ts`, `productTourStore.ts`, `profileSyncPayload.ts`, `syncTypes.ts`, `syncOutboxStore.ts`, `syncMetadataStore.ts`, `syncStateStore.ts`, `syncConflictStore.ts`, `tasksStore.ts`, `notesStore.ts`, `timeBlocksStore.ts`, `remindersStore.ts`, `chatStore.ts`.
3. **Cloud Client, Auth & Bidirectional Sync Foundation (`src/cloud/`, `src/sync/`)**
   - Configure `src/cloud/cloudClient.ts` with `CLOUD_API_BASE_URL = 'https://lafina-backend.vercel.app'` and `LOCAL_API_BASE_URL = 'http://127.0.0.1:8000'`.
   - Migrate `authService.ts`, `accountLinkService.ts`, `entitlements.ts` (student & student_pro/admin only, no business workspace), and `syncEntityTypes.ts`, `syncState.ts`, `syncWorker.ts`, `syncScheduler.ts` (syncing the 7 personal entity types: `profile`, `task`, `event`, `time_block`, `reminder`, `note`, `custom_category`).
4. **Screens & Navigation Shell (`src/ui/screens/`, `src/ui/components/`, `App.tsx`)**
   - Migrate `WelcomeScreen.tsx`, `LoginScreen.tsx`, `RegisterScreen.tsx`, `OnboardingScreen.tsx`, `ProfileScreen.tsx` (without business workspace or study-tool cleanup), `PreferencesSettingsScreen.tsx`, `CustomTabBar.tsx` (without study-tool radial menu), and `ProductTour.tsx` (without study-tool step).
   - Wire `App.tsx` with `SynthSplash`, `AuthBackdrop`, `OnboardingScreen`, `CustomTabBar`, `ProfileScreen`, `ProductTour`, and clean phase-ready placeholders for `Calendar`, `Notes`, `Chat`, and `Mic` until Phases 02–08.

## Verification

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:architecture`, and Android Gradle `assembleDebug` / `testDebugUnitTest` must pass with zero errors.
- Generate `docs/reports/phase-01-report.md` and stop for human approval (`APPROVE PHASE 02`).
