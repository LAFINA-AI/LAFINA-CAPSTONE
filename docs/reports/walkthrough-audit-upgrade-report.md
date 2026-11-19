# Walkthrough Audit & Comprehensive Upgrade — Completion Report

**Branch / commit SHA:** `feature/cor-accuracy-calendar-call-updates` @ `b1491d5` + uncommitted working tree  
**Date/time UTC:** 2026-11-19T15:24Z  
**Device(s) available:** `Infinix_X6880` (`13195704C2004480`) attached over ADB. **Not used** for app install/walkthrough execution to preserve existing device app state.  
**Status:** `AWAITING DEVICE VALIDATION`

---

## 1. Deep Audit Findings (Before Fix)

1. **Severe feature coverage gap:** `App.tsx` mounted `buildQuickTourSteps` with only **3 steps** (`Home`, `Schedule`, `AI`), completely omitting **Tools** (`Alarms`, `Todo`, `Notes`) and **Profile** (`40%` of the navigation bar) as well as every major post-Phase-03 feature:
   - Home live `Up Next` hero, Search & Ask bar, Home filters (`All | Tasks | Alarms | Docs`), **Free Study Blocks** (`+ Study`), and **Customize Dashboard** presets/order.
   - Schedule `Month | Week | Day` views, item details with attached notes/to-dos, **View Classes** / **USTP COR** import, **Calendar Groups** (`Classes`, `Birthdays`, `Philippine Holidays`, custom groups), **Undated Tasks**, and **`.ics` import/export**.
   - AI offline **Whisper STT**, **Confirm-before-save Review Cards** & `Undo`, **AI Engine** switcher (Fast-Path / downloadable offline models vs Online Mode), Camera/Photos schedule scanner, **Temporary Chat**, searchable history & Command Guide, **USTP Handbook** citations, **Live Call LAFINA** (with mini bar), and **Call me vs Notify only** reminder calls (with clear Acknowledge ≠ Task Completed semantics).
   - Tools **Alarms** (native `AlarmManager` + **Morning Briefing**), **To-Do** (`From Notes` synced checklists), and **Rich Notes** (Markdown, Write/Preview, images, pins, custom categories, **AI Assist**).
   - **Floating LAFINA & Quick Chat** (optional edge bar / bubble over other apps), **Guest vs Cloud Sync**, **Preferences / Memory / Event Defaults / Offline & ElevenLabs Voices**, **Alarm & Reminder Health**, and **Dark Mode / 6 Color Themes / 5 AI Orb Designs**.
2. **Modern AI tab spotlight clipping (`CustomTabBar.tsx`):** `tourTargetRef('tab-chat')` was attached to `modernCenterSlot` (`height: 66`), while `modernCenterFab` sat at `top: -28`, slicing the top half of the raised AI Synth Orb out of the spotlight hole.
3. **Keyboard hiding tab bar (`App.tsx`):** `CustomTabBar` unmounts when `isKeyboardVisible` is true, and launching/replaying the tour did not dismiss the keyboard first.
4. **Permission modal collision (`App.tsx`):** Right after onboarding, the reminder-permission check could show `ReminderPermissionModal` / `POST_NOTIFICATIONS` on top of the tour.
5. **Auto-entry Call LAFINA collision (`App.tsx`):** Entering the `chat` tab during the tour when `startWithCallLafina` was enabled would trigger `CallLafinaScreen` mid-walkthrough.
6. **Sub-tab & scroll anchoring limitations (`ProductTour.tsx`, `NotesScreen.tsx`, `ProfileScreen.tsx`):**
   - Only the 5 bottom tab icons were registered as anchors.
   - Retained tabs (`<Activity>`) and offscreen `ScrollView` targets had no retry loop or viewport-visibility check and no `useSafeAreaInsets()` bottom clearance under `edgeToEdgeEnabled=true`.
   - Coachmark cards lacked bounded scroll height for small screens / 200% font scale and had no chapter jump controls.

---

## 2. Changes Implemented

