package com.lafina.capstone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/** What to ring: from a saved alarm, or the "test alarm in 1 minute" button. */
data class RingRequest(
    val alarmId: String,
    val generation: Long,
    val label: String,
    val vibrate: Boolean,
    val soundUri: String?,
    val isTest: Boolean,
)

/**
 * Alarm phase A1: rings an alarm until the student dismisses or snoozes it, or
 * for at most 10 minutes. The tone plays with USAGE_ALARM, so it sounds even
 * when the phone is on silent or vibrate (the reminder call ringtone does not).
 * Dismiss and Snooze work here, natively, even when the JS app is not running.
 * An alarm never opens the microphone.
 */
class LafinaAlarmService : Service() {
  companion object {
    const val CHANNEL_ID = "lafina_alarm_v1"
    const val NOTIFICATION_ID = 7402
    private const val ACTION_RING = "com.lafina.capstone.ALARM_RING"
    private const val MAX_RING_MS = 10 * 60_000L
    internal const val EXTRA_LABEL = "label"
    internal const val EXTRA_VIBRATE = "vibrate"
    internal const val EXTRA_SOUND = "sound"
    private const val CHANNEL_FALLBACK_ID = "lafina_alarm_fallback_v1"

    @Volatile private var instance: LafinaAlarmService? = null
    @Volatile var ringing: RingRequest? = null
      private set
    @Volatile var fallbackRinging: RingRequest? = null
      private set

    fun start(context: Context, request: RingRequest): Boolean {
      val intent = Intent(context, LafinaAlarmService::class.java).apply {
        action = ACTION_RING
        putExtra(LafinaAlarms.EXTRA_ALARM_ID, request.alarmId)
        putExtra(LafinaAlarms.EXTRA_GENERATION, request.generation)
        putExtra(LafinaAlarms.EXTRA_IS_TEST, request.isTest)
        putExtra(EXTRA_LABEL, request.label)
        putExtra(EXTRA_VIBRATE, request.vibrate)
        putExtra(EXTRA_SOUND, request.soundUri)
      }
      return try {
        ContextCompat.startForegroundService(context, intent)
        true
      } catch (_: Exception) {
        postFallbackAlarmNotification(context, request)
        false
      }
    }

    private fun createFallbackChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val alarmAttributes = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
          ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      val channel = NotificationChannel(CHANNEL_FALLBACK_ID, "LAFINA alarm fallback", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Audible fallback when Android blocks the alarm foreground service"
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        setSound(sound, alarmAttributes)
        enableVibration(true)
        vibrationPattern = AlertPreferencesContract.STANDARD_ALARM_WAVEFORM
        setBypassDnd(true)
      }
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
    }

