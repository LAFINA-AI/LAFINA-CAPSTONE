package com.lafina.capstone.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderIdentityKeyTest {
  @Test fun `all callback dimensions change identity without hashes`() {
    val initial = ReminderIdentity("task/Aa", "2026-10-23T08:00:00.000Z", 1)
    val key = ReminderIdentityKey.value("com.lafina.capstone", initial, "due")
    assertEquals(key, ReminderIdentityKey.value("com.lafina.capstone", initial, "due"))
    assertNotEquals(key, ReminderIdentityKey.value("com.lafina.capstone", initial.copy(jobId = "task/BB"), "due"))
    assertNotEquals(key, ReminderIdentityKey.value("com.lafina.capstone", initial.copy(generation = 2), "due"))
    assertNotEquals(key, ReminderIdentityKey.value("com.lafina.capstone", initial.copy(occurrenceKey = "next"), "due"))
    assertNotEquals(key, ReminderIdentityKey.value("com.lafina.capstone", initial, "timeout"))
    assertNotEquals(key, ReminderIdentityKey.value("com.lafina.capstone.debug", initial, "due"))
  }

  @Test fun `path separators unicode plus and spaces remain distinct`() {
    val left = ReminderIdentity("a/b", "c", 1)
    val right = ReminderIdentity("a", "b/c", 1)
    assertNotEquals(ReminderIdentityKey.value("app", left, "ack"), ReminderIdentityKey.value("app", right, "ack"))
    val encoded = ReminderIdentityKey.value("app", ReminderIdentity("学 +", "one/two", 1), "open")
    assertTrue(encoded.contains("%E5%AD%A6%20%2B"))
    assertTrue(encoded.contains("one%2Ftwo"))
  }

  @Test(expected = IllegalArgumentException::class)
  fun `unknown callback is rejected`() {
    ReminderIdentityKey.value("app", ReminderIdentity("a", "b", 1), "sql")
  }
}
