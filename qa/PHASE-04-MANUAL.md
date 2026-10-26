# Phase 04 — manual offline academic planner validation

**Evidence rule:** the [Phase 04 report](../docs/reports/phase-04-report.md) owns
actual build hashes, executed automation/emulator checks and results. The cases
below remain **NOT RUN / HUMAN REQUIRED** until a reviewer records outcomes on
the named physical phone. A passing emulator is not physical-device acceptance.
The owner's approval to proceed with Phase 04 did not certify earlier phone QA.

Use synthetic titles such as “QA exam”, never real student schedules. Record
reviewer/date, phone model/API/RAM/ABI, app version, APK SHA256, timezone,
notification/exact/full-screen settings and battery restrictions. Keep serials,
account identifiers and real notification/private database dumps out of the repo.

## 1. Install and open the reviewed build

Use **0.4.0-data-qa**, versionCode **4**, with the exact hash in the Phase 04 report.
This build bundles JavaScript and works without Metro. Choose ARM64 for a matching
phone; x86_64 is for the matching emulator. Reusing a filename does not prove an
APK is the latest artifact.

```powershell
adb devices -l
Get-FileHash android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk -Algorithm SHA256
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

Replace TEST_DEVICE locally; do not publish a private serial. `install -r` upgrades
and preserves data. Do not uninstall, clear app data, downgrade or replace a live
database to fix a signing/storage error. Use a separate disposable installation
for first-run onboarding. Existing settings/tasks/events must survive an upgrade;
schema remains **2**, with no Phase 04 migration or cloud import.

Reproduction commands, not a claim that they ran on your phone:

```powershell
npm run preflight
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
.\android\gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' --max-workers=2 --no-daemon --console=plain
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/androidTest/dataQa/app-dataQa-androidTest.apk
adb -s TEST_DEVICE shell am instrument -w com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner
```

For instrumentation, install the matching main dataQa APK first. Tests use isolated
synthetic files; they do not replace the end-to-end phone cases below. ARMv7 is
experimental and excluded by default; no 32-bit support is certified here.

Enable airplane mode; explicitly turn Wi-Fi and mobile data off. Complete anonymous
onboarding only if needed. Use the intended timezone in Settings before creating
items. No account, internet, microphone, speech engine or model is needed.

## 2. Core manual planning and navigation

| Action | Expected result | Physical result |
|---|---|---|
| Open Today, then Calendar. | Student agenda with Add task/Add event and Agenda/Tasks choices. A delivery warning is honest when Android access is off. No account/cloud requirement. | NOT RUN |
| In Agenda, use Previous week / Today / Next week and select a weekday. Open Go to another date; enter a valid date and tap Go to date. Repeat with Choose agenda date and cancel the Android dialog. | Selected day/date and agenda agree; cancellation keeps the prior date. This phase provides a week/day agenda, not a month grid. | NOT RUN |
| Enter an impossible agenda date such as `2026-02-31`. | Readable validation error, previous valid day retained, no crash or invented date. | NOT RUN |
| Add task → title “QA reading”, Due: No due date → Save task. Open Tasks → Active and inspect it. | Saved task TODO; No due date; no reminder. Undated task is intentionally absent from the day agenda. | NOT RUN |
| Add task → title “QA date-only assignment”, Due: Date only; select tomorrow → Save task. Jump to tomorrow's agenda. | One date-only task on that calendar day, with no invented midnight alarm. Changing display timezone does not shift its declared date. | NOT RUN |
| Add a timed task “QA exam” several minutes ahead in the chosen timezone; Remind me on, lead 0 → Save task. | Durable local item; due date/time and timezone shown; reminder state visible separately. A saved/registered message is not proof of notification receipt. | NOT RUN |
| Add event “QA consultation” with start/end date and time, with Remind me off. | Event appears in its day agenda even without any reminder. End must be after start. An event crossing midnight appears on each overlapping selected day. | NOT RUN |
| Display options → Clock display (this view): 12 hour, then 24 hour. Open a timed item/form. | Same instant displayed in the chosen format; typed entry remains `HH:mm` in 24-hour form. Android time picker follows the choice. The choice belongs to this mounted view and is not a saved preference. | NOT RUN |
| If more than 20 tasks/day entries exist in a synthetic review dataset, use Next/Previous page and task Active/Completed/All filters. | Later records remain reachable; cancelled/deleted sources are excluded. No silent 500-row QA snapshot cutoff in product lists. Refresh after changes. | NOT RUN |

## 3. Forms, weekly classes and validation

1. Add event “QA weekly class”. Choose a future start day/time and end after start
   (weekly duration at most 24 hours). Enable **Repeat weekly**, include the
   starting weekday and one other weekday, and set **Repeat until** about two weeks
   later. Save. Navigate each selected day through the inclusive end date.
   Expect occurrences only on selected weekdays, with correct local times and
   no drift. Count expected dates from the actual inclusive endpoints; do not
   assume every two-week input always yields exactly four occurrences.
2. Edit the class. Expect an explicit whole-series warning. Change a future time
   or reminder lead and save; inspect later days. Delete only after **Confirm
   delete** and verify the entire series disappears. Individual-occurrence edit
   and exception rules are not offered in this phase.
3. Try empty title, impossible date, `25:00`, end before start, lead outside
   0–120, no weekly weekdays, a starting weekday omitted, or a series over 366
   calendar days. Expect an error with entered values retained and no Saved
   message/new item. A timed task or event in the past requires **Save past
   schedule** confirmation; it may alert immediately within delivery grace.
4. On synthetic data use `America/New_York`: spring gap `2027-03-14 02:30` must
   fail; fall fold `2027-11-07 01:30` must require an earlier/later choice. The
   selected start fold also applies throughout a weekly series. Do not change
   the real phone clock to construct these scheduling cases.
5. Open each **Choose …** date/time button; confirm and cancel dialogs. Type the
   same values manually. If a picker is unavailable, expect a readable error and
   usable manual fields. Missing-module/failure injection is covered by automated
   tests; do not damage the installation to force it. Check keyboard, scrolling,
   Save/Cancel visibility, largest font and TalkBack focus on a physical phone.
6. Enter a draft; press Android Back. Choose Keep editing, then repeat and discard.
   Repeat by tapping Settings/another bottom tab. Expect explicit confirmation
   before losing changed inputs; no prompt is needed for an unchanged form.
   Cancel editing also protects a changed draft. Editing Settings has its own
   keep/discard protection.

Storage-open/read/save fault injection remains an automated/disposable-test case.
If an actual failure occurs, expect retry/error text and retained draft, not false
Saved. A later refresh failure must not label an already committed write as failed.
Do not corrupt a real database or fill a phone's storage to manufacture a fault.

## 4. Actual offline alert → snooze → resume → explicit completion

1. Open **Settings → Reminder delivery**. Tap **Enable Android reminder delivery**.
   On API 33+, tap **Request notification access** and grant it. Check **Open exact
   alarm settings** on API 31+; enable the Academic reminders channel with suitable
   importance, volume and vibration. Keep full-screen alerts off initially. Avoid
   quiet hours for this first test. Return to the planner and verify the warning
   matches the actual settings.
2. Create a fresh timed task “QA alarm” several minutes ahead, lead 0. Leave its
   details open, note academic due time and next alert time, then press Home.
   Expect an actual Android notification when platform settings permit. Record
   scheduled UTC/observed time, settings and result. Inexact/Doze/OEM scheduling
   may delay it; do not count registration as delivery.
3. Tap the notification within its response window. Expect **SIMULATED REMINDER ·
   NOT A PHONE CALL**, with no microphone or speech session. Tap **Snooze 10
   minutes**. Return to the still-open planner details: expect SNOOZED and a new
   next alert time, with task still TODO/IN_PROGRESS and academic due time unchanged.
   The native shell's action is ten minutes; the in-app detail snooze uses the
   saved snooze preference. Neither changes event end time or the academic deadline.
4. Wait for the snoozed notification and **Answer (acknowledge)** or
   **Acknowledge / Dismiss**. Expect ACKNOWLEDGED, not COMPLETED. Repeat with a fresh
   reminder and in-app **Acknowledge alert …**; leave another unanswered past the
   60-second response deadline. Expired actions must not invent ACK; refresh/resume
   shows MISSED (OS background timeout execution can be delayed).
5. Tap **Mark task complete** explicitly. Expect COMPLETED and cancellation of
   outstanding reminders. **Undo completion** reopens the task; it must not replay
   already ACKNOWLEDGED/MISSED occurrences. Reopening an unhandled cancelled
   occurrence can rearm its original alert, including an immediate recent-overdue
   alert; it does not restore the cancelled snooze time. Inspect the latest state
   and use a genuinely future schedule if another alert is needed. Start task changes
   TODO to IN_PROGRESS independently of alert acknowledgement.
6. Create a separate future alert. Use **Cancel alert …** while pending; expect a
   cancelled alert with source item retained and no later notification. For another
   future item, edit its time, or delete it with confirmation; the old generation
   must not ring or mutate the replacement. Keep other items unaffected.

## 5. Lifecycle and permission matrix

| Case | Expected result / remaining limit | Physical result |
|---|---|---|
| Notification denied/revoked, channel blocked, delivery off, exact denied. | Manual forms/CRUD work offline. Visible blocked/inexact warning; no delivery guarantee or false received state. Grant access, return/refresh and inspect current jobs. | NOT RUN |
| Foreground/background/unlocked/locked receive, FSI off; optional FSI on with OS access denied then allowed. | Notification fallback; same native actions. FSI needs opt-in/access/channel and remains Android-controlled. Secure PIN is not bypassed; opted-in titles can appear on lockscreen. | NOT RUN |
| Two distinct items due together, handle only one. | Separate identities/states; one ACK/snooze/cancel never changes the other. | NOT RUN |
| Reopen after ordinary process death/Recent Apps swipe. | Saved tasks/events/outcomes remain; native delivery is independent of React. OEM swipe behavior must be recorded. | NOT RUN |
| Schedule several minutes ahead, reboot/unlock normally, leave app unopened. | Native recovery after credential storage becomes available where permitted. Record actual delivery/lag; no before-unlock guarantee. | NOT RUN |
| Android Settings Force stop, wait past due, then reopen offline. | No promise while stopped. On reopen reconcile upcoming/recent jobs; over-15-minute overdue jobs become MISSED. Data remains saved. | NOT RUN |
| Quiet hours, time/timezone changes, DND/battery saver and OEM restrictions. | Preserve UTC schedule semantics; expose delivery limits. Follow the more detailed [Phase 03 lifecycle matrix](PHASE-03-MANUAL.md) and restore any changed system settings. | NOT RUN |
| API 30 ARM64; API 31+ exact access; API 33+ notification access; API 34+ FSI. | Record each actual OS path; newer emulator success does not certify Android 11 or a physical phone. | NOT RUN |
| Modest-RAM/OEM phone with a synthetic semester dataset. | Capture rendering/query/alarm failures and memory observations, rather than assuming a minimum supported RAM tier. | NOT RUN |

## 6. Performance, cleanup and acceptance record

Matched legacy/new release-like measurements, cold-start median/p95, true peak
PSS, battery use and low-end capacity remain **NOT RUN** until performed on the
same phone under the [Phase 00 protocol](../docs/benchmarks/phase-00-baseline.md).
Host query timings and a single emulator PSS snapshot are separate evidence.
No TTS/STT/model benchmark is part of Phase 04.

For a non-destructive memory/start observation after selecting the device:

```powershell
adb -s TEST_DEVICE shell dumpsys meminfo com.lafina.capstone
adb -s TEST_DEVICE shell dumpsys meminfo com.lafina.capstone:reminders
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

The last command alone is not a controlled cold-start benchmark. Do not label one
memory read as peak. Record failures and test conditions with each observation.

Remove only the synthetic items you created, verify no active test alerts remain,
restore original connectivity/clock/battery settings and return delivery/FSI to
the chosen handoff state. Preserve the user's real preferences and schedules.
Record each case PASS/FAIL/NOT RUN with expected/actual behavior and reproduction.
Unfinished phone rows keep the phase **AWAITING DEVICE VALIDATION**; do not start
Phase 05 without explicit human approval.
