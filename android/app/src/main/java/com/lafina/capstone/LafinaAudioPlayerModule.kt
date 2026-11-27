package com.lafina.capstone

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Lightweight native audio player for playing downloaded audio files (e.g. Gemini Cloud TTS WAV audio)
 * using standard Android MediaPlayer with audio focus management.
 * Contains zero ONNX or heavy ML dependencies.
 */
class LafinaAudioPlayerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())
  private var activeMediaPlayer: MediaPlayer? = null
  private var activePlaybackPromise: Promise? = null
  private var audioFocusRequest: AudioFocusRequest? = null
  private var activeFocusListener: AudioManager.OnAudioFocusChangeListener? = null

  override fun getName(): String = "LafinaAudioPlayer"

  @ReactMethod
  fun playAudio(filePath: String, promise: Promise) {
    val file = File(filePath)
    if (!file.exists()) {
      promise.reject("FILE_NOT_FOUND", "Audio file not found: $filePath")
      return
    }
    val preparedPath = file.absolutePath
    reactContext.runOnUiQueueThread {
      try {
        interruptActivePlayback()

        val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val mp = MediaPlayer()
        if (!requestPlaybackFocus(audioManager, mp)) {
          releasePlayer(mp)
          promise.reject("AUDIO_FOCUS_DENIED", "Audio focus was denied.")
          return@runOnUiQueueThread
        }
        activeMediaPlayer = mp
        activePlaybackPromise = promise

        mp.apply {
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build()
          )
          setDataSource(preparedPath)
        }

        mp.setOnCompletionListener {
          if (activeMediaPlayer !== mp) {
            releasePlayer(mp)
            return@setOnCompletionListener
          }
          val completedPromise = activePlaybackPromise
          releasePlayer(mp)
          activeMediaPlayer = null
          activePlaybackPromise = null
          abandonPlaybackFocus(audioManager)
          completedPromise?.resolve(true)
        }

        mp.setOnErrorListener { _, what, extra ->
          Log.e("LafinaAudioPlayer", "MediaPlayer error: what=$what, extra=$extra")
          if (activeMediaPlayer !== mp) {
            releasePlayer(mp)
            return@setOnErrorListener true
          }
          val failedPromise = activePlaybackPromise
          releasePlayer(mp)
          activeMediaPlayer = null
          activePlaybackPromise = null
          abandonPlaybackFocus(audioManager)
          failedPromise?.reject("PLAY_ERROR", "MediaPlayer error: what=$what, extra=$extra")
          true
        }

        mp.setOnPreparedListener { player ->
          if (activeMediaPlayer !== player) {
            releasePlayer(player)
            return@setOnPreparedListener
          }
          try {
            player.start()
          } catch (e: Exception) {
            Log.e("LafinaAudioPlayer", "MediaPlayer.start failed", e)
            val failedPromise = activePlaybackPromise
            releasePlayer(player)
            activeMediaPlayer = null
            activePlaybackPromise = null
            abandonPlaybackFocus(audioManager)
            failedPromise?.reject("PLAY_ERROR", e.message ?: "Playback start failed", e)
          }
        }
        mp.prepareAsync()
      } catch (e: Exception) {
        Log.e("LafinaAudioPlayer", "playAudio failed for $filePath", e)
        val failedPromise = activePlaybackPromise
        releasePlayer(activeMediaPlayer)
        activeMediaPlayer = null
        activePlaybackPromise = null
        val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        if (audioManager != null) {
          abandonPlaybackFocus(audioManager)
        }
        if (failedPromise != null) {
          failedPromise.reject("PLAY_ERROR", e.message, e)
        } else {
          promise.reject("PLAY_ERROR", e.message, e)
        }
      }
    }
  }

  @ReactMethod
  fun stopAudio(promise: Promise) {
    reactContext.runOnUiQueueThread {
      interruptActivePlayback()
      promise.resolve(true)
    }
  }

  override fun invalidate() {
    mainHandler.post {
      interruptActivePlayback()
    }
    super.invalidate()
  }

  private fun interruptActivePlayback() {
    val interruptedPromise = activePlaybackPromise
    releasePlayer(activeMediaPlayer)
    activeMediaPlayer = null
    activePlaybackPromise = null
    val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    abandonPlaybackFocus(audioManager)
    try {
      interruptedPromise?.resolve(false)
    } catch (_: Exception) {
    }
  }

  private fun releasePlayer(player: MediaPlayer?) {
    player?.let {
      try {
        if (it.isPlaying) it.stop()
      } catch (_: Exception) {
      }
      try {
        it.release()
      } catch (_: Exception) {
      }
    }
  }

  private fun requestPlaybackFocus(audioManager: AudioManager, ownerPlayer: MediaPlayer): Boolean {
    val listener = AudioManager.OnAudioFocusChangeListener { focusChange ->
      if (focusChange == AudioManager.AUDIOFOCUS_LOSS ||
          focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
        reactContext.runOnUiQueueThread {
          if (activeMediaPlayer === ownerPlayer) {
            interruptActivePlayback()
          }
        }
      }
    }
    activeFocusListener = listener
    return try {
      val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val attrs = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(attrs)
          .setOnAudioFocusChangeListener(listener)
          .build()
        audioFocusRequest = request
        audioManager.requestAudioFocus(request)
      } else {
        @Suppress("DEPRECATION")
        audioManager.requestAudioFocus(
          listener,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
        )
      }
      result != AudioManager.AUDIOFOCUS_REQUEST_FAILED
    } catch (e: Exception) {
      Log.w("LafinaAudioPlayer", "Audio focus request failed (continuing anyway)", e)
      true
    }
  }

  private fun abandonPlaybackFocus(audioManager: AudioManager) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        audioFocusRequest = null
      } else {
        activeFocusListener?.let {
          @Suppress("DEPRECATION")
          audioManager.abandonAudioFocus(it)
        }
      }
      activeFocusListener = null
    } catch (e: Exception) {
      Log.w("LafinaAudioPlayer", "Abandon audio focus failed", e)
    }
  }
}
