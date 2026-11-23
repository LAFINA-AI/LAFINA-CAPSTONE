package com.lafina.capstone

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.os.Bundle
import android.os.Process
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.PI
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Instrumentation benchmark measuring on-device SLM load time and Time-To-First-Token
 * (L_tft, maxTokens=1) across LAFINA's golden academic scheduling utterances.
 */
@RunWith(AndroidJUnit4::class)
class SlmTftBenchmarkTest {
  companion object {
    private const val TAG = "SlmTftBenchmark"
  }

  private val context: Context
    get() = InstrumentationRegistry.getInstrumentation().targetContext

  private val goldenUtterances = listOf(
    "Remind me to submit my lab report tomorrow at 9 AM.",
    "Add a task to study operating systems tonight at 8 PM.",
    "Create a reminder for software engineering exam this Friday at 2 PM.",
    "Remind me every Monday at 8 AM for my morning class.",
    "Schedule a study block from 2 PM to 4 PM today for thesis writing.",
    "Take a note review chapters 4 and 5 for the quiz.",
    "What is on my schedule for today?",
    "Remind me in ten minutes to take a short break.",
    "Snooze for five minutes.",
    "OK got it thanks.",
    "Add a task to finish the database project by Friday.",
    "Remind me tomorrow morning at 7 AM to pack my lab coat.",
    "Create a time block for math homework from 6 PM to 7 PM.",
    "Show my schedule for tomorrow.",
    "Save a note-bring calculator for Physics exam.",
    "Remind me to email the professor at 3pm.",
    "Add a task prepare presentation slides for capstone defense.",
    "Remind me every weekday at 7.30 AM to check announcements.",
    "Take a note check the USTP Handbook Grading Policy.",
    "Snooze for ten minutes."
  )

  @Test
  fun benchmarkSlmTft() {
    val args = InstrumentationRegistry.getArguments()
    val modelFileArg = args.getString("modelFile") ?: "models/gemma-3-270m-it-Q4_K_M.gguf"
    val modelName = args.getString("modelName") ?: modelFileArg
    val promptFormat = args.getString("promptFormat")
      ?: LafinaIntentExtractorModule.resolvePromptFormat(null, modelFileArg)
    val utteranceCount = (args.getString("utteranceCount")?.toIntOrNull() ?: 20).coerceAtLeast(1)
    val outFileName = args.getString("outFile") ?: "slm_tft_result.json"

    val modelFile = File(context.filesDir, modelFileArg)
    assertTrue("Model file missing: ${modelFile.absolutePath}", modelFile.exists() && modelFile.length() > 10_000_000L)
    assertTrue("LafinaLlamaBridge native library must be loaded", LafinaLlamaBridge.isLoaded())

    val nThreads = maxOf(2, minOf(4, Runtime.getRuntime().availableProcessors() - 1))
    val loadStart = System.nanoTime()
    val ptr = LafinaLlamaBridge.initModel(modelFile.absolutePath, nThreads)
    val loadMs = (System.nanoTime() - loadStart) / 1_000_000.0
    assertTrue("Failed to load GGUF model: ${modelFile.absolutePath}", ptr != 0L)

    val tftSamples = mutableListOf<Double>()
    val rows = JSONArray()

    try {
      // Warmup 1 pass before timed utterances
      LafinaLlamaBridge.generate(
        ptr,
        LafinaIntentExtractorModule.buildNluPrompt(goldenUtterances[0], promptFormat),
        1
      )

      for (i in 0 until utteranceCount) {
        val text = goldenUtterances[i % goldenUtterances.size]
        val prompt = LafinaIntentExtractorModule.buildNluPrompt(text, promptFormat)
        val t0 = System.nanoTime()
        LafinaLlamaBridge.generate(ptr, prompt, 1)
        val tftMs = (System.nanoTime() - t0) / 1_000_000.0
        tftSamples.add(tftMs)
        rows.put(JSONObject().apply {
          put("i", i)
          put("utterance", text)
          put("tftMs", tftMs)
        })
      }
    } finally {
      LafinaLlamaBridge.freeModel(ptr)
    }

    val mean = tftSamples.average()
    val variance = tftSamples.sumOf { (it - mean) * (it - mean) } / tftSamples.size
    val sd = sqrt(variance)

    val out = JSONObject().apply {
      put("modelName", modelName)
      put("modelFile", modelFileArg)
      put("modelBytes", modelFile.length())
      put("promptFormat", promptFormat)
      put("nThreads", nThreads)
      put("loadMs", loadMs)
      put("utterances", utteranceCount)
      put("l_tft_mean_ms", mean)
      put("l_tft_sd_ms", sd)
      put("samples", rows)
    }
    File(context.filesDir, outFileName).writeText(out.toString(2))
    Log.i(TAG, "SLM_TFT_SUMMARY [$modelName]: load=${"%.1f".format(loadMs)}ms tft=${"%.1f".format(mean)}±${"%.1f".format(sd)}ms (n=$utteranceCount)")
  }

