package com.lafina.capstone

import android.content.Context
import android.content.Intent

/**
 * Dedicated broadcast receiver for AlarmManager reminder triggers. It uses the
 * same identity claim as LafinaReminderReceiver, so a stale or duplicate
 * broadcast cannot post a call.
 */
class ReminderAlarmReceiver : LafinaReminderReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    LafinaReminderModule.handleTriggerIntent(context, intent)
  }
}
