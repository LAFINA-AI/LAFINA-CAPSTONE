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

/** Permission is requested by visible UI at use. This adapter never captures on creation or resume. */
class SystemSpeechInputModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val handler = Handler(Looper.getMainLooper())
  private var foreground = false
  private val input = SpeechInput(context, {
    val activity = context.currentActivity
    foreground && activity != null && !activity.isFinishing && !activity.isDestroyed
  }, { event ->
    if (context.hasActiveReactInstance()) {
      val value = Arguments.createMap().apply {
        putString("sessionId", event.getString("sessionId"))
        putString("type", event.getString("type"))
        putDouble("elapsedMs", event.getDouble("elapsedMs"))
        if (event.has("engine")) putString("engine", event.getString("engine"))
        if (event.has("reason")) putString("reason", event.getString("reason"))
        if (event.has("transcript")) putString("transcript", event.getString("transcript"))
        if (event.has("recordingMs")) putDouble("recordingMs", event.getDouble("recordingMs"))
        if (event.has("transcriptionMs")) putDouble("transcriptionMs", event.getDouble("transcriptionMs"))
      }
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("CapstoneSttEvent", value)
    }
  })

  init { context.addLifecycleEventListener(this) }
  override fun getName() = "CapstoneStt"

  @ReactMethod fun capabilities(promise: Promise) {
    handler.post { try { promise.resolve(input.capabilities().toString()) }
      catch (_: Exception) { promise.reject("SPEECH_INPUT_UNAVAILABLE", "Offline speech input could not be checked. Manual controls remain available.") } }
  }

  @ReactMethod fun start(sessionId: String, languageTag: String, engine: String, promise: Promise) {
    handler.post { try { promise.resolve(input.start(sessionId, languageTag, engine).toString()) }
      catch (_: Exception) {
        input.release("START_FAILED")
        promise.reject("SPEECH_INPUT_UNAVAILABLE", "Speech input could not start. Continue typing or try a new hold.")
      } }
  }

  @ReactMethod fun stop(sessionId: String, promise: Promise) {
    handler.post { try { promise.resolve(input.stop(sessionId).toString()) }
      catch (_: Exception) {
        input.release("STOP_FAILED")
        promise.reject("SPEECH_INPUT_UNAVAILABLE", "Speech input stopped without a transcript. Continue typing or try again.")
      } }
  }

  @ReactMethod fun cancel(sessionId: String, reason: String, promise: Promise) {
    handler.post { try { input.cancel(sessionId, reason); promise.resolve(null) }
      catch (_: Exception) { input.release("CANCEL_FAILED"); promise.reject("SPEECH_INPUT_UNAVAILABLE", "Speech input was interrupted. Text remains available.") } }
  }

  @ReactMethod fun dispose(promise: Promise) {
    handler.post { input.release(); promise.resolve(null) }
  }

  @ReactMethod fun openSettings(promise: Promise) {
    handler.post {
      input.release("SETTINGS_OPENED")
      promise.resolve(SpeechInput.openSettings(context))
    }
  }

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Double) = Unit

  override fun onHostResume() { foreground = true }
  override fun onHostPause() { foreground = false; handler.post { input.release("APP_BACKGROUNDED") } }
  override fun onHostDestroy() { foreground = false; handler.post { input.release("HOST_DESTROYED") } }
  override fun invalidate() {
    foreground = false
    context.removeLifecycleEventListener(this)
    handler.post { input.release("BRIDGE_DISPOSED") }
    super.invalidate()
  }
}