  private fun parseWavTo16kMono(file: File): FloatArray {
    val bytes = file.readBytes()
    if (bytes.size < 44) return FloatArray(0)
    val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    var pos = 12
    var sampleRate = 16000
    var channels = 1
    var bitsPerSample = 16
    var dataOffset = -1
    var dataSize = 0
    while (pos + 8 <= bytes.size) {
      val chunkId = String(bytes, pos, 4, Charsets.US_ASCII)
      val chunkSize = buf.getInt(pos + 4)
      val bodyStart = pos + 8
      if (chunkId == "fmt " && bodyStart + 16 <= bytes.size) {
        channels = buf.getShort(bodyStart + 2).toInt() and 0xFFFF
        sampleRate = buf.getInt(bodyStart + 4)
        bitsPerSample = buf.getShort(bodyStart + 14).toInt() and 0xFFFF
      } else if (chunkId == "data") {
        dataOffset = bodyStart
        dataSize = minOf(chunkSize, bytes.size - bodyStart)
        break
      }
      val advance = 8 + chunkSize + (chunkSize and 1)
      if (advance <= 8) break
      pos += advance
    }
    if (dataOffset < 0 || dataSize <= 0 || bitsPerSample != 16 || channels < 1) return FloatArray(0)
    val totalFrames = dataSize / (2 * channels)
    val mono = FloatArray(totalFrames)
    var byteIdx = dataOffset
    for (i in 0 until totalFrames) {
      var sum = 0f
      for (ch in 0 until channels) {
        sum += buf.getShort(byteIdx).toFloat() / 32768.0f
        byteIdx += 2
      }
      mono[i] = sum / channels
    }
    if (sampleRate == 16000 || mono.isEmpty()) return mono
    val outLen = ((mono.size.toLong() * 16000L) / sampleRate).toInt().coerceAtLeast(1)
    return FloatArray(outLen) { i ->
      val srcPos = i.toDouble() * sampleRate / 16000.0
      val idx0 = srcPos.toInt().coerceIn(0, mono.size - 1)
      val idx1 = (idx0 + 1).coerceIn(0, mono.size - 1)
      val frac = (srcPos - idx0).toFloat()
      mono[idx0] * (1f - frac) + mono[idx1] * frac
    }
  }

  private fun fallbackSpeechSignal(durationSec: Double = 1.8): FloatArray {
    val n = (16000 * durationSec).toInt()
    return FloatArray(n) { i ->
      val t = i / 16000.0
      val env = if (t > 0.1 && t < durationSec - 0.1) 0.25f else 0.02f
      env * (0.55f * sin(2.0 * PI * 180.0 * t).toFloat() +
        0.30f * sin(2.0 * PI * 540.0 * t).toFloat() +
        0.15f * sin(2.0 * PI * 1250.0 * t).toFloat())
    }
  }

  private fun addDeterministicNoise(samples: FloatArray, seedOffset: Int): FloatArray {
    var state = (123456789 + seedOffset * 977).toLong()
    return FloatArray(samples.size) { i ->
      state = (state * 1664525L + 1013904223L) and 0xFFFFFFFFL
      val noise = ((state.toDouble() / 0xFFFFFFFFL.toDouble()) - 0.5) * 0.04
      (samples[i] + noise.toFloat()).coerceIn(-1f, 1f)
    }
  }

