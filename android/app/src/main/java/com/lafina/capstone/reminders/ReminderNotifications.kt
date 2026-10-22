package com.lafina.capstone.reminders

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import com.lafina.capstone.R
import java.time.Instant

object ReminderNotifications {
  private fun tag(context: Context, identity: ReminderIdentity) = ReminderIdentityKey.value(context.packageName, identity, ReminderIntents.OPEN)

  fun cancel(context: Context, identity: ReminderIdentity) {
    context.getSystemService(NotificationManager::class.java).cancel(tag(context, identity), 0)
  }

  fun visible(context: Context, identity: ReminderIdentity): Boolean =
    context.getSystemService(NotificationManager::class.java).activeNotifications.any { it.tag == tag(context, identity) }

  fun post(context: Context, record: ReminderRecord, settings: NativeDeliverySettings) {
    val remaining = record.ringingDeadline?.let { Instant.parse(it).toEpochMilli() - System.currentTimeMillis() } ?: 0
    if (remaining <= 0) return
    val content = ReminderIntents.pending(context, record.identity, ReminderIntents.OPEN)
    val publicVersion = Notification.Builder(context, ReminderCapabilities.CHANNEL)
      .setSmallIcon(R.drawable.ic_reminder).setContentTitle("LAFINA academic reminder")
      .setContentText("Open to view your reminder").build()
    val builder = Notification.Builder(context, ReminderCapabilities.CHANNEL)
      .setSmallIcon(R.drawable.ic_reminder)
      .setContentTitle(record.title).setContentText("Academic reminder · tap to open")
      .setCategory(Notification.CATEGORY_REMINDER).setVisibility(Notification.VISIBILITY_PRIVATE)
      .setPublicVersion(publicVersion).setContentIntent(content).setAutoCancel(false)
      .setTimeoutAfter(remaining).setOnlyAlertOnce(true)
      .addAction(Notification.Action.Builder(null, "Acknowledge", ReminderIntents.pending(context, record.identity, ReminderIntents.ACK)).build())
      .addAction(Notification.Action.Builder(null, "Snooze 10m", ReminderIntents.pending(context, record.identity, ReminderIntents.SNOOZE)).build())
    // Full-screen eligibility alone is insufficient: the student explicitly opts in.
    if (settings.fullScreen && ReminderCapabilities.fullScreen(context) &&
      context.getSystemService(NotificationManager::class.java).getNotificationChannel(ReminderCapabilities.CHANNEL).importance >= NotificationManager.IMPORTANCE_HIGH) {
      builder.setFullScreenIntent(content, true)
    }
    context.getSystemService(NotificationManager::class.java).notify(tag(context, record.identity), 0, builder.build())
  }
}
