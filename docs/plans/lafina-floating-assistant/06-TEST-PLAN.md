# 06 — Test Plan

- **Status:** plan. No test in this document has been written or run.
- Test file names are proposals. Commands are the repository's real ones (`package.json`; Gradle tasks used in earlier phase reports).

## 1. Layers

| Layer | Tool (existing in the repo) | Proves | Cannot prove |
| --- | --- | --- | --- |
| JS unit and component | Jest, `@react-native/jest-preset`, in-memory SQLite mock (`__mocks__/opSqliteMock.js`), native stubs in `jest.setup.js` | Pipeline integration, review rules, UI states, settings logic | Anything about overlays, services, launches, the microphone |
| Kotlin unit | JUnit 4 under `android/app/src/test/java/com/lafina/capstone/` | Orb geometry and gesture rules | Window manager behaviour |
| Static | `npm run typecheck`, `npm run lint`, `npm run check:architecture` | Types, lint, forbidden imports, permission allow-list, unreviewed writers | Runtime behaviour |
| Instrumented (optional) | `android/app/src/androidTest` (existing examples: `LafinaReminderAndroidTest`) | Service start and overlay attach on an emulator | OEM behaviour |
| Manual on devices | `adb`, screen recording, TalkBack | Everything the user actually experiences | — |

**Rule:** a device behaviour is "verified" only with a device model, Android version, build and date. Otherwise it is "not tested".

## 2. Commands

```
npm run preflight
npx jest --runInBand <test file>

cd android
.\gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest -PreactNativeArchitectures=x86_64
.\gradlew.bat :app:assembleDebug
cd ..
npm run android
```

Device helpers (debug application id `com.lafina.capstone.debug`):

```
adb shell appops set com.lafina.capstone.debug SYSTEM_ALERT_WINDOW allow
adb shell appops set com.lafina.capstone.debug SYSTEM_ALERT_WINDOW deny
adb shell dumpsys activity services com.lafina.capstone.debug
adb shell dumpsys activity activities
adb shell am compat enable FGS_SAW_RESTRICTIONS com.lafina.capstone.debug
adb shell am force-stop com.lafina.capstone.debug
adb shell dumpsys meminfo com.lafina.capstone.debug
adb shell dumpsys batterystats --reset
adb shell dumpsys batterystats com.lafina.capstone.debug
adb shell cmd deviceidle force-idle
adb logcat
```

## 3. Automated tests

### 3.1 Jest

| ID | File (proposed) | Cases |
| --- | --- | --- |
| J-01 | `__tests__/ai/quickReviewSurface.test.ts` | `'quick'` is kept as a surface; a quick proposal does not replace a chat or voice proposal and vice versa; a second quick proposal replaces the first; `latestPendingReview(owner, 'quick')` returns it |
| J-02 | `__tests__/ai/quickChatController.test.ts` | Example sentence → "Create event" proposal; `temporaryChat` set; no `chat_messages` rows; transcript capped; history passed back on the next turn |
| J-03 | same | `stop()` makes `isCurrent` false and the late result is ignored; second `send` while busy is rejected |
| J-04 | same | Data-changed event emitted after applied confirm and after undo, not after cancel or refusal |
| J-05 | same | Owner change clears transcript; idle expiry clears transcript |
| J-06 | `__tests__/cloud/onlineModeGate.test.ts` | Guest → off (`auth_required`); setting off → off; offline → off; signed-in + setting on + connected → on |
| J-07 | `__tests__/ui/quickChatPresence.test.ts` | Open flag; navigation request consumed once; owner mismatch discarded |
| J-08 | `__tests__/utils/floatingAssistantNative.test.ts` | Safe defaults when the native module is missing |
| J-09 | `__tests__/ui/quickChatRoot.test.tsx` | No user → "open LAFINA" state; storage not ready → storage state; user present → panel |
| J-10 | `__tests__/ui/quickChatPanel.test.tsx` | Send disabled when empty; echo then typing indicator; reply rendered; error restores text; "Still working" after the delay (fake timers) |
| J-11 | `__tests__/ui/quickChatReviewFlow.test.tsx` | Card shown; Confirm once → one event row, one reminder row, one receipt, one outbox entry; second Confirm → nothing new |
| J-12 | same | Cancel → no rows; refusal reasons `expired`, `session_ended`, `stale`, `not_found` → message and card removed; `failed` → card kept |
| J-13 | same | Success card shows the outcome reply; Done calls `closeQuickChat`; View in LAFINA writes a navigation request and calls `openMainApp` |
| J-14 | same | Scrim press ignored while a card is open |
| J-15 | `__tests__/ai/quickChatStarters.test.ts` | Each chip starter plus a realistic completion parses to the intended intent |
| J-16 | `__tests__/ui/floatingAssistantSettings.test.tsx` | Default off; explainer before `openOverlaySettings`; not granted → toggle off; granted → `setEnabled(true, userId)`; each status string; unsupported device |
| J-17 | `__tests__/ui/appQuickChatIntegration.test.tsx` | `App` bumps refresh on the data-changed event; does not start the reminder poller while Quick Chat is the visible screen; consumes navigation only for the current owner |
| J-18 | `__tests__/ui/quickChatVoice.test.tsx` (1.1) | Hold starts, release stops and sends, slide cancels; busy and denied states |