  private fun meanSd(values: List<Double>): Pair<Double, Double> {
    if (values.isEmpty()) return 0.0 to 0.0
    val mean = values.average()
    val variance = values.sumOf { (it - mean) * (it - mean) } / values.size
    return mean to sqrt(variance)
  }

  private class LocalVadRunner(ctx: Context) : AutoCloseable {
    private val environment = OrtEnvironment.getEnvironment()
    private val session: OrtSession
    private var state = FloatArray(SileroVadProcessor.STATE_SIZE)
    private var vadContext = FloatArray(SileroVadProcessor.CONTEXT_SIZE)
    private val inputWindow = FloatArray(SileroVadProcessor.INPUT_WINDOW_SIZE)

    init {
      val modelFile = File(ctx.cacheDir, "silero_vad_16k_op15.onnx")
      val assetPath = "models/silero_vad.onnx"
      val expectedSize = ctx.assets.openFd(assetPath).use { it.length }
      if (!modelFile.exists() || modelFile.length() != expectedSize) {
        ctx.assets.open(assetPath).use { input ->
          modelFile.outputStream().use { output -> input.copyTo(output) }
        }
      }
      val options = OrtSession.SessionOptions().apply { setIntraOpNumThreads(1) }
      session = environment.createSession(modelFile.absolutePath, options)
    }

    fun reset() {
      state.fill(0f)
      vadContext.fill(0f)
      inputWindow.fill(0f)
    }

    fun probability(frame: FloatArray): Float {
      val preparedInput = SileroVadProcessor.buildContextualInputWindow(vadContext, frame, inputWindow)
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
        LongBuffer.wrap(longArrayOf(SileroVadProcessor.SAMPLE_RATE.toLong())),
        longArrayOf()
      )
      try {
        session.run(
          mapOf("input" to inputTensor, "state" to stateTensor, "sr" to sampleRateTensor)
        ).use { result ->
          val probability = (result[0] as OnnxTensor).floatBuffer.get(0)
          val stateBuffer = (result[1] as OnnxTensor).floatBuffer
          stateBuffer.get(state, 0, minOf(state.size, stateBuffer.remaining()))
          SileroVadProcessor.updateRollingContext(vadContext, frame)
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
  }

  @Test
  fun benchmarkStt() {
    val args = InstrumentationRegistry.getArguments()
    val utteranceCount = (args.getString("utteranceCount")?.toIntOrNull() ?: 100).coerceAtLeast(1)
    val outFileName = args.getString("outFile") ?: "stt_result.json"

    val vad = LocalVadRunner(context)
    val whisperLoadStart = System.nanoTime()
    val whisperPtr = LafinaWhisperBridge.initContext(context.assets, LafinaWhisperBridge.MODEL_ASSET)
    val whisperLoadMs = (System.nanoTime() - whisperLoadStart) / 1_000_000.0
    assertTrue("Whisper context must initialize", whisperPtr != 0L)

    val initLatch = CountDownLatch(1)
    var ttsStatus = TextToSpeech.ERROR
    val doneLatchMap = ConcurrentHashMap<String, CountDownLatch>()
    val tts = TextToSpeech(context) { status ->
      ttsStatus = status
      initLatch.countDown()
    }
    val ttsReady = initLatch.await(12, TimeUnit.SECONDS) && ttsStatus == TextToSpeech.SUCCESS
    if (ttsReady) {
      tts.setLanguage(Locale.US)
      tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {}
        override fun onDone(utteranceId: String?) {
          if (utteranceId != null) doneLatchMap[utteranceId]?.countDown()
        }
        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) {
          if (utteranceId != null) doneLatchMap[utteranceId]?.countDown()
        }
      })
    }

