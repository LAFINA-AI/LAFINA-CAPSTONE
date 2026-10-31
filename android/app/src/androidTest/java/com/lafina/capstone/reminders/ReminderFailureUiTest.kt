package com.lafina.capstone.reminders

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Rect
import android.media.AudioManager
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.view.InputDevice
import android.view.MotionEvent
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Real visible controls under explicitly established, reversible OS failure conditions.
 * Root owns settings/fixture preparation, host-input checks and independent durable-state checks.
 * No database access, transcript logging, automatic recording or mocked engine callbacks.
 */
class ReminderFailureUiTest : Qa08UiDriver() {
  @Test fun driveVisibleReminderFailure() {
    val args = InstrumentationRegistry.getArguments()
    assumeTrue("Explicit Phase08 failure UI opt-in required", args.getString("runPhase08FailureUi") == "true")
    val mode = args.getString("qa08_mode")
    require(mode in setOf("tts-no-engine", "stt-audio-busy", "record-audio-interruption"))
    require(args.getString("qa08_host_mic_disabled") == "true") { "FRESH_ROOT_HOST_INPUT_DISABLED_CHECK_REQUIRED" }
    prepareAutomation()
    val details = JSONObject().put("hostMicrophoneDisabledConfirmedByRoot", true)
      .put("rawTranscriptEmitted", false).put("noConfirmationClicked", true)
    try {
      val value = fixture(args)
      if (mode == "tts-no-engine") {
        require(args.getString("qa08_tts_disabled_by_root") == "true") { "ROOT_REVERSIBLE_ENGINE_PRECONDITION_REQUIRED" }
        assertEquals("The real enabled TTS service inventory must be empty", 0, enabledTtsServices())
        details.put("enabledTtsServices", 0)
      } else {
        assertEquals(PackageManager.PERMISSION_GRANTED, context.checkSelfPermission(Manifest.permission.RECORD_AUDIO))
      }
      openFixture(value)
      assertFalse("Answer must not begin recording", recordingVisible())
      setText("Reminder draft text", MANUAL_DRAFT)
      when (mode) {
        "tts-no-engine" -> unavailableTts(details)
        "stt-audio-busy" -> audioFailure(false, details)
        "record-audio-interruption" -> audioFailure(true, details)
      }
      assertEquals("A failed speech route must preserve the manual draft", MANUAL_DRAFT, text("Reminder draft text"))
      assertEquals("No failed route may supply recognized words", "", text("Recognized reminder speech"))
      manualReviews(value, details)
      emit(mode!!, "PASS", key = "phase08_failure_ui_driver", extra = details)
    } catch (failure: Throwable) {
      emit(mode!!, "FAIL", failure.javaClass.simpleName, "phase08_failure_ui_driver", details)
      throw failure
    }
  }

