package com.lafina.capstone

import android.content.Context
import android.content.Intent

/**
 * Dedicated broadcast receiver for AlarmManager reminder triggers.
 */
class ReminderAlarmReceiver : LafinaReminderReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val reminderId = intent.getStringExtra("reminderId") ?: return
    val task = intent.getStringExtra("task") ?: ""
    LafinaReminderModule.handleAlarmTrigger(context, reminderId, task)
  }
}
