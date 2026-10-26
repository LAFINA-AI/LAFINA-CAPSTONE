package com.lafina.capstone.voice

import org.junit.Assert.*
import org.junit.Test

class SpeechPolicyTest {
  private val offline = SpeechVoice("offline-a", "en-US", true, true, 300, 200)

  @Test fun defaultsValidateAndSelectInstalledOfflineVoice() {
    assertEquals(offline, SpeechPolicy.select(listOf(offline), SpeechOptions()))
  }

  @Test fun networkAndUninstalledVoicesAreNeverSelectedEvenWhenPreferred() {
    val network = offline.copy(name = "network", offline = false, quality = 500)
    val missing = offline.copy(name = "missing", installed = false, quality = 500)
    assertEquals(offline, SpeechPolicy.select(listOf(network, missing, offline), SpeechOptions()))
    assertNull(SpeechPolicy.select(listOf(network, missing), SpeechOptions()))
    assertNull(SpeechPolicy.select(listOf(network, offline), SpeechOptions(voiceName = "network")))
    assertNull(SpeechPolicy.select(listOf(missing, offline), SpeechOptions(voiceName = "missing")))
  }

  @Test fun noSilentLanguageOrExplicitVoiceFallback() {
    assertNull(SpeechPolicy.select(listOf(offline.copy(languageTag = "en-GB")), SpeechOptions()))
    assertNull(SpeechPolicy.select(listOf(offline), SpeechOptions(languageTag = "fil-PH")))
    assertNull(SpeechPolicy.select(listOf(offline), SpeechOptions(voiceName = "not-installed")))
  }

  @Test fun selectionIsDeterministicByQualityLatencyThenName() {
    val a = offline.copy(name = "a", quality = 400, latency = 100)
    val b = a.copy(name = "b")
    assertEquals(a, SpeechPolicy.select(listOf(b, offline, a, a.copy(name = "slow", latency = 500)), SpeechOptions()))
    assertEquals(b, SpeechPolicy.select(listOf(a, b), SpeechOptions(voiceName = "b", languageTag = "EN-us")))
  }

  @Test fun invalidOptionsRejectInsteadOfCoercingOrClamping() {
    val invalid = listOf(SpeechOptions(rate = 0.49), SpeechOptions(rate = 2.01), SpeechOptions(pitch = Double.NaN),
      SpeechOptions(rate = Double.POSITIVE_INFINITY), SpeechOptions(pitch = 0.1), SpeechOptions(languageTag = "und"),
      SpeechOptions(languageTag = "invalid language"), SpeechOptions(languageTag = "en_US"),
      SpeechOptions(enginePackage = ""), SpeechOptions(enginePackage = "x".repeat(201)),
      SpeechOptions(voiceName = " "), SpeechOptions(voiceName = "x".repeat(513)))
    invalid.forEach { value -> assertThrows(IllegalArgumentException::class.java) { value.validate() } }
    assertEquals(0.5, SpeechOptions(rate = 0.5, pitch = 2.0).validate().rate, 0.0)
  }

  @Test fun speechInputAndOpaqueRequestIdsAreBounded() {
    assertTrue(SpeechPolicy.validRequest("reply:1-safe_2", "a".repeat(600)))
    assertFalse(SpeechPolicy.validRequest("private title with spaces", "hello"))
    assertFalse(SpeechPolicy.validRequest("id", "a".repeat(601)))
    assertFalse(SpeechPolicy.validRequest("id", " \n\t"))
    assertFalse(SpeechPolicy.validRequest("id".repeat(41), "hello"))
  }

  @Test fun reminderCannedTextIsBoundedEvenWithLongSourceTitle() {
    val text = SpeechPolicy.reminderText("a".repeat(1000))
    assertTrue(text.startsWith("Academic reminder. "))
    assertTrue(text.endsWith("Acknowledge this alert or snooze it."))
    assertTrue(text.length <= SpeechPolicy.MAX_TEXT)
  }

  @Test fun replacingAnUtteranceIgnoresOldCallbacksAndHasOnlyOneActiveTicket() {
    val tickets = SpeechTickets()
    val first = tickets.begin("first", 100)!!
    assertEquals(first, tickets.finish(first.utteranceId))
    val next = tickets.begin("next", 200)!!
    assertNull(tickets.finish(first.utteranceId))
    assertEquals(next, tickets.active)
    assertEquals(next, tickets.finish(next.utteranceId))
    assertNull(tickets.finish(next.utteranceId))
    assertNull(tickets.active)
  }

  @Test fun duplicateRequestDoesNotReplaceActiveTicket() {
    val tickets = SpeechTickets()
    val first = tickets.begin("same", 1)!!
    assertTrue(tickets.hasSeen("same"))
    assertNull(tickets.begin("same", 2))
    assertEquals(first, tickets.active)
  }

  @Test fun onStartIsOnceAndIgnoresStaleEngineCallbacks() {
    val tickets = SpeechTickets()
    val first = tickets.begin("first", 100)!!
    assertNull(tickets.start("old"))
    assertEquals(first, tickets.start(first.utteranceId))
    assertNull(tickets.start(first.utteranceId))
    tickets.finish(first.utteranceId)
    val second = tickets.begin("second", 200)!!
    assertNull(tickets.start(first.utteranceId))
    assertEquals(second, tickets.start(second.utteranceId))
  }

  @Test fun replayGuardEvictsOldRequestsAfterItsFixedBound() {
    val tickets = SpeechTickets()
    repeat(SpeechPolicy.MAX_EVENTS + 1) { index ->
      val ticket = tickets.begin("request:$index", index.toLong())!!
      tickets.finish(ticket.utteranceId)
    }
    assertFalse(tickets.hasSeen("request:0"))
    assertTrue(tickets.hasSeen("request:200"))
    assertNotNull(tickets.begin("request:0", 300))
  }

  @Test fun stopDuringInitializationInvalidatesDelayedCallbackAndAllowsExplicitRetry() {
    val initialization = SpeechInitialization()
    val slowBinding = initialization.begin()
    assertTrue(initialization.isCurrent(slowBinding))
    initialization.cancel()
    assertFalse(initialization.isCurrent(slowBinding))
    val retry = initialization.begin()
    assertFalse(initialization.isCurrent(slowBinding))
    assertTrue(initialization.isCurrent(retry))
    initialization.finish()
    assertFalse(initialization.isCurrent(retry))
  }
}