| File / Area | Change | Reason |
|---|---|---|
| `src/ui/tour/tourSteps.ts` | Added `buildWalkthroughSteps` (12 steps across all 5 tabs & 3 Tools sub-tabs) with structured `highlights` + `tip`, audience gating (`isGuest`, `schoolEnabled`, `corPending`), and expanded `TourAnchor` union; updated `buildQuickTourSteps` to delegate to it; refreshed legacy `buildTourSteps` copy while preserving its 7 IDs/anchors. | Cover all reachable student features honestly without mentioning forbidden, developer-only, or unmounted capabilities. |
| `src/ui/tour/ProductTour.tsx` | Added progress bar, tappable 5-chapter jump pills (`Home · Schedule · AI · Tools · Profile`), icon badges, scannable highlight rows, optional tip callout, `useSafeAreaInsets()` bottom margin, `computeCardLayout` side selection + `maxHeight` (with `120` min-room floor clamped by `fullRoom`) & bounded inner `ScrollView`, retry loop for layout settling + `tabClearance` occlusion rejection & 120 ms settle re-check for scrollable anchors (`home-actions`, `profile-floating-row`) + `fallbackAnchor`, `useReducedMotion()`, and `onStepChange` callback. | Readable, interactive walkthrough resilient on 320×640 screens, short split-screen heights, 200% font scale, edge-to-edge navigation bars, async scroll timing, and Dark/Modern/Classic themes. |
| `src/ui/tour/tourTargets.ts` | Guarded `typeof node.measureInWindow !== 'function'`. | Avoid relying on exception catch when non-measured test mocks are passed. |
| `src/storage/productTourStore.ts` | Bumped `PRODUCT_TOUR_VERSION` from `1` to `2`. | Distinguish completed v2 walkthrough records cleanly without auto-interrupting existing installs. |
| `src/ui/components/CustomTabBar.tsx` | Added `modernCenterTourTarget` (`top: -MODERN_FAB_OVERHANG` to `bottom: 4`) for Modern `tab-chat` (`collapsable={false}`). | Spotlight frames the entire raised AI Synth Orb + `AI` label. |
| `src/ui/screens/dashboard/*` | Registered `home-actions` (`ModernHomeContent.tsx`, `DashboardHeader.tsx`) and added `tourAnchor` scroll-to-top in `DashboardScreen.tsx`. | Highlight Alarms & Customize controls cleanly even if Home was previously scrolled. |
| `src/ui/screens/calendar/CalendarScreen.tsx` | Registered `calendar-more-button` and `calendar-add-button`. | Spotlight Schedule's `+` creator and `⋮` options sidebar. |
| `src/ui/screens/ChatScreen.tsx`, `src/ui/components/chat/ChatInput.tsx` | Registered `chat-engine-pill` and `chat-composer`. | Spotlight Offline/Online AI pill and composer controls (`+`, Call LAFINA, Hold Mic). |
| `src/ui/screens/notes/NotesScreen.tsx`, `types.ts` | Added `tourSubTab` choreography (switching `alarms` → `todo` → `notes` during tour and restoring prior sub-tab on exit) and registered `tools-subtab-{alarms,todo,notes}`. | Show each Tools workspace live behind its spotlight without triggering detail alerts. |
| `src/ui/screens/ProfileScreen.tsx` | Wrapped `<ScrollView>` in a non-collapsible `scrollWrapRef` `<View>`, added `tourAnchor` auto-scroll (`profile-floating-row` measured against `scrollWrapRef` with 60/140 ms retry and scrolled into upper viewport; `tab-profile` scrolled to top), registered `profile-floating-row`, and labeled replay row `"All features"`. | React Native 0.86 `ScrollView` exposes no `measureInWindow`; measuring the wrapper `View` ensures Floating LAFINA scrolls reliably into view above the card on small screens. |
| `App.tsx` | Wired `buildWalkthroughSteps` with `isGuestAccount`, `activeTourStep`, `tourReturnTabRef` (reset on logout, onboarding reset, guest start, and login), `Keyboard.dismiss()` on open, deferred `ReminderPermissionModal` until tour finishes, and guarded `startWithCallLafina` with `!tourOpen`. | Prevent modal/keyboard/live-call collisions, prevent cross-session stale return tabs, and return cleanly to starting tab (or chosen goal tab) on finish/skip. |
| `__tests__/ui/productTourWalkthrough.test.tsx` | Added comprehensive unit & component suite (step coverage, audience adaptation, forbidden-scope guard, chapter jumping, Back/Skip/HardwareBack, `computeCardLayout`/`placeCard` including 420 px split-screen height, Modern/Classic `CustomTabBar` target, `NotesScreen` sub-tab choreography, `ProfileScreen` replay & `scrollWrapRef` auto-scroll without `ScrollView.measureInWindow`, `PRODUCT_TOUR_VERSION = 2`). | Automated regression coverage across logic, RN layout timing guards, and UI states. |

---

## 3. Post-Implementation Audit Fixes

