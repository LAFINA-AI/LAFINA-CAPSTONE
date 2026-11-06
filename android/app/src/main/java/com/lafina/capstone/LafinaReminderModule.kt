package com.lafina.capstone

import android.app.AlarmManager
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
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

class LafinaReminderModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener, LifecycleEventListener {

  private var activeRingtone: Ringtone? = null

  init {
    reactContext.addActivityEventListener(this)
    reactContext.addLifecycleEventListener(this)
  }

  override fun onHostResume() = Unit
  override fun onHostPause() = Unit
  override fun onHostDestroy() = Unit

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
      require(reminderId.isNotEmpty()) { "reminderId is required" }
      require(triggerAtMs > System.currentTimeMillis()) { "triggerAtMs must be in the future" }
      val registration =
          DeliveryRegistration(DeliveryIdentity(ownerId, reminderId, generation), triggerAtMs, task)
      scheduleRegistration(reactContext, registration)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ALARM_ERROR", e.message, e)
    }
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
      synchronized(DELIVERY_LOCK) { registry(reactContext).setActiveOwner(ownerId) }
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
  fun consumePendingCall(promise: Promise) {
    try {
      val preferences = reactContext.getSharedPreferences(PENDING_CALL_PREFS, Context.MODE_PRIVATE)
      val reminderId = preferences.getString(KEY_PENDING_REMINDER_ID, null)
      if (reminderId.isNullOrBlank()) {
        promise.resolve(null)
        return
      }
      val payload = Arguments.createMap().apply {
        putString("reminderId", reminderId)
        putString("task", preferences.getString(KEY_PENDING_TASK, "") ?: "")
        putString("action", preferences.getString(KEY_PENDING_ACTION, ACTION_CALL) ?: ACTION_CALL)
        preferences.getString(KEY_PENDING_OWNER_ID, null)?.let { putString("ownerId", it) }
        if (preferences.contains(KEY_PENDING_GENERATION)) {
          putDouble("generation", preferences.getLong(KEY_PENDING_GENERATION, 0L).toDouble())
        }
      }
      preferences.edit().clear().commit()
      promise.resolve(payload)
    } catch (e: Exception) {
      promise.reject("PENDING_CALL_ERROR", e.message, e)
    }
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
      ContextCompat.startForegroundService(reactContext, intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ACTIVE_CALL_SERVICE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun stopActiveCall(promise: Promise) {
    try {
      reactContext.stopService(Intent(reactContext, LafinaReminderService::class.java))
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
  fun startRingtone(promise: Promise) {
    try {
      synchronized(this) {
        if (activeRingtone == null) {
          val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
          activeRingtone = RingtoneManager.getRingtone(reactContext, uri)
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
          .emit(EVENT_CALL_TRIGGER, payload)
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
    const val EVENT_CALL_TRIGGER = "LAFINA_NATIVE_CALL_TRIGGER"

    const val EXTRA_OWNER_ID = "ownerId"
    const val EXTRA_GENERATION = "generation"

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
    /** Identity lives in the Intent data URI, so every request code can be constant. */
    private const val IDENTITY_REQUEST_CODE = 7301
    const val CALL_NOTIFICATION_ID = 7302

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
      val identity = registration.identity
      val task = registration.task
      createCallChannel(context)
      persistPendingCall(context, identity.reminderId, task, ACTION_CALL, identity.ownerId, identity.generation)
      val fullScreenIntent = callActivityPendingIntent(context, registration, ACTION_CALL)
      val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      val notification = NotificationCompat.Builder(context, CALL_CHANNEL_ID)
          .setSmallIcon(android.R.drawable.sym_call_incoming)
          .setContentTitle("LAFINA Reminder")
          .setContentText(task.ifBlank { "Scheduled academic reminder" })
          .setCategory(NotificationCompat.CATEGORY_CALL)
          .setPriority(NotificationCompat.PRIORITY_MAX)
          .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
          .setOngoing(true)
          .setAutoCancel(false)
          .setSound(ringtoneUri)
          .setVibrate(longArrayOf(0, 1000, 1000, 1000, 1000))
          .setContentIntent(fullScreenIntent)
          .setFullScreenIntent(fullScreenIntent, true)
          .build()
      notification.flags = notification.flags or Notification.FLAG_INSISTENT
      try {
        NotificationManagerCompat.from(context).notify(identity.notificationTag(), CALL_NOTIFICATION_ID, notification)
        // Evidence that the notification was posted, not that it audibly rang.
        registry(context).receipt("posted", identity)
      } catch (_: SecurityException) {
        // The JS permission preflight provides recovery UI.
        registry(context).receipt("post_denied", identity)
      }
    }

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

    private fun persistPendingCall(
        context: Context,
        reminderId: String,
        task: String,
        action: String,
        ownerId: String?,
        generation: Long?
    ) {
      val editor = context.getSharedPreferences(PENDING_CALL_PREFS, Context.MODE_PRIVATE)
          .edit()
          .clear()
          .putString(KEY_PENDING_REMINDER_ID, reminderId)
          .putString(KEY_PENDING_TASK, task)
          .putString(KEY_PENDING_ACTION, action)
      if (ownerId != null) editor.putString(KEY_PENDING_OWNER_ID, ownerId)
      if (generation != null) editor.putLong(KEY_PENDING_GENERATION, generation)
      // Synchronous like the registry: the call must be recoverable if the process dies right after.
      editor.commit()
    }

    private fun clearPendingCallIfOwnedBy(context: Context, reminderId: String) {
      val preferences = context.getSharedPreferences(PENDING_CALL_PREFS, Context.MODE_PRIVATE)
      if (preferences.getString(KEY_PENDING_REMINDER_ID, null) == reminderId) {
        preferences.edit().clear().commit()
      }
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

    private fun createCallChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      val audioAttributes = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      val channel = NotificationChannel(
          CALL_CHANNEL_ID,
          "LAFINA reminder calls",
          NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Incoming offline academic reminder calls"
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 1000, 1000, 1000, 1000)
        setSound(ringtoneUri, audioAttributes)
      }
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
          .createNotificationChannel(channel)
    }

    /** Pre-cutover notification id; cancelled once so an upgraded call can still be dismissed. */
    private fun legacyNotificationId(reminderId: String): Int = reminderId.hashCode()
  }
}
