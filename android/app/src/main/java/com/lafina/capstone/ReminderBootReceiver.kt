package com.lafina.capstone

import android.content.Context
import android.content.Intent

/**
 * Dedicated broadcast receiver for system boot, package replacement,
 * time changes, and exact alarm permission grants to reschedule alarms.
 */
class ReminderBootReceiver : LafinaReminderReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    LafinaReminderModule.restoreScheduledAlarms(context)
  }
}
