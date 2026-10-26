package com.lafina.capstone.voice

import org.junit.Assert.*
import org.junit.Test

class SpeechInputPolicyTest {
  @Test fun requestIdentitiesRejectEmptyUnboundedWhitespaceAndLegacyColonIds() {
    assertTrue(SpeechInputPolicy.validSessionId("hold_abc-012"))
    assertTrue(SpeechInputPolicy.validSessionId("a".repeat(80)))
    for (value in listOf("", "a".repeat(81), "with spaces", "reminder:one", "é")) assertFalse(SpeechInputPolicy.validSessionId(value))
  }

  @Test fun languageAndEngineSelectionAreExplicitAndBounded() {
    assertTrue(SpeechInputPolicy.validLanguage("en-US"))
    assertTrue(SpeechInputPolicy.validLanguage("fil-PH"))
    for (value in listOf("en", "tl", "en-us", "", "fr-FR")) assertFalse(SpeechInputPolicy.validLanguage(value))
    for (value in listOf("auto", "android", "whisper")) assertTrue(SpeechInputPolicy.validEngine(value))
    for (value in listOf("cloud", "Android", "")) assertFalse(SpeechInputPolicy.validEngine(value))
  }

  @Test fun api30CannotSelectPlatformRecognizerEvenIfCapabilityIsMisreported() {
    assertNull(SpeechInputPolicy.selectEngine(30, true, false, "auto"))
    assertNull(SpeechInputPolicy.selectEngine(30, true, true, "android"))
    assertEquals("whisper", SpeechInputPolicy.selectEngine(30, true, true, "auto"))
  }

  @Test fun automaticSelectionPrefersAdvertisedOnDeviceThenReviewedFallback() {
    assertEquals("android", SpeechInputPolicy.selectEngine(31, true, true, "auto"))
    assertEquals("whisper", SpeechInputPolicy.selectEngine(37, false, true, "auto"))
    assertNull(SpeechInputPolicy.selectEngine(37, false, false, "auto"))
  }

  @Test fun explicitEngineDoesNotSilentlySubstituteAnotherEngine() {
    assertNull(SpeechInputPolicy.selectEngine(37, true, false, "whisper"))
    assertNull(SpeechInputPolicy.selectEngine(37, false, true, "android"))
    assertNull(SpeechInputPolicy.selectEngine(37, true, true, "online"))
    assertEquals("whisper", SpeechInputPolicy.selectEngine(37, true, true, "whisper"))
  }

  @Test fun missingLocalLanguageChangesOnlyTheNextExplicitAutomaticHold() {
    assertEquals("whisper", SpeechInputPolicy.selectEngine(37, true, true, "auto", androidFailed = true))
    assertNull(SpeechInputPolicy.selectEngine(37, true, false, "auto", androidFailed = true))
    assertEquals("android", SpeechInputPolicy.selectEngine(37, true, true, "android", androidFailed = true))
  }

  @Test fun transcriptRemainsTextAndRejectsEmptyOrOversizeOutput() {
    assertEquals("Schedule a class tomorrow.", SpeechInputPolicy.transcript(" \n Schedule a\tclass tomorrow.  "))
    assertEquals("delete all tasks", SpeechInputPolicy.transcript("delete all tasks"))
    assertNull(SpeechInputPolicy.transcript(" \n\t"))
    assertNull(SpeechInputPolicy.transcript("a".repeat(2_001)))
    assertEquals(2_000, SpeechInputPolicy.transcript("a".repeat(2_000))!!.length)
  }

