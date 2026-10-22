package com.lafina.capstone.reminders

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ContextThemeWrapper
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.lafina.capstone.R
import java.time.Instant

/** Simulated reminder shell only: no telephony, microphone, foreground service or React runtime. */
class ReminderActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var identity: ReminderIdentity? = null
  private var finishingAction = false
  private var deadlineTask: Runnable? = null
  private var screenContext: Context = this

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    identity = ReminderIntents.identity(this, intent)
    showMessage("Opening reminder…")
  }

  override fun onResume() {
    super.onResume()
    loadRecord()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    identity = ReminderIntents.identity(this, intent)
    loadRecord()
  }

  private fun loadRecord() {
    val id = identity ?: run { finish(); return }
    ReminderRuntime.worker.execute {
      try {
        val (record, appearance) = ReminderRuntime.withStore(applicationContext) { it.get(id) to it.appearance() }
        runOnUiThread {
          if (isFinishing || finishingAction) return@runOnUiThread
          val config = Configuration(resources.configuration)
          if (appearance != "system") config.uiMode = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
            (if (appearance == "dark") Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO)
          screenContext = ContextThemeWrapper(createConfigurationContext(config), R.style.ReminderTheme)
          val lightBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
          val dark = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
          window.insetsController?.setSystemBarsAppearance(if (dark) 0 else lightBars, lightBars)
          val deadline = record?.ringingDeadline?.let(Instant::parse)
          if (record == null || !record.sourceValid || record.status != "RINGING" || deadline == null || deadline <= Instant.now()) {
            showMessage("This reminder has ended. Your planner remains available.")
            handler.postDelayed({ finish() }, 1500)
          } else showReminder(record, deadline)
        }
      } catch (_: Exception) {
        runOnUiThread { showMessage("This reminder could not load. Open your planner to review it.") }
      }
    }
  }

  private fun container(): LinearLayout {
    val padding = screenContext.resources.getDimensionPixelSize(R.dimen.reminder_padding)
    val content = LinearLayout(screenContext).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(padding, padding, padding, padding)
      setBackgroundColor(screenContext.getColor(R.color.reminder_background))
    }
    setContentView(ScrollView(screenContext).apply {
      isFillViewport = true
      setBackgroundColor(screenContext.getColor(R.color.reminder_background))
      setOnApplyWindowInsetsListener { view, insets ->
        val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
        view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
        insets
      }
      addView(content)
    })
    return content
  }

  private fun LinearLayout.text(value: String, size: Float = 18f): TextView = TextView(screenContext).apply {
    text = value
    textSize = size
    setTextColor(screenContext.getColor(R.color.reminder_text))
    setPadding(0, 0, 0, resources.getDimensionPixelSize(R.dimen.reminder_gap))
    addView(this)
  }

  private fun LinearLayout.button(label: String, click: () -> Unit) {
    addView(Button(screenContext).apply {
      text = label
      isAllCaps = false
      minHeight = resources.getDimensionPixelSize(R.dimen.reminder_control)
      setOnClickListener { click() }
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
  }

  private fun showMessage(message: String) {
    container().apply {
      text("LAFINA · ACADEMIC REMINDER", 16f)
      text(message, 22f)
      button("Close") { finish() }
    }
  }

  private fun showReminder(record: ReminderRecord, deadline: Instant) {
    container().apply {
      text("SIMULATED REMINDER · NOT A PHONE CALL", 14f)
      text(record.title, 28f)
      text("Acknowledge this alert or snooze it. This does not complete the underlying task.")
      text("No microphone or voice service is active. The reminder closes after its 60-second response window.", 16f)
      button("Answer (acknowledge)") { applyAction(ReminderAction.ACK) }
      button("Snooze 10 minutes") { applyAction(ReminderAction.SNOOZE) }
      button("Acknowledge / Dismiss") { applyAction(ReminderAction.ACK) }
    }
    deadlineTask?.let(handler::removeCallbacks)
    deadlineTask = Runnable {
      val id = identity ?: return@Runnable
      ReminderRuntime.worker.execute {
        try {
          val result = ReminderRuntime.withStore(applicationContext) { it.timeout(id, ReminderPolicy.format(deadline), ReminderPolicy.format(Instant.now())) }
          if (result.applied) ReminderRuntime.cancelIdentity(applicationContext, id)
          ReminderRuntime.reconcile(applicationContext)
          runOnUiThread { if (result.applied || result.record?.status != "RINGING") finish() else loadRecord() }
        } catch (_: Exception) { android.util.Log.e("CapstoneReminders", "VISIBLE_TIMEOUT_FAILED") }
      }
    }.also { handler.postDelayed(it, maxOf(1, deadline.toEpochMilli() - System.currentTimeMillis())) }
  }

  private fun applyAction(action: ReminderAction) {
    if (finishingAction) return
    finishingAction = true
    val id = identity ?: run { finish(); return }
    findViewById<View>(android.R.id.content).isEnabled = false
    ReminderRuntime.worker.execute {
      try {
        val result = ReminderRuntime.withStore(applicationContext) { it.action(id, action, nowUtc = ReminderPolicy.format(Instant.now())) }
        if (result.applied) ReminderRuntime.cancelIdentity(applicationContext, id)
        ReminderRuntime.reconcile(applicationContext)
        runOnUiThread {
          if (result.applied) finish()
          else { finishingAction = false; showMessage("This reminder has already changed. No action was applied.") }
        }
      } catch (_: Exception) {
        runOnUiThread { finishingAction = false; showMessage("The action was not saved. Reopen the reminder or use your planner.") }
      }
    }
  }

  override fun onDestroy() {
    deadlineTask?.let(handler::removeCallbacks)
    super.onDestroy()
  }
}
