package com.lafina.capstone

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise

class LafinaReminderService : Service() {

  private var wakeLock: PowerManager.WakeLock? = null
  private var lastStartId: Int = -1

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    lastStartId = startId
    if (intent?.action != ACTION_START_ACTIVE_CALL) {
      stopSelf(startId)
      return START_NOT_STICKY
    }

    val token = intent.getLongExtra(EXTRA_START_TOKEN, -1L)
    val task = intent.getStringExtra(EXTRA_TASK).orEmpty()
    val notification = createNotification(task)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (error: Exception) {
      synchronized(START_LOCK) {
        if (token >= 0L && pendingStarts > 0) pendingStarts -= 1
        if (token < 0L || token == startSequence) {
          val code = if (error is SecurityException) "PERMISSION_DENIED" else "SERVICE_START_FAILED"
          startPromise?.reject(code, "Microphone service could not start.", error)
          startPromise = null
        }
      }
      stopSelf(startId)
      return START_NOT_STICKY
    }
    synchronized(START_LOCK) {
      if (token >= 0L && pendingStarts > 0) pendingStarts -= 1
      if (token >= 0L && token != startSequence) {
        // Stale intent superseded by a newer begin(); stop if no active/pending start remains.
        if (running == null && pendingStarts <= 0) {
          try {
            stopForeground(STOP_FOREGROUND_REMOVE)
          } catch (_: Exception) {
          }
          stopSelf(startId)
        }
        return START_NOT_STICKY
      }
      running = this
      startPromise?.resolve(!stopRequested)
      startPromise = null
      if (stopRequested) {
        stopSelf(startId)
        return START_NOT_STICKY
      }
    }
    acquireWakeLock()
    return START_NOT_STICKY
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val serviceChannel = NotificationChannel(
        CHANNEL_ID,
        "LAFINA active reminder calls",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Keeps an answered offline reminder call active"
        setSound(null, null)
        enableVibration(false)
      }
      val manager = getSystemService(NotificationManager::class.java)
      manager?.createNotificationChannel(serviceChannel)
    }
  }

  private fun createNotification(task: String): Notification {
    val resumeIntent = Intent(this, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val resumePendingIntent = PendingIntent.getActivity(
      this,
      ACTIVE_CALL_REQUEST_CODE,
      resumeIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("LAFINA reminder call active")
      .setContentText(task.ifBlank { "Listening for your offline response" })
      .setSmallIcon(android.R.drawable.sym_call_incoming)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(Notification.CATEGORY_CALL)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setContentIntent(resumePendingIntent)
      .build()
  }

  private fun acquireWakeLock() {
    val lock = wakeLock ?: (getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lafina:active-reminder-call")
      .apply { setReferenceCounted(false) }
      .also { wakeLock = it }
    try {
      lock.acquire(MAX_WAKE_LOCK_MS)
    } catch (_: Exception) {
    }
  }

  private fun releaseWakeLock() {
    wakeLock?.let { lock ->
      if (lock.isHeld) lock.release()
    }
    wakeLock = null
  }

  override fun onDestroy() {
    synchronized(START_LOCK) {
      if (running === this) {
        running = null
        if (pendingStarts <= 0) {
          startPromise?.reject("SERVICE_DESTROYED", "Microphone service stopped before completing startup.")
          startPromise = null
        }
      }
    }
    releaseWakeLock()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    private val START_LOCK = Any()
    private var running: LafinaReminderService? = null
    private var stopRequested = false
    private var startPromise: Promise? = null
    private var startSequence = 0L
    private var pendingStarts = 0

    fun begin(context: Context, intent: Intent, promise: Promise) = synchronized(START_LOCK) {
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) !=
          PackageManager.PERMISSION_GRANTED) {
        promise.reject("PERMISSION_DENIED", "Microphone permission is required for an active reminder call.")
        return@synchronized
      }
      startPromise?.reject("SUPERSEDED", "Another call replaced this startup.")
      val token = ++startSequence
      intent.putExtra(EXTRA_START_TOKEN, token)
      startPromise = promise
      stopRequested = false
      try {
        ContextCompat.startForegroundService(context, intent)
        pendingStarts += 1
      } catch (error: Exception) {
        startPromise = null
        throw error
      }
    }

    fun requestStop() = synchronized(START_LOCK) {
      stopRequested = true
      // A pending start must first reach startForeground; stopping before then
      // can trigger ForegroundServiceDidNotStartInTimeException.
      val active = running
      if (active != null) {
        if (active.lastStartId > 0) active.stopSelf(active.lastStartId)
        else active.stopSelf()
      }
    }
    const val ACTION_START_ACTIVE_CALL = "com.lafina.capstone.ACTION_START_ACTIVE_CALL"
    const val EXTRA_TASK = "extra_task"
    private const val EXTRA_START_TOKEN = "extra_start_token"
    private const val CHANNEL_ID = "lafina_active_call_channel"
    private const val NOTIFICATION_ID = 4001
    private const val ACTIVE_CALL_REQUEST_CODE = 4002
    private const val MAX_WAKE_LOCK_MS = 10 * 60 * 1000L // 10 minutes max
  }
}
