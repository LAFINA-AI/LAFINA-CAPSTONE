package com.lafina.capstone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
    assertTrue(moduleMethods.contains("getDeviceSpecs"))
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

  @Test
  fun `resolvePromptFormat selects gemma for Gemma 3 paths or explicit gemma format and chatml otherwise`() {
    assertEquals("gemma", LafinaIntentExtractorModule.resolvePromptFormat("gemma", "/models/any.gguf"))
    assertEquals("gemma", LafinaIntentExtractorModule.resolvePromptFormat("GEMMA", "/models/any.gguf"))
    assertEquals("gemma", LafinaIntentExtractorModule.resolvePromptFormat(null, "/models/gemma-3-270m-it-Q4_K_M.gguf"))
    assertEquals("gemma", LafinaIntentExtractorModule.resolvePromptFormat("", "/models/gemma-3-1b-it-Q4_K_M.gguf"))
    assertEquals("chatml", LafinaIntentExtractorModule.resolvePromptFormat("chatml", "/models/qwen2.5-0.5b-instruct-q4_k_m.gguf"))
    assertEquals("chatml", LafinaIntentExtractorModule.resolvePromptFormat(null, "/models/SmolLM2-135M-Instruct-Q4_K_M.gguf"))
  }

  @Test
  fun `buildNluPrompt formats Gemma 3 turn tags and ChatML tags accurately`() {
    val gemmaPrompt = LafinaIntentExtractorModule.buildNluPrompt("Pa-remind bukas 9am magpasa ng lab report", "gemma")
    assertTrue(gemmaPrompt.startsWith("<bos><start_of_turn>user\n"))
    assertTrue(gemmaPrompt.contains("User: Pa-remind bukas 9am magpasa ng lab report"))
    assertTrue(gemmaPrompt.endsWith("<end_of_turn>\n<start_of_turn>model\n"))
    assertFalse(gemmaPrompt.contains("<|im_start|>"))

    val chatmlPrompt = LafinaIntentExtractorModule.buildNluPrompt("Morrow 9am coffee break", "chatml")
    assertTrue(chatmlPrompt.startsWith("<|im_start|>system\n"))
    assertTrue(chatmlPrompt.contains("<|im_start|>user\nMorrow 9am coffee break\n<|im_end|>"))
    assertTrue(chatmlPrompt.endsWith("<|im_start|>assistant\n"))
    assertFalse(chatmlPrompt.contains("<start_of_turn>"))
  }

  @Test
  fun `formatDeviceLabel normalizes manufacturer and model strings cleanly`() {
    assertEquals("Samsung SM-A546E", LafinaIntentExtractorModule.formatDeviceLabel("samsung", "SM-A546E"))
    assertEquals("Google Pixel 8", LafinaIntentExtractorModule.formatDeviceLabel("Google", "Google Pixel 8"))
    assertEquals("Android Device", LafinaIntentExtractorModule.formatDeviceLabel(null, ""))
  }
}
