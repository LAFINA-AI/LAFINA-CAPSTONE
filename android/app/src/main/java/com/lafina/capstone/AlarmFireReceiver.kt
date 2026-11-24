package com.lafina.capstone

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Alarm phase A1: an alarm is due, or the student pressed Dismiss/Snooze on the
 * alarm notification. For a regular ring the following occurrence is booked
 * first, so a crash while ringing can never end a repeating series.
 */
class AlarmFireReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      LafinaAlarms.ACTION_DISMISS -> LafinaAlarmService.finish(context, AlarmEvent.DISMISSED)
      LafinaAlarms.ACTION_SNOOZE -> LafinaAlarmService.finish(context, AlarmEvent.SNOOZED)
      LafinaAlarms.ACTION_FIRE -> fire(context, intent)
    }
  }

  private fun fire(context: Context, intent: Intent) {
    val alarmId = intent.getStringExtra(LafinaAlarms.EXTRA_ALARM_ID) ?: return
    val now = System.currentTimeMillis()
    if (intent.getBooleanExtra(LafinaAlarms.EXTRA_IS_TEST, false)) {
      val soundUri = intent.getStringExtra(LafinaAlarms.EXTRA_SOUND_URI)
      LafinaAlarmService.start(context, RingRequest(alarmId, 0L, "Test alarm", vibrate = true, soundUri = soundUri, isTest = true))
      return
    }
    val generation = intent.getLongExtra(LafinaAlarms.EXTRA_GENERATION, -1L)
    val isSnooze = intent.getBooleanExtra(LafinaAlarms.EXTRA_IS_SNOOZE, false)
    val triggerAt = intent.getLongExtra(LafinaAlarms.EXTRA_TRIGGER_AT, now)
    val definition = synchronized(LafinaAlarms.LOCK) {
      val registry = LafinaAlarms.registry(context)
      val current = registry.get(alarmId) ?: return
      // A booking from before the last change never rings.
      if (current.generation != generation) return
      if (isSnooze) {
        if (current.snoozeUntilMs <= 0L) return
        registry.put(current.copy(snoozeUntilMs = 0L))
      } else {
        if (!current.enabled) return
        if (current.isRepeating) {
          LafinaAlarms.bookFollowing(context, current, maxOf(now, triggerAt))
        }
      }
      current
    }
    val started = LafinaAlarmService.start(
        context,
        RingRequest(
            alarmId = definition.id,
            generation = definition.generation,
            label = definition.label,
            vibrate = definition.vibrate,
            soundUri = definition.soundUri,
            isTest = false))
    if (started) {
      if (!isSnooze && !definition.isRepeating) {
        synchronized(LafinaAlarms.LOCK) {
          val registry = LafinaAlarms.registry(context)
          val latest = registry.get(alarmId)
          if (latest != null && latest.generation == generation && latest.enabled && !latest.isRepeating) {
            registry.put(latest.copy(enabled = false, snoozeUntilMs = 0L))
            LafinaAlarms.recordEvent(context, AlarmEvent(alarmId, AlarmEvent.ONE_SHOT_DONE, now, generation))
          }
        }
      }
      LafinaAlarms.recordEvent(context, AlarmEvent(alarmId, AlarmEvent.FIRED, now, generation))
    }
  }
}

/** Boot, package replace, time or zone change, exact-alarm permission change. */
class AlarmBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    LafinaAlarms.restoreAll(context)
  }
}
