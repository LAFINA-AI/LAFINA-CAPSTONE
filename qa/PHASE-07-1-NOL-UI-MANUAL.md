# Nol UI follow-up — manual Android checks

Expected build: **0.7.2-data-qa**, same `com.lafina.capstone` package. Keep existing
data: use `adb install -r`, never uninstall/clear data to fix an upgrade problem.
Schema3 is additive Notes storage; older apps may refuse it. The friend's
`lafina.db`/different package has no automatic import. Phase08 remains unapproved.

```powershell
$adb="$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
& $adb devices -l
& $adb -s emulator-5554 install -r android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk
& $adb -s emulator-5554 shell am start -W -n com.lafina.capstone/.MainActivity
# Use a physical ARM64 phone's serial and app-arm64-v8a-dataQa.apk for phone QA.
```

1. In Profile → Scheduling & Reminder Preferences, check your old nickname,
   timezone, lead, snooze, quiet hours and reply mode. They must remain after
   upgrade/reopen. Choose Light to compare with the owner's reference pictures;
   restore your preferred appearance afterward.
2. Compare the icon dock and central mic, Notes empty state, Profile header and
   Calendar Week/Month. Calendar date range/cards reflect your selected timezone
   and actual week-start setting, not the fixed dates in the reference photos.
   Profile totals must reflect saved records; Offline replaces untracked voice
   counts. Account/email/Pro, handbook answers and import/export are deferred.
3. Toggle24-Hour Time Format and Week Starts on Monday. Reopen Calendar and then
   restart the app: labels/week range must follow saved settings. Select a day,
   switch Month/Week, navigate dates and open a saved item from its timeline.
   Add/edit tasks/events through **+**; existing validation/manual entry remains.
4. In Notes, create `QA72 manual note`, save, search, pin, change Personal/
   Coursework, edit and save. Unsaved changes must warn on Back, a tab change or
   central mic. Keep editing retains text; Discard leaves the saved version.
   Confirm deletion of only your synthetic note; counts should update in Profile.
5. Type `Remind me to QA72 revision tomorrow at 7 PM` in Chat. Review exact
   date/time/timezone and Confirm. Correct it using
   `Move task "QA72 revision" to tomorrow at 8 PM`. Ambiguous Friday/later/mixed
   commands and bulk deletion must not silently mutate anything. Backgrounding
   invalidates pending reviews; confirmed data survives force-stop/reopen.
6. Central mic only opens the visible speech panel. On a physical phone with
   verified offline speech data/model, hold/release, review/edit transcript, Use
   draft in chat, Send, then Confirm. Permission denial/cancel/background must
   leave typing usable. The agent leaves emulator host microphone input OFF;
   enable host input deliberately only for your own emulator voice test.
7. Enable reminder delivery deliberately. Create a synthetic alert a few minutes
   away with lead0, background/lock the phone, and verify notification/eligible
   reminder screen. ACK must leave the task TODO. Complete separately; test
   Snooze without duplicate delivery. Restore original delivery settings.
8. If an installed offline TTS voice is available, choose Both, request help and
   Stop reading. Text must remain. Actual audibility, interruptions and real
   recognition require a human; mocked tests do not certify them.
9. Increase Android text size; check compact header, week cards, Notes editor,
   Profile switches, keyboard/composer and bottom controls on a narrow screen.
   Use TalkBack separately. Restore font/display settings and delete only QA
   fixtures; restore radios/theme/reply/delivery settings after airplane tests.

Physical ARM64/low-RAM/API30/31/OEM/reboot/Doze, real speech/accent/audio quality,
peak PSS/startup/battery remain HUMAN REQUIRED unless separately measured. Host
SQLite timings and API37 emulator screenshots do not certify these properties.
Use [existing measurement instructions](PHASE-07-MANUAL.md); record actual
phone/API/RAM/build hash and failures without publishing private schedules/audio.

Full outcomes: [Nol UI report](../docs/reports/phase-07-1-nol-ui-report.md).
