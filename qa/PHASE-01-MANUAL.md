# Phase 01 manual Android review

**Physical-device status: NOT RUN — owner testing required.**
Only the foundation is under review. Do not expect tasks, a working calendar,
chat commands, notifications, alarms, STT or TTS yet. Complete this checklist after
each install/update and send observed PASS/FAIL/NOT TESTED outcomes.

## Prepare

1. Use a dedicated test phone. Record manufacturer/model, Android/API, ABI and RAM
   tier, without serials/Android IDs. Prioritize available low-end devices; proposed
   2–3 GB and ~4 GB tiers are test targets, not guaranteed support.
2. Use the matching ABI **release-preview APK** from the Phase 01 report. It has
   bundled JS and needs no Metro/server. The app ID `com.lafina.capstone` differs
   from the old LAFINA app. Development signing is for testing only, not publication.
3. Install via USB/file transfer. If using adb, select the intended test phone:
   `adb install -r <matching-preview.apk>`. Do not install an x86_64 emulator APK on
   an ARM64 phone. API below 30 is outside this phase's configured support range.
4. Test fresh app storage without deleting real personal data. A first install is
   preferred; clear storage only for this dedicated test build if you understand
   that it erases its local settings. Never clear old LAFINA or another app's data.
5. Turn airplane mode ON and explicitly turn Wi-Fi/mobile data OFF before first
   launch. Close Metro; the release preview must launch independently.

## Verify the student flow

- [ ] Fresh launch opens a welcome/setup screen without email/password/account or
  network request. No microphone, notification or alarm permission prompt appears.
- [ ] Tap Set up my planner. Leave nickname empty; inspect autodetected timezone.
  Finish setup. Today greets Student and all four tabs are present.
- [ ] Force-close this test app, reopen while still offline: onboarding stays
  completed and saved preferences remain. Restart the phone and repeat.
- [ ] Open Settings, set a synthetic nickname, lead/snooze and a timezone such as
  Asia/Manila. Save; relaunch and inspect every value.
- [ ] Enter invalid timezone, 0-minute snooze, lead over120 or malformed quiet time.
  Save should show a clear error and retain entered values. Correct and retry.
- [ ] Enter unsaved changes, tap Discard unsaved changes: saved values return.
- [ ] Review onboarding → Keep current setup: no reset. Review onboarding → Reopen
  onboarding: welcome returns, existing preferences remain in the form, and a new
  completed setup survives relaunch.

## Appearance and controls

- [ ] Select Light, Dark and System, save each and relaunch. Preview and saved
  appearance should be readable; System follows Android appearance.
- [ ] Test the largest practical Android font/display size and 200% font scale,
  narrow/landscape display, keyboard open and all four tabs. Scroll to every field
  and action; no clipped labels, hidden Save/Back or unusable navigation.
- [ ] Use TalkBack if available. Check headings, persistent input labels, radio
  selection, switch state, tab selection and readable validation/save feedback.
  Report TalkBack NOT TESTED separately if unavailable.
- [ ] Android Back returns a non-Today tab to Today and closes retake confirmation
  first. At Today it follows normal Android app-back behavior.
- [ ] Calendar and Chat state that features are unavailable. They must not pretend
  to save a task, execute a command or capture audio.
- [ ] Voice/Both reply selection persists but produces no speech yet. Quiet hours
  persist but do not change Android Do Not Disturb. No background recording or
  reminder service should start.

## Evidence / defects

Record APK SHA-256 from the report, model/API/RAM, PASS/FAIL/NOT TESTED per item,
and synthetic reproduction steps. Crop/redact personal status/notification details
before sharing screenshots. Do not send a private DB, `.env`, personal agenda,
audio, credentials or unique device identifiers. Report crashes with the visible
error and privacy-reviewed logs only. A successful install or Jest run alone is
not evidence of physical-phone persistence or usability.

For a defect: `REWORK PHASE 01: <model/API, steps, expected, observed, sanitized evidence>`.
Do not approve Phase 02 until this phase's review outcome is clear.
