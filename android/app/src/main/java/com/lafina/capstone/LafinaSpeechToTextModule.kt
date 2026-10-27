package com.lafina.capstone

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sqrt

object LafinaWhisperBridge {
  init {
    try {
      System.loadLibrary("lafina_whisper")
    } catch (e: UnsatisfiedLinkError) {
      Log.e("LafinaWhisper", "Could not load native library lafina_whisper", e)
    }
  }

  const val MODEL_ASSET = "models/ggml-base.en-q5_1.bin"

  external fun initContext(assetManager: android.content.res.AssetManager, assetPath: String): Long
  external fun transcribe(
    contextPointer: Long,
    samples: FloatArray,
    threads: Int,
    commandMode: Boolean
  ): String
  external fun transcribeWithTimestamps(
    contextPointer: Long,
    samples: FloatArray,
    threads: Int
  ): String
  external fun freeContext(contextPointer: Long)
}

internal class SileroVadProcessor(private val reactContext: ReactApplicationContext) : AutoCloseable {
  private val environment = OrtEnvironment.getEnvironment()
  private val session: OrtSession
  private var state = FloatArray(STATE_SIZE)
  private var context = FloatArray(CONTEXT_SIZE)
  private val inputWindow = FloatArray(INPUT_WINDOW_SIZE)

  init {
    val modelFile = File(reactContext.cacheDir, "silero_vad_16k_op15.onnx")
    val assetPath = "models/silero_vad.onnx"
    val expectedSize = reactContext.assets.openFd(assetPath).use { it.length }
    if (!modelFile.exists() || modelFile.length() != expectedSize) {
      reactContext.assets.open(assetPath).use { input ->
        modelFile.outputStream().use { output -> input.copyTo(output) }
      }
    }
    val options = OrtSession.SessionOptions().apply { setIntraOpNumThreads(1) }
    session = environment.createSession(modelFile.absolutePath, options)
  }

  fun reset() {
    state.fill(0f)
    context.fill(0f)
    inputWindow.fill(0f)
  }

  fun probability(frame: FloatArray): Float {
    val preparedInput = buildContextualInputWindow(context, frame, inputWindow)
    val inputTensor = OnnxTensor.createTensor(
      environment,
      FloatBuffer.wrap(preparedInput),
      longArrayOf(1, preparedInput.size.toLong())
    )
    val stateTensor = OnnxTensor.createTensor(
      environment,
      FloatBuffer.wrap(state),
      longArrayOf(2, 1, 128)
    )
    val sampleRateTensor = OnnxTensor.createTensor(
      environment,
      LongBuffer.wrap(longArrayOf(SAMPLE_RATE.toLong())),
      longArrayOf()
    )
    try {
      session.run(
        mapOf(
          "input" to inputTensor,
          "state" to stateTensor,
          "sr" to sampleRateTensor
        )
      ).use { result ->
        val probability = (result[0] as OnnxTensor).floatBuffer.get(0)
        val stateBuffer = (result[1] as OnnxTensor).floatBuffer
        stateBuffer.get(state, 0, minOf(state.size, stateBuffer.remaining()))
        updateRollingContext(context, frame)
        return probability
      }
    } finally {
      inputTensor.close()
      stateTensor.close()
      sampleRateTensor.close()
    }
  }

  override fun close() {
    session.close()
  }

  companion object {
    const val SAMPLE_RATE = 16_000
    const val FRAME_SIZE = 512
    const val CONTEXT_SIZE = 64
    const val INPUT_WINDOW_SIZE = CONTEXT_SIZE + FRAME_SIZE
    const val STATE_SIZE = 2 * 1 * 128

    internal fun buildContextualInputWindow(
      context: FloatArray,
      frame: FloatArray,
      reusableWindow: FloatArray? = null
    ): FloatArray {
      val windowSize = context.size + frame.size
      val target = if (reusableWindow != null && reusableWindow.size == windowSize) {
        reusableWindow
      } else {
        FloatArray(windowSize)
      }
      context.copyInto(target, destinationOffset = 0, startIndex = 0, endIndex = context.size)
      frame.copyInto(target, destinationOffset = context.size, startIndex = 0, endIndex = frame.size)
      return target
    }

    internal fun updateRollingContext(context: FloatArray, frame: FloatArray) {
      if (frame.size >= context.size) {
        frame.copyInto(
          context,
          destinationOffset = 0,
          startIndex = frame.size - context.size,
          endIndex = frame.size
        )
      } else {
        val shift = frame.size
        context.copyInto(
          context,
          destinationOffset = 0,
          startIndex = shift,
          endIndex = context.size
        )
        frame.copyInto(
          context,
          destinationOffset = context.size - shift,
          startIndex = 0,
          endIndex = shift
        )
      }
    }
  }
}

class LafinaSpeechToTextModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  private val executor = Executors.newSingleThreadExecutor()
  private val stopRequested = AtomicBoolean(false)
  private val discardRequested = AtomicBoolean(false)
  private val activeCaptureId = AtomicReference<String?>(null)
  @Volatile private var activeRecorder: AudioRecord? = null
  @Volatile private var whisperContext: Long = 0L
  private var vadProcessor: SileroVadProcessor? = null

  // 60-second inactivity auto-unload mechanism to conserve system RAM and battery
  private val mainHandler = Handler(Looper.getMainLooper())
  private val inactivityUnloadRunnable = Runnable {
    unloadModelsInternal()
  }

  override fun getName(): String = "LafinaSpeechToText"

  private fun scheduleInactivityUnload() {
    mainHandler.removeCallbacks(inactivityUnloadRunnable)
    mainHandler.postDelayed(inactivityUnloadRunnable, INACTIVITY_UNLOAD_TIMEOUT_MS)
  }

  private fun cancelInactivityUnload() {
    mainHandler.removeCallbacks(inactivityUnloadRunnable)
  }

  @Synchronized
  private fun unloadModelsInternal() {
    if (activeCaptureId.get() != null) return
    try {
      if (whisperContext != 0L) {
        LafinaWhisperBridge.freeContext(whisperContext)
        whisperContext = 0L
        Log.i(TAG, "Whisper model context auto-unloaded after 60s inactivity")
      }
      vadProcessor?.close()
      vadProcessor = null
      Log.i(TAG, "Silero VAD session auto-unloaded after 60s inactivity")
    } catch (e: Exception) {
      Log.w(TAG, "Error during inactivity model unload", e)
    }
  }

  private fun sendEvent(eventName: String, params: WritableMap) {
    if (reactContext.hasActiveReactInstance()) {
      reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, params)
    }
  }

  @ReactMethod
  fun isAvailable(promise: Promise) {
    val hasAudioPermission = ContextCompat.checkSelfPermission(
      reactContext,
      Manifest.permission.RECORD_AUDIO
    ) == PackageManager.PERMISSION_GRANTED
    promise.resolve(hasAudioPermission)
  }

  @ReactMethod
  fun startListening(options: ReadableMap, promise: Promise) {
    transcribeInternal(options, promise)
  }

  @ReactMethod
  fun transcribe(options: ReadableMap, promise: Promise) {
    transcribeInternal(options, promise)
  }

  private fun transcribeInternal(options: ReadableMap, promise: Promise) {
    cancelInactivityUnload()
    if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED) {
      promise.reject("PERMISSION_DENIED", "Microphone permission is required for offline speech.")
      return
    }

    val captureId = if (options.hasKey("captureId")) {
      options.getString("captureId")?.takeIf { it.isNotBlank() }
    } else {
      null
    } ?: "legacy-${System.nanoTime()}"
    val requestedMode = if (options.hasKey("mode")) {
      options.getString("mode") ?: MODE_AUTOMATIC
    } else {
      MODE_AUTOMATIC
    }
    val mode = if (requestedMode == MODE_MANUAL) MODE_MANUAL else MODE_AUTOMATIC
    val captureContext = if (options.hasKey("context")) {
      options.getString("context") ?: CONTEXT_MAIN_MIC
    } else {
      CONTEXT_MAIN_MIC
    }
    val bargeIn = options.hasKey("bargeIn") && options.getBoolean("bargeIn")
    val useHardwareAudioEffects = if (options.hasKey("hardwareNoiseSuppression")) {
      options.getBoolean("hardwareNoiseSuppression")
    } else {
      bargeIn
    }
    if (!activeCaptureId.compareAndSet(null, captureId)) {
      promise.reject("CAPTURE_BUSY", "Another offline speech capture is already active.")
      return
    }

    stopRequested.set(false)
    discardRequested.set(false)
    executor.execute {
      try {
        val captureStartedAt = System.currentTimeMillis()
        val captured = captureUtterance(
          captureId,
          mode,
          bargeIn,
          captureContext,
          useHardwareAudioEffects
        )
        val captureDurationMs = System.currentTimeMillis() - captureStartedAt
        Log.i(
          TAG,
          "Capture $captureId finished: speech=${captured.speechDetected}, " +
            "capturedMs=${captured.audioDurationMs}, maxVad=${captured.maxVadProbability}, " +
            "peak=${captured.peakAmplitude}, wallMs=$captureDurationMs"
        )
        if (discardRequested.get()) {
          promise.resolve(resultMap(captureId, "", false, true, captureDurationMs, 0L))
          return@execute
        }
        if (!captured.speechDetected || captured.samples.isEmpty()) {
          promise.resolve(resultMap(captureId, "", false, false, captureDurationMs, 0L))
          return@execute
        }

        val inferenceStartedAt = System.currentTimeMillis()
        if (whisperContext == 0L) {
          whisperContext = LafinaWhisperBridge.initContext(
            reactContext.assets,
            WHISPER_MODEL_ASSET
          )
        }
        if (whisperContext == 0L) throw IllegalStateException("Whisper model failed to load")
        val threads = max(1, minOf(4, Runtime.getRuntime().availableProcessors() - 1))
        val speechWindowStart =
          (captured.speechStartSample - WHISPER_SPEECH_MARGIN_SAMPLES).coerceAtLeast(0)
        val speechWindowEnd =
          (captured.speechEndSample + WHISPER_SPEECH_MARGIN_SAMPLES)
            .coerceAtMost(captured.samples.size)
        val speechSamples = captured.samples.copyOfRange(speechWindowStart, speechWindowEnd)
        val commandMode = false
        val transcript = LafinaWhisperBridge.transcribe(
          whisperContext,
          prepareForWhisper(speechSamples),
          threads,
          commandMode
        ).trim()
        val inferenceDurationMs = System.currentTimeMillis() - inferenceStartedAt
        sendEvent("onSpeechFinalResult", Arguments.createMap().apply {
          putString("captureId", captureId)
          putString("transcript", transcript)
          putDouble("inferenceDurationMs", inferenceDurationMs.toDouble())
        })
        promise.resolve(
          resultMap(captureId, transcript, true, false, captureDurationMs, inferenceDurationMs)
        )
      } catch (error: Exception) {
        if (discardRequested.get()) {
          promise.resolve(resultMap(captureId, "", false, true, 0L, 0L))
        } else {
          promise.reject("OFFLINE_STT_ERROR", error.message, error)
        }
      } finally {
        activeRecorder = null
        activeCaptureId.compareAndSet(captureId, null)
        scheduleInactivityUnload()
      }
    }
  }

  private data class CapturedAudio(
    val samples: FloatArray,
    val speechDetected: Boolean,
    val audioDurationMs: Long,
    val maxVadProbability: Float,
    val peakAmplitude: Float,
    val speechStartSample: Int,
    val speechEndSample: Int
  )

  private fun captureUtterance(
    captureId: String,
    mode: String,
    bargeIn: Boolean,
    captureContext: String,
    useHardwareAudioEffects: Boolean = bargeIn
  ): CapturedAudio {
    val isReminderCall = captureContext == CONTEXT_REMINDER_CALL
    val minimumBuffer = AudioRecord.getMinBufferSize(
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    val audioSource = if (bargeIn) {
      MediaRecorder.AudioSource.VOICE_COMMUNICATION
    } else {
      MediaRecorder.AudioSource.VOICE_RECOGNITION
    }
    val recorder = AudioRecord(
      audioSource,
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      max(minimumBuffer, FRAME_SIZE * 4)
    )
    if (recorder.state != AudioRecord.STATE_INITIALIZED) {
      recorder.release()
      throw IllegalStateException("Microphone recorder could not initialize")
    }

    val echoCanceler = try {
      if (bargeIn && AcousticEchoCanceler.isAvailable()) {
        AcousticEchoCanceler.create(recorder.audioSessionId)?.apply { enabled = true }
      } else {
        null
      }
    } catch (_: Exception) {
      null
    }
    val noiseSuppressor = try {
      if (useHardwareAudioEffects && NoiseSuppressor.isAvailable()) {
        NoiseSuppressor.create(recorder.audioSessionId)?.apply { enabled = true }
      } else {
        null
      }
    } catch (_: Exception) {
      null
    }
    val automaticGainControl = try {
      if (useHardwareAudioEffects && AutomaticGainControl.isAvailable()) {
        AutomaticGainControl.create(recorder.audioSessionId)?.apply { enabled = true }
      } else {
        null
      }
    } catch (_: Exception) {
      null
    }
    val vad = vadProcessor ?: SileroVadProcessor(reactContext).also { vadProcessor = it }
    vad.reset()
    val waitSeconds = when {
      mode == MODE_MANUAL -> MANUAL_CAPTURE_LIMIT_SECONDS
      captureContext == CONTEXT_REMINDER_CALL -> REMINDER_WAIT_FOR_SPEECH_SECONDS
      else -> MAIN_WAIT_FOR_SPEECH_SECONDS
    }
    val speechLimitSeconds = when {
      mode == MODE_MANUAL -> MANUAL_CAPTURE_LIMIT_SECONDS
      isReminderCall -> CALL_COMMAND_LIMIT_SECONDS
      else -> MAX_UTTERANCE_SECONDS
    }
    val maximumWaitSamples = SAMPLE_RATE * waitSeconds
    val maximumSpeechSamples = SAMPLE_RATE * speechLimitSeconds
    val audio = FloatArray(PRE_ROLL_SAMPLES + maximumSpeechSamples + FRAME_SIZE)
    var audioSize = 0
    val preRoll = FloatArray(PRE_ROLL_SAMPLES)
    var preRollSize = 0
    var preRollWriteIndex = 0
    val frame = ShortArray(FRAME_SIZE)
    var speechDetected = false
    var speechEvidenceFrames = 0
    var silenceFramesAfterSpeech = 0
    var samplesWaitingForSpeech = 0
    var maxVadProbability = 0f
    var peakAmplitude = 0f
    var noiseFloorRms = INITIAL_NOISE_FLOOR_RMS
    var totalStreamSamples = 0
    var audioStreamStartSample = if (mode == MODE_MANUAL) 0 else -1
    var speechCandidateStartSample = -1
    var speechStartStreamSample = -1
    var speechEndStreamSample = -1
    var energyEvidenceFrames = 0
    var energyCandidateStartSample = -1
    var energyStartStreamSample = -1
    var energyEndStreamSample = -1
    val silenceAfterSpeechMs =
      if (isReminderCall) {
        CALL_COMMAND_SILENCE_AFTER_SPEECH_MS
      } else {
        MAIN_SILENCE_AFTER_SPEECH_MS
      }
    val silenceFramesRequired =
      (silenceAfterSpeechMs * SAMPLE_RATE) / (1000 * FRAME_SIZE)
    val speechEvidenceFramesRequired =
      if (isReminderCall) CALL_SPEECH_EVIDENCE_FRAMES else MIN_SPEECH_EVIDENCE_FRAMES
    val allowEnergyFallback = mode == MODE_AUTOMATIC && (!bargeIn || isReminderCall)

    fun appendAudio(samples: FloatArray, sampleCount: Int) {
      val writable = minOf(sampleCount, audio.size - audioSize)
      if (writable <= 0) return
      samples.copyInto(audio, audioSize, 0, writable)
      audioSize += writable
    }

    fun appendPreRoll(samples: FloatArray, sampleCount: Int) {
      for (index in 0 until sampleCount) {
        preRoll[preRollWriteIndex] = samples[index]
        preRollWriteIndex = (preRollWriteIndex + 1) % preRoll.size
        if (preRollSize < preRoll.size) preRollSize += 1
      }
    }

    fun flushPreRoll() {
      val oldestIndex = if (preRollSize == preRoll.size) preRollWriteIndex else 0
      for (offset in 0 until preRollSize) {
        if (audioSize >= audio.size) break
        audio[audioSize] = preRoll[(oldestIndex + offset) % preRoll.size]
        audioSize += 1
      }
      preRollSize = 0
    }

    activeRecorder = recorder
    recorder.startRecording()
    try {
      while (!stopRequested.get() && audioSize < audio.size) {
        val read = try {
          recorder.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING)
        } catch (error: IllegalStateException) {
          if (stopRequested.get()) break
          throw error
        }
        if (read <= 0) {
          if (stopRequested.get()) break
          continue
        }
        val streamFrameStart = totalStreamSamples
        val streamFrameEnd = streamFrameStart + read
        totalStreamSamples = streamFrameEnd
        val normalized = FloatArray(FRAME_SIZE)
        var squaredSum = 0.0
        var framePeak = 0f
        for (index in 0 until read) {
          val sample = frame[index] / 32768f
          normalized[index] = sample
          squaredSum += sample * sample
          framePeak = max(framePeak, abs(sample))
        }
        val rms = sqrt(squaredSum / read).toFloat()
        peakAmplitude = max(peakAmplitude, framePeak)
        if (!speechDetected) {
          samplesWaitingForSpeech += read
          if (mode == MODE_MANUAL) {
            appendAudio(normalized, read)
          } else {
            appendPreRoll(normalized, read)
          }
        }

        val speechProbability = vad.probability(normalized)
        maxVadProbability = max(maxVadProbability, speechProbability)
        if (speechProbability < VAD_NOISE_UPDATE_THRESHOLD) {
          val boundedRms = minOf(rms, MAX_NOISE_FLOOR_RMS)
          noiseFloorRms =
            NOISE_FLOOR_HISTORY * noiseFloorRms +
            (1f - NOISE_FLOOR_HISTORY) * boundedRms
        }

        val energyThreshold = max(MIN_SPEECH_RMS, noiseFloorRms * ENERGY_NOISE_MULTIPLIER)
        val boundaryEnergyLooksLikeSpeech =
          (!bargeIn || isReminderCall) &&
            speechProbability >= VAD_ENERGY_ASSIST_START_MIN_PROB &&
            rms >= energyThreshold &&
            framePeak >= MIN_SPEECH_PEAK
        if (boundaryEnergyLooksLikeSpeech) {
          if (energyEvidenceFrames == 0) energyCandidateStartSample = streamFrameStart
          energyEvidenceFrames += 1
          if (energyEvidenceFrames >= speechEvidenceFramesRequired) {
            if (energyStartStreamSample < 0) {
              energyStartStreamSample = energyCandidateStartSample
            }
            energyEndStreamSample = streamFrameEnd
          }
        } else {
          energyEvidenceFrames = 0
          energyCandidateStartSample = -1
        }
        val energyLooksLikeSpeech = allowEnergyFallback && boundaryEnergyLooksLikeSpeech
        val hasSpeechEvidence =
          speechProbability >= VAD_START_THRESHOLD || energyLooksLikeSpeech
        var startedThisFrame = false
        if (!speechDetected) {
          if (hasSpeechEvidence) {
            if (speechEvidenceFrames == 0) speechCandidateStartSample = streamFrameStart
            speechEvidenceFrames += 1
          } else {
            speechEvidenceFrames = max(0, speechEvidenceFrames - 1)
            if (speechEvidenceFrames == 0) speechCandidateStartSample = -1
          }
          if (speechEvidenceFrames >= speechEvidenceFramesRequired) {
            speechDetected = true
            startedThisFrame = true
            speechStartStreamSample =
              speechCandidateStartSample.takeIf { it >= 0 } ?: streamFrameStart
            speechEndStreamSample = streamFrameEnd
            if (mode != MODE_MANUAL) {
              audioStreamStartSample = streamFrameEnd - preRollSize
              flushPreRoll()
            }
            sendEvent("onSpeechStarted", Arguments.createMap().apply {
              putString("captureId", captureId)
            })
          }
        } else {
          val energyContinues =
            speechProbability >= VAD_ENERGY_ASSIST_CONTINUE_MIN_PROB &&
            rms >= max(MIN_CONTINUING_SPEECH_RMS, noiseFloorRms * CONTINUING_ENERGY_MULTIPLIER)
          val voiceContinues =
            speechProbability >= VAD_END_THRESHOLD || energyContinues
          if (voiceContinues) {
            silenceFramesAfterSpeech = 0
            speechEndStreamSample = streamFrameEnd
          } else {
            silenceFramesAfterSpeech += 1
          }
        }

        if (speechDetected && !startedThisFrame) {
          appendAudio(normalized, read)
        }
        if (!speechDetected && samplesWaitingForSpeech >= maximumWaitSamples) break
        if (speechDetected && audioSize >= PRE_ROLL_SAMPLES + maximumSpeechSamples) break
        if (
          mode == MODE_AUTOMATIC &&
          speechDetected &&
          silenceFramesAfterSpeech >= silenceFramesRequired
        ) {
          break
        }
      }
    } finally {
      try {
        recorder.stop()
      } catch (_: Exception) {
      }
      recorder.release()
      echoCanceler?.release()
      noiseSuppressor?.release()
      automaticGainControl?.release()
    }
    val manualSpeechFallback =
      mode == MODE_MANUAL &&
      audioSize >= MIN_MANUAL_CAPTURE_SAMPLES &&
      peakAmplitude >= MIN_MANUAL_CAPTURE_PEAK
    val finalSpeechDetected = speechDetected || manualSpeechFallback
    val streamOrigin = audioStreamStartSample.coerceAtLeast(0)
    val selectedSpeechStart = when {
      speechStartStreamSample >= 0 -> speechStartStreamSample
      manualSpeechFallback && energyStartStreamSample >= 0 -> energyStartStreamSample
      else -> streamOrigin
    }
    val selectedSpeechEnd = when {
      speechEndStreamSample > selectedSpeechStart -> speechEndStreamSample
      manualSpeechFallback && energyEndStreamSample > selectedSpeechStart -> energyEndStreamSample
      else -> streamOrigin + audioSize
    }
    val speechStartSample =
      (selectedSpeechStart - streamOrigin).coerceIn(0, audioSize)
    val speechEndSample =
      (selectedSpeechEnd - streamOrigin).coerceIn(speechStartSample, audioSize)
    return CapturedAudio(
      samples = audio.copyOf(audioSize),
      speechDetected = finalSpeechDetected,
      audioDurationMs = audioSize * 1000L / SAMPLE_RATE,
      maxVadProbability = maxVadProbability,
      peakAmplitude = peakAmplitude,
      speechStartSample = speechStartSample,
      speechEndSample = speechEndSample
    )
  }

  internal fun prepareForWhisper(samples: FloatArray): FloatArray =
    prepareSamplesForWhisper(samples)

  private fun resultMap(
    captureId: String,
    transcript: String,
    speechDetected: Boolean,
    cancelled: Boolean,
    captureDurationMs: Long,
    inferenceDurationMs: Long
  ): WritableMap = Arguments.createMap().apply {
    putString("captureId", captureId)
    putString("transcript", transcript)
    putBoolean("speechDetected", speechDetected)
    putBoolean("cancelled", cancelled)
    putDouble("captureDurationMs", captureDurationMs.toDouble())
    putDouble("inferenceDurationMs", inferenceDurationMs.toDouble())
  }

  @ReactMethod
  fun stopListening(captureId: String, promise: Promise) {
    if (activeCaptureId.get() != captureId) {
      promise.resolve(false)
      return
    }
    stopRequested.set(true)
    try {
      activeRecorder?.stop()
    } catch (_: Exception) {
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun cancelListening(captureId: String, promise: Promise) {
    if (activeCaptureId.get() != captureId) {
      promise.resolve(false)
      return
    }
    discardRequested.set(true)
    stopRequested.set(true)
    try {
      activeRecorder?.stop()
    } catch (_: Exception) {
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun release(promise: Promise) {
    cancelInactivityUnload()
    discardRequested.set(true)
    stopRequested.set(true)
    try {
      activeRecorder?.stop()
    } catch (_: Exception) {
    }
    unloadModelsInternal()
    promise.resolve(true)
  }

  override fun invalidate() {
    cancelInactivityUnload()
    discardRequested.set(true)
    stopRequested.set(true)
    try {
      activeRecorder?.stop()
    } catch (_: Exception) {
    }
    unloadModelsInternal()
    executor.shutdownNow()
    super.invalidate()
  }

  companion object {
    private const val TAG = "LafinaSpeechToText"
    private const val INACTIVITY_UNLOAD_TIMEOUT_MS = 60_000L
    private const val SAMPLE_RATE = 16_000
    private const val FRAME_SIZE = 512
    private const val MAIN_WAIT_FOR_SPEECH_SECONDS = 12
    private const val REMINDER_WAIT_FOR_SPEECH_SECONDS = 20
    private const val MAX_UTTERANCE_SECONDS = 15
    private const val CALL_COMMAND_LIMIT_SECONDS = 4
    private const val MANUAL_CAPTURE_LIMIT_SECONDS = 30
    private const val MAIN_SILENCE_AFTER_SPEECH_MS = 1_350
    private const val CALL_COMMAND_SILENCE_AFTER_SPEECH_MS = 650
    private const val PRE_ROLL_SAMPLES = 5_760
    private const val VAD_START_THRESHOLD = 0.35f
    private const val VAD_END_THRESHOLD = 0.20f
    private const val VAD_NOISE_UPDATE_THRESHOLD = 0.15f
    private const val VAD_ENERGY_ASSIST_START_MIN_PROB = 0.12f
    private const val VAD_ENERGY_ASSIST_CONTINUE_MIN_PROB = 0.08f
    private const val MIN_SPEECH_EVIDENCE_FRAMES = 3
    private const val CALL_SPEECH_EVIDENCE_FRAMES = 2
    private const val INITIAL_NOISE_FLOOR_RMS = 0.003f
    private const val MAX_NOISE_FLOOR_RMS = 0.06f
    private const val NOISE_FLOOR_HISTORY = 0.95f
    private const val ENERGY_NOISE_MULTIPLIER = 2.8f
    private const val CONTINUING_ENERGY_MULTIPLIER = 1.6f
    private const val MIN_SPEECH_RMS = 0.008f
    private const val MIN_CONTINUING_SPEECH_RMS = 0.004f
    private const val MIN_SPEECH_PEAK = 0.025f
    private const val MIN_MANUAL_CAPTURE_PEAK = 0.01f
    private const val MIN_MANUAL_CAPTURE_SAMPLES = SAMPLE_RATE / 4
    private const val TARGET_WHISPER_RMS = 0.10f
    private const val MAX_WHISPER_INPUT_GAIN = 6f
    private const val HIGH_PASS_ALPHA = 0.9695f
    private const val SOFT_CLIP_THRESHOLD = 0.85f
    private const val WHISPER_MIN_SAMPLES = SAMPLE_RATE
    private const val WHISPER_SPEECH_MARGIN_MS = 360
    private const val WHISPER_SPEECH_MARGIN_SAMPLES =
      SAMPLE_RATE * WHISPER_SPEECH_MARGIN_MS / 1_000
    private const val MODE_AUTOMATIC = "automatic"
    private const val MODE_MANUAL = "manual"
    private const val CONTEXT_MAIN_MIC = "main_mic"
    private const val CONTEXT_REMINDER_CALL = "reminder_call"
    private const val WHISPER_MODEL_ASSET = LafinaWhisperBridge.MODEL_ASSET

    internal fun softLimitSample(value: Float): Float {
      val absVal = abs(value)
      if (absVal <= SOFT_CLIP_THRESHOLD) return value
      val sign = if (value >= 0f) 1f else -1f
      val excess = absVal - SOFT_CLIP_THRESHOLD
      val headroom = 1f - SOFT_CLIP_THRESHOLD
      val compressed = SOFT_CLIP_THRESHOLD + headroom * (excess / (excess + headroom))
      return (sign * compressed).coerceIn(-1f, 1f)
    }

    internal fun prepareSamplesForWhisper(samples: FloatArray): FloatArray {
      val outputSize = max(samples.size, WHISPER_MIN_SAMPLES)
      val output = FloatArray(outputSize)
      if (samples.isEmpty()) return output

      // 80 Hz first-order high-pass filter removes DC offset and low-frequency fan/AC/mic rumble
      // while preserving fundamental voice frequencies and accented formants (85 Hz - 8000 Hz).
      var prevInput = samples[0]
      var prevOutput = 0f
      var squaredSum = 0.0
      for (index in samples.indices) {
        val input = samples[index]
        val filtered = HIGH_PASS_ALPHA * (prevOutput + input - prevInput)
        prevInput = input
        prevOutput = filtered
        output[index] = filtered
        squaredSum += filtered.toDouble() * filtered.toDouble()
      }

      val rms = sqrt(squaredSum / samples.size).toFloat()
      val gain = if (rms > 0f && rms < TARGET_WHISPER_RMS) {
        (TARGET_WHISPER_RMS / rms).coerceAtMost(MAX_WHISPER_INPUT_GAIN)
      } else {
        1f
      }

      for (index in samples.indices) {
        output[index] = softLimitSample(output[index] * gain)
      }
      return output
    }
  }
}
