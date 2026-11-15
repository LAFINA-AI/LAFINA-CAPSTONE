package com.lafina.capstone

import java.net.URLDecoder
import java.net.URLEncoder
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Alarm phase A1: the pure part of LAFINA's alarms (no Android types), so the
 * repeat, DST and codec rules run as JVM unit tests like LafinaDeliveryContract.
 *
 * Native keeps its own copy of each alarm definition (ADR-016: native never
 * writes lafina.db), so a repeating alarm keeps ringing without the JS app:
 * the fire receiver computes and books the next occurrence itself.
 */
data class AlarmDefinition(
    val id: String,
    val ownerId: String,
    val hour: Int,
    val minute: Int,
    /** Bitmask Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64; 0 = one-shot. */
    val repeatDays: Int,
    /** yyyy-MM-dd for a one-shot alarm; null = the next time this clock time comes. */
    val oneShotDate: String?,
    val label: String,
    val enabled: Boolean,
    val snoozeMinutes: Int,
    val vibrate: Boolean,
    val soundUri: String?,
    /** Bumped by JS on every change; a stale PendingIntent never rings. */
    val generation: Long,
    /** Epoch ms of an active snooze, or 0. */
    val snoozeUntilMs: Long = 0L,
    /** Alarm phase A4: Dismiss on the ringing screen opens LAFINA for the morning briefing. */
    val briefing: Boolean = false,
) {
  val isRepeating: Boolean get() = repeatDays and ALL_DAYS != 0

  fun encode(): String =
      listOf(
              VERSION,
              enc(id),
              enc(ownerId),
              hour.toString(),
              minute.toString(),
              repeatDays.toString(),
              enc(oneShotDate ?: ""),
              if (enabled) "1" else "0",
              snoozeMinutes.toString(),
              if (vibrate) "1" else "0",
              generation.toString(),
              enc(label),
              enc(soundUri ?: ""),
              snoozeUntilMs.toString(),
              if (briefing) "1" else "0",
          )
          .joinToString(SEPARATOR)

  companion object {
    const val VERSION = "a2"
    /** Stored by builds before the morning briefing; read as briefing off. */
    private const val VERSION_A1 = "a1"
    private const val SEPARATOR = "|"
    const val ALL_DAYS = 127
    const val MIN_SNOOZE = 1
    const val MAX_SNOOZE = 30
    const val MAX_LABEL = 60

    private fun enc(value: String): String = URLEncoder.encode(value, "UTF-8")
    private fun dec(value: String): String = URLDecoder.decode(value, "UTF-8")

    fun decode(raw: String?): AlarmDefinition? {
      if (raw.isNullOrBlank()) return null
      val parts = raw.split(SEPARATOR)
      val legacy = parts.size == 14 && parts[0] == VERSION_A1
      if (!legacy && (parts.size != 15 || parts[0] != VERSION)) return null
      return try {
        AlarmDefinition(
                id = dec(parts[1]),
                ownerId = dec(parts[2]),
                hour = parts[3].toInt(),
                minute = parts[4].toInt(),
                repeatDays = parts[5].toInt(),
                oneShotDate = dec(parts[6]).ifEmpty { null },
                enabled = parts[7] == "1",
                snoozeMinutes = parts[8].toInt(),
                vibrate = parts[9] == "1",
                generation = parts[10].toLong(),
                label = dec(parts[11]),
                soundUri = dec(parts[12]).ifEmpty { null },
                snoozeUntilMs = parts[13].toLong(),
                briefing = !legacy && parts[14] == "1",
            )
            .takeIf { it.isValid() }
      } catch (_: Exception) {
        null
      }
    }

    /** Bit for a java.time day (Mon=1 … Sun=64). */
    fun bitFor(day: DayOfWeek): Int = 1 shl (day.value - 1)
  }

  /** Field ranges every stored or bridged definition must meet. */
  fun isValid(): Boolean =
      id.isNotBlank() &&
          id.length <= 128 &&
          ownerId.isNotBlank() &&
          hour in 0..23 &&
          minute in 0..59 &&
          repeatDays in 0..ALL_DAYS &&
          snoozeMinutes in MIN_SNOOZE..MAX_SNOOZE &&
          label.length <= MAX_LABEL &&
          (oneShotDate == null || runCatching { LocalDate.parse(oneShotDate) }.isSuccess)
}

