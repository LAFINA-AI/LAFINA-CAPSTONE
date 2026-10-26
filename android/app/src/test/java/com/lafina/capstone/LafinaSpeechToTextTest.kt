package com.lafina.capstone

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
}
