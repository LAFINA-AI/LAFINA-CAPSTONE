package com.lafina.capstone

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleLockScreenIntent(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleLockScreenIntent(intent)
  }

  private fun handleLockScreenIntent(intent: Intent?) {
    if (intent != null && intent.hasExtra("reminderId")) {
      LafinaReminderModule.captureActivityIntent(this, intent)
    }
  }

  // The React Native root contains private planner data. Notification intents
  // must pass Android keyguard before opening it, including during a call.

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "LafinaCapstone"

  // Floating LAFINA (ADR-036): the orb hides while this screen is visible,
  // and starts (when enabled and permitted) from this visible state. An open
  // Quick Chat panel is closed first so the two React screens never share
  // the host while both are resumed (ADR-036 Decision 5).
  override fun onResume() {
    QuickChatActivity.finishIfOpen()
    super.onResume()
    LafinaFloatingAssistantService.onMainResumed(this)
  }

  override fun onPause() {
    LafinaFloatingAssistantService.onMainPaused(this)
    super.onPause()
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
