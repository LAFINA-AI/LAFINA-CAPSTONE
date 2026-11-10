package com.lafina.capstone

import java.util.Base64
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Live voice conversation bridge rules (pure JVM, no device or network). */
class VoiceConversationRulesTest {
  @Test
  fun `only ElevenLabs conversation sockets over TLS are allowed`() {
    val ok = "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=s"
    assertTrue(VoiceConversationRules.isAllowedSocketUrl(ok, false))
    assertTrue(VoiceConversationRules.isAllowedSocketUrl("wss://api.us.elevenlabs.io/v1/convai/conversation?x=1", false))
    assertFalse(VoiceConversationRules.isAllowedSocketUrl("ws://api.elevenlabs.io/v1/convai/conversation", false))
    assertFalse(VoiceConversationRules.isAllowedSocketUrl("wss://elevenlabs.io.evil.example/v1/convai/conversation", false))
    assertFalse(VoiceConversationRules.isAllowedSocketUrl("wss://api.elevenlabs.io/v1/text-to-speech", false))
    assertFalse(VoiceConversationRules.isAllowedSocketUrl("https://api.elevenlabs.io/v1/convai/conversation", false))
    assertFalse(VoiceConversationRules.isAllowedSocketUrl("not a url", false))
  }

  @Test
  fun `a local test socket needs the test-build allowance`() {
    val local = "ws://127.0.0.1:8765/v1/convai/conversation"
    assertFalse(VoiceConversationRules.isAllowedSocketUrl(local, false))
    assertTrue(VoiceConversationRules.isAllowedSocketUrl(local, true))
    assertFalse(VoiceConversationRules.isAllowedSocketUrl("ws://192.168.1.5:8765/x", true))
  }

  @Test
  fun `pcm formats are parsed and others refused`() {
    assertEquals(16_000, VoiceConversationRules.sampleRateOf("pcm_16000"))
    assertEquals(24_000, VoiceConversationRules.sampleRateOf("pcm_24000"))
    assertNull(VoiceConversationRules.sampleRateOf("ulaw_8000"))
    assertNull(VoiceConversationRules.sampleRateOf("mp3_44100_128"))
    assertNull(VoiceConversationRules.sampleRateOf(null))
  }

  @Test
  fun `audio chunks and pongs follow the agent protocol`() {
    val pcm = byteArrayOf(1, 2, 3, 4, 5)
    val message = VoiceConversationRules.audioChunkMessage(pcm, 4)
    assertEquals("{\"user_audio_chunk\":\"" + Base64.getEncoder().encodeToString(byteArrayOf(1, 2, 3, 4)) + "\"}", message)
    assertEquals("{\"type\":\"pong\",\"event_id\":42}", VoiceConversationRules.pongMessage(42))
    assertNull(VoiceConversationRules.decodeAudio("***"))
    assertEquals(3, VoiceConversationRules.decodeAudio("AQID")!!.size)
  }

  @Test
  fun `only text and activity messages may come from JavaScript`() {
    assertEquals(setOf("user_message", "user_activity", "client_tool_result", "contextual_update"), VoiceConversationRules.ALLOWED_CLIENT_TYPES)
  }

  @Test
  fun `flush drops queued audio and fences the writer`() {
    val queue = PlaybackQueue(maxBytes = 1000)
    queue.offer(ByteArray(10))
    queue.offer(ByteArray(10))
    val (generation, _) = queue.take(10)!!
    queue.flush()
    assertTrue(queue.isEmpty())
    assertNotEquals(generation, queue.generation)
    assertNull(queue.take(10))
  }

  @Test
  fun `queue keeps only the newest audio within its bound`() {
    val queue = PlaybackQueue(maxBytes = 25)
    repeat(5) { queue.offer(ByteArray(10) { _ -> it.toByte() }) }
    assertEquals(20, queue.bytes())
    assertEquals(3.toByte(), queue.take(10)!!.second[0])
    assertEquals(4.toByte(), queue.take(10)!!.second[0])
  }

  @Test
  fun `closing wakes a waiting writer and refuses more audio`() {
    val queue = PlaybackQueue()
    val woke = CountDownLatch(1)
    val thread = Thread {
      queue.take(5_000)
      woke.countDown()
    }
    thread.start()
    Thread.sleep(50)
    queue.close()
    assertTrue(woke.await(1, TimeUnit.SECONDS))
    assertFalse(queue.offer(ByteArray(4)))
  }

  @Test
  fun `calculateRms returns zero for empty or silent PCM buffers`() {
    assertEquals(0.0, VoiceConversationRules.calculateRms(ByteArray(0)), 0.0001)
    assertEquals(0.0, VoiceConversationRules.calculateRms(ByteArray(640)), 0.0001)
  }

  @Test
  fun `calculateRms extracts positive level from non-zero PCM and bounds at 1`() {
    // 16-bit PCM samples with moderate amplitude (e.g. sample value = 4000)
    val pcm = ByteArray(640)
    for (i in 0 until 320) {
      val sample: Short = 4000
      pcm[i * 2] = (sample.toInt() and 0xff).toByte()
      pcm[i * 2 + 1] = ((sample.toInt() shr 8) and 0xff).toByte()
    }
    val level = VoiceConversationRules.calculateRms(pcm)
    assertTrue("Level must be positive: $level", level > 0.0)
    assertEquals(0.5, level, 0.05)

    // Saturated high amplitude PCM (sample value = 32767)
    val loud = ByteArray(640)
    for (i in 0 until 320) {
      val sample: Short = 32767
      loud[i * 2] = (sample.toInt() and 0xff).toByte()
      loud[i * 2 + 1] = ((sample.toInt() shr 8) and 0xff).toByte()
    }
    val loudLevel = VoiceConversationRules.calculateRms(loud)
    assertEquals(1.0, loudLevel, 0.0001)
  }

  @Test
  fun `calculateRms respects offset and length slices for playback stream`() {
    val buffer = ByteArray(1280)
    // First 640 bytes are silence, second 640 bytes are loud (sample 8000)
    for (i in 320 until 640) {
      val sample: Short = 8000
      buffer[i * 2] = (sample.toInt() and 0xff).toByte()
      buffer[i * 2 + 1] = ((sample.toInt() shr 8) and 0xff).toByte()
    }

    val silentSlice = VoiceConversationRules.calculateRms(buffer, 0, 640)
    val loudSlice = VoiceConversationRules.calculateRms(buffer, 640, 640)

    assertEquals(0.0, silentSlice, 0.0001)
    assertEquals(1.0, loudSlice, 0.05)
  }
}
