package com.lafina.capstone.reminders

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject
import java.util.concurrent.Executors

class ReminderPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(ReminderModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

/** MAIN process performs Binder calls only. Never instantiate ReminderStore here. */
class ReminderModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newSingleThreadExecutor()
  override fun getName() = "CapstoneReminders"

  private fun command(method: String, arg: String?, promise: Promise) {
    worker.execute {
      try { promise.resolve(call(method, arg)) }
      catch (_: Exception) { promise.reject("REMINDERS_UNAVAILABLE", "Reminder storage or Android delivery is unavailable. Your planner data is retained.") }
    }
  }

  private fun call(method: String, arg: String? = null): String {
    val result = context.contentResolver.call(Uri.parse("content://${context.packageName}.reminders"), method, arg, null)
      ?: error("PROVIDER_UNAVAILABLE")
    check(result.getString("error") == null)
    return requireNotNull(result.getString("json"))
  }

  @ReactMethod fun capabilities(promise: Promise) = command("capabilities", null, promise)
  @ReactMethod fun reconcile(promise: Promise) = command("reconcile", null, promise)
  @ReactMethod fun diagnostics(promise: Promise) = command("diagnostics", null, promise)
  @ReactMethod fun setEnabled(enabled: Boolean, promise: Promise) = command("setEnabled", enabled.toString(), promise)
  @ReactMethod fun setFullScreenEnabled(enabled: Boolean, promise: Promise) = command("setFullScreenEnabled", enabled.toString(), promise)

  @ReactMethod fun openSettings(kind: String, promise: Promise) {
    context.runOnUiQueueThread {
      try {
        val activity = context.currentActivity
        if (activity == null) { promise.resolve(false); return@runOnUiQueueThread }
        val intent = when (kind) {
          "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          "exact" -> if (Build.VERSION.SDK_INT >= 31) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).setData(Uri.parse("package:${context.packageName}")) else null
          "fullScreen" -> if (Build.VERSION.SDK_INT >= 34) Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).setData(Uri.parse("package:${context.packageName}")) else null
          "channel" -> Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).putExtra(Settings.EXTRA_CHANNEL_ID, ReminderCapabilities.CHANNEL)
          else -> null
        }
        if (intent == null) promise.resolve(false)
        else { activity.startActivity(intent); promise.resolve(true) }
      } catch (_: Exception) { promise.reject("SETTINGS_UNAVAILABLE", "Android could not open this settings screen.") }
    }
  }

  @ReactMethod fun openReminder(jobId: String, occurrenceKey: String, generation: Double, promise: Promise) {
    if (jobId.length !in 1..1024 || occurrenceKey.length !in 1..1024 || !generation.isFinite() || generation < 1 || generation > Int.MAX_VALUE || generation % 1.0 != 0.0) {
      promise.reject("INVALID_REMINDER", "The reminder identity is invalid.")
      return
    }
    worker.execute {
      try {
        val identity = ReminderIdentity(jobId, occurrenceKey, generation.toInt())
        val json = JSONObject().put("jobId", jobId).put("occurrenceKey", occurrenceKey).put("generation", identity.generation)
        if (!JSONObject(call("canOpen", json.toString())).getBoolean("available")) { promise.resolve(false); return@execute }
        context.runOnUiQueueThread {
          try {
            val activity = context.currentActivity
            if (activity == null) promise.resolve(false)
            else { activity.startActivity(ReminderIntents.intent(context, identity, ReminderIntents.OPEN)); promise.resolve(true) }
          } catch (_: Exception) { promise.reject("REMINDER_UNAVAILABLE", "The reminder screen could not open.") }
        }
      } catch (_: Exception) { promise.reject("REMINDER_UNAVAILABLE", "This reminder is no longer available.") }
    }
  }

  override fun invalidate() {
    worker.shutdown()
    super.invalidate()
  }
}
