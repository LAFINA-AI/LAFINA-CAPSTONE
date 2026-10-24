package com.lafina.capstone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class LafinaAudioPlayerTest {

  @Test
  fun `audio player module class exists and matches registration contract`() {
    assertNotNull(LafinaAudioPlayerModule::class.java)
    val moduleMethods = LafinaAudioPlayerModule::class.java.declaredMethods.map { it.name }
    org.junit.Assert.assertTrue(moduleMethods.contains("playAudio"))
    org.junit.Assert.assertTrue(moduleMethods.contains("stopAudio"))
  }
}
