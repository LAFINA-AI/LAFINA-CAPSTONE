# PHASE FLOAT-03 — Quick Chat activity shell / Completion Report

**Branch / commit SHA:** `feature/lafina-floating-assistant` (from `d331b97`). No commit made.
**Date/time UTC:** 2026-11-17
**Device(s) available:** None during this phase. The owner unplugged the Infinix X6880 and asked for coding to continue without disturbing a concurrent Codex session (CALL-FIX remediation) in the same working tree.
**Status:** `READY FOR REVIEW` (automated gates PASS; Infinix device checks PASS; M-26 split screen, themes and the blocked-launch hint NOT RUN)
**Phase approval provenance:** Unattended run FLOAT-00 to FLOAT-07, owner 2026-11-17 (`docs/plans/lafina-floating-assistant/OWNER-AUTHORIZATION.md`); owner chat 2026-11-17: "just continue coding without breaking codex's run".

## 1. Scope completed

| Task (`05` FLOAT-03) | Result |
| --- | --- |
| 1. Activity declaration (`04` §5.2) with the FLOAT-00 guard | Done in code: `singleTask`, own `taskAffinity` (`${applicationId}.quickchat`), `excludeFromRecents`, `exported="false"`, no `showWhenLocked`, `configChanges` as `MainActivity`, no `screenOrientation`. Guarded delegate per ADR-036 Decision 5. Compiles (section 3). |
| 2. Service: orb tap and notification Open start the activity; one-shot blocked-launch check; hint label; `launchBlockedSeen` | Done in code |
| 3. `QuickChatRoot`: storage, backend selection, current user, providers, presence; "no user" and "storage problem" states | Done; J-09 |
| 4. `QuickChatPanel` shell: scrim, sheet, header (title, status chip, Open LAFINA, Close), insets + keyboard offset for edge-to-edge, Back (keyboard, then close), open animation with reduced-motion variant | Done; J-09 |
| 5. `App.tsx` R-03 gate: no reminder poller start and no native-call consumption while Quick Chat is in front; sync scheduler unchanged | Done; J-17 |
| 6. `App.tsx`: data-changed listener; navigation consumption with owner check; apply-for-user on account change | Done; J-17, J-16 |
| 7. Theme primary colour sent to the orb | Done (`OrbColorSync` in the root) |

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `android/.../QuickChatActivity.kt` (new) | Second React activity `LafinaQuickChat`, guarded delegate, visibility event before host resume, `finishIfOpen()` | ADR-036 D2, D5, D7 | Compiles; device NOT RUN |
| `LafinaFloatingAssistantService.kt` | Orb tap → Quick Chat; 1.5 s one-shot launch check; 4 s non-touchable hint window; notification Open → Quick Chat; `dump()` adds `quickChatOpen`, `launchBlockedSeen`, `hintAttached` | Task 2 | Compiles; device NOT RUN |
| `LafinaFloatingAssistantModule.kt` | `closeQuickChat()`, `openMainApp()`; status adds `quickChatOpen` (diagnostic) | `04` §2.3 | J-09, J-13 (JS side) |
| `MainActivity.kt` | `QuickChatActivity.finishIfOpen()` before `super.onResume()` | ADR-036 D5 | — |
| `AndroidManifest.xml` | `QuickChatActivity` declaration | `04` §2.4 | Architecture check PASS |
| `res/values/styles.xml` | `QuickChatTheme` (translucent, transparent background, no dim, no window animation) | `04` §2.4 | — |
| `index.js` | Registers `LafinaQuickChat` | `04` §2.4 | — |
| `App.tsx` | Items (a)–(d) of `04` §2.4 | R-03, refresh, navigation, accounts | J-17 (3 tests) |
| `src/ui/quickChat/QuickChatRoot.tsx` (new) | Root, visibility bridge, orb colour | Task 3, 7 | J-09 (5 tests) |
| `src/ui/quickChat/QuickChatPanel.tsx` (new) | Sheet, header, keyboard and insets, Back, animation | Task 4 | J-09, J-14 |
| `src/ui/quickChat/floatingAssistantAccount.ts` (new) | `applyFloatingAssistantForUser` | Task 6 (d) | J-16 |
| `__tests__/ui/quickChatRoot.test.tsx`, `__tests__/ui/appQuickChatIntegration.test.tsx` (new) | J-09, J-17 | | PASS |

### 2.1 Deviations

