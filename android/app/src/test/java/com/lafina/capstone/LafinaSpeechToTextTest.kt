package com.lafina.capstone

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.math.sqrt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LafinaSpeechToTextTest {

  @Test
  fun `speech to text module class exists and matches registration contract`() {
    assertNotNull(LafinaSpeechToTextModule::class.java)
    val moduleMethods = LafinaSpeechToTextModule::class.java.declaredMethods.map { it.name }
    assertTrue(moduleMethods.contains("startListening"))
    assertTrue(moduleMethods.contains("stopListening"))
    assertTrue(moduleMethods.contains("cancelListening"))
    assertTrue(moduleMethods.contains("transcribe"))
    assertTrue(moduleMethods.contains("isAvailable"))
    assertTrue(moduleMethods.contains("release"))
  }

  @Test
  fun `whisper bridge specifies standard student speech model asset`() {
    assertEquals("models/ggml-base.en-q5_1.bin", LafinaWhisperBridge.MODEL_ASSET)
    val bridgeMethods = LafinaWhisperBridge::class.java.declaredMethods.map { it.name }
    assertTrue(bridgeMethods.contains("initContext"))
    assertTrue(bridgeMethods.contains("transcribe"))
    assertTrue(bridgeMethods.contains("freeContext"))
  }

  @Test
  fun `inactivity unload timeout is 60 seconds to conserve battery and memory`() {
    val timeoutField = LafinaSpeechToTextModule::class.java.declaredFields.find {
      it.name.contains("INACTIVITY_UNLOAD_TIMEOUT_MS")
    }
    assertNotNull(timeoutField)
    timeoutField?.isAccessible = true
    val timeoutValue = timeoutField?.get(null) as? Long
    assertEquals(60_000L, timeoutValue)
  }

  @Test
  fun `silero vad v5 processor builds 576-sample window with 64-sample rolling context`() {
    assertEquals(64, SileroVadProcessor.CONTEXT_SIZE)
    assertEquals(512, SileroVadProcessor.FRAME_SIZE)
    assertEquals(576, SileroVadProcessor.INPUT_WINDOW_SIZE)

    val context = FloatArray(SileroVadProcessor.CONTEXT_SIZE)
    val firstFrame = FloatArray(SileroVadProcessor.FRAME_SIZE) { index -> (index + 1).toFloat() }
    val window1 = SileroVadProcessor.buildContextualInputWindow(context, firstFrame)
    assertEquals(576, window1.size)
    // First 64 samples are zero-initialized context
    for (i in 0 until 64) {
      assertEquals(0f, window1[i], 1e-6f)
    }
    assertEquals(1f, window1[64], 1e-6f)
    assertEquals(512f, window1[575], 1e-6f)

    // Update rolling context from firstFrame and verify second window prepends last 64 samples (449..512)
    SileroVadProcessor.updateRollingContext(context, firstFrame)
    assertEquals(449f, context[0], 1e-6f)
    assertEquals(512f, context[63], 1e-6f)

    val secondFrame = FloatArray(SileroVadProcessor.FRAME_SIZE) { -1f }
    val window2 = SileroVadProcessor.buildContextualInputWindow(context, secondFrame)
    assertEquals(449f, window2[0], 1e-6f)
    assertEquals(512f, window2[63], 1e-6f)
    assertEquals(-1f, window2[64], 1e-6f)
    assertEquals(-1f, window2[575], 1e-6f)
  }

  @Test
  fun `prepareSamplesForWhisper strips DC offset and sub-80Hz rumble while boosting voice band`() {
    val sampleRate = 16_000
    val samples = FloatArray(sampleRate) { index ->
      val t = index.toDouble() / sampleRate
      // 0.25 DC offset + quiet 0.02 amplitude 300 Hz speech fundamental
      0.25f + (0.02 * sin(2.0 * PI * 300.0 * t)).toFloat()
    }

    val prepared = LafinaSpeechToTextModule.prepareSamplesForWhisper(samples)
    assertEquals(sampleRate, prepared.size)

    // After settling past the first 500 samples, mean should be near 0 (DC removed)
    var settledSum = 0.0
    var settledSqSum = 0.0
    val settledCount = sampleRate - 500
    for (i in 500 until sampleRate) {
      settledSum += prepared[i]
      settledSqSum += prepared[i] * prepared[i]
      assertTrue("Sample must stay within [-1, 1]", abs(prepared[i]) <= 1.0f)
    }
    val settledMean = settledSum / settledCount
    val settledRms = sqrt(settledSqSum / settledCount)
    assertEquals(0.0, settledMean, 0.005)
    // Quiet 0.02 peak (0.0141 RMS) should be boosted significantly toward 0.10 target RMS
    assertTrue("Expected boosted RMS > 0.07, got $settledRms", settledRms > 0.07)
  }

  @Test
  fun `softLimitSample preserves linear region and smoothly compresses peaks without hard clipping`() {
    assertEquals(0.5f, LafinaSpeechToTextModule.softLimitSample(0.5f), 1e-6f)
    assertEquals(-0.85f, LafinaSpeechToTextModule.softLimitSample(-0.85f), 1e-6f)

    val loud1 = LafinaSpeechToTextModule.softLimitSample(1.2f)
    val loud2 = LafinaSpeechToTextModule.softLimitSample(2.0f)
    assertTrue(loud1 > 0.85f && loud1 < 1.0f)
    assertTrue(loud2 > loud1 && loud2 <= 1.0f)
  }

  @Test
  fun `accent and noise resilience constants are configured`() {
    fun getFieldValue(name: String): Any? {
      val field = LafinaSpeechToTextModule::class.java.declaredFields.find { it.name == name }
      assertNotNull("Expected field $name", field)
      field?.isAccessible = true
      return field?.get(null)
    }

    assertEquals(360, getFieldValue("WHISPER_SPEECH_MARGIN_MS"))
    assertEquals(5_760, getFieldValue("PRE_ROLL_SAMPLES"))
    assertEquals(650, getFieldValue("CALL_COMMAND_SILENCE_AFTER_SPEECH_MS"))
    assertEquals(1_350, getFieldValue("MAIN_SILENCE_AFTER_SPEECH_MS"))
    assertEquals(0.12f, getFieldValue("VAD_ENERGY_ASSIST_START_MIN_PROB"))
    assertEquals(0.08f, getFieldValue("VAD_ENERGY_ASSIST_CONTINUE_MIN_PROB"))
  }
}