object AlarmSchedule {
  /**
   * The next time this alarm rings strictly after [now], or null when it never
   * will (disabled, or a one-shot whose moment has passed). A clock time that
   * falls in a DST gap moves forward by the gap (java.time's rule: 2:30 on a
   * spring-forward night rings at 3:30); in an overlap the earlier one rings.
   * An active snooze that is still ahead wins.
   */
  fun nextTrigger(definition: AlarmDefinition, now: ZonedDateTime): ZonedDateTime? {
    if (!definition.enabled) return null
    val zone = now.zone
    if (definition.snoozeUntilMs > now.toInstant().toEpochMilli()) {
      return Instant.ofEpochMilli(definition.snoozeUntilMs).atZone(zone)
    }
    val time = LocalTime.of(definition.hour, definition.minute)
    if (definition.isRepeating) {
      val today = now.toLocalDate()
      for (offset in 0..7) {
        val date = today.plusDays(offset.toLong())
        if (definition.repeatDays and AlarmDefinition.bitFor(date.dayOfWeek) == 0) continue
        val candidate = ZonedDateTime.of(date, time, zone)
        if (candidate.isAfter(now)) return candidate
      }
      return null
    }
    definition.oneShotDate?.let { day ->
      val candidate = ZonedDateTime.of(LocalDate.parse(day), time, zone)
      return if (candidate.isAfter(now)) candidate else null
    }
    val today = ZonedDateTime.of(now.toLocalDate(), time, zone)
    return if (today.isAfter(now)) today else ZonedDateTime.of(now.toLocalDate().plusDays(1), time, zone)
  }

  /** The occurrence after the one that just rang (at [firedAtMs]). */
  fun followingTrigger(definition: AlarmDefinition, firedAtMs: Long, zone: ZoneId): ZonedDateTime? =
      nextTrigger(
          definition.copy(snoozeUntilMs = 0L),
          Instant.ofEpochMilli(firedAtMs).plusSeconds(1).atZone(zone))

  /** When a snooze started at [nowMs] ends. */
  fun snoozeUntil(definition: AlarmDefinition, nowMs: Long): Long =
      nowMs + definition.snoozeMinutes.coerceIn(AlarmDefinition.MIN_SNOOZE, AlarmDefinition.MAX_SNOOZE) * 60_000L
}

/** Something native did that JS records later (drained from SharedPreferences). */
data class AlarmEvent(val alarmId: String, val kind: String, val atMs: Long, val generation: Long) {
  fun encode(): String = listOf(URLEncoder.encode(alarmId, "UTF-8"), kind, atMs.toString(), generation.toString()).joinToString("|")

  companion object {
    const val FIRED = "fired"
    const val DISMISSED = "dismissed"
    const val SNOOZED = "snoozed"
    const val TIMED_OUT = "timed_out"
    /** A one-shot alarm rang, so native switched it off; JS mirrors that. */
    const val ONE_SHOT_DONE = "one_shot_done"
    const val MAX_EVENTS = 200

    fun decode(raw: String): AlarmEvent? {
      val parts = raw.split("|")
      if (parts.size != 4) return null
      return try {
        AlarmEvent(URLDecoder.decode(parts[0], "UTF-8"), parts[1], parts[2].toLong(), parts[3].toLong())
      } catch (_: Exception) {
        null
      }
    }

    /** Appends to a newline-separated queue, keeping the newest [MAX_EVENTS]. */
    fun append(queue: String?, event: AlarmEvent): String =
        ((queue?.lines()?.filter { it.isNotBlank() } ?: emptyList()) + event.encode())
            .takeLast(MAX_EVENTS)
            .joinToString("\n")
  }
}

/** The alarm registry over any key-value store (SharedPreferences on device). */
class AlarmRegistryCore(private val store: DeliveryKeyValueStore) {
  fun all(): List<AlarmDefinition> = store.all().values.mapNotNull { AlarmDefinition.decode(it) }

  fun get(id: String): AlarmDefinition? = AlarmDefinition.decode(store.get(id))

  fun put(definition: AlarmDefinition) {
    require(definition.isValid()) { "invalid alarm" }
    store.put(definition.id, definition.encode())
  }

  fun remove(id: String) {
    if (store.get(id) != null) store.remove(id)
  }

  /**
   * Replaces the registry with the active owner's alarms. Returns the ids that
   * were removed (other owners, deleted alarms) so their PendingIntents can be
   * cancelled. A snooze in progress survives when the alarm itself is unchanged.
   */
  fun replaceAll(definitions: List<AlarmDefinition>): List<String> {
    val incoming = definitions.filter { it.isValid() }.associateBy { it.id }
    val removed = mutableListOf<String>()
    for (existing in all()) {
      if (existing.id !in incoming) {
        store.remove(existing.id)
        removed.add(existing.id)
      }
    }
    for (definition in incoming.values) {
      val previous = get(definition.id)
      val keepSnooze =
          previous != null && previous.generation == definition.generation && previous.snoozeUntilMs > 0
      put(if (keepSnooze) definition.copy(snoozeUntilMs = previous!!.snoozeUntilMs) else definition)
    }
    return removed
  }
}
