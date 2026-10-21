# Real-Device QA Checklist (Human-Executable)

> Agent: show this checklist at the end of relevant phase, but **do not mark it tested** unless user supplied actual results or the connected Android device was directly controlled and observed.

## Device metadata (non-identifying)

- Device brand/model: __________
- Android version / API level: __________
- RAM tier: __________
- App version/build commit: __________
- Locale/time zone: __________
- Network mode (Airplane/Wi-Fi/Cellular): __________
- Power saver and app battery optimization restrictions: __________
- Notification / FSI / exact alarm / microphone permissions: __________

## Offline first install and scheduling

- [ ] Install while network OFF; onboarding works, no sign-in required.
- [ ] Settings persist after app restart; optional name, timezone, theme, reply mode.
- [ ] Create task, event, and reminder manually while offline.
- [ ] Relaunch calendar and verify items persisted.
- [ ] Create reminder with due time 2–3 minutes ahead, lock screen, record actual alert time and display mode.
- [ ] Test permission denied and granted; app explains capabilities and fallbacks.
- [ ] Test app foreground vs background with another app visible.
- [ ] Snooze reminder, verify changed due time and no duplicate old alarm.
- [ ] Acknowledge reminder; ensure task is still pending unless explicitly completed.
- [ ] Edit/delete reminder shortly before due; no stale alert mutation.
- [ ] Trigger two reminders at same instant; keep IDs/outcomes distinct.
- [ ] Restart phone and inspect reconciliation; don't assume force-stop delivery.

## STT and TTS

- [ ] Switch airplane mode ON before hold-to-talk.
- [ ] Press and hold -> visible record -> speak -> release -> transcript appears.
- [ ] Deny mic -> respectful error and typed fallback; allow mic -> works.
- [ ] Say 'remind me to study tomorrow at 7 PM'; verify parsed schedule and actual saved due time.
- [ ] Say ambiguous date 'Friday' and conflicting 'Okay but remind me later'; no silent bad mutation.
- [ ] Turn TTS to voice/text/both; confirm corresponding output.
- [ ] Verify selected TTS voice is actually **offline** on phone, not just functional while connected.
- [ ] TTS responds promptly after warmup; compare cold/warm timings.
- [ ] Missing offline voice triggers text fallback and appropriate guidance.
- [ ] Interrupt audio with a real call/another media app; mic and speech stop/restore appropriately.

## Integrated reminder call

- [ ] OS shows legal call-style UI/heads-up/fallback; never uses real cellular dialer.
- [ ] Answer after screen locked -> reminder spoken and text visible.
- [ ] Respond via mic or tap fallback to acknowledge/snooze; durable state change.
- [ ] TTS and STT do not echo-trigger false acknowledgment.
- [ ] Ignore/cancel/timeout scenario follows documented retry/missed policy.
- [ ] No microphone recording persists after end call.

## Optional online (Phase 09+ only)

- [ ] Gemini only when explicitly online/consented; disconnect mid-call and app still allows local scheduling.
- [ ] USTP handbook answer shows true printed page/section/edition from approved corpus.
- [ ] Unsupported/unavailable handbook question is explicitly refused.
- [ ] No API key exposed in APK/network logs; backend usage limits validated.

## Result submission

Mark each item `PASS`, `FAIL`, `NOT TESTED` with screenshot/log (privacy-redacted) and any observed timestamps. Send defects to Codex as `REWORK PHASE XX: <device, steps, expected, actual, logs>`.
