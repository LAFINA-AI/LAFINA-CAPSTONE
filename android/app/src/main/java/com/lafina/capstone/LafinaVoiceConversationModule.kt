package com.lafina.capstone

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

/**
 * Live voice conversation with an ElevenAgents agent over its documented
 * WebSocket protocol (`wss://api.elevenlabs.io/v1/convai/conversation`).
 *
 * One session at a time, started only by an explicit tap in the app (the JS
 * controller passes a signed URL minted by LAFINA's server). While it runs the
 * session owns the shared microphone lease, audio focus and the
 * communication audio route; [teardown] releases all of them exactly once.
 *
 * Audio: 16 kHz mono PCM. Capture uses the VOICE_COMMUNICATION source with the
 * platform echo canceller so LAFINA's own voice is not heard as the student
 * interrupting; playback uses USAGE_VOICE_COMMUNICATION so the canceller has
 * its reference. Turn taking and interruption detection happen at ElevenLabs;
 * this bridge flushes queued audio the moment an `interruption` arrives.
 *
 * Nothing here runs at app start: the HTTP client is created on first use, and
 * the offline speech, reminders and TTS modules do not depend on this module.
 */
class LafinaVoiceConversationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  init {
    LafinaMicrophoneLease.configure(reactContext)
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = "LafinaVoiceConversation"

