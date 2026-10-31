package com.lafina.capstone.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

class ReminderResponsePolicyTest {
  @Test fun explicitAcknowledgementAcceptsOnlyTheWholeCommand() {
    for (text in listOf("acknowledge", "acknowledge reminder", "acknowledge this reminder",
      "  ACKNOWLEDGE   THIS REMINDER  ", "Acknowledge!", "acknowledge?", "acknowledge.")) {
      assertEquals(text, ReminderResponseCommand(ReminderAction.ACK), ReminderResponsePolicy.parse(text))
    }
  }

  @Test fun snoozeIsBoundedAndSupportsReviewedSpokenDurations() {
    assertEquals(ReminderResponseCommand(ReminderAction.SNOOZE, 10), ReminderResponsePolicy.parse("snooze"))
    for ((text, minutes) in mapOf("snooze 1 minute" to 1, "snooze for 120 minutes" to 120,
      "snooze one minute" to 1, "snooze for two minutes" to 2, "snooze five minutes" to 5,
      "snooze for ten minutes" to 10, "snooze fifteen minutes" to 15,
      "SNOOZE FOR THIRTY MINUTES!" to 30, "snooze sixty minutes." to 60)) {
      assertEquals(text, ReminderResponseCommand(ReminderAction.SNOOZE, minutes), ReminderResponsePolicy.parse(text))
    }
  }

  @Test fun ambiguityNegationAndSourceMutationsAreRefused() {
    for (text in listOf("", " ", "okay", "okay but remind me later", "done", "complete task",
      "delete task", "acknowledge and snooze", "don't acknowledge", "do not snooze",
      "acknowledge not", "please acknowledge", "acknowledge another reminder",
      "snooze tomorrow", "remind me later", "snooze 10 minutes and acknowledge",
      "acknowledge; snooze", "acknowledge!!", "acknowledge .", "snooze this reminder")) {
      assertNull(text, ReminderResponsePolicy.parse(text))
    }
  }

  @Test fun malformedAndUnsafeDurationsAreRefused() {
    for (text in listOf("snooze 0 minutes", "snooze 121 minutes", "snooze -1 minutes",
      "snooze +10 minutes", "snooze 1.5 minutes", "snooze 01 minutes",
      "snooze 999999999999999999999 minutes", "snooze 10", "snooze ten min",
      "snooze twenty minutes", "snooze 10 hours", "snooze NaN minutes")) {
      assertNull(text, ReminderResponsePolicy.parse(text))
    }
  }

  @Test fun hiddenTextAndOversizedInputsCannotBecomeCommandsThroughNormalization() {
    for (text in listOf("acknowledge\nsnooze", "acknowledge\n", "\tacknowledge",
      "acknowledge\r", "acknowledge\u0000", "acknowledge\u200b", "acknowledge\u202e",
      "acknowledge\u2028", "acknowledge\u2029", "\u00a0acknowledge", "acknowledge" + " ".repeat(2000))) {
      assertNull(text, ReminderResponsePolicy.parse(text))
    }
  }

  @Test fun parsingDoesNotDependOnDefaultLocale() {
    val previous = Locale.getDefault()
    try {
      Locale.setDefault(Locale.forLanguageTag("tr-TR"))
      assertEquals(ReminderResponseCommand(ReminderAction.ACK), ReminderResponsePolicy.parse("ACKNOWLEDGE THIS REMINDER"))
      assertEquals(ReminderResponseCommand(ReminderAction.SNOOZE, 15), ReminderResponsePolicy.parse("SNOOZE FIFTEEN MINUTES"))
    } finally { Locale.setDefault(previous) }
  }

  @Test fun reviewsDiscloseTaskSeparationAndRejectUnsupportedConstructedCommands() {
    assertTrue(ReminderResponsePolicy.review(ReminderResponseCommand(ReminderAction.ACK)).contains("task stays open"))
    assertTrue(ReminderResponsePolicy.review(ReminderResponseCommand(ReminderAction.SNOOZE, 1)).contains("1 minute."))
    assertTrue(ReminderResponsePolicy.review(ReminderResponseCommand(ReminderAction.SNOOZE, 120)).contains("120 minutes."))
    assertThrows(IllegalArgumentException::class.java) {
      ReminderResponsePolicy.review(ReminderResponseCommand(ReminderAction.CANCEL))
    }
    assertThrows(IllegalArgumentException::class.java) {
      ReminderResponsePolicy.review(ReminderResponseCommand(ReminderAction.SNOOZE, 0))
    }
    assertThrows(IllegalArgumentException::class.java) {
      ReminderResponsePolicy.review(ReminderResponseCommand(ReminderAction.SNOOZE, 121))
    }
  }

  @Test fun repeatedInterpretationAlwaysReturnsTheSameProposal() {
    for (text in listOf("acknowledge", "snooze for fifteen minutes", "okay but remind me later")) {
      val expected = ReminderResponsePolicy.parse(text)
      repeat(100) { assertEquals(expected, ReminderResponsePolicy.parse(text)) }
    }
  }
}
