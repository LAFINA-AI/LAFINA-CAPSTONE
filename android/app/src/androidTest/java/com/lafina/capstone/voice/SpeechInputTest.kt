package com.lafina.capstone.voice

import android.content.Intent
import android.speech.RecognizerIntent
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.io.File

/** Android guards/Intent/OS-lock checks only. No invisible or synthetic-visibility microphone capture. */
class SpeechInputTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()

  @Test fun invisibleClientCannotStartMicrophoneAndReleaseIsIdempotent() {
    instrumentation.runOnMainSync {
      val events = mutableListOf<String>()
      val input = SpeechInput(instrumentation.targetContext, { false }, { events.add(it.getString("type")) })
      val result = input.start("invisible_test", "en-US", "auto")
      assertFalse(result.getBoolean("accepted"))
      assertEquals("NOT_VISIBLE", result.getString("reason"))
      assertFalse(input.stop("invisible_test").getBoolean("accepted"))
      input.cancel("invisible_test"); input.release(); input.release()
      assertTrue(events.isEmpty())
    }
  }

  @Test fun malformedRequestsNeverReachAnEngineOrPermissionPrompt() {
    instrumentation.runOnMainSync {
      val input = SpeechInput(instrumentation.targetContext, { false })
      for ((id, language, engine) in listOf(Triple("", "en-US", "auto"), Triple("valid", "fr-FR", "auto"), Triple("valid", "en-US", "network"))) {
        assertEquals("INVALID_REQUEST", input.start(id, language, engine).getString("reason"))
      }
      input.release()
    }
  }

  @Test fun intentRequestsExplicitLanguageAndNoPartialStreamingOrExternalAudioSource() {
    val intent = SpeechInput.recognizerIntent("fil-PH")
    assertEquals(RecognizerIntent.ACTION_RECOGNIZE_SPEECH, intent.action)
    assertEquals("fil-PH", intent.getStringExtra(RecognizerIntent.EXTRA_LANGUAGE))
    assertEquals(RecognizerIntent.LANGUAGE_MODEL_FREE_FORM, intent.getStringExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL))
    assertTrue(intent.getBooleanExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false))
    assertFalse(intent.getBooleanExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true))
    assertEquals(1, intent.getIntExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 0))
    assertNull(intent.component)
    assertNull(intent.data)
    assertEquals(0, intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION)
  }

  @Test fun kernelLeaseExcludesConcurrentOwnerAndCanBeReacquiredAfterClose() {
    val path = File(instrumentation.targetContext.cacheDir, "phase06-isolated-mic-lease.lock")
    val first = MicrophoneLease.acquire(path)
    assertNotNull(first)
    try { assertNull(MicrophoneLease.acquire(path)) } finally { first?.close() }
    val second = MicrophoneLease.acquire(path)
    assertNotNull(second)
    second?.close(); second?.close()
    path.delete()
  }

  @Test fun capabilitiesDoNotBeginRecordingAndRespectThePlatformVersionBoundary() {
    instrumentation.runOnMainSync {
      val events = mutableListOf<String>()
      val input = SpeechInput(instrumentation.targetContext, { false }, { events.add(it.getString("type")) })
      val result = input.capabilities()
      assertEquals(android.os.Build.VERSION.SDK_INT, result.getInt("sdk"))
      assertTrue(result.has("permission"))
      assertTrue(result.has("whisper"))
      if (android.os.Build.VERSION.SDK_INT < 31) assertFalse(result.getBoolean("onDevice"))
      assertTrue(events.isEmpty())
      input.release()
    }
  }
}