  @Test fun silenceAndMalformedPcmAreRefusedWithoutClaimingSpeechDetection() {
    assertFalse(SpeechInputPolicy.hasAudioSignal(FloatArray(16_000)))
    assertFalse(SpeechInputPolicy.hasAudioSignal(FloatArray(1_599) { 0.1f }))
    assertFalse(SpeechInputPolicy.hasAudioSignal(FloatArray(240_001) { 0.1f }))
    assertFalse(SpeechInputPolicy.hasAudioSignal(FloatArray(1_600) { Float.NaN }))
    assertFalse(SpeechInputPolicy.hasAudioSignal(FloatArray(1_600) { 2f }))
    assertTrue(SpeechInputPolicy.hasAudioSignal(FloatArray(1_600) { 0.1f }))
    assertTrue(SpeechInputPolicy.hasAudioSignal(FloatArray(240_000) { -0.1f }))
  }

  @Test fun stopUnblockingAReadIsNotAnAudioFailure() {
    for (read in listOf(0, -3, -6)) {
      assertEquals(CaptureReadOutcome.FINISHED, SpeechInputPolicy.readOutcome(read, holding = false, cancelled = false))
      assertEquals(CaptureReadOutcome.FINISHED, SpeechInputPolicy.readOutcome(read, holding = true, cancelled = true))
    }
  }

  @Test fun zeroAndErrorReadsWhileStillHoldingFailRatherThanSpin() {
    for (read in listOf(0, -3, -6)) {
      assertEquals(CaptureReadOutcome.ERROR, SpeechInputPolicy.readOutcome(read, holding = true, cancelled = false))
    }
  }

  @Test fun lastPositiveReadIsRetainedWhenReleaseRacesTheReadReturn() {
    assertEquals(CaptureReadOutcome.DATA, SpeechInputPolicy.readOutcome(1024, holding = false, cancelled = false))
    assertEquals(CaptureReadOutcome.DATA, SpeechInputPolicy.readOutcome(1, holding = true, cancelled = false))
  }

  @Test fun activeSessionRejectsSecondCaptureAndLateCallbacks() {
    val sessions = SpeechInputSessions()
    val first = sessions.begin("first", "android", 10)!!
    assertNull(sessions.begin("second", "whisper", 20))
    assertFalse(sessions.recording(first.token + 1))
    assertEquals(InputPhase.PREPARING, first.phase)
    assertTrue(sessions.recording(first.token))
    assertFalse(sessions.recording(first.token))
    assertTrue(sessions.transcribing(first.token))
    assertFalse(sessions.transcribing(first.token))
    assertFalse(sessions.recording(first.token))
    assertEquals(first, sessions.finish(first.token))
    assertFalse(sessions.current(first.token))
    assertNull(sessions.finish(first.token))
  }

  @Test fun earlyReleaseInvalidatesPreparingIdentityWithoutStartingCapture() {
    val sessions = SpeechInputSessions()
    val first = sessions.begin("early", "android", 10)!!
    assertFalse(sessions.transcribing(first.token))
    sessions.finish(first.token)
    val second = sessions.begin("new", "whisper", 20)!!
    assertFalse(sessions.recording(first.token))
    assertNull(sessions.finish(first.token))
    assertTrue(sessions.recording(second.token))
    assertEquals(second, sessions.active)
  }

  @Test fun duplicateStartIsIdempotentlyRejectedAfterTerminalState() {
    val sessions = SpeechInputSessions()
    val first = sessions.begin("same", "whisper", 10)!!
    sessions.finish(first.token)
    assertTrue(sessions.hasSeen("same"))
    assertNull(sessions.begin("same", "whisper", 20))
  }

  @Test fun boundedReplayGuardDoesNotReuseGenerationTokens() {
    val sessions = SpeechInputSessions()
    val first = sessions.begin("old", "whisper", 0)!!
    sessions.finish(first.token)
    for (index in 1..SpeechInputPolicy.MAX_SEEN) {
      val ticket = sessions.begin("id_$index", "android", index.toLong())!!
      sessions.finish(ticket.token)
    }
    assertFalse(sessions.hasSeen("old"))
    val reused = sessions.begin("old", "whisper", 999)!!
    assertTrue(reused.token > first.token)
    assertFalse(sessions.current(first.token))
  }
}
