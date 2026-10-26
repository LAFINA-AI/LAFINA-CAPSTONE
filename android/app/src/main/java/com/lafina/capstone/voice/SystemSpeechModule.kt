package com.lafina.capstone.voice

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

/** JSON keeps the legacy-module interop narrow; no SQLite or model runtime is loaded here. */
class SystemSpeechModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val handler = Handler(Looper.getMainLooper())
  private var foreground = false
  private val speech = SystemSpeech(context, {
    val activity = context.currentActivity
    foreground && activity != null && !activity.isFinishing && !activity.isDestroyed
  }, { event ->
    if (context.hasActiveReactInstance()) {
      val value = Arguments.createMap().apply {
        putString("requestId", event.getString("requestId"))
        putString("type", event.getString("type"))
        putDouble("elapsedMs", event.getDouble("elapsedMs"))
        if (event.has("reason")) putString("reason", event.getString("reason"))
        if (event.has("requestToStartMs")) putDouble("requestToStartMs", event.getDouble("requestToStartMs"))
      }
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("CapstoneTtsEvent", value)
    }
  })

  init { context.addLifecycleEventListener(this) }
  override fun getName() = "CapstoneTts"

  @ReactMethod fun initialize(optionsJson: String, promise: Promise) {
    if (optionsJson.length > 2048) { promise.reject("INVALID_OPTIONS", "Choose valid speech settings."); return }
    val options = try { SystemSpeech.options(JSONObject(optionsJson)) }
      catch (_: Exception) { promise.reject("INVALID_OPTIONS", "Choose valid speech settings."); return }
    handler.post { try { speech.initialize(options) { promise.resolve(it.toString()) } }
      catch (_: Exception) { promise.reject("SPEECH_UNAVAILABLE", "Text remains available. Review Android speech settings.") } }
  }

  @ReactMethod fun speak(requestId: String, text: String, promise: Promise) {
    handler.post { try { promise.resolve(speech.speak(requestId, text).toString()) }
      catch (_: Exception) { promise.reject("SPEECH_UNAVAILABLE", "The reply is available as text.") } }
  }

  @ReactMethod fun stop(reason: String, promise: Promise) {
    handler.post { speech.stop(reason); promise.resolve(null) }
  }

  @ReactMethod fun dispose(promise: Promise) {
    handler.post { speech.release(); promise.resolve(null) }
  }

  @ReactMethod fun diagnostics(promise: Promise) {
    handler.post { promise.resolve(speech.diagnostics().toString()) }
  }

  @ReactMethod fun openSettings(promise: Promise) {
    handler.post {
      speech.release("SETTINGS_OPENED")
      promise.resolve(SystemSpeech.openSettings(context))
    }
  }

  // Required by NativeEventEmitter. Listener lifetime is owned by the visible React client.
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Double) = Unit

  override fun onHostResume() { foreground = true }
  override fun onHostPause() { foreground = false; handler.post { speech.release("APP_BACKGROUNDED") } }
  override fun onHostDestroy() { foreground = false; handler.post { speech.release("HOST_DESTROYED") } }
  override fun invalidate() {
    foreground = false
    context.removeLifecycleEventListener(this)
    handler.post { speech.release("BRIDGE_DISPOSED") }
    super.invalidate()
  }
}
