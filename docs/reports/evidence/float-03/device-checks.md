# Floating LAFINA device checks (FLOAT-03 to FLOAT-07) — Infinix X6880 (XOS, Android 15), serial 13195704C2004480

Dates: 2026-11-17 22:43 to 2026-11-18 00:20 (Asia/Manila).
App: `com.lafina.capstone.debug`, `app-arm64-v8a-debug.apk` built 2026-11-17 22:22 from this working tree; JS
from a Metro server started for this run on port 8082 (`adb reverse tcp:8081 tcp:8082`). The Metro already
running on 8081 did not answer bundle requests within 200 s and was left untouched. JS changes made during the
run reached the phone through Metro; no native code changed after the APK was built.

Only LAFINA's own state is recorded: its UI nodes (uiautomator dump filtered to the package; in the
notification shade only LAFINA's own notification row), its database copied with `run-as`, its alarms,
notifications, memory and threads, and log lines from its process or about its package. Screenshots were
cropped to the Quick Chat sheet or showed only LAFINA screens, kept in the session scratchpad and deleted;
none are in the repository. One uncropped screenshot that showed the home screen was deleted at once.

## Functional results

| Case | What was done | Observed | Result |
| --- | --- | --- | --- |
| M-11 | Orb tap from the launcher | `QuickChatActivity` top-resumed; `Running "LafinaQuickChat"`; orb removed while open; panel above the keyboard with the Offline chip, three chips, composer focused; Send disabled while empty | PASS |
| R-03 | Same, and every later panel open | No `[ReminderPoller] Poller started` while the panel was in front; the main root started its poller only when `MainActivity` resumed | PASS |
| M-12 | Back, Back | Back 1: keyboard hidden, panel stays; Back 2: launcher in front, orb shown again | PASS |
| M-13 | `kill -9` of the process (service restarted by Android with its notification), then Open in LAFINA's notification | Quick Chat resumed at once; `Running "LafinaQuickChat"` as root 1 in the new process; ready to type ~3 s after the tap (debug build, bundle from Metro); main root not started | PASS |
| M-14 | "add my networking exam this Friday at 9 AM" | Card "Create event “My networking exam”", Fri, Nov 20, 2026, 9:00–10:00 AM, reminder 15 min before, delivery choice, Edit/Cancel/Confirm inside the sheet | PASS |
| M-15 | Two Confirm taps 120 ms apart | One `events` row, one reminder (08:45 local), `sync_outbox` 3 → 5; `messages` and `chat_sessions` unchanged; success card; native exact alarm 2026-11-20 08:45 | PASS |
| M-16/M-17 | View in LAFINA | Quick Chat finished; main app on Schedule, 20 Nov, with the event's editor open | PASS |
| M-18 | Cancel on a reminder card | Nothing saved, card gone. **Found:** after closing and reopening the panel, the words did not come back. Fixed (words kept in `quickChatController`), regression test added, re-checked on the phone | PASS after fix |
| M-19 | Two scrim taps with a card; ✕; reopen | Panel and card stayed; ✕ closed; same card after reopening | PASS |
| M-20 | "mark float spike check as done" (low-risk, applied at once), Undo within 3 s | Task completed, Undo bar shown; Undo → "Undone. Marked “Float spike check” done was reversed."; `is_completed` back to 0 | PASS |
| M-23 | Reminder due 23:06 created in Quick Chat; panel left open | 23:06:00 one native call notification shown over the panel; no JS presentation while the panel was in front; 23:06:45 cancelled by the app (CALL-FIX 45 s cutoff) | PASS for the panel period |
| M-25 | Open LAFINA from the launcher while the panel is open | `MainActivity` in front, no `QuickChatActivity` left, no orb, no crash or assertion, main screen drawn normally | PASS |
| FLOAT-06 | Permission revoked (`appops … default`) | Service stopped; Profile row "Floating LAFINA, Permission needed"; sheet status "Permission needed: allow …" | PASS |
| FLOAT-06 | Switch on → explainer → Continue → XOS overlay list → Back without granting | Explainer copy as `03` §10.3; after return (second read) "Off." + "Permission not granted. Floating LAFINA stays off. …" | PASS |
| FLOAT-06 | Same, granting while in the list | Sheet turned on by itself; orb shown after Home | PASS |
| FLOAT-06 | Revoked while on | **Found:** no direct way to fix, and returning without the grant left the switch on under a "stays off" message. Fixed: "Allow" button under "Permission needed" opens the explainer; returning without the grant turns the setting off. J-16 test added; re-checked on the phone | PASS after fix |
| FLOAT-06 | Reset position; help; turn off | Saved position cleared + one line; help with "Open app settings"; off → 0 service, 0 orb, 0 notification at once | PASS |

