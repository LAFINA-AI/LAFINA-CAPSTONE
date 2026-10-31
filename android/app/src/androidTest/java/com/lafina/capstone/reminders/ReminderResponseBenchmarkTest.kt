package com.lafina.capstone.reminders

import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.math.ceil

/** Synthetic component timing only. Does not open SQLite, an Activity or an audio engine. */
class ReminderResponseBenchmarkTest {
  private data class Sample(val text: String, val expected: ReminderResponseCommand?)
  private val now = "2026-10-27T04:00:00.000Z"
  private val record = ReminderRecord(ReminderIdentity("qa08-job", "qa08-occurrence", 1),
    "qa08-reminder", "QA08 synthetic benchmark", "Asia/Manila", "qa08-task", "TASK",
    1, true, now, "RINGING", "RINGING", 1, "2026-10-27T04:01:00.000Z", now, "DELIVERED", null)
  private val corpus = listOf(
    Sample("acknowledge", ReminderResponseCommand(ReminderAction.ACK)),
    Sample("ACKNOWLEDGE THIS REMINDER!", ReminderResponseCommand(ReminderAction.ACK)),
    Sample("snooze", ReminderResponseCommand(ReminderAction.SNOOZE)),
    Sample("snooze for ten minutes", ReminderResponseCommand(ReminderAction.SNOOZE, 10)),
    Sample("snooze 120 minutes", ReminderResponseCommand(ReminderAction.SNOOZE, 120)),
    Sample("snooze 1 minute", ReminderResponseCommand(ReminderAction.SNOOZE, 1)),
    Sample("okay but remind me later", null),
    Sample("done", null),
    Sample("acknowledge and snooze", null),
    Sample("snooze 121 minutes", null),
    Sample("delete task", null),
    Sample("acknowledge\nsnooze", null),
  )

  @Test fun measureSyntheticPolicyAndReviewWithoutSqlUiOrAudio() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val warmupRounds = 20
    var warmupFailures = 0
    repeat(warmupRounds) { for (sample in corpus) if (!exercise(sample)) warmupFailures++ }
    val samples = LongArray(corpus.size * 100)
    var failures = 0
    for (index in samples.indices) {
      val started = SystemClock.elapsedRealtimeNanos()
      val success = exercise(corpus[index % corpus.size])
      samples[index] = SystemClock.elapsedRealtimeNanos() - started
      if (!success) failures++
    }
    samples.sort()
    fun percentile(fraction: Double): Double =
      samples[(ceil(samples.size * fraction).toInt() - 1).coerceIn(0, samples.lastIndex)] / 1000.0
    val data = JSONObject().put("kind", "SYNTHETIC_NATIVE_RESPONSE_POLICY")
      .put("component", "parse + new session + reviewed one-shot consume or refusal")
      .put("sampleCount", samples.size).put("corpusSize", corpus.size)
      .put("acceptedSamples", samples.size / corpus.size * corpus.count { it.expected != null })
      .put("refusalSamples", samples.size / corpus.size * corpus.count { it.expected == null })
      .put("warmupCount", warmupRounds * corpus.size)
      .put("failures", failures).put("warmupFailures", warmupFailures)
      .put("p50Microseconds", percentile(0.50)).put("p95Microseconds", percentile(0.95))
      .put("maxMicroseconds", samples.last() / 1000.0)
      .put("deviceModel", Build.MODEL).put("api", Build.VERSION.SDK_INT)
      .put("abis", JSONArray(Build.SUPPORTED_ABIS.toList()))
      .put("limits", JSONArray(listOf(
        "Synthetic fixed UTC and elapsed clocks; no real deadline or alarm delivery measured.",
        "No real SQLite, UI, audio, STT/TTS, microphone, network or full interaction measured.",
        "No startup, peak RAM, battery, physical-phone or old/new performance comparison.",
        "Emulator/DataQa timing is observational; no speed improvement is claimed.",
      )))
    instrumentation.sendStatus(0, Bundle().apply { putString("phase08_response_benchmark", data.toString()) })
    assertEquals("Synthetic warmup proposals/refusals must match the fixed corpus", 0, warmupFailures)
    assertEquals("Each accepted proposal must consume once and refusals must stay null", 0, failures)
  }

  private fun exercise(sample: Sample): Boolean {
    val parsed = ReminderResponsePolicy.parse(sample.text)
    val session = ReminderResponseSession(record, now, 1000)
    if (sample.expected == null) return parsed == null && session.active(now, 1000)
    if (parsed != sample.expected) return false
    val command = parsed ?: return false
    val review = session.prepare(command, now, 1000) ?: return false
    return session.consume(review, now, 1001) && !session.consume(review, now, 1002) &&
      !session.active(now, 1002)
  }
}
