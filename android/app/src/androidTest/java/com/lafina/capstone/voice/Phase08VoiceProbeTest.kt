package com.lafina.capstone.voice

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import com.lafina.capstone.MainActivity
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Explicitly opted-in capability probe using the real system engine and an actually resumed app.
 * It never opens a microphone, downloads a voice, changes settings, or interprets speech as a command.
 * A successful test can record UNAVAILABLE; inspect the JSON status before claiming playback support.
 */
@RunWith(AndroidJUnit4::class)
class Phase08VoiceProbeTest {
  @Test
  fun probeForegroundOfflineSpeech() {
    val args = InstrumentationRegistry.getArguments()
    assumeTrue("Opt in with -e runPhase08VoiceProbe true", args.getString("runPhase08VoiceProbe") == "true")
    val mode = args.getString("voiceProbeMode") ?: "inventory"
    require(mode in setOf("inventory", "speak", "stop", "cancel_init")) { "INVALID_PROBE_MODE" }
    val options = SpeechOptions(
      enginePackage = args.getString("voiceProbeEngine"),
      voiceName = args.getString("voiceProbeName"),
      languageTag = args.getString("voiceProbeLocale") ?: "en-US",
    ).validate()
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val app = instrumentation.targetContext
    val startedAt = SystemClock.elapsedRealtime()
    val activePackageMatches = AtomicBoolean(false)
    val inventory = AtomicReference<JSONObject?>(null)
    val acceptance = AtomicReference<JSONObject?>(null)
    val events = CopyOnWriteArrayList<JSONObject>()
    val result = JSONObject()
      .put("kind", "PHASE08_REAL_SYSTEM_TTS_FOREGROUND_CAPABILITY_PROBE")
      .put("mode", mode)
      .put("status", "ERROR")
      .put("api", Build.VERSION.SDK_INT)
      .put("model", Build.MODEL)
      .put("abis", JSONArray(Build.SUPPORTED_ABIS.toList()))
      .put("languageTag", options.languageTag)
      .put("microphoneOpened", false)
      .put("voiceDownloaded", false)
      .put("physicalAudibilityVerified", false)
      .put("textKind", "FIXED_SYNTHETIC_QA08")
      .put("foregroundEvidence", "MainActivity_RESUMED_AND_ACTIVE_WINDOW_PACKAGE")
    var speech: SystemSpeech? = null
    var phase = "launch"

    // Accessibility is queried from the instrumentation thread, never from Android's UI thread.
    fun refreshActivePackage() {
      val root = instrumentation.uiAutomation.rootInActiveWindow
      activePackageMatches.set(root?.packageName?.toString() == app.packageName)
      @Suppress("DEPRECATION")
      root?.recycle()
    }

    fun isMainResumed(): Boolean =
      ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).any {
        it is MainActivity && !it.isFinishing && !it.isDestroyed
      }

    fun waitBounded(timeoutMs: Long, guardForeground: Boolean = false, condition: () -> Boolean): Boolean {
      val deadline = SystemClock.elapsedRealtime() + timeoutMs
      do {
        refreshActivePackage()
        if (guardForeground) instrumentation.runOnMainSync {
          if (!activePackageMatches.get() || !isMainResumed()) {
            result.put("foregroundLost", true)
            speech?.stop("NOT_VISIBLE")
          }
        }
        if (condition()) return true
        SystemClock.sleep(100)
      } while (SystemClock.elapsedRealtime() < deadline)
      refreshActivePackage()
      return condition()
    }

