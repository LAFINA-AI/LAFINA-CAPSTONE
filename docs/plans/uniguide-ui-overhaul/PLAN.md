# LAFINA 2.0: UniGuide-Inspired UI/UX Overhaul — Execution Plan

> **Branch:** `feature/uniguide-inspired-ui-overhaul`  
> **Base Commit:** `d86a0fe` (`Lem-branch`)  
> **Reference Design Commit:** `TeamOnlyPrompts/UniGuide-Mobile` @ `0d44b4e62b08626774e43ad37a6943c3e7c104c3`

## Phase Checklist

- [x] **Phase 00 — Baseline Audit & Reference Documentation**
  - [x] Create dedicated implementation branch `feature/uniguide-inspired-ui-overhaul`
  - [x] Audit `LAFINA-CAPSTONE` and `UniGuide-Mobile` (`0d44b4e62b08626774e43ad37a6943c3e7c104c3`)
  - [x] Capture baseline `npm test` + `npm run typecheck` + `npm run lint` + `npm run check:architecture` results
  - [x] Create `UNIGUIDE-DESIGN-REFERENCE.md`
  - [x] Create `PHASE-00-BASELINE-AUDIT.md`

- [x] **Phase 01 — Modern Design System**
  - [x] Add `src/ui/theme/modern.ts` (`UIVariant`, `ModernPalette`, `modernLightPalette`, `modernDarkPalette`, `modernLightThemeColors`, `modernDarkThemeColors`, `ModernLayout`, `ModernShadows`, `ModernTypography`)
  - [x] Re-export Modern theme tokens in `src/ui/theme/index.ts` without modifying Classic tokens
  - [x] Add `src/ui/components/modern/ModernPrimitives.tsx` (`ModernCard`, `ModernSectionHeader`, `ModernPillChip`, `ModernIconButton`, `ModernBadge`)
  - [x] Add `__tests__/ModernDesignSystem.test.tsx`

- [x] **Phase 02 — Interface Switching (`ui_variant`)**
  - [x] Add `src/storage/uiVariantStore.ts` (`ui_variant` key in `localSettingsStore`, `'modern'` default, `'classic'` preserved, device fallback + per-user persistence)
  - [x] Extend `src/ui/contexts/ThemeContext.tsx` (`uiVariant`, `isModern`, `setUIVariant`, `modernPalette`, `useUIVariant`) supporting all 4 combinations (`Modern Light`, `Modern Dark`, `Classic Light`, `Classic Dark`)
  - [x] Add `App Interface` Modern/Classic selector cards in `src/ui/screens/ProfileScreen.tsx` Appearance section above independent Dark Mode switch
  - [x] Add `__tests__/UIVariantSwitching.test.tsx`

- [x] **Phase 03 — Modern Navigation**
  - [x] Upgrade `src/ui/components/CustomTabBar.tsx` with UniGuide-inspired SVG curved U-notch bottom bar + raised AI center button + always-visible labels when `uiVariant === 'modern'`, preserving Classic floating pill bar when `uiVariant === 'classic'`
  - [x] Add `__tests__/CustomTabBar.test.tsx` covering Modern and Classic tab bar modes

- [x] **Phase 04 — Core Student Screens (Modern + Classic)**
  - [x] Dashboard (`DashboardScreen.tsx`, `DashboardHeader.tsx`, `UpNextWidget.tsx`, `NextAlarmCard.tsx`, `FreeStudyBlocksWidget.tsx`, `TodayScheduleWidget.tsx`, `TasksDueWidget.tsx`, `UpcomingRemindersWidget.tsx`, `PinnedNotesWidget.tsx`)
  - [x] Calendar & Alarms (`CalendarScreen.tsx`, `WeekView.tsx`, `MonthView.tsx`, `DayView.tsx` [inspected: uses `ThemeContext` `colors`], `AlarmsView.tsx`)
  - [x] Chat LAFINA (`ChatScreen.tsx`, `ChatInput.tsx`, `ChatMessageItem.tsx`)
  - [x] Notes & To-Do (`NotesScreen.tsx`, `NoteCard.tsx`, `NoteFilters.tsx`, `TodoListView.tsx`)
  - [x] Profile & Preferences (`ProfileScreen.tsx`, `ProfileStats.tsx`, `SettingItem.tsx`, `PreferencesSettingsScreen.tsx`)

- [x] **Phase 05 — Supporting Screens**
  - [x] Auth & Onboarding (`AuthBackdrop.tsx` [inspected: consumes `ThemeContext`], `WelcomeScreen.tsx`, `LoginScreen.tsx`, `RegisterScreen.tsx`, `OnboardingScreen.tsx`, `OnboardingProgress.tsx`, `OnboardingNavigation.tsx`, `AuthButton.tsx`, `AuthInput.tsx`)
  - [x] Product Tour (`ProductTour.tsx`)
  - [x] Voice & Call (`CallLafinaScreen.tsx` [inspected: consumes `ThemeContext`], `VoiceConversationPanel.tsx`, `MiniCallBar.tsx`, `IncomingCallScreen.tsx`)
  - [x] Meetings (`MeetingsScreen.tsx`, `RecorderCard.tsx`, `meetingStyles.ts` [inspected: consumes `ThemeContext` & shared radii])

- [x] **Phase 06 — Business & Out-of-Scope Interface Audit**
  - [x] Create `PHASE-06-SCOPE-AUDIT.md` verifying forbidden scope boundaries (`AGENTS.md` + `OWNER-AUTHORIZATION.md`)
  - [x] Verify `npm run check:architecture` passes with 0 violations

- [x] **Phase 07 — Visual QA & Device Validation (`AWAITING DEVICE VALIDATION`)**
  - [x] Check Android device/emulator availability (`adb devices -l` -> NONE attached)
  - [ ] Capture screenshots / inspect on Android hardware (`NOT RUN` — deferred to human device validation checklist)

- [x] **Phase 08 — Regression Audit & Final Report**
  - [x] Run `npm run typecheck`, `npm run lint`, `npm test -- --runInBand`, `npm run check:architecture`, Prettier checks
  - [x] Create `docs/reports/phase-uniguide-ui-overhaul-report.md`
  - [x] Commit final verified work on `feature/uniguide-inspired-ui-overhaul`
