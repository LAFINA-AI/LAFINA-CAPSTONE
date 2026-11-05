package com.lafina.capstone

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

open class LafinaReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      LafinaReminderModule.ACTION_TRIGGER_REMINDER -> {
        LafinaReminderModule.handleTriggerIntent(context, intent)
      }
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED" -> {
        LafinaReminderModule.restoreScheduledAlarms(context)
      }
    }
  }
}