1. **`ScrollView.measureInWindow` absent in React Native 0.86 (`ProfileScreen.tsx`):** Verified directly against `node_modules/react-native/Libraries/Components/ScrollView/ScrollView.js` (`measureInWindow` is not implemented on `ScrollView` instances). Wrapped `ProfileScreen`'s `ScrollView` in a non-collapsible `View` (`scrollWrapRef`), measured `floatingRowNodeRef` against `scrollWrapRef` with 60 ms / 140 ms retries if layout isn't mounted yet, and added a Jest test verifying `ScrollView` is never passed to `measureInWindow`.
2. **Pre-scroll tab-bar occlusion & async scroll race (`ProductTour.tsx`):** Excluded bottom dock clearance (`tabClearance = Math.max(insets.bottom, 12) + 74`) inside `isVisibleInArea` for scrollable anchors (`home-actions`, `profile-floating-row`) so pre-scroll positions hidden behind `CustomTabBar` are retried instead of accepted early, and added a cancelled-safe `120 ms` settle re-check (`sameRect`) to smoothly reposition the spotlight if scrolling completes after measurement.
3. **Short/split-screen height floor (`ProductTour.tsx`):** Lowered `computeCardLayout`'s minimum card room floor from `180` to `Math.min(fullRoom, Math.max(120, available))`, verified with a 420 px height test case.
4. **Cross-session `tourReturnTabRef` hygiene (`App.tsx`):** Reset `tourReturnTabRef.current = 'dashboard'` inside `handleGetStarted`, `handleLoginSuccess`, `handleLogout`, and `resetFromOnboarding`.

---

## 4. Verification Results

| Check | Command | Result |
|---|---|---|
| Prettier (`ProductTour.tsx`, `tourSteps.ts`, `productTourWalkthrough.test.tsx`) | `npx prettier --check src/ui/tour/ProductTour.tsx src/ui/tour/tourSteps.ts __tests__/ui/productTourWalkthrough.test.tsx` | PASS |
| TypeScript | `npm run typecheck` (`tsc --noEmit`) | PASS (0 errors) |
| ESLint | `npm run lint` (`eslint src __tests__ App.tsx index.js --max-warnings 0`) | PASS (0 warnings/errors) |
| Full Jest Suite | `npm test` (`jest --runInBand`) | PASS — **169/169 suites**, **2289 passed**, 1 pre-existing skipped (2290 total) |
| Architecture & Scope Boundary | `npm run check:architecture` | PASS — **423 TypeScript modules**, 0 import cycles, 0 forbidden dependencies, 109 offline leaves clean |
| Android JS Release Bundle | `npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output <scratch>/index.android.bundle` | PASS |
| Android Gradle Build & Physical Phone Visual Check | — | NOT RUN (no native Kotlin/C++ changes made; connected `Infinix_X6880` left untouched) |

---

## 5. Manual Device Verification Checklist

1. Build & install a debug or QA APK (`npm run android` or `gradlew assembleDebug`).
2. **Post-onboarding launch:** Complete onboarding (or use Profile → **Show the walkthrough again**). Confirm keyboard dismisses and no `ReminderPermissionModal` pops on top of the tour.
3. **Walk all 12 steps (`Next`):**
   - **Steps 1–2 (Home):** Verify bottom `Home` tab spotlight, then top-right `Bell + Customize` spotlight (`Up Next`, `Free Study Blocks`, `Customize Dashboard`).
   - **Steps 3–4 (Schedule):** Verify `+` button spotlight, then `⋮` menu spotlight (`Month/Week/Day`, `COR`, `Calendar Groups`, `.ics`).
   - **Steps 5–7 (AI & Calls):** Verify Step 5's spotlight frames the **entire** raised center `AI` Synth Orb + label (not cut off), Step 6 highlights the top engine pill (`Offline/Online`, `+` scan, `USTP Handbook` adapted to COR status), and Step 7 highlights the bottom composer (`Call LAFINA`, `Mic`, `Call me vs Notify only`). Confirm `Start with Call LAFINA` does not auto-dial during the tour.
   - **Steps 8–10 (Tools):** Verify Tools switches live behind the spotlight across **Alarms → Todo → Notes** and restores your prior sub-tab on exit.
   - **Steps 11–12 (Profile):** Verify Step 11 auto-scrolls **Floating LAFINA** cleanly into view above the card and spotlights it, and Step 12 frames **Profile** (`Sync / Guest upgrade`, `Voices`, `Alarm & Reminder Health`, `Themes & AI Orb Designs`).
4. **Chapter jump & Back/Skip:** Tap any chapter pill (`Tools`, `AI`, etc.) to jump directly; test `Back`, Android hardware Back, `Skip`, and `X`; verify overlay disappears cleanly and returns to the originating/goal tab without blocking taps.
5. **Themes & Accessibility:** Spot-check in **Modern Light**, **Modern Dark**, **Classic Light**, **Classic Dark**, **200% font size**, and **Settings → Remove animations** (instant transitions, scrollable card body, pinned footer buttons).

`STATUS: AWAITING DEVICE VALIDATION`  
`STOPPED — awaiting explicit human approval`
