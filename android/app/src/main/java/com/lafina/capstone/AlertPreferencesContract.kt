package com.lafina.capstone

/**
 * Pure-Kotlin contract for device-local alert tone, notification channel, and
 * reminder-call settings. Contains zero Android framework types so all hashing,
 * sanitization, waveform mapping, and quiet-hours checks run as JVM tests.
 */
object AlertPrefsKeys {
  const val PREFS_NAME = "lafina_alert_prefs_v1"

  const val DEFAULT_ALARM_SOUND_URI = "default_alarm_sound_uri"
  const val ALARM_VIBRATION_PATTERN = "alarm_vibration_pattern"
  const val ALARM_VOLUME_RAMP_SEC = "alarm_volume_ramp_sec"

  const val NOTIFICATION_SOUND_URI = "notification_sound_uri"
  const val NOTIFICATION_VIBRATE = "notification_vibrate"
  const val NOTIFICATION_VIBRATION_PATTERN = "notification_vibration_pattern"
  const val NOTIFICATION_SNOOZE_MINUTES = "notification_snooze_minutes"
  const val LOCK_SCREEN_PRIVACY = "lock_screen_privacy"

  const val CALL_RINGTONE_URI = "call_ringtone_uri"
  const val CALL_VIBRATE = "call_vibrate"
  const val CALL_VIBRATION_PATTERN = "call_vibration_pattern"
  const val CALL_RING_TIMEOUT_SEC = "call_ring_timeout_sec"

  const val ACTIVE_NOTIFY_CHANNEL_ID = "active_notify_channel_id"
  const val ACTIVE_CALL_CHANNEL_ID = "active_call_channel_id"
}

data class BundledTone(val id: String, val rawName: String, val label: String)

object AlertPreferencesContract {
  const val TONE_SILENT = "silent"
  const val MAX_URI_LENGTH = 512

  const val PATTERN_OFF = "off"
  const val PATTERN_GENTLE = "gentle"
  const val PATTERN_STANDARD = "standard"
  const val PATTERN_URGENT = "urgent"
  val VIBRATION_PATTERNS = setOf(PATTERN_OFF, PATTERN_GENTLE, PATTERN_STANDARD, PATTERN_URGENT)

  const val PRIVACY_HIDE_TASK = "hide_task"
  const val PRIVACY_SHOW = "show"

  val ALLOWED_RAMP_SEC = setOf(0, 15, 30, 60)
  val ALLOWED_RING_TIMEOUT_SEC = setOf(30, 45, 60)
  val ALLOWED_SNOOZE_MINUTES = setOf(5, 10, 15, 30)

  val STANDARD_ALARM_WAVEFORM = longArrayOf(0L, 800L, 800L)

  val BUNDLED_TONES = listOf(
    BundledTone("gentle", "lafina_tone_gentle", "Gentle Chime"),
    BundledTone("chime", "lafina_tone_chime", "Academic Bell"),
    BundledTone("classic_ring", "lafina_tone_classic_ring", "Classic Ring"),
    BundledTone("urgent", "lafina_tone_urgent", "Urgent Pulse"),
  )

  fun bundledToneUri(packageName: String, rawName: String): String =
    "android.resource://$packageName/raw/$rawName"

  fun findBundledToneByUri(uri: String?): BundledTone? {
    val clean = uri?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    if (!clean.startsWith("android.resource://")) return null
    val slashIdx = clean.lastIndexOf("/raw/")
    if (slashIdx < 0) return null
    val rawName = clean.substring(slashIdx + 5)
    return BUNDLED_TONES.firstOrNull { it.rawName == rawName }
  }

  /**
   * Accepts "silent", android.resource://..., or content://... up to 512 chars
   * without control characters; everything else becomes null (system default).
   */
  fun sanitizeToneUri(raw: String?): String? {
    val trimmed = raw?.trim() ?: return null
    if (trimmed.isEmpty() || trimmed.length > MAX_URI_LENGTH) return null
    if (trimmed.any { it.code < 0x20 || it.code == 0x7F }) return null
    if (trimmed == TONE_SILENT) return TONE_SILENT
    if (trimmed.startsWith("android.resource://") || trimmed.startsWith("content://")) {
      return trimmed
    }
    return null
  }

  fun sanitizeVibrationPattern(raw: String?): String {
    val norm = raw?.trim()?.lowercase()
    return if (norm in VIBRATION_PATTERNS) norm!! else PATTERN_STANDARD
  }

