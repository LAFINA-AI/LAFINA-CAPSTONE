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
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Read-only replay of one explicitly selected, integrity-checked synthetic emulator capture.
 * No microphone, action, arbitrary path or raw hypothesis output is available in this test.
 * Root fetches/removes exact diagnostic files separately; JUnit execution and phrase quality differ.
 */
class Phase08SyntheticReplayTest {
  @Test fun replayOnlyExplicitPinnedSyntheticCapture() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val args = InstrumentationRegistry.getArguments()
    assumeTrue("Explicit capture replay opt-in required", args.getString("runPhase08SyntheticReplay") == "true")
    require(BuildConfig.BUILD_TYPE == "dataQa" && BuildConfig.WHISPER_MODEL_INCLUDED) {
      "MODEL_INCLUDED_DATAQA_BUILD_REQUIRED"
    }
    require(Build.HARDWARE in setOf("ranchu", "goldfish")) { "EMULATOR_ONLY_SYNTHETIC_REPLAY" }
    assertTrue("Real decoder runs on the instrumentation worker", Looper.myLooper() != Looper.getMainLooper())
    val cohort = args.getString("qa08_capture_cohort").orEmpty()
    require(Regex("[A-Za-z0-9_-]{1,48}").matches(cohort)) { "EXACT_SAFE_CAPTURE_COHORT_REQUIRED" }
    val app = instrumentation.targetContext
    require(app.packageName == "com.lafina.capstone") { "EXACT_TARGET_PACKAGE_REQUIRED" }
    val directory = app.noBackupFilesDir.canonicalFile
    val metadataFile = File(directory, "qa08-native-capture-$cohort.json").canonicalFile
    val pcmFile = File(directory, "qa08-native-capture-$cohort.pcm").canonicalFile
    val result = JSONObject().put("kind", "PHASE08_PINNED_SYNTHETIC_CAPTURE_REPLAY")
      .put("cohort", cohort).put("status", "INCOMPLETE")
      .put("microphoneOpened", false).put("actionsExecuted", false).put("rawTranscriptEmitted", false)
      .put("physicalDeviceValidation", "NOT_RUN").put("vocabulary", WhisperVocabulary.REMINDER_RESPONSE.name)
      .put("modelSha256", WhisperTranscriber.MODEL_SHA256)
    val began = SystemClock.elapsedRealtime()
    var metadataBytes: ByteArray? = null
    var sourceBytes: ByteArray? = null
    var pcmBytes: ByteArray? = null
    var samples: FloatArray? = null
    try {
      require(metadataFile.parentFile == directory && pcmFile.parentFile == directory &&
        metadataFile.isFile && metadataFile.length() in 1..4096) { "EXACT_OWNED_CAPTURE_METADATA_REQUIRED" }
      metadataBytes = metadataFile.readBytes()
      val metadata = JSONObject(String(metadataBytes, Charsets.UTF_8))
      require(metadata.getString("kind") == "DATAQA_EXPLICIT_EMULATOR_SYNTHETIC_CAPTURE" &&
        metadata.getString("cohort") == cohort && metadata.getString("pcmFile") == pcmFile.name &&
        metadata.getString("vocabulary") == WhisperVocabulary.REMINDER_RESPONSE.name &&
        metadata.getInt("sampleRate") == 16000) { "EXPECTED_CAPTURE_METADATA_REQUIRED" }
      val fixture = when (metadata.getString("fixtureId")) {
        "acknowledge" -> Fixture("acknowledge", "acknowledge this reminder", 72206,
          "e10b92f68d6a188bc19b44bd327aa91747d58d4a257510d786a14dc45a4e0a3c")
        "snooze" -> Fixture("snooze", "snooze for ten minutes", 74286,
          "fd762146a51062b7d5deef1cda58b2607d8b3aa4694bde4c76d9820701e5f42a")
        else -> error("EXACT_PINNED_SYNTHETIC_FIXTURE_REQUIRED")
      }
      val sourceDirectory = File(directory, "qa08-response-corpus").canonicalFile
      val source = File(sourceDirectory, "${fixture.id}.wav").canonicalFile
      require(sourceDirectory.parentFile == directory && source.parentFile == sourceDirectory &&
        source.isFile && source.length() == fixture.bytes.toLong()) { "EXACT_PINNED_SOURCE_FILE_REQUIRED" }
      sourceBytes = source.readBytes()
      require(sha256(sourceBytes) == fixture.sha256 && metadata.getString("sourceWavSha256") == fixture.sha256) {
        "PINNED_SOURCE_INTEGRITY_REQUIRED"
      }
      val frames = metadata.getInt("frames")
      require(frames in 1600..240_000 && metadata.getInt("bytes") == frames * 2 &&
        pcmFile.isFile && pcmFile.length() == frames * 2L) { "BOUNDED_EXACT_CAPTURE_BYTES_REQUIRED" }
      pcmBytes = pcmFile.readBytes()
      val pcmSha256 = sha256(pcmBytes)
      require(pcmBytes.size == frames * 2 && pcmSha256 == metadata.getString("sha256")) {
        "CAPTURE_PCM_INTEGRITY_REQUIRED"
      }
      val buffer = ByteBuffer.wrap(pcmBytes).order(ByteOrder.LITTLE_ENDIAN)
      samples = FloatArray(frames) { buffer.getShort(it * 2) / 32768f }
      require(samples.all { it.isFinite() && it in -1f..1f }) { "FINITE_PCM16_SAMPLES_REQUIRED" }
      result.put("fixtureId", fixture.id).put("sourceWavSha256", fixture.sha256)
        .put("capturePcmSha256", pcmSha256).put("captureFrames", frames).put("captureBytes", pcmBytes.size)
      val decodeBegan = SystemClock.elapsedRealtime()
      val transcript = WhisperTranscriber.transcribe(app, samples, "en-US", WhisperVocabulary.REMINDER_RESPONSE) { false }
      val normalized = normalize(transcript)
      val command = ReminderResponsePolicy.parse(transcript)
      val parsedExpected = if (fixture.id == "acknowledge") command?.action == ReminderAction.ACK
        else command?.action == ReminderAction.SNOOZE && command.minutes == 10
      val exact = normalized == fixture.reference
      val expected = exact || (fixture.id == "snooze" && normalized == "snooze for 10 minutes")
      result.put("status", if (exact) "EXACT_SYNTHETIC_REFERENCE" else if (expected && parsedExpected)
        "EXPECTED_SYNTHETIC_RESPONSE" else "SYNTHETIC_REFERENCE_MISMATCH")
        .put("decoderProducedResult", true).put("normalizedExactReference", exact)
        .put("normalizedExpectedResponse", expected).put("commandParsedExpected", parsedExpected)
        .put("normalizedSha256", sha256(normalized.toByteArray(Charsets.UTF_8)))
        .put("charCount", transcript.length).put("totalPrepareLoadDecodeMs", SystemClock.elapsedRealtime() - decodeBegan)
      // Completion is a functional gate; exact response quality is separately reported and optionally required.
      if (args.getString("requireExpected") == "true") {
        assertTrue("Replay must match the pinned expected response and independently parse", expected && parsedExpected)
      }
    } catch (failure: Throwable) {
      if (!result.optBoolean("decoderProducedResult")) result.put("status", "ERROR")
      result.put("failureClass", failure.javaClass.simpleName)
      throw failure
    } finally {
      samples?.fill(0f)
      pcmBytes?.fill(0)
      sourceBytes?.fill(0)
      metadataBytes?.fill(0)
      result.put("totalValidationAndDecodeMs", SystemClock.elapsedRealtime() - began)
      instrumentation.sendStatus(0, Bundle().apply { putString("phase08_synthetic_replay", result.toString()) })
    }
  }

  private fun normalize(value: String): String = value.lowercase(Locale.ROOT)
    .replace(Regex("[^a-z0-9 ]"), " ").trim().replace(Regex("\\s+"), " ")

  private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes)
    .joinToString("") { "%02x".format(it.toInt() and 255) }

  private data class Fixture(val id: String, val reference: String, val bytes: Int, val sha256: String)
}
