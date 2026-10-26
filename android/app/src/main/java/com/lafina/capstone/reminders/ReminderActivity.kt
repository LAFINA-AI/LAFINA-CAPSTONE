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
import com.lafina.capstone.voice.ReminderSpeechPreferences
import com.lafina.capstone.voice.SpeechPolicy
import com.lafina.capstone.voice.SystemSpeech
import com.lafina.capstone.voice.AnsweredDictationPanel
import java.time.Instant

/** Simulated alert; optional foreground hold-to-talk is offered only after durable ACK. */
class ReminderActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var identity: ReminderIdentity? = null
  private val presentation = ReminderPresentation()
  private var finishingAction = false
  private var deadlineTask: Runnable? = null
  private var screenContext: Context = this
  private var resumed = false
  private var spokenIdentity: ReminderIdentity? = null
  private var speechSequence = 0L
  private var speechStatus: TextView? = null
  private lateinit var speech: SystemSpeech
  private var answeredPanel: AnsweredDictationPanel? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    speech = SystemSpeech(this, { resumed && !isFinishing && !isDestroyed }, { event ->
      speechStatus?.text = when (event.optString("type")) {
        "start" -> "Reading this reminder. No microphone is active."
        "done" -> "Reading finished. Acknowledging this alert still does not complete the task."
        "cancelled" -> "Reading stopped. You can still acknowledge or snooze."
        "error" -> "Speech is unavailable. Use the visible reminder controls."
        else -> "Preparing the offline voice. You can use the reminder controls now."
      }
    })
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    identity = ReminderIntents.identity(this, intent)
    presentation.replace(identity)
    showMessage("Opening reminder…")
  }

  override fun onResume() {
    super.onResume()
    resumed = true
    if (answeredPanel == null) loadRecord()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    speech.release("REMINDER_CHANGED")
    answeredPanel?.release()
    answeredPanel = null
    finishingAction = false
    deadlineTask?.let(handler::removeCallbacks)
    deadlineTask = null
    identity = ReminderIntents.identity(this, intent)
    presentation.replace(identity)
    loadRecord()
  }

  private fun loadRecord() {
    val id = identity ?: run { finish(); return }
    val viewTicket = presentation.ticket()
    ReminderRuntime.worker.execute {
      try {
        val (record, appearance, speechPreferences) = ReminderRuntime.withStore(applicationContext) {
          Triple(it.get(id), it.appearance(), it.speechPreferences())
        }
        runOnUiThread {
          if (!resumed || finishingAction || !currentView(viewTicket)) return@runOnUiThread
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
            val closingTicket = presentation.ticket()
            handler.postDelayed({ if (currentView(closingTicket)) finish() }, 1500)
          } else showReminder(record, deadline, speechPreferences)
        }
      } catch (_: Exception) {
        runOnUiThread {
          if (resumed && !finishingAction && currentView(viewTicket)) showMessage("This reminder could not load. Open your planner to review it.")
        }
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
    findViewById<View>(android.R.id.content).isEnabled = true
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
    presentation.invalidate()
    deadlineTask?.let(handler::removeCallbacks)
    deadlineTask = null
    answeredPanel?.release()
    answeredPanel = null
    speech.release("REMINDER_ENDED")
    container().apply {
      text("LAFINA · ACADEMIC REMINDER", 16f)
      text(message, 22f)
      button("Close") { finish() }
    }
  }

  private fun showReminder(record: ReminderRecord, deadline: Instant, preferences: ReminderSpeechPreferences) {
    container().apply {
      text("SIMULATED REMINDER · NOT A PHONE CALL", 14f)
      text(record.title, 28f)
      text("Acknowledge this alert or snooze it. This does not complete the underlying task.")
      text("No microphone is active. The reminder closes after its 60-second response window.", 16f)
      speechStatus = text(if (preferences.enabled) "Offline voice will read this visible reminder when available."
        else if (preferences.reason != null) "Speech settings could not be read. The reminder controls remain available."
        else "Voice is off in Settings. This reminder remains available as text.", 16f)
      if (preferences.enabled) {
        button("Read reminder") { readReminder(record, preferences) }
        button("Stop reading") {
          speech.stop()
          speechStatus?.text = "Reading stopped. You can still acknowledge or snooze."
        }
        button("Android speech settings") { speech.release("SETTINGS_OPENED"); SystemSpeech.openSettings(this@ReminderActivity) }
      }
      button("Answer (acknowledge)") { applyAction(ReminderAction.ACK, offerDictation = true) }
      button("Snooze 10 minutes") { applyAction(ReminderAction.SNOOZE) }
      button("Acknowledge / Dismiss") { applyAction(ReminderAction.ACK) }
    }
    if (preferences.enabled && spokenIdentity != record.identity) {
      spokenIdentity = record.identity
      readReminder(record, preferences)
    }
    deadlineTask?.let(handler::removeCallbacks)
    val viewTicket = presentation.ticket()
    val id = record.identity
    deadlineTask = Runnable {
      if (!currentView(viewTicket)) return@Runnable
      ReminderRuntime.worker.execute {
        try {
          val result = ReminderRuntime.withStore(applicationContext) { it.timeout(id, ReminderPolicy.format(deadline), ReminderPolicy.format(Instant.now())) }
          if (result.applied) ReminderRuntime.cancelIdentity(applicationContext, id)
          ReminderRuntime.reconcile(applicationContext)
          runOnUiThread {
            if (!currentView(viewTicket)) return@runOnUiThread
            if (result.applied || result.record?.status != "RINGING") finish() else loadRecord()
          }
        } catch (_: Exception) { android.util.Log.e("CapstoneReminders", "VISIBLE_TIMEOUT_FAILED") }
      }
    }.also { handler.postDelayed(it, maxOf(1, deadline.toEpochMilli() - System.currentTimeMillis())) }
  }

  private fun applyAction(action: ReminderAction, offerDictation: Boolean = false) {
    if (finishingAction) return
    finishingAction = true
    speech.stop("REMINDER_ACTION")
    val id = identity ?: run { finish(); return }
    val viewTicket = presentation.ticket()
    findViewById<View>(android.R.id.content).isEnabled = false
    ReminderRuntime.worker.execute {
      try {
        val result = ReminderRuntime.withStore(applicationContext) { it.action(id, action, nowUtc = ReminderPolicy.format(Instant.now())) }
        if (result.applied) ReminderRuntime.cancelIdentity(applicationContext, id)
        ReminderRuntime.reconcile(applicationContext)
        runOnUiThread {
          if (!currentView(viewTicket)) return@runOnUiThread
          if (result.applied && offerDictation && action == ReminderAction.ACK) showAnswered()
          else if (result.applied) finish()
          else { finishingAction = false; showMessage("This reminder has already changed. No action was applied.") }
        }
      } catch (_: Exception) {
        runOnUiThread {
          if (currentView(viewTicket)) {
            finishingAction = false
            showMessage("The action was not saved. Reopen the reminder or use your planner.")
          }
        }
      }
    }
  }

  private fun showAnswered() {
    // Retire already queued ringing timeouts/loads, not just future Handler callbacks.
    presentation.invalidate()
    deadlineTask?.let(handler::removeCallbacks)
    deadlineTask = null
    speech.release("ANSWERED")
    finishingAction = false
    answeredPanel?.release()
    val answeredTicket = presentation.ticket()
    val panel = AnsweredDictationPanel(this, screenContext) { resumed && currentView(answeredTicket) }
    answeredPanel = panel
    container().apply {
      text("ALERT ACKNOWLEDGED", 24f)
      panel.attach(this)
      button("Close answered reminder") { finish() }
    }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == AnsweredDictationPanel.PERMISSION_REQUEST) {
      answeredPanel?.permissionResult(grantResults.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED)
    }
  }

  private fun readReminder(record: ReminderRecord, preferences: ReminderSpeechPreferences) {
    val options = preferences.options ?: return
    if (!resumed || finishingAction || identity != record.identity) return
    speech.initialize(options) { inventory ->
      if (!resumed || finishingAction || identity != record.identity) return@initialize
      if (!inventory.optBoolean("available")) {
        speechStatus?.text = "An installed offline voice is unavailable. Review Android speech settings or use the visible controls."
      } else {
        val result = speech.speak("reminder:${++speechSequence}", SpeechPolicy.reminderText(record.title))
        if (!result.optBoolean("accepted")) speechStatus?.text = "Speech could not start. Use the visible reminder controls."
      }
    }
  }

  override fun onPause() {
    resumed = false
    answeredPanel?.release()
    speech.release("REMINDER_HIDDEN")
    super.onPause()
  }

  override fun onDestroy() {
    presentation.invalidate()
    deadlineTask?.let(handler::removeCallbacks)
    answeredPanel?.release()
    speech.release("REMINDER_DESTROYED")
    super.onDestroy()
  }

  private fun currentView(ticket: ReminderViewTicket): Boolean =
    !isFinishing && !isDestroyed && presentation.accepts(ticket)
}
