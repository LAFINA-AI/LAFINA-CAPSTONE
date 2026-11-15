# Alarm feature plan

**Status:** implemented on `Lem-branch` (owner: "proceed fix all", 2026-11-15, with the recommended defaults for all four decisions). Device validation is NOT RUN. See `docs/reports/alarms-and-tabs-report-2026-11-15.md` and ADR-034. Deviations are listed at the end of this file.
**Date:** 2026-11-15
**Depends on:** fixing audit finding B1 (recurring reminders after a miss) first, since both change the reminder scheduling code.

## 1. Why a separate alarm

LAFINA has no real alarm today. "Set an alarm for 6am" becomes a **reminder titled "Alarm"** (`fastPathParser.ts:2831`). The reminder pipeline was built for a different job, so it fails as an alarm:

| Need | Today's reminder path | Problem |
|---|---|---|
| Ring when the phone is on silent or vibrate | The ringtone uses `USAGE_NOTIFICATION_RINGTONE` (`LafinaReminderModule.kt:784`) | **It is silent on silent or vibrate.** A wake-up alarm must use `USAGE_ALARM`. |
| Exact time even in Doze | `setExactAndAllowWhileIdle` (`:441`) | Can be deferred by several minutes in Doze, and the OS doesn't show it as an alarm. `setAlarmClock` is exempt and shows the alarm icon. |
| Keep ringing until dismissed | A full-screen insistent notification | No foreground service owns the audio. OEMs can kill the sound, and the reminder service is typed `microphone`, not media playback. |
| Repeat on chosen days | `[RRULE]` inside the description, next occurrence created by JS only on acknowledge | Native code can't write `lafina.db` (ADR-016). A repeating alarm must continue **without the JS app running**, and B1 shows the JS chain breaks. |
| Simple dismiss and snooze | A simulated call screen | An alarm should not open a call, should not need the microphone, and should work offline and in guest mode. |

## 2. Decisions to make (owner)

These choices change what gets built. The recommended option comes first.

1. **Sync:** keep alarms **local-only on the device** (recommended), or sync them as an eighth entity?
   - Device alarms are usually per device; a phone and a tablet ringing together is unwanted.
   - Syncing would need a backend change, since `/v1/sync/batch` supports only 7 entity types. AGENTS.md lists those 7.
2. **Morning briefing:** after dismissing a wake-up alarm, LAFINA can optionally read today's schedule with `react-native-tts` (offline). Should this be included, off by default?
3. **Existing "Alarm" reminders:** convert them to real alarms on upgrade (recommended, with a one-time note to the student), or leave them as reminders?
4. **Alarm sound:** use the device's default alarm tone only (recommended for the first version), or bundle LAFINA tones? Bundled audio needs a licence check.

## 3. Design

### 3.1 Data (JS, SQLite)

Migration 27 adds a local-only `alarms` table. It is not added to `sync_outbox`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `generateId('alarm')` |
| `user_id` | TEXT | owner (guest or account); alarms follow the account-bound reset (ADR-025) |
| `hour`, `minute` | INTEGER | local wall-clock time |
| `repeat_days` | INTEGER | bitmask, Mon=1 … Sun=64; 0 = one-shot |
| `one_shot_date` | TEXT NULL | `YYYY-MM-DD` for a one-shot alarm |
| `label` | TEXT | ≤ 60 chars |
| `enabled` | INTEGER | 0/1 |
| `snooze_minutes` | INTEGER | 1..30, default 9 |
| `vibrate` | INTEGER | 0/1 |
| `sound_uri` | TEXT NULL | null = default alarm tone |
| `briefing` | INTEGER | 0/1 (decision 2) |
| `created_at`, `updated_at` | TEXT | ISO |

### 3.2 Native (Kotlin)

- **`LafinaAlarmModule`** (new React Native module):
  - `upsert(alarm)`, `remove(id)`, `setEnabled(id, on)`, `listScheduled()`, `canScheduleExact()`, `openExactAlarmSettings()`, `openFullScreenSettings()`.
- **`LafinaAlarmRegistry`** (SharedPreferences, separate from the reminder registry):
  - holds the full alarm definition and a generation number;
  - native owns this copy so it can compute the next occurrence without JS (ADR-016 stays intact: native never writes `lafina.db`).
