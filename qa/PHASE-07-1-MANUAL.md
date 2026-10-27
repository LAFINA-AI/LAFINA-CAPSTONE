# Phase 07.1 — manual integration checks

Phase08 is not approved. Agent/emulator evidence does not certify a physical
phone, spoken recognition, sound quality, OEM restrictions or low-RAM operation.
Use synthetic titles only; do not publish personal schedules or voice recordings.

This checklist describes the original **0.7.1-data-qa / schema2** integration
cohort. It is not an instruction to downgrade a later installation. For the
current shell/schema3 use [the Nol UI checklist](PHASE-07-1-NOL-UI-MANUAL.md);
the subsequent **0.7.3-data-qa** audit-hardening candidate is covered by the
[hardening checklist](PHASE-07-HARDENING-MANUAL.md) and
[hardening report](../docs/reports/phase-07-audit-hardening-report.md).

## Install / preserve data

Both our bundled QA/release-preview app and the friend's incoming Nol build at
`9c183a20eca2377b5e54f219c5f83460b18af81b` declare the **same Android package**,
`com.lafina.capstone`. Our debug variant uses `com.lafina.capstone.debug`.
The original integrated app uses `lafina-capstone.sqlite` schema2; the Nol UI
follow-up adds schema3. Incoming Nol uses a different database file,
`lafina.db`, schema17. There is **no automatic import** between those stores.

Both source configurations use development/debug signing, but actual signing
compatibility is **UNKNOWN** until the installed build's certificate and the
candidate APK's certificate are compared. Do not assume they match or differ.
A matching package name alone proves neither signing nor database compatibility.
If this device runs Nol or its installation lineage is unknown, stop before
installation and request an explicit data-preservation/migration plan. Even a
signature-compatible replacement can leave Nol data unavailable in this UI.

Use `install -r` only for a known prior capstone installation with compatible
signing and a supported forward schema upgrade. If installation fails, retain
the original installation and record the error. **Do not uninstall, clear data,
force a downgrade, overwrite/import a database or change signing as a workaround.**
No backup/import/export workflow is implemented by this phase.

```powershell
$adb = "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
& $adb devices -l
# Only after the package, signing and capstone-lineage checks above:
# Existing x86_64 emulator, candidate APK matching its report's cohort/hash:
& $adb -s emulator-5554 install -r android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk
& $adb -s emulator-5554 shell am start -W -n com.lafina.capstone/.MainActivity
# For a dedicated ARM64 phone use its serial and app-arm64-v8a-dataQa.apk instead.
```

Historical expected version for this checklist: `0.7.1-data-qa`. Do not install
that older build over schema3. Supply only installation metadata if compatibility
needs investigation; never publish student databases, schedules or signing keys.

## Concrete checks

1. Enable airplane mode; turn Wi-Fi/mobile data off. Reopen the app. Existing
   preferences and your prior planner items should remain. There is no account,
   login, cloud connection or subscription requirement.
2. Open **Calendar** → **Month**. Check the month, today's marker and selected day
   against the timezone in Settings. Tap a date; the matching day agenda should
   appear below. Test Previous/Next month, year rollover and Today. Select **Day**
   to use the existing week strip. Month cells do not claim event counts.
3. Add task `QA071 manual`, date-only tomorrow, no reminder. Verify exactly one
   item on that date. Edit it to the next date; confirm the original day no longer
   lists it. Change Android font size to Large, repeat Calendar/form navigation,
   and restore the original size. Narrow screens may scroll the grid horizontally;
   dates/buttons must remain usable and the last form controls must remain visible.
4. Open Chat. Send `Remind me to QA071 voice tomorrow at 7 PM`. Verify exact date,
   19:00, timezone and reminder lead in the review. **Nothing saves before Confirm
   change**. Confirm, then move it with
   `Move task "QA071 voice" to tomorrow at 8 PM`, reviewing the new time first.
5. Send `do not acknowledge`, `Okay but remind me later`, a bare Friday command,
   and `delete all tasks`. Expect clarification/refusal with no mutation review.
   Create a review, press Home, return: that pending action must be invalidated.
6. Enter an unsaved preference or planner edit, then use the rounded tabs or
   Android Back. Expect Keep editing / Discard rather than silent loss. Check
   Light, Dark and System appearance; restore your original preference.
7. Set reminder delivery/permissions on deliberately. Create a synthetic reminder
   due in a few minutes, lead0. Background/lock the phone. Expect an eligible
   reminder screen or notification. ACK means received; the task must stay TODO.
   Complete the task separately. Test Snooze and confirm one new due occurrence,
   not duplicate alarms. Restore your original delivery setting afterward.
8. For actual voice, use a physical phone with verified offline speech data/model.
   Hold/release in Chat, review/edit the transcript, **Use draft in chat**, Send,
   then Confirm. Raw/interim speech must not create or complete anything. Test
   cancellation/backgrounding and microphone denial; typing remains usable.
   Emulator host microphone remains disabled after agent testing; enabling host
   input for your own test is a deliberate separate action.
9. If an offline TTS voice is installed, choose Both, request help, then Stop
   reading reply. Written text must remain. Check interruption and unavailable
   voice fallback. Restore Text/original output after the test.
10. Force-stop/reopen and reboot offline; confirmed records should persist, and
    pending chat reviews/history should not execute or return. Android force-stop
    prevents immediate alarm delivery until the app is opened again. Delete only
    your synthetic fixtures through individually confirmed controls; restore
    radios, theme, output, font size and delivery options.

## Tests still needing a human / physical phone

Real spoken accuracy, accents/mixed language, audible TTS/ringtone, interrupted
audio/calls, reboot/Doze/OEM delivery, API30/31 behavior, ARM64/low-RAM peak PSS,
startup and battery remain NOT RUN unless explicitly recorded in a later cohort.
Use the same handset/workload/build conditions and the existing
[Phase07 measurement commands](PHASE-07-MANUAL.md). Do not infer speed or speech
quality from host parser timings or an x86_64 emulator.

Full integrated automated/emulator outcomes belong in
[the Phase07.1 report](../docs/reports/phase-07-1-report.md). Record phone model,
Android version, RAM, build hash, actions/results and failures without personal
schedule/audio content. The exposed backend credentials must be revoked/rotated;
none are needed for these offline checks.
