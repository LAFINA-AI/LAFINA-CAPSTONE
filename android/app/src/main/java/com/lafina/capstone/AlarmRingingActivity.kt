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
import android.os.Build
import android.os.Bundle
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.core.content.ContextCompat
import java.util.Date

/**
 * Alarm phase A1: the full-screen ringing screen, shown over the lock screen.
 * It is native, not React Native, so it opens instantly and works when the
 * JS app is not running. It is not the reminder call screen: an alarm never
 * asks for the microphone.
 */
class AlarmRingingActivity : Activity() {
  private var waitingForKeyguardDismiss = false
  private var backInvokedCallback: OnBackInvokedCallback? = null

  private val stoppedReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (!waitingForKeyguardDismiss) {
        finish()
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val callback = OnBackInvokedCallback {
        // Ignore Back while an alarm is actively ringing so it must be Dismissed or Snoozed.
        if (LafinaAlarmService.ringing == null && LafinaAlarmService.fallbackRinging == null && !waitingForKeyguardDismiss) {
          finish()
        }
      }
      backInvokedCallback = callback
      onBackInvokedDispatcher.registerOnBackInvokedCallback(
          OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
    }

    ContextCompat.registerReceiver(
        this, stoppedReceiver, IntentFilter(LafinaAlarms.ACTION_STOPPED), ContextCompat.RECEIVER_NOT_EXPORTED)

    bindRingingRequest()
  }

  private fun requestFromIntent(source: Intent?): RingRequest? {
    val id = source?.getStringExtra(LafinaAlarms.EXTRA_ALARM_ID)?.takeIf { it.isNotBlank() } ?: return null
    return RingRequest(
        alarmId = id,
        generation = source.getLongExtra(LafinaAlarms.EXTRA_GENERATION, 0L),
        label = source.getStringExtra(LafinaAlarmService.EXTRA_LABEL).orEmpty().ifBlank { "Alarm" },
        vibrate = source.getBooleanExtra(LafinaAlarmService.EXTRA_VIBRATE, true),
        soundUri = source.getStringExtra(LafinaAlarmService.EXTRA_SOUND),
        isTest = source.getBooleanExtra(LafinaAlarms.EXTRA_IS_TEST, false))
  }

  private fun activeRequest(): RingRequest? =
      LafinaAlarmService.ringing ?: LafinaAlarmService.fallbackRinging ?: requestFromIntent(intent)

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    waitingForKeyguardDismiss = false
    bindRingingRequest()
  }

  override fun onResume() {
    super.onResume()
    if (waitingForKeyguardDismiss) {
      val keyguard = getSystemService(KeyguardManager::class.java)
      if (LafinaAlarmService.ringing == null && LafinaAlarmService.fallbackRinging == null && keyguard?.isKeyguardLocked != true) {
        waitingForKeyguardDismiss = false
        finish()
      }
      return
    }
    bindRingingRequest()
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    if (LafinaAlarmService.ringing == null && LafinaAlarmService.fallbackRinging == null && !waitingForKeyguardDismiss) {
      @Suppress("DEPRECATION")
      super.onBackPressed()
    }
  }

  private fun bindRingingRequest() {
    val request = activeRequest()
    if (request == null) {
      finish()
      return
    }
    val definition = if (request.isTest) null else synchronized(LafinaAlarms.LOCK) { LafinaAlarms.registry(this).get(request.alarmId) }
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
      if (waitingForKeyguardDismiss || isFinishing || isDestroyed) return@button
      if (briefing) {
        waitingForKeyguardDismiss = true
        LafinaAlarmService.finish(this, AlarmEvent.DISMISSED)
        openForBriefing {
          waitingForKeyguardDismiss = false
          if (!isFinishing && !isDestroyed) finish()
        }
      } else {
        LafinaAlarmService.finish(this, AlarmEvent.DISMISSED)
        finish()
      }
    })
    setContentView(root)
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
      waitingForKeyguardDismiss = true
      keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() {
          waitingForKeyguardDismiss = false
          if (isFinishing || isDestroyed) return
          runCatching { startActivity(open) }
          onDone()
        }

        override fun onDismissCancelled() {
          waitingForKeyguardDismiss = false
          onDone()
        }

        override fun onDismissError() {
          waitingForKeyguardDismiss = false
          onDone()
        }
      })
    } else {
      waitingForKeyguardDismiss = false
      runCatching { startActivity(open) }
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
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      backInvokedCallback?.let { cb ->
        try {
          onBackInvokedDispatcher.unregisterOnBackInvokedCallback(cb)
        } catch (_: Exception) {
        }
      }
      backInvokedCallback = null
    }
    try {
      unregisterReceiver(stoppedReceiver)
    } catch (_: Exception) {
    }
    super.onDestroy()
  }
}
