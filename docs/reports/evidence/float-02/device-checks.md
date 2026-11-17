# FLOAT-02 device checks — Infinix X6880 (XOS, Android 15), serial 13195704C2004480

App: `com.lafina.capstone.debug`, arm64-v8a debug build of the working tree, JS from Metro.
Only LAFINA-specific state is recorded here (window attributes, service records, the app's own
preferences file and log tag `LafinaFloating`). Nothing from other apps' screens or notifications
is kept. Screenshots were cropped to the orb area and not added to the repository.

## Commands used

- Overlay grant/revoke: `adb shell appops set com.lafina.capstone.debug SYSTEM_ALERT_WINDOW default|allow|deny`
- Orb window: `adb shell dumpsys window windows | grep -A40 "Window{.*LAFINA orb"`
- Service: `adb shell dumpsys activity services com.lafina.capstone.debug`
- Service state (added in this phase, state only): `adb shell dumpsys activity service com.lafina.capstone.debug/com.lafina.capstone.LafinaFloatingAssistantService`
- Preferences: `adb shell run-as com.lafina.capstone.debug cat shared_prefs/lafina_floating_assistant.xml`
- Gestures: `adb shell input swipe|tap`; rotation via `settings put system accelerometer_rotation 0` / `user_rotation 1`, then restored to the owner's values (1 / 0).

## Results

| Case | What was done | Observed |
| --- | --- | --- |
| M-01 | Overlay op reset to `default`; Profile → Floating LAFINA → switch | Explainer "One Android permission" shown; nothing turned on; `openOverlaySettings` not called until "Open Android settings" |
| M-01 | "Open Android settings" | XOS opened the system "Display Over Other Apps" **list** (`Settings$OverlaySettingsActivity`), not LAFINA's own page |
| M-02 | Back without granting | Switch still off, status "Off.", no service. No separate short message (the explainer stays open) — FLOAT-06 copy |
| M-03 grant | Explainer → Android settings; grant done with `appops set … allow` (not by tapping the list, which also shows the owner's other LAFINA installs); Back | Sheet turned on by itself on return: "On. The button appears when you leave LAFINA." Service `isForeground=true foregroundId=7410 types=0x40000000` (specialUse), notification channel `lafina_floating_v1`, 2 actions |
| M-03 | In LAFINA | 0 orb windows |
| M-03 | Home | Orb window present ~333 ms after the Home key in one observation (adb polling, includes adb latency; not a measurement). `(882,823) 176x176 ty=APPLICATION_OVERLAY fl=NOT_FOCUSABLE LAYOUT_NO_LIMITS`; right edge = 1080 − 22 − 176 |
| Look | Cropped screenshot | 56 dp red disc, white ring, white "L"; idle fade applied after 5 s |
| M-04 | Drag to the left half | Snapped to `x=22` (left margin); prefs `orb_edge=LEFT orb_fraction=0.6407573` |
| M-04 | Landscape, then portrait | Landscape `(121,597)` (left cutout inset + margin, same fraction); portrait back to exactly `(22,1407)` |
| M-05 | Calculator: tapped 7, 8, +, 8 around the orb, then on the orb over the 7 key | Display `78+8`; the tap on the orb typed nothing and logged `Orb tapped` |
| M-05 | Web search field with the orb shown; `input text floattest` | IME shown, text in the other app's field, `mCurrentFocus` = the other app's window |
| M-06 | Drag the orb onto the Hide target | 0 LAFINA windows, 0 service records, 0 notifications; `hidden_until_app_open=true` |
| M-06 | Open LAFINA, then Home | Flag cleared on open; orb back at the saved `(22,1407)` (position kept across a service restart) |
| M-07 | Notification → expand → Hide | 0 orb, 0 service, 0 notifications; `hidden_until_app_open=true` |
| M-08 (build 1, broadcast receiver) | Power off, wake, unlock | Orb removed on screen off but **never re-added**. `dumpsys activity broadcasts history`: SCREEN_ON to this app's receiver `SKIPPED … reason: Hiber/broadcast restricted queue.uid=10426`; SCREEN_OFF delivered ~0.9 s late; no USER_PRESENT delivery to this app |
| M-08 (final build, DisplayManager listener) | Power off; wake to the lock screen | Log: `Orb removed` (screen usable: false) on off; `Orb shown` on wake; on the keyguard the window has `isVisible=false isOnScreen=false` (the keyguard hides it). While dozing (AOD) the window may stay attached; the keyguard covers it |
| M-08 return after unlock | The owner unlocked the phone (14:3x, final build) | Orb window `isOnScreen=true isVisible=true` on the home screen right after the unlock. The owner then tapped the orb 5 times (`Orb tapped` ×5; a tap does nothing until FLOAT-03) and hid it (`Stopping`, `hidden_until_app_open=true`) |
| M-10 (build 2) | `appops … deny` while running | AppOps watcher did not fire; service kept running with `canDrawOverlays=false` |
| M-10 (final build) | `appops … deny` while running | Service gone within 2 s, notification gone, no orb window, process alive, no crash (crash buffer has no LAFINA entry) |
| Sticky restart | `run-as … kill -9 <pid>` while running (on the lock screen) | ActivityManager: "Scheduling restart of crashed service … in 1000ms"; new process; service `isForeground=true types=0x40000000`; `orbAttached=true`; notification back; no crash |
| M-09 (equivalent) | Orb shown; `am start -a android.settings.action.MANAGE_OVERLAY_PERMISSION` (a system screen that hides app overlays); Back | Over Settings: window attached, `isVisible=false isOnScreen=false`; after Back: `isVisible=true isOnScreen=true`. A runtime-permission dialog of another app was not triggered (it would change another app's state) |
| Start path | Normal enable | ActivityManager: `Background started FGS: Allowed … uidState: TOP … code:PROC_STATE_TOP` — started from the visible app, no exemption needed |

## Leftovers on the phone (debug app only)

- For the rest of the unattended run, `svc power stayon usb` was set (`stay_on_while_plugged_in` 0 → 2) so the secure lock does not engage during tests. It is set back to 0 at the end of the run.

- `com.lafina.capstone.debug` holds the overlay op `allow` and has Floating LAFINA enabled for `local_guest_user`.
- An old `spike_orb` notification channel from FLOAT-00 remains in the debug app's settings (no notifications are posted on it). `pm clear` was not used because the earlier attempt was refused by the session's safety check.
- The owner's `com.lafina.capstone` and `com.lafina.capstone.performance` apps were not touched.
