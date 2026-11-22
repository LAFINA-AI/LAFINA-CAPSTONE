package com.lafina.capstone

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlertPreferencesContractTest {

  @Test
  fun bundledToneLookupMatchesPackageRawUri() {
    val uri = AlertPreferencesContract.bundledToneUri("com.lafina.capstone.debug", "lafina_tone_chime")
    assertEquals("android.resource://com.lafina.capstone.debug/raw/lafina_tone_chime", uri)
    val found = AlertPreferencesContract.findBundledToneByUri(uri)
    assertEquals("chime", found?.id)
    assertEquals("Academic Bell", found?.label)
    assertNull(AlertPreferencesContract.findBundledToneByUri("content://media/internal/audio/media/42"))
    assertNull(AlertPreferencesContract.findBundledToneByUri("android.resource://com.lafina.capstone/raw/unknown"))
  }

  @Test
  fun sanitizeToneUriAcceptsSafeSchemesAndRejectsUnsafeInputs() {
    assertNull(AlertPreferencesContract.sanitizeToneUri(null))
    assertNull(AlertPreferencesContract.sanitizeToneUri("   "))
    assertEquals("silent", AlertPreferencesContract.sanitizeToneUri(" silent "))
    assertEquals(
      "android.resource://com.lafina.capstone/raw/lafina_tone_gentle",
      AlertPreferencesContract.sanitizeToneUri("android.resource://com.lafina.capstone/raw/lafina_tone_gentle"),
    )
    assertEquals(
      "content://settings/system/alarm_alert",
      AlertPreferencesContract.sanitizeToneUri("content://settings/system/alarm_alert"),
    )
    assertNull(AlertPreferencesContract.sanitizeToneUri("file:///sdcard/tone.mp3"))
    assertNull(AlertPreferencesContract.sanitizeToneUri("https://example.com/a.wav"))
    assertNull(AlertPreferencesContract.sanitizeToneUri("content://ok\nnewline"))
    assertNull(AlertPreferencesContract.sanitizeToneUri("content://" + "a".repeat(600)))
  }

  @Test
  fun vibrationWaveformsMapExpectedPatterns() {
    assertNull(AlertPreferencesContract.alarmWaveform("off"))
    assertNull(AlertPreferencesContract.callWaveform("off"))
    assertNull(AlertPreferencesContract.notifyWaveform("off"))

    assertArrayEquals(longArrayOf(0L, 350L, 900L), AlertPreferencesContract.alarmWaveform("gentle"))
    assertArrayEquals(longArrayOf(0L, 800L, 800L), AlertPreferencesContract.alarmWaveform("standard"))
    assertArrayEquals(
      longArrayOf(0L, 300L, 200L, 300L, 200L, 500L, 600L),
      AlertPreferencesContract.alarmWaveform("urgent"),
    )
    assertArrayEquals(longArrayOf(0L, 800L, 800L), AlertPreferencesContract.alarmWaveform("invalid"))

    assertArrayEquals(longArrayOf(0L, 180L), AlertPreferencesContract.notifyWaveform("gentle"))
    assertArrayEquals(longArrayOf(0L, 1000L, 1000L, 1000L, 1000L), AlertPreferencesContract.callWaveform("standard"))
  }

  @Test
  fun dynamicChannelIdsAreDeterministicAndDifferWhenConfigChanges() {
    val baseNotify = AlertPreferencesContract.notifyChannelId(null, true, "standard", "hide_task")
    val sameNotify = AlertPreferencesContract.notifyChannelId(null, true, "standard", "hide_task")
    val differentSound = AlertPreferencesContract.notifyChannelId(
      "android.resource://com.lafina.capstone/raw/lafina_tone_chime",
      true,
      "standard",
      "hide_task",
    )
    val silentNotify = AlertPreferencesContract.notifyChannelId("silent", true, "standard", "hide_task")
    val publicNotify = AlertPreferencesContract.notifyChannelId(null, true, "standard", "show")
    val noVibNotify = AlertPreferencesContract.notifyChannelId(null, false, "standard", "hide_task")

    assertEquals(baseNotify, sameNotify)
    assertTrue(AlertPreferencesContract.isDynamicNotifyChannel(baseNotify))
    assertFalse(AlertPreferencesContract.isDynamicNotifyChannel("lafina_reminder_notifications_v1"))
    assertNotEquals(baseNotify, differentSound)
    assertNotEquals(baseNotify, silentNotify)
    assertNotEquals(baseNotify, publicNotify)
    assertNotEquals(baseNotify, noVibNotify)

    val baseCall = AlertPreferencesContract.callChannelId(null, true, "standard")
    val urgentCall = AlertPreferencesContract.callChannelId(null, true, "urgent")
    val ringCall = AlertPreferencesContract.callChannelId(
      "android.resource://com.lafina.capstone/raw/lafina_tone_classic_ring",
      true,
      "standard",
    )
    assertTrue(AlertPreferencesContract.isDynamicCallChannel(baseCall))
    assertFalse(AlertPreferencesContract.isDynamicCallChannel("lafina_incoming_calls_v2"))
    assertNotEquals(baseCall, urgentCall)
    assertNotEquals(baseCall, ringCall)
  }

  @Test
  fun clampingRejectsUnsupportedValues() {
    assertEquals(0, AlertPreferencesContract.clampRampSeconds(0))
    assertEquals(15, AlertPreferencesContract.clampRampSeconds(15))
    assertEquals(60, AlertPreferencesContract.clampRampSeconds(60))
    assertEquals(30, AlertPreferencesContract.clampRampSeconds(25))

    assertEquals(30, AlertPreferencesContract.clampRingTimeoutSec(30))
    assertEquals(45, AlertPreferencesContract.clampRingTimeoutSec(45))
    assertEquals(60, AlertPreferencesContract.clampRingTimeoutSec(60))
    assertEquals(45, AlertPreferencesContract.clampRingTimeoutSec(90))

    assertEquals(5, AlertPreferencesContract.clampSnoozeMinutes(5))
    assertEquals(15, AlertPreferencesContract.clampSnoozeMinutes(15))
    assertEquals(30, AlertPreferencesContract.clampSnoozeMinutes(30))
    assertEquals(10, AlertPreferencesContract.clampSnoozeMinutes(12))
  }

  @Test
  fun quietHoursHandlesOvernightAndSameDayWindows() {
    assertTrue(AlertPreferencesContract.isWithinQuietHours(23, 0, "23:00", "07:00"))
    assertTrue(AlertPreferencesContract.isWithinQuietHours(23, 59, "23:00", "07:00"))
    assertTrue(AlertPreferencesContract.isWithinQuietHours(0, 0, "23:00", "07:00"))
    assertTrue(AlertPreferencesContract.isWithinQuietHours(6, 59, "23:00", "07:00"))
    assertFalse(AlertPreferencesContract.isWithinQuietHours(7, 0, "23:00", "07:00"))
    assertFalse(AlertPreferencesContract.isWithinQuietHours(14, 30, "23:00", "07:00"))
    assertFalse(AlertPreferencesContract.isWithinQuietHours(22, 59, "23:00", "07:00"))

    assertTrue(AlertPreferencesContract.isWithinQuietHours(1, 0, "01:00", "06:00"))
    assertTrue(AlertPreferencesContract.isWithinQuietHours(5, 59, "01:00", "06:00"))
    assertFalse(AlertPreferencesContract.isWithinQuietHours(0, 59, "01:00", "06:00"))
    assertFalse(AlertPreferencesContract.isWithinQuietHours(6, 0, "01:00", "06:00"))

    assertFalse(AlertPreferencesContract.isWithinQuietHours(23, 0, "23:00", "23:00"))
    assertFalse(AlertPreferencesContract.isWithinQuietHours(23, 0, "bad", "07:00"))
  }
}
