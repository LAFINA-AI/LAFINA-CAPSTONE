package com.lafina.capstone.reminders

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
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

/** Simulated alert. Answer opens a bounded response session; only confirmation changes delivery. */
class ReminderActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var identity: ReminderIdentity? = null
  private val presentation = ReminderPresentation()
  private var finishingAction = false
  private var deadlineTask: Runnable? = null
  private var screenContext: Context = this
  private var resumed = false
  private var speechSequence = 0L
  private var speechEpoch = 0L
  private var speechStatus: TextView? = null
  private lateinit var speech: SystemSpeech
  private var answeredPanel: AnsweredDictationPanel? = null
  private var response: ReminderResponseSession? = null
  private var reviewDialog: AlertDialog? = null
  private var windowDeadlineElapsed: Long? = null

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
    loadRecord()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    retireResponse("REMINDER_CHANGED")
    finishingAction = false
    deadlineTask?.let(handler::removeCallbacks)
    deadlineTask = null
    val nextIdentity = ReminderIntents.identity(this, intent)
    if (nextIdentity != identity) windowDeadlineElapsed = null
    identity = nextIdentity
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
          // Keep Activity as the base so dialogs inherit its window token.
          // A configuration Context alone can style views but cannot own a dialog.
          screenContext = ContextThemeWrapper(this@ReminderActivity, R.style.ReminderTheme).apply {
            applyOverrideConfiguration(config)
          }
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
    retireResponse("REMINDER_ENDED")
    container().apply {
      text("LAFINA · ACADEMIC REMINDER", 16f)
      text(message, 22f)
      button("Close") { finish() }
    }
  }

  private fun showReminder(record: ReminderRecord, deadline: Instant, preferences: ReminderSpeechPreferences) {
    retireResponse("REMINDER_RELOADED")
    finishingAction = false
    val elapsed = SystemClock.elapsedRealtime()
    val candidateDeadline = elapsed + (deadline.toEpochMilli() - System.currentTimeMillis()).coerceIn(0, 60_000)
    windowDeadlineElapsed = minOf(windowDeadlineElapsed ?: candidateDeadline, candidateDeadline)
    response = ReminderResponseSession(record, ReminderPolicy.format(Instant.now()), elapsed,
      maxWindowMillis = (windowDeadlineElapsed!! - elapsed).coerceAtLeast(0))
    container().apply {
      text("SIMULATED REMINDER · NOT A PHONE CALL", 14f)
      text(record.title, 28f)
      text("Acknowledge this alert or snooze it. This does not complete the underlying task.")
      text("No microphone is active. The reminder closes after its 60-second response window.", 16f)
      speechStatus = text(if (preferences.enabled) "Answer to hear this reminder with an installed offline voice."
        else if (preferences.reason != null) "Speech settings could not be read. The reminder controls remain available."
        else "Voice is off in Profile. This reminder remains available as text.", 16f)
      if (preferences.enabled) {
        button("Read reminder") { readReminder(record, preferences) }
        button("Stop reading") {
          speech.stop()
          speechStatus?.text = "Reading stopped. You can still acknowledge or snooze."
        }
        button("Android speech settings") { speech.release("SETTINGS_OPENED"); SystemSpeech.openSettings(this@ReminderActivity) }
      }
      button("Answer") { showAnswered(record, deadline, preferences) }
      button("Snooze 10 minutes") { reviewResponse(ReminderResponseCommand(ReminderAction.SNOOZE)) }
      button("Acknowledge / Dismiss") { reviewResponse(ReminderResponseCommand(ReminderAction.ACK)) }
    }
    scheduleDeadline(record, deadline)
  }

  private fun scheduleDeadline(record: ReminderRecord, deadline: Instant) {
    deadlineTask?.let(handler::removeCallbacks)
    val viewTicket = presentation.ticket()
    val id = record.identity
    deadlineTask = Runnable {
      if (!currentView(viewTicket) || finishingAction) return@Runnable
      finishingAction = true
      retireResponse("RESPONSE_TIMEOUT")
      ReminderRuntime.worker.execute {
        try {
          val result = ReminderRuntime.withStore(applicationContext) {
            val now = ReminderPolicy.format(Instant.now())
            // Elapsed time still ends the visible window if the wall clock moved back.
            if (Instant.now() < deadline) it.action(id, ReminderAction.MISS, nowUtc = now,
              expectedSourceVersion = record.sourceVersion, expectedRingingDeadline = record.ringingDeadline)
            else it.timeout(id, ReminderPolicy.format(deadline), now)
          }
          if (result.applied) ReminderRuntime.cancelIdentity(applicationContext, id)
          ReminderRuntime.reconcile(applicationContext)
          runOnUiThread {
            if (!currentView(viewTicket)) return@runOnUiThread
            showMessage("The response window ended. Open Calendar to review this reminder; the task was not completed.")
          }
        } catch (_: Exception) {
          android.util.Log.e("CapstoneReminders", "VISIBLE_TIMEOUT_FAILED")
          runOnUiThread { if (currentView(viewTicket)) showMessage("The response window ended. Reminder status could not be verified; review Calendar.") }
        }
      }
    }.also { handler.postDelayed(it, maxOf(1, minOf(deadline.toEpochMilli() - System.currentTimeMillis(),
      (windowDeadlineElapsed ?: SystemClock.elapsedRealtime()) - SystemClock.elapsedRealtime()))) }
  }

  private fun reviewResponse(command: ReminderResponseCommand) {
    if (!resumed || finishingAction) return
    val session = response ?: return
    val now = ReminderPolicy.format(Instant.now())
    val review = session.prepare(command, now, SystemClock.elapsedRealtime()) ?: run {
      showMessage("This response window has ended. Review Calendar; no response was confirmed.")
      return
    }
    reviewDialog?.dismiss()
    stopSpeech("RESPONSE_REVIEW")
    answeredPanel?.cancel("RESPONSE_REVIEW")
    val ticket = presentation.ticket()
    reviewDialog = AlertDialog.Builder(screenContext)
      .setTitle("Review reminder response")
      .setMessage("${session.record.title}\n\n${ReminderResponsePolicy.review(command)}\nOnly this reminder is affected.")
      .setNegativeButton("Keep editing") { _, _ -> session.cancelReview() }
      .setPositiveButton("Confirm") { _, _ ->
        if (resumed && currentView(ticket) && response === session &&
          session.consume(review, ReminderPolicy.format(Instant.now()), SystemClock.elapsedRealtime())) applyAction(session, command)
        else if (currentView(ticket)) showMessage("The review expired. Open Calendar to check the reminder.")
      }.setOnCancelListener { session.cancelReview() }.create().also { it.show() }
  }

  private fun applyAction(session: ReminderResponseSession, command: ReminderResponseCommand) {
    if (finishingAction || response !== session) return
    finishingAction = true
    stopSpeech("REMINDER_ACTION")
    answeredPanel?.release()
    val id = session.record.identity
    val viewTicket = presentation.ticket()
    findViewById<View>(android.R.id.content).isEnabled = false
    ReminderRuntime.worker.execute {
      try {
        val result = ReminderRuntime.withStore(applicationContext) {
          it.action(id, command.action, minutes = command.minutes, nowUtc = ReminderPolicy.format(Instant.now()),
            expectedSourceVersion = session.record.sourceVersion, expectedRingingDeadline = session.record.ringingDeadline)
        }
        // A committed action stays committed even if subsequent OS reconciliation fails.
        var deliveryWarning = false
        try { if (result.applied) ReminderRuntime.cancelIdentity(applicationContext, id) }
        catch (_: Exception) { deliveryWarning = true }
        try {
          ReminderRuntime.reconcile(applicationContext)
          if (result.applied && command.action == ReminderAction.SNOOZE) {
            val current = result.record?.identity?.let { next -> ReminderRuntime.withStore(applicationContext) { it.get(next) } }
            if (current == null || current.deliveryState in listOf("UNAVAILABLE", "FAILED")) deliveryWarning = true
          }
        } catch (_: Exception) { deliveryWarning = true }
        runOnUiThread {
          if (!currentView(viewTicket)) return@runOnUiThread
          if (result.applied && deliveryWarning) showMessage("Your ${if (command.action == ReminderAction.SNOOZE) "snooze" else "acknowledgement"} was saved. Android delivery could not be verified. Check Calendar and Profile → Reminder delivery. The task is still open.")
          else if (result.applied) finish()
          else { finishingAction = false; showMessage("This reminder has already changed. No action was applied.") }
        }
      } catch (_: Exception) {
        runOnUiThread {
          if (currentView(viewTicket)) {
            finishingAction = false
            showMessage("The action could not be verified. Review Calendar before retrying; the task was not completed.")
          }
        }
      }
    }
  }

  private fun showAnswered(record: ReminderRecord, deadline: Instant, preferences: ReminderSpeechPreferences) {
    if (finishingAction || response?.active(ReminderPolicy.format(Instant.now()), SystemClock.elapsedRealtime()) != true) return
    // Answer retires old presentation callbacks, but does not write ACK or extend the deadline.
    presentation.invalidate()
    deadlineTask?.let(handler::removeCallbacks)
    deadlineTask = null
    stopSpeech("ANSWERED")
    finishingAction = false
    answeredPanel?.release()
    val answeredTicket = presentation.ticket()
    val panel = AnsweredDictationPanel(this, screenContext,
      visible = { resumed && !finishingAction && currentView(answeredTicket) &&
        response?.active(ReminderPolicy.format(Instant.now()), SystemClock.elapsedRealtime()) == true },
      beforeCapture = { stopSpeech("MICROPHONE_REQUESTED"); response?.active(ReminderPolicy.format(Instant.now()), SystemClock.elapsedRealtime()) == true },
      onReview = { text ->
        val command = ReminderResponsePolicy.parse(text)
        if (command != null) reviewResponse(command)
        else reviewDialog = AlertDialog.Builder(screenContext).setTitle("Response not understood")
          .setMessage("Use acknowledge, snooze, or snooze for 5 minutes (1–120). Nothing was changed. You can also use the reminder buttons.")
          .setPositiveButton("Keep editing", null).show()
      },
      onEdit = { response?.cancelReview(); reviewDialog?.dismiss(); reviewDialog = null })
    answeredPanel = panel
    container().apply {
      text("REMINDER RESPONSE", 24f)
      text(record.title, 28f)
      speechStatus = text(if (preferences.enabled) "Preparing the offline voice. Manual response controls are available."
        else "Voice is unavailable or off in Profile. Use text or the reminder buttons.", 16f)
      if (preferences.enabled) {
        button("Read reminder") { panel.cancel("READ_REMINDER"); readReminder(record, preferences) }
        button("Stop reading") { stopSpeech("USER_STOPPED") }
      }
      panel.attach(this)
      button("Acknowledge / Dismiss") { reviewResponse(ReminderResponseCommand(ReminderAction.ACK)) }
      button("Snooze 10 minutes") { reviewResponse(ReminderResponseCommand(ReminderAction.SNOOZE)) }
      button("Close without responding") { finish() }
    }
    scheduleDeadline(record, deadline)
    if (preferences.enabled) readReminder(record, preferences)
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
    val viewTicket = presentation.ticket()
    val epoch = ++speechEpoch
    speech.initialize(options) { inventory ->
      if (epoch != speechEpoch || !resumed || finishingAction || !currentView(viewTicket) || identity != record.identity) return@initialize
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
    presentation.invalidate()
    deadlineTask?.let(handler::removeCallbacks)
    deadlineTask = null
    retireResponse("REMINDER_HIDDEN")
    finishingAction = false
    super.onPause()
  }

  override fun onDestroy() {
    presentation.invalidate()
    deadlineTask?.let(handler::removeCallbacks)
    retireResponse("REMINDER_DESTROYED")
    super.onDestroy()
  }

  private fun currentView(ticket: ReminderViewTicket): Boolean =
    !isFinishing && !isDestroyed && presentation.accepts(ticket)

  private fun stopSpeech(reason: String) {
    speechEpoch++
    speech.stop(reason)
  }

  private fun retireResponse(reason: String) {
    response?.close()
    response = null
    reviewDialog?.dismiss()
    reviewDialog = null
    answeredPanel?.release()
    answeredPanel = null
    speechEpoch++
    speech.release(reason)
  }
}
