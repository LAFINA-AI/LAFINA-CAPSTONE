# PHASE FLOAT-02 — Native service, orb and module / Completion Report

**Branch / commit SHA:** `feature/lafina-floating-assistant` (from `d331b97`). No commit made in this phase.
**Date/time UTC:** 2026-11-17
**Device(s) available:** Infinix X6880 (XOS, Android 15 / API 35), serial `13195704C2004480`. Emulator not used in this phase.
**Status:** `READY FOR REVIEW`
**Phase approval provenance:** Unattended run FLOAT-00 to FLOAT-07, owner 2026-11-17, recorded in `docs/plans/lafina-floating-assistant/OWNER-AUTHORIZATION.md`.

## 1. Scope completed

| Task (`05` FLOAT-02) | Result |
| --- | --- |
| 1. Manifest: two permissions; service with `specialUse`, `exported="false"`, subtype property | Done |
| 2. Allow-list in `check-architecture.mjs` with dated owner-approval comment | Done (both permissions, 2026-11-17, citing OWNER-AUTHORIZATION.md) |
| 3. `FloatingOrbRules` + JUnit (tap/drag, clamp, nearest edge, fraction mapping, dismiss hit test, rotation remap) | Done, 11 tests (K-01 to K-05) |
| 4. `FloatingOrbView` + window parameters | Done: 64 dp window, 56 dp disc, white ring, shadow, "L" mark drawn in code; `TYPE_APPLICATION_OVERLAY`, `FLAG_NOT_FOCUSABLE`, orb-sized window; idle fade 5 s → 0.55; press 0.94 / drag 1.06; 200 ms snap; system animator scale respected; Hide target only during a drag (`FLAG_NOT_TOUCHABLE`, alpha 0.8); content description and three custom accessibility actions |
| 5. Service | Done: low-importance channel; ongoing notification with Open (opens LAFINA until FLOAT-03) and Hide; `startForeground` with `specialUse`; visibility rules; configuration changes; `START_STICKY` with the guarded restart path; `canDrawOverlays` before every `addView`; window calls wrapped. **Deviation:** screen state comes from a `DisplayManager` listener, not a broadcast receiver (section 2.1). |
| 6. `MainActivity` reports resume/pause; starts the service on resume when allowed | Done |
| 7. Module methods (except `closeQuickChat` / `openMainApp`, FLOAT-03); low-RAM detection | Done |
| 8. Minimal settings toggle | Done: Profile → "Floating LAFINA" sheet with switch, explainer before Android's page, status line, and help text that some screens hide floating buttons |

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `android/.../FloatingOrbRules.kt` (new) | Pure geometry and gesture rules | Testable on the JVM | `FloatingOrbRulesTest.kt` 11/11 |
| `android/.../FloatingOrbView.kt` (new) | Orb and Hide-target views, drawn in code | `03` §3 | Device M-03 to M-07 |
| `android/.../FloatingAssistantPrefs.kt` (new) | SharedPreferences `lafina_floating_assistant`: enabled mirror, owner, placement, colour, hidden flag, launch-blocked flag | Service works without JS | Device: prefs read with `run-as` |
| `android/.../LafinaFloatingAssistantService.kt` (new) | Service; also holds `FloatingAssistantVisibility` (LAFINA-only activity tracker); `dump()` prints state only | `04` §5.1 | Device table |
| `android/.../LafinaFloatingAssistantModule.kt` (new) | `getStatus`, `setEnabled`, `openOverlaySettings`, `openAppDetailsSettings`, `setOrbAppearance`, `resetOrbPosition` | `04` §2.3 | J-16 (JS side); device M-01 to M-03 |
| `android/.../FloatingOrbRulesTest.kt` (new) | K-01 to K-05 | | PASS |
| `CapstoneBuildPackage.kt` | Registers the module (1 line) | `04` §2.4 | Build |
| `MainActivity.kt` | `onResume` / `onPause` report to the service | `04` §2.4 | Device M-03, M-06 |
| `AndroidManifest.xml` | 2 permissions with dated comment; the service with its subtype property | `04` §2.4 | Architecture check PASS |
| `scripts/check-architecture.mjs` | 2 allow-list entries with a dated comment | `04` §2.4 | Preflight |
| `jest.setup.js` | Stub for `NativeModules.LafinaFloatingAssistant` | `04` §2.4 | Preflight |
| `src/ui/components/profile/FloatingAssistantSettings.tsx` (new) | Minimal sheet + per-user setting `floatingAssistant.enabled` (local only, off by default) | Task 8 | J-16 (5 tests) |
| `src/ui/screens/ProfileScreen.tsx` | One `SettingItem` row and one sheet mount (plus its two state hooks and import) | `04` §2.4 | Device M-01 |
| `__tests__/ui/floatingAssistantSettings.test.tsx` (new) | J-16, first part (planned for FLOAT-06; added now because the explainer rule applies from this phase) | | PASS |
| `docs/decisions/ADR-036-floating-assistant.md` | FLOAT-02 implementation notes | Deviations | — |

### 2.1 Deviations, with evidence