Regression: the full existing suite must stay green, in particular the review, chat, voice and reminder suites (`__tests__/ai/agyPort04ReviewedCommands.test.ts`, `__tests__/ui/agyPort04ReviewUi.test.tsx`, `__tests__/scheduler/`, `__tests__/ai/phase08ChatAndOrchestrator.test.tsx`).

### 3.2 JUnit

| ID | File (proposed) | Cases |
| --- | --- | --- |
| K-01 | `FloatingOrbRulesTest.kt` | Movement below slop is a tap; above is a drag |
| K-02 | same | Clamp inside safe bounds for several screen sizes and insets |
| K-03 | same | Nearest edge left/right, including the exact middle |
| K-04 | same | Edge + fraction → pixels → edge + fraction round trip; remap after rotation |
| K-05 | same | Dismiss-target hit test |

### 3.3 Static

| ID | Check |
| --- | --- |
| S-01 | `npm run check:architecture` passes with exactly the two approved permissions added |
| S-02 | No Quick Chat module references `executeNluAction` or `processAndExecuteIntent` (existing guard) |
| S-03 | No new entry in `package.json` dependencies; no Gradle dependency added |
| S-04 | Manifest: new activity and service are `exported="false"`; the service has the `specialUse` type and subtype property |

## 4. Manual device tests

### 4.1 Device matrix

Fill with what the owner can provide (Q-08). Empty cells are reported as "not tested".

| Device class | Android | Purpose |
| --- | --- | --- |
| Emulator or Pixel | 11 (API 30) | Minimum version |
| Emulator or Pixel | 13 or 14 | FGS types, notification permission |
| Emulator or Pixel | 15 | Overlay + FGS rule, edge-to-edge |
| Emulator or Pixel | 16 (API 36) | Target version, predictive back |
| Emulator or Pixel | 17 | Forward check |
| Samsung (One UI) | any available | Battery management |
| Xiaomi (HyperOS/MIUI) | any available | Background pop-up permission, autostart |
| OPPO or realme | any available | Floating-window naming, cleanup |
| Tablet or foldable | any available | Large-screen layout, multi-window |

### 4.2 Cases

| ID | Area | Steps | Expected |
| --- | --- | --- | --- |
| M-01 | Enable | Fresh install → Profile → Floating LAFINA → toggle | Explainer, then system list; nothing turns on by itself |
| M-02 | Enable | Return without granting | Toggle off, short message |
| M-03 | Enable | Grant, return, press Home | Orb appears on the right edge; notification present |
| M-04 | Orb | Drag around, release | Follows the finger; snaps to nearest edge; position kept after rotation |
| M-05 | Orb | Use the app underneath, type in it | All touches and the keyboard work; orb never takes focus |
| M-06 | Orb | Drag to the X; then open LAFINA and leave | Orb and notification gone; orb back after visiting LAFINA |
| M-07 | Orb | Notification → Hide | Same as M-06 |
| M-08 | Orb | Lock the screen | No orb on the lock screen; back after unlock |
| M-09 | Orb | Open a system permission dialog in another app | Orb hidden by the system, returns after |
| M-10 | Orb | Revoke "display over other apps" in system settings while running | Orb disappears, no crash; settings show "Permission needed" |
| M-11 | Panel | Tap the orb over another app | Panel over dimmed app, keyboard up, typing immediate |
| M-12 | Panel | Back, Back | Keyboard closes, then panel; previous app unchanged |
| M-13 | Panel | Notification → Open when the LAFINA process was killed | Panel opens (slower); works |
| M-14 | Loop | Offline: "add my networking exam this Friday at 9 AM" → Confirm → Done | Card with correct date and time; saved; back in the previous app |
| M-15 | Loop | Open LAFINA → Calendar | The event is there; its reminder is listed |
| M-16 | Loop | View in LAFINA | Main app opens at the item or its day |
| M-17 | Loop | Reminder and note requests | Same loop works |
| M-18 | Loop | Tap Confirm twice quickly | One item only |
| M-19 | Loop | Prepare a card, close the panel, reopen | Card still there |
| M-20 | Loop | Prepare a card, cold-start the main app, return, Confirm | "No longer current" message; nothing saved |
| M-21 | Online | Signed in, Online Mode on: ask a general question | Streaming reply |
| M-22 | Online | Turn on airplane mode mid-request | Clear message; text restored |
| M-23 | Reminders | Reminder due while the panel is open | Delivered once, by the normal background path |
| M-24 | Reminders | Reminder call rings while the orb is showing | Call screen takes over; orb not in the way |
| M-25 | Lifecycle | Open panel, open LAFINA from the launcher | No crash; one LAFINA screen; orb hidden |
| M-26 | Lifecycle | Split-screen: LAFINA in one half, try to open Quick Chat | No crash (panel refuses or closes) |
| M-27 | Lifecycle | Swipe LAFINA from recents with the orb on | Orb stays (stock Android); record OEM result |
| M-28 | Lifecycle | `adb shell am force-stop` | Orb gone; returns after opening LAFINA |
| M-29 | Lifecycle | Leave the orb idle overnight | Still present on stock Android; record OEM result |
| M-30 | Account | Sign out or switch user with the orb on | Orb stops unless the new user enabled it; no data from the previous user in the panel |
| M-31 | Layout | Landscape, 200% font, dark mode, modern palette | Readable, scrollable, nothing clipped |
| M-32 | Layout | Tablet or foldable, multi-window | Panel sized and positioned correctly |
| M-33 | Access | TalkBack: focus orb, open, move with actions, hide | All possible without dragging |
| M-34 | Access | TalkBack through the panel and card | Sensible order; replies and success announced |
| M-35 | Motion | System animations off | No orb or panel animation |
| M-36 | OEM | Xiaomi: tap orb before granting the background pop-up permission | Hint shown; notification Open works; record exact behaviour |
| M-37 | Go | Low-RAM device or emulator profile | "Not available on this device" |
| M-38 | Perf | Measurements of `04` §7 | Recorded numbers |
| M-39 | Voice (1.1) | Hold, speak, release; close panel while holding | Card as when typed; capture stops immediately |

