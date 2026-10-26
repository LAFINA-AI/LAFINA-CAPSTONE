package com.lafina.capstone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LafinaIntentExtractorTest {

  @Test
  fun `intent extractor module class exists and matches native contract`() {
    assertNotNull(LafinaIntentExtractorModule::class.java)
    val moduleMethods = LafinaIntentExtractorModule::class.java.declaredMethods.map { it.name }
    assertTrue(moduleMethods.contains("extractIntent"))
    assertTrue(moduleMethods.contains("isModelAvailable"))
    assertTrue(moduleMethods.contains("unloadModel"))
  }

  @Test
  fun `llama bridge specifies native model inference methods`() {
    assertNotNull(LafinaLlamaBridge::class.java)
    val bridgeMethods = LafinaLlamaBridge::class.java.declaredMethods.map { it.name }
    assertTrue(bridgeMethods.contains("initModel"))
    assertTrue(bridgeMethods.contains("generate"))
    assertTrue(bridgeMethods.contains("freeModel"))
    assertTrue(bridgeMethods.contains("isLoaded"))
  }

  @Test
  fun `inactivity unload timeout is 60 seconds to protect device RAM`() {
    val timeoutField = LafinaIntentExtractorModule::class.java.declaredFields.find {
      it.name.contains("IDLE_UNLOAD_TIMEOUT_MS")
    }
    assertNotNull(timeoutField)
    timeoutField?.isAccessible = true
    val timeoutValue = timeoutField?.get(null) as? Long
    assertEquals(60_000L, timeoutValue)
  }
}
