# ADR-034 — Device-local alarms, rung natively

**Status:** accepted (owner: "proceed fix all", 2026-11-15, with the recommended defaults in `docs/plans/alarm-feature-plan.md` §2)
**Date:** 2026-11-15
**Scope:** alarm plan phases A1–A4
**Review owner:** human developer

## Context / problem

Students asked LAFINA to "wake me up at 6", and it made a reminder titled "Alarm". A reminder:
- rings as a simulated call;
- can be snoozed only a few times and is then marked missed;
- has an adaptive lead time;
- lives in the to-do list.

None of that is an alarm clock. It also does not ring reliably on silent, in Doze, or when the JS app is dead.

## Decision

1. **Alarms are their own entity, not reminders.**
   - Schema 27 adds the `alarms` table: hour, minute, repeat days as a Mon=1…Sun=64 bitmask, one-shot date, label, snooze length, vibrate, briefing, and a `generation`.
   - **Alarms are device-local** (owner decision 1). They are not one of the seven sync entities, have no outbox rows, and are removed by Clear All Data.
2. **Native owns ringing (ADR-016 kept: native never writes `lafina.db`).**
   - JS hands Android a copy of the active owner's alarms (`LafinaAlarm.reconcile`), and none when signed out.
   - Native keeps its own registry in SharedPreferences, books each alarm with `AlarmManager.setAlarmClock`, and falls back to `setAndAllowWhileIdle` without exact-alarm access.
   - The fire receiver books the next occurrence of a repeating alarm before ringing, so a crash during ringing never ends the series.
   - A foreground `mediaPlayback` service plays the default alarm tone with `USAGE_ALARM`: it is looped, ramps up over 30 s, vibrates, and stops after 10 minutes.
   - A native full-screen `AlarmRingingActivity` shows over the lock screen. Dismiss and Snooze work with the JS app dead.
   - Native queues what happened (fired, dismissed, snoozed, timed out, one-shot done). JS drains the queue and records it.
3. **Generation fencing.** Every JS change bumps `generation`. Native ignores a booking or event from an older generation, and a review card that names an alarm is refused as stale if the alarm changed after the card was shown.
4. **An alarm is not a call.** The ringing screen never opens the microphone and is separate from `IncomingCallScreen`.
5. **Language and agent (A3).**
   - New intents: `create_alarm`, `update_alarm`, `delete_alarm`, `toggle_alarm` (all reviewed) and `list_alarms` (read-only, answered locally).
   - The deterministic fast path is authoritative for them. Online extraction is skipped when it recognises an alarm. DeepSeek may add only `create_alarm` for phrasings the parser missed, and repeat days then come from the student's own words.
   - The agent may describe `create_alarm` and `toggle_alarm` in `prepare_lafina_action` fields, and can read `alarms`. **It can never delete an alarm** (ADR-033).
   - SmolLM2 is unchanged: it only cleans titles for task, time-block and reminder creation, and alarm intents return before it runs.
6. **Old "Alarm" reminders are converted** (owner decision 3, A4).
   - At start-up, each pending "Alarm" or "Wake up" reminder still due becomes an alarm, in one transaction with the removal of the reminder and of its linked companion "Alarm" to-do (exact source link, same title, not done), through the sync outbox.
   - The conversion is idempotent: `source_reminder_id` prevents a second alarm.
7. **Morning briefing** (owner decision 2: off by default, per alarm).
   - Dismiss on the ringing screen opens LAFINA, asking to unlock if needed.
   - JS reads the queued Dismiss and speaks today's schedule with `react-native-tts` (offline, local data only), if the app opens within 10 minutes of Dismiss.
   - Dismiss from the notification cannot open an activity on Android 10+, so there the briefing plays when the student opens LAFINA within the same window.
8. **Permissions.**
   - `FOREGROUND_SERVICE_MEDIA_PLAYBACK` is added and allow-listed in `scripts/check-architecture.mjs`.
   - Existing: `USE_EXACT_ALARM`, `SCHEDULE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `POST_NOTIFICATIONS`.
   - Schedule → Alarms and Profile → Alarm & Reminder Health show what could stop an alarm, with fixes, OEM battery guidance and "Test alarm in 1 minute".

## Consequences

- Alarms ring without the JS app, but **only a real phone proves it**: silent mode, Doze, reboot, timezone change and OEM battery savers. All of this is NOT RUN until the device checklist is done.
- **Play policy.** `USE_EXACT_ALARM` and `USE_FULL_SCREEN_INTENT` are granted on Play only to apps whose core function is alarms or calendar. The Play declaration must say so.
- **One alarm list per phone.** A student who signs in on a second phone does not see their alarms there.
- **Sound.** The tone is always the system default alarm sound. A sound picker is deferred: `sound_uri` exists but the UI does not set it.
