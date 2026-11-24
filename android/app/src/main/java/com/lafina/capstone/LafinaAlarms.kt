package com.lafina.capstone

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Alarm phase A1: books LAFINA alarms with AlarmManager.setAlarmClock, the
 * most protected exact-alarm API (exempt from Doze, shown as the system's
 * next alarm). Each alarm has two possible bookings: its next regular
 * occurrence and, after Snooze, the snooze. Identity lives in the Intent data
 * URI, so request codes stay constant and a changed alarm replaces its booking.
 */
object LafinaAlarms {
  const val DEFINITIONS_PREFS = "lafina_alarm_definitions_v1"
  const val EVENTS_PREFS = "lafina_alarm_events_v1"
  private const val KEY_EVENTS = "queue"

  const val ACTION_FIRE = "com.lafina.capstone.ALARM_FIRE"
  const val ACTION_DISMISS = "com.lafina.capstone.ALARM_DISMISS"
  const val ACTION_SNOOZE = "com.lafina.capstone.ALARM_SNOOZE"
  const val ACTION_STOPPED = "com.lafina.capstone.ALARM_STOPPED"
  const val EXTRA_ALARM_ID = "alarmId"
  const val EXTRA_GENERATION = "generation"
  const val EXTRA_TRIGGER_AT = "triggerAt"
  const val EXTRA_IS_SNOOZE = "isSnooze"
  const val EXTRA_IS_TEST = "isTest"
  const val EXTRA_SOUND_URI = "soundUri"
  const val EXTRA_OPEN_ALARMS = "lafinaOpenAlarms"
  const val TEST_ALARM_ID = "__lafina_test_alarm__"

  private const val REQUEST_CODE = 7401

  /** One lock for the registry, bookings and the event queue (receiver vs. bridge threads). */
  val LOCK = Any()

  private class PrefsStore(private val preferences: SharedPreferences) : DeliveryKeyValueStore {
    override fun all(): Map<String, String> =
        preferences.all.mapNotNull { (key, value) -> (value as? String)?.let { key to it } }.toMap()
    override fun get(key: String): String? = preferences.getString(key, null)
    override fun put(key: String, value: String) {
      check(preferences.edit().putString(key, value).commit()) { "alarm registry write failed" }
    }
    override fun remove(key: String) {
      check(preferences.edit().remove(key).commit()) { "alarm registry write failed" }
    }
  }

  fun registry(context: Context): AlarmRegistryCore =
      AlarmRegistryCore(PrefsStore(context.getSharedPreferences(DEFINITIONS_PREFS, Context.MODE_PRIVATE)))

  private fun zone(): ZoneId = ZoneId.systemDefault()

  /** Books the regular occurrence and any snooze still ahead. Returns the next ring (ms) or null. */
  fun book(context: Context, definition: AlarmDefinition): Long? {
    cancelBookings(context, definition.id)
    val now = System.currentTimeMillis()
    val regular = AlarmSchedule.nextTrigger(definition.copy(snoozeUntilMs = 0L), ZonedDateTime.now(zone()))
        ?.toInstant()
        ?.toEpochMilli()
    regular?.let { setClock(context, fireIntent(context, definition.id, definition.generation, it, false), it) }
    val snooze = definition.snoozeUntilMs.takeIf { it > now }
    snooze?.let { setClock(context, fireIntent(context, definition.id, definition.generation, it, true), it) }
    return listOfNotNull(regular, snooze).minOrNull()
  }

  /** After a regular ring: books the occurrence that follows [firedAtMs]. */
  fun bookFollowing(context: Context, definition: AlarmDefinition, firedAtMs: Long): Long? {
    val next = AlarmSchedule.followingTrigger(definition, firedAtMs, zone())?.toInstant()?.toEpochMilli() ?: return null
    setClock(context, fireIntent(context, definition.id, definition.generation, next, false), next)
    return next
  }

  fun bookSnooze(context: Context, definition: AlarmDefinition, untilMs: Long) {
    setClock(context, fireIntent(context, definition.id, definition.generation, untilMs, true), untilMs)
  }