1. `floatingAssistantAccount.ts` is a new JS file not listed in `04` §2.2. It holds the "apply for user" helper named in `04` §2.4 (d), so `App.tsx` gains one call instead of the logic.
2. The visibility of Quick Chat reaches JS through a native event emitted before the host resume (ADR-036 FLOAT-03 notes, item 1) rather than only from the root's mount and AppState, because AppState is shared by both roots (FLOAT-00 C-1) and cannot tell them apart.
3. `windowSoftInputMode="adjustResize|stateVisible"` on the activity; the window is edge-to-edge, so the sheet still positions itself above keyboard + bottom inset (FLOAT-00 Spike A).
4. The data-changed listener also invalidates `alarms`, `reminders`, `tasks` caches before bumping `refreshTrigger`, the same call the existing AppState handler makes.

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | Result | Evidence path / error |
|---|---|---|---|
| Typecheck (whole tree, including the concurrent Codex changes) | `npx tsc --noEmit` | PASS, 0 errors | `docs/reports/evidence/float-03/typecheck.log` |
| Lint (Floating LAFINA files and the edited shared files) | `npx eslint App.tsx index.js src/ui/quickChat … ProfileScreen.tsx __tests__/…` | PASS, 0 problems | `docs/reports/evidence/float-03/eslint-floating-files.log` |
| Architecture | `node scripts/check-architecture.mjs` | PASS: 397 modules, 0 cycles, 108 offline leaves | `docs/reports/evidence/float-03/architecture.log` |
| Floating LAFINA Jest suites (FLOAT-01 to 06, 11 suites) | `npx jest --runInBand <11 files>` | PASS: 85/85 | `docs/reports/evidence/float-03/jest-floating-suites.log` |
| Full `npm run preflight` | `npm run preflight` | PASS: 159 suites, 2137 passed, 1 skipped (`docs/reports/evidence/float-03/preflight.log`), run 2026-11-17 after the Codex session finished | `docs/reports/evidence/float-03/preflight.log` |
| Kotlin compile + JUnit | `.\gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest -PreactNativeArchitectures=x86_64` | PASS: BUILD SUCCESSFUL, `:app:compileDebugKotlin` executed; 87 JUnit tests, 0 failures (result files dated 22:21 of this run) | `docs/reports/evidence/float-03/gradle-kotlin-unit.log` |
| Debug APK | `.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a` | PASS: BUILD SUCCESSFUL, `app-arm64-v8a-debug.apk` built 22:22 | `docs/reports/evidence/float-03/gradle-assemble-arm64.log` |
| `npx jest __tests__/scheduler` | — | Covered by the full preflight (PASS) | `preflight.log` |

## 4. Device results

Infinix X6880, Android 15, 2026-11-17/18 (`docs/reports/evidence/float-03/device-checks.md`): M-11, M-12, M-13 (cold start from the notification after a process kill), M-25 and the R-03 gate (no reminder poller or call presentation from the main root while the panel is in front; M-23 rang once by the native path) PASS. A reminder call that timed out natively is presented again when the main app next opens; a clean control without Quick Chat shows the same, so it belongs to the CALL-FIX hand-over, not this feature. NOT RUN: M-26 (the x86_64 debug build fails at `:app:configureCMakeDebug[x86_64]` in this environment), themes other than the default, the blocked-launch hint (this phone never blocked a launch).

## 5. Performance, reliability, privacy, permissions

- No performance numbers. The service adds one delayed check per tap and a 4 s hint timer only when a launch is blocked.
- No new permission. The activity is not exported; the notification's `PendingIntent` is explicit and immutable.
- Reliability risk until the device run: the order "visibility event → AppState active" is reasoned from React Native's sources, not observed.

## 6. Human phone verification (short)

1. Install the debug build, turn on Floating LAFINA, press Home, open any app.
2. Tap the red button: the panel slides up over the dimmed app with the keyboard open.
3. Back once (keyboard closes), Back again (panel closes, the app is where it was).
4. Close LAFINA from recents, then tap Open in the LAFINA notification: the panel opens (slower).
5. With the panel open, open LAFINA from the launcher: no crash, one LAFINA screen, no button.

## 7. Docs/ADRs changed

`docs/decisions/ADR-036-floating-assistant.md` (FLOAT-03 to 06 notes).

## 8. Open blockers and recommended next steps

- Install `app-arm64-v8a-debug.apk` on the Infinix and run the device checks above.

## 9. Review decision

- [x] All automated required checks passing
- [x] Device checks complete on the Infinix (not-run items listed in section 4)
- [x] No disallowed scope/code change; deviations recorded
- [x] Report accurate; evidence linked

STATUS: READY FOR REVIEW
