package com.lafina.capstone.voice

import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.Locale

/** Actual Android Voice/JSON/main-loop checks. These do not claim audible speech or engine fidelity. */
class SystemSpeechTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()

  @Test fun actualAndroidVoiceMetadataRefusesNetworkAndMissingVoiceData() {
    val local = Voice("local", Locale.US, 300, 200, false, emptySet())
    val network = Voice("network", Locale.US, 500, 100, true, emptySet())
    val missing = Voice("missing", Locale.US, 500, 100, false, setOf(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))
    assertTrue(SystemSpeech.describe(local).offline)
    assertFalse(SystemSpeech.describe(network).offline)
    assertFalse(SystemSpeech.describe(missing).installed)
    assertTrue(SystemSpeech.matchesLiveVoice(local, SystemSpeech.describe(local)))
    assertFalse(SystemSpeech.matchesLiveVoice(network, SystemSpeech.describe(local)))
    assertFalse(SystemSpeech.matchesLiveVoice(missing, SystemSpeech.describe(local)))
    assertFalse(SystemSpeech.matchesLiveVoice(null, SystemSpeech.describe(local)))
    assertFalse(SystemSpeech.matchesLiveVoice(local, SystemSpeech.describe(local).copy(languageTag = "en-GB")))
  }

  @Test fun optionsRoundTripAndRejectStringCoercionNullsAndOutOfRangeValues() {
    assertEquals(SpeechOptions(), SystemSpeech.options(JSONObject()))
    assertEquals(SpeechOptions(languageTag = "fil-PH", rate = 0.75, pitch = 1.25),
      SystemSpeech.options(JSONObject("{\"enginePackage\":null,\"voiceName\":null,\"languageTag\":\"fil-PH\",\"rate\":0.75,\"pitch\":1.25}")))
    for (json in listOf("{\"rate\":\"1\"}", "{\"pitch\":null}", "{\"languageTag\":1}", "{\"rate\":4}",
      "{\"enginePackage\":4}", "{\"voiceName\":false}")) {
      assertThrows(Exception::class.java) { SystemSpeech.options(JSONObject(json)) }
    }
  }

  @Test fun invisibleClientCannotInitializeOrSpeakAndDisposeIsIdempotent() {
    instrumentation.runOnMainSync {
      val speech = SystemSpeech(instrumentation.targetContext, { false })
      var result: JSONObject? = null
      speech.initialize(SpeechOptions()) { result = it }
      assertFalse(result!!.getBoolean("available"))
      assertEquals("NOT_VISIBLE", result!!.getString("reason"))
      assertEquals("NOT_VISIBLE", speech.speak("invisible", "Synthetic offline test.").getString("reason"))
      speech.stop(); speech.release(); speech.release()
      assertEquals(0, speech.diagnostics().getJSONArray("events").length())
    }
  }

  @Test fun unavailableExplicitEngineDoesNotFallBackOrEmitFakeSpeechSuccess() {
    instrumentation.runOnMainSync {
      val speech = SystemSpeech(instrumentation.targetContext, { true })
      var result: JSONObject? = null
      speech.initialize(SpeechOptions(enginePackage = "com.lafina.missing.test.engine")) { result = it }
      assertFalse(result!!.getBoolean("available"))
      assertTrue(result!!.getString("reason") in listOf("NO_ENGINE", "ENGINE_NOT_INSTALLED"))
      assertFalse(speech.speak("missing", "Synthetic offline test.").getBoolean("accepted"))
      assertEquals(0, speech.diagnostics().getJSONArray("events").length())
      speech.release()
    }
  }
}