### Second ring after a timed-out call (outside this feature)

When the main app comes to the front after the native call notification timed out, its reminder poller triggers
the same reminder again and shows the in-app call. Clean control without Quick Chat (reminder from the Chat
tab, launcher in front): native ring 23:49:00, cancelled 23:49:45; LAFINA opened 23:50:48 →
`[ReminderPoller] Triggering reminder … Close the window` and the in-app call. Same behaviour after the M-23
case. Floating LAFINA does not cause it; it belongs to the CALL-FIX timeout/retry hand-over and is reported to
the owner. Fixed afterwards with the owner's permission; see `docs/reports/call-fix-followup-2026-11-18.md` (phone re-check NOT RUN).

## FLOAT-07 measurements (debug build; upper bounds, not release numbers)

| Item | Method | Result | Target (`04` §7) |
| --- | --- | --- | --- |
| Tap to panel, warm | `LafinaFloating: Orb tapped` → `ActivityTaskManager: Displayed …QuickChatActivity`, 5 runs | 169, 152, 158, 145, 140 ms (median 152 ms). First frame of the panel window; the 180 ms open animation follows | ≤ 500 ms median |
| Tap to panel, cold process | M-13 | Panel window at once; ready to type ~3 s (debug bundle from Metro) | ≤ 2.5 s (release) — not measured on a release build |
| Orb after leaving LAFINA | `wm_pause_activity` of `MainActivity` → `Orb shown`, 5 runs | 306, 301, 285, 290, 305 ms (median 301 ms), of which 200 ms is the deliberate `SHOW_DELAY_MS` | ≤ 300 ms — borderline |
| Added memory, service + orb | `dumpsys meminfo` with orb vs. service stopped | Graphics 6,792 → 10,444–10,708 KB (+3.6–3.9 MB); total PSS 397.7 MB vs 396.7–398.9 MB (difference within noise) | ≤ 5 MB |
| Whole process kept by the service (R-07) | Same | ~398 MB total PSS (debug build, React runtime loaded) | measure only |
| Idle CPU, orb shown on the launcher | Per-thread `/proc/<pid>/task/*/stat` over 60 s | 31 ticks (310 ms): OkHttp/Okio and the `localhost:8081` Metro connection (debug only), connectivity thread, main thread 60 ms. No thread or timer from this feature identified | no periodic work |
| Alarms / wake locks | `dumpsys alarm`, `dumpsys power` | Only the reminder alarm (2026-11-20 08:45); no repeating alarm; no wake lock held by LAFINA (only the system's short wake lock while posting the notification at start) | none from the feature |
| 8-hour battery | — | NOT RUN | < 1 % / 24 h |

## Lifecycle and accessibility

| Case | Observed | Result |
| --- | --- | --- |
| `am send-trim-memory <pid> RUNNING_CRITICAL` | Service, orb, notification kept; same process | PASS |
| `cmd deviceidle force-idle` (then `unforce`) | Service, orb, notification kept | PASS |
| `am force-stop` | Service, orb, notification gone (Android's rule); reopening LAFINA and Home brings them back | PASS |
| Process kill (`kill -9`) | Sticky restart in a new process with the notification; orb shown | PASS |
| Crash buffer | 0 LAFINA entries during the run | PASS |
| 200 % font scale | Panel fits; chips wrap; composer and buttons usable. **Found:** header title clipped ("Chat" cut off). Fixed (`minHeight` header); re-checked. Font scale restored to 1.0 | PASS after fix |
| Animations off (all three scales 0) | Panel opens with content; scales restored to 1.0 | PASS |
| TalkBack | NOT RUN (turning TalkBack on changes how the whole phone is operated; owner action) | — |

## Not run

M-21/M-22 (online streaming, airplane mode mid-request: the debug app's account is the offline guest), M-24
(account switch: no second account on this install; covered by J-16), M-26 (split screen on the Android 17
emulator: the x86_64 debug build fails at `:app:configureCMakeDebug[x86_64]` in this environment with no
error text, see `docs/reports/evidence/float-07/gradle-*-x86_64*.log`; no C++ or CMake file was changed by
this feature), blocked-launch hint (this phone never blocked a launch), themes other than the default,
TalkBack, 8-hour battery, release-build timings and memory.

## Phone state at the end

`svc power stayon usb` set again for the run (`stay_on_while_plugged_in` was 0); set back to 0 at the end.
Font scale and animation scales restored to 1.0. Debug app: overlay `allow`, Floating LAFINA on for
`local_guest_user`. Test data in the debug app only. The owner's `com.lafina.capstone` and `.performance`
apps were not touched.
