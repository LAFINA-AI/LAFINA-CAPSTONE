package com.lafina.capstone.reminders

import android.accessibilityservice.AccessibilityService
import android.app.ActivityManager
import android.content.ComponentName
import android.os.Bundle
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.UUID

/** Opt-in foreground tests; the orchestrator owns fixtures and independently checks durable SQL. */
class ReminderLifecycleUiTest : Qa08UiDriver() {
  @Test fun driveExplicitLifecycleCase() {
    val args = InstrumentationRegistry.getArguments()
    val mode = args.getString("qa08_mode")
    assumeTrue("Explicit owned QA08 lifecycle fixture required", mode != null)
    require(mode in setOf("typed-snooze", "manual-ack", "close", "back", "review-cancel",
      "review-pause", "double-confirm", "expired-review", "replace", "external-review", "inspect",
      "stale-open", "review-delete-source", "refusal", "remove-main-task")) {
      "UNSUPPORTED_QA08_LIFECYCLE_MODE"
    }
    prepareAutomation()
    try {
      val value = fixture(args)
      if (mode == "remove-main-task") {
        removeMainTask()
        emit(mode, "PASS", key = "phase08_lifecycle_ui_driver",
          launch = "APP_OWNED_TASK_API_NOT_RECENTS_GESTURE")
        return
      }
      if (mode == "stale-open") {
        start(ReminderIntents.intent(context, value.identity, ReminderIntents.OPEN))
        waitFor("This reminder has ended. Your planner remains available.").recycle()
        assertFalse("A stale identity cannot offer Answer", present("Answer"))
        stages.add("stale_identity_rejected")
        emit(mode, "PASS", key = "phase08_lifecycle_ui_driver")
        return
      }
      openFixture(value, answer = mode != "manual-ack")
      when (mode) {
        "refusal" -> {
          val response = decoded(args, "qa08_response_base64", 100)
          require(response in setOf("okay but remind me later", "delete this task", "delete all tasks", "mark this task complete")) {
            "ONLY_KNOWN_QA08_REFUSAL_PHRASES_ALLOWED"
          }
          setText("Reminder draft text", response)
          click("Review response")
          waitFor("Response not understood").recycle()
          assertFalse("Unsupported response cannot offer confirmation", present("Confirm"))
          stages.add("unsupported_or_destructive_response_refused")
          click("Keep editing")
          waitAbsent("Response not understood")
          waitFor("REMINDER RESPONSE").recycle()
          assertEquals("Refused response must remain an editable draft", response, text("Reminder draft text"))
          stages.add("refused_draft_preserved_for_manual_editing")
        }
        "typed-snooze" -> {
          val minutes = args.getString("qa08_minutes")?.toIntOrNull() ?: 5
          require(minutes in 1..120) { "INVALID_QA08_SNOOZE" }
          review("snooze for $minutes minutes")
          click("Confirm")
          awaitConfirmedClose()
          stages.add("typed_snooze_confirmed")
        }
        "manual-ack" -> {
          click("Acknowledge / Dismiss")
          waitFor("Review reminder response").recycle()
          click("Confirm")
          waitAbsent("Review reminder response")
          waitAbsent("SIMULATED REMINDER · NOT A PHONE CALL")
          assertFalse("Manual ACK ended in recovery", present("Close"))
          stages.add("manual_ack_reviewed_and_confirmed")
        }
        "close" -> {
          click("Close without responding")
          waitAbsent("REMINDER RESPONSE")
          stages.add("closed_without_confirmation")
        }
        "back" -> {
          hideKeyboard()
          automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
          waitAbsent("REMINDER RESPONSE")
          stages.add("back_without_confirmation")
        }
        "review-cancel" -> {
          review("acknowledge")
          click("Keep editing")
          waitAbsent("Review reminder response")
          waitFor("REMINDER RESPONSE").recycle()
          assertEquals("Cancelled review must preserve the owned draft", "acknowledge", text("Reminder draft text"))
          stages.add("cancelled_review_preserves_draft")
        }
        "review-pause" -> pauseReview(value)
        "review-delete-source" -> deleteReviewedSource(value)
        "double-confirm" -> {
          review("acknowledge")
          val confirm = waitFor("Confirm")
          val results = try { listOf(attempt(confirm), attempt(confirm)) } finally { confirm.recycle() }
          assertTrue("At least one confirmation dispatch must be accepted", results.any { it })
          waitAbsent("Review reminder response")
          waitAbsent("REMINDER RESPONSE")
          // A safe recovery message is allowed; SQL must still show one durable transition.
          stages.add("same_confirmation_node_attempted_twice")
        }
        "expired-review" -> {
          review("acknowledge")
          val confirm = waitFor("Confirm")
          try {
            waitMatching(75_000) { it.text?.toString()?.startsWith("The response window ended.") == true }.recycle()
            attempt(confirm)
            stages.add("expired_confirmation_node_attempted")
          } finally { confirm.recycle() }
          waitAbsent("Review reminder response")
        }
        "replace" -> replaceReview(value, fixture(args, "qa08_second_"))
        "external-review" -> externalReview(args)
        "inspect" -> {
          for (label in listOf("Reminder draft text", "Review response", "Hold to talk",
            "Acknowledge / Dismiss", "Snooze 10 minutes", "Close without responding")) {
            val node = reveal(label)
            try {
              node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.id)
              val until = SystemClock.elapsedRealtime() + 2_000
              while (node.refresh() && !node.isVisibleToUser && SystemClock.elapsedRealtime() < until) {
                SystemClock.sleep(100)
              }
              assertTrue("Control must be visible after semantic scrolling: $label", node.isVisibleToUser)
              assertTrue("Control must expose an accessible action: $label",
                node.isClickable || node.isEditable || node.isFocusable)
            }
            finally { node.recycle() }
          }
          stages.add("manual_controls_exposed_to_accessibility")
        }
      }
      emit(mode!!, "PASS", key = "phase08_lifecycle_ui_driver")
    } catch (failure: Throwable) {
      emit(mode!!, "FAIL", failure.javaClass.simpleName, "phase08_lifecycle_ui_driver")
      throw failure
    }
  }

  private fun review(command: String) {
    setText("Reminder draft text", command)
    click("Review response")
    waitFor("Review reminder response").recycle()
    stages.add("response_review_visible")
  }

  private fun removeMainTask() {
    startMain()
    val main = ComponentName(context.packageName, "${context.packageName}.MainActivity")
    val resumedUntil = SystemClock.elapsedRealtime() + 10_000
    var resumed = false
    do {
      instrumentation.runOnMainSync {
        resumed = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).any {
          it.componentName == main && !it.isFinishing && !it.isDestroyed
        }
      }
      if (!resumed) SystemClock.sleep(100)
    } while (!resumed && SystemClock.elapsedRealtime() < resumedUntil)
    assertTrue("The real MainActivity must be resumed before task removal", resumed)
    val manager = context.getSystemService(ActivityManager::class.java)
    val candidates = manager.appTasks.filter {
      val task = it.taskInfo
      task.baseActivity == main && task.topActivity == main
    }
    assertEquals("Remove only one app-owned task with exact MainActivity base and top", 1, candidates.size)
    val owned = candidates.single()
    val taskId = owned.taskInfo.taskId
    instrumentation.runOnMainSync { owned.finishAndRemoveTask() }
    val removedUntil = SystemClock.elapsedRealtime() + 10_000
    while (manager.appTasks.any { it.taskInfo.taskId == taskId } && SystemClock.elapsedRealtime() < removedUntil) {
      SystemClock.sleep(100)
    }
    assertFalse("The selected Main task must leave the app-owned task list",
      manager.appTasks.any { it.taskInfo.taskId == taskId })
    stages.add("main_task_removed_via_app_task_api")
  }

  private fun deleteReviewedSource(value: Qa08UiFixture) {
    require(Regex("QA08 [A-Za-z0-9 _-]{1,100}").matches(value.title))
    review("acknowledge")
    val old = waitFor("Confirm")
    try {
      startMain()
      hideKeyboard()
      if (!present("Message")) click("Chat")
      val existing = text("Message")
      require(existing.isEmpty() || existing == "Message LAFINA…" ||
        existing.startsWith("Remind me to QA08 ") || existing.startsWith("Delete task \"QA08 ")) {
        "UNKNOWN_COMPOSER_DRAFT_PRESERVED"
      }
      assertFalse("Preserve unrelated pending command", present("Confirm change"))
      setText("Message", "Delete task \"${value.title}\"")
      click("Send message")
      waitFor("Confirm change").recycle()
      click("Confirm change")
      waitAbsent("Confirm change")
      attempt(old)
      stages.add("owned_source_deleted_via_reviewed_chat_old_confirmation_attempted")
    } finally { old.recycle() }
  }

  private fun awaitConfirmedClose() {
    waitAbsent("Review reminder response")
    waitAbsent("REMINDER RESPONSE")
    assertFalse("Confirmation ended in recovery", present("Close"))
  }

  private fun attempt(node: AccessibilityNodeInfo): Boolean = try {
    node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
  } catch (_: IllegalStateException) { false }

  private fun pauseReview(value: Qa08UiFixture) {
    review("acknowledge")
    val old = waitFor("Confirm")
    try {
      startMain()
      waitAbsent("Review reminder response")
      attempt(old)
      stages.add("paused_confirmation_node_attempted")
    } finally { old.recycle() }
    hideKeyboard()
    if (!present("Message")) click("Chat")
    val existing = text("Message")
    require(existing.isEmpty() || existing == "Message LAFINA…" ||
      existing.startsWith("Remind me to QA08 ") || existing.startsWith("Delete task \"QA08 ")) {
      "UNKNOWN_COMPOSER_DRAFT_PRESERVED"
    }
    assertFalse("Preserve unrelated pending command", present("Confirm change"))
    val unsent = "Remind me to QA08 preserved draft in 1 minute"
    setText("Message", unsent)
    assertEquals("Synthetic command must remain an unsent draft", unsent, text("Message"))
    ReminderNotificationUiTest().openOwnedNotification(value)
    stages.add("paused_review_reopened_via_actual_owned_notification")
    waitFor(value.title).recycle()
    reveal("Answer").recycle()
    assertFalse("A paused review must not return", present("Review reminder response"))
    assertFalse("A paused draft must not return", present("Reminder draft text"))
    stages.add("resume_requires_new_answer_and_review")
    startMain()
    hideKeyboard()
    if (!present("Message")) click("Chat")
    val preserved = text("Message")
    assertEquals("Reopening a reminder must preserve MainActivity's unsent draft", unsent, preserved)
    if (preserved == unsent) setText("Message", "")
    stages.add("main_unsent_draft_preserved")
  }

  private fun replaceReview(first: Qa08UiFixture, second: Qa08UiFixture) {
    require(first.identity != second.identity && first.title != second.title) { "TWO_DISTINCT_QA08_FIXTURES_REQUIRED" }
    review("acknowledge")
    val old = waitFor("Confirm")
    try {
      openFixture(second, answer = false)
      attempt(old)
      waitFor(second.title).recycle()
      reveal("Answer").recycle()
      assertFalse("Old review cannot survive a new identity", present("Review reminder response"))
      stages.add("replacement_identity_rejects_old_confirmation")
    } finally { old.recycle() }
  }

  private fun externalReview(args: Bundle) {
    val command = args.getString("qa08_response") ?: "acknowledge"
    require(command == "acknowledge" || command == "snooze for 5 minutes") { "UNSUPPORTED_QA08_RESPONSE" }
    review(command)
    val old = waitFor("Confirm")
    val token = "qa08-gate-${UUID.randomUUID()}"
    val gate = File(context.filesDir, token)
    require(!gate.exists()) { "QA08_GATE_COLLISION" }
    emit("external-review", "READY", key = "phase08_lifecycle_ui_stage", extra = JSONObject()
      .put("stage", "REVIEW_READY").put("gateFile", token).put("timeoutMs", 25_000))
    try {
      val until = SystemClock.elapsedRealtime() + 25_000
      while (!gate.exists() && SystemClock.elapsedRealtime() < until) SystemClock.sleep(100)
      assertTrue("Parent must finish the controlled mutation and release the gate", gate.exists())
      assertTrue("Remove only the owned gate file", gate.delete())
      attempt(old)
      stages.add("externally_changed_snapshot_confirmation_attempted")
      // The orchestrator verifies rejection in SQL, including when another UI caused pause.
      SystemClock.sleep(500)
    } finally {
      old.recycle()
      if (gate.exists()) gate.delete()
    }
  }
}
