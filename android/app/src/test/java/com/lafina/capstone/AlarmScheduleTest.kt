package com.lafina.capstone

import java.time.DayOfWeek
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Alarm phase A1: next occurrence, DST, time zones, snooze and the registry codec on the JVM. */
class AlarmScheduleTest {
  private val manila = ZoneId.of("Asia/Manila")
  private val newYork = ZoneId.of("America/New_York")

  private val weekdays =
      listOf(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY)
          .sumOf { AlarmDefinition.bitFor(it) }

  private fun alarm(
      hour: Int = 6,
      minute: Int = 0,
      days: Int = 0,
      date: String? = null,
      enabled: Boolean = true,
      snoozeUntil: Long = 0L,
  ) =
      AlarmDefinition(
          id = "alarm-1",
          ownerId = "owner-a",
          hour = hour,
          minute = minute,
          repeatDays = days,
          oneShotDate = date,
          label = "Wake up | early, 100%",
          enabled = enabled,
          snoozeMinutes = 9,
          vibrate = true,
          soundUri = null,
          generation = 3,
          snoozeUntilMs = snoozeUntil)

  /** Sunday 15 Nov 2026. */
  private fun at(day: Int, hour: Int, minute: Int = 0, zone: ZoneId = manila) =
      ZonedDateTime.of(2026, 11, day, hour, minute, 0, 0, zone)

  @Test
  fun weekdayAlarmSkipsTheWeekend() {
    // Saturday 14 Nov 2026, 10:00 -> Monday 16 Nov 06:00.
    assertEquals(at(16, 6), AlarmSchedule.nextTrigger(alarm(days = weekdays), at(14, 10)))
  }

  @Test
  fun sameDayWhenTheTimeIsStillAhead() {
    // Monday 16 Nov 05:59 -> 06:00 the same day.
    assertEquals(at(16, 6), AlarmSchedule.nextTrigger(alarm(days = weekdays), at(16, 5, 59)))
    // Exactly 06:00 is not "after now": the next weekday.
    assertEquals(at(17, 6), AlarmSchedule.nextTrigger(alarm(days = weekdays), at(16, 6)))
  }

  @Test
  fun followingTriggerAfterARingIsTheNextOccurrence() {
    val rang = at(20, 6).toInstant().toEpochMilli() // Friday
    assertEquals(at(23, 6), AlarmSchedule.followingTrigger(alarm(days = weekdays), rang, manila))
  }

  @Test
  fun oneShotWithADateRingsOnceThenNever() {
    val oneShot = alarm(date = "2026-11-16")
    assertEquals(at(16, 6), AlarmSchedule.nextTrigger(oneShot, at(15, 22)))
    assertNull(AlarmSchedule.nextTrigger(oneShot, at(16, 6, 1)))
  }

  @Test
  fun oneShotWithoutADateIsTheNextTimeThatClockTimeComes() {
    assertEquals(at(16, 6), AlarmSchedule.nextTrigger(alarm(), at(15, 22)))
    assertEquals(at(15, 23), AlarmSchedule.nextTrigger(alarm(hour = 23), at(15, 22)))
  }

  @Test
  fun disabledNeverRings() {
    assertNull(AlarmSchedule.nextTrigger(alarm(days = weekdays, enabled = false), at(15, 1)))
  }

  @Test
  fun dstGapMovesForwardAndOverlapRingsOnce() {
    // US spring forward: Sunday 8 Mar 2026, 02:00 -> 03:00.
    val sunday = AlarmDefinition.bitFor(DayOfWeek.SUNDAY)
    val gap = AlarmSchedule.nextTrigger(
        alarm(hour = 2, minute = 30, days = sunday), ZonedDateTime.of(2026, 3, 7, 12, 0, 0, 0, newYork))!!
    assertEquals(8, gap.dayOfMonth)
    assertEquals(3, gap.hour)
    assertEquals(30, gap.minute)
    // US fall back: Sunday 1 Nov 2026, 01:30 happens twice; the earlier offset rings.
    val overlap = AlarmSchedule.nextTrigger(
        alarm(hour = 1, minute = 30, days = sunday), ZonedDateTime.of(2026, 10, 31, 12, 0, 0, 0, newYork))!!
    assertEquals(ZonedDateTime.of(2026, 11, 1, 1, 30, 0, 0, newYork).withEarlierOffsetAtOverlap(), overlap)
  }

