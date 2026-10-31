package com.lafina.capstone.voice

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.text.InputFilter
import android.view.MotionEvent
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import com.lafina.capstone.R
import org.json.JSONObject

/** Foreground input only: text proposes a response; the owner validates and confirms it. */
class AnsweredDictationPanel(
  private val activity: Activity,
  private val themedContext: Context,
  private val visible: () -> Boolean,
  private val beforeCapture: () -> Boolean,
  private val onReview: (String) -> Unit,
  private val onEdit: () -> Unit,
) {
  private var session: String? = null
  private var held = false
  private var sequence = 0L
  private var phase = "idle"
  private var status: TextView? = null
  private var recognized: EditText? = null
  private var draft: EditText? = null
  private val input = SpeechInput(themedContext, visible, ::event, WhisperVocabulary.REMINDER_RESPONSE)

  fun attach(parent: LinearLayout) {
    fun label(value: String): TextView = TextView(themedContext).apply {
      text = value
      textSize = 18f
      setTextColor(themedContext.getColor(R.color.reminder_text))
      setPadding(0, 0, 0, themedContext.resources.getDimensionPixelSize(R.dimen.reminder_gap))
      parent.addView(this)
    }
    fun editor(name: String): EditText = EditText(themedContext).apply {
      contentDescription = name
      hint = name
      textSize = 18f
      setTextColor(themedContext.getColor(R.color.reminder_text))
      setHintTextColor(themedContext.getColor(R.color.reminder_text))
      filters = arrayOf(InputFilter.LengthFilter(2000))
      minLines = 2
      maxLines = 4
      parent.addView(this)
    }
    fun button(name: String, action: () -> Unit): Button = Button(themedContext).apply {
      text = name
      isAllCaps = false
      minHeight = themedContext.resources.getDimensionPixelSize(R.dimen.reminder_control)
      setOnClickListener { action() }
      parent.addView(this, LinearLayout.LayoutParams(-1, -2))
    }
    label("Answer has not acknowledged this alert. Say or type acknowledge, snooze, or snooze for 5 minutes. Review and confirm before anything changes. The task stays open.")
    label("Hold while speaking; release to transcribe offline. No microphone starts when you answer. The original response deadline still applies; closing clears unsaved words.")
    status = label("Type a draft or hold the microphone. An offline engine and microphone permission are required for speech.").apply {
      accessibilityLiveRegion = android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE
    }
    label("Draft text")
    draft = editor("Reminder draft text")
    draft?.addTextChangedListener(object : android.text.TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { onEdit() }
      override fun afterTextChanged(s: android.text.Editable?) = Unit
    })
    button("Review response") {
      cancel("REVIEW_REQUESTED")
      status?.text = if (draft?.text?.toString()?.trim().isNullOrEmpty()) "Type or review some words first."
        else "Reviewing your response. Only a separate confirmation can save it."
      onReview(draft?.text?.toString().orEmpty())
    }
    button("Hold to talk") {}.apply {
      contentDescription = "Hold to talk in answered reminder"
      // A click (including a delayed permission result) never starts the microphone.
      setOnTouchListener { view, motion ->
        when (motion.actionMasked) {
          MotionEvent.ACTION_DOWN -> { begin(); true }
          MotionEvent.ACTION_UP -> { endHold(); view.performClick(); true }
          MotionEvent.ACTION_CANCEL -> { cancel("TOUCH_CANCELLED"); true }
          else -> true
        }
      }
    }
    button("Cancel speech input") { cancel("USER_CANCELLED") }
    label("Recognized speech — review before use")
    recognized = editor("Recognized reminder speech")
    button("Replace draft with recognized speech") {
      val value = recognized?.text?.toString().orEmpty()
      if (value.isBlank()) status?.text = "No recognized words are ready. You can type instead."
      else { draft?.setText(value); status?.text = "Words copied to your draft. Tap Review response; no reminder action has been saved." }
    }
  }

  private fun begin() {
    if (!visible() || session != null) return
    // Stop/cancel TTS initialization before requesting permission or owning the mic.
    if (!beforeCapture()) return
    onEdit()
    if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      held = false
      status?.text = "Allow microphone access if you want dictation, then hold again. Typing remains available."
      try { activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), PERMISSION_REQUEST) }
      catch (_: Exception) { status?.text = "Microphone access could not be requested. Keep typing or check Android app settings." }
      return
    }
    held = true
    val id = "answered_${++sequence}_${android.os.SystemClock.elapsedRealtime()}"
    session = id
    recognized?.setText("")
    recognized?.isEnabled = false
    val result = try { input.start(id, "en-US", "auto") } catch (_: Exception) {
      release()
      status?.text = "Offline speech could not start. Your typed draft remains available. Try a new hold or keep typing."
      return
    }
    if (!result.optBoolean("accepted")) {
      session = null; held = false; phase = "idle"
      recognized?.isEnabled = true
      status?.text = "Offline speech could not start (${result.optString("reason", "UNAVAILABLE")}). Keep typing or use Chat to choose another engine."
    }
  }

  private fun endHold() {
    if (!held) return
    held = false
    val id = session ?: return
    val result = try { input.stop(id) } catch (_: Exception) {
      release()
      status?.text = "Speech input stopped without a transcript. Your typed draft remains available."
      return
    }
    if (!result.optBoolean("accepted") && session == id) cancel("HOLD_ENDED")
  }

  private fun event(value: JSONObject) {
    if (!visible() || value.optString("sessionId") != session) return
    phase = value.optString("type")
    status?.text = when (phase) {
      "preparing" -> "Preparing offline speech. Keep holding until recording starts."
      "recording" -> "Recording now. Keep holding; release to transcribe. Maximum 15 seconds."
      "transcribing" -> "Microphone stopped. Transcribing locally; your typed draft remains available."
      "result" -> {
        recognized?.setText(value.optString("transcript").take(2000))
        "Speech recognized. Review the words, explicitly copy them into your draft, then tap Review response. No action was saved."
      }
      "cancelled" -> when (val reason = value.optString("reason")) {
        "AUDIO_INTERRUPTED", "AUDIO_FOCUS_LOST" ->
          "Speech input stopped ($reason). Your typed draft is still available."
        else -> "Speech input stopped. Your typed draft is still available."
      }
      else -> "Speech input could not finish (${value.optString("reason", "UNAVAILABLE")}). Keep typing or try another hold."
    }
    if (phase in listOf("result", "error", "cancelled")) {
      session = null; held = false; recognized?.isEnabled = true; phase = "idle"
    }
  }

  fun permissionResult(granted: Boolean) {
    held = false
    status?.text = if (granted) "Microphone access allowed. Hold again when ready; nothing is recording."
      else "Microphone access was not allowed. Your manual draft and reminder controls remain available."
  }

  fun cancel(reason: String) {
    held = false
    val id = session
    session = null
    phase = "idle"
    if (id != null) try { input.cancel(id, reason) } catch (_: Exception) { }
    recognized?.isEnabled = true
    status?.text = "Speech input stopped. Hold again only when you are ready; your typed draft remains available."
  }

  fun release() { cancel("SCREEN_HIDDEN"); try { input.release() } catch (_: Exception) { } }

  companion object { const val PERMISSION_REQUEST = 6106 }
}
