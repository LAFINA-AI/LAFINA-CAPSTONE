package com.lafina.capstone.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    ReminderRuntime.worker.execute {
      try { ReminderRuntime.handle(context.applicationContext, intent) }
      catch (_: Exception) { android.util.Log.e("CapstoneReminders", "REMINDER_BROADCAST_FAILED") }
      finally { pending.finish() }
    }
  }
}

/** Credential-protected planner data is reconciled after unlock; no direct-boot DB copy. */
class ReminderRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action !in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED,
        Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_USER_UNLOCKED,
        android.app.AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED)) return
    val pending = goAsync()
    ReminderRuntime.worker.execute {
      try {
        ReminderRuntime.withStore(context.applicationContext) { store ->
          // A changed wall clock cannot safely extend an already visible response
          // window. End that alert; future absolute-UTC jobs are reconciled below.
          if (intent.action == Intent.ACTION_TIME_CHANGED) {
            store.listCurrent().filter { it.status == "RINGING" }.forEach { record ->
              store.action(record.identity, ReminderAction.MISS,
                nowUtc = ReminderPolicy.format(java.time.Instant.now()))
              ReminderRuntime.cancelIdentity(context.applicationContext, record.identity)
            }
          }
          // AlarmManager registrations do not survive reboot/update; force an idempotent rebuild.
          if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            store.registrations().forEach { store.removeRegistration(it.identity.jobId) }
          }
        }
        ReminderRuntime.reconcile(context.applicationContext, forceRestore = intent.action == Intent.ACTION_TIME_CHANGED)
      } catch (_: Exception) { android.util.Log.e("CapstoneReminders", "REMINDER_RESTORE_FAILED") }
      finally { pending.finish() }
    }
  }
}