1. **No screen on/off broadcast receiver.** Task 5 says "screen on/off receiver registered in code". On the X6880 that design failed: after locking and unlocking, the orb never came back. `dumpsys activity broadcasts history` showed SCREEN_ON to this app's receiver `SKIPPED … reason: Hiber/broadcast restricted queue.uid=10426`, and no USER_PRESENT delivery. The service now uses `DisplayManager.DisplayListener` (a direct callback) and lets the keyguard hide the overlay. On the device the orb window was removed on screen-off, re-added on wake, and on the lock screen showed `isVisible=false isOnScreen=false`.
2. **Revocation re-check.** The `AppOpsManager` watcher did not fire when the permission was revoked on the same phone. Every visibility event now re-checks `canDrawOverlays`. On the final build, revoking stopped the service within 2 s without a crash.
3. `FloatingAssistantVisibility` lives in the service file rather than its own file, to keep the new-file list of `04` §2.1.
4. Two diagnostics added: one-word state logs under tag `LafinaFloating`, and `Service.dump()` printing state flags only. Neither logs message text.

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | Result | Evidence path / error |
|---|---|---|---|
| Typecheck, lint, Jest, architecture (FLOAT-01 + 02 tree, nothing else running) | `npm run preflight` | PASS: 152 suites, 2,070 passed, 1 skipped, 0 failed; architecture "385 TypeScript modules checked; 0 import cycles …; 105 offline leaves …" | `docs/reports/evidence/float-02/preflight.log` |
| Kotlin compile + JUnit | `android> .\gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest -PreactNativeArchitectures=x86_64` | PASS: BUILD SUCCESSFUL; 87 JUnit tests (76 baseline + 11 `FloatingOrbRulesTest`), 0 failures | `docs/reports/evidence/float-02/gradle-kotlin-unit.log` |
| Android build | `android> .\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a` | PASS. The log is from the second build. Two later rebuilds after the device fixes used the same command with `-q`; both exited 0 | `docs/reports/evidence/float-02/assembleDebug.log` |
| First Gradle attempt | Same Kotlin command, run while Jest was running | FAILED once in `:gradle-plugin:settings-plugin:compileKotlin`; the identical re-run passed with no change. Treated as a transient file-lock/race | — |
| Device | Section 4 | PASS except the items below | `docs/reports/evidence/float-02/device-checks.md` |

Acceptance criteria (`05` FLOAT-02, device):

| Criterion | Result |
| --- | --- |
| Orb appears after leaving LAFINA within about 300 ms | Appeared; one observation of ~333 ms including adb polling latency. Not a measurement; FLOAT-07 measures with a screen recording |
| Drags, snaps, remembers its place across rotation and service restart | PASS |
| Hidden inside LAFINA and when the screen is off | PASS |
| Hide target or notification Hide removes orb and notification; reopening LAFINA brings it back | PASS (both) |
| Revoking the permission removes it without a crash | PASS on the final build (via `appops`, not the Settings toggle) |
| App underneath receives all touches outside the orb and keeps keyboard focus | PASS (Calculator; web-search field) |
| No `ForegroundServiceStartNotAllowedException` / `MissingForegroundServiceTypeException` in the normal enable path | None seen; ActivityManager logged "Background started FGS: Allowed … PROC_STATE_TOP" |

## 4. Device results

See `docs/reports/evidence/float-02/device-checks.md` for every step. Not run:

| Item | Why |
| --- | --- |
| M-09 exactly as written (another app's runtime-permission dialog) | Not triggered, to avoid changing another app's state. The equivalent check passed: over a system screen that hides overlays, the orb was hidden and came back on return. |
| Granting through the system list by tapping | Done with `appops` instead, because the list also shows the owner's other LAFINA installs |
| `am compat enable FGS_SAW_RESTRICTIONS` | Not needed on this device: target 36 on Android 15 applies the rule by default. The sticky restart after `kill -9` started in the foreground successfully |

## 5. Performance, reliability, privacy, permissions

- No performance numbers are claimed. In code: no wake lock, no repeating timer, no polling. The only delayed work is the one-shot idle fade, the 200 ms show debounce and the snap animation on release.
- Permissions: exactly the two approved ones, added together with their allow-list entries.
- Privacy: the service sees only LAFINA's own activities and the display state. The notification text is generic. Logs contain no user content. Device evidence holds no data from other apps; screenshots were cropped to the orb and kept out of the repository. One full screenshot that captured a message notification was deleted immediately.
- Your phone: rotation settings were changed for the test and restored (auto-rotate 1, user rotation 0). Nothing outside `com.lafina.capstone.debug` was changed.
- Account switching: the native mirror keeps the owner that turned it on. The App-level "apply for user" step is FLOAT-03 (`04` §2.4 (d)). Until then, another account on the same phone would still see the orb.

## 6. Human phone verification (short)

1. Unlock the phone (Infinix). If LAFINA debug is on screen, press Home: the red "L" button should appear at the left edge, about two-thirds down.
2. Lock the phone, then unlock it: the button should come back within about a second. (Passed on 2026-11-17 after the owner unlocked the phone.)
3. Optional: drag it around; drop it on the X at the bottom. It should vanish with its notification, and come back after you open LAFINA and leave.

## 7. Docs/ADRs changed

- `docs/decisions/ADR-036-floating-assistant.md` (FLOAT-02 implementation notes)
- This report; `docs/reports/evidence/float-02/`

## 8. Open blockers and recommended next steps

- Closed after the owner unlocked the phone: the orb was visible right after the unlock on the final build; the overlay-hiding screen check passed (evidence file).
- FLOAT-03 next: QuickChatActivity, orb tap → Quick Chat, notification Open → Quick Chat, the App.tsx R-03 gate, and "apply for user" on account switch.
- FLOAT-06: the system page opens as a **list** on this phone, so the explainer should say "find LAFINA in the list and turn it on". A short message on return without granting is still to do (M-02).

## 9. Review decision

- [x] All automated required checks passing
- [x] Device checks complete (M-09 by an equivalent system screen)
- [x] No disallowed scope/code change; deviations recorded
- [x] Report accurate; evidence linked

STATUS: READY FOR REVIEW