  @Suppress("DEPRECATION")
  private fun enabledTtsServices(): Int = context.packageManager.queryIntentServices(
    Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE), 0
  ).count { it.serviceInfo?.let { service -> service.enabled && service.applicationInfo.enabled } == true }

  private fun unavailableTts(details: JSONObject) {
    // Presence proves the saved voice option is enabled; testing Profile's OFF state is insufficient.
    reveal("Read reminder").recycle()
    waitFor("An installed offline voice is unavailable. Review Android speech settings or use the visible controls.").recycle()
    assertEquals(0, enabledTtsServices())
    details.put("voiceEnabledControlObserved", true).put("unavailableOfflineVoiceVisible", true)
    stages.add("zero_enabled_os_tts_services_and_real_unavailable_voice_ui_observed")
  }

  private fun audioFailure(interruptRecording: Boolean, details: JSONObject) {
    val audio = context.getSystemService(AudioManager::class.java)
    val original = audio.mode
    assertEquals("Do not overwrite an unknown pre-existing audio condition", AudioManager.MODE_NORMAL, original)
    details.put("audioModeBefore", original)
    // Do not change microphone permission attribution while A27 initializes its real recorder.
    // Adopt only the mode-changing test capability after Recording (or before A26's blocked hold).
    var adoptedAudioPermission = false
    try {
      if (interruptRecording) {
        var reachedRecording = false
        for (attempt in 1..2) {
          var initialFailure: String? = null
          hold {
            initialFailure = awaitRecordingOrFailure()
            if (initialFailure == null) {
              reachedRecording = true
              details.put("recordingVisibleBeforeInterruption", true).put("visibleHoldCount", attempt)
              stages.add("actual_pointer_hold_and_recording_observed")
              automation.adoptShellPermissionIdentity(Manifest.permission.MODIFY_AUDIO_SETTINGS)
              adoptedAudioPermission = true
              setAndObserveMode(audio, AudioManager.MODE_IN_COMMUNICATION)
              details.put("nonNormalAudioModeObservedDuringRecording", true)
              waitForAudioFailure().also { details.put("failureCode", it) }
            }
          }
          if (reachedRecording) break
          details.put(if (attempt == 1) "firstHoldFailureCode" else "secondHoldFailureCode", initialFailure)
          stages.add("visible_hold_${attempt}_ended_without_recording")
          assertTrue("Only an observed unsupported Android route permits another deliberate hold",
            attempt == 1 && initialFailure in ANDROID_FALLBACK_FAILURES)
          click("Cancel speech input")
          waitMatching(3000) { it.text?.toString()?.startsWith("Speech input stopped.") == true }.recycle()
          SystemClock.sleep(250)
        }
        assertTrue("A27 requires actual Recording before interruption", reachedRecording)
      } else {
        automation.adoptShellPermissionIdentity(Manifest.permission.MODIFY_AUDIO_SETTINGS)
        adoptedAudioPermission = true
        setAndObserveMode(audio, AudioManager.MODE_IN_COMMUNICATION)
        details.put("nonNormalAudioModeObservedBeforeHold", true)
        hold { waitForAudioFailure().also { details.put("failureCode", it) } }
        assertFalse("The blocked route must not reach recording", recordingVisible())
      }
    } finally {
      try {
        if (adoptedAudioPermission) setAndObserveMode(audio, original)
      } finally {
        details.put("audioModeAfter", audio.mode).put("exactAudioModeRestored", audio.mode == original)
          .put("testAudioPermissionAdopted", adoptedAudioPermission)
        if (adoptedAudioPermission) automation.dropShellPermissionIdentity()
      }
    }
    assertFalse(recordingVisible())
    // A late result after OS-mode recovery must not replace the manual draft or become reviewable speech.
    SystemClock.sleep(1500)
    assertFalse(recordingVisible())
    assertEquals("", text("Recognized reminder speech"))
    assertFalse(present("Review reminder response"))
    details.put("noLateRecognizedResultObserved", true).put("recordingAbsentAfterFailure", true)
    stages.add("actual_audio_mode_failure_released_pointer_mode_restored_no_late_result")
  }

  private fun setAndObserveMode(audio: AudioManager, value: Int) {
    instrumentation.runOnMainSync { audio.mode = value }
    val until = SystemClock.elapsedRealtime() + 2500
    while (audio.mode != value && SystemClock.elapsedRealtime() < until) SystemClock.sleep(50)
    assertEquals("The requested real OS mode must be observed", value, audio.mode)
  }

  private fun waitForAudioFailure(): String {
    val node = waitMatching(6000) {
      val label = it.text?.toString().orEmpty()
      (label.startsWith("Speech input could not finish") || label.startsWith("Speech input stopped (")) &&
        (label.contains("(AUDIO_INTERRUPTED)") || label.contains("(AUDIO_FOCUS_LOST)"))
    }
    return try {
      if (node.text.toString().contains("(AUDIO_FOCUS_LOST)")) "AUDIO_FOCUS_LOST" else "AUDIO_INTERRUPTED"
    } finally { node.recycle() }
  }

  private fun awaitRecordingOrFailure(): String? {
    val node = try {
      waitMatching(8000) {
        val label = it.text?.toString().orEmpty()
        label.startsWith("Recording now.") || failureCode(label) != null
      }
    } catch (_: AssertionError) { return "VISIBLE_HOLD_STATUS_TIMEOUT" }
    return try {
      val label = node.text?.toString().orEmpty()
      if (label.startsWith("Recording now.")) null else failureCode(label)
    } finally { node.recycle() }
  }

  /** Inspect status only in memory; publish fixed codes rather than arbitrary UI/transcript text. */
  private fun failureCode(value: String): String? {
    if (!value.startsWith("Offline speech could not start") &&
      !value.startsWith("Speech input could not finish") &&
      !value.startsWith("Speech input stopped without a transcript")) return null
    return listOf("LANGUAGE_UNAVAILABLE", "LANGUAGE_NOT_SUPPORTED", "OFFLINE_ENGINE_UNAVAILABLE",
      "RECOGNITION_FAILED", "PERMISSION_DENIED", "PERMISSION_REVOKED", "NO_AUDIO_SIGNAL",
      "ENGINE_START_FAILED", "MIC_UNAVAILABLE", "MIC_BUSY", "NO_SPEECH", "TOO_MANY_REQUESTS",
      "AUDIO_INTERRUPTED", "AUDIO_FOCUS_LOST", "PREPARATION_TIMEOUT")
      .firstOrNull { value.contains("($it)") } ?: "ENGINE_START_FAILED"
  }

  private fun manualReviews(value: Qa08UiFixture, details: JSONObject) {
    setText("Reminder draft text", "acknowledge")
    click("Review response")
    verifyAndCancelReview(value)
    click("Acknowledge / Dismiss")
    verifyAndCancelReview(value)
    click("Snooze 10 minutes")
    verifyAndCancelReview(value)
    assertEquals("acknowledge", text("Reminder draft text"))
    details.put("typedReviewAvailable", true).put("manualAckReviewAvailable", true)
      .put("manualSnoozeReviewAvailable", true).put("allReviewsCancelledWithoutConfirmation", true)
    stages.add("typed_and_both_manual_review_dialogs_opened_then_cancelled")
  }

  private fun verifyAndCancelReview(value: Qa08UiFixture) {
    waitFor("Review reminder response").recycle()
    waitMatching(3000) {
      val label = it.text?.toString().orEmpty()
      label.contains(value.title) && label.contains("Only this reminder is affected.")
    }.recycle()
    waitFor("Confirm").recycle()
    click("Keep editing")
    waitAbsent("Review reminder response")
  }

  private fun recordingVisible(): Boolean = try {
    waitMatching(250) { it.text?.toString()?.startsWith("Recording now.") == true }.recycle()
    true
  } catch (_: AssertionError) { false }

  /** A real bounded touch gesture; every path, including failure, sends UP. */
  private fun hold(action: () -> Unit) {
    val node = reveal("Hold to talk in answered reminder")
    val bounds = Rect()
    try {
      SystemClock.sleep(200)
      assertTrue(node.refresh() && node.isVisibleToUser)
      node.getBoundsInScreen(bounds)
      val root = automation.rootInActiveWindow ?: throw AssertionError("ACTIVE_APP_WINDOW_REQUIRED")
      val window = Rect()
      try {
        assertEquals(context.packageName, root.packageName?.toString())
        root.getBoundsInScreen(window)
      } finally { root.recycle() }
      val display = context.resources.displayMetrics
      assertTrue(window.intersect(0, 0, display.widthPixels, display.heightPixels))
      assertTrue(bounds.intersect(window) && window.contains(bounds.centerX(), bounds.centerY()))
    } finally { node.recycle() }
    assertTrue(bounds.width() > 0 && bounds.height() > 0)
    val began = SystemClock.uptimeMillis()
    fun pointer(kind: Int) {
      val event = MotionEvent.obtain(began, SystemClock.uptimeMillis(), kind,
        bounds.exactCenterX(), bounds.exactCenterY(), 0).apply { source = InputDevice.SOURCE_TOUCHSCREEN }
      try { instrumentation.sendPointerSync(event) } finally { event.recycle() }
    }
    try {
      pointer(MotionEvent.ACTION_DOWN)
      stages.add("actual_pointer_down_sent")
      action()
    } finally {
      pointer(MotionEvent.ACTION_UP)
      stages.add("actual_pointer_up_sent_in_finally")
    }
  }

  companion object {
    private const val MANUAL_DRAFT = "QA08 manual draft remains available"
    private val ANDROID_FALLBACK_FAILURES = setOf("LANGUAGE_UNAVAILABLE", "LANGUAGE_NOT_SUPPORTED",
      "OFFLINE_ENGINE_UNAVAILABLE", "RECOGNITION_FAILED")
  }
}
