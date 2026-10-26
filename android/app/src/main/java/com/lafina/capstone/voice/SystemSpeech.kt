package com.lafina.capstone.voice

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import org.json.JSONArray
import org.json.JSONObject

/** All state belongs to the main thread. No singleton, service, file cache, microphone or retained text. */
class SystemSpeech(
  context: Context,
  private val visible: () -> Boolean,
  private val onEvent: (JSONObject) -> Unit = {},
) {
  private val app = context.applicationContext
  private val handler = Handler(Looper.getMainLooper())
  private val audio = app.getSystemService(AudioManager::class.java)
  private val attributes = AudioAttributes.Builder().setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE).build()
  private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    .setAudioAttributes(attributes).setWillPauseWhenDucked(true).setAcceptsDelayedFocusGain(false)
    .setOnAudioFocusChangeListener({ change ->
      if (change != AudioManager.AUDIOFOCUS_GAIN) stop("AUDIO_FOCUS_LOST")
    }, handler).build()
  private val tickets = SpeechTickets()
  private val binding = SpeechInitialization()
  private val events = ArrayDeque<JSONObject>()
  private var engine: TextToSpeech? = null
  private var selected: SpeechVoice? = null
  private var options = SpeechOptions()
  private var initialization: ((JSONObject) -> Unit)? = null
  private var initTimeout: Runnable? = null
  private var speechTimeout: Runnable? = null
  private var focusHeld = false
  private var inventory = emptyInventory("NOT_INITIALIZED")

  fun initialize(value: SpeechOptions, complete: (JSONObject) -> Unit) {
    checkMain()
    val validated = try { value.validate() } catch (_: Exception) {
      complete(emptyInventory("INVALID_OPTIONS")); return
    }
    release("REINITIALIZED")
    options = validated
    if (!visible()) { complete(emptyInventory("NOT_VISIBLE")); return }
    val engines = try { installedEngines() } catch (_: Exception) {
      complete(emptyInventory("ENGINE_INVENTORY_FAILED")); return
    }
    if (engines.length() == 0) { complete(emptyInventory("NO_ENGINE").put("engines", engines)); return }
    if (options.enginePackage != null && (0 until engines.length()).none {
      engines.getJSONObject(it).getString("packageName") == options.enginePackage
    }) { complete(emptyInventory("ENGINE_NOT_INSTALLED").put("engines", engines)); return }
    val token = binding.begin()
    val started = SystemClock.elapsedRealtime()
    initialization = complete
    initTimeout = Runnable {
      if (binding.isCurrent(token) && initialization != null) failInit("INITIALIZATION_TIMEOUT", engines, started)
    }.also { handler.postDelayed(it, 10_000) }
    try {
      // The public constructor may fall back to the system engine. We verify the live Voice,
      // and expose the requested/default package without claiming a verified binder identity.
      engine = TextToSpeech(app, { status -> handler.post {
        if (!binding.isCurrent(token) || initialization == null) return@post
        if (!visible()) { failInit("NOT_VISIBLE", engines, started); return@post }
        if (status != TextToSpeech.SUCCESS) { failInit("INITIALIZATION_FAILED", engines, started); return@post }
        finishInit(engines, started)
      } }, options.enginePackage)
    } catch (_: Exception) { failInit("INITIALIZATION_FAILED", engines, started) }
  }

  private fun finishInit(engines: JSONArray, started: Long) {
    try {
      val service = engine ?: return failInit("INITIALIZATION_FAILED", engines, started)
      val voices = service.voices.orEmpty().asSequence().filter {
        it.name.length in 1..512 && it.locale.toLanguageTag().length in 2..64
      }.sortedBy { it.name }.take(SpeechPolicy.MAX_VOICES).map(::describe).toList()
      val voice = SpeechPolicy.select(voices, options)
      val result = emptyInventory(if (voice == null) "OFFLINE_VOICE_UNAVAILABLE" else "READY")
        .put("enginePackage", options.enginePackage ?: service.defaultEngine ?: JSONObject.NULL)
        .put("engines", engines).put("voices", JSONArray(voices.map(::voiceJson)))
        .put("initializationMs", (SystemClock.elapsedRealtime() - started).toDouble())
      if (voice == null) { completeInit(result, false); return }
      val actual = service.voices?.firstOrNull { it.name == voice.name }
      if (actual == null || service.setVoice(actual) != TextToSpeech.SUCCESS || !matchesLiveVoice(service.voice, voice)) {
        completeInit(result.put("reason", "VOICE_SELECTION_FAILED"), false); return
      }
      if (service.setSpeechRate(options.rate.toFloat()) != TextToSpeech.SUCCESS ||
        service.setPitch(options.pitch.toFloat()) != TextToSpeech.SUCCESS ||
        service.setAudioAttributes(attributes) != TextToSpeech.SUCCESS) {
        completeInit(result.put("reason", "VOICE_CONFIGURATION_FAILED"), false); return
      }
      val listener = object : UtteranceProgressListener() {
        override fun onStart(id: String?) { handler.post {
          val ticket = id?.let(tickets::start)
          if (ticket != null) {
            if (!visible()) stop("NOT_VISIBLE") else emit(ticket, "start", requestToStartMs = SystemClock.elapsedRealtime() - ticket.requestedAt)
          }
        } }
        override fun onDone(id: String?) { handler.post { terminal(id, "done") } }
        @Deprecated("Android legacy callback")
        override fun onError(id: String?) { handler.post { terminal(id, "error", "SYNTHESIS_FAILED") } }
        override fun onError(id: String?, code: Int) { handler.post { terminal(id, "error", errorReason(code)) } }
        override fun onStop(id: String?, interrupted: Boolean) { handler.post { terminal(id, "cancelled", "ENGINE_STOPPED") } }
      }
      if (service.setOnUtteranceProgressListener(listener) != TextToSpeech.SUCCESS) {
        completeInit(result.put("reason", "VOICE_CALLBACKS_UNAVAILABLE"), false); return
      }
      selected = voice
      completeInit(result.put("available", true).put("selectedVoiceName", voice.name).removeReason(), true)
    } catch (_: Exception) { failInit("VOICE_INVENTORY_FAILED", engines, started) }
  }

  fun speak(requestId: String, text: String): JSONObject {
    checkMain()
    val result = JSONObject().put("requestId", requestId).put("accepted", false)
    if (!SpeechPolicy.validRequest(requestId, text)) return result.put("reason", "INVALID_REQUEST")
    if (!visible()) return result.put("reason", "NOT_VISIBLE")
    val service = engine ?: return result.put("reason", "NOT_INITIALIZED")
    val voice = selected ?: return result.put("reason", "OFFLINE_VOICE_UNAVAILABLE")
    // Never call setLanguage(): engines may auto-download missing data or select a network voice.
    val safe = try { matchesLiveVoice(service.voice, voice) } catch (_: Exception) { false }
    if (!safe) { stop("OFFLINE_VOICE_CHANGED"); return result.put("reason", "OFFLINE_VOICE_CHANGED") }
    if (tickets.hasSeen(requestId)) return result.put("reason", "DUPLICATE_REQUEST")
    stop("REPLACED")
    val ticket = tickets.begin(requestId, SystemClock.elapsedRealtime()) ?: return result.put("reason", "DUPLICATE_REQUEST")
    emit(ticket, "requested")
    val granted = try { audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED } catch (_: Exception) { false }
    if (!granted) { terminal(ticket.utteranceId, "error", "AUDIO_FOCUS_DENIED"); return result.put("reason", "AUDIO_FOCUS_DENIED") }
    focusHeld = true
    val accepted = try { service.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), ticket.utteranceId) == TextToSpeech.SUCCESS }
      catch (_: Exception) { false }
    if (!accepted) { terminal(ticket.utteranceId, "error", "SPEAK_REJECTED"); return result.put("reason", "SPEAK_REJECTED") }
    // A broken engine callback must not retain focus forever. No retries or backlog.
    speechTimeout = Runnable { if (tickets.active == ticket) stop("UTTERANCE_TIMEOUT") }
      .also { handler.postDelayed(it, 60_000) }
    return result.put("accepted", true)
  }

  fun stop(reason: String = "USER_STOPPED") {
    checkMain()
    // Cancel an in-flight initialize as well as accepted speech: otherwise its caller
    // could enqueue a reminder after the user already pressed Stop.
    binding.cancel()
    initTimeout?.let(handler::removeCallbacks); initTimeout = null
    val waiting = initialization
    initialization = null
    if (waiting != null) {
      try { engine?.shutdown() } catch (_: Exception) { }
      engine = null; selected = null
      waiting(emptyInventory(safeReason(reason)))
    }
    val current = tickets.active
    if (current != null) terminal(current.utteranceId, "cancelled", safeReason(reason))
    try { engine?.stop() } catch (_: Exception) { /* Text remains visible if a vendor engine fails. */ }
    abandonFocus()
  }

  fun release(reason: String = "DISPOSED") {
    checkMain()
    stop(reason)
    initTimeout?.let(handler::removeCallbacks); initTimeout = null
    val waiting = initialization
    initialization = null
    waiting?.invoke(emptyInventory(safeReason(reason)))
    try { engine?.shutdown() } catch (_: Exception) { /* No retry or background engine retained. */ }
    engine = null
    selected = null
    inventory = emptyInventory("NOT_INITIALIZED")
  }

  fun diagnostics(): JSONObject { checkMain(); return JSONObject().put("events", JSONArray(events.toList())) }

  private fun terminal(id: String?, type: String, reason: String? = null) {
    val ticket = id?.let(tickets::finish) ?: return
    speechTimeout?.let(handler::removeCallbacks); speechTimeout = null
    abandonFocus()
    emit(ticket, type, reason)
  }

  private fun emit(ticket: SpeechTicket, type: String, reason: String? = null, requestToStartMs: Long? = null) {
    val event = JSONObject().put("requestId", ticket.requestId).put("type", type)
      .put("elapsedMs", SystemClock.elapsedRealtime().toDouble())
    if (reason != null) event.put("reason", reason)
    if (requestToStartMs != null) event.put("requestToStartMs", requestToStartMs.toDouble())
    events.addLast(event)
    while (events.size > SpeechPolicy.MAX_EVENTS) events.removeFirst()
    try { onEvent(event) } catch (_: Exception) { /* A detached UI cannot retain playback. */ }
  }

  private fun abandonFocus() {
    if (focusHeld) try { audio.abandonAudioFocusRequest(focus) } catch (_: Exception) { /* Best effort platform release. */ }
    focusHeld = false
  }

  private fun failInit(reason: String, engines: JSONArray, started: Long) {
    completeInit(emptyInventory(reason).put("engines", engines)
      .put("initializationMs", (SystemClock.elapsedRealtime() - started).toDouble()), false)
  }

  private fun completeInit(result: JSONObject, retain: Boolean) {
    initTimeout?.let(handler::removeCallbacks); initTimeout = null
    val complete = initialization ?: return
    initialization = null
    binding.finish()
    inventory = result
    if (!retain) {
      try { engine?.shutdown() } catch (_: Exception) { }
      engine = null; selected = null
    }
    complete(result)
  }

  @Suppress("DEPRECATION")
  private fun installedEngines(): JSONArray {
    val services = app.packageManager.queryIntentServices(Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE), 0)
    return JSONArray(services.mapNotNull { it.serviceInfo?.let { service ->
      if (!service.enabled || !service.applicationInfo.enabled || service.packageName.length > 200) null else
        service.packageName to it.loadLabel(app.packageManager).toString().take(200)
    } }.distinctBy { it.first }.sortedBy { it.first }.take(SpeechPolicy.MAX_ENGINES)
      .map { (name, label) -> JSONObject().put("packageName", name).put("label", label) })
  }

  private fun checkMain() = check(Looper.myLooper() == Looper.getMainLooper()) { "SPEECH_MAIN_THREAD_REQUIRED" }

  companion object {
    fun options(json: JSONObject): SpeechOptions {
      fun optionalString(key: String): String? = if (!json.has(key) || json.isNull(key)) null else {
        require(json.get(key) is String); json.getString(key)
      }
      if (json.has("languageTag")) require(json.get("languageTag") is String)
      if (json.has("rate")) require(json.get("rate") is Number)
      if (json.has("pitch")) require(json.get("pitch") is Number)
      return SpeechOptions(optionalString("enginePackage"), optionalString("voiceName"),
        if (json.has("languageTag")) json.getString("languageTag") else "en-US",
        if (json.has("rate")) json.getDouble("rate") else 1.0,
        if (json.has("pitch")) json.getDouble("pitch") else 1.0).validate()
    }

    fun describe(voice: Voice): SpeechVoice = SpeechVoice(voice.name, voice.locale.toLanguageTag(),
      !voice.isNetworkConnectionRequired,
      !voice.features.orEmpty().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED), voice.quality, voice.latency)

    fun matchesLiveVoice(actual: Voice?, expected: SpeechVoice): Boolean = actual != null && describe(actual).let {
      it.name == expected.name && it.languageTag.equals(expected.languageTag, true) && it.offline && it.installed
    }

    fun openSettings(context: Context): Boolean = try {
      context.startActivity(Intent("com.android.settings.TTS_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
    } catch (_: Exception) {
      try { context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true }
      catch (_: Exception) { false }
    }

    private fun voiceJson(value: SpeechVoice): JSONObject = JSONObject().put("name", value.name)
      .put("languageTag", value.languageTag).put("offline", value.offline).put("installed", value.installed)
      .put("quality", value.quality).put("latency", value.latency)

    private fun emptyInventory(reason: String): JSONObject = JSONObject().put("available", false).put("reason", reason)
      .put("enginePackage", JSONObject.NULL).put("engines", JSONArray()).put("voices", JSONArray())
      .put("selectedVoiceName", JSONObject.NULL).put("initializationMs", JSONObject.NULL)

    private fun JSONObject.removeReason(): JSONObject { remove("reason"); return this }

    private fun safeReason(value: String): String = if (Regex("[A-Z_]{1,48}").matches(value)) value else "USER_STOPPED"
    private fun errorReason(code: Int): String = when (code) {
      TextToSpeech.ERROR_NETWORK, TextToSpeech.ERROR_NETWORK_TIMEOUT -> "OFFLINE_ENGINE_NETWORK_ERROR"
      TextToSpeech.ERROR_NOT_INSTALLED_YET -> "OFFLINE_VOICE_MISSING_DATA"
      TextToSpeech.ERROR_OUTPUT -> "AUDIO_OUTPUT_FAILED"
      TextToSpeech.ERROR_SERVICE -> "ENGINE_SERVICE_FAILED"
      else -> "SYNTHESIS_FAILED"
    }
  }
}