    var realWavClips = 0
    val baseClips = goldenUtterances.mapIndexed { idx, phrase ->
      val wav = File(context.cacheDir, "stt_utt_$idx.wav")
      if (wav.exists()) wav.delete()
      var samples = FloatArray(0)
      if (ttsReady) {
        val id = "stt_synth_$idx"
        val latch = CountDownLatch(1)
        doneLatchMap[id] = latch
        if (tts.synthesizeToFile(phrase, Bundle(), wav, id) == TextToSpeech.SUCCESS) {
          latch.await(10, TimeUnit.SECONDS)
          if (wav.exists() && wav.length() > 100) samples = parseWavTo16kMono(wav)
        }
        doneLatchMap.remove(id)
      }
      if (samples.size >= 4000) {
        realWavClips++
        samples
      } else {
        fallbackSpeechSignal(1.8)
      }
    }

    Process.setThreadPriority(-2)
    val threads = maxOf(1, minOf(3, Runtime.getRuntime().availableProcessors() / 2))
    val vadList = mutableListOf<Double>()
    val whisperList = mutableListOf<Double>()
    val sttList = mutableListOf<Double>()
    val rows = JSONArray()
    var transcriptsNonEmpty = 0

    try {
      // Warmup 1 pass
      LafinaWhisperBridge.transcribe(
        whisperPtr,
        LafinaSpeechToTextModule.prepareSamplesForWhisper(baseClips[0]),
        threads,
        false
      )

      for (iter in 0 until utteranceCount) {
        val uIdx = iter % goldenUtterances.size
        val noisy = iter >= (utteranceCount / 2)
        val clip = if (noisy) addDeterministicNoise(baseClips[uIdx], iter) else baseClips[uIdx]

        val t0 = System.nanoTime()
        vad.reset()
        var frameStart = 0
        var maxVad = 0f
        while (frameStart + SileroVadProcessor.FRAME_SIZE <= clip.size) {
          val p = vad.probability(clip.copyOfRange(frameStart, frameStart + SileroVadProcessor.FRAME_SIZE))
          if (p > maxVad) maxVad = p
          frameStart += SileroVadProcessor.FRAME_SIZE
        }
        val tVad = System.nanoTime()
        val prepared = LafinaSpeechToTextModule.prepareSamplesForWhisper(clip)
        val transcript = LafinaWhisperBridge.transcribe(whisperPtr, prepared, threads, false).trim()
        val tEnd = System.nanoTime()

        if (transcript.isNotEmpty()) transcriptsNonEmpty++
        val vadMs = (tVad - t0) / 1_000_000.0
        val whisperMs = (tEnd - tVad) / 1_000_000.0
        val sttMs = (tEnd - t0) / 1_000_000.0
        vadList.add(vadMs)
        whisperList.add(whisperMs)
        sttList.add(sttMs)

        rows.put(JSONObject().apply {
          put("i", iter)
          put("noisy", noisy)
          put("maxVad", maxVad.toDouble())
          put("samples", clip.size)
          put("transcript", transcript)
          put("vadMs", vadMs)
          put("whisperMs", whisperMs)
          put("sttMs", sttMs)
        })
      }
    } finally {
      vad.close()
      LafinaWhisperBridge.freeContext(whisperPtr)
      if (ttsReady) {
        tts.stop()
        tts.shutdown()
      }
      for (idx in goldenUtterances.indices) {
        File(context.cacheDir, "stt_utt_$idx.wav").delete()
      }
    }

    val (vadMean, vadSd) = meanSd(vadList)
    val (whisperMean, whisperSd) = meanSd(whisperList)
    val (sttMean, sttSd) = meanSd(sttList)

