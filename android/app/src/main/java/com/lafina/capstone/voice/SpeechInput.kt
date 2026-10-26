package com.lafina.capstone.voice

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Explicit visible hold only. No generic recognizer, network request, retained transcript or DB access. */
class SpeechInput(
  context: Context,
  private val visible: () -> Boolean,
  private val onEvent: (JSONObject) -> Unit = {},
) {
  private val app = context.applicationContext
  private val handler = Handler(Looper.getMainLooper())
  private val sessions = SpeechInputSessions()
  private val failedAndroidLanguages = mutableSetOf<String>()
  private var active: Run? = null
  private var worker: ExecutorService? = null
  private val workerActive = AtomicBoolean(false)

  private class Run(val ticket: InputTicket, val language: String, val lease: MicrophoneLease) {
    val holding = AtomicBoolean(true)
    val cancelled = AtomicBoolean(false)
    var recognizer: SpeechRecognizer? = null
    var capture: PcmCapture? = null
    var recordingAt = 0L
    var recordingMs = 0L
    var transcribingAt = 0L
    var prepareTimeout: Runnable? = null
    var holdTimeout: Runnable? = null
    var decodeTimeout: Runnable? = null
    var stopAudioModeWatch: (() -> Unit)? = null
  }

  fun capabilities(): JSONObject {
    checkMain()
    val android = onDeviceAvailable()
    val whisper = WhisperTranscriber.isAvailable(app)
    val selected = SpeechInputPolicy.selectEngine(Build.VERSION.SDK_INT, android, whisper, "auto", "en-US" in failedAndroidLanguages)
    return JSONObject().put("available", selected != null).put("sdk", Build.VERSION.SDK_INT)
      .put("permission", permitted()).put("onDevice", android).put("whisper", whisper)
      .put("selectedEngine", selected ?: JSONObject.NULL).apply {
        if (selected == null) put("reason", if (Build.VERSION.SDK_INT < 31) "ANDROID_11_REQUIRES_WHISPER" else "OFFLINE_ENGINE_UNAVAILABLE")
        else if (!permitted()) put("reason", "PERMISSION_REQUIRED")
      }
  }

  /** Returns acceptance only. A later result/error/cancelled event is the terminal outcome. */
  fun start(sessionId: String, languageTag: String, enginePreference: String = "auto"): JSONObject {
    checkMain()
    val response = acceptance(sessionId, false)
    if (!SpeechInputPolicy.validSessionId(sessionId) || !SpeechInputPolicy.validLanguage(languageTag) || !SpeechInputPolicy.validEngine(enginePreference)) return response.put("reason", "INVALID_REQUEST")
    if (!visible()) return response.put("reason", "NOT_VISIBLE")
    if (!permitted()) return response.put("reason", "PERMISSION_DENIED")
    if (active != null || workerActive.get()) return response.put("reason", "MIC_BUSY")
    if (sessions.hasSeen(sessionId)) return response.put("reason", "DUPLICATE_SESSION")
    val engine = SpeechInputPolicy.selectEngine(Build.VERSION.SDK_INT, onDeviceAvailable(), WhisperTranscriber.isAvailable(app), enginePreference, languageTag in failedAndroidLanguages)
      ?: return response.put("reason", "OFFLINE_ENGINE_UNAVAILABLE")
    val lease = MicrophoneLease.acquire(app) ?: return response.put("reason", "MIC_BUSY")
    val ticket = sessions.begin(sessionId, engine, SystemClock.elapsedRealtime())
    if (ticket == null) { lease.close(); return response.put("reason", "DUPLICATE_SESSION") }
    val run = Run(ticket, languageTag, lease)
    active = run
    emit(run, "preparing")
    // An injected/visible owner may synchronously cancel from the event callback.
    if (!current(run)) return response.put("reason", "SESSION_CANCELLED")
    run.prepareTimeout = Runnable { if (current(run)) fail(run, "PREPARATION_TIMEOUT") }
      .also { handler.postDelayed(it, SpeechInputPolicy.PREPARE_TIMEOUT_MS) }
    try {
      watchAudioMode(run)
      if (engine == "android") prepareAndroid(run) else startWhisper(run)
    } catch (_: SecurityException) { fail(run, "PERMISSION_REVOKED") }
      catch (failure: CaptureFailure) { fail(run, failure.reason) }
      catch (_: Exception) { fail(run, "ENGINE_START_FAILED") }
    return response.put("accepted", true).put("engine", engine)
  }

  fun stop(sessionId: String): JSONObject {
    checkMain()
    val run = active?.takeIf { it.ticket.sessionId == sessionId } ?: return acceptance(sessionId, sessions.hasSeen(sessionId))
      .put("reason", if (sessions.hasSeen(sessionId)) "ALREADY_FINISHED" else "SESSION_NOT_ACTIVE")
    // End-of-speech/results can beat the UI's release message. Releasing twice must not cancel a valid decode.
    if (run.ticket.phase == InputPhase.TRANSCRIBING) return acceptance(sessionId, true).put("reason", "ALREADY_TRANSCRIBING")
    run.holding.set(false)
    if (run.ticket.phase == InputPhase.PREPARING) {
      cancel(sessionId, "RELEASED_BEFORE_READY")
      return acceptance(sessionId, true).put("engine", run.ticket.engine)
    }
    beginTranscribing(run)
    if (run.ticket.engine == "android") {
      try { run.recognizer?.stopListening() } catch (_: Exception) { fail(run, "ENGINE_STOP_FAILED") }
    } else run.capture?.stop()
    return acceptance(sessionId, true).put("engine", run.ticket.engine)
  }

  fun cancel(sessionId: String, reason: String = "USER_CANCELLED") {
    checkMain()
    val run = active?.takeIf { it.ticket.sessionId == sessionId } ?: return
    finish(run, "cancelled", safeReason(reason))
  }

  fun release(reason: String = "DISPOSED") {
    checkMain()
    active?.let { finish(it, "cancelled", safeReason(reason)) }
    try { worker?.shutdown() } catch (_: Exception) { }
    worker = null
  }

  private fun prepareAndroid(run: Run) {
    if (Build.VERSION.SDK_INT < 31) { fail(run, "ANDROID_ON_DEVICE_UNSUPPORTED"); return }
    val audio = app.getSystemService(AudioManager::class.java)
    if (audio.mode != AudioManager.MODE_NORMAL) { fail(run, "AUDIO_INTERRUPTED"); return }
    val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(app)
    run.recognizer = recognizer
    recognizer.setRecognitionListener(object : RecognitionListener {
      override fun onReadyForSpeech(params: Bundle?) {
        if (!live(run)) return
        if (!run.holding.get()) { cancel(run.ticket.sessionId, "RELEASED_BEFORE_READY"); return }
        markRecording(run)
      }
      override fun onBeginningOfSpeech() { if (live(run) && run.holding.get()) markRecording(run) }
      override fun onEndOfSpeech() {
        if (!live(run)) return
        run.holding.set(false)
        if (run.ticket.phase == InputPhase.PREPARING) fail(run, "NO_SPEECH") else beginTranscribing(run)
      }
      override fun onResults(results: Bundle?) {
        if (!live(run)) return
        val values = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        val text = values?.firstOrNull()?.let(SpeechInputPolicy::transcript)
        if (text == null) { fail(run, "NO_SPEECH"); return }
        if (run.ticket.phase == InputPhase.PREPARING) { fail(run, "UNEXPECTED_RESULT"); return }
        run.holding.set(false)
        beginTranscribing(run)
        finish(run, "result", transcript = text)
      }
      override fun onError(error: Int) {
        if (!current(run)) return
        val reason = errorReason(error)
        if (reason in setOf("LANGUAGE_UNAVAILABLE", "LANGUAGE_NOT_SUPPORTED", "OFFLINE_ENGINE_UNAVAILABLE", "RECOGNITION_FAILED")) failedAndroidLanguages.add(run.language)
        fail(run, reason)
      }
      override fun onRmsChanged(rmsdB: Float) = Unit
      override fun onBufferReceived(buffer: ByteArray?) = Unit
      override fun onPartialResults(partialResults: Bundle?) = Unit
      override fun onEvent(eventType: Int, params: Bundle?) = Unit
    })
    val intent = recognizerIntent(run.language)
    if (Build.VERSION.SDK_INT >= 33) {
      // Query does not request a model download. A failed capability query is not permission to use a cloud recognizer.
      recognizer.checkRecognitionSupport(intent, app.mainExecutor, object : RecognitionSupportCallback {
        override fun onSupportResult(support: RecognitionSupport) {
          if (!live(run) || !run.holding.get()) return
          if (support.installedOnDeviceLanguages.none { it.equals(run.language, ignoreCase = true) }) {
            failedAndroidLanguages.add(run.language)
            fail(run, "LANGUAGE_UNAVAILABLE")
          } else listenAndroid(run, intent)
        }
        override fun onError(error: Int) {
          if (!live(run) || !run.holding.get()) return
          if (error == SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT) listenAndroid(run, intent)
          else { failedAndroidLanguages.add(run.language); fail(run, errorReason(error)) }
        }
      })
    } else listenAndroid(run, intent)
  }

  private fun listenAndroid(run: Run, intent: Intent) {
    if (!live(run) || !run.holding.get()) return
    try { run.recognizer?.startListening(intent) }
    catch (_: SecurityException) { fail(run, "PERMISSION_REVOKED") }
    catch (_: Exception) { fail(run, "ENGINE_START_FAILED") }
  }

  private fun startWhisper(run: Run) {
    if (!live(run) || !run.holding.get()) return
    val capture = PcmCapture.open(app) { reason -> if (current(run)) cancel(run.ticket.sessionId, reason) }
    run.capture = capture
    workerActive.set(true)
    markRecording(run)
    try {
      val executor = worker ?: Executors.newSingleThreadExecutor { job -> Thread(job, "CapstoneOfflineStt").apply { isDaemon = true } }.also { worker = it }
      executor.execute {
        var samples: FloatArray? = null
        try {
          samples = capture.read(run.holding, run.cancelled)
          if (run.cancelled.get()) return@execute
          handler.post { if (current(run)) { run.holding.set(false); beginTranscribing(run) } }
          if (!SpeechInputPolicy.hasAudioSignal(samples)) throw CaptureFailure("NO_AUDIO_SIGNAL")
          val text = SpeechInputPolicy.transcript(WhisperTranscriber.transcribe(app, samples, run.language) { run.cancelled.get() })
          if (!run.cancelled.get()) handler.post {
            if (live(run)) { if (text == null) fail(run, "NO_SPEECH") else finish(run, "result", transcript = text) }
          }
        } catch (failure: Exception) {
          val reason = if (failure is CaptureFailure) failure.reason else "TRANSCRIPTION_FAILED"
          if (!run.cancelled.get()) handler.post { if (current(run)) fail(run, reason) }
        } finally {
          samples?.fill(0f)
          capture.close()
          run.lease.close()
          workerActive.set(false)
        }
      }
    } catch (_: Exception) {
      workerActive.set(false)
      capture.close()
      fail(run, "WORKER_UNAVAILABLE")
    }
  }

  private fun markRecording(run: Run) {
    if (!current(run) || !sessions.recording(run.ticket.token)) return
    run.recordingAt = SystemClock.elapsedRealtime()
    run.prepareTimeout?.let(handler::removeCallbacks); run.prepareTimeout = null
    emit(run, "recording")
    if (!current(run)) return
    run.holdTimeout = Runnable { if (current(run)) stop(run.ticket.sessionId) }
      .also { handler.postDelayed(it, SpeechInputPolicy.MAX_HOLD_MS) }
  }

  private fun beginTranscribing(run: Run) {
    if (!current(run) || !sessions.transcribing(run.ticket.token)) return
    run.recordingMs = maxOf(0, SystemClock.elapsedRealtime() - run.recordingAt)
    run.transcribingAt = SystemClock.elapsedRealtime()
    run.holdTimeout?.let(handler::removeCallbacks); run.holdTimeout = null
    emit(run, "transcribing")
    if (!current(run)) return
    run.decodeTimeout = Runnable { if (current(run)) fail(run, "TRANSCRIPTION_TIMEOUT") }
      .also { handler.postDelayed(it, SpeechInputPolicy.TRANSCRIBE_TIMEOUT_MS) }
  }

  private fun live(run: Run): Boolean {
    if (!current(run)) return false
    if (!visible()) { finish(run, "cancelled", "NOT_VISIBLE"); return false }
    if (!permitted()) { fail(run, "PERMISSION_REVOKED"); return false }
    return true
  }

  private fun fail(run: Run, reason: String) = finish(run, "error", reason)

  private fun finish(run: Run, type: String, reason: String? = null, transcript: String? = null) {
    if (!current(run)) return
    sessions.finish(run.ticket.token)
    active = null
    run.cancelled.set(true)
    run.holding.set(false)
    run.capture?.stop()
    for (timer in listOf(run.prepareTimeout, run.holdTimeout, run.decodeTimeout)) timer?.let(handler::removeCallbacks)
    try { run.stopAudioModeWatch?.invoke() } catch (_: Exception) { }
    run.stopAudioModeWatch = null
    try { run.recognizer?.cancel() } catch (_: Exception) { }
    try { run.recognizer?.destroy() } catch (_: Exception) { }
    run.recognizer = null
    // An active native decoder keeps the OS lease until its cooperative abort/finally completes.
    if (run.ticket.engine == "android" || !workerActive.get()) {
      run.capture?.close()
      run.lease.close()
    }
    emit(run, type, reason, transcript)
  }

  private fun emit(run: Run, type: String, reason: String? = null, transcript: String? = null) {
    val now = SystemClock.elapsedRealtime()
    val event = JSONObject().put("sessionId", run.ticket.sessionId).put("type", type)
      .put("engine", run.ticket.engine).put("elapsedMs", now.toDouble())
    if (reason != null) event.put("reason", safeReason(reason))
    if (transcript != null && type == "result") event.put("transcript", transcript)
    if (run.recordingAt > 0) event.put("recordingMs", (if (run.recordingMs > 0) run.recordingMs else now - run.recordingAt).toDouble())
    if (run.transcribingAt > 0) event.put("transcriptionMs", maxOf(0, now - run.transcribingAt).toDouble())
    try { onEvent(event) } catch (_: Exception) { /* Never log audio/transcripts or turn a UI callback into a recording leak. */ }
  }

  private fun current(run: Run): Boolean = active === run && sessions.current(run.ticket.token)
  private fun watchAudioMode(run: Run) {
    if (Build.VERSION.SDK_INT >= 31) {
      val audio = app.getSystemService(AudioManager::class.java)
      val listener = AudioManager.OnModeChangedListener { mode ->
        if (mode != AudioManager.MODE_NORMAL && current(run)) cancel(run.ticket.sessionId, "AUDIO_INTERRUPTED")
      }
      audio.addOnModeChangedListener(app.mainExecutor, listener)
      run.stopAudioModeWatch = { audio.removeOnModeChangedListener(listener) }
    }
  }
  private fun permitted(): Boolean = app.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
  private fun onDeviceAvailable(): Boolean = Build.VERSION.SDK_INT >= 31 && try { SpeechRecognizer.isOnDeviceRecognitionAvailable(app) } catch (_: Exception) { false }
  private fun acceptance(id: String, accepted: Boolean) = JSONObject().put("sessionId", id).put("accepted", accepted)
  private fun checkMain() = check(Looper.myLooper() == Looper.getMainLooper()) { "Speech input must run on the main thread" }

  companion object {
    fun recognizerIntent(language: String): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
      .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
      .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)

    fun openSettings(context: Context): Boolean = try {
      context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(android.net.Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
    } catch (_: Exception) { false }

    private fun safeReason(value: String): String = value.takeIf { Regex("[A-Za-z0-9_-]{1,64}").matches(it) } ?: "CANCELLED"
    private fun errorReason(error: Int): String = when (error) {
      SpeechRecognizer.ERROR_AUDIO -> "MIC_UNAVAILABLE"
      SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "PERMISSION_REVOKED"
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "MIC_BUSY"
      SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "NO_SPEECH"
      SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "LANGUAGE_NOT_SUPPORTED"
      SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "LANGUAGE_UNAVAILABLE"
      SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "OFFLINE_ENGINE_UNAVAILABLE"
      SpeechRecognizer.ERROR_TOO_MANY_REQUESTS -> "TOO_MANY_REQUESTS"
      else -> "RECOGNITION_FAILED"
    }
  }
}
