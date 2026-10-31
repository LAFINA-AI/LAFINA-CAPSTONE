package com.lafina.capstone.reminders

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.content.pm.PackageManager
import android.graphics.Rect
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.MessageDigest
import java.time.Instant
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Explicit synthetic-fixture UI interaction; root supplies PCM and verifies durable SQL separately. */
class ReminderMicrophoneUiTest : Qa08UiDriver() {
  @Test fun driveVisibleReminderMicrophone() {
    val args = InstrumentationRegistry.getArguments()
    val mode = args.getString("qa08_mode")
    assumeTrue("Explicit QA08 microphone mode required", mode != null)
    require(mode in setOf("denied-permission", "permission-release-grant", "capture-stage"))
    require(args.getString("qa08_host_mic_disabled") == "true") { "FRESH_ROOT_HOST_MIC_DISABLED_CHECK_REQUIRED" }
    val permission = args.getString("qa08_permission")
    require(permission in setOf("granted", "denied")) { "EXPLICIT_MICROPHONE_PERMISSION_REQUIRED" }
    val granted = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    assertEquals("Actual OS permission must match explicit argument", permission == "granted", granted)
    require((mode == "capture-stage") == granted) { "PERMISSION_DOES_NOT_MATCH_MODE" }
    val after = args.getString("qa08_after") ?: "inspect"
    require(after in setOf("inspect", "copy-edit-refuse", "cancel", "background", "confirm-ack", "confirm-snooze"))
    prepareAutomation()
    val details = JSONObject().put("hostMicrophoneDisabledConfirmedByRoot", true)
      .put("initialPermission", permission).put("after", after).put("rawTranscriptEmitted", false)
    try {
      val value = fixture(args)
      openFixture(value)
      setText("Reminder draft text", "QA08 manual draft remains available")
      if (mode == "capture-stage") capture(after, details, value.title)
      else permissionFlow(mode!!, value, details)
      emit(mode!!, "PASS", key = "phase08_microphone_ui_driver", extra = details)
    } catch (failure: Throwable) {
      emit(mode!!, "FAIL", failure.javaClass.simpleName, "phase08_microphone_ui_driver", details)
      throw failure
    }
  }

