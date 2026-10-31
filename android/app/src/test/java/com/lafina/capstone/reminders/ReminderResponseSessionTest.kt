package com.lafina.capstone.reminders

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderResponseSessionTest {
  private val now = "2026-10-27T04:00:00.000Z"
  private val deadline = "2026-10-27T04:01:00.000Z"
  private val ack = ReminderResponseCommand(ReminderAction.ACK)
  private fun record() = ReminderRecord(ReminderIdentity("job", "occurrence", 1), "reminder",
    "Synthetic reminder", "Asia/Manila", "task", "TASK", 1, true, now,
    "RINGING", "RINGING", 1, deadline, now, "DELIVERED", null)
  private fun session(record: ReminderRecord = record()) = ReminderResponseSession(record, now, 1000)

  @Test fun onlyTheLatestReviewCanSubmitOnce() {
    val session = session()
    val old = session.prepare(ack, now, 1000)!!
    val latest = session.prepare(ReminderResponseCommand(ReminderAction.SNOOZE, 5), now, 1001)!!
    assertFalse(session.consume(old, now, 1002))
    assertTrue(session.consume(latest, now, 1002))
    assertFalse(session.consume(latest, now, 1003))
    assertFalse(session.active(now, 1003))
    assertNull(session.prepare(ack, now, 1004))
  }

  @Test fun structurallyEqualButDifferentReviewCannotBeConfirmed() {
    val session = session()
    val review = session.prepare(ack, now, 1000)!!
    assertFalse(session.consume(ReminderResponseReview(ack), now, 1001))
    assertFalse(session.consume(review.copy(), now, 1001))
    assertTrue(session.consume(review, now, 1001))
  }

  @Test fun cancellationInvalidatesReviewButAllowsFreshExplicitReview() {
    val session = session()
    val review = session.prepare(ack, now, 1000)!!
    session.cancelReview()
    assertFalse(session.consume(review, now, 1001))
    assertTrue(session.active(now, 1001))
    val fresh = session.prepare(ack, now, 1002)!!
    assertTrue(session.consume(fresh, now, 1003))
  }

  @Test fun closingInvalidatesPendingAndFutureActions() {
    val session = session()
    val review = session.prepare(ack, now, 1000)!!
    session.close()
    assertFalse(session.active(now, 1001))
    assertFalse(session.consume(review, now, 1001))
    assertNull(session.prepare(ack, now, 1001))
  }

  @Test fun wallDeadlineIsExclusiveAndCannotBeResurrectedByRollback() {
    val session = session()
    val review = session.prepare(ack, now, 1000)!!
    assertTrue(session.active("2026-10-27T04:00:59.999Z", 59999))
    assertFalse(session.consume(review, deadline, 60000))
    assertFalse(session.active(now, 60001))
  }

  @Test fun monotonicDeadlineCannotBeExtendedByWallClockRollbackOrNewReview() {
    val session = session()
    assertNotNull(session.prepare(ack, "2026-10-27T03:59:59.000Z", 60999))
    assertFalse(session.active("2026-10-27T03:59:00.000Z", 61000))
    assertNull(session.prepare(ack, now, 61001))
  }

  @Test fun remainingWindowIsCappedAndNeverResetByPreparingAgain() {
    val short = session(record().copy(ringingDeadline = "2026-10-27T04:00:10.000Z"))
    assertNotNull(short.prepare(ack, now, 10999))
    assertFalse(short.active(now, 11000))
    val long = session(record().copy(ringingDeadline = "2026-10-27T04:10:00.000Z"))
    assertNotNull(long.prepare(ack, now, 60999))
    assertFalse(long.active(now, 61000))
  }

  @Test fun invalidOrTerminalSnapshotsCannotOfferReviews() {
    for (record in listOf(record().copy(sourceValid = false), record().copy(status = "ACKNOWLEDGED"),
      record().copy(reminderStatus = "PENDING"), record().copy(ringingDeadline = null),
      record().copy(ringingDeadline = "invalid"), record().copy(ringingDeadline = now),
      record().copy(ringingDeadline = "2026-10-27T03:59:59.999Z"))) {
      val session = session(record)
      assertFalse(session.active(now, 1000))
      assertNull(session.prepare(ack, now, 1000))
    }
  }

  @Test fun malformedClocksAndInvalidElapsedInputsFailClosed() {
    assertFalse(ReminderResponseSession(record(), "invalid", 1000).active(now, 1000))
    assertFalse(ReminderResponseSession(record(), now, -1).active(now, 1000))
    assertFalse(session().active("invalid", 1000))
    assertFalse(session().active(now, 999))
  }

  @Test fun resumingUsesTheRemainingBudgetRatherThanOpeningAnotherMinute() {
    val resumed = ReminderResponseSession(record(), now, 1000, maxWindowMillis = 5000)
    assertTrue(resumed.active(now, 5999))
    assertFalse(resumed.active(now, 6000))
    assertFalse(ReminderResponseSession(record(), now, 1000, maxWindowMillis = -1).active(now, 1000))
  }

  @Test fun unsafeCommandsInvalidateEarlierReviewWithoutClosingTheWindow() {
    for (unsafe in listOf(ReminderResponseCommand(ReminderAction.CANCEL), ReminderResponseCommand(ReminderAction.MISS),
      ReminderResponseCommand(ReminderAction.SNOOZE, 0), ReminderResponseCommand(ReminderAction.SNOOZE, 121))) {
      val session = session()
      val previous = session.prepare(ack, now, 1000)!!
      assertNull(session.prepare(unsafe, now, 1001))
      assertFalse(session.consume(previous, now, 1002))
      assertTrue(session.active(now, 1002))
      assertNotNull(session.prepare(ack, now, 1003))
    }
  }
}
