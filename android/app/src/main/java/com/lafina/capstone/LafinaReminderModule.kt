package com.lafina.capstone

import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.common.LifecycleState
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference
import org.json.JSONObject

class LafinaReminderModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener, LifecycleEventListener {

  private var activeRingtone: Ringtone? = null

  init {
    reactContext.addActivityEventListener(this)
    reactContext.addLifecycleEventListener(this)
    liveContext = WeakReference(reactContext)
  }

  override fun onHostResume() = Unit
  override fun onHostPause() = Unit
  override fun onHostDestroy() = Unit

  override fun invalidate() {
    reactContext.removeActivityEventListener(this)
    reactContext.removeLifecycleEventListener(this)
    try {
      activeRingtone?.stop()
    } catch (_: Exception) {
    }
    activeRingtone = null
    super.invalidate()
  }

  override fun getName(): String = "LafinaReminder"

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  /**
   * Registers one delivery generation. `ownerId`/`generation` are optional so an
   * older JS bundle still works (adopted as owner "" generation 0). Resolving
   * true means Android accepted the alarm, not that it has rung.
   */
  @ReactMethod
  fun scheduleExactAlarm(options: ReadableMap, promise: Promise) {
    try {
      val reminderId = options.getString("reminderId")?.trim().orEmpty()
      val task = options.getString("task")?.trim().orEmpty()
      val triggerAtMs = options.getDouble("triggerAtMs").toLong()
      val ownerId =
          if (options.hasKey("ownerId") && !options.isNull("ownerId")) options.getString("ownerId").orEmpty()
          else ""
      val generation =
          if (options.hasKey("generation") && !options.isNull("generation")) options.getDouble("generation").toLong()
          else 0L
      // Optional: older JS bundles send no style and keep ringing as a call.
      val style =
          if (options.hasKey("style") && !options.isNull("style")) options.getString("style").orEmpty()
          else DeliveryContract.STYLE_CALL
      require(reminderId.isNotEmpty()) { "reminderId is required" }
      require(triggerAtMs > System.currentTimeMillis()) { "triggerAtMs must be in the future" }
      val registration =
          DeliveryRegistration(
              DeliveryIdentity(ownerId, reminderId, generation),
              triggerAtMs,
              task,
              if (style in DeliveryContract.STYLES) style else DeliveryContract.STYLE_CALL)
      if (options.hasKey("autoSnoozeMinutes") && options.hasKey("remainingSnoozes")) {
        check(reactContext.getSharedPreferences("lafina_call_policies", Context.MODE_PRIVATE).edit()
          .putString(registration.identity.uri(ACTION_CALL), JSONObject()
            .put("minutes", options.getInt("autoSnoozeMinutes"))
            .put("remaining", options.getInt("remainingSnoozes")).toString()).commit())
      }
      scheduleRegistration(reactContext, registration)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ALARM_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun cancelAlarmIdentity(reminderId: String, ownerId: String, generation: Double, promise: Promise) {
    try { synchronized(DELIVERY_LOCK) {
      val current = registry(reactContext).get(reminderId)
      val newer = PendingReminderCalls(reactContext).all().any { it.getString("reminderId") == reminderId &&
        (it.optString("ownerId") != ownerId || it.optLong("generation") > generation.toLong()) }
      if (!newer && (current == null || current.identity == DeliveryIdentity(ownerId, reminderId, generation.toLong())))
        cancelScheduledAlarm(reactContext, reminderId, removePersisted = true)
      promise.resolve(true)
    } } catch (e: Exception) { promise.reject("ALARM_ERROR", e.message, e) }
  }

  @ReactMethod
  fun cancelAlarm(reminderId: String, promise: Promise) {
    try {
      cancelScheduledAlarm(reactContext, reminderId, removePersisted = true)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ALARM_ERROR", e.message, e)
    }
  }

  /** Live registry entries (no reminder text) for the JS reconciler. */
  @ReactMethod
  fun listDeliveryRegistrations(promise: Promise) {
    try {
      val result = Arguments.createArray()
      synchronized(DELIVERY_LOCK) {
        ensureLegacyCutover(reactContext)
        for (registration in registry(reactContext).list()) {
          result.pushMap(Arguments.createMap().apply {
            putString("reminderId", registration.identity.reminderId)
            putString("ownerId", registration.identity.ownerId)
            putDouble("generation", registration.identity.generation.toDouble())
            putDouble("triggerAtMs", registration.triggerAtMs.toDouble())
            putBoolean("armed", isRegistrationArmed(reactContext, registration))
          })
        }
      }
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("DELIVERY_REGISTRY_ERROR", e.message, e)
    }
  }

  /** "" = nobody signed in: owned alarms that still fire are suppressed natively. */
  @ReactMethod
  fun setDeliveryOwner(ownerId: String, promise: Promise) {
    try {
      synchronized(DELIVERY_LOCK) {
        registry(reactContext).setActiveOwner(ownerId)
        val store = PendingReminderCalls(reactContext)
        for (row in store.all().filter { it.optString("ownerId") != ownerId }) {
          val id = row.getString("reminderId")
          cancelCallDeadline(reactContext, DeliveryIdentity(row.optString("ownerId"), id, row.optLong("generation")))
          NotificationManagerCompat.from(reactContext).cancel(DeliveryContract.notificationTag(id), CALL_NOTIFICATION_ID)
          store.remove(row.optString("ownerId"), id, row.optLong("generation"))
        }
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("DELIVERY_REGISTRY_ERROR", e.message, e)
    }
  }

  /**
   * The in-app fallback ringer asks before it rings (pre-advance remediation for
   * the AGY-PORT 03 double-ring window). Resolves "claimed", "already_claimed"
   * or "stale"; only "claimed" may ring, and after it native can no longer ring
   * that generation.
   */
  @ReactMethod
  fun claimForegroundDelivery(reminderId: String, ownerId: String, generation: Double, promise: Promise) {
    try {
      val outcome = claimForeground(reactContext, DeliveryIdentity(ownerId, reminderId, generation.toLong()))
      promise.resolve(outcome.code)
    } catch (e: Exception) {
      promise.reject("DELIVERY_REGISTRY_ERROR", e.message, e)
    }
  }

  /** Returns and clears redacted native receipts (fired, stale, duplicate, expired...). */
  @ReactMethod
  fun drainDeliveryReceipts(promise: Promise) {
    try {
      val result = Arguments.createArray()
      synchronized(DELIVERY_LOCK) {
        for (receipt in registry(reactContext).drainReceipts()) {
          result.pushMap(Arguments.createMap().apply {
            putDouble("atMs", receipt.atMs.toDouble())
            putString("event", receipt.event)
            putString("reminderId", receipt.reminderId)
            putString("ownerId", receipt.ownerId)
            putDouble("generation", receipt.generation.toDouble())
          })
        }
      }
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("DELIVERY_REGISTRY_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun claimIncomingCall(reminderId: String, ownerId: String, generation: Double, promise: Promise) {
    try { synchronized(DELIVERY_LOCK) {
      val row = PendingReminderCalls(reactContext).get(ownerId, reminderId, generation.toLong())
      if (row != null && (row.optString("action") == "timeout" ||
          (!row.optBoolean("silenced") && row.optLong("deadlineMs", Long.MAX_VALUE) <= System.currentTimeMillis()))) {
        handleCallDeadline(reactContext, deadlineIntent(reactContext, DeliveryIdentity(ownerId, reminderId, generation.toLong())))
        promise.resolve(false)
      } else {
        if (row != null) {
          cancelCallDeadline(reactContext, DeliveryIdentity(ownerId, reminderId, generation.toLong()))
          row.put("silenced", true)
          PendingReminderCalls(reactContext).put(row)
        }
        promise.resolve(true)
      }
    } } catch (e: Exception) { promise.reject("CALL_CLAIM_ERROR", e.message, e) }
  }

  @ReactMethod
  fun listPendingCalls(promise: Promise) {
    try {
      val result = Arguments.createArray()
      synchronized(DELIVERY_LOCK) {
        for (row in PendingReminderCalls(reactContext).all()) result.pushMap(pendingPayload(row))
      }
      promise.resolve(result)
    } catch (e: Exception) { promise.reject("PENDING_CALL_ERROR", e.message, e) }
  }

  @ReactMethod
  fun consumePendingCall(promise: Promise) {
    // Compatibility method is now non-destructive. Settlement acknowledges it.
    try { synchronized(DELIVERY_LOCK) {
      promise.resolve(PendingReminderCalls(reactContext).all().firstOrNull()?.let { pendingPayload(it) })
    } } catch (e: Exception) { promise.reject("PENDING_CALL_ERROR", e.message, e) }
  }

  @ReactMethod
  fun finishIncomingCallIdentity(reminderId: String, ownerId: String, generation: Double, silenceOnly: Boolean, promise: Promise) {
    try { synchronized(DELIVERY_LOCK) {
      val pending = PendingReminderCalls(reactContext)
      val row = pending.get(ownerId, reminderId, generation.toLong())
      val newer = pending.all().any { it.getString("reminderId") == reminderId &&
          (it.optString("ownerId") != ownerId || it.optLong("generation") > generation.toLong()) }
      if (!newer) {
        NotificationManagerCompat.from(reactContext).cancel(DeliveryContract.notificationTag(reminderId), CALL_NOTIFICATION_ID)
        NotificationManagerCompat.from(reactContext).cancel(DeliveryContract.notificationTag(reminderId), REMINDER_NOTIFICATION_ID)
      }
      if (row != null) {
        cancelCallDeadline(reactContext, DeliveryIdentity(ownerId, reminderId, generation.toLong()))
        if (silenceOnly) {
          row.put("silenced", true).put("deadlineMs", System.currentTimeMillis() + 15 * 60_000L)
          pending.put(row)
        } else pending.remove(ownerId, reminderId, generation.toLong())
      }
      promise.resolve(true)
    } } catch (e: Exception) { promise.reject("CALL_FINISH_ERROR", e.message, e) }
  }

  /**
   * Dismisses this reminder's call notification. The pending-call record is
   * cleared only when it belongs to the same reminder, so finishing one call
   * can no longer erase another reminder's pending call.
   */
  @ReactMethod
  fun finishIncomingCall(reminderId: String, promise: Promise) {
    try {
      val notifications = NotificationManagerCompat.from(reactContext)
      notifications.cancel(DeliveryContract.notificationTag(reminderId), CALL_NOTIFICATION_ID)
      notifications.cancel(DeliveryContract.notificationTag(reminderId), REMINDER_NOTIFICATION_ID)
      notifications.cancel(legacyNotificationId(reminderId))
      stopRingtoneInternal()
      clearPendingCallIfOwnedBy(reactContext, reminderId)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CALL_FINISH_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun startActiveCall(task: String, promise: Promise) {
    try {
      val intent = Intent(reactContext, LafinaReminderService::class.java).apply {
        action = LafinaReminderService.ACTION_START_ACTIVE_CALL
        putExtra(LafinaReminderService.EXTRA_TASK, task)
      }
      LafinaReminderService.begin(reactContext, intent, promise)
    } catch (e: Exception) {
      promise.reject("ACTIVE_CALL_SERVICE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun stopActiveCall(promise: Promise) {
    try {
      LafinaReminderService.requestStop()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ACTIVE_CALL_SERVICE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun getPermissionStatus(promise: Promise) {
    try {
      val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
      val fullScreen = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
          (reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
              .canUseFullScreenIntent()
      promise.resolve(Arguments.createMap().apply {
        putBoolean("canScheduleExactAlarms", exact)
        putBoolean("canUseFullScreenIntent", fullScreen)
        putBoolean("notificationsEnabled", NotificationManagerCompat.from(reactContext).areNotificationsEnabled())
      })
    } catch (e: Exception) {
      promise.reject("PERMISSION_STATUS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    openSettingsIntent(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
      data = Uri.parse("package:${reactContext.packageName}")
    }, promise)
  }

  @ReactMethod
  fun openFullScreenIntentSettings(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      promise.resolve(false)
      return
    }
    openSettingsIntent(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
      data = Uri.parse("package:${reactContext.packageName}")
    }, promise)
  }

  @ReactMethod
  fun openNotificationSettings(promise: Promise) {
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
        putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.packageName)
      }
    } else {
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${reactContext.packageName}")
      }
    }
    openSettingsIntent(intent, promise)
  }

  private fun openSettingsIntent(intent: Intent, promise: Promise) {
    try {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SETTINGS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setAlertPreferences(options: ReadableMap, promise: Promise) {
    try {
      fun optString(key: String): String? =
        if (options.hasKey(key) && !options.isNull(key)) options.getString(key) else null
      fun optBool(key: String, fallback: Boolean): Boolean =
        if (options.hasKey(key) && !options.isNull(key)) options.getBoolean(key) else fallback
      fun optInt(key: String, fallback: Int): Int =
        if (options.hasKey(key) && !options.isNull(key)) options.getInt(key) else fallback

      val prefs =
        NativeAlertPreferences(
          defaultAlarmSoundUri = optString("defaultAlarmSoundUri"),
          alarmVibrationPattern =
            optString("alarmVibrationPattern") ?: AlertPreferencesContract.PATTERN_STANDARD,
          alarmVolumeRampSec = optInt("alarmVolumeRampSec", 30),
          notificationSoundUri = optString("notificationSoundUri"),
          notificationVibrate = optBool("notificationVibrate", true),
          notificationVibrationPattern =
            optString("notificationVibrationPattern") ?: AlertPreferencesContract.PATTERN_STANDARD,
          notificationSnoozeMinutes = optInt("notificationSnoozeMinutes", 10),
          lockScreenPrivacy =
            optString("lockScreenPrivacy") ?: AlertPreferencesContract.PRIVACY_HIDE_TASK,
          callRingtoneUri = optString("callRingtoneUri"),
          callVibrate = optBool("callVibrate", true),
          callVibrationPattern =
            optString("callVibrationPattern") ?: AlertPreferencesContract.PATTERN_STANDARD,
          callRingTimeoutSec = optInt("callRingTimeoutSec", 45),
        )
      AlertPreferencesStoreNative.write(reactContext, prefs)
      createReminderChannel(reactContext)
      createCallChannel(reactContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ALERT_PREFS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun getActiveNotificationChannelId(kind: String, promise: Promise) {
    try {
      val id =
        if (kind == "call") createCallChannel(reactContext)
        else createReminderChannel(reactContext)
      promise.resolve(id)
    } catch (e: Exception) {
      promise.reject("CHANNEL_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun startRingtone(promise: Promise) {
    try {
      val prefs = AlertPreferencesStoreNative.read(reactContext)
      if (prefs.callRingtoneUri == AlertPreferencesContract.TONE_SILENT) {
        promise.resolve(true)
        return
      }
      synchronized(this) {
        if (activeRingtone == null) {
          val customUri = prefs.callRingtoneUri?.let { Uri.parse(it) }
          val fallbackUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
          activeRingtone =
            (customUri?.let {
              try {
                RingtoneManager.getRingtone(reactContext, it)
              } catch (_: Exception) {
                null
              }
            }) ?: RingtoneManager.getRingtone(reactContext, fallbackUri)
        }
        activeRingtone?.let { if (!it.isPlaying) it.play() }
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("RINGTONE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun stopRingtone(promise: Promise) {
    try {
      stopRingtoneInternal()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("RINGTONE_ERROR", e.message, e)
    }
  }

  private fun stopRingtoneInternal() {
    synchronized(this) {
      activeRingtone?.let { if (it.isPlaying) it.stop() }
      activeRingtone = null
    }
  }

  override fun onNewIntent(intent: Intent) {
    val payload = payloadFromIntent(intent) ?: return
    persistPendingCall(
        reactContext,
        payload.getString("reminderId") ?: return,
        payload.getString("task") ?: "",
        payload.getString("action") ?: ACTION_CALL,
        intent.getStringExtra(EXTRA_OWNER_ID),
        if (intent.hasExtra(EXTRA_GENERATION)) intent.getLongExtra(EXTRA_GENERATION, 0L) else null
    )
    if (reactContext.hasActiveReactInstance()) {
      reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT_CALL_TRIGGER, synchronized(DELIVERY_LOCK) {
            PendingReminderCalls(reactContext).get(intent.getStringExtra(EXTRA_OWNER_ID).orEmpty(),
              intent.getStringExtra("reminderId").orEmpty(), intent.getLongExtra(EXTRA_GENERATION, 0))?.let { pendingPayload(it) } ?: payload
          })
    }
  }

  override fun onActivityResult(
      activity: android.app.Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?
  ) = Unit

  /** SharedPreferences with synchronous commit(), so claims are durable before a call posts. */
  private class PrefsStore(private val preferences: SharedPreferences) : DeliveryKeyValueStore {
    override fun all(): Map<String, String> =
        preferences.all.mapNotNull { (key, value) -> (value as? String)?.let { key to it } }.toMap()
    override fun get(key: String): String? = preferences.getString(key, null)
    override fun put(key: String, value: String) {
      check(preferences.edit().putString(key, value).commit()) { "delivery registry write failed" }
    }
    override fun remove(key: String) {
      check(preferences.edit().remove(key).commit()) { "delivery registry write failed" }
    }
  }

  companion object {
    const val ACTION_TRIGGER_REMINDER = "com.lafina.capstone.ACTION_TRIGGER_REMINDER"
    const val ACTION_CALL = "call"
    const val ACTION_ANSWER = "answer"
    const val ACTION_DECLINE = "decline"
    const val ACTION_ACKNOWLEDGE = DeliveryContract.OP_ACKNOWLEDGE
    const val ACTION_SNOOZE = DeliveryContract.OP_SNOOZE
    const val EVENT_CALL_TRIGGER = "LAFINA_NATIVE_CALL_TRIGGER"

    const val EXTRA_OWNER_ID = "ownerId"
    const val EXTRA_GENERATION = "generation"
    const val ACTION_CALL_DEADLINE = "com.lafina.capstone.ACTION_CALL_DEADLINE"

    /** Pre-AGY-PORT-03 registry; read only by the one-time cutover. */
    private const val ALARM_PREFS = "lafina_alarm_registry"
    const val DELIVERY_REGISTRY_PREFS = "lafina_delivery_registry_v2"
    const val DELIVERY_STATE_PREFS = "lafina_delivery_state_v1"
    private const val PENDING_CALL_PREFS = "lafina_pending_call"
    private const val KEY_PENDING_REMINDER_ID = "reminder_id"
    private const val KEY_PENDING_TASK = "task"
    private const val KEY_PENDING_ACTION = "action"
    private const val KEY_PENDING_OWNER_ID = "owner_id"
    private const val KEY_PENDING_GENERATION = "generation"
    private const val CALL_CHANNEL_ID = "lafina_incoming_calls_v2"
    private const val REMINDER_CHANNEL_ID = "lafina_reminder_notifications_v1"
    /** Identity lives in the Intent data URI, so every request code can be constant. */
    private const val IDENTITY_REQUEST_CODE = 7301
    const val CALL_NOTIFICATION_ID = 7302
    /** Notify-only reminders; same per-reminder tag, so each reminder has its own notification. */
    const val REMINDER_NOTIFICATION_ID = 7303

    /** One lock per process for registry, cutover and claims (receiver vs. bridge threads). */
    private val DELIVERY_LOCK = Any()

    private fun registry(context: Context): DeliveryRegistryCore =
        DeliveryRegistryCore(
            PrefsStore(context.getSharedPreferences(DELIVERY_REGISTRY_PREFS, Context.MODE_PRIVATE)),
            PrefsStore(context.getSharedPreferences(DELIVERY_STATE_PREFS, Context.MODE_PRIVATE)),
            System::currentTimeMillis)

    /**
     * Registers an identity. A different identity for the same reminder (older
     * generation, adopted legacy entry) is cancelled first, so a superseded
     * generation can never ring; on failure nothing for that reminder stays
     * registered and JS records the failure for retry.
     */
    fun scheduleRegistration(context: Context, registration: DeliveryRegistration) {
      synchronized(DELIVERY_LOCK) {
        ensureLegacyCutover(context)
        val core = registry(context)
        val reminderId = registration.identity.reminderId
        val pending = PendingReminderCalls(context)
        for (row in pending.all().filter { it.getString("reminderId") == reminderId &&
          (it.optString("ownerId") != registration.identity.ownerId || it.optLong("generation") != registration.identity.generation) }) {
          cancelCallDeadline(context, DeliveryIdentity(row.optString("ownerId"), reminderId, row.optLong("generation")))
          pending.remove(row.optString("ownerId"), reminderId, row.optLong("generation"))
          NotificationManagerCompat.from(context).cancel(DeliveryContract.notificationTag(reminderId), CALL_NOTIFICATION_ID)
        }
        val previous = core.get(reminderId)
        if (previous != null && previous.identity != registration.identity) {
          cancelIdentity(context, previous.identity)
          core.remove(reminderId)
          core.receipt("superseded", previous.identity)
        }
        val exact = try {
          setAlarm(context, registration)
        } catch (error: Exception) {
          cancelIdentity(context, registration.identity)
          core.remove(reminderId)
          core.receipt("registration_rejected", registration.identity)
          throw error
        }
        core.put(registration)
        core.receipt(if (exact) "registered" else "registered_inexact", registration.identity)
      }
    }

    private fun setAlarm(context: Context, registration: DeliveryRegistration): Boolean {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val canScheduleExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
      val pendingIntent = triggerPendingIntent(context, registration)
      if (canScheduleExact) {
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, registration.triggerAtMs, pendingIntent)
      } else {
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, registration.triggerAtMs, pendingIntent)
      }
      return canScheduleExact
    }

    fun cancelScheduledAlarm(context: Context, reminderId: String, removePersisted: Boolean) {
      synchronized(DELIVERY_LOCK) {
        if (removePersisted) {
          clearPendingCallIfOwnedBy(context, reminderId)
          NotificationManagerCompat.from(context).cancel(DeliveryContract.notificationTag(reminderId), CALL_NOTIFICATION_ID)
        }
        ensureLegacyCutover(context)
        val core = registry(context)
        core.get(reminderId)?.let { registration ->
          cancelIdentity(context, registration.identity)
          if (removePersisted) {
            core.remove(reminderId)
            core.receipt("cancelled", registration.identity)
          }
        }
        cancelLegacyPendingIntent(context, reminderId)
      }
    }

    /** Boot, package replace, time/timezone change, exact-alarm permission change. */
    fun restoreScheduledAlarms(context: Context) {
      synchronized(DELIVERY_LOCK) {
        ensureLegacyCutover(context)
        applyRestoreActions(context, registry(context).restore())
        for (row in PendingReminderCalls(context).all()) {
          if (row.optBoolean("silenced") || row.optBoolean("exhausted")) continue
          val at = if (row.optString("action") == "timeout") row.optLong("retryAtMs") else row.optLong("deadlineMs")
          if (at > 0) scheduleCallDeadline(context, DeliveryIdentity(row.optString("ownerId"), row.getString("reminderId"), row.optLong("generation")), at)
        }
      }
    }

    private fun applyRestoreActions(context: Context, actions: List<RestoreAction>) {
      for (action in actions) {
        when (action) {
          is RestoreAction.Rearm -> try {
            setAlarm(context, action.registration)
          } catch (_: Exception) {
            registry(context).receipt("restore_rejected", action.registration.identity)
          }
          is RestoreAction.FireLate -> showIncomingCall(context, action.registration)
          is RestoreAction.Expire -> Unit
        }
      }
    }

    /**
     * Versioned, idempotent cutover from the hash-keyed registry: adopt each
     * entry as generation 0, cancel its old PendingIntent, then drop the old
     * entry. Interrupted runs repeat safely; the JS reconcile later replaces
     * every adopted entry with its real owner and generation.
     */
    private fun ensureLegacyCutover(context: Context) {
      val core = registry(context)
      if (core.cutoverDone()) return
      val legacyPrefs = context.getSharedPreferences(ALARM_PREFS, Context.MODE_PRIVATE)
      val legacy = mutableListOf<LegacyAlarm>()
      for ((key, rawValue) in legacyPrefs.all) {
        try {
          val record = JSONObject(rawValue as String)
          legacy.add(LegacyAlarm(record.optString("reminderId", key), record.optString("task", ""),
              record.getLong("triggerAtMs")))
        } catch (_: Exception) {
          core.receipt("legacy_unreadable", DeliveryIdentity("", key.ifEmpty { "?" }, 0))
        }
      }
      val actions = core.adoptLegacy(legacy)
      for ((key, _) in legacyPrefs.all) {
        cancelLegacyPendingIntent(context, key)
        legacyPrefs.edit().remove(key).commit()
      }
      for (action in actions) {
        if (action is RestoreAction.Rearm) {
          try {
            setAlarm(context, action.registration)
          } catch (_: Exception) {
            core.receipt("restore_rejected", action.registration.identity)
          }
        }
      }
      core.markCutoverDone()
      for (action in actions) {
        if (action is RestoreAction.FireLate) showIncomingCall(context, action.registration)
      }
    }

    /** Same lock as [handleTriggerIntent], so a broadcast and this claim never both win. */
    fun claimForeground(context: Context, identity: DeliveryIdentity): ForegroundOutcome {
      synchronized(DELIVERY_LOCK) {
        ensureLegacyCutover(context)
        val claim = registry(context).claimForeground(identity)
        claim.superseded?.let { cancelIdentity(context, it.identity) }
        return claim.outcome
      }
    }

    /** Alarm broadcast: only the exact registered identity fires, once. */
    fun handleTriggerIntent(context: Context, intent: Intent) {
      synchronized(DELIVERY_LOCK) {
        ensureLegacyCutover(context)
        val core = registry(context)
        val parsed = DeliveryContract.parse(intent.dataString)
        if (parsed == null || parsed.operation != DeliveryContract.OP_DUE) {
          // A hash-keyed broadcast from before the cutover; the cutover already adopted it.
          val reminderId = intent.getStringExtra("reminderId")?.takeIf { it.isNotEmpty() } ?: "?"
          core.receipt("legacy_trigger_ignored", DeliveryIdentity("", reminderId, 0))
          return
        }
        val decision = core.claim(parsed.identity)
        if (decision.outcome == FireOutcome.FIRE) {
          showIncomingCall(context, decision.registration ?: return)
        }
      }
    }

    private fun showIncomingCall(context: Context, registration: DeliveryRegistration) {
      if (registration.notifyOnly) {
        showReminderNotification(context, registration)
        return
      }
      val identity = registration.identity
      val task = registration.task
      val prefs = AlertPreferencesStoreNative.read(context)
      val channelId = createCallChannel(context)
      val timeoutMs = AlertPreferencesContract.clampRingTimeoutSec(prefs.callRingTimeoutSec) * 1000L
      persistPendingCall(context, identity.reminderId, task, ACTION_CALL, identity.ownerId, identity.generation)
      synchronized(DELIVERY_LOCK) {
        val store = PendingReminderCalls(context)
        val row = store.get(identity.ownerId, identity.reminderId, identity.generation) ?: return
        row.put("action", ACTION_CALL).put("silenced", false)
        store.put(row)
      }
      synchronized(DELIVERY_LOCK) {
        val pending = PendingReminderCalls(context)
        val row = pending.get(identity.ownerId, identity.reminderId, identity.generation) ?: return
        row.put("deadlineMs", System.currentTimeMillis() + timeoutMs)
        pending.put(row)
        scheduleCallDeadline(context, identity, row.getLong("deadlineMs"))
      }
      val fullScreenIntent = callActivityPendingIntent(context, registration, ACTION_CALL)
      val ringtoneUri = resolveChannelSoundUri(prefs.callRingtoneUri, RingtoneManager.TYPE_RINGTONE)
      val callWave =
        if (prefs.callVibrate) AlertPreferencesContract.callWaveform(prefs.callVibrationPattern)
        else null
      val builder = NotificationCompat.Builder(context, channelId)
          .setSmallIcon(android.R.drawable.sym_call_incoming)
          .setContentTitle("LAFINA Reminder")
          .setContentText(task.ifBlank { "Scheduled academic reminder" })
          .setCategory(NotificationCompat.CATEGORY_CALL)
          .setPriority(NotificationCompat.PRIORITY_MAX)
          .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
          .setOngoing(true)
          .setTimeoutAfter(timeoutMs)
          .setAutoCancel(false)
          .setSound(ringtoneUri)
          .setVibrate(callWave ?: longArrayOf(0L))
          .setContentIntent(fullScreenIntent)
          .setFullScreenIntent(fullScreenIntent, true)
      val notification = builder.build()
      notification.flags = notification.flags or Notification.FLAG_INSISTENT
      try {
        NotificationManagerCompat.from(context).notify(identity.notificationTag(), CALL_NOTIFICATION_ID, notification)
        // Evidence that the notification was posted, not that it audibly rang.
        registry(context).receipt("posted", identity)
      } catch (_: SecurityException) {
        // The JS permission preflight provides recovery UI.
        registry(context).receipt("post_denied", identity)
      }
      handCallToVisibleApp(context, identity)
    }

    /** The module's React context, so a broadcast can reach an app already on screen. */
    @Volatile private var liveContext: WeakReference<ReactApplicationContext>? = null

    /**
     * Android shows a full-screen intent only as a heads-up while the phone is
     * unlocked and in use, so the call activity is never launched and JS never
     * hears about the call. When LAFINA itself is that app (main screen resumed,
     * keyguard gone, so no private data is exposed), hand the call to JS the same
     * way [onNewIntent] does; the notification stays as the fallback.
     */
    private fun handCallToVisibleApp(context: Context, identity: DeliveryIdentity) {
      try {
        val react = liveContext?.get() ?: return
        if (!react.hasActiveReactInstance()) return
        if (react.lifecycleState != LifecycleState.RESUMED) return
        if (react.currentActivity !is MainActivity) return
        val keyguard = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        if (keyguard?.isKeyguardLocked != false) return
        val row = synchronized(DELIVERY_LOCK) {
          PendingReminderCalls(context).get(identity.ownerId, identity.reminderId, identity.generation)
        } ?: return
        if (row.optString("action") != ACTION_CALL) return
        react.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_CALL_TRIGGER, pendingPayload(row))
        registry(context).receipt("handed_to_app", identity)
      } catch (_: Exception) {
        // The posted notification still rings and opens the call.
      }
    }

    /**
     * "Notify only" (audit finding 16): an ordinary heads-up notification, not
     * a full-screen insistent call. No pending call is stored, so opening the
     * app does not start a call. Tapping it, or Acknowledge, opens LAFINA and
     * marks the reminder acknowledged (received, not task completed); Snooze
     * opens LAFINA and snoozes it. JS applies both through the same identity
     * fence as call actions.
     */
    private fun showReminderNotification(context: Context, registration: DeliveryRegistration) {
      val identity = registration.identity
      val task = registration.task
      val prefs = AlertPreferencesStoreNative.read(context)
      val channelId = createReminderChannel(context)
      val snoozeMin = AlertPreferencesContract.clampSnoozeMinutes(prefs.notificationSnoozeMinutes)
      val visibility =
        if (prefs.lockScreenPrivacy == AlertPreferencesContract.PRIVACY_SHOW) {
          NotificationCompat.VISIBILITY_PUBLIC
        } else {
          NotificationCompat.VISIBILITY_PRIVATE
        }
      val acknowledge = callActivityPendingIntent(context, registration, ACTION_ACKNOWLEDGE)
      val snooze = callActivityPendingIntent(context, registration, ACTION_SNOOZE)
      val notification = NotificationCompat.Builder(context, channelId)
          .setSmallIcon(android.R.drawable.ic_popup_reminder)
          .setContentTitle("LAFINA Reminder")
          .setContentText(task.ifBlank { "Scheduled academic reminder" })
          .setStyle(NotificationCompat.BigTextStyle().bigText(task.ifBlank { "Scheduled academic reminder" }))
          .setCategory(NotificationCompat.CATEGORY_REMINDER)
          .setPriority(NotificationCompat.PRIORITY_HIGH)
          .setVisibility(visibility)
          .setAutoCancel(true)
          .setContentIntent(acknowledge)
          .addAction(0, "Acknowledge", acknowledge)
          .addAction(0, "Snooze $snoozeMin min", snooze)
          .build()
      try {
        NotificationManagerCompat.from(context)
            .notify(identity.notificationTag(), REMINDER_NOTIFICATION_ID, notification)
        registry(context).receipt("posted_notification", identity)
      } catch (_: SecurityException) {
        registry(context).receipt("post_denied", identity)
      }
    }

    private fun createReminderChannel(context: Context): String {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return REMINDER_CHANNEL_ID
      val prefs = AlertPreferencesStoreNative.read(context)
      val channelId = AlertPreferencesContract.notifyChannelId(
          prefs.notificationSoundUri,
          prefs.notificationVibrate,
          prefs.notificationVibrationPattern,
          prefs.lockScreenPrivacy,
      )
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val prevId = AlertPreferencesStoreNative.getActiveNotifyChannelId(context)
      if (prevId != null && prevId != channelId && AlertPreferencesContract.isDynamicNotifyChannel(prevId)) {
        try {
          manager.deleteNotificationChannel(prevId)
        } catch (_: Exception) {
        }
      }
      val soundUri = resolveChannelSoundUri(prefs.notificationSoundUri, RingtoneManager.TYPE_NOTIFICATION)
      val audioAttributes = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      val wave =
        if (prefs.notificationVibrate) AlertPreferencesContract.notifyWaveform(prefs.notificationVibrationPattern)
        else null
      val channel = NotificationChannel(
          channelId,
          "LAFINA reminders (notify only)",
          NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Reminders you chose to receive as a notification instead of a call"
        lockscreenVisibility =
          if (prefs.lockScreenPrivacy == AlertPreferencesContract.PRIVACY_SHOW) Notification.VISIBILITY_PUBLIC
          else Notification.VISIBILITY_PRIVATE
        enableVibration(wave != null)
        if (wave != null) vibrationPattern = wave
        if (soundUri == null) setSound(null, null) else setSound(soundUri, audioAttributes)
      }
      manager.createNotificationChannel(channel)
      AlertPreferencesStoreNative.setActiveNotifyChannelId(context, channelId)
      return channelId
    }

    /** True for notification actions of a notify-only reminder (no lock-screen call UI). */
    fun isNotificationAction(intent: Intent?): Boolean =
        intent?.getStringExtra("action") in setOf(ACTION_ACKNOWLEDGE, ACTION_SNOOZE)

    fun captureActivityIntent(context: Context, intent: Intent?) {
      val reminderId = intent?.getStringExtra("reminderId")?.takeIf { it.isNotBlank() } ?: return
      persistPendingCall(
          context,
          reminderId,
          intent.getStringExtra("task") ?: "",
          intent.getStringExtra("action") ?: ACTION_CALL,
          intent.getStringExtra(EXTRA_OWNER_ID),
          if (intent.hasExtra(EXTRA_GENERATION)) intent.getLongExtra(EXTRA_GENERATION, 0L) else null
      )
    }

    fun payloadFromIntent(intent: Intent?): WritableMap? {
      val reminderId = intent?.getStringExtra("reminderId")?.takeIf { it.isNotBlank() } ?: return null
      return Arguments.createMap().apply {
        putString("reminderId", reminderId)
        putString("task", intent.getStringExtra("task") ?: "")
        putString("action", intent.getStringExtra("action") ?: ACTION_CALL)
        intent.getStringExtra(EXTRA_OWNER_ID)?.let { putString("ownerId", it) }
        if (intent.hasExtra(EXTRA_GENERATION)) {
          putDouble("generation", intent.getLongExtra(EXTRA_GENERATION, 0L).toDouble())
        }
      }
    }

    private fun persistPendingCall(context: Context, reminderId: String, task: String, action: String, ownerId: String?, generation: Long?) {
      synchronized(DELIVERY_LOCK) {
        val pending = PendingReminderCalls(context)
        val row = pending.get(ownerId.orEmpty(), reminderId, generation ?: 0L)
          ?: JSONObject().put("reminderId", reminderId).put("ownerId", ownerId.orEmpty())
            .put("generation", generation ?: 0L).put("atMs", System.currentTimeMillis())
        row.put("task", task)
        // A late activity intent cannot resurrect a timed-out generation.
        if (row.optString("action") != "timeout") row.put("action", action)
        pending.put(row)
      }
    }

    private fun clearPendingCallIfOwnedBy(context: Context, reminderId: String) {
      synchronized(DELIVERY_LOCK) {
        val pending = PendingReminderCalls(context)
        for (row in pending.all().filter { it.getString("reminderId") == reminderId }) {
          cancelCallDeadline(context, DeliveryIdentity(row.optString("ownerId"), reminderId, row.optLong("generation")))
          pending.remove(row.optString("ownerId"), reminderId, row.optLong("generation"))
        }
      }
    }

    private fun pendingPayload(row: JSONObject): WritableMap = Arguments.createMap().apply {
      putString("reminderId", row.getString("reminderId"))
      putString("task", row.optString("task"))
      putString("ownerId", row.optString("ownerId"))
      putString("action", row.optString("action", ACTION_CALL))
      putDouble("generation", row.optLong("generation").toDouble())
      putDouble("timeoutCount", row.optInt("timeoutCount").toDouble())
      putDouble("retryAtMs", row.optLong("retryAtMs").toDouble())
    }

    private fun deadlineIntent(context: Context, identity: DeliveryIdentity): Intent =
      Intent(context, LafinaReminderReceiver::class.java).apply {
        action = ACTION_CALL_DEADLINE
        data = Uri.parse(identity.uri(ACTION_CALL) + "/deadline")
        putExtra("reminderId", identity.reminderId)
        putExtra(EXTRA_OWNER_ID, identity.ownerId)
        putExtra(EXTRA_GENERATION, identity.generation)
      }

    private fun cancelCallDeadline(context: Context, identity: DeliveryIdentity) {
      val intent = PendingIntent.getBroadcast(context, 7304, deadlineIntent(context, identity), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
      if (intent != null) {
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(intent)
        intent.cancel()
      }
    }

    private fun scheduleCallDeadline(context: Context, identity: DeliveryIdentity, at: Long) {
      val intent = PendingIntent.getBroadcast(context, 7304, deadlineIntent(context, identity), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      try { alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent) }
      catch (_: SecurityException) { alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent) }
    }

    fun handleCallDeadline(context: Context, intent: Intent) = synchronized(DELIVERY_LOCK) {
      val id = intent.getStringExtra("reminderId") ?: return@synchronized
      val owner = intent.getStringExtra(EXTRA_OWNER_ID).orEmpty()
      val generation = intent.getLongExtra(EXTRA_GENERATION, 0)
      val pending = PendingReminderCalls(context)
      val row = pending.get(owner, id, generation) ?: return@synchronized
      if (row.optBoolean("silenced")) return@synchronized
      if (registry(context).activeOwner()?.let { it != owner } == true) {
        pending.remove(owner, id, generation)
        return@synchronized
      }
      val current = registry(context).get(id)
      if (current != null && current.identity != DeliveryIdentity(owner, id, generation)) return@synchronized
      val now = System.currentTimeMillis()
      val identity = DeliveryIdentity(owner, id, generation)
      if (row.optString("action") == "timeout") {
        if (row.optBoolean("exhausted")) return@synchronized
        if (row.optLong("retryAtMs") > now) return@synchronized
        row.put("action", ACTION_CALL)
        pending.put(row)
        showIncomingCall(context, DeliveryRegistration(identity, now, row.optString("task")))
        return@synchronized
      }
      if (row.optLong("deadlineMs") > now) return@synchronized
      NotificationManagerCompat.from(context).cancel(identity.notificationTag(), CALL_NOTIFICATION_ID)
      val policy = context.getSharedPreferences("lafina_call_policies", Context.MODE_PRIVATE).getString(identity.uri(ACTION_CALL), null)
      val snapshot = policy?.let { JSONObject(it) } ?: JSONObject().put("remaining", 1).put("minutes", 5)
      if (row.optString("action") == "timeout") return@synchronized
      val count = row.optInt("timeoutCount") + 1
      val exhausted = count > snapshot.optInt("remaining", 1)
      val retryAt = now + snapshot.optInt("minutes", 5).coerceIn(1, 120) * 60_000L
      row.put("action", "timeout").put("timeoutCount", count).put("retryAtMs", retryAt).put("exhausted", exhausted)
      pending.put(row)
      registry(context).receipt("call_timeout", identity)
      if (!exhausted) scheduleCallDeadline(context, identity, retryAt)
    }

    private fun triggerIntent(context: Context, identity: DeliveryIdentity): Intent =
        Intent(context, LafinaReminderReceiver::class.java).apply {
          action = ACTION_TRIGGER_REMINDER
          data = Uri.parse(identity.uri(DeliveryContract.OP_DUE))
        }

    private fun triggerPendingIntent(context: Context, registration: DeliveryRegistration): PendingIntent {
      val intent = triggerIntent(context, registration.identity).apply {
        putExtra("reminderId", registration.identity.reminderId)
        putExtra("task", registration.task)
        putExtra(EXTRA_OWNER_ID, registration.identity.ownerId)
        putExtra(EXTRA_GENERATION, registration.identity.generation)
      }
      return PendingIntent.getBroadcast(
          context,
          IDENTITY_REQUEST_CODE,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    /** Best-effort liveness: false after Android dropped the PendingIntent (reboot, force-stop). */
    private fun isRegistrationArmed(context: Context, registration: DeliveryRegistration): Boolean =
        PendingIntent.getBroadcast(
            context,
            IDENTITY_REQUEST_CODE,
            triggerIntent(context, registration.identity),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        ) != null

    private fun cancelIdentity(context: Context, identity: DeliveryIdentity) {
      val pendingIntent = PendingIntent.getBroadcast(
          context,
          IDENTITY_REQUEST_CODE,
          triggerIntent(context, identity),
          PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
      )
      if (pendingIntent != null) {
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pendingIntent)
        pendingIntent.cancel()
      }
    }

    /** The pre-cutover PendingIntent: hash request code, no data URI. */
    private fun cancelLegacyPendingIntent(context: Context, reminderId: String) {
      val intent = Intent(context, LafinaReminderReceiver::class.java).apply {
        action = ACTION_TRIGGER_REMINDER
      }
      val pendingIntent = PendingIntent.getBroadcast(
          context,
          reminderId.hashCode(),
          intent,
          PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
      )
      if (pendingIntent != null) {
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pendingIntent)
        pendingIntent.cancel()
      }
    }

    private fun callActivityPendingIntent(
        context: Context,
        registration: DeliveryRegistration,
        action: String
    ): PendingIntent {
      val identity = registration.identity
      val intent = Intent(context, MainActivity::class.java).apply {
        data = Uri.parse(identity.uri(action))
        putExtra("reminderId", identity.reminderId)
        putExtra("task", registration.task)
        putExtra("action", action)
        putExtra(EXTRA_OWNER_ID, identity.ownerId)
        putExtra(EXTRA_GENERATION, identity.generation)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      return PendingIntent.getActivity(
          context,
          IDENTITY_REQUEST_CODE,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    private fun resolveChannelSoundUri(configuredUri: String?, defaultType: Int): Uri? {
      val clean = AlertPreferencesContract.sanitizeToneUri(configuredUri)
      if (clean == AlertPreferencesContract.TONE_SILENT) return null
      if (clean != null) {
        return try {
          Uri.parse(clean)
        } catch (_: Exception) {
          RingtoneManager.getDefaultUri(defaultType)
        }
      }
      return RingtoneManager.getDefaultUri(defaultType)
    }

    private fun createCallChannel(context: Context): String {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return CALL_CHANNEL_ID
      val prefs = AlertPreferencesStoreNative.read(context)
      val channelId = AlertPreferencesContract.callChannelId(
          prefs.callRingtoneUri,
          prefs.callVibrate,
          prefs.callVibrationPattern,
      )
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val prevId = AlertPreferencesStoreNative.getActiveCallChannelId(context)
      if (prevId != null && prevId != channelId && AlertPreferencesContract.isDynamicCallChannel(prevId)) {
        try {
          manager.deleteNotificationChannel(prevId)
        } catch (_: Exception) {
        }
      }
      val ringtoneUri = resolveChannelSoundUri(prefs.callRingtoneUri, RingtoneManager.TYPE_RINGTONE)
      val audioAttributes = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      val wave =
        if (prefs.callVibrate) AlertPreferencesContract.callWaveform(prefs.callVibrationPattern)
        else null
      val channel = NotificationChannel(
          channelId,
          "LAFINA reminder calls",
          NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Incoming offline academic reminder calls"
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        enableVibration(wave != null)
        if (wave != null) vibrationPattern = wave
        if (ringtoneUri == null) setSound(null, null) else setSound(ringtoneUri, audioAttributes)
      }
      manager.createNotificationChannel(channel)
      AlertPreferencesStoreNative.setActiveCallChannelId(context, channelId)
      return channelId
    }

    /** Pre-cutover notification id; cancelled once so an upgraded call can still be dismissed. */
    private fun legacyNotificationId(reminderId: String): Int = reminderId.hashCode()
  }
}
