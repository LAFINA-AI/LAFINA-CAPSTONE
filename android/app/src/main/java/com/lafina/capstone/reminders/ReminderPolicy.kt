package com.lafina.capstone.reminders

import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatterBuilder
import java.time.format.ResolverStyle
import java.util.Locale

/** Pure time/identity policy, shared by delivery and deterministic JVM tests. */
object ReminderPolicy {
  const val RING_SECONDS = 60L
  const val GRACE_MINUTES = 15L
  private val utcPattern = Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z")
  private val clockPattern = Regex("(?:[01]\\d|2[0-3]):[0-5]\\d")
  private val utcFormat = DateTimeFormatterBuilder().appendInstant(3).toFormatter()
  private val clockFormat = DateTimeFormatterBuilder().appendPattern("HH:mm")
    .toFormatter().withResolverStyle(ResolverStyle.STRICT)
  // Intl accepts case-insensitive IANA names. Resolve against this device's
  // fixed zone catalogue without rewriting saved preferences or UTC instants.
  private val zoneNames by lazy {
    ZoneId.getAvailableZoneIds().associateBy { it.lowercase(Locale.ROOT) } +
      mapOf("utc" to "UTC", "gmt" to "GMT", "ut" to "UT")
  }

  fun zone(value: String): ZoneId {
    require(value.isNotBlank() && value == value.trim() && value.length <= 100) {
      "INVALID_TIMEZONE"
    }
    return ZoneId.of(zoneNames[value.lowercase(Locale.ROOT)] ?: value)
  }

  fun instant(value: String): Instant {
    require(utcPattern.matches(value)) { "INVALID_UTC" }
    val result = Instant.parse(value)
    require(format(result) == value && value.take(4).toInt() in 2000..2100) { "INVALID_UTC" }
    return result
  }

  fun format(value: Instant): String = utcFormat.format(value)

  fun validateIdentity(identity: ReminderIdentity) {
    for (value in listOf(identity.jobId, identity.occurrenceKey)) {
      require(value.isNotBlank() && value == value.trim() && value.length <= 1024 &&
        value.none { it.isISOControl() }) { "INVALID_IDENTITY" }
    }
    require(identity.generation >= 1) { "INVALID_GENERATION" }
  }

  fun matches(record: ReminderRecord, identity: ReminderIdentity): Boolean =
    record.identity == identity

  fun snoozeAt(nowUtc: String, minutes: Int): String {
    require(minutes in 1..120) { "INVALID_SNOOZE" }
    return format(instant(nowUtc).plusSeconds(minutes * 60L)).also { instant(it) }
  }

  fun ringingDeadline(nowUtc: String): String =
    format(instant(nowUtc).plusSeconds(RING_SECONDS)).also { instant(it) }

  /** Unlike atZone(), this never silently shifts nonexistent local boundaries. */
  fun resolveBoundary(local: LocalDateTime, timezone: String, laterFold: Boolean): Instant {
    val offsets = zone(timezone).rules.getValidOffsets(local)
    require(offsets.isNotEmpty()) { "QUIET_BOUNDARY_GAP" }
    val candidates = offsets.map { local.toInstant(it) }.sorted()
    return if (laterFold) candidates.last() else candidates.first()
  }

  fun evaluate(runAtUtc: String, nowUtc: String, quietHours: QuietHours?): ReminderTimeDecision {
    val planned = instant(runAtUtc)
    val now = instant(nowUtc)
    // Same ordering as the TS policy: an old missed reminder never rings at quiet end.
    if (now < planned) return ReminderTimeDecision(ClaimKind.FUTURE, runAtUtc)
    if (Duration.between(planned, now) > Duration.ofMinutes(GRACE_MINUTES)) {
      return ReminderTimeDecision(ClaimKind.MISSED)
    }
    if (quietHours != null) {
      require(clockPattern.matches(quietHours.start) && clockPattern.matches(quietHours.end) &&
        quietHours.start != quietHours.end) { "INVALID_QUIET_HOURS" }
      val startTime = LocalTime.parse(quietHours.start, clockFormat)
      val endTime = LocalTime.parse(quietHours.end, clockFormat)
      val zone = zone(quietHours.timezone)
      val today = now.atZone(zone).toLocalDate()
      for (shift in listOf(0L, -1L)) {
        val startDate = today.plusDays(shift)
        val endDate = startDate.plusDays(if (startTime > endTime) 1 else 0)
        if (startDate.year < 2000 || endDate.year > 2100) continue
        val start = resolveBoundary(startDate.atTime(startTime), quietHours.timezone, false)
        val end = resolveBoundary(endDate.atTime(endTime), quietHours.timezone, true)
        if (now >= start && now < end) {
          return ReminderTimeDecision(ClaimKind.QUIET, format(end))
        }
      }
    }
    return ReminderTimeDecision(ClaimKind.RING)
  }
}
