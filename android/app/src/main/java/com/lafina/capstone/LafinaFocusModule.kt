package com.lafina.capstone

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Independent of reminder/alarm registries: a single, user-started study timer. */
internal object FocusTimer {
  private const val PREFS = "lafina_focus_v1"
  const val ACTION = "com.lafina.capstone.FOCUS_END"
  private const val CHANNEL = "lafina_focus_sessions_v1"
  private const val ID = 41027
  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private fun pending(c: Context) = PendingIntent.getBroadcast(c, ID,
    Intent(c, FocusTimerReceiver::class.java).setAction(ACTION),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  @Synchronized fun restoreSilence(c: Context) {
    val p = prefs(c)
    if (!p.getBoolean("silencing", false)) return
    val nm = c.getSystemService(NotificationManager::class.java)
    try {
      if (nm.isNotificationPolicyAccessGranted) {
        // Android 15+ deactivates this app's implicit rule rather than changing global DND.
        if (Build.VERSION.SDK_INT >= 35) nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL)
        else if (nm.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALARMS)
          nm.setInterruptionFilter(p.getInt("previousFilter", NotificationManager.INTERRUPTION_FILTER_ALL))
      }
    } catch (_: SecurityException) { /* Access can be revoked while a session runs. */ }
    finally { p.edit().putBoolean("silencing", false).commit() }
  }
  @Synchronized fun cancel(c: Context) {
    c.getSystemService(AlarmManager::class.java).cancel(pending(c))
    prefs(c).edit().remove("deadline").commit()
    restoreSilence(c)
  }
  @Synchronized fun schedule(c: Context, owner: String, deadline: Long, focus: Boolean, silence: Boolean): Boolean {
    cancel(c)
    val p = prefs(c)
    p.edit().putLong("deadline", deadline).putString("owner", owner).putBoolean("focus", focus).commit()
    val am = c.getSystemService(AlarmManager::class.java)
    var exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
    if (exact) {
      try {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, deadline, pending(c))
      } catch (_: SecurityException) {
        exact = false
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, deadline, pending(c))
      }
    } else {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, deadline, pending(c))
    }
    val nm = c.getSystemService(NotificationManager::class.java)
    if (silence && focus && nm.isNotificationPolicyAccessGranted) {
      p.edit().putInt("previousFilter", nm.currentInterruptionFilter).putBoolean("silencing", true).commit()
      try { nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALARMS) }
      catch (error: Exception) { restoreSilence(c); throw error }
    }
    return exact
  }
  @Synchronized fun receive(c: Context) {
    val p = prefs(c)
    val deadline = p.getLong("deadline", 0)
    if (deadline == 0L) return
    if (System.currentTimeMillis() + 500 < deadline) {
      // Reboot, clock change, or a stale broadcast: book the current deadline.
      val owner = p.getString("owner", "") ?: ""
      val focus = p.getBoolean("focus", true)
      val silence = p.getBoolean("silencing", false)
      schedule(c, owner, deadline, focus, silence)
      return
    }
    val focus = p.getBoolean("focus", true)
    cancel(c)
    val nm = c.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(NotificationChannel(CHANNEL, "Focus sessions", NotificationManager.IMPORTANCE_HIGH))
    if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return
    val open = PendingIntent.getActivity(c, ID, Intent(c, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(c, CHANNEL)
      .setSmallIcon(R.drawable.ic_reminder)
      .setContentTitle(if (focus) "Focus session complete" else "Break complete")
      .setContentText(if (focus) "Your session is saved. Time for a break." else "Ready for your next focus session?")
      .setContentIntent(open).setAutoCancel(true).setCategory(NotificationCompat.CATEGORY_REMINDER).build()
    try { nm.notify(ID, notification) } catch (_: SecurityException) { /* Visual timer remains available. */ }
  }
}

class FocusTimerReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    runCatching { FocusTimer.receive(context) }
  }
}

class LafinaFocusModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "LafinaFocus"
  @ReactMethod fun schedule(owner: String, deadline: Double, focus: Boolean, silence: Boolean, promise: Promise) {
    try { promise.resolve(FocusTimer.schedule(context, owner, deadline.toLong(), focus, silence)) }
    catch (error: Exception) { promise.reject("FOCUS_SCHEDULE", error.message, error) }
  }
  @ReactMethod fun cancel(promise: Promise) {
    try { FocusTimer.cancel(context); promise.resolve(true) }
    catch (error: Exception) { promise.reject("FOCUS_CANCEL", error.message, error) }
  }
  @ReactMethod fun silenceAccess(promise: Promise) {
    promise.resolve(context.getSystemService(NotificationManager::class.java).isNotificationPolicyAccessGranted)
  }
  @ReactMethod fun openSilenceSettings(promise: Promise) {
    try {context.startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));promise.resolve(true)}
    catch (error: Exception) {promise.reject("FOCUS_SETTINGS", error.message, error)}
  }
}