  private fun permissionFlow(mode: String, value: Qa08UiFixture, details: JSONObject) {
    // Permission requested on DOWN; release before interacting with Android's grant/deny surface.
    hold { SystemClock.sleep(200) }
    permissionButton(if (mode == "denied-permission") "permission_deny_button" else "permission_allow_foreground_only_button")
    val expected = mode == "permission-release-grant"
    val until = SystemClock.elapsedRealtime() + 5000
    while ((context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) != expected &&
      SystemClock.elapsedRealtime() < until) SystemClock.sleep(100)
    assertEquals(expected, context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
    SystemClock.sleep(600)
    assertFalse("Grant after release cannot start recording", recordingVisible())
    if (!present("Reminder draft text")) {
      // Android's permission surface can pause/retire this response window; a new Answer is explicit.
      // Continue on the returned window. Relaunching the same identity can leave an old Answer
      // accessibility node visible until onNewIntent reloads, racing this test's next click.
      waitFor(value.title).recycle()
      reveal("Answer").recycle()
      click("Answer")
      waitFor("REMINDER RESPONSE").recycle()
      details.put("answerReopenedAfterPermissionSurface", true)
      stages.add("visible_answer_clicked_after_permission_surface")
    }
    waitFor("Reminder draft text").recycle()
    setText("Reminder draft text", "QA08 manual draft after permission")
    assertEquals("QA08 manual draft after permission", text("Reminder draft text"))
    assertFalse("A new visible hold is required after permission", recordingVisible())
    details.put("permissionGrantedAfter", expected).put("noAutomaticRecordingObserved", true)
    stages.add("permission_surface_handled_after_pointer_release_manual_draft_available")
  }

  private fun capture(after: String, details: JSONObject, title: String) {
    val originalDraft = text("Reminder draft text")
    val gate = File(context.noBackupFilesDir, "qa08-microphone-${SystemClock.elapsedRealtime()}.gate")
    assertFalse("Use a fresh owned gate", gate.exists())
    val confirmationRequired = after in setOf("confirm-ack", "confirm-snooze")
    details.put("producerAuthorizationRequired", confirmationRequired)
      .put("producerAborted", false).put("producerAbortMarkerObserved", false)
      .put("producerAuthorizationBlocked", false)
    try {
      var reachedRecording = false
      for (attempt in 1..2) {
        var failure: String? = null
        hold {
          failure = awaitRecordingOrFailure()
          if (failure == null) {
            reachedRecording = true
            details.put("recordingVisible", true).put("visibleHoldCount", attempt)
            stages.add("actual_pointer_down_and_visible_recording_observed")
            val recordingObservedElapsed = SystemClock.elapsedRealtime()
            val recordingObservedUtc = Instant.now().toString()
            val deadline = SystemClock.elapsedRealtime() + 12_000
            val gateWaitStarted = deadline - 12_000
            details.put("recordingObservedElapsedMs", recordingObservedElapsed)
              .put("nativeGateWaitLimitMs", 12_000).put("nativeGateWaitStartedElapsedMs", gateWaitStarted)
              .put("nativeGateDeadlineElapsedMs", deadline)
            emit("capture-stage", "READY", key = "phase08_microphone_ui_stage", extra = JSONObject()
              .put("gateFile", gate.absolutePath).put("observedAtUtc", recordingObservedUtc)
              .put("recordingVisible", true).put("holdCount", attempt)
              .put("recordingObservedElapsedMs", recordingObservedElapsed)
              .put("nativeGateWaitLimitMs", 12_000).put("nativeGateWaitStartedElapsedMs", gateWaitStarted)
              .put("nativeGateDeadlineElapsedMs", deadline))
            while (!gate.exists() && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50)
            val gateObserved = gate.exists()
            val gateWaitEnded = SystemClock.elapsedRealtime()
            details.put("nativeGateWaitEndedElapsedMs", gateWaitEnded)
              .put("nativeGateWaitElapsedMs", gateWaitEnded - gateWaitStarted)
              .put("nativeGateObservedAtWaitEnd", gateObserved)
              .put("nativeGateDeadlineReachedAtWaitEnd", gateWaitEnded >= deadline)
              .put("nativeGateTimedOut", !gateObserved)
            if (!gateObserved) {
              details.put("nativeGateMarkerState", "MISSING").put("nativeGateDecision", "BLOCK_TIMEOUT")
                .put("producerAuthorizationBlocked", true).put("producerAuthorizedConfirmation", false)
              stages.add("synthetic_producer_gate_timeout_no_confirmation")
            }
            // Persist fixed timeout diagnostics before the assertion; hold() still releases in finally.
            assertTrue("SYNTHETIC_PRODUCER_GATE_TIMEOUT", gateObserved)
            when (after) {
              "cancel" -> {
                click("Cancel speech input")
                stages.add("cancel_clicked_while_pointer_held")
              }
              "background" -> {
                assertTrue(automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME))
                stages.add("home_requested_while_pointer_held")
              }
            }
          }
        }
        stages.add("actual_pointer_up_sent_in_finally")
        if (reachedRecording) break
        details.put(if (attempt == 1) "firstHoldFailureCode" else "secondHoldFailureCode", failure)
          .put("visibleHoldCount", attempt)
        emit("capture-stage", "HOLD_UNAVAILABLE", key = "phase08_microphone_ui_stage", extra = JSONObject()
          .put("holdCount", attempt).put("failureCode", failure).put("pointerReleased", true))
        // Production records unsupported Android languages. A second *new visible gesture* can
        // exercise its existing Whisper fallback; this test never invokes input.start directly.
        assertTrue("Only a known Android capability failure permits one new hold",
          attempt == 1 && failure in setOf("LANGUAGE_UNAVAILABLE", "LANGUAGE_NOT_SUPPORTED",
            "OFFLINE_ENGINE_UNAVAILABLE", "RECOGNITION_FAILED"))
        // Clear the first terminal label through the real visible Cancel action.
        // Otherwise a second hold can mistake that old label for its own result
        // before the remote Activity has dispatched the new pointer event.
        click("Cancel speech input")
        waitMatching(3000) { it.text?.toString()?.startsWith("Speech input stopped.") == true }.recycle()
        SystemClock.sleep(300)
      }
      assertTrue("Recording must be observed within two explicit visible holds", reachedRecording)
      // Snapshot only this owned marker; publish fixed categories, never its arbitrary content.
      val markerExists = gate.exists()
      val markerBytes = if (markerExists) gate.length() else -1L
      var producerDecision = ""
      var markerState = when {
        !markerExists -> "MISSING"
        !gate.isFile -> "INVALID_TYPE"
        markerBytes > 16 -> "INVALID_LENGTH"
        else -> "UNREAD"
      }
      details.put("nativeGateMarkerBytes", markerBytes).put("nativeGateMarkerState", markerState)
      if (markerState == "UNREAD") {
        try {
          producerDecision = gate.readText().trim()
        } catch (failure: Exception) {
          details.put("nativeGateMarkerState", "READ_FAILED").put("nativeGateDecision", "BLOCK_READ_FAILED")
            .put("producerAuthorizationBlocked", true).put("producerAuthorizedConfirmation", false)
          throw failure
        }
        markerState = when (producerDecision) {
          "ALLOW" -> "ALLOW"
          "ABORT" -> "ABORT"
          "" -> "EMPTY"
          else -> "INVALID_CONTENT"
        }
      }
      val producerAborted = producerDecision == "ABORT"
      val authorizationBlocked = confirmationRequired && producerDecision != "ALLOW"
      details.put("nativeGateMarkerState", markerState).put("producerAborted", producerAborted)
        .put("producerAbortMarkerObserved", producerAborted)
        .put("producerAuthorizationBlocked", authorizationBlocked)
        .put("producerAuthorizedConfirmation", producerDecision == "ALLOW")
        .put("nativeGateDecision", when {
          producerAborted -> "BLOCK_PRODUCER_ABORT"
          authorizationBlocked -> "BLOCK_INVALID_AUTHORIZATION"
          producerDecision == "ALLOW" -> "ALLOW"
          else -> "CONTINUE_NONMUTATING"
        })
      if (producerAborted || authorizationBlocked) {
        click("Cancel speech input")
        SystemClock.sleep(300)
        assertFalse(recordingVisible())
        assertEquals(originalDraft, text("Reminder draft text"))
        assertFalse(present("Confirm response"))
        stages.add(if (producerAborted) "producer_abort_blocked_copy_review_confirmation"
          else "producer_authorization_blocked_copy_review_confirmation")
        throw AssertionError(if (producerAborted) "SYNTHETIC_PRODUCER_ABORTED_SAFE_NO_CONFIRM"
          else "SYNTHETIC_PRODUCER_AUTHORIZATION_BLOCKED_SAFE_NO_CONFIRM")
      }
      details.put("producerAuthorizedConfirmation", producerDecision == "ALLOW")
      if (after == "background") {
        SystemClock.sleep(700)
        assertFalse(recordingVisible())
        details.put("recordingAbsentAfterBackground", true)
        startMain()
        return
      }
      if (after == "cancel") {
        waitMatching(5000) { it.text?.toString()?.startsWith("Speech input stopped.") == true }.recycle()
        assertFalse(recordingVisible())
        assertEquals("QA08 manual draft remains available", text("Reminder draft text"))
        details.put("manualDraftPreservedAfterCancel", true)
        return
      }
      val terminal = waitMatching(45_000) {
        val value = it.text?.toString().orEmpty()
        value.startsWith("Speech recognized.") || value.startsWith("Speech input could not finish") ||
          value.startsWith("Speech input stopped without a transcript")
      }
      try {
        failureCode(terminal.text?.toString().orEmpty())?.let { details.put("terminalFailureCode", it) }
      } finally { terminal.recycle() }
      assertFalse(recordingVisible())
      val recognized = text("Recognized reminder speech")
      val diagnosticArgs = InstrumentationRegistry.getArguments()
      if (diagnosticArgs.getString("qa08_emit_pinned_hypothesis") == "true") {
        val expectedSha = when (after) {
          "confirm-ack" -> "e10b92f68d6a188bc19b44bd327aa91747d58d4a257510d786a14dc45a4e0a3c"
          "confirm-snooze" -> "fd762146a51062b7d5deef1cda58b2607d8b3aa4694bde4c76d9820701e5f42a"
          else -> error("PINNED_SYNTHETIC_DIAGNOSTIC_ONLY")
        }
        require(diagnosticArgs.getString("qa08_diagnostic_fixture_sha") == expectedSha)
        details.put("privatePinnedSyntheticHypothesis", recognized).put("rawTranscriptEmitted", true)
      }
      val normalizedRecognized = normalize(recognized)
      val normalizedSha256 = MessageDigest.getInstance("SHA-256")
        .digest(normalizedRecognized.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it.toInt() and 255) }
      details.put("recognizedCharacterCount", recognized.length)
        .put("recognizedNormalizedSha256", normalizedSha256)
        .put("recognizedNormalizedIsAcknowledged", normalizedRecognized == "acknowledged")
        .put("recognizedNormalizedIsAcknowledge", normalizedRecognized == "acknowledge")
        .put("recognizedNormalizedMatchesSyntheticToday", normalizedRecognized == "show my tasks for today")
        .put("recognizedNormalizedMatchesSyntheticAcknowledge", normalizedRecognized == "acknowledge this reminder")
        .put("recognizedNormalizedMatchesSyntheticSnooze", normalizedRecognized in
          setOf("snooze for ten minutes", "snooze for 10 minutes"))
        .put("transcriptReady", recognized.isNotBlank())
      assertEquals("Recognition alone cannot overwrite draft", "QA08 manual draft remains available", text("Reminder draft text"))
      if (after == "confirm-ack" || after == "confirm-snooze") {
        val ack = after == "confirm-ack"
        assertTrue("Only the expected synthetic response may reach confirmation",
          if (ack) details.getBoolean("recognizedNormalizedMatchesSyntheticAcknowledge")
          else details.getBoolean("recognizedNormalizedMatchesSyntheticSnooze"))
        click("Replace draft with recognized speech")
        assertEquals("Explicit copy must preserve recognized words", recognized, text("Reminder draft text"))
        click("Review response")
        waitFor("Review reminder response").recycle()
        val expectedReview = if (ack) "Acknowledge this reminder. The task stays open; it is not completed."
          else "Snooze this reminder for 10 minutes. The task stays open; it is not completed."
        val expectedMessage = "$title\n\n$expectedReview\nOnly this reminder is affected."
        waitMatching(4000) { it.text?.toString() == expectedMessage }.recycle()
        details.put("expectedReviewMatchedBeforeConfirm", true)
        stages.add(if (ack) "recognized_ack_exact_review_verified_before_confirm"
          else "recognized_ten_minute_snooze_exact_review_verified_before_confirm")
        click("Confirm")
        waitAbsent("Review reminder response")
        waitAbsent("REMINDER RESPONSE")
        details.put("explicitConfirmationClicked", true).put("normalReminderWindowClosed", true)
        stages.add("synthetic_response_explicitly_confirmed_and_window_closed")
        return
      }
      if (after == "copy-edit-refuse") {
        assertTrue("Synthetic transcript needed for copy/edit check", recognized.isNotBlank())
        click("Replace draft with recognized speech")
        assertEquals(recognized, text("Reminder draft text"))
        setText("Reminder draft text", "show my tasks for today")
        click("Review response")
        waitFor("Response not understood").recycle()
        assertFalse("Unsupported phrase must not offer confirmation", present("Confirm"))
        click("Keep editing")
        assertEquals("show my tasks for today", text("Reminder draft text"))
        stages.add("explicit_copy_edit_and_unsupported_response_refusal_observed")
      }
    } finally {
      // Only this test's fresh synthetic coordination marker may be removed.
      if (gate.exists()) gate.delete()
    }
  }

  private fun recordingVisible(): Boolean {
    return try {
      val node = waitMatching(250) { it.text?.toString()?.startsWith("Recording now.") == true }
      node.recycle()
      true
    } catch (_: AssertionError) { false }
  }

  private fun awaitRecordingOrFailure(): String? {
    val node = try {
      waitMatching(8000) {
        val value = it.text?.toString().orEmpty()
        value.startsWith("Recording now.") || failureCode(value) != null
      }
    } catch (_: AssertionError) { return "VISIBLE_HOLD_STATUS_TIMEOUT" }
    return try {
      val value = node.text?.toString().orEmpty()
      if (value.startsWith("Recording now.")) null else failureCode(value)
    } finally { node.recycle() }
  }

  /** Status is inspected only in memory; emit fixed codes, never arbitrary UI/transcript text. */
  private fun failureCode(value: String): String? {
    if (!value.startsWith("Offline speech could not start") &&
      !value.startsWith("Speech input could not finish") &&
      !value.startsWith("Speech input stopped without a transcript")) return null
    return listOf("LANGUAGE_UNAVAILABLE", "LANGUAGE_NOT_SUPPORTED", "OFFLINE_ENGINE_UNAVAILABLE",
      "RECOGNITION_FAILED", "PERMISSION_DENIED", "PERMISSION_REVOKED", "NO_AUDIO_SIGNAL",
      "ENGINE_START_FAILED", "MIC_UNAVAILABLE", "MIC_BUSY", "NO_SPEECH", "TOO_MANY_REQUESTS")
      .firstOrNull { value.contains("($it)") } ?: "ENGINE_START_FAILED"
  }

  private fun hold(action: () -> Unit) {
    val node = reveal("Hold to talk in answered reminder")
    val bounds = Rect()
    try {
      SystemClock.sleep(250)
      assertTrue("Hold control must remain attached after scrolling", node.refresh())
      assertTrue("Hold control must be visible", node.isVisibleToUser)
      node.getBoundsInScreen(bounds)
      val root = automation.rootInActiveWindow ?: throw AssertionError("ACTIVE_APP_WINDOW_REQUIRED")
      val window = Rect()
      try {
        assertEquals(context.packageName, root.packageName?.toString())
        root.getBoundsInScreen(window)
      } finally { root.recycle() }
      val metrics = context.resources.displayMetrics
      assertTrue("Active window must intersect screen", window.intersect(0, 0, metrics.widthPixels, metrics.heightPixels))
      assertTrue("Hold target must intersect actual visible app window", bounds.intersect(window))
      assertTrue("Pointer center must remain inside visible frame", window.contains(bounds.centerX(), bounds.centerY()))
    } finally { node.recycle() }
    assertTrue("Hold target must have screen bounds", bounds.width() > 0 && bounds.height() > 0)
    val downAt = SystemClock.uptimeMillis()
    fun pointer(kind: Int) {
      val event = MotionEvent.obtain(downAt, SystemClock.uptimeMillis(), kind,
        bounds.exactCenterX(), bounds.exactCenterY(), 0).apply { source = InputDevice.SOURCE_TOUCHSCREEN }
      try { instrumentation.sendPointerSync(event) } finally { event.recycle() }
    }
    try { pointer(MotionEvent.ACTION_DOWN); action() }
    finally { pointer(MotionEvent.ACTION_UP) }
  }

  private fun permissionButton(idSuffix: String) {
    val until = SystemClock.elapsedRealtime() + 7000
    do {
      val root = automation.rootInActiveWindow
      val owner = root?.packageName?.toString()
      root?.recycle()
      if (owner in setOf("com.android.permissioncontroller", "com.google.android.permissioncontroller")) {
        val nodes = activeSurfaceNodes(owner!!)
        try {
          val button = nodes.firstOrNull { it.viewIdResourceName?.endsWith("/$idSuffix") == true }
          if (button != null && button.isEnabled && button.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return
        } finally { nodes.forEach { it.recycle() } }
      }
      SystemClock.sleep(100)
    } while (SystemClock.elapsedRealtime() < until)
    throw AssertionError("EXPECTED_ANDROID_PERMISSION_ACTION_NOT_AVAILABLE")
  }

  private fun normalize(value: String): String = value.lowercase().replace(Regex("[^a-z0-9 ]"), " ")
    .trim().replace(Regex("\\s+"), " ")
}
