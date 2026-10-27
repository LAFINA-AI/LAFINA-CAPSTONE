# Phase 07 / 07.1 hardening — manual Android checks

Candidate: **0.7.3-data-qa**, versionCode10, `com.lafina.capstone`, capstone
schema3. Phase08 is not authorized by this checklist.

## Install without losing data

The agent leaves the final candidate installed/open on the emulator when
verification succeeds. For another device, first establish the installed app's
lineage and signing compatibility. Nol uses the same package but a different
database/schema; matching package names or certificates do not establish a data
migration. Do not uninstall, clear data, replace a database or force a downgrade.

For a known previous capstone build with matching signing certificates:

```powershell
$adb='C:/Users/USER-PC/AppData/Local/Android/Sdk/platform-tools/adb.exe'
& $adb devices -l
# Substitute the actual emulator serial if different.
& $adb -s emulator-5554 install -r android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk
& $adb -s emulator-5554 shell am start -W -n com.lafina.capstone/.MainActivity
# On a known compatible physical ARM64 phone, substitute its serial and
# android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk.
```

Stop on an unknown lineage, signature error or missing data. Preserve the old
install and arrange a reviewed preservation/migration procedure. Signing checks
can use `apksigner verify --print-certs` on both available artifacts; do not
assume that different development machines necessarily have different keys.

## Actions and expected results

1. Open Profile and check your existing preferences. Open Calendar and Notes:
   existing saved items should remain. Reopen the app to check persistence.
2. Create a synthetic `QA73 manual note`. Before Save, read the disclosure:
   saved text and previous saved versions remain in private app storage even
   after removal. Save, reopen and edit the note without saving.
3. Tap **Remove note**. The dialog must explain that removal hides the note from
   Notes/Profile counts, retains saved text/history and discards unsaved changes.
   Cancel: the unsaved draft remains. Confirm Remove: the note leaves the list
   and count. This is **not permanent erasure** and there is no restore/purge UI.
   Use synthetic content only; do not assume your real private text is erased.
4. In Calendar, open the alert-status/details control. If delivery is disabled,
   guidance must point to **Profile → Reminder delivery**. The separate button
   for Android reminder settings should still open the operating-system screen.
   Timezone/default-lead guidance must point to Profile preferences, not an absent
   Settings tab. Keep genuine Android Settings guidance intact.
5. In Profile preferences choose Light, then Dark. Chat's enabled Send arrow must
   remain clearly visible on its colored button. Type/send in each mode. Static
   contrast tests do not replace TalkBack or your actual visual/device assessment.
6. Type `Add task QA73 manual task`. Send must present a review; only Confirm
   saves it. Query it, then use exact confirmed deletion to remove your fixture.
   Try `Okay but remind me later` and `delete all tasks`: neither may silently
   modify data or offer an unsafe bulk mutation.
7. Tap the central mic. It opens visible speech input without starting capture.
   Type a draft manually, Use draft in chat, then Send. A separate command review
   must appear; Discard saves nothing. Host microphone input is left OFF on the
   emulator. Live recognition requires deliberate human input and permission.
8. Edit a note/planner/preferences draft, then Back or change tabs. Keep editing
   preserves the draft; Discard leaves the saved state intact. Clock/week-start
   preferences should remain after reopen; restore your preferred values.
9. DataQa only: Profile → Planner test tools → Run isolated SQLite checks. Expect
   the native SQLite PASS message including migration, rollback, idempotency,
   ACK versus completion and Notes checks. It uses a separate synthetic QA DB;
   it does not establish alarm/audio delivery. The QA caption should now refer
   to Calendar's regular controls rather than claiming Calendar is unavailable.

## Physical-device checks still required

The emulator is API37 beta/x86_64, not low-RAM/API30/31/ARM64 acceptance. On a
known compatible physical phone, follow the existing
[Phase07 manual](PHASE-07-MANUAL.md) for airplane-mode STT/TTS, interruption and
reminder checks. Enable delivery deliberately, set a synthetic reminder with a
known lead, background/lock the device and verify notification/eligible reminder
UI. For a concrete check, temporarily set default lead0 in Profile → Scheduling
& Reminder Preferences, then send `Remind me to QA73 phone check in 2 minutes`
in Chat, review and Confirm. Restore your original lead/delivery settings after
testing and remove only that fixture. ACK must leave the task TODO; completion
is separate. Verify snooze without
duplicates, unavailable speech/permission fallback and Stop reading.

Actual voice accuracy/audibility, OEM/Doze/reboot/time-change behavior, TalkBack,
soft-keyboard combinations, startup/PSS/battery and low-end phones remain HUMAN
REQUIRED unless separately measured. This pass does not execute Phase08's full
voice loop or certify its release gate.

Remove only your named fixtures and restore theme/reply/delivery/radios/font/
display settings. Do not export real notes, schedules, nicknames or recordings.

Results: [hardening report](../docs/reports/phase-07-audit-hardening-report.md).
