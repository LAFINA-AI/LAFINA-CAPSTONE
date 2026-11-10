package com.lafina.capstone

import java.net.URI
import java.util.ArrayDeque
import java.util.Base64

/**
 * Pure JVM rules for the live voice conversation bridge (no Android types), so
 * they run in plain unit tests.
 */
object VoiceConversationRules {
  /** The agent WebSocket protocol uses 16 kHz mono PCM both ways (pcm_16000). */
  const val SAMPLE_RATE = 16_000
  /** 100 ms of 16-bit mono audio per upstream message. */
  const val CAPTURE_FRAME_BYTES = SAMPLE_RATE / 10 * 2
  /** Upstream messages are dropped (not buffered) while the socket is this far behind. */
  const val MAX_SOCKET_BACKLOG_BYTES = 256L * 1024
  /** At most this much agent audio waits to play; older audio is dropped first. */
  const val MAX_QUEUED_PLAYBACK_BYTES = SAMPLE_RATE * 2 * 30
  /** Inbound text frames larger than this are ignored. */
  const val MAX_INBOUND_FRAME_CHARS = 2_000_000
  /** What may be forwarded to JavaScript per frame (transcripts, text parts). */
  const val MAX_FORWARDED_FRAME_CHARS = 64 * 1024
  const val MAX_INITIATION_CHARS = 16 * 1024

  /**
   * Only ElevenLabs conversation sockets over TLS. A test build that talks to a
   * backend on the developer's computer may also use a plain local socket.
   */
  fun isAllowedSocketUrl(url: String, allowLocalTestServer: Boolean): Boolean {
    if (url.length > 4096) return false
    val uri = try {
      URI(url)
    } catch (_: Exception) {
      return false
    }
    val host = uri.host?.lowercase() ?: return false
    if (uri.scheme == "wss" && (host == "elevenlabs.io" || host.endsWith(".elevenlabs.io"))) {
      return uri.path?.startsWith("/v1/convai/conversation") == true
    }
    return allowLocalTestServer && uri.scheme == "ws" && (host == "127.0.0.1" || host == "localhost")
  }

  /** Sample rate of a `pcm_<rate>` format, or null for formats the bridge cannot play. */
  fun sampleRateOf(format: String?): Int? {
    val match = Regex("^pcm_(8000|16000|22050|24000|44100|48000)$").find(format ?: return null)
    return match?.groupValues?.get(1)?.toInt()
  }

  fun audioChunkMessage(pcm: ByteArray, length: Int = pcm.size): String =
    "{\"user_audio_chunk\":\"" + Base64.getEncoder().encodeToString(pcm.copyOf(length)) + "\"}"

  fun pongMessage(eventId: Long): String = "{\"type\":\"pong\",\"event_id\":$eventId}"

  fun decodeAudio(base64: String): ByteArray? =
    try {
      Base64.getDecoder().decode(base64)
    } catch (_: IllegalArgumentException) {
      null
    }

  /** Only these client messages may be sent from JavaScript besides audio. */
  val ALLOWED_CLIENT_TYPES = setOf("user_message", "user_activity", "client_tool_result", "contextual_update")

  /**
   * Calculates Root Mean Square (RMS) normalized level [0.0, 1.0] for a 16-bit mono PCM buffer.
   * Pure JVM, safe against index out of bounds.
   */
  fun calculateRms(buffer: ByteArray, offset: Int = 0, length: Int = buffer.size - offset): Double {
    if (buffer.isEmpty() || length <= 0 || offset < 0 || offset >= buffer.size) return 0.0
    var sum = 0.0
    var count = 0
    var i = offset
    val end = minOf(buffer.size, offset + length)
    while (i + 1 < end) {
      val sample = ((buffer[i + 1].toInt() shl 8) or (buffer[i].toInt() and 0xff)).toShort().toDouble()
      sum += sample * sample
      count += 1
      i += 2
    }
    return if (count == 0) 0.0 else minOf(1.0, Math.sqrt(sum / count) / 8000.0)
  }
}

/**
 * Agent audio waiting to play. Bounded; [flush] drops everything queued and
 * bumps the generation so a writer holding an older chunk stops at once.
 */
class PlaybackQueue(private val maxBytes: Int = VoiceConversationRules.MAX_QUEUED_PLAYBACK_BYTES) {
  private val chunks = ArrayDeque<ByteArray>()
  private var queuedBytes = 0
  @Volatile var generation = 0L
    private set
  private var closed = false

  /** Returns false when the queue is closed (session over). */
  @Synchronized
  fun offer(chunk: ByteArray): Boolean {
    if (closed) return false
    if (chunk.isEmpty()) return true
    chunks.addLast(chunk)
    queuedBytes += chunk.size
    while (queuedBytes > maxBytes && chunks.size > 1) {
      queuedBytes -= chunks.removeFirst().size
    }
    (this as Object).notifyAll()
    return true
  }

  /** Next chunk with the generation it belongs to; null when closed or timed out. */
  @Synchronized
  fun take(timeoutMs: Long): Pair<Long, ByteArray>? {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (chunks.isEmpty() && !closed) {
      val wait = deadline - System.currentTimeMillis()
      if (wait <= 0) return null
      (this as Object).wait(wait)
    }
    if (closed) return null
    val chunk = chunks.removeFirst()
    queuedBytes -= chunk.size
    return generation to chunk
  }

  @Synchronized
  fun flush() {
    chunks.clear()
    queuedBytes = 0
    generation += 1
    (this as Object).notifyAll()
  }

  @Synchronized
  fun close() {
    closed = true
    chunks.clear()
    queuedBytes = 0
    generation += 1
    (this as Object).notifyAll()
  }

  @Synchronized
  fun isEmpty(): Boolean = chunks.isEmpty()

  @Synchronized
  fun bytes(): Int = queuedBytes
}