    try {
      instrumentation.runOnMainSync {
        app.startActivity(Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      assertTrue("MainActivity must be resumed in the active window", waitBounded(15_000) {
        var resumed = false
        instrumentation.runOnMainSync { resumed = isMainResumed() }
        resumed && activePackageMatches.get()
      })
      result.put("foregroundConfirmed", true)
      phase = "initialize"
      instrumentation.runOnMainSync {
        speech = SystemSpeech(
          app,
          visible = { activePackageMatches.get() && isMainResumed() },
          onEvent = { events.add(JSONObject(it.toString())) },
        )
        speech!!.initialize(options) { inventory.set(JSONObject(it.toString())) }
        if (mode == "cancel_init") speech!!.stop("QA08_CANCEL_INIT")
      }
      assertTrue("SystemSpeech must complete bounded initialization", waitBounded(13_000, guardForeground = true) { inventory.get() != null })
      val initialized = inventory.get()!!
      result.put("inventory", initialized)
      if (mode == "cancel_init") {
        assertFalse("Cancelled initialization cannot report an available voice", initialized.optBoolean("available"))
        assertTrue("Initialization must not queue an utterance", events.none { it.optString("type") == "requested" })
        result.put("status", if (initialized.optString("reason") == "QA08_CANCEL_INIT") "INITIALIZATION_CANCELLED" else "UNAVAILABLE")
        result.put("reason", initialized.optString("reason", "UNAVAILABLE"))
        result.put("playbackAttempted", false)
        return
      }
      if (!initialized.optBoolean("available")) {
        result.put("status", "UNAVAILABLE")
          .put("reason", initialized.optString("reason", "UNAVAILABLE"))
          .put("playbackAttempted", false)
          .put("fallback", "TEXT_AND_MANUAL_CONTROLS_REQUIRED")
        return
      }

      val selectedName = initialized.getString("selectedVoiceName")
      val voices = initialized.getJSONArray("voices")
      val selected = (0 until voices.length()).map { voices.getJSONObject(it) }
        .single { it.getString("name") == selectedName }
      assertTrue("Selected voice must be installed", selected.getBoolean("installed"))
      assertTrue("Selected voice must be offline", selected.getBoolean("offline"))
      result.put("selectedVoice", selected)
      if (mode == "inventory") {
        result.put("status", "OFFLINE_VOICE_AVAILABLE").put("playbackAttempted", false)
        return
      }

      phase = "utterance"
      refreshActivePackage()
      instrumentation.runOnMainSync {
        assertTrue("Utterance requires actual foreground activity", activePackageMatches.get() && isMainResumed())
        acceptance.set(speech!!.speak(REQUEST_ID, SYNTHETIC_TEXT))
        if (mode == "stop") speech!!.stop("QA08_STOP")
      }
      result.put("acceptance", acceptance.get()).put("playbackAttempted", true)
      if (!acceptance.get()!!.optBoolean("accepted")) {
        result.put("status", "UNAVAILABLE")
          .put("reason", acceptance.get()!!.optString("reason", "REJECTED"))
          .put("fallback", "TEXT_AND_MANUAL_CONTROLS_REQUIRED")
        return
      }
      assertTrue("Real engine must finish, fail, or cancel within probe bound", waitBounded(30_000, guardForeground = true) {
        events.any { it.optString("type") in setOf("done", "cancelled", "error") }
      })
      val types = events.filter { it.optString("requestId") == REQUEST_ID }.map { it.optString("type") }
      assertTrue("Accepted speech must produce requested", "requested" in types)
      if (mode == "stop") {
        assertTrue("Stop must cancel the request", "cancelled" in types)
        assertFalse("Stopped request cannot complete", "done" in types)
        result.put("status", "REQUEST_CANCELLED").put("audibleInterruptionVerified", false)
      } else if ("error" in types || "cancelled" in types) {
        val terminal = events.last { it.optString("type") in setOf("error", "cancelled") }
        result.put("status", "UNAVAILABLE")
          .put("reason", terminal.optString("reason", "ENGINE_DID_NOT_COMPLETE"))
          .put("fallback", "TEXT_AND_MANUAL_CONTROLS_REQUIRED")
      } else {
        assertFalse("Foreground must remain visible throughout this probe", result.optBoolean("foregroundLost"))
        assertTrue("Completion needs a real start callback", "start" in types)
        assertEquals("done", types.last())
        result.put("status", "UTTERANCE_CALLBACKS_VERIFIED")
      }
    } catch (error: Throwable) {
      result.put("status", "ERROR").put("failedStage", phase).put("errorType", error.javaClass.simpleName)
      throw error
    } finally {
      instrumentation.runOnMainSync { speech?.release("QA08_PROBE_FINISHED") }
      result.put("events", JSONArray(events.toList()))
        .put("totalProbeMs", SystemClock.elapsedRealtime() - startedAt)
      instrumentation.sendStatus(0, Bundle().apply { putString("phase08_voice_probe", result.toString()) })
    }
  }

  private companion object {
    const val REQUEST_ID = "qa08:system-tts-probe"
    const val SYNTHETIC_TEXT = "QA08 offline speech probe. This does not complete a task."
  }
}
