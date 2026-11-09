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
      LafinaMeetingRecorderModule(context),
      LafinaVoiceConversationModule(context),
    )

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(
      LafinaGrainientViewManager(),
    )
}

class CapstoneBuildModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "CapstoneBuild"
  override fun getConstants(): Map<String, Any> =
    mapOf(
      "plannerHarnessEnabled" to BuildConfig.ENABLE_PLANNER_HARNESS,
      // Empty except in a test build made with -PlafinaApiBaseUrl.
      "apiBaseUrlOverride" to BuildConfig.API_BASE_URL_OVERRIDE,
      // Debug and test builds only: Profile's Vercel/local server switch.
      "backendSwitchEnabled" to BuildConfig.ENABLE_BACKEND_SWITCH,
      "providerTestingEnabled" to BuildConfig.PROVIDER_TESTING_ENABLED,
      "directElevenKey" to BuildConfig.DIRECT_ELEVEN_KEY,
      "directDeepseekKey" to BuildConfig.DIRECT_DEEPSEEK_KEY,
      "directAgentId" to BuildConfig.DIRECT_AGENT_ID,
      "directVoiceId" to BuildConfig.DIRECT_VOICE_ID,
    )
}
