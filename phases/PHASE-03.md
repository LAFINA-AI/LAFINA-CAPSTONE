# PHASE 03 — Durable Native Android Reminder Alarms & Lifecycle Recovery

> Read `AGENTS.md` first. Execute **only Phase 03** when approved.

## Objective

Migrate and verify `LAFINA`'s native Android reminder alarm engine (`LafinaReminderModule.kt`, `ReminderAlarmReceiver.kt`, `ReminderBootReceiver.kt`, `src/scheduler/reminderAlarm.ts`, `src/scheduler/reminderPoller.ts`, `src/scheduler/reminderRescheduler.ts`) integrated with `remindersStore` and `LAFINA-backend` reminder sync.

## Scope

1. **Native Android Alarm Module (`android/app/src/main/java/com/lafina/`)**
   - Migrate `LafinaReminderModule.kt`, `ReminderAlarmReceiver.kt`, `ReminderBootReceiver.kt` with exact alarm scheduling (`AlarmManager.setExactAndAllowWhileIdle`), full-screen intent / notification fallback, and boot/time-change broadcast handling.
2. **JS Reminder Scheduler & Reconciliation (`src/scheduler/`)**
   - Migrate `reminderAlarm.ts`, `reminderPoller.ts`, `reminderRescheduler.ts`, and `reconcileReminderAlarms` on startup, foreground resume, and cloud sync pull.
   - Ensure `acknowledged` updates reminder status without marking the underlying task completed.
3. **Verification**
   - Jest unit tests + Kotlin JUnit tests + `assembleDebug` verification.
