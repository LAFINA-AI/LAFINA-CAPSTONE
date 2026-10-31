package com.lafina.capstone.voice

import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import com.lafina.capstone.BuildConfig
import com.lafina.capstone.reminders.ReminderAction
import com.lafina.capstone.reminders.ReminderResponsePolicy
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Direct real decoder diagnostic. Only checksum-pinned synthetic inputs; never user audio. */
class Phase08ResponseDecoderProbeTest {
  @Test fun decodeOnlyPinnedSyntheticResponseFiles() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    assumeTrue("Explicit synthetic decoder probe required",
      InstrumentationRegistry.getArguments().getString("runPhase08ResponseDecoderProbe") == "true")
    assertTrue("Explicit model-included build required", BuildConfig.WHISPER_MODEL_INCLUDED)
    assertTrue("Run real decoder on the instrumentation worker", Looper.myLooper() != Looper.getMainLooper())
    val args = InstrumentationRegistry.getArguments()
    val diagnostics = args.getString("emitPinnedSyntheticHypotheses") == "true"
    val vocabulary = if (args.getString("responseVocabulary") == "true")
      WhisperVocabulary.REMINDER_RESPONSE else WhisperVocabulary.GENERAL
    val paddingMs = args.getString("syntheticPaddingMs")?.toInt() ?: 0
    val noiseFloorPcm = args.getString("syntheticNoiseFloorPcm")?.toInt() ?: 0
    require(noiseFloorPcm in setOf(0, 8)) { "MEASURED_SYNTHETIC_FLOOR_ONLY" }
    require(paddingMs in setOf(0, 250, 500, 1000)) { "BOUNDED_SYNTHETIC_PADDING_REQUIRED" }
    val app = instrumentation.targetContext
    val directory = File(app.noBackupFilesDir, "qa08-response-corpus").canonicalFile
    val samples = listOf(
      Fixture("acknowledge", "acknowledge this reminder", 72206,
        "e10b92f68d6a188bc19b44bd327aa91747d58d4a257510d786a14dc45a4e0a3c"),
      Fixture("snooze", "snooze for ten minutes", 74286,
        "fd762146a51062b7d5deef1cda58b2607d8b3aa4694bde4c76d9820701e5f42a"),
    )
    val rows = JSONArray()
    val result = JSONObject().put("kind", "PHASE08_DIRECT_PINNED_RESPONSE_DECODER_NOT_MICROPHONE")
      .put("status", "INCOMPLETE").put("api", Build.VERSION.SDK_INT).put("deviceModel", Build.MODEL)
      .put("appVersion", BuildConfig.VERSION_NAME).put("samples", rows)
      .put("modelSha256", WhisperTranscriber.MODEL_SHA256)
      .put("normalization", "ASCII lowercase; replace non-alphanumeric/non-space with spaces; collapse whitespace")
      .put("microphoneOpened", false).put("actionsExecuted", false).put("rawTranscriptEmitted", diagnostics)
      .put("syntheticPaddingEachSideMs", paddingMs)
      .put("syntheticNoiseFloorPcm", noiseFloorPcm)
      .put("vocabulary", vocabulary.name)
      .put("limits", "Two fixed synthetic Zira clips; direct decoder only. No capture/transport, human speech, audibility, physical-phone or model-change claim.")
    try {
      for (fixture in samples) {
        val row = JSONObject().put("id", fixture.id).put("outcome", "ERROR")
        rows.put(row)
        val began = SystemClock.elapsedRealtime()
        var pcm: FloatArray? = null
        try {
          val file = File(directory, "${fixture.id}.wav").canonicalFile
          require(file.parentFile == directory && file.isFile && file.length() == fixture.bytes.toLong()) {
            "EXACT_OWNED_SYNTHETIC_FILE_REQUIRED"
          }
          val bytes = file.readBytes()
          require(sha256(bytes) == fixture.sha256) { "PINNED_SYNTHETIC_CHECKSUM_REQUIRED" }
          val source = pcm16(bytes)
          val sourceFrames = source.size
          val paddingFrames = paddingMs * 16
          pcm = if (paddingFrames == 0) source else FloatArray(source.size + 2 * paddingFrames).also {
            source.copyInto(it, paddingFrames)
            source.fill(0f)
          }
          if (noiseFloorPcm != 0) {
            for (index in pcm.indices) if (pcm[index] == 0f) {
              pcm[index] = (if (index % 2 == 0) noiseFloorPcm else -noiseFloorPcm) / 32768f
            }
          }
          val transcript = WhisperTranscriber.transcribe(app, pcm, "en-US", vocabulary) { false }
          val normalized = normalize(transcript)
          val command = ReminderResponsePolicy.parse(transcript)
          val parsedExpected = if (fixture.id == "acknowledge") command?.action == ReminderAction.ACK
            else command?.action == ReminderAction.SNOOZE && command.minutes == 10
          row.put("outcome", "RESULT").put("normalizedExactRef", normalized == fixture.reference)
            .put("normalizedExpectedResponse", normalized == fixture.reference ||
              (fixture.id == "snooze" && normalized == "snooze for 10 minutes"))
            .put("normalizedSha256", sha256(normalized.toByteArray(Charsets.UTF_8)))
            .put("charCount", transcript.length).put("normalizedIsAcknowledged", normalized == "acknowledged")
            .put("normalizedIsAcknowledge", normalized == "acknowledge")
            .put("commandParsedExpected", parsedExpected).put("audioDurationMs", sourceFrames / 16.0)
          // Explicit opt-in diagnostics are restricted to the two verified synthetic inputs above.
          // Root saves this invocation privately; ordinary probes continue to emit hashes only.
          if (diagnostics) row.put("pinnedSyntheticHypothesis", transcript)
        } catch (failure: Exception) {
          row.put("outcome", "ERROR").put("errorType", failure.javaClass.simpleName)
        } finally {
          pcm?.fill(0f)
          row.put("totalPrepareLoadDecodeMs", SystemClock.elapsedRealtime() - began)
        }
      }
      assertEquals("Two pinned files must be evaluated", 2, rows.length())
      val decoded = (0 until rows.length()).all { rows.getJSONObject(it).optString("outcome") == "RESULT" }
      val exact = decoded && (0 until rows.length()).all { rows.getJSONObject(it).optBoolean("normalizedExactRef") }
      val expected = decoded && (0 until rows.length()).all {
        rows.getJSONObject(it).optBoolean("normalizedExpectedResponse") && rows.getJSONObject(it).optBoolean("commandParsedExpected")
      }
      result.put("status", if (!decoded) "DECODER_ERROR" else if (exact) "EXACT_SYNTHETIC_REFERENCES"
        else if (expected) "EXPECTED_SYNTHETIC_RESPONSES" else "SYNTHETIC_REFERENCE_MISMATCH")
        .put("allDecoded", decoded).put("allNormalizedReferencesExact", exact)
        .put("allExpectedResponsesMatched", expected)
      // Decoder operation is a gate; phrase quality is an explicit JSON outcome, never a fake exact-match pass.
      assertTrue("Both real decoder calls must produce results; inspect JSON phrase outcomes separately", decoded)
      if (args.getString("requireSyntheticResponseExact") == "true") {
        assertTrue("Pinned ACK and ten-minute snooze must match (spoken ten or numeric 10) and parse independently", expected)
      }
    } finally {
      instrumentation.sendStatus(0, Bundle().apply { putString("phase08_response_decoder_probe", result.toString()) })
    }
  }

  @Test fun reminderVocabularyDoesNotTurnUnsupportedSpeechIntoCommands() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    assumeTrue("Explicit real decoder controls required",
      InstrumentationRegistry.getArguments().getString("runPhase08ResponseDecoderProbe") == "true")
    assertTrue(BuildConfig.WHISPER_MODEL_INCLUDED)
    val app = instrumentation.targetContext
    val assets = instrumentation.context.assets
    val manifest = assets.open("corpus-manifest.json").use { JSONObject(it.reader().readText()) }
    assertEquals("SYNTHETIC_WINDOWS_SAPI_AUDIO_NO_MICROPHONE", manifest.getString("kind"))
    val fixtures = manifest.getJSONArray("samples")
    val rows = JSONArray()
    val result = JSONObject().put("kind", "PHASE08_HINTED_DECODER_UNSUPPORTED_SPEECH_CONTROLS")
      .put("vocabulary", WhisperVocabulary.REMINDER_RESPONSE.name).put("samples", rows)
      .put("modelSha256", WhisperTranscriber.MODEL_SHA256).put("microphoneOpened", false)
      .put("actionsExecuted", false).put("rawTranscriptEmitted", false)
      .put("physicalDeviceValidation", "NOT_RUN").put("status", "INCOMPLETE")
    fun evaluate(id: String, pcm: FloatArray, reference: String?) {
      val began = SystemClock.elapsedRealtime()
      try {
        val transcript = WhisperTranscriber.transcribe(app, pcm, "en-US", WhisperVocabulary.REMINDER_RESPONSE) { false }
        rows.put(JSONObject().put("id", id).put("noResponseCommandProposed", ReminderResponsePolicy.parse(transcript) == null)
          .put("emptyTranscript", transcript.isEmpty()).put("normalizedExactRef", reference?.let { normalize(transcript) == it } ?: JSONObject.NULL)
          .put("totalPrepareLoadDecodeMs", SystemClock.elapsedRealtime() - began))
      } finally { pcm.fill(0f) }
    }
    try {
      for (index in 0 until fixtures.length()) {
        val fixture = fixtures.getJSONObject(index)
        val id = fixture.getString("id")
        if (id !in setOf("today", "cancel", "complete")) continue
        val bytes = assets.open("$id.wav").use { it.readBytes() }
        assertEquals(fixture.getLong("bytes"), bytes.size.toLong())
        assertEquals(fixture.getString("sha256"), sha256(bytes))
        evaluate(id, pcm16(bytes), fixture.getString("reference"))
        bytes.fill(0)
      }
      evaluate("digital-silence-max-15s", FloatArray(240_000), null)
      assertEquals(4, rows.length())
      val refused = (0 until rows.length()).all { rows.getJSONObject(it).getBoolean("noResponseCommandProposed") }
      result.put("status", if (refused) "NO_RESPONSE_COMMANDS_PROPOSED" else "UNEXPECTED_RESPONSE_COMMAND")
      assertTrue("Unsupported speech and silence must not become ACK/snooze proposals", refused)
    } finally {
      instrumentation.sendStatus(0, Bundle().apply { putString("phase08_response_negative_controls", result.toString()) })
    }
  }

  private fun normalize(value: String): String = value.lowercase(Locale.ROOT)
    .replace(Regex("[^a-z0-9 ]"), " ").trim().replace(Regex("\\s+"), " ")

  private fun sha256(value: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(value)
    .joinToString("") { "%02x".format(it.toInt() and 255) }

  /** Small reviewed parser adapted from WhisperCorpusBenchmarkTest; no file/API discovery. */
  private fun pcm16(wav: ByteArray): FloatArray {
    require(wav.size in 44..500_000)
    fun tag(offset: Int) = String(wav, offset, 4, Charsets.US_ASCII)
    require(tag(0) == "RIFF" && tag(8) == "WAVE")
    val buffer = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN)
    require(buffer.getInt(4).toLong() + 8 == wav.size.toLong())
    var cursor = 12
    var formatVerified = false
    while (cursor + 8 <= wav.size) {
      val size = buffer.getInt(cursor + 4)
      require(size >= 0 && size <= wav.size - cursor - 8)
      if (tag(cursor) == "fmt ") {
        require(size >= 16 && buffer.getShort(cursor + 8).toInt() == 1 && buffer.getShort(cursor + 10).toInt() == 1)
        require(buffer.getInt(cursor + 12) == 16000 && buffer.getInt(cursor + 16) == 32000 &&
          buffer.getShort(cursor + 20).toInt() == 2 && buffer.getShort(cursor + 22).toInt() == 16)
        formatVerified = true
      }
      if (tag(cursor) == "data") {
        require(formatVerified && size % 2 == 0 && size / 2 in 1600..240_000)
        return FloatArray(size / 2) { buffer.getShort(cursor + 8 + it * 2).toFloat() / 32768f }
      }
      cursor += 8 + size + size % 2
    }
    error("VERIFIED_SYNTHETIC_PCM_DATA_REQUIRED")
  }

  private data class Fixture(val id: String, val reference: String, val bytes: Int, val sha256: String)
}
