package com.lafina.capstone.reminders

import android.os.Bundle
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Explicit, bounded UI settings changes; the caller records and restores its prior values. */
class ReminderSettingsUiTest : Qa08UiDriver() {
  @Test fun configureExplicitReminderSettings() {
    val args = InstrumentationRegistry.getArguments()
    val mode = args.getString("qa08_mode")
    assumeTrue("Explicit QA08 settings arguments required", mode != null)
    require(mode in setOf("preferences", "delivery")) { "UNSUPPORTED_QA08_SETTINGS_MODE" }
    prepareAutomation()
    try {
      enterPreferences()
      if (mode == "preferences") preferences(args) else delivery(args)
      emit(mode!!, "PASS", key = "phase08_settings_ui_driver")
    } catch (failure: Throwable) {
      emit(mode!!, "FAIL", failure.javaClass.simpleName, "phase08_settings_ui_driver")
      throw failure
    }
  }

  private fun enterPreferences() {
    startMain()
    if (present("Back to preferences")) click("Back to preferences")
    if (!present("Planner preferences")) {
      click("Profile")
      click("Scheduling & Reminder Preferences")
    }
    reveal("Planner preferences").recycle()
    val discard = reveal("Discard unsaved changes")
    try {
      assertFalse("Existing unsaved preferences must be preserved by their owner", discard.isEnabled)
    } finally { discard.recycle() }
    stages.add("saved_preferences_open")
  }

  private fun preferences(args: Bundle) {
    val lead = args.getString("qa08_lead")?.toIntOrNull()
    require(lead != null && lead in 0..120) { "QA08_LEAD_0_TO_120_REQUIRED" }
    val reply = args.getString("qa08_reply")
    require(reply in setOf("text", "voice", "both")) { "QA08_REPLY_REQUIRED" }
    val quiet = explicitBoolean(args, "qa08_quiet")

    // Compare these in memory only; they are never edited or included in status output.
    reveal("Nickname (optional)").recycle()
    val nickname = text("Nickname (optional)")
    reveal("Timezone").recycle()
    val timezone = text("Timezone")
    reveal("Default reminder lead (minutes)").recycle()
    setText("Default reminder lead (minutes)", lead.toString())
    click("Reply preference: ${reply!!.replaceFirstChar { it.uppercase() }}")
    if (checked("Quiet hours preference") != quiet) click("Quiet hours preference")
    click("Save preferences")
    waitFor("Preferences saved on this phone.").recycle()
    reveal("Nickname (optional)").recycle()
    assertTrue("Nickname must remain unchanged", nickname == text("Nickname (optional)"))
    reveal("Timezone").recycle()
    assertTrue("Timezone must remain unchanged", timezone == text("Timezone"))
    stages.add("only_lead_reply_quiet_controls_saved")
  }

  private fun delivery(args: Bundle) {
    val enabled = explicitBoolean(args, "qa08_enabled")
    val fullScreen = explicitBoolean(args, "qa08_full_screen")
    click("Reminder delivery")
    waitFor("Android reminders").recycle()
    setToggle(enabled, "Turn reminder delivery off", "Enable Android reminder delivery")
    setToggle(fullScreen, "Turn full-screen alerts off", "Allow full-screen reminder alerts")
    stages.add("explicit_delivery_and_full_screen_preferences_applied")
  }

  private fun setToggle(wanted: Boolean, whenEnabled: String, whenDisabled: String) {
    // Reveal either current label without clicking; a state change always uses its known opposite.
    val current = revealEither(whenEnabled, whenDisabled)
    val enabled = try {
      current.contentDescription?.toString() == whenEnabled || current.text?.toString() == whenEnabled
    } finally { current.recycle() }
    if (enabled != wanted) click(if (enabled) whenEnabled else whenDisabled)
    reveal(if (wanted) whenEnabled else whenDisabled).recycle()
  }

  private fun explicitBoolean(args: Bundle, key: String): Boolean {
    return when (args.getString(key)) {
      "true" -> true
      "false" -> false
      else -> throw IllegalArgumentException("QA08_EXPLICIT_BOOLEAN_REQUIRED: $key")
    }
  }
}
