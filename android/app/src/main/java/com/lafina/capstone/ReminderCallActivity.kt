package com.lafina.capstone

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher

/**
 * The reminder call's full-screen intent target (ADR-037 amendment, 2026-11-25).
 *
 * MainActivity holds the whole private app and must not show over the lock
 * screen, so a full-screen intent aimed at it only woke the screen and left the
 * call hidden behind the keyguard. This small native screen shows over the lock
 * screen instead, with nothing but the call: Answer asks Android to unlock and
 * then opens the call in LAFINA; Decline ends the ring natively (same auto-snooze
 * path as an unanswered ring), so it works offline and without unlocking.
 * When the phone is not locked it forwards straight to LAFINA.
 */
class ReminderCallActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var identity: DeliveryIdentity? = null
  private var task: String = ""
  private var waitingForUnlock = false
  private var backInvokedCallback: OnBackInvokedCallback? = null

  private val watcher = object : Runnable {
    override fun run() {
      if (isFinishing) return
      val current = identity
      if (current == null || !LafinaReminderModule.isRingingCall(this@ReminderCallActivity, current)) {
        // Answered elsewhere, declined, timed out or replaced.
        if (!waitingForUnlock) finish()
        return
      }
      if (!waitingForUnlock && !isLocked()) {
        // Unlocked from the lock screen without tapping Answer: show the call in LAFINA.
        openInApp(LafinaReminderModule.ACTION_CALL)
        return
      }
      handler.postDelayed(this, WATCH_INTERVAL_MS)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      // A ringing call is ended with Answer or Decline, not Back.
      val callback = OnBackInvokedCallback {}
      backInvokedCallback = callback
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
    }
    bind(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    bind(intent)
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() = Unit

  private fun bind(intent: Intent?) {
    handler.removeCallbacks(watcher)
    val reminderId = intent?.getStringExtra("reminderId")?.takeIf { it.isNotBlank() }
    if (reminderId == null) {
      finish()
      return
    }
    val bound = DeliveryIdentity(
        intent.getStringExtra(LafinaReminderModule.EXTRA_OWNER_ID).orEmpty(),
        reminderId,
        intent.getLongExtra(LafinaReminderModule.EXTRA_GENERATION, 0L))
    identity = bound
    task = intent.getStringExtra("task").orEmpty()
    if (!LafinaReminderModule.isRingingCall(this, bound)) {
      finish()
      return
    }
    if (!isLocked()) {
      openInApp(LafinaReminderModule.ACTION_CALL)
      return
    }
    render()
    handler.postDelayed(watcher, WATCH_INTERVAL_MS)
  }

  private fun render() {
    val prefs = AlertPreferencesStoreNative.read(this)
    val label =
        if (prefs.lockScreenPrivacy == AlertPreferencesContract.PRIVACY_SHOW && task.isNotBlank()) task
        else "Scheduled academic reminder"
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#0E0E12"))
      val pad = dp(32)
      setPadding(pad, pad, pad, pad)
    }
    root.addView(text("LAFINA", 40f, Color.WHITE, bold = true))
    root.addView(text("Incoming reminder call", 18f, Color.parseColor("#9A9AA6")))
    root.addView(text(label, 22f, Color.parseColor("#E4E4EA")).apply { setPadding(0, dp(24), 0, dp(8)) })
    root.addView(text("Answer unlocks your phone to talk with LAFINA.", 14f, Color.parseColor("#7A7A86"))
        .apply { setPadding(0, 0, 0, dp(48)) })
    root.addView(button("Answer", Color.parseColor("#2EA043")) { answer() })
    root.addView(button("Decline", Color.parseColor("#E5484D")) { decline() })
    setContentView(root)
  }

  private fun answer() {
    val keyguard = getSystemService(KeyguardManager::class.java)
    if (keyguard?.isKeyguardLocked != true) {
      openInApp(LafinaReminderModule.ACTION_ANSWER)
      return
    }
    waitingForUnlock = true
    keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
      override fun onDismissSucceeded() {
        waitingForUnlock = false
        openInApp(LafinaReminderModule.ACTION_ANSWER)
      }
      override fun onDismissCancelled() = resumeWatching()
      override fun onDismissError() = resumeWatching()
    })
  }

  private fun resumeWatching() {
    waitingForUnlock = false
    handler.removeCallbacks(watcher)
    handler.post(watcher)
  }

  private fun decline() {
    identity?.let { LafinaReminderModule.declineFromLockScreen(this, it) }
    finish()
  }

  private fun openInApp(action: String) {
    handler.removeCallbacks(watcher)
    val current = identity
    if (current != null) {
      try {
        startActivity(LafinaReminderModule.mainCallIntent(this, current, task, action))
      } catch (_: Exception) {
        // The posted call notification still opens LAFINA.
      }
    }
    finish()
  }

  private fun isLocked(): Boolean =
      getSystemService(KeyguardManager::class.java)?.isKeyguardLocked == true

  private fun text(value: String, sizeSp: Float, color: Int, bold: Boolean = false): TextView =
      TextView(this).apply {
        text = value
        setTextColor(color)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        gravity = Gravity.CENTER
        if (bold) typeface = Typeface.DEFAULT_BOLD
      }

  private fun button(label: String, fill: Int, onPress: () -> Unit): Button =
      Button(this).apply {
        text = label
        isAllCaps = false
        setTextColor(Color.WHITE)
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
    handler.removeCallbacks(watcher)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      backInvokedCallback?.let { cb ->
        try {
          onBackInvokedDispatcher.unregisterOnBackInvokedCallback(cb)
        } catch (_: Exception) {
        }
      }
      backInvokedCallback = null
    }
    super.onDestroy()
  }

  private companion object {
    const val WATCH_INTERVAL_MS = 1_000L
  }
}
