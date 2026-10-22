package com.lafina.capstone.reminders

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import org.json.JSONObject

object ReminderCapabilities {
  const val CHANNEL = "academic_reminders_v1"

  fun ensureChannel(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL) != null) return
    val channel = NotificationChannel(CHANNEL, "Academic reminders", NotificationManager.IMPORTANCE_HIGH)
    channel.description = "Time-sensitive reminders you enable for your academic plans"
    channel.enableVibration(true)
    channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
      AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).build())
    channel.lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
    manager.createNotificationChannel(channel)
  }

  fun notifications(context: Context): Boolean {
    val manager = context.getSystemService(NotificationManager::class.java)
    val granted = Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    return granted && manager.areNotificationsEnabled() &&
      (manager.getNotificationChannel(CHANNEL)?.importance ?: NotificationManager.IMPORTANCE_NONE) != NotificationManager.IMPORTANCE_NONE
  }

  fun exact(context: Context): Boolean = Build.VERSION.SDK_INT < 31 ||
    context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

  fun fullScreen(context: Context): Boolean = Build.VERSION.SDK_INT < 34 ||
    context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()

  fun json(context: Context, settings: NativeDeliverySettings): JSONObject {
    ensureChannel(context)
    val notifications = notifications(context)
    val exact = exact(context)
    val importance = context.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL).importance
    val reason = when {
      !settings.enabled -> "DELIVERY_DISABLED"
      !notifications -> "NOTIFICATIONS_BLOCKED"
      !exact -> "INEXACT_FALLBACK"
      else -> null
    }
    return JSONObject().put("sdk", Build.VERSION.SDK_INT).put("enabled", settings.enabled)
      .put("notifications", notifications).put("exact", exact).put("fullScreen", fullScreen(context))
      .put("fullScreenEnabled", settings.fullScreen).put("channelImportance", importance)
      .put("reason", reason ?: JSONObject.NULL)
  }
}