- **`AlarmSchedule`** (pure Kotlin, JVM-testable):
  - `nextTrigger(definition, now, zone)` handles repeat days, one-shot, DST gaps (a 2:30 alarm on a spring-forward day rings at 3:30, shifted by the gap; see deviations) and repeated hours;
  - no Android types, like `LafinaDeliveryContract`.
- **Scheduling:** `AlarmManager.setAlarmClock(AlarmClockInfo(trigger, showIntent), firePendingIntent)`. It is exact in Doze, and the system shows the alarm icon and the next alarm time.
- **`AlarmFireReceiver`:**
  - starts `LafinaAlarmService` (foreground, `foregroundServiceType="mediaPlayback"`, or `systemExempted` if allowed for alarm apps on the target SDK; to be confirmed in A1);
  - then **immediately schedules the next occurrence** for a repeating alarm, so a crash during ringing never ends the series.
- **`LafinaAlarmService`:**
  - plays the tone with `AudioAttributes.USAGE_ALARM`, looped, with a gentle volume ramp;
  - vibrates with a pattern; holds a partial wake lock while ringing;
  - stops automatically after 10 minutes and records a "missed" event for JS to read later;
  - posts a full-screen notification on a new `lafina_alarm` channel (`IMPORTANCE_HIGH`, category `CATEGORY_ALARM`).
- **`AlarmRingingActivity`:**
  - shows over the lock screen (`setShowWhenLocked`, `setTurnScreenOn`), with the time, label, **Dismiss** and **Snooze N min**;
  - both actions are handled natively (they stop the service, and snooze schedules a one-shot `setAlarmClock`), so they work even if the JS app is dead.
- **Restore:** extend the boot handling (or add `AlarmBootReceiver`) for `BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`, `TIME_SET`, `TIMEZONE_CHANGED`, and `ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`. It recomputes every enabled alarm from the registry.
- **JS ↔ native consistency:** on app start, JS calls `reconcile(alarmsFromDb)`, the same pattern as reminders. Native events such as fired, dismissed, snoozed and auto-stopped are queued in SharedPreferences and drained by JS into history.

### 3.3 Permissions and Play policy

| Item | Status | Plan |
|---|---|---|
| `USE_EXACT_ALARM` | Already declared | Play allows it only when alarms or calendar are a **core function**. LAFINA as a planner with alarms qualifies, but the Play declaration form must say so. Keep `SCHEDULE_EXACT_ALARM` as the fallback. |
| `USE_FULL_SCREEN_INTENT` | Already declared | On Android 14+, Play grants it only to calling and alarm apps. Check `NotificationManager.canUseFullScreenIntent()`; if false, fall back to a heads-up notification and show a settings prompt. |
| `POST_NOTIFICATIONS` | Already declared | Ask when the first alarm is created, not at app start. |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (or `_SYSTEM_EXEMPTED`) | **New** | Add to the manifest with the service type. |
| Battery optimisation (Xiaomi, Oppo, Vivo, Samsung) | — | Show a one-time guidance card after the first alarm, with a "Test alarm in 1 minute" button. |

### 3.4 UI (follows the LAFINA design tokens)

- **Alarms screen** at **Schedule → Alarms**, a `Calendar | Alarms` switch at the top of the Schedule tab (see `docs/plans/tab-redesign-plan.md`). Shortcuts: a **Next alarm** widget on Home, alarm health in Profile.
  - List rows show the time, label, repeat summary ("Weekdays") and an enable toggle.
  - An add button, and swipe to delete.
- **Alarm editor:** time picker, repeat-day chips, label, snooze length, vibrate, sound, morning briefing.
- **Status line:** "Next alarm in 7 h 12 min", with a warning badge when exact-alarm or full-screen permission is missing.
- **Ringing screen:** the native `AlarmRingingActivity` above. It is not `IncomingCallScreen`, because an alarm is not a call and must never open the microphone.

### 3.5 NLU and agent

- **New intents:** `create_alarm`, `update_alarm`, `delete_alarm`, `toggle_alarm`, `list_alarms`.
  - Fast path: "set an alarm for 6", "wake me up at 5:30 on weekdays", "turn off my 6am alarm", "gisingin mo ako ng 6 bukas", "alarm ko 5:30 tuwing weekdays". The existing bare-hour-means-morning rule is kept.
  - SmolLM2 and the DeepSeek extraction schema gain the same intents.