## 5. Edge-case classification

| Edge case | Class | Handling |
| --- | --- | --- |
| Permission never granted or revoked | MVP | Status + explainer; service stops safely |
| Orb over LAFINA itself | MVP | Hidden |
| Rotation, display size change, fold | MVP | Position remap |
| Screen off, lock screen | MVP | Hidden |
| Process death with an open card | MVP | Card lost; clear message on next attempt; confirmed data safe |
| Double Confirm, double Send | MVP | Existing guards |
| Card expired, session ended, row changed elsewhere | MVP | Refusal messages |
| Reminder due while panel open | MVP | Poller gate |
| Main app opened while panel exists | MVP | Panel finishes; guard |
| No user, storage problem | MVP | "Open LAFINA" states |
| Account switch | MVP | Stop or re-apply; clear transcript |
| Offline, guest, online failure | MVP | Existing fallbacks |
| OEM blocks orb tap | MVP | Hint + notification fallback |
| Android Go / low RAM | MVP | Unsupported state |
| Multi-window with both LAFINA screens | MVP | Guard; verified in FLOAT-00 |
| Multi-action request in the panel | MVP (limited) | Supported if simple; otherwise "Open LAFINA" |
| OEM battery manager kills the service | Before production | Help text; measurements; no workaround that fights the system |
| Sticky restart after low-memory kill | Before production | Guarded restart; verify |
| Play Console declarations | Before production (only if publishing) | FGS declaration and video |
| Same request confirmed twice by the user (content duplicate) | Before production | Needs a product decision; not solved by this feature (R-17) |
| Cold-open delay | Before production | Placeholder sheet if measured slow |
| Orb covered by another app's keyboard | Nice to have | 1.1 |
| Full-screen video or games | Nice to have | 1.1 auto-fade |
| Restore after reboot | Nice to have | 1.1, owner decision |
| Multiple displays, desktop mode | Nice to have | Not designed |
| Work profile, secondary users | Unsupported (untested) | State as unsupported until tested |
| Showing above the lock screen | Unsupported | By design |
| Showing over apps that hide overlays | Unsupported | Platform rule |
| Reading or acting on other apps' content | Unsupported | By design |
| Surviving force-stop | Unsupported | Platform rule |

## 6. MVP acceptance criteria

1. The feature is off after install and after update; nothing is requested until the user turns it on.
2. The user sees an explanation before the system permission screen.
3. With permission, the orb appears outside LAFINA, can be moved, remembers its position, and can be hidden in one gesture.
4. A notification is visible whenever the orb is on, with Open and Hide.
5. Tapping the orb opens Quick Chat over the current app with the keyboard ready (or shows the hint and works from the notification where an OEM blocks it).
6. The example request works offline end to end and creates exactly one event with its reminder, only after Confirm.
7. Reminder and note requests complete the same loop.
8. The main app shows the new item without manual refresh.
9. Quick Chat never changes the Chat tab's history or its open card.
10. Offline, guest and failure states show clear messages; typed text is not lost.
11. No crash in any lifecycle case M-25 to M-30.
12. Reminder delivery is unchanged while Quick Chat is open.
13. TalkBack users can open, use and hide the feature.
14. No Accessibility Service, capture, usage-stats or microphone use is added by the MVP.
15. `npm run preflight` and the Kotlin unit tests pass, or every failure is shown to be pre-existing in the FLOAT-00 baseline.
16. Device results are recorded per device, with untested cells stated.

## 7. Reporting

Each phase report states for every test: run or not run, result, device, and the log or file that shows it. Performance numbers are reported only when measured.
