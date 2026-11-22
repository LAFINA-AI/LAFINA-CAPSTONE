package com.lafina.capstone

import android.app.Activity
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import java.util.Date

/**
 * Alarm phase A1: the full-screen ringing screen, shown over the lock screen.
 * It is native, not React Native, so it opens instantly and works when the
 * JS app is not running. It is not the reminder call screen: an alarm never
 * asks for the microphone.
 */
class AlarmRingingActivity : Activity() {
  private val stoppedReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      finish()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    val request = LafinaAlarmService.ringing
    if (request == null) {
      finish()
      return
    }
    val definition = if (request.isTest) null else LafinaAlarms.registry(this).get(request.alarmId)
    val snoozeMinutes = definition?.snoozeMinutes
    val briefing = definition?.briefing == true

    val background = Color.parseColor("#0E0E12")
    val accent = Color.parseColor("#E5484D")
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(background)
      val pad = dp(32)
      setPadding(pad, pad, pad, pad)
    }
    root.addView(TextView(this).apply {
      text = DateFormat.getTimeFormat(this@AlarmRingingActivity).format(Date())
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 64f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    })
    root.addView(TextView(this).apply {
      text = request.label
      setTextColor(Color.parseColor("#C9C9D1"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      gravity = Gravity.CENTER
      setPadding(0, dp(8), 0, dp(48))
    })
    snoozeMinutes?.let { minutes ->
      root.addView(button("Snooze $minutes min", Color.parseColor("#2A2A33"), Color.WHITE) {
        LafinaAlarmService.finish(this, AlarmEvent.SNOOZED)
        finish()
      })
    }
    root.addView(button("Dismiss", accent, Color.WHITE) {
      LafinaAlarmService.finish(this, AlarmEvent.DISMISSED)
      if (briefing) {
        openForBriefing { finish() }
      } else {
        finish()
      }
    })
    setContentView(root)

    ContextCompat.registerReceiver(
        this, stoppedReceiver, IntentFilter(LafinaAlarms.ACTION_STOPPED), ContextCompat.RECEIVER_NOT_EXPORTED)
  }

  /**
   * Alarm phase A4: opens LAFINA so it can read today's schedule aloud. Over
   * the lock screen Android first asks the student to unlock; JS plays the
   * briefing when the app comes up (it reads the queued Dismiss event).
   */
  private fun openForBriefing(onDone: () -> Unit = {}) {
    val open = Intent(this, MainActivity::class.java).apply {
      putExtra(LafinaAlarms.EXTRA_OPEN_ALARMS, false)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val keyguard = getSystemService(KeyguardManager::class.java)
    if (keyguard?.isKeyguardLocked == true) {
      keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() {
          startActivity(open)
          onDone()
        }

        override fun onDismissCancelled() {
          onDone()
        }

        override fun onDismissError() {
          onDone()
        }
      })
    } else {
      startActivity(open)
      onDone()
    }
  }

  private fun button(label: String, fill: Int, textColor: Int, onPress: () -> Unit): Button =
      Button(this).apply {
        text = label
        isAllCaps = false
        setTextColor(textColor)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
        minHeight = dp(64)
        background = GradientDrawable().apply {
          setColor(fill)
          cornerRadius = dp(32).toFloat()
        }
        contentDescription = label
        setOnClickListener { onPress() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            .apply { topMargin = dp(16) }
      }

  private fun dp(value: Int): Int =
      TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

  override fun onDestroy() {
    try {
      unregisterReceiver(stoppedReceiver)
    } catch (_: Exception) {
    }
    super.onDestroy()
  }
}