  @Test
  fun aTimeZoneChangeKeepsTheWallClockTime() {
    val manilaNext = AlarmSchedule.nextTrigger(alarm(days = weekdays), at(16, 5))!!
    val newYorkNext = AlarmSchedule.nextTrigger(alarm(days = weekdays), at(16, 5).withZoneSameInstant(newYork))!!
    assertEquals(6, manilaNext.hour)
    assertEquals(6, newYorkNext.hour)
    assertEquals(newYork, newYorkNext.zone)
  }

  @Test
  fun aSnoozeStillAheadWinsAndAPastOneIsIgnored() {
    val now = at(16, 6, 1)
    val snoozeEnd = now.plusMinutes(8).toInstant().toEpochMilli()
    assertEquals(
        snoozeEnd,
        AlarmSchedule.nextTrigger(alarm(days = weekdays, snoozeUntil = snoozeEnd), now)!!.toInstant().toEpochMilli())
    val pastSnooze = now.minusMinutes(1).toInstant().toEpochMilli()
    assertEquals(at(17, 6), AlarmSchedule.nextTrigger(alarm(days = weekdays, snoozeUntil = pastSnooze), now))
    assertEquals(9 * 60_000L, AlarmSchedule.snoozeUntil(alarm(), 0L))
  }

  @Test
  fun codecRoundTripsAndRejectsBadInput() {
    val original = alarm(days = weekdays, snoozeUntil = 42)
    assertEquals(original, AlarmDefinition.decode(original.encode()))
    assertNull(AlarmDefinition.decode("garbage"))
    assertNull(AlarmDefinition.decode(original.copy(hour = 24).encode()))
    assertNull(AlarmDefinition.decode(original.copy(snoozeMinutes = 0).encode()))
    assertNull(AlarmDefinition.decode(original.copy(oneShotDate = "2026-13-40").encode()))
    assertFalse(original.copy(label = "x".repeat(61)).isValid())
  }

  @Test
  fun eventQueueKeepsTheNewest() {
    var queue: String? = null
    repeat(AlarmEvent.MAX_EVENTS + 5) { i ->
      queue = AlarmEvent.append(queue, AlarmEvent("a|b", AlarmEvent.FIRED, i.toLong(), 1))
    }
    val events = queue!!.lines().mapNotNull { AlarmEvent.decode(it) }
    assertEquals(AlarmEvent.MAX_EVENTS, events.size)
    assertEquals(5L, events.first().atMs)
    assertEquals("a|b", events.first().alarmId)
  }

  private class MemoryStore : DeliveryKeyValueStore {
    val values = linkedMapOf<String, String>()
    override fun all(): Map<String, String> = LinkedHashMap(values)
    override fun get(key: String): String? = values[key]
    override fun put(key: String, value: String) {
      values[key] = value
    }
    override fun remove(key: String) {
      values.remove(key)
    }
  }

  @Test
  fun replaceAllDropsOtherOwnersAndKeepsAnUnchangedSnooze() {
    val core = AlarmRegistryCore(MemoryStore())
    core.put(alarm(days = weekdays, snoozeUntil = 99))
    core.put(alarm().copy(id = "other-owner", ownerId = "owner-b"))
    val removed = core.replaceAll(listOf(alarm(days = weekdays)))
    assertEquals(listOf("other-owner"), removed)
    assertEquals(99L, core.get("alarm-1")!!.snoozeUntilMs)
    // A changed alarm (new generation) drops the old snooze.
    core.replaceAll(listOf(alarm(days = weekdays).copy(generation = 4)))
    assertEquals(0L, core.get("alarm-1")!!.snoozeUntilMs)
    assertTrue(core.all().size == 1)
  }

  @Test
  fun briefingSurvivesTheCodecAndOldDefinitionsStillDecode() {
    val withBriefing = AlarmDefinition(
        id = "alarm_b", ownerId = "owner", hour = 6, minute = 0, repeatDays = 31,
        oneShotDate = null, label = "Wake up", enabled = true, snoozeMinutes = 9,
        vibrate = true, soundUri = null, generation = 4, briefing = true)
    assertEquals(withBriefing, AlarmDefinition.decode(withBriefing.encode()))
    // A definition stored by the A1 build (14 fields) reads as briefing off.
    val a1 = withBriefing.encode().replaceFirst("a2|", "a1|").substringBeforeLast("|")
    assertEquals(withBriefing.copy(briefing = false), AlarmDefinition.decode(a1))
    assertNull(AlarmDefinition.decode(a1 + "|1"))
  }
}
