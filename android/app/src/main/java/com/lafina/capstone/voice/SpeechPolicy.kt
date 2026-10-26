package com.lafina.capstone.voice

import java.util.Locale

/** Bounded policy shared by the bridge and visible reminder; no Android or database dependency. */
data class SpeechOptions(
  val enginePackage: String? = null,
  val voiceName: String? = null,
  val languageTag: String = "en-US",
  val rate: Double = 1.0,
  val pitch: Double = 1.0,
) {
  fun validate(): SpeechOptions {
    require(enginePackage == null || enginePackage.isNotBlank() && enginePackage.length <= 200) { "INVALID_ENGINE" }
    require(voiceName == null || voiceName.isNotBlank() && voiceName.length <= 512) { "INVALID_VOICE" }
    require(languageTag.length in 2..64 && Regex("[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*").matches(languageTag) &&
      Locale.forLanguageTag(languageTag).language !in listOf("", "und")) { "INVALID_LANGUAGE" }
    require(rate.isFinite() && rate in 0.5..2.0 && pitch.isFinite() && pitch in 0.5..2.0) { "INVALID_SPEECH_SPEED" }
    return this
  }
}

data class SpeechVoice(
  val name: String,
  val languageTag: String,
  val offline: Boolean,
  val installed: Boolean,
  val quality: Int,
  val latency: Int,
)

data class ReminderSpeechPreferences(val enabled: Boolean, val options: SpeechOptions? = null, val reason: String? = null)

object SpeechPolicy {
  const val MAX_TEXT = 600
  const val MAX_EVENTS = 200
  const val MAX_VOICES = 500
  const val MAX_ENGINES = 50

  fun select(voices: List<SpeechVoice>, options: SpeechOptions): SpeechVoice? {
    options.validate()
    return voices.asSequence().filter {
      it.offline && it.installed && it.languageTag.equals(options.languageTag, ignoreCase = true) &&
        (options.voiceName == null || options.voiceName == it.name)
    }.sortedWith(compareByDescending<SpeechVoice> { it.quality }.thenBy { it.latency }.thenBy { it.name }).firstOrNull()
  }

  fun validRequest(requestId: String, text: String): Boolean =
    Regex("[A-Za-z0-9:_-]{1,80}").matches(requestId) && text.isNotBlank() && text.length <= MAX_TEXT

  /** Canned text is never generated, logged or used to mark its source task completed. */
  fun reminderText(title: String): String = "Academic reminder. ${title.take(480)}. Acknowledge this alert or snooze it."
}

data class SpeechTicket(val requestId: String, val utteranceId: String, val requestedAt: Long)

/** One active utterance and a bounded replay guard. Old engine callbacks cannot finish newer speech. */
class SpeechTickets {
  private var sequence = 0L
  private val seen = ArrayDeque<String>()
  private var started = false
  var active: SpeechTicket? = null
    private set

  fun begin(requestId: String, now: Long): SpeechTicket? {
    if (requestId in seen) return null
    seen.addLast(requestId)
    while (seen.size > SpeechPolicy.MAX_EVENTS) seen.removeFirst()
    started = false
    return SpeechTicket(requestId, "lafina:${++sequence}", now).also { active = it }
  }

  fun hasSeen(requestId: String): Boolean = requestId in seen

  fun start(utteranceId: String): SpeechTicket? {
    val current = active ?: return null
    if (started || current.utteranceId != utteranceId) return null
    started = true
    return current
  }

  fun finish(utteranceId: String): SpeechTicket? {
    val current = active ?: return null
    if (current.utteranceId != utteranceId) return null
    active = null
    return current
  }
}

/** A Stop during slow engine binding invalidates its later callback, before any speech is accepted. */
class SpeechInitialization {
  private var sequence = 0L
  private var pending = false
  fun begin(): Long { pending = true; return ++sequence }
  fun isCurrent(token: Long): Boolean = pending && token == sequence
  fun finish() { pending = false }
  fun cancel() { ++sequence; pending = false }
}
