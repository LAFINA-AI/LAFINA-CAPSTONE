# Floating LAFINA — faster Quick Chat open from the button / Completion Report

**Branch:** `feature/lafina-floating-assistant` (uncommitted, same working tree as FLOAT-00..07, CALL-FIX and the button look change).
**Date:** 2026-11-18 (Asia/Manila)
**Requested by:** owner chat 2026-11-18: "opening lafina using the edge bar has like a 3 second delay so it feels laggy. improve and fix that."
**Status:** see section 5.

## 1. Cause (measured, not guessed)

Timing logs on the Infinix showed the Quick Chat **window** up about 0.13 s after the tap. Its **content** waited 0.7–0.8 s, and the sheet started appearing 0.9–1.3 s after the tap.

Opening Quick Chat resumes the React host that the main screen shares. The hidden main screen therefore ran its whole "back in front" refresh at the same moment, on the same JS thread:
- data reload
- reminder re-arm
- permission read
- sync
- a Home re-render

That is about 0.5–0.6 s of work before Quick Chat could draw. One open right after a Metro reload took 3.1 s. The owner's 3 s was not reproduced with plain taps; see the evidence file.

## 2. What changed

| Area | Change |
| --- | --- |
| `src/ui/quickChat/quickChatPresence.ts` | `markPanelShown()` and `deferWhileOpening(task)`. While Quick Chat is opening, held work waits until the panel has appeared, or `QUICK_CHAT_SETTLE_FALLBACK_MS` (1.5 s) at the latest. It is dropped if Quick Chat closes first. Otherwise the work runs at once. |
| `App.tsx` | The foreground ("active") work moved into `runForegroundWork` and goes through `deferWhileOpening`. The previous held work is cancelled on any later state change and on unmount. The R-03 check (`quickChatPresence.isOpen()`) runs when the work runs, so the poller and pending-call rules are unchanged. |
| `src/ui/screens/dashboard/hooks/useDashboardData.ts` | Home's refresh on "active" also waits for the opening panel. |
| `src/ui/quickChat/QuickChatPanel.tsx` | The open animation's end calls `markPanelShown()`. The reduce-motion setting is read once and then followed by Android's change event, so later opens skip a native round trip before the animation. |
| `src/ui/quickChat/QuickChatRoot.tsx` | After Quick Chat's first successful `initDatabase`, a reopen skips the schema pass. The storage health check and the student lookup still run on every open. |
| Docs | ADR-036 "Open speed" section; timings in `evidence/float-open-speed/device-timings.md`. |

No native, permission, dependency or schema change.

## 3. Verification

| Check | Result |
| --- | --- |
| `npm run preflight` | PASS, exit 0: 160 suites, 2158 passed, 1 skipped (the existing opt-in `AGY_MEASURE` test); architecture check 398 modules, 0 cycles — `docs/reports/evidence/float-open-speed/preflight.log` |
| Gradle `:app:testDebugUnitTest` (JDK 17) | BUILD SUCCESSFUL — `evidence/float-open-speed/gradle-kotlin-unit.log` |
| New tests | `quickChatPresence.test.ts` +6 (runs at once when closed; waits for the panel, then runs once; fallback time; dropped on close or cancel; a reopen holds again; a failing task is contained). `appQuickChatIntegration.test.tsx` +2 (the hidden main screen's work waits for the panel and R-03 still holds; held work is dropped if Quick Chat closes, and the main screen's own return does it). `quickChatRoot.test.tsx` +2 (the panel reports it appeared before the fallback; a reopen skips the schema pass but still sees a sign-out). |

## 4. Device results (Infinix X6880, Android 15, debug build)

These are seconds from the tap to the moment the sheet starts appearing. The full table is in the evidence file.

| | Before | After |
| --- | --- | --- |
| Repeat opens | 0.92–1.31 | 0.32–0.38 |
| Panel fully in, keyboard up (repeat opens) | 1.07–1.43 | 0.48–0.56 |
| First open after LAFINA starts | 1.28–1.31 | 0.66 (fully in at 0.98) |

- Quick Chat opened and closed normally three more times after the timing lines were removed. Back closed the keyboard, then the panel.
- **Single sighting, not reproduced:** once, "Poller started" was logged about 1 s after an open while Quick Chat was in front. It did not recur in four further open/close cycles. The new code cannot start the poller while Quick Chat is open: held work runs only while Quick Chat is still open, and it re-checks `isOpen()`. I'm noting it here so it is visible.
- **Not measured:** release-build timings. The first open after a process start still pays the panel's first render, about 0.5 s.

## 5. Status

Automated checks pass, and the device timing improvement is measured on the owner's phone. Owner feel-check pending.

STATUS: READY FOR REVIEW
