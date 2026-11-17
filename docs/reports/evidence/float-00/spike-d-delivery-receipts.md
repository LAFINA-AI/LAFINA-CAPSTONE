# FLOAT-00 Spike D — reminder delivery receipts

Device: Infinix X6880 (XOS), Android 15 / API 35, build `X6880-15.1.2.200(OPPJ001PF001PJ)`. App: `com.lafina.capstone.debug` (spike build, guest `local_guest_user`). Date 2026-11-17, phone time zone PST (UTC+8).

Rows read from `reminder_delivery_events` in a read-only copy of the debug app's `lafina.db` (copied with `adb exec-out run-as … cat`), newest last. Times are UTC; local = UTC+8.

| id | event | origin | occurred_at (UTC) | local | Context |
| --- | --- | --- | --- | --- | --- |
| 1 | registered | js | 05:13:13.646 | 13:13:13 | Reminder confirmed in the Chat tab ("remind me to float spike check at 1:17 pm") |
| 2 | registered | native | 05:13:12.709 | 13:13:12 | AlarmManager registration (`RTC_WAKEUP`, 13:17:00, `exactAllowReason=policy_permission`) |
| 3 | fired | native | 05:17:00.025 | 13:17:00 | Spike Quick Chat activity was the visible, resumed activity; main root mounted but stopped |
| 4 | posted | native | 05:17:00.038 | 13:17:00 | Full-screen call notification posted; shown as a heads-up over Quick Chat (screen on, unlocked) |
| 5 | **call_admitted** | **js** | **05:18:35.562** | **13:18:35** | **0.7 s after Quick Chat resumed (13:18:34.882). `AppState` went `active`, the hidden main root's handler restarted the poller and consumed the pending native call, and `presentCall` admitted it into the main screen that was not visible.** |

Supporting log lines: `spike-d-js-and-native-lifecycle.log` (13:18:34.882 `quick onResume` → 13:18:34.951 `[ReminderPoller] Poller started for user local_guest_user`).

Conclusion: risk R-03 is real on this device. FLOAT-03 must gate the poller start **and** `consumePendingNativeCall()` in `App.tsx`'s `AppState` handler while Quick Chat is the visible screen.
