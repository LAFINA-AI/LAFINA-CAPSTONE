package com.lafina.capstone

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap

/**
 * Alarm phase A1: the JS bridge for alarms ("LafinaAlarm"). JS owns the alarms
 * table and hands native a copy of the active student's alarms; native books
 * them, rings them, and queues what happened for JS to record (ADR-016).
 */
class LafinaAlarmModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "LafinaAlarm"

  private fun definitionFrom(map: ReadableMap): AlarmDefinition? = try {
    AlarmDefinition(
            id = map.getString("id") ?: "",
            ownerId = map.getString("ownerId") ?: "",
            hour = map.getInt("hour"),
            minute = map.getInt("minute"),
            repeatDays = map.getInt("repeatDays"),
            oneShotDate = if (map.hasKey("oneShotDate") && !map.isNull("oneShotDate")) map.getString("oneShotDate") else null,
            label = map.getString("label") ?: "",
            enabled = map.getBoolean("enabled"),
            snoozeMinutes = map.getInt("snoozeMinutes"),
            vibrate = map.getBoolean("vibrate"),
            soundUri = if (map.hasKey("soundUri") && !map.isNull("soundUri")) map.getString("soundUri") else null,
            generation = map.getDouble("generation").toLong(),
            briefing = map.hasKey("briefing") && !map.isNull("briefing") && map.getBoolean("briefing"))
        .takeIf { it.isValid() }
  } catch (_: Exception) {
    null
  }

  /**
   * Replaces native's copy with the active student's alarms and books them.
   * Alarms of another account or deleted ones are cancelled. Resolves an
   * array of {id, nextTriggerMs} (null when the alarm won't ring).
   */
  @ReactMethod
  fun reconcile(alarms: ReadableArray, promise: Promise) {
    try {
      val definitions = (0 until alarms.size()).mapNotNull { index ->
        alarms.getMap(index)?.let { definitionFrom(it) }
      }
      if (definitions.size != alarms.size()) {
        promise.reject("ALARM_INVALID", "An alarm had invalid fields.")
        return
      }
      val result = Arguments.createArray()
      synchronized(LafinaAlarms.LOCK) {
        val registry = LafinaAlarms.registry(reactContext)
        for (removed in registry.replaceAll(definitions)) LafinaAlarms.cancelBookings(reactContext, removed)
        for (stored in registry.all()) {
          val next = LafinaAlarms.book(reactContext, stored)
          result.pushMap(Arguments.createMap().apply {
            putString("id", stored.id)
            if (next != null) putDouble("nextTriggerMs", next.toDouble()) else putNull("nextTriggerMs")
          })
        }
      }
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("ALARM_RECONCILE_FAILED", e.message, e)
    }
  }

  /** What native did since the last drain (fired, dismissed, snoozed, timed out, one-shot done). */
  @ReactMethod
  fun drainEvents(promise: Promise) {
    try {
      val array = Arguments.createArray()
      for (event in LafinaAlarms.drainEvents(reactContext)) {
        array.pushMap(Arguments.createMap().apply {
          putString("alarmId", event.alarmId)
          putString("kind", event.kind)
          putDouble("atMs", event.atMs.toDouble())
          putDouble("generation", event.generation.toDouble())
        })
      }
      promise.resolve(array)
    } catch (e: Exception) {
      promise.reject("ALARM_EVENTS_FAILED", e.message, e)
    }
  }

  /** Rings a test alarm in [seconds] (5..600) without touching saved alarms. */
  @ReactMethod
  fun testAlarm(seconds: Int, promise: Promise) {
    try {
      promise.resolve(LafinaAlarms.bookTest(reactContext, seconds).toDouble())
    } catch (e: Exception) {
      promise.reject("ALARM_TEST_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun stopRinging(promise: Promise) {
    LafinaAlarmService.finish(reactContext, AlarmEvent.DISMISSED)
    promise.resolve(true)
  }

  /** Everything that decides whether an alarm can ring on time and on screen. */
  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val notifications = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      LafinaAlarmService.createChannel(reactContext)
      val channelBlocked = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
          notifications.getNotificationChannel(LafinaAlarmService.CHANNEL_ID)?.importance ==
              NotificationManager.IMPORTANCE_NONE
      val power = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
      promise.resolve(Arguments.createMap().apply {
        putBoolean("canScheduleExactAlarms", LafinaAlarms.canScheduleExact(reactContext))
        putBoolean(
            "canUseFullScreenIntent",
            Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || notifications.canUseFullScreenIntent())
        putBoolean(
            "notificationsEnabled",
            NotificationManagerCompat.from(reactContext).areNotificationsEnabled() && !channelBlocked)
        putBoolean("ignoringBatteryOptimizations", power.isIgnoringBatteryOptimizations(reactContext.packageName))
        putString("manufacturer", Build.MANUFACTURER ?: "")
      })
    } catch (e: Exception) {
      promise.reject("ALARM_STATUS_FAILED", e.message, e)
    }
  }

  /** The battery-optimisation list (never the direct exemption request, which Play restricts). */
  @ReactMethod
  fun openBatterySettings(promise: Promise) {
    try {
      reactContext.startActivity(
          Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(true)
    } catch (_: Exception) {
      try {
        reactContext.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:${reactContext.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("SETTINGS_ERROR", e.message, e)
      }
    }
  }
}
