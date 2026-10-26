package com.lafina.capstone.reminders

import org.junit.Assert.*
import org.junit.Test

class ReminderPresentationTest {
  private val first = ReminderIdentity("first", "occurrence", 1)
  private val second = ReminderIdentity("second", "occurrence", 1)

  @Test fun anotherReminderRejectsOldAsyncActionAndLoadResults() {
    val presentation = ReminderPresentation()
    val oldLoad = presentation.replace(first)
    val oldAction = presentation.ticket()
    val next = presentation.replace(second)
    assertFalse(presentation.accepts(oldLoad))
    assertFalse(presentation.accepts(oldAction))
    assertTrue(presentation.accepts(next))
  }

  @Test fun reopeningTheSameDurableIdentityStillRejectsAnOlderViewCallback() {
    val presentation = ReminderPresentation()
    val old = presentation.replace(first)
    val reopened = presentation.replace(first)
    assertEquals(old.identity, reopened.identity)
    assertFalse(presentation.accepts(old))
    assertTrue(presentation.accepts(reopened))
  }

  @Test fun acknowledgedScreenInvalidatesQueuedRingingTimeoutWithoutChangingIdentity() {
    val presentation = ReminderPresentation()
    val ringingTimeout = presentation.replace(first)
    val answered = presentation.invalidate()
    assertEquals(first, answered.identity)
    assertFalse(presentation.accepts(ringingTimeout))
    assertTrue(presentation.accepts(answered))
  }

  @Test fun delayedErrorCloseCannotCloseANewerPresentation() {
    val presentation = ReminderPresentation()
    presentation.replace(first)
    val errorClose = presentation.invalidate()
    val newIntent = presentation.replace(second)
    assertFalse(presentation.accepts(errorClose))
    assertTrue(presentation.accepts(newIntent))
  }

  @Test fun returningToAnOldIdentityCannotReviveItsRetiredTicket() {
    val presentation = ReminderPresentation()
    val old = presentation.replace(first)
    presentation.replace(second)
    val returned = presentation.replace(first)
    assertFalse(presentation.accepts(old))
    assertTrue(returned.epoch > old.epoch)
    assertTrue(presentation.accepts(returned))
  }
}
