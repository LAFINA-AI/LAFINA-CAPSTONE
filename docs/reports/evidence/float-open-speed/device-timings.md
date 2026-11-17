# Quick Chat open timings — Infinix X6880, Android 15, debug build (Metro)

Method: `adb shell input tap` on LAFINA's button window after pressing Home and waiting at least 3 s. Times come from LAFINA's own log lines: `LafinaFloating: Orb tapped` (native), the system's `Displayed …QuickChatActivity`, and temporary `[QCTIME]` lines in Quick Chat and `App.tsx`. Those lines were removed after measuring. All times are seconds after the tap. These are debug-build numbers and are not release measurements.

| Column | Meaning |
| --- | --- |
| window | system "Displayed" for QuickChatActivity |
| content | the Quick Chat root rendered the panel |
| anim | the panel's open animation started; the sheet becomes visible |
| keyboard | the keyboard was reported shown |

## Before the fix (2026-11-18, 02:10–02:15)

| Open | window | content | anim | keyboard |
| --- | --- | --- | --- | --- |
| first after restart | 0.19 | 0.80 | 1.31 | 1.44 |
| repeat | 0.17 | 0.71 | 0.92 | 1.07 |
| first after restart | 0.18 | 0.78 | 1.28 | 1.43 |
| repeat | 0.14 | 0.69 | 1.09 | 1.23 |
| repeat | 0.14 | 0.72 | 0.94 | 1.08 |

- Every slow open shows the main screen's "active" handlers starting at the tap. These were the data reload, reminder re-arm, permission read, sync and Home refresh. About 0.5–0.6 s of JS work followed before the Quick Chat root could render.
- One open right after a Metro reload took 3.08 s before the Quick Chat root even started (`Running "LafinaQuickChat"`).

## After the fix (02:21–02:23)

| Open | window | content | anim | keyboard | panel shown, held work runs |
| --- | --- | --- | --- | --- | --- |
| repeat | 0.15 | 0.08 | 0.32 | 0.48 | 0.49 |
| repeat | 0.15 | 0.09 | 0.34 | 0.52 | 0.52 |
| repeat | 0.20 | 0.08 | 0.38 | 0.56 | 0.56 |
| first after restart | 0.16 | 0.16 | 0.66 | 0.79 | 0.98 |

- The content time can be earlier than the window time because the system logs "Displayed" after the first frame is drawn.
- One more first open after a restart (02:21:53) logged content at 0.15 s, but its animation lines did not appear within the 6 s capture window. The cause is not known; a repeat with a 12 s window is the last row of the table.
