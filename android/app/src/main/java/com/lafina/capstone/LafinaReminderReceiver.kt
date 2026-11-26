package com.lafina.capstone

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

open class LafinaReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      LafinaReminderModule.ACTION_CALL_DEADLINE -> LafinaReminderModule.handleCallDeadline(context, intent)
      LafinaReminderModule.ACTION_TRIGGER_REMINDER -> {
        LafinaReminderModule.handleTriggerIntent(context, intent)
      }
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED" -> {
        restoreAsync(context)
      }
    }
  }

  protected fun restoreAsync(context: Context) {
    val pending = goAsync()
    if (pending == null) {
      LafinaReminderModule.restoreScheduledAlarms(context)
      return
    }
    val appContext = context.applicationContext ?: context
    bootExecutor.execute {
      try {
        LafinaReminderModule.restoreScheduledAlarms(appContext)
      } catch (_: Exception) {
      } finally {
        pending.finish()
      }
    }
  }

  companion object {
    private val bootExecutor = java.util.concurrent.Executors.newSingleThreadExecutor { task ->
      Thread(task, "lafina-reminder-boot").apply { isDaemon = true }
    }
  }
}
