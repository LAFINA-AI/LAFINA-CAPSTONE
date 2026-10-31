package com.lafina.capstone.reminders

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri

/** Identity lives in Intent.data, never a lossy hash or extras-only PendingIntent. */
object ReminderIntents {
  const val DUE = "due"
  const val TIMEOUT = "timeout"
  const val OPEN = "open"
  const val ACK = "ack"
  const val SNOOZE = "snooze"
  const val MAINTENANCE = "maintenance"

  fun key(packageName: String, identity: ReminderIdentity, kind: String): String =
    ReminderIdentityKey.value(packageName, identity, kind)

  fun intent(context: Context, identity: ReminderIdentity, kind: String): Intent =
    Intent(context, if (kind == OPEN) ReminderActivity::class.java else ReminderReceiver::class.java)
      .setAction("${context.packageName}.reminder.$kind")
      .setData(Uri.parse(key(context.packageName, identity, kind)))
      .apply {
        // If Chat was opened above a reminder, NEW_TASK alone can bring that
        // task forward with Chat still on top. Reopen the actual reminder and
        // let onNewIntent retire old reviews without extending its deadline.
        if (kind == OPEN) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }

  fun identity(context: Context, intent: Intent): ReminderIdentity? {
    val data = intent.data ?: return null
    val paths = data.pathSegments
    if (data.scheme != "lafina-reminder" || data.authority != context.packageName || paths.size != 4) return null
    val generation = paths[3].toIntOrNull() ?: return null
    if (generation < 1 || paths[1].isBlank() || paths[2].isBlank() || paths[1].length > 1024 || paths[2].length > 1024) return null
    if (paths[0] !in setOf(DUE, TIMEOUT, OPEN, ACK, SNOOZE)) return null
    return try {
      ReminderIdentity(paths[1], paths[2], generation).also(ReminderPolicy::validateIdentity)
    } catch (_: IllegalArgumentException) { null }
  }

  fun kind(intent: Intent): String? = intent.data?.pathSegments?.firstOrNull()

  fun pending(context: Context, identity: ReminderIdentity, kind: String): PendingIntent =
    if (kind == OPEN) PendingIntent.getActivity(context, 0, intent(context, identity, kind), flags)
    else PendingIntent.getBroadcast(context, 0, intent(context, identity, kind), flags)

  fun maintenance(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context, 0, Intent(context, ReminderReceiver::class.java)
      .setAction("${context.packageName}.reminder.$MAINTENANCE")
      .setData(Uri.parse("lafina-reminder://${context.packageName}/$MAINTENANCE")), flags,
  )

  private val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
}
