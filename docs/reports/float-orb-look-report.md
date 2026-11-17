# Floating LAFINA — customizable, less intrusive button / Completion Report

**Branch:** `feature/lafina-floating-assistant` (uncommitted, same working tree as FLOAT-00..07 and CALL-FIX).
**Date:** 2026-11-18 (Asia/Manila)
**Requested by:** owner chat 2026-11-18: "add a settings to customize the orb … not too annoying … hide nicely without impeding the normal use … like infinix's smart panel … nicely customizable".
**Status:** see section 5.

## 1. What changed

| Area | Change |
| --- | --- |
| Default look | **Edge bar** (new default): a 4/6/8 dp rounded bar flush with the screen edge in a 24 dp × 64/88/112 dp touch strip, 60 % visible when idle. Tap or swipe inward opens Quick Chat; long-press, then drag, moves it; a drag taken over by the system (Back swipe) puts it back |
| Bubble | Kept as an option, now 40/48/56 dp (was 56 dp only); can **tuck** half off the screen when idle; a light colour gets a dark "L" and outline |
| Full screen | "Hide in full-screen apps" (default on): the button window reads only whether the status bar is visible; while hidden it is fully transparent and not touchable |
| Settings | Profile → Floating LAFINA → **Look and feel**: live preview, Style, Size, Side, Visible when idle (30/50/75/100 %), Colour (App theme + 7), Tuck (bubble), Hide in full-screen apps, Lock position, Reset look. Stored on this phone in `FloatingAssistantPrefs` (like the position), not synced |
| Idle | Fade after 3 s (was 5 s) |

Design reference: Samsung's Edge panel handle offers side, size, transparency, width and a position lock ([Samsung support](https://www.samsung.com/ph/support/mobile-devices/how-to-make-the-most-out-of-edge-panels/)); public documentation of the Infinix Smart Panel handle options was not found.

Files: `FloatingOrbRules.kt` (`OrbStyle`, `OrbSize`, `OrbLook`, `OrbMetrics`, `FloatingOrbLookRules`, non-square `OrbBounds`), `FloatingOrbView.kt`, `FloatingAssistantPrefs.kt`, `LafinaFloatingAssistantService.kt`, `LafinaFloatingAssistantModule.kt` (`getOrbCustomization`, `setOrbCustomization`, `resetOrbCustomization`), `src/utils/floatingAssistantNative.ts`, new `src/ui/components/profile/FloatingOrbAppearance.tsx`, `FloatingAssistantSettings.tsx`, `jest.setup.js` (mock methods), ADR-036 and doc 10 notes. No new permission, dependency, wake lock or repeating timer.

## 2. Verification

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run preflight` (typecheck, lint, Jest, architecture) | PASS: 160 suites, 2148 passed, 1 skipped | `docs/reports/evidence/float-orb-look/preflight.log` |
| New Jest: `__tests__/ui/floatingOrbAppearance.test.tsx` (5), `__tests__/utils/floatingAssistantNative.test.ts` (+3) | PASS: defaults, each choice saved and previewed, failed save reverts with a message, Reset look, hidden on unsupported phones, normalization, invalid changes never reach native | — |
| Gradle `:app:compileDebugKotlin :app:testDebugUnitTest -PreactNativeArchitectures=x86_64` | PASS: 95 JUnit tests (8 new in `FloatingOrbRulesTest`), 0 failures | `docs/reports/evidence/float-orb-look/gradle-kotlin-unit.log` |
| `:app:assembleDebug -PreactNativeArchitectures=arm64-v8a,x86_64` with `JAVA_HOME` = JDK 17 | PASS (both APKs) | `docs/reports/evidence/float-orb-look/gradle-assemble-arm64-x86_64.log` |

**Build note:** in this PowerShell environment `JAVA_HOME` points at Android Studio's JBR (Java 25). Under it, `:app:configureCMakeDebug[...]` fails with `WARNING: A restricted method in java.lang.System has been called` (`gradle-assemble-arm64.log`, first attempt). With JDK 17 (`C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`, as `scripts/build-provider-test-apk.ps1` does) both architectures build. This was also the cause of the x86_64 failure recorded in FLOAT-07.

## 3. Device results

**Infinix X6880, Android 15** (debug APK, JS from Metro):
- **Settings sheet:** the Look and feel section shows with the preview. Choices are saved natively, which `dumpsys` of the service's `look=` line confirms.
- **Edge bar (default):** window 66 × 242 px (24 × 88 dp) flush with the right edge, drawn at 60 % when idle.
  - Tap → Quick Chat.
  - Swipe inward → Quick Chat.
  - Vertical brush along the edge → nothing.
  - Press-and-hold, then drag → moved (saved fraction 0.35 → 0.70).
- **Bubble, tucked:** after 3 s idle the window sits at x = 1003 with width 154 px on a 1080 px screen, so half is off screen. A tap on the tucked bubble → Quick Chat directly.
- **White edge bar with Lock position:** drawn with a faint outline. Press-and-hold-drag → did not move and did not open.
- **Fix made after viewing:** the bar's white outline was too strong; it is now faint for the edge bar only.

**Android 17 emulator (`emulator-5554`, x86_64 debug APK):**
- **Hide in full-screen apps:** opening the stock Camera (status bar hidden) → `Full screen: stepping aside`, window `alpha=0.0` and `NOT_TOUCHABLE`. Home → `Full screen ended: back`, touchable again.
- **M-26 split screen:** LAFINA and Settings side by side; Open from LAFINA's notification → `QuickChatActivity` resumed (`Running "LafinaQuickChat"`); Back closed it; 0 LAFINA entries in the crash buffer.

Screenshots were cropped to the button's window or LAFINA's own sheet, viewed, and deleted. A full-screen capture was refused by the permission system and not retried.

## 4. Other finding (not changed)

On the very first launch after a fresh install, before the database is ready, `local_settings` is read and logs 4 × `no such table: local_settings` (LogBox shows them in debug). It does not happen on the next launch. This was seen on the emulator during the intro screen; Floating LAFINA code does not run there, and it was not investigated further.

## 5. Status

Automated gates PASS; owner-requested behaviour checked on the Infinix and the Android 17 emulator. NOT RUN: TalkBack on the new edge bar; full screen on the Infinix itself (needs a full-screen app such as a video); battery with the new look.

STATUS: READY FOR REVIEW
