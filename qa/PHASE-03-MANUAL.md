# Phase 03 — physical Android reminder validation

**Evidence status:** JS preflight, native unit tests, native builds and API 37
emulator instrumentation passed; physical-device checks below are **NOT RUN**
until an identified reviewer records actual outcomes. Emulator/mock/SQL evidence
is separate. The
[Phase 03 report](../docs/reports/phase-03-report.md) owns final artifact hashes and
statuses; never install a stale Phase 02 APK just because its filename matches.

Use only synthetic academic titles. Record reviewer/date, device model, Android
version/API, RAM, ABI, app version/commit, APK SHA256 and relevant battery/channel
settings. Keep private serials, real schedules and raw notification dumps out of
the repository. No student voice recordings are needed in this phase.

## Install / open the reviewed build

Use the Phase 03 **dataQa** APK whose hash matches the phase report. It bundles JS
and exposes the synthetic QA tools without Metro. On a matching ARM64 phone:

```powershell
adb devices -l
Get-FileHash android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk -Algorithm SHA256
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

Substitute the selected serial locally for TEST_DEVICE; omit it from published
reports. Select the matching ABI APK; x86_64 is for the emulator, not ARM phones.
If the reviewed APK/hash is unavailable, record NOT RUN and request that artifact.
Do not uninstall, clear storage, overwrite old LAFINA, downgrade the database or
erase saved data to resolve a signing/migration error. A schema issue must show
recoverable unavailable state, with no reset.

For a rebuild, select JDK17/Android SDK and use the current root build instructions;
these commands are provided for reproduction and are not a claim they passed:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
.\android\gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDataQa :app:assembleDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' --no-daemon --console=plain
```

Turn on airplane mode and turn off Wi-Fi/mobile data yourself. Complete anonymous
offline onboarding if this is a fresh test install. Existing nickname/theme/items
must survive an upgrade. Open **Settings → Reminder delivery**. Delivery and
full-screen alerts default off; no microphone, telephony or network prompt should
appear. Native status is not proof that an alert was received.

## Short first check: actual alert in 15 seconds

1. In Settings, tap **Enable Android reminder delivery**. On Android 13+, use the
   notification-access control to grant permission. Open channel settings if
   needed: enable the Academic reminders channel, with high importance and an
   audible notification volume. Keep full-screen alerts off initially.
2. Tap **Create 15-second synthetic reminder**. Expect one synthetic TODO task
   saved locally, with a pending native job. This is QA data, not a real deadline.
3. Press Home, leave the app backgrounded, and wait. Expect an Android notification
   when timing/platform settings permit; sound/vibration follows channel/DND.
   Inexact fallback may arrive later than 15 seconds: record actual delay, do not
   convert the save/registration message into a delivery pass.
4. Tap the notification. Expect a native screen identifying a simulated reminder,
   with Answer, Snooze 10 minutes and Acknowledge/Dismiss. No phone call or mic
   capture occurs. Tap **Answer (acknowledge)** or **Acknowledge / Dismiss** within
   the 60-second response window.
5. Reopen Settings and refresh status. Expect reminder/job ACKNOWLEDGED and linked
   task **TODO**. Use **Cancel last synthetic reminder** or the data harness to
   remove QA items when finished. Repeat with a new synthetic reminder, cancel
   before due, and expect no alert for that cancelled generation.

Record scheduled UTC, observed notification time/lag, tapped action, resulting
reminder/job/task state, exact/inexact capability, channel settings and failure.
The response window is not a promise of continuous ringing or a forced full-screen
takeover. The app remains usable manually when delivery is off or blocked.

## Required device matrix

| Device/API | Required emphasis | Result / reviewer evidence |
|---|---|---|
| Physical Android 11 / API 30 | Offline startup, locked/unlocked background alarm, process death, reboot after unlock, modest-RAM behavior. | NOT RUN |
| Physical API 31+ | Exact-access allowed/denied/revoked, inexact warning and recovery after return to app. | NOT RUN |
| Physical API 33+ | Notification denied/granted/revoked, app/channel blocks, manual controls. | NOT RUN |
| Physical API 34+ | FSI OS access allowed/denied, in-app off/on, heads-up/normal fallback and lock-screen privacy. | NOT RUN |
| Additional OEM/low-RAM phone | Battery saver, default OEM restrictions, DND/volume, background persistence, fonts/TalkBack. | NOT RUN |

One phone may cover multiple rows, but record its actual API and which cases ran.
A current emulator does not pass the physical API 30 or OEM rows.

## Lifecycle, permission and identity checks

For each row below, create a fresh synthetic reminder or use **Open data test
harness** to schedule a clearly identified synthetic task/event at a suitable
future local time with lead 0. Confirm actual UTC/zone and avoid a quiet interval
unless that interval is the intended scenario.

