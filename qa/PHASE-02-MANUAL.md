# Phase 02 — manual offline data checks

Use synthetic titles only. Record model, Android/API, RAM, ABI and APK SHA256;
omit serials and personal schedules. Phase01 screenshots and owner acceptance are
recorded separately; they do not supply this device metadata or certify every check.

## Install / open

During agent testing the emulator disconnected. After the owner reopened it, the
agent restored its original connectivity and completed the task CRUD/ACK/restart
checks. For reference, the observed original settings were restored with:

```powershell
adb -s emulator-5554 shell cmd connectivity airplane-mode disable
adb -s emulator-5554 shell svc wifi enable
adb -s emulator-5554 shell svc data enable
```

No further connectivity recovery is pending. Use the offline conditions below for
your own QA. Final native SQL and task create/edit/ACK/restart/delete checks passed
on the emulator; event forms, native snooze UI, physical reboot and accessibility
remain manual checks. Emulator evidence does not certify a physical phone.

Use the **dataQa** APK, not release (which hides debug tools) and not Metro debug.
On a matching Android11+ ARM64 phone:

```powershell
adb devices -l
# Replace TEST_DEVICE with your selected device; never copy private serials into reports.
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

For x86_64 emulator use `app-x86_64-dataQa.apk`. To rebuild select JDK17 and SDK:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
.\android\gradlew.bat -p android :app:assembleDataQa :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' --no-daemon --console=plain
```

This development-signed build uses the same app ID as Phase01 preview; `install -r`
preserves its DB. Do not clear storage, uninstall, overwrite old LAFINA or downgrade
to Phase01. If signing differs, stop and request a matching build rather than
erasing data. Turn airplane mode on and Wi-Fi/mobile data off yourself before
testing; no Metro/server is needed. Confirm existing nickname/theme/timezone survive.

## Actions and expected results

1. Open **Settings → Open data test harness**. Expect “Phase 02 storage test tool”
   and an explicit no-alarm/audio notice. There must be no login or permission prompt.
   This is a long debug form: scroll to reveal controls fully before tapping;
   after selecting an Edit button in the saved list, scroll up to the editor.
2. Tap **Run isolated SQLite checks**. Expect PASS for migration replay/settings,
   rollback, create retry, ACK semantics, integrity/FKs. This uses a separate
   synthetic DB and must not change your setup or items. FAIL requires investigation.
3. Create **QA reading** with no due date, notes, and empty reminder lead. Scroll
   to **Create local item**. Expect one TODO record, version1, no reminder.
   Try an empty title or invalid `2026-02-31`: expect error and no saved item.
4. Select **Date only**, use a valid date, keep reminder lead empty. Save. Expect
   a calendar date without an invented UTC time. Adding a lead must fail until
   you choose **Timed** and give a valid local HH:mm and timezone.
5. Create **QA due check**, Timed, with the selected timezone's **current local
   minute**, lead **0**, status To do. Use the actual current date, not an old
   screenshot's date. Expect one SCHEDULED reminder and PENDING / UNAVAILABLE job.
6. Select its **Inspect reminder** button; tap **Simulate due**, then **ACK**.
   Expect reminder/job ACKNOWLEDGED, linked task **TODO**, no alarm/sound/call.
   A future simulation stays unchanged; more than15min late becomes MISSED.
   Duplicate ACK must not change the task or create another occurrence.
7. Edit that task to **In progress** and save: ACK must remain ACKNOWLEDGED.
   Select **Completed (explicit)** and save only when intentionally completing
   the task. That explicit control changes task status; ACK alone never does.
8. With another due-now synthetic reminder, simulate due, then snooze10. Expect
   SNOOZED/PENDING, a later run instant and newer generation, still UNAVAILABLE.
   Snooze0/fraction/>120 must fail without partial state. This does not schedule
   an Android alarm. Later native alarm reliability is not part of this phase.
9. Start a new Event **QA weekly class**, valid start/end in Asia/Manila, weekday
   matching start date (0Sun–6Sat), inclusive end two weeks later, lead15.
   Expect three distinct reminder/job occurrences if one selected weekday/week.
   Edit notes or extend end date: existing ACK/MISSED occurrences must not rearm.
   Duplicate weekdays or >366-day span must reject the whole save.
10. Try a New York DST nonexistent time (2027-03-14 02:30) and repeated time
    (2026-11-01 01:30). Gap must reject; fold must ask for Earlier/Later. Existing
    event timezone anchors must remain unchanged when device timezone changes.
11. Edit title/notes/time; save. Delete selected item → **Keep selected item** must
    retain it. Repeat → **Confirm delete selected item** hides it and records
    cancellations. Other items must remain. This is logical deletion; privacy
    purge controls remain a later phase. Do not mistake it for secure erasure.
12. Force-stop and reopen offline, then reboot the phone and open again. Inspect
    records, versions, ACK/task separation, snoozed run time and setup. All must
    persist. No delivery is expected while closed: Phase03 alarms are not present.
    Footer navigation and save/delete controls must remain reachable with keyboard,
    large fonts, dark/light themes and TalkBack. Report inaccessible controls.

To test app restart without data reset:

```powershell
adb -s TEST_DEVICE shell am force-stop com.lafina.capstone
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

Return per-item PASS/FAIL/NOT TESTED, model/API/RAM and sanitized screenshots.
Native SQL/Android API30/physical reboot/low-end performance/TalkBack tests remain
NOT RUN unless actually recorded. Do not send the student's DB, full logcat,
personal content, audio or unique device IDs. On failure send the short error,
synthetic steps, expected/observed result and build hash. No native alarm/STT/TTS,
battery or old/new speed comparison may be inferred from these storage checks.