- **Review cards:** every alarm change goes through `prepareReviewedCommand` / `confirmReviewedCommand`, like other planner changes. Deleting an alarm needs the student's own words, as with the other planner items.
- **Agent tools:**
  - `prepare_lafina_action` gains the actions `create_alarm` and `toggle_alarm` with `time` and a `repeat` field; there is no delete through the model's fields (ADR-033);
  - `read_lafina_data` gains kind `alarms`;
  - the tool contract is regenerated, and the backend contract PR is followed by ElevenLabs re-provisioning.
- **Migration of "Alarm" reminders** (decision 3): on upgrade, pending reminders titled "Alarm" or "Wake up" become one-shot alarms in one transaction. The reminder is marked as replaced through the normal outbox path, so other devices see the change.

## 4. Phases and gates

Each phase ends with `npm run preflight`, `gradlew assembleDebug` plus the JVM tests, a phase report, and a manual checklist. Then it stops for approval.

| Phase | Content | Automated gate | Device gate (human) |
|---|---|---|---|
| **A0** | Fix audit B1. Owner answers the decisions in §2. | Jest for the miss and overdue paths | — |
| **A1 Native core** | `AlarmSchedule`, registry, `setAlarmClock`, fire receiver, service with `USAGE_ALARM`, ringing activity, native dismiss/snooze, restore receivers; debug "ring in 1 min" | JVM tests for `nextTrigger` (repeat days, DST, timezone change, one-shot in the past) | Rings on silent/vibrate, locked screen, Doze (`adb shell dumpsys deviceidle force-idle`), after reboot, after timezone change |
| **A2 Data + UI** (after tab phase T1) | Migration 27, `alarmsStore`, reconcile, Schedule → Alarms screen, editor, Home "Next alarm" widget, Profile alarm-health row, permission prompts, battery guidance | Jest: store, migration, reconcile; architecture check | Create, edit, toggle and delete in the UI; the system shows the next alarm |
| **A3 Language + agent** | Intents, fast-path English and Taglish rules, review cards, the agent's `create_alarm`/`toggle_alarm`, `read_lafina_data` alarms, contract, eval cases (≥ 15 alarm cases) | Jest, eval report JSON, backend contract test | Chat: "wake me up at 6 on weekdays"; Call Lafina after re-provisioning |
| **A4 Migration + briefing** | Convert old "Alarm" reminders; optional morning briefing with `react-native-tts` | Jest: migration idempotence; briefing builds offline text | Upgrade an install that has an "Alarm" reminder; briefing speaks offline |

## 5. Risks

- **OEM killers** can still stop the service on some brands. Mitigations: `setAlarmClock` (the most protected API), the guidance card and the test button. Test at least one Xiaomi or Oppo-family device if available.
- **Play review** may question `USE_EXACT_ALARM` or full-screen intent. The fallbacks (`SCHEDULE_EXACT_ALARM`, heads-up notification) keep the alarm working, though less reliably.
- **Two schedulers** (reminders and alarms) share boot and time-change broadcasts. Each owns its own registry to avoid fencing conflicts, and A1 tests run both together.
- **Scope:** alarms are a scheduling feature for students, and do not touch forbidden scope (no wake word, no always-on microphone, no business features).

## 6. Not in scope for the first version

- Smart wake-up or sleep tracking.
- Alarm challenges (maths or shake to dismiss).
- Wear OS.
- Syncing alarms across devices, unless chosen in decision 1.

## Implementation deviations (2026-11-15)

1. **DST gap:** a 2:30 alarm on a spring-forward day rings at 3:30 (java.time shifts by the gap length), not 3:00.
2. **Home card:** a fixed "Next alarm" card above the widgets, not a customizable widget.
3. **SmolLM2 unchanged:** alarm intents return before the title cleaner runs, so no prompt change was needed.
4. **No conversion note yet:** old "Alarm" reminders are converted (and their companion "Alarm" to-do removed), but the one-time note to the student is not shown yet.
5. **Briefing from the notification:** Android 10+ cannot open an activity from a notification action, so the briefing plays only if LAFINA is opened within 10 minutes of that Dismiss.
6. **Sound picker deferred:** `sound_uri` exists; the UI always uses the default alarm tone.
