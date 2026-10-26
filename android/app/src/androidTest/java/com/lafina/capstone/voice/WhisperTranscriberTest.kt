package com.lafina.capstone.voice

import androidx.test.platform.app.InstrumentationRegistry
import com.lafina.capstone.BuildConfig
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.security.MessageDigest

/** Actual Android/JNI/asset boundary checks; no microphone or private audio used. */
class WhisperTranscriberTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()
  private val app get() = instrumentation.targetContext

  @Test fun availabilityReflectsExplicitBuildArtifactAndNativeLibrary() {
    assertEquals(BuildConfig.WHISPER_MODEL_INCLUDED, WhisperTranscriber.isAvailable(app))
  }

  @Test fun mainThreadCannotHashCopyOrLoadWhisperModel() {
    instrumentation.runOnMainSync {
      val error = assertThrows(IllegalStateException::class.java) {
        WhisperTranscriber.transcribe(app, FloatArray(1600), "en-US") { false }
      }
      assertEquals("WHISPER_WORKER_REQUIRED", error.message)
    }
  }

  @Test fun invalidAudioCannotReachModelWork() {
    for (samples in listOf(FloatArray(0), FloatArray(240_001), floatArrayOf(Float.NaN), FloatArray(1600) { 2f })) {
      assertThrows(IllegalArgumentException::class.java) {
        WhisperTranscriber.transcribe(app, samples, "en-US") { false }
      }
      assertTrue("Rejected PCM must not remain in the application buffer", samples.all { it == 0f })
    }
  }

  @Test fun unsupportedLanguageCannotSilentlyBecomeEnglish() {
    val samples = FloatArray(1600) { 0.25f }
    val error = assertThrows(IllegalArgumentException::class.java) {
      WhisperTranscriber.transcribe(app, samples, "missing-language") { false }
    }
    assertEquals("WHISPER_LANGUAGE_UNAVAILABLE", error.message)
    assertTrue(samples.all { it == 0f })
  }

  @Test fun includedModelHasExactReviewedLengthAndSha256() {
    assumeTrue("Optional model not included in this build", BuildConfig.WHISPER_MODEL_INCLUDED)
    val digest = MessageDigest.getInstance("SHA-256")
    var size = 0L
    app.assets.open(WhisperTranscriber.MODEL_ASSET).use { input ->
      val bytes = ByteArray(64 * 1024)
      while (true) {
        val read = input.read(bytes)
        if (read < 0) break
        size += read; digest.update(bytes, 0, read)
      }
    }
    assertEquals(WhisperTranscriber.MODEL_BYTES, size)
    assertEquals(WhisperTranscriber.MODEL_SHA256, digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) })
  }

  @Test fun cancelledBeforeInferenceExitsWithContentFreeReason() {
    assumeTrue("Optional model not included in this build", BuildConfig.WHISPER_MODEL_INCLUDED)
    val error = assertThrows(IllegalStateException::class.java) {
      WhisperTranscriber.transcribe(app, FloatArray(1600), "en-US") { true }
    }
    assertEquals("WHISPER_CANCELLED_OR_TIMEOUT", error.message)
  }
}