    val out = JSONObject().apply {
      put("modelAsset", LafinaWhisperBridge.MODEL_ASSET)
      put("threads", threads)
      put("whisperLoadMs", whisperLoadMs)
      put("ttsReady", ttsReady)
      put("realWavClips", realWavClips)
      put("utterances", utteranceCount)
      put("transcriptsNonEmpty", transcriptsNonEmpty)
      put("l_vad_mean_ms", vadMean)
      put("l_vad_sd_ms", vadSd)
      put("l_whisper_mean_ms", whisperMean)
      put("l_whisper_sd_ms", whisperSd)
      put("l_stt_mean_ms", sttMean)
      put("l_stt_sd_ms", sttSd)
      put("samples", rows)
    }
    File(context.filesDir, outFileName).writeText(out.toString(2))
    Log.i(TAG, "STT_SUMMARY: stt=${"%.1f".format(sttMean)}±${"%.1f".format(sttSd)}ms (vad=${"%.1f".format(vadMean)}ms + whisper=${"%.1f".format(whisperMean)}ms, n=$utteranceCount)")
  }

  /**
   * Benchmarks online DeepSeek streaming TTFT (L_tft) and total response time over HTTPS
   * using LAFINA-backend (/v1/ai/chat/stream) or direct DeepSeek Chat Completions SSE.
   */
  @Test
  fun benchmarkDeepseekOnline() {
    val args = InstrumentationRegistry.getArguments()
    val endpointUrl = args.getString("endpointUrl") ?: "https://api.deepseek.com/chat/completions"
    val modelName = args.getString("modelName") ?: "Deepseek-V4"
    val apiModel = args.getString("apiModel") ?: "deepseek-chat"
    val authToken = args.getString("authToken")?.trim().orEmpty()
    val mode = args.getString("mode") ?: if (endpointUrl.contains("/v1/ai/chat")) "backend" else "direct"
    val utteranceCount = (args.getString("utteranceCount")?.toIntOrNull() ?: 20).coerceAtLeast(1)
    val outFileName = args.getString("outFile") ?: "deepseek_tft.json"
    assertTrue("authToken instrumentation arg is required", authToken.isNotEmpty())

    fun sendStreaming(utterance: String): Triple<Double, Double, Int> {
      val payload = if (mode == "backend") {
        JSONObject().apply {
          put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", utterance)))
          put("useHandbook", false)
        }
      } else {
        JSONObject().apply {
          put("model", apiModel)
          put("stream", true)
          put("max_tokens", 128)
          put("messages", JSONArray().apply {
            put(JSONObject().put("role", "system").put("content", "You are LAFINA's academic NLU extractor. Return valid JSON only."))
            put(JSONObject().put("role", "user").put("content", utterance))
          })
        }
      }
      val t0 = System.nanoTime()
      var firstContentNs = 0L
      val conn = (URL(endpointUrl).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 15_000
        readTimeout = 65_000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Accept", "text/event-stream")
        setRequestProperty("Authorization", "Bearer $authToken")
      }
      try {
        conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        val status = conn.responseCode
        val stream = if (status in 200..299) conn.inputStream else conn.errorStream
        if (status !in 200..299) {
          val err = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: "HTTP $status"
          throw IllegalStateException("HTTP $status: ${err.take(200)}")
        }
        BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { reader ->
          while (true) {
            val line = reader.readLine() ?: break
            if (!line.startsWith("data:")) continue
            val data = line.removePrefix("data:").trim()
            if (data.isEmpty() || data == "[DONE]") continue
            try {
              val obj = JSONObject(data)
              val hasText = if (mode == "backend") {
                obj.optString("type") == "delta" && obj.optString("text").isNotEmpty()
              } else {
                val delta = obj.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("delta")
                !delta?.optString("content").isNullOrEmpty()
              }
              if (hasText && firstContentNs == 0L) firstContentNs = System.nanoTime()
              if (mode == "backend" && obj.optString("type") == "done") break
            } catch (_: Exception) {
            }
          }
        }
        val endNs = System.nanoTime()
        if (firstContentNs == 0L) firstContentNs = endNs
        return Triple((firstContentNs - t0) / 1_000_000.0, (endNs - t0) / 1_000_000.0, status)
      } finally {
        conn.disconnect()
      }
    }

    // Warmup 1 pass (excluded from stats)
    sendStreaming(goldenUtterances[0])

    val tftSamples = mutableListOf<Double>()
    val fullSamples = mutableListOf<Double>()
    val rows = JSONArray()
    for (i in 0 until utteranceCount) {
      val text = goldenUtterances[i % goldenUtterances.size]
      val (tftMs, fullMs, httpStatus) = sendStreaming(text)
      tftSamples.add(tftMs)
      fullSamples.add(fullMs)
      rows.put(JSONObject().apply {
        put("i", i)
        put("utterance", text)
        put("httpStatus", httpStatus)
        put("tftMs", tftMs)
        put("fullMs", fullMs)
      })
    }

    val (tftMean, tftSd) = meanSd(tftSamples)
    val (fullMean, fullSd) = meanSd(fullSamples)
    val out = JSONObject().apply {
      put("modelName", modelName)
      put("mode", mode)
      put("endpointHost", URL(endpointUrl).host)
      put("apiModel", if (mode == "backend") "lafina-backend" else apiModel)
      put("utterances", utteranceCount)
      put("l_tft_mean_ms", tftMean)
      put("l_tft_sd_ms", tftSd)
      put("l_full_mean_ms", fullMean)
      put("l_full_sd_ms", fullSd)
      put("samples", rows)
    }
    File(context.filesDir, outFileName).writeText(out.toString(2))
    Log.i(TAG, "DEEPSEEK_ONLINE_SUMMARY [$modelName/$mode]: tft=${"%.1f".format(tftMean)}±${"%.1f".format(tftSd)}ms full=${"%.1f".format(fullMean)}ms (n=$utteranceCount)")
  }

  /**
   * Benchmarks online ElevenLabs Speech-to-Text (Scribe) latency over HTTPS multipart/form-data
   * using real Android TTS-synthesized WAV clips for LAFINA's golden utterances.
   */
  @Test
  fun benchmarkElevenlabsSttOnline() {
    val args = InstrumentationRegistry.getArguments()
    val endpointUrl = args.getString("endpointUrl") ?: "https://api.elevenlabs.io/v1/speech-to-text"
    val modelId = args.getString("modelId") ?: "scribe_v1"
    val authToken = args.getString("authToken")?.trim().orEmpty()
    val utteranceCount = (args.getString("utteranceCount")?.toIntOrNull() ?: 20).coerceAtLeast(1)
    val outFileName = args.getString("outFile") ?: "elevenlabs_stt.json"
    assertTrue("authToken instrumentation arg is required", authToken.isNotEmpty())

    val initLatch = CountDownLatch(1)
    var ttsStatus = TextToSpeech.ERROR
    val doneLatchMap = ConcurrentHashMap<String, CountDownLatch>()
    val tts = TextToSpeech(context) { status ->
      ttsStatus = status
      initLatch.countDown()
    }
    val ttsReady = initLatch.await(12, TimeUnit.SECONDS) && ttsStatus == TextToSpeech.SUCCESS
    if (ttsReady) {
      tts.setLanguage(Locale.US)
      tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {}
        override fun onDone(utteranceId: String?) {
          if (utteranceId != null) doneLatchMap[utteranceId]?.countDown()
        }
        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) {
          if (utteranceId != null) doneLatchMap[utteranceId]?.countDown()
        }
      })
    }

    var realWavClips = 0
    val clipFiles = goldenUtterances.mapIndexed { idx, phrase ->
      val wav = File(context.cacheDir, "el_stt_utt_$idx.wav")
      if (wav.exists()) wav.delete()
      var ok = false
      if (ttsReady) {
        val id = "el_stt_synth_$idx"
        val latch = CountDownLatch(1)
        doneLatchMap[id] = latch
        if (tts.synthesizeToFile(phrase, Bundle(), wav, id) == TextToSpeech.SUCCESS) {
          latch.await(10, TimeUnit.SECONDS)
          ok = wav.exists() && wav.length() > 1000
        }
        doneLatchMap.remove(id)
      }
      if (ok) {
        realWavClips++
      } else {
        writeFallbackPcmWav(wav, fallbackSpeechSignal(1.8), 16000)
      }
      wav
    }

    fun transcribeWav(wavFile: File): Triple<Double, Int, String> {
      val boundary = "----LafinaBoundary${System.nanoTime()}"
      val audioBytes = wavFile.readBytes()
      val header1 = (
        "--$boundary\r\n" +
          "Content-Disposition: form-data; name=\"model_id\"\r\n\r\n" +
          "$modelId\r\n" +
          "--$boundary\r\n" +
          "Content-Disposition: form-data; name=\"file\"; filename=\"${wavFile.name}\"\r\n" +
          "Content-Type: audio/wav\r\n\r\n"
        ).toByteArray(Charsets.UTF_8)
      val footer = "\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8)

      val t0 = System.nanoTime()
      val conn = (URL(endpointUrl).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 15_000
        readTimeout = 65_000
        doOutput = true
        setRequestProperty("xi-api-key", authToken)
        setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        setFixedLengthStreamingMode(header1.size + audioBytes.size + footer.size)
      }
      try {
        conn.outputStream.use { out ->
          out.write(header1)
          out.write(audioBytes)
          out.write(footer)
          out.flush()
        }
        val status = conn.responseCode
        val stream = if (status in 200..299) conn.inputStream else conn.errorStream
        val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        if (status !in 200..299) {
          throw IllegalStateException("HTTP $status: ${body.take(200)}")
        }
        val parsedText = JSONObject(body).optString("text", "").trim()
        val endNs = System.nanoTime()
        return Triple((endNs - t0) / 1_000_000.0, status, parsedText)
      } finally {
        conn.disconnect()
      }
    }

    val sttSamples = mutableListOf<Double>()
    val rows = JSONArray()
    var transcriptsNonEmpty = 0
    try {
      // Warmup 1 pass (excluded from stats)
      transcribeWav(clipFiles[0])

      for (i in 0 until utteranceCount) {
        val uIdx = i % goldenUtterances.size
        val clip = clipFiles[uIdx]
        val (sttMs, httpStatus, transcript) = transcribeWav(clip)
        if (transcript.isNotEmpty()) transcriptsNonEmpty++
        sttSamples.add(sttMs)
        rows.put(JSONObject().apply {
          put("i", i)
          put("utterance", goldenUtterances[uIdx])
          put("wavBytes", clip.length())
          put("httpStatus", httpStatus)
          put("transcript", transcript)
          put("sttMs", sttMs)
        })
      }
    } finally {
      if (ttsReady) {
        tts.stop()
        tts.shutdown()
      }
      clipFiles.forEach { it.delete() }
    }

    val (sttMean, sttSd) = meanSd(sttSamples)
    val out = JSONObject().apply {
      put("provider", "elevenlabs")
      put("endpointHost", URL(endpointUrl).host)
      put("modelId", modelId)
      put("ttsReady", ttsReady)
      put("realWavClips", realWavClips)
      put("utterances", utteranceCount)
      put("transcriptsNonEmpty", transcriptsNonEmpty)
      put("l_stt_mean_ms", sttMean)
      put("l_stt_sd_ms", sttSd)
      put("samples", rows)
    }
    File(context.filesDir, outFileName).writeText(out.toString(2))
    Log.i(TAG, "ELEVENLABS_STT_SUMMARY [$modelId]: stt=${"%.1f".format(sttMean)}±${"%.1f".format(sttSd)}ms nonEmpty=$transcriptsNonEmpty/$utteranceCount")
  }

  private fun writeFallbackPcmWav(file: File, samples: FloatArray, sampleRate: Int) {
    val dataBytes = samples.size * 2
    val buf = ByteBuffer.allocate(44 + dataBytes).order(ByteOrder.LITTLE_ENDIAN)
    buf.put("RIFF".toByteArray(Charsets.US_ASCII))
    buf.putInt(36 + dataBytes)
    buf.put("WAVEfmt ".toByteArray(Charsets.US_ASCII))
    buf.putInt(16)
    buf.putShort(1.toShort())
    buf.putShort(1.toShort())
    buf.putInt(sampleRate)
    buf.putInt(sampleRate * 2)
    buf.putShort(2.toShort())
    buf.putShort(16.toShort())
    buf.put("data".toByteArray(Charsets.US_ASCII))
    buf.putInt(dataBytes)
    for (s in samples) {
      val clamped = s.coerceIn(-1f, 1f)
      buf.putShort((clamped * 32767f).toInt().toShort())
    }
    file.writeBytes(buf.array())
  }
}
