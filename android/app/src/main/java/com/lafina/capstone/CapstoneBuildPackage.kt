package com.lafina.capstone

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.uimanager.ViewManager
import com.lafina.capstone.voice.SystemSpeechModule
import com.lafina.capstone.voice.SystemSpeechInputModule

/** A build flag only; no database, device identifier or planner content crosses this module. */
class CapstoneBuildPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(CapstoneBuildModule(context), DateTimePickerModule(context), SystemSpeechModule(context), SystemSpeechInputModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}

class CapstoneBuildModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "CapstoneBuild"
  override fun getConstants(): Map<String, Any> =
    mapOf("plannerHarnessEnabled" to BuildConfig.ENABLE_PLANNER_HARNESS)
}
