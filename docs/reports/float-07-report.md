# PHASE FLOAT-07 — Hardening, device validation and MVP gate / Completion Report

**Branch / commit SHA:** `feature/lafina-floating-assistant` (from `d331b97`). No commit made.
**Date/time:** 2026-11-17 22:43 to 2026-11-18 00:30 (Asia/Manila)
**Device(s):** Infinix X6880 (XOS, Android 15), serial 13195704C2004480, `app-arm64-v8a-debug.apk` (built 2026-11-17 22:22) with JS from Metro. Android 17 emulator (`emulator-5554`, API 37) available but not used (section 4).
**Status:** `AWAITING DEVICE VALIDATION` — the MVP gate is **not** passed yet (TalkBack, 8-hour battery, release-build numbers and the R-07 memory decision are open; M-26 passed on the emulator 2026-11-18)
**Phase approval provenance:** Unattended run FLOAT-00 to FLOAT-07 (`docs/plans/lafina-floating-assistant/OWNER-AUTHORIZATION.md`); owner chat 2026-11-17/18: "phone is ready".

## 1. Scope completed

| Task (`05` FLOAT-07) | Result |
| --- | --- |
| 1. Device matrix and manual cases of `06` | Infinix: all functional cases run except M-21/M-22 (needs a signed-in account), M-24 (needs a second account; J-16 covers it), blocked-launch hint (never occurred). M-26 PASS on the Android 17 emulator (2026-11-18). Per case: `docs/reports/evidence/float-03/device-checks.md` |
| 2. Measure `04` §7 targets | Done on the debug build (section 3); release build NOT RUN |
| 3. Process death, force-stop, low memory, permission revoke, sticky restart | PASS, no crash |
| 4. TalkBack, 200 % font, reduced motion | 200 % font: one defect found and fixed; reduced motion PASS; TalkBack NOT RUN |
| 5. OEM pass and help text | Infinix/XOS observed: overlay permission opens a **list**, not LAFINA's page (explainer copy says so); launches from the orb were never blocked; sticky restart works. Help text already matches |
| 6. Separate-process memory fallback decision | Not decided: needs a release-build number (section 3) |
| 7. Accept ADR-036 with measured facts | Measured facts added; status kept **proposed** because the gate is open |

## 2. Fixes made in this phase (all found on the phone)

| File | Fix | Test |
| --- | --- | --- |
| `src/ai/quickChat/quickChatController.ts`, `src/ui/quickChat/QuickChatConversation.tsx` | Cancel gave the words back only if the panel had not been closed and reopened; the words now live in the controller (`setCardSource` / `getCardSource`, cleared with the transcript) | J-12 "Cancel after closing and reopening…" |
| `src/ui/components/profile/FloatingAssistantSettings.tsx` | With the permission revoked while on: an "Allow" button under "Permission needed" opens the explainer; returning without the grant turns the setting off so the switch matches the message | J-16 "on but revoked…" |
| `src/ui/quickChat/QuickChatPanel.tsx` | Header clipped the title at 200 % font scale; header now grows (`minHeight`) | Device re-check; J-09/J-10 unchanged and passing |

## 3. Measurements (debug build; upper bounds, not release numbers)

| Item | Result | Target (`04` §7) | Verdict |
| --- | --- | --- | --- |
| Tap to panel, warm (orb tap → panel window first frame, 5 runs) | median 152 ms (140–169) | ≤ 500 ms median | Meets (debug) |
| Tap to panel, cold process (after process kill, from the notification) | window at once; ready to type ~3 s with the bundle from Metro | ≤ 2.5 s | Not measured on a release build |
| Orb after leaving LAFINA (pause → `Orb shown`, 5 runs) | median 301 ms (285–306), includes a deliberate 200 ms delay | ≤ 300 ms | Borderline; lowering `SHOW_DELAY_MS` would trade against flicker between LAFINA screens |
| Added memory for service + orb | +3.6–3.9 MB graphics; other differences within noise | ≤ 5 MB | Meets |
| Whole process kept resident by the service (R-07) | ~398 MB PSS (debug build) | measure | Open: release build needed before deciding on the separate-process fallback |
| Idle CPU with the orb shown, 60 s | 310 ms, all in debug Metro/network/connectivity threads and 60 ms main thread; none identified from this feature | no periodic work | No periodic work from the feature found |
| Alarms and wake locks | no repeating alarm, no wake lock held | none | Meets |
| Battery over 8 h idle | NOT RUN | < 1 % / 24 h | Open |

## 4. Not run, with reasons

- **Android 17 emulator:** the earlier x86_64 build failure was the Java version (Android Studio JBR 25), not the project; with JDK 17 it builds. M-26 split screen then PASSED on 2026-11-18 (`docs/reports/float-orb-look-report.md` section 3).
- **TalkBack:** turning on the screen reader changes how the whole phone is used; needs the owner.
- **8-hour battery, release-build timings and memory:** need a release build and a long idle window.
- **M-21/M-22 online:** the debug app's account is the offline guest.

## 5. Finding outside this feature

A reminder call that timed out natively (CALL-FIX 45 s cutoff) is presented again by the main app's reminder poller when LAFINA next opens. Reproduced with no Quick Chat involvement (clean control at 23:49). Fixed on 2026-11-18 with the owner's permission (`src/scheduler/reminderPoller.ts` re-reads the reminder before claiming; regression test added; preflight 2140 passed). Phone re-check NOT RUN: `docs/reports/call-fix-followup-2026-11-18.md`.

## 6. Tests

| Check | Result | Evidence |
| --- | --- | --- |
| Full `npm run preflight` after the fixes | PASS: 159 suites, 2139 passed, 1 skipped | `docs/reports/evidence/float-07/preflight.log` |
| Panel, review and settings suites after the header fix | PASS (25 + 12) | — |
| Typecheck, lint, architecture | PASS | — |
| Gradle Kotlin + JUnit, arm64 `assembleDebug` | PASS (FLOAT-03 run; no native change since) | `docs/reports/evidence/float-03/gradle-*.log` |

## 7. Known limitations for users

- The button may take about a third of a second to appear after leaving LAFINA.
- While the button is on, LAFINA stays in memory and shows a notification.
- Some screens (Android settings, permission prompts, banking apps) hide floating buttons.
- Requests with several steps are not reviewed in the panel; LAFINA asks to open the app.
- Online answers need Online Mode on a signed-in account.

## 8. Human phone verification (short)

1. Turn on Profile → Floating LAFINA, press Home, tap the red button, ask "add my networking exam this Friday at 9 AM", Confirm: one event in Calendar.
2. Revoke "Display over other apps" for LAFINA in Android settings, open Profile: the row says "Permission needed"; Allow → explainer.
3. With large text (Settings → Display → Font size, largest), open the panel: the title is fully visible.
4. TalkBack (owner): the button reads "LAFINA Quick Chat. Double tap to open." and offers the actions Move to left edge, Move to right edge and Hide; the panel's buttons are announced.

## 9. Review decision

- [x] Matrix results recorded, including "not tested" cells
- [x] Measurements recorded (debug build)
- [x] Known limitations listed
- [ ] MVP gate passed (TalkBack, battery, release build, R-07 decision open)

STATUS: AWAITING DEVICE VALIDATION