    private fun postFallbackAlarmNotification(context: Context, request: RingRequest) {
      try {
        fallbackRinging = request
        createFallbackChannel(context)
        val fullScreen = PendingIntent.getActivity(
            context,
            0,
            Intent(context, AlarmRingingActivity::class.java).apply {
              putExtra(LafinaAlarms.EXTRA_ALARM_ID, request.alarmId)
              putExtra(LafinaAlarms.EXTRA_GENERATION, request.generation)
              putExtra(LafinaAlarms.EXTRA_IS_TEST, request.isTest)
              putExtra(EXTRA_LABEL, request.label)
              putExtra(EXTRA_VIBRATE, request.vibrate)
              putExtra(EXTRA_SOUND, request.soundUri)
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val dismiss = PendingIntent.getBroadcast(
            context,
            1,
            Intent(context, AlarmFireReceiver::class.java).setAction(LafinaAlarms.ACTION_DISMISS),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, CHANNEL_FALLBACK_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(request.label)
            .setContentText("LAFINA alarm")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(fullScreen, true)
            .setContentIntent(fullScreen)
            .setAutoCancel(true)
            .addAction(0, "Dismiss", dismiss)
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
      } catch (_: Exception) {
      }
    }

    /** Dismiss or Snooze from the ringing screen, the notification or JS. */
    fun finish(context: Context, kind: String) {
      val active = instance
      if (active == null || ringing == null) {
        // Service did not start (fallback notification path): still cancel and record outcome.
        val fallback = fallbackRinging
        fallbackRinging = null
        try { NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID) } catch (_: Exception) {}
        if (fallback != null && !fallback.isTest) {
          val now = System.currentTimeMillis()
          if (kind == AlarmEvent.SNOOZED) {
            synchronized(LafinaAlarms.LOCK) {
              val registry = LafinaAlarms.registry(context)
              registry.get(fallback.alarmId)?.takeIf { it.generation == fallback.generation }?.let { current ->
                val until = AlarmSchedule.snoozeUntil(current, now)
                registry.put(current.copy(snoozeUntilMs = until))
                LafinaAlarms.bookSnooze(context, current, until)
              }
            }
          }
          LafinaAlarms.recordEvent(context, AlarmEvent(fallback.alarmId, kind, now, fallback.generation))
        }
        try { context.sendBroadcast(Intent(LafinaAlarms.ACTION_STOPPED).setPackage(context.packageName)) } catch (_: Exception) {}
        return
      }
      if (Looper.myLooper() == Looper.getMainLooper()) {
        active.stop(kind)
      } else {
        active.handler.post { active.stop(kind) }
      }
    }

    fun createChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val channel = NotificationChannel(CHANNEL_ID, "LAFINA alarms", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Alarms you set in LAFINA"
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        // The service plays the tone and vibration itself.
        setSound(null, null)
        enableVibration(false)
        setBypassDnd(true)
      }
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var rampStartedAt = 0L
  private var alarmFocusRequest: AudioFocusRequest? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action != ACTION_RING) {
      if (ringing == null) {
        try {
          createChannel(this)
          val fallback = RingRequest(LafinaAlarms.TEST_ALARM_ID, 0L, "Alarm", false, null, true)
          val notification = buildNotification(fallback)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
          } else {
            startForeground(NOTIFICATION_ID, notification)
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
          } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
          }
        } catch (_: Exception) {
        }
        stopSelf()
      }
      return START_NOT_STICKY
    }
    val request = RingRequest(
        alarmId = intent.getStringExtra(LafinaAlarms.EXTRA_ALARM_ID) ?: LafinaAlarms.TEST_ALARM_ID,
        generation = intent.getLongExtra(LafinaAlarms.EXTRA_GENERATION, 0L),
        label = intent.getStringExtra(EXTRA_LABEL).orEmpty().ifBlank { "Alarm" },
        vibrate = intent.getBooleanExtra(EXTRA_VIBRATE, true),
        soundUri = intent.getStringExtra(EXTRA_SOUND),
        isTest = intent.getBooleanExtra(LafinaAlarms.EXTRA_IS_TEST, false))
    // A second alarm while one rings replaces it; the first counts as timed out.
    ringing?.let { previous ->
      if (!previous.isTest) {
        LafinaAlarms.recordEvent(
            this, AlarmEvent(previous.alarmId, AlarmEvent.TIMED_OUT, System.currentTimeMillis(), previous.generation))
      }
      stopSound()
    }
    fallbackRinging = null
    ringing = request
    createChannel(this)
    val notification = buildNotification(request)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (_: Exception) {
      ringing = null
      if (instance === this) instance = null
      postFallbackAlarmNotification(this, request)
      stopSelf()
      return START_NOT_STICKY
    }
    acquireWakeLock()
    handler.removeCallbacksAndMessages(null)
    startSound(request)
    handler.postDelayed({ stop(AlarmEvent.TIMED_OUT) }, MAX_RING_MS)
    return START_NOT_STICKY
  }

  private fun buildNotification(request: RingRequest): Notification {
    val fullScreen = PendingIntent.getActivity(
        this,
        0,
        Intent(this, AlarmRingingActivity::class.java).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun action(action: String, code: Int) = PendingIntent.getBroadcast(
        this,
        code,
        Intent(this, AlarmFireReceiver::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val snoozeMinutes = if (request.isTest) null else synchronized(LafinaAlarms.LOCK) { LafinaAlarms.registry(this).get(request.alarmId)?.snoozeMinutes }
    return NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(request.label)
        .setContentText(if (request.isTest) "Your test alarm works." else "LAFINA alarm")
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setFullScreenIntent(fullScreen, true)
        .setContentIntent(fullScreen)
        .addAction(0, "Dismiss", action(LafinaAlarms.ACTION_DISMISS, 1))
        .apply {
          if (snoozeMinutes != null) addAction(0, "Snooze $snoozeMinutes min", action(LafinaAlarms.ACTION_SNOOZE, 2))
        }
        .build()
  }

  private fun startSound(request: RingRequest) {
    val prefs = AlertPreferencesStoreNative.read(this)
    val rampMs = AlertPreferencesContract.clampRampSeconds(prefs.alarmVolumeRampSec) * 1000L
    val initialVolume = if (rampMs <= 0L) 1.0f else 0.2f

    val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
    requestAlarmFocus(attributes)
    val candidates = listOfNotNull(
        AlertPreferencesContract.sanitizeToneUri(request.soundUri)
            ?.takeIf { it != AlertPreferencesContract.TONE_SILENT }
            ?.let { Uri.parse(it) },
        prefs.defaultAlarmSoundUri
            ?.takeIf { it != AlertPreferencesContract.TONE_SILENT }
            ?.let { Uri.parse(it) },
        RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM),
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
    fun startRamp() {
      if (rampMs <= 0L || player == null) return
      rampStartedAt = System.currentTimeMillis()
      handler.post(object : Runnable {
        override fun run() {
          val active = player ?: return
          val progress = ((System.currentTimeMillis() - rampStartedAt).toFloat() / rampMs).coerceIn(0f, 1f)
          val volume = 0.2f + 0.8f * progress
          try {
            active.setVolume(volume, volume)
          } catch (_: Exception) {
            return
          }
          if (progress < 1f) handler.postDelayed(this, 1000L)
        }
      })
    }

    fun ensureVibrationFallback() {
      if (vibrator != null) return
      val chosenWaveform = AlertPreferencesContract.alarmWaveform(prefs.alarmVibrationPattern)
      val waveform = chosenWaveform ?: AlertPreferencesContract.STANDARD_ALARM_WAVEFORM
      vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      }
      try {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(VibrationEffect.createWaveform(waveform, 0), attributes)
      } catch (_: Exception) {
      }
    }

    fun tryCandidate(index: Int) {
      if (ringing !== request) return
      if (index >= candidates.size) {
        player = null
        ensureVibrationFallback()
        return
      }
      val uri = candidates[index]
      try {
        val mp = MediaPlayer()
        player = mp
        mp.apply {
          setAudioAttributes(attributes)
          setDataSource(this@LafinaAlarmService, uri)
          isLooping = true
          setVolume(initialVolume, initialVolume)
          setOnPreparedListener { prepared ->
            if (player === prepared && ringing === request) {
              try {
                prepared.start()
                startRamp()
              } catch (_: Exception) {
                try { prepared.release() } catch (_: Exception) {}
                player = null
                tryCandidate(index + 1)
              }
            } else {
              try { prepared.release() } catch (_: Exception) {}
            }
          }
          setOnErrorListener { failed, _, _ ->
            if (player === failed) {
              try { failed.release() } catch (_: Exception) {}
              player = null
              tryCandidate(index + 1)
            }
            true
          }
          prepareAsync()
        }
      } catch (_: Exception) {
        player?.release()
        player = null
        tryCandidate(index + 1)
      }
    }

    tryCandidate(0)
    // Vibration also runs when requested or when no tone candidate could be opened.
    val chosenWaveform = AlertPreferencesContract.alarmWaveform(prefs.alarmVibrationPattern)
    if ((request.vibrate && chosenWaveform != null) || player == null) {
      val waveform = chosenWaveform ?: AlertPreferencesContract.STANDARD_ALARM_WAVEFORM
      vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      }
      try {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(VibrationEffect.createWaveform(waveform, 0), attributes)
      } catch (_: Exception) {
      }
    }
  }

  private fun requestAlarmFocus(attributes: AudioAttributes) {
    try {
      val manager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        alarmFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attributes)
            .build()
        alarmFocusRequest = req
        manager.requestAudioFocus(req)
      } else {
        @Suppress("DEPRECATION")
        manager.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
      }
    } catch (_: Exception) {
    }
  }

  private fun abandonAlarmFocus() {
    try {
      val manager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        alarmFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
        alarmFocusRequest = null
      } else {
        @Suppress("DEPRECATION")
        manager.abandonAudioFocus(null)
      }
    } catch (_: Exception) {
    }
  }

  private fun stopSound() {
    handler.removeCallbacksAndMessages(null)
    try {
      player?.stop()
    } catch (_: Exception) {
    }
    player?.release()
    player = null
    vibrator?.cancel()
    vibrator = null
    abandonAlarmFocus()
  }

  private fun acquireWakeLock() {
    val lock = wakeLock ?: (getSystemService(Context.POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lafina:alarm")
        .apply { setReferenceCounted(false) }
        .also { wakeLock = it }
    try {
      lock.acquire(MAX_RING_MS + 60_000L)
    } catch (_: Exception) {
    }
  }

  /** Ends the ring: Dismiss, Snooze or the 10-minute limit. */
  @Synchronized
  fun stop(kind: String) {
    val request = ringing ?: run {
      stopSelf()
      return
    }
    ringing = null
    val now = System.currentTimeMillis()
    if (!request.isTest) {
      if (kind == AlarmEvent.SNOOZED) {
        synchronized(LafinaAlarms.LOCK) {
          val registry = LafinaAlarms.registry(this)
          registry.get(request.alarmId)?.takeIf { it.generation == request.generation }?.let { current ->
            val until = AlarmSchedule.snoozeUntil(current, now)
            registry.put(current.copy(snoozeUntilMs = until))
            LafinaAlarms.bookSnooze(this, current, until)
          }
        }
      }
      LafinaAlarms.recordEvent(this, AlarmEvent(request.alarmId, kind, now, request.generation))
    }
    stopSound()
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    sendBroadcast(Intent(LafinaAlarms.ACTION_STOPPED).setPackage(packageName))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  override fun onDestroy() {
    stopSound()
    wakeLock?.let { if (it.isHeld) it.release() }
    if (instance === this) {
      ringing = null
      instance = null
    }
    super.onDestroy()
  }
}
