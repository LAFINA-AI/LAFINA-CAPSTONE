# PHASE FLOAT-00 — Baseline, approvals and feasibility spike / Completion Report

**Branch / commit SHA:** `feature/lafina-floating-assistant`, created from `d331b97` (`codex/latest-main-20261117`, which contains PR #14 `feature/uniguide-inspired-ui-overhaul`). No commit made in this phase.
**Date/time UTC:** 2026-11-17T05:30Z
**Device(s) available:** Infinix X6880 (XOS, Android 15 / API 35, build `X6880-15.1.2.200(OPPJ001PF001PJ)`, 1080×2436, 440 dpi), USB serial `13195704C2004480`. Emulator `Medium_Phone` (Android 17 beta, `android-37.2-beta3`, x86_64) exists but was not started in this phase.
**Status:** `READY FOR REVIEW`
**Phase approval provenance:** Owner, 2026-11-17: "yes, start a new branch. use my infinix phone for testing. proceed and finish everything without human interaction as much as possible." Recorded in `docs/plans/lafina-floating-assistant/OWNER-AUTHORIZATION.md` (follow-up answers). Q-00 and Q-01 were answered yes earlier the same day (same file).

## 1. Scope completed

| Task (`05` FLOAT-00) | Result |
| --- | --- |
| 1. Record git state; branch decision (Q-07) | The tree had 156 uncommitted entries, so the run stopped and asked. The owner committed them (`d331b97`) and approved a new branch. `feature/lafina-floating-assistant` was created from `d331b97`. |
| 2. V-STD baseline on the untouched tree | All green (section 3) |
| 3. Owner answers Q-00 to Q-08 | Q-00 and Q-01 yes in writing; Q-02 to Q-07 recommendations accepted; Q-08 answered (Infinix X6880). Recorded in `OWNER-AUTHORIZATION.md`. |
| 4. Spike A: second React activity | Done on the device (section 4) |
| 5. Spike B: lifecycle orders and guard | Done on the device, with one limit: a true co-resumed split screen could not be produced on XOS. Guard chosen (section 4.2). |
| 6. Spike C: `specialUse` service, overlay, launch from another app | Done on the device |
| 7. Spike D: reminder due while the second activity is in front | Done on the device; **R-03 confirmed** |
| 8. ADR-036 drafted | `docs/decisions/ADR-036-floating-assistant.md`, status proposed |
| Spike code removed | Yes. All four touched tracked files were restored with `git checkout`, and the three spike files deleted. `git status` shows only this report, the evidence folder, ADR-036 and the authorization note. |

Nothing was ported from `LAFINA`; no feature code was written.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `docs/plans/lafina-floating-assistant/OWNER-AUTHORIZATION.md` | Added the owner's follow-up answers (branch, device, unattended run) | Provenance for later phases | — |
| `docs/decisions/ADR-036-floating-assistant.md` | New ADR, status proposed | FLOAT-00 task 8 | Spike results below |
| `docs/reports/float-00-report.md` | This report | Phase report | — |
| `docs/reports/evidence/float-00/*` | Baseline logs and filtered spike evidence | Evidence | — |
| Spike code (thrown away) | `SpikeQuickActivity.kt`, `SpikeOverlayService.kt`, `SpikeQuickRoot.js`, temporary edits to `index.js`, `MainActivity.kt`, `AndroidManifest.xml`, `styles.xml` | Spikes A–D | Reverted; the patch kept outside the repo |

## 3. Tests and real outcomes

Baseline on the untouched tree (`d331b97` + authorization note only):

| Check | Exact command or manual procedure | Result | Evidence path / error |
|---|---|---|---|
| Typecheck, lint, Jest, architecture | `npm run preflight` | PASS: 146 suites, 2,027 tests passed, 1 skipped, 0 failed; architecture "380 TypeScript modules checked; 0 import cycles … 105 offline leaves" | `docs/reports/evidence/float-00/baseline-preflight.log` |
| Kotlin compile + JUnit | `android> .\gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest -PreactNativeArchitectures=x86_64` | PASS: BUILD SUCCESSFUL; 76 JUnit tests, 0 failures | `docs/reports/evidence/float-00/baseline-gradle-kotlin-unit.log` (the first attempt failed only because the log folder did not exist yet; the re-run is the recorded result) |
| Android build | `android> .\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a` | PASS: `app-arm64-v8a-debug.apk` | `docs/reports/evidence/float-00/baseline-assembleDebug.log` |
| Device spikes | Section 4 | PASS with findings | `docs/reports/evidence/float-00/spike-d-*.{md,log}` |

## 4. Device spike results

All device results below are from the Infinix X6880, Android 15 / API 35, build `X6880-15.1.2.200(OPPJ001PF001PJ)`, app `com.lafina.capstone.debug` (spike build, JS from Metro), 2026-11-17 13:04–13:19 local time. Your installed `com.lafina.capstone` and `.performance` apps were not reinstalled or modified.

### 4.1 Spike A — second React activity on the shared host

| Check | Observed |
| --- | --- |
| Cold process (`am start` the spike activity with no `MainActivity`) | Activity resumed in 1.2 s. The JS bundle came from Metro and took about 77 s on first build, so cold time here is a Metro artefact, not a product number. The root then mounted with `AppState=active`. |
| Renders over another app | Yes. Translucent window with the app underneath visible (screenshot reviewed) |
| JS timers | Run while the activity is resumed; pause while it is stopped (counter continued from its last value on reopen) |
| Keyboard | `autoFocus` opened it immediately. `keyboardDidShow` reported 254.9 dp. The window is **not** resized (edge-to-edge), and the reported height **excludes the navigation bar**, so the spike sheet was partly hidden. FLOAT-03 must offset by keyboard height **plus** the bottom inset. |
| Back under target-36 predictive back | 1st Back: keyboard hides. 2nd Back: JS `BackHandler` fires, then the activity finishes and the previous app returns. |
| Close in split-screen state | `BackHandler` fired but the activity did **not** finish. Decision: Quick Chat closes via an explicit native `finish()`. |
| SoftException at cold start | `onWindowFocusChange … context is not ready` (`ReactNoCrashSoftException`), React Native's normal cold-start noise; no crash |

### 4.2 Spike B — lifecycle orders

| Order | Result |
| --- | --- |
| Quick Chat open → open LAFINA from launcher → Home | Quick Chat paused (as current) → `MainActivity` resumed → Home → `MainActivity` paused (as current). No assertion. |
| Quick Chat (existing, stopped) reopened from the orb → closed → open LAFINA | Resumed with state intact, finished, `MainActivity` resumed. No assertion; LAFINA UI rendered. |
| Cold Quick Chat → later `MainActivity` | Main root mounted on the already-running host and worked. |
| Split screen: LAFINA in one half, launch Quick Chat (`am start --windowingMode 6`, and `FLAG_ACTIVITY_LAUNCH_ADJACENT` after entering XOS split via Recents → Split screen) | In both attempts `MainActivity` was **paused first**, and Quick Chat opened as its own full-screen task. A state with both activities resumed was **not reached** on XOS. |
| `AppState` | Shared across both activities, as predicted (C-1). |

**Guard chosen:** see ADR-036 Decision 5.
- Hide the orb while LAFINA is visible.
- `MainActivity.onResume` finishes Quick Chat.
- `QuickChatActivity` uses a narrow guarded delegate: skip host pause when it is not the current activity, and skip host resume (and finish) when `MainActivity` is resumed.

Why the delegate and not the RN feature flag: the flag only turns the assertion into a warning and still pauses the host, which would freeze JS timers in a visible LAFINA screen (read in `ReactHostImpl.kt` `onHostPause`).

This is the one guard decision **not proven on a device**, because co-resume could not be produced on XOS. M-26 must be checked on the AOSP emulator in FLOAT-03.

### 4.3 Spike C — `specialUse` service, overlay, launch

| Check | Observed |
| --- | --- |
| `startForeground(…, FOREGROUND_SERVICE_TYPE_SPECIAL_USE)` started while LAFINA was visible | OK. `dumpsys`: `isForeground=true types=0x40000000` |
| Overlay window | Added, 176×176 px (64 dp), `ty=APPLICATION_OVERLAY` |
| Over Settings | **Hidden by the system** (`mForceHideNonSystemOverlayWindow=true`); taps went to Settings. This is expected platform behaviour (pack `02` §2.2), now confirmed on XOS. |
| Over Calculator, tap orb | `START … SpikeQuickActivity … (BAL_ALLOW_NON_APP_VISIBLE_WINDOW) result code=0`. Root mounted ~145 ms after the tap; keyboard ~400 ms (warm runtime, two taps; not a benchmark). The 1.5 s one-shot check saw the activity resumed. |
| Notification | Posted with `FOREGROUND_SERVICE` flag; removed by force-stop |

XOS did not block the background launch in this test. The launch was justified by the **visible overlay window** (`BAL_ALLOW_NON_APP_VISIBLE_WINDOW`), so the orb must be visible at tap time, which it always is.

### 4.4 Spike D — reminder due while Quick Chat is the visible screen

Setup: guest onboarding (Fast-Path only, COR skipped, permissions already allowed), then a Chat-tab reminder "remind me to float spike check at 1:17 pm" → Confirm. Quick Chat opened from the orb over Calculator. The main root was mounted but stopped.

| Time (local) | Event |
| --- | --- |
| 13:17:00.025 | Native `fired` (AlarmManager) |
| 13:17:00.038 | Native `posted`: full-screen call notification, shown as a heads-up over Quick Chat (screen on, unlocked) |
| 13:18:34.882 | Quick Chat resumed again (closed and reopened from the orb) |
| 13:18:34.951 | Hidden main root: `[ReminderPoller] Poller started for user local_guest_user` |
| 13:18:35.562 | **`call_admitted` (origin js)**. The hidden main root consumed the pending native call and admitted it into a screen nobody could see. |

**R-03 is confirmed.** FLOAT-03 must skip both the poller start and `consumePendingNativeCall()` in `App.tsx`'s `AppState` handler while Quick Chat is visible. Evidence: `docs/reports/evidence/float-00/spike-d-delivery-receipts.md`, `spike-d-js-and-native-lifecycle.log`.

### 4.5 Other finding (pre-existing, not caused by the spike)

On a brand-new database, `ThemeProvider` reads `local_settings` during its first render, before `App`'s `setupApp` has run `initDatabase()`. LogBox showed "Error reading local setting: … no such table: local_settings". `localSettingsStore.get` catches it and returns the fallback, so it is harmless.
- Proof by code: `ThemeContext.tsx` initial state calls `getSavedUIVariant(userId)`.
- I could not re-check it on a clean install because clearing the debug app's data was not permitted.
- Consequence: `QuickChatRoot` will `await initDatabase()` before rendering `ThemeProvider`.

## 5. Performance and device matrix

No performance claims. The two timings in 4.3 are single observations from log timestamps, not measurements. Measurements are FLOAT-07.

| Matrix row (`06` §4.1) | Status |
| --- | --- |
| Infinix X6880, XOS, Android 15 | Spikes A–D run |
| Emulator / Pixel API 30, 13/14, 16 | NOT TESTED (no device) |
| Emulator Android 17 beta | Available, NOT RUN in this phase |
| Samsung, Xiaomi, OPPO/realme, tablet | NOT TESTED (no device) |

## 6. Reliability, privacy, permissions, licenses

- Permissions in the spike were the two approved ones, in throwaway code only. The manifest and allow-list are unchanged at the end of the phase.
- Your phone: an alarm from your own Clock app went off during the split-screen attempt. It was not touched.
- The debug app's insistent test call notification was cleared with `am force-stop com.lafina.capstone.debug`.
- The debug app still holds the overlay app-op (`appops … allow`) and a guest test user with one test reminder. Both belong to `com.lafina.capstone.debug`, not your installed app. The overlay grant will be reset before the FLOAT-06 explainer test.
- Full device logcat (which lists other apps on the phone) was not saved to the repository. Only LAFINA-filtered lines are kept.

## 7. Docs/ADRs changed

- `docs/decisions/ADR-036-floating-assistant.md` (new, proposed)
- `docs/plans/lafina-floating-assistant/OWNER-AUTHORIZATION.md` (follow-up answers)
- Import-cycle check: part of `npm run check:architecture` in the baseline, PASS.

## 8. Open blockers and recommended next steps

No blockers. Adjustments carried into later phases:
1. FLOAT-03: keyboard offset = keyboard height + bottom inset; close via native `finish()`; await `initDatabase()` before `ThemeProvider`.
2. FLOAT-03: R-03 gate in `App.tsx` (required); guarded delegate on `QuickChatActivity`.
3. FLOAT-03: verify M-26 (split screen) on the Android 17 emulator, since XOS would not co-resume.
4. FLOAT-02: help text should mention that some screens (for example Settings) hide the button.

## 9. Review decision

- [x] All automated required checks passing (baseline)
- [x] Device spikes run and recorded with device identifiers
- [x] No disallowed scope/code change; spike code removed
- [x] Report accurate; evidence linked

STATUS: READY FOR REVIEW
