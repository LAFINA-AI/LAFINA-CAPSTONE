package com.lafina.capstone.reminders

import android.content.Intent
import android.media.AudioManager
import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Opt-in real UI driver for owner-created QA08 fixtures. No DB, capture or playback calls. */
class ReminderResponseUiTest : Qa08UiDriver() {

  @Test fun driveReviewedReminderResponseForExplicitSyntheticFixture() {
    val args = InstrumentationRegistry.getArguments()
    val mode = args.getString("qa08_mode")
    assumeTrue("Explicit QA08 fixture driver only", mode != null)
    require(mode in setOf("compose", "answer", "ack", "snooze", "timeout")) { "UNSUPPORTED_QA08_MODE" }
    prepareAutomation()
    try {
      if (mode == "compose") compose(args) else nativeResponse(mode!!, args)
      emit(mode!!, "PASS")
    } catch (failure: Throwable) {
      emit(mode!!, "FAIL", failure.javaClass.simpleName)
      throw failure
    }
  }

  private fun compose(args: Bundle) {
    val command = decoded(args, "qa08_command_base64", 300)
    val create = Regex("Remind me to QA08 [A-Za-z0-9 _-]{1,100} in [12] minutes?")
    val remove = Regex("Delete task \"QA08 [A-Za-z0-9 _-]{1,100}\"")
    require(create.matches(command) || remove.matches(command)) { "ONLY_OWN_QA08_COMMANDS_ALLOWED" }
    start(Intent().setClassName(context.packageName, "${context.packageName}.MainActivity"))
    hideKeyboard()
    if (!present("Message")) click("Chat")
    val editor = waitFor("Message")
    try {
      val existing = editor.text?.toString().orEmpty()
      require(existing.isEmpty() || existing == "Message LAFINA…" ||
        existing.startsWith("Remind me to QA08 ") || existing.startsWith("Delete task \"QA08 ")) {
        "UNKNOWN_COMPOSER_DRAFT_PRESERVED"
      }
      assertFalse("An existing command review must be resolved by its owner", present("Confirm change"))
      assertTrue("Whole-field command replacement failed", editor.performAction(
        AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply {
          putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, command)
        }))
    } finally { editor.recycle() }
    stages.add("safe_qa08_composer_replaced")
    hideKeyboard()
    click("Send message")
    waitFor("Confirm change").recycle()
    stages.add("command_review_visible")
    click("Confirm change")
    waitAbsent("Confirm change")
    waitFor("Message").recycle()
    stages.add("command_confirmation_closed")
  }

  private fun nativeResponse(mode: String, args: Bundle) {
    val job = decoded(args, "qa08_job_base64", 1024)
    val occurrence = decoded(args, "qa08_occurrence_base64", 1024)
    val title = decoded(args, "qa08_title_base64", 200)
    require(title.startsWith("QA08 ")) { "ONLY_OWN_QA08_TITLE_ALLOWED" }
    val generation = args.getString("qa08_generation")?.toIntOrNull() ?: 0
    require(generation >= 1) { "QA08_GENERATION_REQUIRED" }
    val identity = ReminderIdentity(job, occurrence, generation)
    ReminderPolicy.validateIdentity(identity)
    start(ReminderIntents.intent(context, identity, ReminderIntents.OPEN))
    waitFor(title).recycle()
    click("Answer")
    waitFor("REMINDER RESPONSE").recycle()
    stages.add("answer_response_visible")
    when (mode) {
      "answer" -> {
        try {
          val audio = context.getSystemService(AudioManager::class.java)
          assertTrue("Answer must not start recording", audio.activeRecordingConfigurations.isEmpty())
          stages.add("no_active_recording_configuration")
        } catch (_: SecurityException) { stages.add("recording_configuration_query_unavailable") }
      }
      "ack" -> {
        setDraft("okay but remind me later")
        click("Review response")
        waitFor("Response not understood").recycle()
        stages.add("ambiguous_response_refused")
        click("Keep editing")
        waitAbsent("Response not understood")
        waitFor("REMINDER RESPONSE").recycle()
        setDraft("acknowledge")
        click("Review response")
        waitFor("Review reminder response").recycle()
        click("Keep editing")
        waitAbsent("Review reminder response")
        waitFor("REMINDER RESPONSE").recycle()
        stages.add("ack_review_cancelled")
        click("Review response")
        waitFor("Review reminder response").recycle()
        click("Confirm")
        waitAbsent("Review reminder response")
        waitAbsent("REMINDER RESPONSE")
        assertFalse("Confirmation ended in a recovery screen", present("Close"))
        stages.add("ack_confirmed_screen_closed")
      }
      "snooze" -> {
        hideKeyboard()
        click("Snooze 10 minutes")
        waitFor("Review reminder response").recycle()
        stages.add("snooze_review_visible")
        click("Confirm")
        waitAbsent("Review reminder response")
        waitAbsent("REMINDER RESPONSE")
        assertFalse("Confirmation ended in a recovery screen", present("Close"))
        stages.add("snooze_confirmed_screen_closed")
      }
      "timeout" -> {
        waitMatching(75_000) { it.text?.toString()?.startsWith("The response window ended.") == true }.recycle()
        stages.add("response_window_end_visible")
      }
    }
  }

  private fun setDraft(value: String) {
    setText("Reminder draft text", value)
  }
}
