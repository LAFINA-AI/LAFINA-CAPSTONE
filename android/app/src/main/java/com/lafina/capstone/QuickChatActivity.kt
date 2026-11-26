package com.lafina.capstone

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.lang.ref.WeakReference

/**
 * Floating LAFINA (ADR-036): the translucent Quick Chat panel. A second
 * React activity rendering the `LafinaQuickChat` root on the app's existing
 * React host. Own task, excluded from recents, not exported, not shown on the
 * lock screen.
 *
 * Host lifecycle guard (ADR-036 Decision 5, FLOAT-00 Spike B): the two React
 * activities must never both drive the shared host. This activity finishes
 * when the main screen is in front, skips its host resume while the main
 * screen is resumed, and skips its host pause when it is not the host's
 * current activity. When it is the current activity it behaves exactly like
 * the default delegate.
 */
class QuickChatActivity : ReactActivity() {
  companion object {
    private const val TAG = "LafinaQuickChat"

    /** JS: `quickChatPresence` (true while this panel is the visible screen). */
    const val EVENT_VISIBILITY = "LAFINA_QUICK_CHAT_VISIBILITY"

    @Volatile private var current: WeakReference<QuickChatActivity>? = null

    /** True while a Quick Chat panel exists and is not finishing. */
    val isOpen: Boolean
      get() = current?.get()?.isFinishing == false

    fun intent(context: Context): Intent =
        Intent(context, QuickChatActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** Main thread. Finishes the panel if one exists (close, open LAFINA, main screen resumed). */
    fun finishIfOpen(): Boolean {
      val activity = current?.get() ?: return false
      if (activity.isFinishing) return false
      activity.finish()
      return true
    }
  }

  override fun getMainComponentName(): String = "LafinaQuickChat"

  override fun onCreate(savedInstanceState: Bundle?) {
    FloatingAssistantVisibility.install(application)
    // No saved React view state is restored: the panel's state lives in JS memory.
    super.onCreate(null)
    current = WeakReference(this)
    if (FloatingAssistantVisibility.mainResumed) {
      Log.i(TAG, "Main screen is in front; closing")
      finish()
    }
  }

  override fun onResume() {
    // Before the host resume, so JS knows Quick Chat is in front before its
    // AppState "active" handlers run (R-03 gate in App.tsx).
    if (!FloatingAssistantVisibility.mainResumed) emitVisibility(true)
    super.onResume()
  }

  override fun onPause() {
    emitVisibility(false)
    super.onPause()
  }

  override fun onDestroy() {
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  private fun emitVisibility(visible: Boolean) {
    try {
      val context = reactActivityDelegate.reactHost?.currentReactContext ?: return
      if (!context.hasActiveReactInstance()) return
      context.emitDeviceEvent(
          EVENT_VISIBILITY, Arguments.createMap().apply { putBoolean("visible", visible) })
    } catch (e: Exception) {
      Log.w(TAG, "Could not report visibility: ${e.javaClass.simpleName}")
    }
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      GuardedDelegate(this, mainComponentName, fabricEnabled)

  private class GuardedDelegate(
      private val panel: QuickChatActivity,
      componentName: String,
      fabric: Boolean,
  ) : DefaultReactActivityDelegate(panel, componentName, fabric) {
    override fun onResume() {
      if (FloatingAssistantVisibility.mainResumed) {
        // Never resume the host for a second activity while the main screen holds it.
        Log.i(TAG, "Main screen resumed; skipping host resume and closing")
        panel.finish()
        return
      }
      super.onResume()
    }

    override fun onPause() {
      val hostActivity =
          try {
            reactHost?.currentReactContext?.currentActivity
          } catch (e: Exception) {
            null
          }
      if (hostActivity != null && hostActivity !== panel) {
        // The main screen took the host; pausing it from here would pause the
        // visible screen (and trips React Native's activity assertion).
        Log.i(TAG, "Host belongs to another LAFINA screen; skipping host pause")
        return
      }
      super.onPause()
    }
  }
}