  private val http: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(15, TimeUnit.SECONDS)
      .readTimeout(0, TimeUnit.MILLISECONDS)
      .writeTimeout(10, TimeUnit.SECONDS)
      .followRedirects(false)
      .build()
  }

  /** Teardown and audio setup run here, never on the JS or socket threads. */
  private val worker = Executors.newSingleThreadExecutor { task -> Thread(task, WORKER_THREAD) }
  @Volatile private var session: Session? = null

  private inner class Session(val key: String, val ticket: MicrophoneLeaseRegistry.Ticket) {
    val ended = AtomicBoolean(false)
    @Volatile var socket: WebSocket? = null
    @Volatile var startPromise: Promise? = null
    @Volatile var muted = false
    @Volatile var suppressAgentAudio = false
    @Volatile var speaking = false
    @Volatile var recorder: AudioRecord? = null
    var echoCanceler: AcousticEchoCanceler? = null
    var noiseSuppressor: NoiseSuppressor? = null
    @Volatile var captureThread: Thread? = null
    @Volatile var captureRunning = false
    @Volatile var track: AudioTrack? = null
    val queue = PlaybackQueue()
    @Volatile var playThread: Thread? = null
    @Volatile var framesWritten = 0L
    var focusRequest: AudioFocusRequest? = null
    var previousMode = AudioManager.MODE_NORMAL
    var previousSpeakerphone = false
    var audioPrepared = false
    var openedAt = 0L
  }

  private fun audioManager() = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private fun emit(key: String, kind: String, fill: (WritableMap.() -> Unit)? = null) {
    try {
      val map = Arguments.createMap()
      map.putString("sessionKey", key)
      map.putString("kind", kind)
      fill?.invoke(map)
      reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT, map)
    } catch (e: Exception) {
      Log.w(TAG, "Event $kind could not be delivered", e)
    }
  }

  private fun current(key: String): Session? = session?.takeIf { it.key == key && !it.ended.get() }

  @ReactMethod
  fun start(options: ReadableMap, promise: Promise) {
    val key = if (options.hasKey("sessionKey")) options.getString("sessionKey") else null
    val url = if (options.hasKey("url")) options.getString("url") else null
    val initiation = if (options.hasKey("initiation")) options.getString("initiation") else null
    if (key.isNullOrBlank() || url.isNullOrBlank() || initiation.isNullOrBlank()) {
      promise.reject("BAD_ARGUMENTS", "A session key, address and start message are required.")
      return
    }
    if (session != null) {
      promise.reject("SESSION_BUSY", "A voice conversation is already running.")
      return
    }
    if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED) {
      promise.reject("PERMISSION_DENIED", "Microphone permission is required.")
      return
    }
    val allowLocal = BuildConfig.API_BASE_URL_OVERRIDE.isNotEmpty() &&
      options.hasKey("allowLocalTestServer") && options.getBoolean("allowLocalTestServer")
    // Never log the URL: it carries a conversation signature.
    if (!VoiceConversationRules.isAllowedSocketUrl(url, allowLocal)) {
      promise.reject("BAD_URL", "The conversation address is not an ElevenLabs conversation.")
      return
    }
    if (initiation.length > VoiceConversationRules.MAX_INITIATION_CHARS) {
      promise.reject("BAD_ARGUMENTS", "The start message is too large.")
      return
    }
    val ticket = LafinaMicrophoneLease.tryAcquire(MicrophoneLeaseRegistry.Holder.VOICE_CONVERSATION)
    if (ticket == null) {
      promise.reject(LafinaMicrophoneLease.BUSY_CODE, LafinaMicrophoneLease.busyMessage())
      return
    }
    val created = Session(key, ticket)
    created.startPromise = promise
    session = created
    try {
      created.socket = http.newWebSocket(Request.Builder().url(url).build(), Listener(created, initiation))
    } catch (e: Exception) {
      Log.w(TAG, "Conversation socket could not be created (${e.javaClass.simpleName})")
      teardown(created, "connect_failed", 1001)
    }
  }

  private inner class Listener(val owner: Session, val initiation: String) : WebSocketListener() {
    override fun onOpen(webSocket: WebSocket, response: Response) {
      if (owner.ended.get()) {
        webSocket.cancel()
        return
      }
      owner.openedAt = SystemClock.elapsedRealtime()
      webSocket.send(initiation)
      worker.execute {
        if (owner.ended.get()) return@execute
        try {
          prepareAudio(owner)
          startCapture(owner)
          startPlayback(owner)
        } catch (e: Exception) {
          Log.w(TAG, "Conversation audio could not start (${e.javaClass.simpleName})")
          val focus = e is AudioFocusDeniedException
          emit(owner.key, "error") {
            putString("code", if (focus) "AUDIO_FOCUS_DENIED" else "AUDIO_START_FAILED")
            putString(
              "message",
              if (focus) "Another app or a call is using audio right now." else "The microphone or speaker could not start.",
            )
          }
          teardown(owner, "audio_failed", 1000)
          return@execute
        }
        owner.startPromise?.resolve(true)
        owner.startPromise = null
        emit(owner.key, "open")
      }
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
      if (owner.ended.get() || text.length > VoiceConversationRules.MAX_INBOUND_FRAME_CHARS) return
      val message = try {
        JSONObject(text)
      } catch (_: Exception) {
        return
      }
      when (message.optString("type")) {
        "ping" -> {
          val eventId = message.optJSONObject("ping_event")?.optLong("event_id", -1L) ?: -1L
          if (eventId >= 0) webSocket.send(VoiceConversationRules.pongMessage(eventId))
          return
        }
        "audio" -> {
          if (owner.suppressAgentAudio) return
          val encoded = message.optJSONObject("audio_event")?.optString("audio_base_64").orEmpty()
          val pcm = VoiceConversationRules.decodeAudio(encoded) ?: return
          owner.queue.offer(pcm)
          return
        }
        "interruption" -> {
          // JS hears about the interruption before the silence it causes, so
          // its interruption-to-silence timing starts at the right moment.
          if (text.length <= VoiceConversationRules.MAX_FORWARDED_FRAME_CHARS) {
            emit(owner.key, "message") { putString("data", text) }
          }
          flushPlayback(owner)
          owner.suppressAgentAudio = false
          return
        }
        "user_transcript" -> owner.suppressAgentAudio = false
        "conversation_initiation_metadata" -> {
          val meta = message.optJSONObject("conversation_initiation_metadata_event")
          val output = VoiceConversationRules.sampleRateOf(meta?.optString("agent_output_audio_format"))
          val input = VoiceConversationRules.sampleRateOf(meta?.optString("user_input_audio_format"))
          if (output != VoiceConversationRules.SAMPLE_RATE || input != VoiceConversationRules.SAMPLE_RATE) {
            emit(owner.key, "error") {
              putString("code", "UNSUPPORTED_AUDIO_FORMAT")
              putString("message", "The voice agent must use pcm_16000 audio in both directions.")
            }
            teardown(owner, "unsupported_format", 1000)
            return
          }
        }
      }
      if (text.length <= VoiceConversationRules.MAX_FORWARDED_FRAME_CHARS) {
        emit(owner.key, "message") { putString("data", text) }
      }
    }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
      webSocket.close(1000, null)
      remoteEnded(owner, code, reason)
    }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
      remoteEnded(owner, code, reason)
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      if (owner.ended.get()) return
      val status = response?.code ?: 0
      Log.w(TAG, "Conversation socket failed (${t.javaClass.simpleName}, HTTP $status)")
      val start = owner.startPromise
      if (start != null) {
        owner.startPromise = null
        start.reject(if (status == 401 || status == 403) "REJECTED" else "CONNECT_FAILED", "The conversation could not connect.")
      } else {
        emit(owner.key, "closed") {
          putInt("code", 1006)
          putString("reason", "network")
        }
      }
      teardown(owner, "network", 1001)
    }
  }

  private fun remoteEnded(owner: Session, code: Int, reason: String) {
    if (owner.ended.get()) return
    owner.startPromise?.reject("CONNECT_FAILED", "The conversation closed before it started.")
    owner.startPromise = null
    emit(owner.key, "closed") {
      putInt("code", code)
      // ElevenLabs close reasons are short status text, never credentials.
      putString("reason", reason.take(200))
    }
    teardown(owner, "remote_closed", 1000)
  }

  private fun prepareAudio(owner: Session) {
    val manager = audioManager()
    owner.previousMode = manager.mode
    @Suppress("DEPRECATION")
    owner.previousSpeakerphone = manager.isSpeakerphoneOn
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
      .setAudioAttributes(attributes)
      .setOnAudioFocusChangeListener { change ->
        // A call, an alarm or another app took the audio: end, and let the
        // student restart when it is safe. Never resume by itself.
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
          emit(owner.key, "audio_focus_lost")
          teardown(owner, "audio_focus_lost", 1000)
        }
      }
      .build()
    owner.focusRequest = request
    if (manager.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
      // For example during a phone call: do not talk over it.
      throw AudioFocusDeniedException()
    }
    manager.mode = AudioManager.MODE_IN_COMMUNICATION
    routeAudio(manager)
    owner.audioPrepared = true
    reactContext.currentActivity?.runOnUiThread {
      reactContext.currentActivity?.volumeControlStream = AudioManager.STREAM_VOICE_CALL
    }
  }

  /** Headset or Bluetooth when connected, otherwise the loudspeaker (not the earpiece). */
  private fun routeAudio(manager: AudioManager) {
    val headsets = setOf(
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLE_HEADSET,
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val devices = manager.availableCommunicationDevices
      val target = devices.firstOrNull { it.type in headsets }
        ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
      target?.let { manager.setCommunicationDevice(it) }
    } else {
      val headset = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.type in headsets }
      @Suppress("DEPRECATION")
      manager.isSpeakerphoneOn = !headset
    }
  }

  private fun startCapture(owner: Session) {
    if (owner.ended.get() || owner.muted || owner.captureRunning) return
    val minBuffer = AudioRecord.getMinBufferSize(
      VoiceConversationRules.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
    )
    val recorder = AudioRecord(
      MediaRecorder.AudioSource.VOICE_COMMUNICATION,
      VoiceConversationRules.SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      maxOf(minBuffer, VoiceConversationRules.CAPTURE_FRAME_BYTES * 4),
    )
    if (recorder.state != AudioRecord.STATE_INITIALIZED) {
      recorder.release()
      throw IllegalStateException("AudioRecord did not initialize")
    }
    if (AcousticEchoCanceler.isAvailable()) {
      owner.echoCanceler = AcousticEchoCanceler.create(recorder.audioSessionId)?.apply { enabled = true }
    }
    if (NoiseSuppressor.isAvailable()) {
      owner.noiseSuppressor = NoiseSuppressor.create(recorder.audioSessionId)?.apply { enabled = true }
    }
    recorder.startRecording()
    owner.recorder = recorder
    owner.captureRunning = true
    emit(owner.key, "mic") { putBoolean("capturing", true) }
    val thread = Thread({
      val buffer = ByteArray(VoiceConversationRules.CAPTURE_FRAME_BYTES)
      var lastLevelAt = 0L
      while (owner.captureRunning && !owner.ended.get()) {
        val read = try {
          recorder.read(buffer, 0, buffer.size)
        } catch (_: Exception) {
          -1
        }
        if (read < 0) {
          if (owner.captureRunning && !owner.ended.get()) {
            emit(owner.key, "error") {
              putString("code", "MIC_FAILED")
              putString("message", "The microphone stopped working.")
            }
            teardown(owner, "mic_failed", 1000)
          }
          break
        }
        if (read == 0 || owner.muted) continue
        val socket = owner.socket ?: break
        // Bounded: when the network falls behind, audio is dropped, not hoarded.
        if (socket.queueSize() < VoiceConversationRules.MAX_SOCKET_BACKLOG_BYTES) {
          socket.send(VoiceConversationRules.audioChunkMessage(buffer, read))
        }
        val now = SystemClock.elapsedRealtime()
        if (now - lastLevelAt >= 200) {
          lastLevelAt = now
          val level = rms(buffer, read)
          emit(owner.key, "level") { putDouble("level", level) }
        }
      }
    }, "lafina-voice-capture")
    owner.captureThread = thread
    thread.start()
  }

  private fun rms(buffer: ByteArray, length: Int): Double {
    var sum = 0.0
    var count = 0
    var i = 0
    while (i + 1 < length) {
      val sample = ((buffer[i + 1].toInt() shl 8) or (buffer[i].toInt() and 0xff)).toShort().toDouble()
      sum += sample * sample
      count += 1
      i += 2
    }
    return if (count == 0) 0.0 else minOf(1.0, Math.sqrt(sum / count) / 8000.0)
  }

  /** Stops and releases capture; blocks until the read loop has left. */
  private fun stopCapture(owner: Session) {
    owner.captureRunning = false
    val recorder = owner.recorder
    owner.recorder = null
    try {
      recorder?.stop()
    } catch (_: Exception) {
    }
    owner.captureThread?.let {
      try {
        it.join(1000)
      } catch (_: InterruptedException) {
      }
    }
    owner.captureThread = null
    try {
      owner.echoCanceler?.release()
    } catch (_: Exception) {
    }
    try {
      owner.noiseSuppressor?.release()
    } catch (_: Exception) {
    }
    owner.echoCanceler = null
    owner.noiseSuppressor = null
    try {
      recorder?.release()
    } catch (_: Exception) {
    }
    if (recorder != null) emit(owner.key, "mic") { putBoolean("capturing", false) }
  }

  private fun startPlayback(owner: Session) {
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
    val format = AudioFormat.Builder()
      .setSampleRate(VoiceConversationRules.SAMPLE_RATE)
      .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
      .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
      .build()
    val minBuffer = AudioTrack.getMinBufferSize(
      VoiceConversationRules.SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT
    )
    val track = AudioTrack.Builder()
      .setAudioAttributes(attributes)
      .setAudioFormat(format)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .setBufferSizeInBytes(maxOf(minBuffer * 2, 6400))
      .build()
    track.play()
    owner.track = track
    val thread = Thread({
      while (!owner.ended.get()) {
        val item = try {
          owner.queue.take(100)
        } catch (_: InterruptedException) {
          null
        }
        if (owner.ended.get()) break
        if (item == null) {
          if (owner.speaking && owner.queue.isEmpty() && drained(owner, track)) {
            owner.speaking = false
            emit(owner.key, "playback") { putBoolean("speaking", false) }
          }
          continue
        }
        val (generation, chunk) = item
        if (!owner.speaking) {
          owner.speaking = true
          emit(owner.key, "playback") { putBoolean("speaking", true) }
        }
        var offset = 0
        while (offset < chunk.size && generation == owner.queue.generation && !owner.ended.get()) {
          val length = minOf(SLICE_BYTES, chunk.size - offset)
          val written = try {
            track.write(chunk, offset, length, AudioTrack.WRITE_BLOCKING)
          } catch (_: Exception) {
            -1
          }
          if (written <= 0) break
          offset += written
          owner.framesWritten += written / 2
        }
      }
    }, "lafina-voice-playback")
    owner.playThread = thread
    thread.start()
  }

  private fun drained(owner: Session, track: AudioTrack): Boolean =
    try {
      (track.playbackHeadPosition.toLong() and 0xffffffffL) >= owner.framesWritten
    } catch (_: Exception) {
      true
    }

  /** Silences LAFINA at once: queued and buffered audio are dropped, never replayed. */
  private fun flushPlayback(owner: Session) {
    owner.queue.flush()
    val track = owner.track ?: return
    try {
      track.pause()
      track.flush()
      track.stop()
      owner.framesWritten = 0
      track.play()
    } catch (_: Exception) {
    }
    if (owner.speaking) {
      owner.speaking = false
      emit(owner.key, "playback") { putBoolean("speaking", false) }
    }
  }

  @ReactMethod
  fun setMuted(key: String, muted: Boolean, promise: Promise) {
    val owner = current(key)
    if (owner == null) {
      promise.resolve(false)
      return
    }
    worker.execute {
      if (owner.ended.get()) {
        promise.resolve(false)
        return@execute
      }
      owner.muted = muted
      try {
        // Muted means the microphone is off: nothing is read, buffered or sent.
        if (muted) stopCapture(owner) else startCapture(owner)
        promise.resolve(true)
      } catch (e: Exception) {
        Log.w(TAG, "Unmute failed (${e.javaClass.simpleName})")
        promise.reject("MIC_FAILED", "The microphone could not restart.")
      }
    }
  }

  /** Stops LAFINA's current answer; the conversation and microphone continue. */
  @ReactMethod
  fun stopResponse(key: String, promise: Promise) {
    val owner = current(key)
    if (owner == null) {
      promise.resolve(false)
      return
    }
    owner.suppressAgentAudio = true
    flushPlayback(owner)
    owner.socket?.send("{\"type\":\"user_activity\"}")
    promise.resolve(true)
  }

  @ReactMethod
  fun sendMessage(key: String, json: String, promise: Promise) {
    val owner = current(key)
    if (owner == null) {
      promise.resolve(false)
      return
    }
    val type = try {
      if (json.length > 8192) null else JSONObject(json).optString("type")
    } catch (_: Exception) {
      null
    }
    if (type == null || type !in VoiceConversationRules.ALLOWED_CLIENT_TYPES) {
      promise.reject("BAD_MESSAGE", "That message type is not allowed.")
      return
    }
    promise.resolve(owner.socket?.send(json) == true)
  }

  @ReactMethod
  fun end(key: String, promise: Promise) {
    val owner = session?.takeIf { it.key == key }
    if (owner == null) {
      promise.resolve(false)
      return
    }
    worker.execute {
      teardown(owner, "client", 1000)
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun isActive(promise: Promise) {
    promise.resolve(session?.ended?.get() == false)
  }

  /**
   * Releases everything the session owns, exactly once: socket, capture,
   * playback, audio focus, audio mode and route, and the microphone lease (last,
   * after the capture loop has stopped).
   */
  private fun teardown(owner: Session, reason: String, code: Int) {
    if (!owner.ended.compareAndSet(false, true)) return
    // Release joins the capture and playback threads, so it runs on the
    // worker; never on those threads themselves or the main thread.
    if (Thread.currentThread().name == WORKER_THREAD) {
      release(owner, reason, code)
    } else {
      try {
        worker.execute { release(owner, reason, code) }
      } catch (_: RejectedExecutionException) {
        release(owner, reason, code)
      }
    }
  }

  private fun release(owner: Session, reason: String, code: Int) {
    owner.startPromise?.reject("ENDED", "The conversation ended before it started.")
    owner.startPromise = null
    try {
      owner.socket?.close(code, null)
    } catch (_: Exception) {
    }
    owner.socket?.cancel()
    owner.socket = null
    stopCapture(owner)
    owner.queue.close()
    owner.playThread?.let {
      try {
        it.join(500)
      } catch (_: InterruptedException) {
      }
    }
    owner.playThread = null
    try {
      owner.track?.pause()
      owner.track?.flush()
      owner.track?.release()
    } catch (_: Exception) {
    }
    owner.track = null
    if (owner.audioPrepared) {
      val manager = audioManager()
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          manager.clearCommunicationDevice()
        } else {
          @Suppress("DEPRECATION")
          manager.isSpeakerphoneOn = owner.previousSpeakerphone
        }
        manager.mode = owner.previousMode
        owner.focusRequest?.let { manager.abandonAudioFocusRequest(it) }
      } catch (e: Exception) {
        Log.w(TAG, "Audio route could not be restored (${e.javaClass.simpleName})")
      }
      reactContext.currentActivity?.runOnUiThread {
        reactContext.currentActivity?.volumeControlStream = AudioManager.USE_DEFAULT_STREAM_TYPE
      }
    }
    LafinaMicrophoneLease.release(owner.ticket)
    if (session === owner) session = null
    emit(owner.key, "ended") { putString("reason", reason) }
  }

  // Leaving the foreground ends the conversation: no background microphone.
  override fun onHostPause() {
    session?.let { owner ->
      emit(owner.key, "backgrounded")
      teardown(owner, "background", 1000)
    }
  }

  override fun onHostResume() {}

  override fun onHostDestroy() {
    session?.let { owner -> teardown(owner, "destroyed", 1001) }
  }

  override fun invalidate() {
    session?.let { teardown(it, "invalidated", 1001) }
    reactContext.removeLifecycleEventListener(this)
    worker.shutdown()
    super.invalidate()
  }

  @ReactMethod
  fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {}

  @ReactMethod
  fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {}

  companion object {
    const val EVENT = "LafinaVoiceConversationEvent"
    private const val WORKER_THREAD = "lafina-voice-worker"
    private const val TAG = "LafinaVoiceConversation"
    /** 20 ms of 16 kHz mono PCM: a flush interrupts playback within one slice. */
    private const val SLICE_BYTES = 640
  }
}

private class AudioFocusDeniedException : IllegalStateException("Audio focus was not granted")
