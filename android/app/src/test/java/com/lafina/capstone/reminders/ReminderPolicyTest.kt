package com.lafina.capstone.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class ReminderPolicyTest {
  private val at = "2026-10-23T04:00:00.000Z"

  @Test fun canonicalUtcRoundTrips() {
    assertEquals(at, ReminderPolicy.format(ReminderPolicy.instant(at)))
  }

  @Test fun lowercaseIanaAndUtcAliasesResolveWithoutChangingOffsets() {
    for (value in listOf("Asia/Manila", "UTC", "GMT", "UT")) {
      assertEquals(ZoneId.of(value), ReminderPolicy.zone(value.lowercase(java.util.Locale.ROOT)))
    }
    assertEquals(ZoneId.of("UTC+08:00"), ReminderPolicy.zone("UTC+08:00"))
    assertThrows(Exception::class.java) { ReminderPolicy.zone("unknown/timezone") }
    assertThrows(IllegalArgumentException::class.java) { ReminderPolicy.zone(" asia/manila") }
  }

  @Test fun lowercaseZonesKeepQuietDecisionsEquivalent() {
    val manila = "2026-10-23T15:00:00.000Z"
    assertEquals(ReminderPolicy.evaluate(manila, manila, QuietHours("Asia/Manila", "22:00", "07:00")),
      ReminderPolicy.evaluate(manila, manila, QuietHours("asia/manila", "22:00", "07:00")))
    assertEquals(ReminderPolicy.evaluate(at, at, QuietHours("UTC", "03:00", "05:00")),
      ReminderPolicy.evaluate(at, at, QuietHours("utc", "03:00", "05:00")))
  }

  @Test fun lowercaseBoundaryResolvesTheSameFoldAndRejectsTheSameGap() {
    val fold = LocalDateTime.parse("2026-11-01T01:30:00")
    for (later in listOf(false, true)) {
      assertEquals(ReminderPolicy.resolveBoundary(fold, "America/New_York", later),
        ReminderPolicy.resolveBoundary(fold, "america/new_york", later))
    }
    assertThrows(IllegalArgumentException::class.java) {
      ReminderPolicy.resolveBoundary(LocalDateTime.parse("2026-03-08T02:30:00"), "america/new_york", false)
    }
  }

  @Test fun utcRejectsOffsetsMissingMillisecondsAndImpossibleDates() {
    for (value in listOf("2026-10-23T04:00:00Z", "2026-10-23T12:00:00.000+08:00",
      "2026-02-30T04:00:00.000Z", "1999-10-23T04:00:00.000Z", "2026-10-23T04:00:60.000Z")) {
      assertThrows(Exception::class.java) { ReminderPolicy.instant(value) }
    }
  }

  @Test fun futureCallbacksDoNotRing() {
    assertEquals(ClaimKind.FUTURE, ReminderPolicy.evaluate(at, "2026-10-23T03:59:59.999Z", null).kind)
  }

  @Test fun exactDueInstantRings() {
    assertEquals(ClaimKind.RING, ReminderPolicy.evaluate(at, at, null).kind)
  }

  @Test fun fifteenMinuteGraceIsInclusive() {
    assertEquals(ClaimKind.RING, ReminderPolicy.evaluate(at, "2026-10-23T04:15:00.000Z", null).kind)
    assertEquals(ClaimKind.MISSED, ReminderPolicy.evaluate(at, "2026-10-23T04:15:00.001Z", null).kind)
  }

  @Test fun missedPolicyTakesPrecedenceOverQuietReschedule() {
    assertEquals(ClaimKind.MISSED, ReminderPolicy.evaluate("2026-10-23T14:00:00.000Z",
      "2026-10-23T15:00:00.000Z", QuietHours("Asia/Manila", "22:00", "07:00")).kind)
  }

  @Test fun overnightQuietUsesGlobalTimezone() {
    val now = "2026-10-23T15:00:00.000Z"
    assertEquals(ReminderTimeDecision(ClaimKind.QUIET, "2026-10-23T23:00:00.000Z"),
      ReminderPolicy.evaluate(now, now, QuietHours("Asia/Manila", "22:00", "07:00")))
  }

  @Test fun morningHalfOfOvernightQuietUsesPreviousStartDate() {
    val now = "2026-10-23T22:59:00.000Z"
    assertEquals("2026-10-23T23:00:00.000Z", ReminderPolicy.evaluate(now, now,
      QuietHours("Asia/Manila", "22:00", "07:00")).nextAtUtc)
  }

  @Test fun quietStartInclusiveEndExclusive() {
    val hours = QuietHours("UTC", "08:00", "09:00")
    val start = "2026-10-23T08:00:00.000Z"
    val end = "2026-10-23T09:00:00.000Z"
    assertEquals(ClaimKind.QUIET, ReminderPolicy.evaluate(start, start, hours).kind)
    assertEquals(ClaimKind.RING, ReminderPolicy.evaluate(end, end, hours).kind)
  }

  @Test fun quietHoursRejectInvalidAndEqualBoundaries() {
    for (hours in listOf(QuietHours("UTC", "7:00", "09:00"), QuietHours("UTC", "09:00", "09:00"))) {
      assertThrows(IllegalArgumentException::class.java) { ReminderPolicy.evaluate(at, at, hours) }
    }
  }

  @Test fun nonexistentQuietBoundaryIsRejectedWithoutSilentShift() {
    val now = "2026-03-08T06:30:00.000Z"
    assertThrows(IllegalArgumentException::class.java) {
      ReminderPolicy.evaluate(now, now, QuietHours("America/New_York", "22:00", "02:30"))
    }
  }

  @Test fun repeatedQuietEndUsesLaterFoldEvenAfterEarlierLocalClockEnd() {
    val now = "2026-11-01T05:45:00.000Z"
    assertEquals("2026-11-01T06:30:00.000Z", ReminderPolicy.evaluate(now, now,
      QuietHours("America/New_York", "22:00", "01:30")).nextAtUtc)
  }

  @Test fun foldBoundaryChoiceIsExplicit() {
    val local = LocalDateTime.parse("2026-11-01T01:30:00")
    assertEquals("2026-11-01T05:30:00.000Z", ReminderPolicy.format(
      ReminderPolicy.resolveBoundary(local, "America/New_York", false)))
    assertEquals("2026-11-01T06:30:00.000Z", ReminderPolicy.format(
      ReminderPolicy.resolveBoundary(local, "America/New_York", true)))
  }

  @Test fun snoozeAcceptsWholeMinutesWithinBoundsAndCrossesDate() {
    assertEquals("2026-10-24T00:09:00.000Z", ReminderPolicy.snoozeAt("2026-10-23T23:59:00.000Z", 10))
    assertEquals("2026-10-23T06:00:00.000Z", ReminderPolicy.snoozeAt(at, 120))
    for (minutes in listOf(-1, 0, 121)) {
      assertThrows(IllegalArgumentException::class.java) { ReminderPolicy.snoozeAt(at, minutes) }
    }
  }

  @Test fun ringingDeadlineIsExactlySixtySeconds() {
    assertEquals("2026-10-23T04:01:00.000Z", ReminderPolicy.ringingDeadline(at))
  }

  @Test fun invalidIdentitiesCannotReachSql() {
    for (identity in listOf(ReminderIdentity("", "key", 1), ReminderIdentity("job", " key", 1),
      ReminderIdentity("job\n", "key", 1), ReminderIdentity("job", "key", -1), ReminderIdentity("job", "key", 0))) {
      assertThrows(IllegalArgumentException::class.java) { ReminderPolicy.validateIdentity(identity) }
    }
  }
}
