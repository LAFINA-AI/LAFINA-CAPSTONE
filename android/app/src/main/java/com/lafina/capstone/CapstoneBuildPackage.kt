package com.lafina.capstone

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.uimanager.ViewManager

/**
 * Registers LAFINA-CAPSTONE native modules and view managers.
 */
class CapstoneBuildPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(
      CapstoneBuildModule(context),
      AndroidKeystoreModule(context),
      AndroidConnectivityModule(context),
      LafinaThemeRevealModule(context),
      LafinaGrainientModule(context),
      LafinaReminderModule(context),
      LafinaAudioPlayerModule(context),
      LafinaSpeechToTextModule(context),
      LafinaIntentExtractorModule(context),
    )

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(
      LafinaGrainientViewManager(),
    )
}

class CapstoneBuildModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "CapstoneBuild"
  override fun getConstants(): Map<String, Any> =
    mapOf("plannerHarnessEnabled" to BuildConfig.ENABLE_PLANNER_HARNESS)
}