  fun alarmWaveform(pattern: String?): LongArray? = when (sanitizeVibrationPattern(pattern)) {
    PATTERN_OFF -> null
    PATTERN_GENTLE -> longArrayOf(0L, 350L, 900L)
    PATTERN_URGENT -> longArrayOf(0L, 300L, 200L, 300L, 200L, 500L, 600L)
    else -> STANDARD_ALARM_WAVEFORM.copyOf()
  }

  fun callWaveform(pattern: String?): LongArray? = when (sanitizeVibrationPattern(pattern)) {
    PATTERN_OFF -> null
    PATTERN_GENTLE -> longArrayOf(0L, 500L, 1100L, 500L, 1100L)
    PATTERN_URGENT -> longArrayOf(0L, 300L, 200L, 300L, 200L, 500L, 500L)
    else -> longArrayOf(0L, 1000L, 1000L, 1000L, 1000L)
  }

  fun notifyWaveform(pattern: String?): LongArray? = when (sanitizeVibrationPattern(pattern)) {
    PATTERN_OFF -> null
    PATTERN_GENTLE -> longArrayOf(0L, 180L)
    PATTERN_URGENT -> longArrayOf(0L, 300L, 150L, 300L, 150L, 350L)
    else -> longArrayOf(0L, 250L, 200L, 250L)
  }

  fun clampRampSeconds(sec: Int): Int = if (sec in ALLOWED_RAMP_SEC) sec else 30

  fun clampRingTimeoutSec(sec: Int): Int = if (sec in ALLOWED_RING_TIMEOUT_SEC) sec else 45

  fun clampSnoozeMinutes(minutes: Int): Int = if (minutes in ALLOWED_SNOOZE_MINUTES) minutes else 10

  fun sanitizeLockScreenPrivacy(raw: String?): String =
    if (raw == PRIVACY_SHOW) PRIVACY_SHOW else PRIVACY_HIDE_TASK

  private fun fnv1a32Hex(input: String): String {
    var hash = 0x811c9dc5.toInt()
    for (byte in input.toByteArray(Charsets.UTF_8)) {
      hash = hash xor (byte.toInt() and 0xFF)
      hash *= 0x01000193
    }
    return Integer.toUnsignedString(hash, 16).padStart(8, '0')
  }

  fun notifyChannelId(
    soundUri: String?,
    vibrate: Boolean,
    pattern: String?,
    privacy: String?,
  ): String {
    val cleanUri = sanitizeToneUri(soundUri).orEmpty()
    val cleanPattern = sanitizeVibrationPattern(pattern)
    val cleanPrivacy = sanitizeLockScreenPrivacy(privacy)
    val payload = "notify|$cleanUri|$vibrate|$cleanPattern|$cleanPrivacy"
    return "lafina_notify_${fnv1a32Hex(payload)}"
  }

  fun callChannelId(
    soundUri: String?,
    vibrate: Boolean,
    pattern: String?,
  ): String {
    val cleanUri = sanitizeToneUri(soundUri).orEmpty()
    val cleanPattern = sanitizeVibrationPattern(pattern)
    val payload = "call|$cleanUri|$vibrate|$cleanPattern"
    return "lafina_call_${fnv1a32Hex(payload)}"
  }

  fun isDynamicNotifyChannel(id: String?): Boolean =
    id != null && id.startsWith("lafina_notify_")

  fun isDynamicCallChannel(id: String?): Boolean =
    id != null && id.startsWith("lafina_call_")

  private fun parseMinutes(hhmm: String): Int? {
    val parts = hhmm.trim().split(":")
    if (parts.size != 2) return null
    val h = parts[0].toIntOrNull() ?: return null
    val m = parts[1].toIntOrNull() ?: return null
    if (h !in 0..23 || m !in 0..59) return null
    return h * 60 + m
  }

  /**
   * True when [hour]:[minute] falls in [sleepHHMM, wakeHHMM), handling overnight wrap
   * (e.g. 23:00..07:00) and same-day windows (e.g. 01:00..06:00). Equal/malformed
   * boundaries return false.
   */
  fun isWithinQuietHours(
    hour: Int,
    minute: Int,
    sleepHHMM: String,
    wakeHHMM: String,
  ): Boolean {
    if (hour !in 0..23 || minute !in 0..59) return false
    val start = parseMinutes(sleepHHMM) ?: return false
    val end = parseMinutes(wakeHHMM) ?: return false
    if (start == end) return false
    val current = hour * 60 + minute
    return if (start < end) {
      current in start until end
    } else {
      current >= start || current < end
    }
  }
}
