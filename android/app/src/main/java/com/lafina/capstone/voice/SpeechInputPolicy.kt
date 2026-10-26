package com.lafina.capstone.voice

/** Pure bounds and legal transitions; recording/transcripts never become scheduling commands. */
object SpeechInputPolicy {
  const val SAMPLE_RATE = 16_000
  const val MAX_SAMPLES = SAMPLE_RATE * 15
  const val MAX_HOLD_MS = 15_000L
  const val PREPARE_TIMEOUT_MS = 8_000L
  const val TRANSCRIBE_TIMEOUT_MS = 60_000L
  const val MAX_TRANSCRIPT = 2_000
  const val MAX_SEEN = 128
  val languages = setOf("en-US", "fil-PH")

  fun validSessionId(value: String): Boolean = Regex("[A-Za-z0-9_-]{1,80}").matches(value)
  fun validLanguage(value: String): Boolean = value in languages
  fun validEngine(value: String): Boolean = value in setOf("auto", "android", "whisper")

  fun selectEngine(sdk: Int, onDevice: Boolean, whisper: Boolean, preference: String, androidFailed: Boolean = false): String? {
    if (!validEngine(preference)) return null
    val androidReady = sdk >= 31 && onDevice
    return when (preference) {
      "android" -> if (androidReady) "android" else null
      "whisper" -> if (whisper) "whisper" else null
      else -> if (androidReady && !androidFailed) "android" else if (whisper) "whisper" else null
    }
  }

  /** A conservative silence/empty-buffer guard, not an acoustic speech detector. */
  fun hasAudioSignal(samples: FloatArray): Boolean {
    if (samples.size !in 1_600..MAX_SAMPLES) return false
    var energy = 0.0
    for (sample in samples) {
      if (!sample.isFinite() || sample < -1f || sample > 1f) return false
      energy += sample.toDouble() * sample
    }
    return energy / samples.size >= 0.000004
  }

  /** AudioRecord may return zero/an error when stop() unblocks its pending read. */
  fun readOutcome(read: Int, holding: Boolean, cancelled: Boolean): CaptureReadOutcome = when {
    read > 0 -> CaptureReadOutcome.DATA
    !holding || cancelled -> CaptureReadOutcome.FINISHED
    else -> CaptureReadOutcome.ERROR
  }

  fun transcript(value: String): String? {
    if (value.length > MAX_TRANSCRIPT) return null
    return value.trim().replace(Regex("\\s+"), " ").takeIf { it.isNotEmpty() }
  }
}

enum class CaptureReadOutcome { DATA, FINISHED, ERROR }

enum class InputPhase { PREPARING, RECORDING, TRANSCRIBING }
data class InputTicket(val sessionId: String, val token: Long, val engine: String, val requestedAt: Long, var phase: InputPhase = InputPhase.PREPARING)

/** Main-thread state, bounded replay protection and identity checks for late platform callbacks. */
class SpeechInputSessions {
  private var sequence = 0L
  private val seen = ArrayDeque<String>()
  var active: InputTicket? = null
    private set

  fun begin(id: String, engine: String, now: Long): InputTicket? {
    if (active != null || id in seen) return null
    seen.addLast(id)
    while (seen.size > SpeechInputPolicy.MAX_SEEN) seen.removeFirst()
    return InputTicket(id, ++sequence, engine, now).also { active = it }
  }

  fun hasSeen(id: String): Boolean = id in seen
  fun current(token: Long): Boolean = active?.token == token
  fun recording(token: Long): Boolean {
    val ticket = active ?: return false
    if (ticket.token != token || ticket.phase != InputPhase.PREPARING) return false
    ticket.phase = InputPhase.RECORDING
    return true
  }
  fun transcribing(token: Long): Boolean {
    val ticket = active ?: return false
    if (ticket.token != token || ticket.phase != InputPhase.RECORDING) return false
    ticket.phase = InputPhase.TRANSCRIBING
    return true
  }
  fun finish(token: Long): InputTicket? {
    val ticket = active ?: return null
    if (ticket.token != token) return null
    active = null
    return ticket
  }
}