| Action | Expected result / limit | Result |
|---|---|---|
| Receive unlocked, app foreground; repeat unlocked/background, then screen locked/background. | Same durable occurrence/actions. Android may choose banner/notification; FSI is optional. No arbitrary background Activity launch. | NOT RUN |
| Kill the background process without Force stop; distinguish Recent Apps swipe/OEM behavior in notes. | Eligible AlarmManager receiver can recover without React. One new ring attempt; no lost source data. | NOT RUN |
| Explicit Settings Force stop, wait past due, then reopen. | No delivery guarantee while stopped. Reopen reconciles; over 15 minutes late becomes MISSED. No claim that force-stop can be bypassed. | NOT RUN |
| Schedule a reminder several minutes ahead, reboot normally, unlock, leave app unopened. | Reconcile after credential storage unlock where Android permits; no before-unlock guarantee. Record whether and when delivered. | NOT RUN |
| Deny notifications, enable delivery and save a manual reminder; grant later and return. | Clear blocked/unavailable status; no fake delivered state; saved planner/manual controls remain available; reconcile rechecks current jobs. | NOT RUN |
| Disable Academic reminders channel or lower importance; use DND and mute volume separately. | Accurate capability/channel warning; user policy respected. No claim that an inaudible or hidden alert was received. | NOT RUN |
| Deny/revoke exact access on API 31+, then grant and return. | Explicit inexact fallback/delay warning or failed state; later reconcile updates eligible alarms. No crash/data loss. | NOT RUN |
| FSI in-app off; then on with OS access denied; then permitted. | Notification still opens same shell. OS may choose heads-up/full-screen only when eligible; denial never blocks manual planner. | NOT RUN |
| Create two reminders at the same time, with different titles/IDs. | Distinct notifications, actions and job states; handling one never changes the other. | NOT RUN |
| Edit time/source, cancel/delete or explicitly complete a source before due. | Old generation cannot ring/mutate the replacement. Old notifications/timeouts are cancelled during reconcile; other items persist. | NOT RUN |
| Snooze, then allow old response deadline to pass. | New generation/run time remains PENDING; old timeout cannot mark the snooze MISSED. Current UI uses 10 minutes. | NOT RUN |
| Tap ACK twice or race notification ACK with visible-screen action. | One durable terminal transition; task stays TODO/IN_PROGRESS. Explicit task completion remains a separate action. | NOT RUN |
| Leave a ring unanswered for 60 seconds; reopen a stale notification/screen. | Paired MISSED state; no continued response controls for an expired occurrence. Inexact background timeout may be delayed by OS, but stale action must not commit. | NOT RUN |
| Move clock forward/back during a ring; test a timezone-only change separately; restore automatic settings afterward. | TIME_SET closes current rings as MISSED, so clock rollback cannot extend response indefinitely. Timezone-only changes preserve current UTC instants/rings. Reconcile and fence stale identities. | NOT RUN |
| Configure quiet hours spanning midnight; use a different event timezone. | Saved global preference timezone governs quiet hours; defer to quiet end with newer generation, no immediate audible ring. | NOT RUN |
| Use DST-gap/fold quiet boundaries in a supported zone on synthetic data. | Gaps produce recoverable failed/unavailable policy, never silent time shifting; repeated start uses earlier/end later occurrence. | NOT RUN |
| Refresh repeatedly, navigate away/back, and disable delivery while ringing. | No duplicate attempt from refresh; disabled delivery removes platform effects, preserves local items and readable status. | NOT RUN |
| Light/dark/system theme, largest font, TalkBack, keyboard/navigation bars. | Readable native shell and Settings; named/reachable actions, no clipped controls, correct app preference and no focus trap. | NOT RUN |
| Many synthetic future/due items on a review dataset. |128 future-registration/256 due-pass limits and overflow maintenance; no identity collisions. Capture memory/time/failures; no assumed phone capacity. | NOT RUN |

Android's force-stop limitation is documented by
[Android 15 behavior changes](https://developer.android.com/about/versions/15/behavior-changes-all).
Notification/exact/FSI controls have separate grants; see
[Android alarms](https://developer.android.com/develop/background-work/services/alarms)
and [Android 14 FSI behavior](https://developer.android.com/about/versions/14/behavior-changes-14).

## Reproducible commands and evidence handling

Read non-sensitive device/build information locally:

```powershell
adb -s TEST_DEVICE shell getprop ro.product.model
adb -s TEST_DEVICE shell getprop ro.build.version.release
adb -s TEST_DEVICE shell getprop ro.build.version.sdk
adb -s TEST_DEVICE shell getprop ro.product.cpu.abi
adb -s TEST_DEVICE shell dumpsys package com.lafina.capstone
adb -s TEST_DEVICE shell dumpsys meminfo com.lafina.capstone
adb -s TEST_DEVICE shell dumpsys meminfo com.lafina.capstone:reminders
```

An explicit force-stop/reopen test (not the process-death test):

```powershell
adb -s TEST_DEVICE shell am force-stop com.lafina.capstone
# Reopen only when the scenario calls for recovery.
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

Run isolated native SQLite tests only against the debug/dataQa test artifact
produced by the current build. Confirm the runner first; do not substitute an
old test APK. For the dataQa artifacts, the normal variant command is:

```powershell
.\android\gradlew.bat -p android :app:connectedDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' --no-daemon --console=plain
```

These tests use constrained `lafina-phase03-test-*.sqlite` files and never create
or migrate the primary database. A test pass certifies its assertions on that
device/emulator only; it does not replace the alarm/permission cases above.

Use Settings diagnostics for bounded redacted event codes, capability and actual
domain state. If collecting Logcat/dumpsys alarms/notifications, inspect and redact
locally before saving evidence: other apps can expose private notifications.
One memory sample is not peak PSS; one enqueue/start command is not delivery
latency or cold-start median/p95. Record failures and NOT RUN cases honestly.

Finish by disabling test delivery if unwanted, cancelling/removing only synthetic
items, restoring any changed clock/DND/battery/connectivity settings and recording
all remaining checks. Human acceptance of Phase 03 does not authorize Phase 04.
