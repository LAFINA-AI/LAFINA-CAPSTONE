package com.lafina.capstone.reminders

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmRegistrationPolicyTest {
  private val record = ReminderRecord(
    ReminderIdentity("job:neighbor", "neighbor|2026-10-23T08:00:00.000Z", 1),
    "reminder:neighbor", "Synthetic neighbor", "UTC", "neighbor", "task", 1, true,
    "2026-10-23T08:00:00.000Z", "PENDING", "SCHEDULED", 0, null, null, "REGISTERED", null,
  )
  private val registration = AlarmRegistration(record.identity, record.runAt, "EXACT", "2026-10-23T07:00:00.000Z")

  @Test fun `first process pass rebuilds even perfectly matching persisted registration`() {
    assertFalse(AlarmRegistrationPolicy().canReuse(registration, record, "EXACT"))
  }

  @Test fun `completed epoch preserves unchanged neighboring alarm across repeated callbacks`() {
    val policy = AlarmRegistrationPolicy()
    policy.completePass()
    repeat(5) { assertTrue(policy.canReuse(registration, record, "EXACT")) }
  }

  @Test fun `restart or explicit restore invalidation requires replay again`() {
    val policy = AlarmRegistrationPolicy()
    policy.completePass()
    assertTrue(policy.canReuse(registration, record, "EXACT"))
    policy.invalidate()
    assertFalse(policy.canReuse(registration, record, "EXACT"))
    assertFalse(AlarmRegistrationPolicy().canReuse(registration, record, "EXACT"))
    policy.completePass()
    assertTrue(policy.canReuse(registration, record, "EXACT"))
  }

  @Test fun `changed generation occurrence target or precision must replace cached alarm`() {
    val policy = AlarmRegistrationPolicy().apply { completePass() }
    assertFalse(policy.canReuse(registration, record.copy(identity = record.identity.copy(generation = 2)), "EXACT"))
    assertFalse(policy.canReuse(registration, record.copy(identity = record.identity.copy(occurrenceKey = "next")), "EXACT"))
    assertFalse(policy.canReuse(registration, record.copy(runAt = "2026-10-23T08:01:00.000Z"), "EXACT"))
    assertFalse(policy.canReuse(registration, record, "INEXACT"))
    assertFalse(policy.canReuse(registration.copy(precision = "INEXACT"), record, "EXACT"))
  }

  @Test fun `failed unavailable pending or invalid source cannot suppress retry`() {
    val policy = AlarmRegistrationPolicy().apply { completePass() }
    for (state in listOf("FAILED", "UNAVAILABLE", "PENDING")) {
      assertFalse(policy.canReuse(registration, record.copy(deliveryState = state), "EXACT"))
    }
    assertFalse(policy.canReuse(registration, record.copy(sourceValid = false), "EXACT"))
    assertFalse(policy.canReuse(registration, record.copy(status = "RINGING"), "EXACT"))
    assertFalse(policy.canReuse(registration, record.copy(reminderStatus = "ACKNOWLEDGED"), "EXACT"))
    assertFalse(policy.canReuse(null, record, "EXACT"))
  }

  @Test fun `incomplete restoration never establishes cache trust`() {
    val policy = AlarmRegistrationPolicy()
    // A failed pass does not call completePass; its persisted partial rows cannot prove restoration.
    assertFalse(policy.canReuse(registration, record, "EXACT"))
    policy.completePass()
    // An unrelated later failure does not erase a prior successful process restoration.
    assertTrue(policy.canReuse(registration, record, "EXACT"))
  }

  @Test fun `current epoch receipt preserves timeout instead of resetting near its deadline`() {
    val ringing = record.copy(status = "RINGING", reminderStatus = "RINGING",
      ringingDeadline = "2026-10-23T08:01:00.000Z", notifiedAt = "2026-10-23T08:00:00.000Z")
    val policy = AlarmRegistrationPolicy().apply { completePass() }
    repeat(5) { assertTrue(policy.canReuseTimeout(ringing)) }
    assertFalse(policy.canReuseTimeout(ringing.copy(notifiedAt = null)))
    assertFalse(policy.canReuseTimeout(ringing.copy(ringingDeadline = null)))
    assertFalse(policy.canReuseTimeout(ringing.copy(sourceValid = false)))
    assertFalse(policy.canReuseTimeout(ringing.copy(status = "PENDING")))
  }

  @Test fun `fresh process or explicit restoration repairs timeout even with old persisted receipt`() {
    val ringing = record.copy(status = "RINGING", reminderStatus = "RINGING",
      ringingDeadline = "2026-10-23T08:01:00.000Z", notifiedAt = "2026-10-23T08:00:00.000Z")
    val policy = AlarmRegistrationPolicy()
    assertFalse(policy.canReuseTimeout(ringing))
    policy.completePass()
    assertTrue(policy.canReuseTimeout(ringing))
    policy.invalidate()
    assertFalse(policy.canReuseTimeout(ringing))
  }
}
