package com.lafina.capstone

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap

/**
 * Floating LAFINA (ADR-036): the JS bridge ("LafinaFloatingAssistant").
 * JS owns the per-user setting; this keeps the native mirror the service
 * reads, starts or stops the service, and reports status. No event stream:
 * JS re-reads `getStatus()` when it needs to.
 */
class LafinaFloatingAssistantModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "LafinaFloatingAssistant"

  private val prefs: FloatingAssistantPrefs
    get() = FloatingAssistantPrefs(reactContext)

  private fun status(): WritableMap {
    val lowRam = LafinaFloatingAssistantService.isLowRam(reactContext)
    val prefs = prefs
    return Arguments.createMap().apply {
      // The overlay permission cannot be granted on low-RAM (Android Go) devices.
      putBoolean("supported", !lowRam)
      putBoolean("overlayGranted", Settings.canDrawOverlays(reactContext))
      putBoolean("notificationsGranted", NotificationManagerCompat.from(reactContext).areNotificationsEnabled())
      putBoolean("enabled", prefs.enabled)
      putBoolean("running", LafinaFloatingAssistantService.isRunning)
      putBoolean("hiddenUntilAppOpen", prefs.hiddenUntilAppOpen)
      putBoolean("launchBlockedSeen", prefs.launchBlockedSeen)
      putBoolean("lowRamDevice", lowRam)
      putBoolean("quickChatOpen", QuickChatActivity.isOpen)
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      promise.resolve(status())
    } catch (e: Exception) {
      promise.reject("FLOATING_STATUS_FAILED", e.message, e)
    }
  }

  /**
   * Saves the mirror and starts or stops the service. Starting is attempted
   * only while one of LAFINA's activities is visible (the settings screen),
   * which is what allows a foreground-service start.
   */
  @ReactMethod
  fun setEnabled(enabled: Boolean, ownerId: String?, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val prefs = prefs
        prefs.enabled = enabled
        prefs.ownerId = if (enabled) ownerId else null
        if (enabled) {
          prefs.hiddenUntilAppOpen = false
          if (FloatingAssistantVisibility.anyActivityResumed && !LafinaFloatingAssistantService.isRunning) {
            LafinaFloatingAssistantService.start(reactContext)
          }
        } else {
          LafinaFloatingAssistantService.stop(reactContext)
        }
        promise.resolve(status())
      } catch (e: Exception) {
        promise.reject("FLOATING_SET_FAILED", e.message, e)
      }
    }
  }

  /** Android's "Display over other apps" page for LAFINA. */
  @ReactMethod
  fun openOverlaySettings(promise: Promise) {
    openSettings(
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${reactContext.packageName}")),
        promise)
  }

  @ReactMethod
  fun openAppDetailsSettings(promise: Promise) {
    openSettings(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${reactContext.packageName}")),
        promise)
  }

  private fun openSettings(intent: Intent, promise: Promise) {
    try {
      val activity = reactApplicationContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        reactContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("FLOATING_SETTINGS_UNAVAILABLE", e.message, e)
    }
  }

  @ReactMethod
  fun setOrbAppearance(appearance: ReadableMap, promise: Promise) {
    try {
      val raw = if (appearance.hasKey("color")) appearance.getString("color") else null
      if (raw == null || !Regex("^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$").matches(raw)) {
        promise.reject("FLOATING_COLOR_INVALID", "Expected #RRGGBB or #RRGGBBAA.")
        return
      }
      // JS writes #RRGGBBAA; Android parses #AARRGGBB. The orb is always opaque.
      prefs.color = Color.parseColor(raw.substring(0, 7))
      LafinaFloatingAssistantService.refreshAppearance()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("FLOATING_COLOR_FAILED", e.message, e)
    }
  }

  private fun customization(): WritableMap {
    val prefs = prefs
    val look = prefs.look
    return Arguments.createMap().apply {
      putString("style", look.style.code)
      putString("size", look.size.code)
      putString("side", prefs.placement.edge.name.lowercase())
      putInt("idleOpacity", look.idleOpacity)
      putString("color", look.color?.let { String.format("#%06X", it and 0xFFFFFF) } ?: "theme")
      putBoolean("tuckWhenIdle", look.tuckWhenIdle)
      putBoolean("lockPosition", look.lockPosition)
      putBoolean("hideInFullscreen", look.hideInFullscreen)
    }
  }

  @ReactMethod
  fun getOrbCustomization(promise: Promise) {
    try {
      promise.resolve(customization())
    } catch (e: Exception) {
      promise.reject("FLOATING_LOOK_FAILED", e.message, e)
    }
  }

  /**
   * Saves the keys present in [changes] (anything invalid is refused as a
   * whole) and rebuilds the button. Device-local, like the position.
   */
  @ReactMethod
  fun setOrbCustomization(changes: ReadableMap, promise: Promise) {
    try {
      val prefs = prefs
      var look = prefs.look
      fun text(key: String): String? = if (changes.hasKey(key) && !changes.isNull(key)) changes.getString(key) else null
      fun flag(key: String, current: Boolean): Boolean = if (changes.hasKey(key)) changes.getBoolean(key) else current
      text("style")?.let { look = look.copy(style = OrbStyle.parse(it) ?: return reject(promise, "style")) }
      text("size")?.let { look = look.copy(size = OrbSize.parse(it) ?: return reject(promise, "size")) }
      if (changes.hasKey("idleOpacity")) {
        val value = changes.getDouble("idleOpacity")
        if (value.isNaN() || value < OrbLook.MIN_OPACITY || value > OrbLook.MAX_OPACITY) return reject(promise, "idleOpacity")
        look = look.copy(idleOpacity = value.toInt())
      }
      text("color")?.let { raw ->
        look = when {
          raw == "theme" -> look.copy(color = null)
          Regex("^#[0-9a-fA-F]{6}$").matches(raw) -> look.copy(color = Color.parseColor(raw))
          else -> return reject(promise, "color")
        }
      }
      look = look.copy(
          tuckWhenIdle = flag("tuckWhenIdle", look.tuckWhenIdle),
          lockPosition = flag("lockPosition", look.lockPosition),
          hideInFullscreen = flag("hideInFullscreen", look.hideInFullscreen))
      val side = text("side")?.let {
        when (it) {
          "left" -> OrbEdge.LEFT
          "right" -> OrbEdge.RIGHT
          else -> return reject(promise, "side")
        }
      }
      prefs.look = look
      if (side != null) prefs.placement = prefs.placement.copy(edge = side)
      LafinaFloatingAssistantService.refreshLook()
      promise.resolve(customization())
    } catch (e: Exception) {
      promise.reject("FLOATING_LOOK_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun resetOrbCustomization(promise: Promise) {
    try {
      prefs.resetLook()
      LafinaFloatingAssistantService.refreshLook()
      promise.resolve(customization())
    } catch (e: Exception) {
      promise.reject("FLOATING_LOOK_FAILED", e.message, e)
    }
  }

  private fun reject(promise: Promise, key: String) {
    promise.reject("FLOATING_LOOK_INVALID", "Invalid value for $key.")
  }

  /** Finishes the Quick Chat panel (an explicit finish; Back alone did not always close it). */
  @ReactMethod
  fun closeQuickChat(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        QuickChatActivity.finishIfOpen()
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("FLOATING_CLOSE_FAILED", e.message, e)
      }
    }
  }

  /** Brings the main LAFINA screen to the front; its resume closes the panel. */
  @ReactMethod
  fun openMainApp(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val intent = Intent(reactContext, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        val activity = reactApplicationContext.currentActivity
        if (activity != null) activity.startActivity(intent) else reactContext.startActivity(intent)
        QuickChatActivity.finishIfOpen()
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("FLOATING_OPEN_APP_FAILED", e.message, e)
      }
    }
  }

  @ReactMethod
  fun resetOrbPosition(promise: Promise) {
    try {
      LafinaFloatingAssistantService.resetPosition(reactContext)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("FLOATING_RESET_FAILED", e.message, e)
    }
  }
}
