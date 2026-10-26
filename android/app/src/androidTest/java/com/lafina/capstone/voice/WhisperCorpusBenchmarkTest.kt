package com.lafina.capstone.voice

import android.os.Build
import android.os.Debug
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import com.lafina.capstone.BuildConfig
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/** Opt-in synthetic PCM benchmark. No recording, app commands, network or human accent claim. */
class WhisperCorpusBenchmarkTest {
  @Test fun measurePinnedSyntheticCorpusWithoutOpeningMicrophone() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val args = InstrumentationRegistry.getArguments()
    assumeTrue("Explicit synthetic benchmark only", args.getString("runSttBenchmark") == "true")
    assertTrue("Use the explicitly reviewed model build", BuildConfig.WHISPER_MODEL_INCLUDED)
    val cohort = args.getString("cohort", "initial")!!
    require(cohort.matches(Regex("[a-zA-Z0-9_-]{1,40}")))
    val app = instrumentation.targetContext
    val output = File(app.noBackupFilesDir, "phase06-stt-benchmark-$cohort.json")
    check(!output.exists()) { "Preserve prior samples; choose a new cohort" }
    val assets = instrumentation.context.assets
    val manifest = assets.open("corpus-manifest.json").use { JSONObject(it.reader().readText()) }
    assertEquals("SYNTHETIC_WINDOWS_SAPI_AUDIO_NO_MICROPHONE", manifest.getString("kind"))
    val rows = manifest.getJSONArray("samples")
    assertEquals(6, rows.length())
    val resultRows = JSONArray()
    val cache = File(app.noBackupFilesDir, "offline-speech/tiny-q5_1-${WhisperTranscriber.MODEL_SHA256}.bin")
    val data = JSONObject().put("kind", "DIRECT_SYNTHETIC_PCM_EMULATOR_OR_DEVICE_NOT_MICROPHONE")
      .put("cohort", cohort).put("startedAtUtc", Instant.now().toString())
      .put("modelSha256", WhisperTranscriber.MODEL_SHA256).put("modelBytes", WhisperTranscriber.MODEL_BYTES)
      .put("appVersion", BuildConfig.VERSION_NAME).put("api", Build.VERSION.SDK_INT)
      .put("deviceModel", Build.MODEL).put("abis", JSONArray(Build.SUPPORTED_ABIS.toList()))
      .put("modelCachePresentBefore", cache.isFile).put("sampleRate", 16000)
      .put("voice", manifest.getJSONObject("voice")).put("samples", resultRows)
      .put("limits", JSONArray(listOf("No microphone/capture or Android recognizer accuracy measured.",
        "Each request loads/frees its decoder; warm disk/page caches may remain.",
        "Sampled process PSS is not absolute peak, whole UI pipeline memory or phone battery.",
        "Synthetic English SAPI voice is not Filipino-accented speech or a noise study.",
        "No scheduling command executes; hypotheses are synthetic benchmark output only.")))
    try {
      for (index in 0 until rows.length()) {
        val row = rows.getJSONObject(index)
        val id = row.getString("id")
        require(id.matches(Regex("[a-z]+")))
        val bytes = assets.open("$id.wav").use { it.readBytes() }
        assertEquals(row.getLong("bytes"), bytes.size.toLong())
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
        assertEquals(row.getString("sha256"), digest)
        val pcm = pcm16(bytes)
        val sample = JSONObject().put("id", id).put("reference", row.getString("reference"))
          .put("audioSha256", digest).put("audioSamples", pcm.size).put("audioDurationMs", pcm.size / 16.0)
        val done = AtomicBoolean(false)
        val maximum = AtomicLong(Debug.getPss())
        val pollCount = AtomicLong(0)
        val sampler = Thread({
          while (!done.get() && pollCount.get() < 200) {
            try { maximum.accumulateAndGet(Debug.getPss(), ::maxOf); pollCount.incrementAndGet(); Thread.sleep(200) }
            catch (_: InterruptedException) { break }
          }
        }, "synthetic-stt-pss").apply { isDaemon = true; start() }
        val started = SystemClock.elapsedRealtime()
        try {
          val hypothesis = WhisperTranscriber.transcribe(app, pcm, "en-US") { false }
          sample.put("hypothesis", hypothesis).put("outcome", if (hypothesis.isBlank()) "EMPTY" else "RESULT")
        } catch (error: Exception) {
          // Exceptions are fixed native codes; do not serialize arbitrary engine messages/audio.
          sample.put("hypothesis", "").put("outcome", "ERROR").put("errorClass", error.javaClass.simpleName)
        } finally {
          sample.put("totalPrepareLoadDecodeMs", SystemClock.elapsedRealtime() - started)
          done.set(true); sampler.interrupt(); sampler.join(1500)
          sample.put("sampledMaxPssKiB", maximum.get()).put("memoryPolls", pollCount.get()).put("memoryIntervalMs", 200)
          pcm.fill(0f); bytes.fill(0)
        }
        resultRows.put(sample)
        output.writeText(data.toString(2))
        instrumentation.sendStatus(0, android.os.Bundle().apply { putString("stream", "Synthetic fixture $id: ${sample.getString("outcome")}\n") })
      }
      data.put("finishedAtUtc", Instant.now().toString())
      output.writeText(data.toString(2))
      assertEquals(6, resultRows.length())
      assertEquals("A real model result is required, not a canned transcript", "RESULT", resultRows.getJSONObject(0).getString("outcome"))
    } finally { output.writeText(data.toString(2)) }
  }

  private fun pcm16(wav: ByteArray): FloatArray {
    require(wav.size in 44..500_000)
    fun tag(offset: Int) = String(wav, offset, 4, Charsets.US_ASCII)
    require(tag(0) == "RIFF" && tag(8) == "WAVE")
    val buffer = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN)
    var cursor = 12
    var formatVerified = false
    while (cursor + 8 <= wav.size) {
      val size = buffer.getInt(cursor + 4)
      require(size >= 0 && size <= wav.size - cursor - 8)
      if (tag(cursor) == "fmt ") {
        require(size >= 16 && buffer.getShort(cursor + 8).toInt() == 1 && buffer.getShort(cursor + 10).toInt() == 1)
        require(buffer.getInt(cursor + 12) == 16000 && buffer.getShort(cursor + 22).toInt() == 16)
        formatVerified = true
      }
      if (tag(cursor) == "data") {
        require(formatVerified && size % 2 == 0 && size / 2 in 1600..240_000)
        return FloatArray(size / 2) { buffer.getShort(cursor + 8 + it * 2).toFloat() / 32768f }
      }
      cursor += 8 + size + size % 2
    }
    error("No verified synthetic PCM data")
  }
}
