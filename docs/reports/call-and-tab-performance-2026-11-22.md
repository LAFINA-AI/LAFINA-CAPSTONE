# Call LAFINA and tab-switch performance / Completion Report

**Branch / commit SHA:** `codex/skills-hub`, uncommitted working tree on top of `f03f128`
**Date/time UTC:** 2026-11-21T19:00Z (2026-11-22 local)
**Device(s) available:** NONE (`adb devices` listed no device)
**Status:** `AWAITING DEVICE VALIDATION`
**Phase approval provenance:** owner message "proceed and fix all of those and improve them", after the read-only analysis in the same session.

## 1. Scope completed

This work follows phase 17 (`docs/reports/phase-17-report.md`), which memoized the screen roots, moved the mini bar's meter and timer out of `App.tsx`, and bounded Calendar. It fixes the eight items from the 2026-11-22 analysis.

| # | Problem found | Change |
|---|---|---|
| P1 | The call avatar ran a JavaScript animation loop at ~36 fps in every phase. It rebuilt 9 SVG paths through React state, and kept running while the call was minimized (the screen is only `display: none`). | `SynthWaveAvatar` runs the loop only in moving phases (connecting, listening, thinking, working, speaking) and never when `paused`. Other phases draw one still frame. The loop is ~25 fps and eases toward the target level. Levels are read from a ref, so a level change (up to 10 a second) no longer restarts the loop. The component is memoized. |
| P2 | Every audio-level event (mic 5 Hz, LAFINA's voice 10 Hz) and the 1-second call clock re-rendered the whole 3,941-line call panel. | New `callMeter`: both call hooks route levels to a small meter store, and React state is kept when only the levels moved. `MeteredSynthWaveAvatar` and `MeteredCallWaveform` subscribe to the meter alone. `CallDurationText` owns the clock tick. The reminder call keeps its old behavior: `OnlineReminderConversation` adds the levels back into the snapshots it forwards. |
| P3 | The full-screen call covers Chat, but Chat stayed the active tab, so each saved call turn reloaded Chat underneath. | While the full-screen call is visible, no tab is active (`RetainedTab active` and Home `isActive` include `!callLafinaVisible`). Minimizing or closing the call reactivates the tab once. |
| P4 | The offline call never pre-loaded Whisper, so the first sentence paid the cold model load. The voice engine also started only after the mic checks. | `warmupOfflineSpeech()` runs when the call screen opens and the call is predicted offline (not while minimized), and again when an offline call starts. `OfflineCallController.start` starts `voice.ready()` alongside the STT and permission checks; speaking still waits for every check. `warmupOfflineSpeech` no longer throws if the native warmup returns no promise. |
| P5 | An online start made two server round trips in a row, then built the student context. | New `VoiceConversationController.prepare()`: when the open, idle call screen expects an online call, it asks for capabilities ahead of time. It only runs for a signed-in, consented student in Online Mode, sends no audio or student data, and renews an expired sign-in token as a side effect. `start()` reuses a successful answer under 60 s old, or a request still in flight that began under 5 s ago; failed answers are never reused. The student context is now built while `createSession` is in flight. Logcat line added: `connected in Nms (server Nms, audio Nms, capabilities prepared/fetched)`. |
| P6 | `CallLafinaScreen`, `CallLafinaSettingsModal` and the App callbacks were not stable, so every App render (for example the keyboard opening during a call) re-rendered the call. | Both components are `React.memo`. App's `navigateFromCall`, close, minimize and attention handlers are stable (`useCallback`, with a ref for the minimized flag). The settings modal's handlers are stable. |
| P7 | Flipping Home's `isActive` re-rendered every widget: none were memoized and all handlers were inline. | The widget and `ModernHomeContent` exports are memoized. Home's handlers are `useCallback`, and the hook's `actions` object is memoized (the time-block modal is read through a ref). A new-minute refresh on return runs after paint; a new day still reloads before paint. Phase 17's choice to refresh Home's data while it is hidden is kept on purpose (a test pins it). |
| P8 | Profile re-rendered on every tab switch (`replayTour` depended on `activeTab`); Skills got a new inline `onOpenProfile` each render and was not memoized. | `replayTour` reads the tab from a ref; `openProfileTab` is stable; `SkillsScreen` is `React.memo`. |

Deferred: Calendar's remaining ~50 ms switch cost needs a React Profiler session on a phone; reading the code found no clear cause.

## 2. Change summary

| File/module | Change | Item | Test evidence |
|---|---|---|---|
| `src/ui/components/callLafina/SynthWaveAvatar.tsx` | Pure strand builder; still frame outside moving phases; `paused`; ~25 fps eased loop that reads levels from a ref; memoized | P1 | `synthWaveAvatar.test.tsx`, `callPerformance.test.tsx` |
| `src/ui/hooks/callMeter.ts` (new) | Meter store, `routeSnapshot`, `differsOnlyInLevels`, `useCallLevels` | P2 | `callPerformance.test.tsx` |
| `src/ui/components/callLafina/MeteredCallVisuals.tsx` (new) | Metered avatar and waveform; `CallDurationText` | P2 | `callPerformance.test.tsx`, `callLafinaPhase01` (`call-timer`) |
| `src/ui/hooks/useVoiceConversation.ts`, `src/ui/hooks/useOfflineCall.ts` | Route snapshots through the meter; expose `meter` and `prepare` | P2, P5 | call suites |
| `src/ui/components/call/OnlineReminderConversation.tsx` | Forwards levels to the reminder call view | P2 | `onlineReminderConversation.test.tsx` (mock now has a meter) |
| `src/ui/components/voice/VoiceConversationPanel.tsx` | Metered visuals; `paused` prop; clock moved out; stable settings handlers; offline warmups; `prepare()` effect | P1, P2, P4, P5, P6 | call suites, `offlineCallPanel.test.tsx` |
| `src/ui/components/callLafina/CallLafinaSettingsModal.tsx` | `React.memo` | P6 | call suites |
| `src/ui/screens/CallLafinaScreen.tsx` | `React.memo`; passes `paused` | P1, P6 | `callLafinaPhase01` |
| `App.tsx` | Stable call handlers; `paused={!callLafinaVisible}`; tabs and Home inactive under the full-screen call; stable `openProfileTab`; `replayTour` via ref | P3, P6, P8 | `callOverlayTabs.test.tsx` |
| `src/cloud/voiceConversation/controller.ts` | `prepare()` and reuse rules; context built during `createSession`; connect-timing log | P5 | `voiceConversationController.test.ts` (10 new) |
| `src/ai/offlineCall/offlineCallController.ts` | Voice engine readied beside the mic checks | P4 | `offlineCallController.test.ts` (3 new) |
| `src/ai/native/speechCapture.ts` | `warmupOfflineSpeech` tolerates a missing or non-promise warmup | P4 | `offlineCallPanel.test.tsx` |
| `src/ui/screens/dashboard/components/index.ts` | Memoized exports | P7 | `dashboardActivationRenders.test.tsx` |
| `src/ui/screens/dashboard/DashboardScreen.tsx`, `hooks/useDashboardData.ts` | Stable handlers and `actions`; minute refresh after paint | P7 | `dashboardScreen.test.tsx`, `dashboardActivationRenders.test.tsx` |
| `src/ui/screens/skills/SkillsScreen.tsx` | `React.memo` wrapper only | P8 | Skills suites |

New tests: `__tests__/ui/callPerformance.test.tsx` (8), `__tests__/ui/callOverlayTabs.test.tsx` (1), `__tests__/ui/dashboardActivationRenders.test.tsx` (1), plus 10 in `voiceConversationController.test.ts`, 3 in `offlineCallController.test.ts` and 2 in `offlineCallPanel.test.tsx`. The App overlay test and the Home render test were each confirmed to **fail with their fix removed**.

## 3. Tests and real outcomes

Evidence directory: `docs/reports/evidence/performance-20261122/`.

| Check | Command | Result | Evidence |
|---|---|---|---|
| Typecheck | `npm run typecheck` | **FAIL, existing errors only.** 29 errors, all in uncommitted Skills work that predates this change: `DocGenSkill.tsx` 14, `QuizSkill.tsx` 11, `SkillsScreen.tsx` 2 (QuizSkill's missing `QuizInitialHandoff`/`initialHandoff` types), `__tests__/skills/docGenSkill.test.tsx` 2. None are in files this change touched, apart from those two existing QuizSkill type errors surfacing in `SkillsScreen.tsx`. | `typecheck.log` |
| Lint | `npm run lint` | **FAIL, existing errors only.** 6 errors in `QuizSkill.tsx` and `SourcePicker.tsx` (Skills WIP). This change's files lint clean with `--max-warnings 0`. | `lint.log` |
| Architecture | `npm run check:architecture` | PASS: 479 modules, 0 import cycles, 0 forbidden dependencies, 117 offline leaves reach no network module | `architecture.log` |
| Call and voice suites | `npx jest __tests__/ui/callLafinaPhase0* ... (25 suites)` | PASS 25/25 suites, 423/423 tests, before the new tests were added | session log |
| New tests | listed in §2 | PASS | `jest-full.log` |
| Full Jest | `npm test` (runInBand) | **FAIL, existing failures only.** 195/199 suites, 2,613/2,631 tests passed (1 skipped). The 4 failing suites (17 tests) are all in `__tests__/skills/` (`lessonQaUi`, `docGenSkill`, `skillsUi`, `materialQa`) and test the uncommitted Skills WIP. With this change's only Skills edit (the `SkillsScreen` memo wrapper) temporarily removed, the same 4 suites fail with the same 17 tests, so the failures predate this change. Every call, voice, dashboard, tab and App suite passed. | `jest-full.log` |
| JS release bundle | `npx react-native bundle --platform android --dev false` | PASS | `js-bundle.log` |
| Android Gradle | `gradlew :app:assembleDebug` (JDK 17) | PASS: `BUILD SUCCESSFUL in 1m 1s` (no native code changed) | `gradle.log` |
| Device manual | §6 | **NOT RUN**: no phone connected | — |

## 4. Performance and device matrix

**Not measured on a device.** No phone was attached, so there are no before/after frame, latency or battery numbers. The JS-thread savings are proven structurally in Jest:

- Level updates no longer re-render the call screen (`callPerformance.test.tsx`).
- Showing and hiding Home no longer re-renders its content (`dashboardActivationRenders.test.tsx`).

For comparison, phase 17's warm tab-switch trace (60 rounds) had Home and Calendar at ~50 ms median / ~70 ms p95, and 20% janky frames. Re-run that trace (`src/utils/tabPerformance.ts`, performance build) to measure this change, and add a run with a minimized live call, which phase 17 never measured.

For online call start, the new logcat line gives the first real numbers: `[VoiceConversation] connected in …ms (server …ms, audio …ms, capabilities prepared|fetched)`.

## 5. Reliability, privacy, permissions, licenses

- **No new permissions and no native changes.**
- **`prepare()` network call.** It sends one authenticated capabilities GET when the call screen opens. It runs only for a signed-in, consented student in Online Mode. It sends no audio, transcript or student context, and the existing guarantee that a denied mic or no internet sends nothing at Call is unchanged (the existing tests still pass).
- **Whisper warmup.** It loads the model into memory while the offline call screen is open; nothing listens. The model still unloads itself after 60 s unused or under memory pressure.
- **Lagging levels in `snapshot`.** The call hooks' `snapshot` now carries levels that can lag; live levels come from `meter`. The only consumers (avatar, waveform, reminder call view) were updated.
- **Prettier on WIP files.** A Prettier run reflowed `src/ui/components/callLafina/MiniCallBar.tsx`, which holds the owner's uncommitted mascot-image change. Its code is unchanged; only line wrapping differs. Four other files Prettier touched by accident (Dashboard components) were restored to HEAD after confirming their diff was formatting only.

## 6. Human phone verification

Install a debug build of this working tree, sign in with a consented account in Online Mode, and keep `adb logcat | findstr "VoiceConversation OfflineCall IntentService LafinaSpeechToText"` open.

1. **Online call.** Open Chat, then Call LAFINA. Tap Call. Expected: connects as before. Logcat shows `connected in …ms … capabilities prepared` (tapped within a minute of opening) or `fetched`.
2. **Avatar and clock while speaking.** The wave should move smoothly with LAFINA's voice and the clock should tick every second. The rest of the screen (cards, captions) should not flicker.
3. **Minimized call.** Minimize during a live call and switch between all five tabs. Expected: tabs respond normally, the mini bar's clock keeps counting, and audio continues. Expand: the avatar moves again and the clock shows the right elapsed time at once.
4. **Card while minimized.** Ask LAFINA to add a task while minimized. The call comes forward with the card. Confirm it. After ending the call, Chat shows the turns and Home shows the task.
5. **Offline call.** Turn on airplane mode, open Call LAFINA (the Offline badge shows), wait 2–3 s, then tap Call. Expected: the greeting plays sooner than before, and the first reply does not stall on a cold Whisper load. Logcat shows the Whisper context loading when the screen opened, not after the first sentence.
6. **Tab switching.** Switch Home ↔ Calendar ↔ Chat ↔ Skills ↔ Profile repeatedly. Expected: no regressions; Home shows fresh data after edits made in other tabs.

The agent cannot certify frame rate, audio, latency or battery on a phone.

## 7. Docs/ADRs changed

This report only. No schema, permission or architecture-rule change. Architecture check result is in §3.

## 8. Open blockers and recommended next steps

1. The Skills work-in-progress (`QuizSkill.tsx`, `DocGenSkill.tsx`, `SourcePicker.tsx`, `__tests__/skills/docGenSkill.test.tsx`) keeps `typecheck` and `lint`, and therefore `preflight`, red. That needs finishing on its own; this change did not touch it beyond the `SkillsScreen` memo wrapper.
2. Re-run the phase 17 tab trace on a phone, plus a run with a minimized live call (§4).
3. Profile Calendar's ~50 ms switch cost with the React Profiler on a phone.

## 9. Review decision

- [ ] All automated required checks passing — **no**: typecheck and lint fail on the existing Skills WIP only.
- [ ] Manual device tests completed and human-confirmed — **NOT RUN** (no device).
- [x] No disallowed scope/code change.
- [x] Report accurate; links validated.

`STATUS: AWAITING DEVICE VALIDATION` — `STOPPED — awaiting explicit human approval`