  /** A one-off ring [seconds] from now that touches no saved alarm. */
  fun bookTest(context: Context, seconds: Int, soundUri: String? = null): Long {
    val at = System.currentTimeMillis() + seconds.coerceIn(5, 600) * 1000L
    val intent = fireIntent(context, TEST_ALARM_ID, 0L, at, false).apply {
      putExtra(EXTRA_IS_TEST, true)
      val cleanUri = AlertPreferencesContract.sanitizeToneUri(soundUri)
      if (cleanUri != null && cleanUri != AlertPreferencesContract.TONE_SILENT) {
        putExtra(EXTRA_SOUND_URI, cleanUri)
      }
    }
    setClock(context, intent, at)
    return at
  }

  fun cancelBookings(context: Context, alarmId: String) {
    for (snooze in listOf(false, true)) {
      val pending = PendingIntent.getBroadcast(
          context,
          REQUEST_CODE,
          baseIntent(context, alarmId, snooze),
          PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
      if (pending != null) {
        alarmManager(context).cancel(pending)
        pending.cancel()
      }
    }
  }

  fun cancelSnooze(context: Context, alarmId: String) {
    val pending = PendingIntent.getBroadcast(
        context,
        REQUEST_CODE,
        baseIntent(context, alarmId, true),
        PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
    if (pending != null) {
      alarmManager(context).cancel(pending)
      pending.cancel()
    }
  }

  /** Boot, package replace, time or zone change, exact-alarm permission change. */
  fun restoreAll(context: Context) {
    synchronized(LOCK) {
      val reg = registry(context)
      val now = System.currentTimeMillis()
      for (definition in reg.all()) {
        try {
          val nextTrigger = book(context, definition)
          if (nextTrigger == null &&
              !definition.isRepeating &&
              definition.enabled &&
              definition.oneShotDate != null) {
            reg.put(definition.copy(enabled = false, snoozeUntilMs = 0L))
            recordEvent(
                context,
                AlarmEvent(definition.id, AlarmEvent.ONE_SHOT_DONE, now, definition.generation))
          }
        } catch (_: Exception) {
          // One bad booking must not stop the others.
        }
      }
    }
  }

  fun canScheduleExact(context: Context): Boolean =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager(context).canScheduleExactAlarms()

  private fun alarmManager(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun baseIntent(context: Context, alarmId: String, snooze: Boolean): Intent =
      Intent(context, AlarmFireReceiver::class.java).apply {
        action = ACTION_FIRE
        data = Uri.parse("lafina-alarm://${if (snooze) "snooze" else "fire"}/${Uri.encode(alarmId)}")
      }

  private fun fireIntent(context: Context, alarmId: String, generation: Long, triggerAt: Long, snooze: Boolean): Intent =
      baseIntent(context, alarmId, snooze).apply {
        putExtra(EXTRA_ALARM_ID, alarmId)
        putExtra(EXTRA_GENERATION, generation)
        putExtra(EXTRA_TRIGGER_AT, triggerAt)
        putExtra(EXTRA_IS_SNOOZE, snooze)
      }

  private fun setClock(context: Context, intent: Intent, triggerAtMs: Long) {
    val operation = PendingIntent.getBroadcast(
        context, REQUEST_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val manager = alarmManager(context)
    if (canScheduleExact(context)) {
      val show = PendingIntent.getActivity(
          context,
          REQUEST_CODE,
          Intent(context, MainActivity::class.java).apply {
            putExtra(EXTRA_OPEN_ALARMS, true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
          },
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      manager.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAtMs, show), operation)
    } else {
      // Without exact-alarm access Android may ring a few minutes late; the
      // Alarms screen shows a warning with a shortcut to the setting.
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, operation)
    }
  }

  // ---- Events for JS (native never writes lafina.db, ADR-016) ----

  fun recordEvent(context: Context, event: AlarmEvent) {
    synchronized(LOCK) {
      val prefs = context.getSharedPreferences(EVENTS_PREFS, Context.MODE_PRIVATE)
      prefs.edit().putString(KEY_EVENTS, AlarmEvent.append(prefs.getString(KEY_EVENTS, null), event)).commit()
    }
  }

  fun drainEvents(context: Context): List<AlarmEvent> {
    synchronized(LOCK) {
      val prefs = context.getSharedPreferences(EVENTS_PREFS, Context.MODE_PRIVATE)
      val raw = prefs.getString(KEY_EVENTS, null) ?: return emptyList()
      prefs.edit().remove(KEY_EVENTS).commit()
      return raw.lines().mapNotNull { AlarmEvent.decode(it) }
    }
  }
}
