package com.lafina.capstone

import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** AGY-PORT 05: token-fenced microphone ownership (pure JVM, no device). */
class MicrophoneLeaseTest {
  private lateinit var dir: File

  @Before
  fun setUp() {
    dir = Files.createTempDirectory("lafina-mic-lease").toFile()
  }

  @After
  fun tearDown() {
    dir.deleteRecursively()
  }

  private fun memoryRegistry() = MicrophoneLeaseRegistry { null }

  @Test
  fun `each acquisition gets a unique token`() {
    val lease = memoryRegistry()
    val first = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT)
    assertNotNull(first)
    assertTrue(lease.release(first))
    val second = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT)
    assertNotNull(second)
    assertNotEquals(first!!.token, second!!.token)
  }

  @Test
  fun `same holder re-acquire is not a fresh owner`() {
    val lease = memoryRegistry()
    val active = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT)
    assertNotNull(active)
    assertNull(lease.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT))
    assertTrue(lease.isActive(active))
    assertEquals(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT, lease.activeHolder())
  }

  @Test
  fun `whisper contender is rejected while a meeting records and cannot release it`() {
    val lease = memoryRegistry()
    val meeting = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER)
    val contender = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT)
    assertNull(contender)
    assertFalse(lease.release(contender))
    assertTrue(lease.isActive(meeting))
    assertEquals(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER, lease.activeHolder())
  }

  @Test
  fun `meeting contender is rejected while whisper captures and cannot release it`() {
    val lease = memoryRegistry()
    val whisper = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT)
    assertNull(lease.tryAcquire(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER))
    assertTrue(lease.isActive(whisper))
  }

  @Test
  fun `stale ticket from an earlier owner never releases the current owner`() {
    val lease = memoryRegistry()
    val old = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT)!!
    assertTrue(lease.release(old))
    val current = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER)!!
    // A late cancel/cleanup for the old capture arrives after the meeting started.
    assertFalse(lease.release(old))
    assertTrue(lease.isActive(current))
    assertEquals(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER, lease.activeHolder())
  }

  @Test
  fun `release is exactly once`() {
    val lease = memoryRegistry()
    val ticket = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER)!!
    assertTrue(lease.release(ticket))
    assertFalse(lease.release(ticket))
    assertNull(lease.activeHolder())
  }

  @Test
  fun `a ticket from another registry instance is foreign`() {
    val a = memoryRegistry()
    val b = memoryRegistry()
    val ticketA = a.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT)!!
    val ticketB = b.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT)!!
    assertFalse(a.release(ticketB))
    assertTrue(a.isActive(ticketA))
  }

  @Test
  fun `concurrent contenders produce exactly one owner`() {
    val lease = memoryRegistry()
    val pool = Executors.newFixedThreadPool(8)
    val start = CountDownLatch(1)
    val winners = AtomicInteger(0)
    repeat(32) { index ->
      pool.execute {
        start.await()
        val holder = if (index % 2 == 0) {
          MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT
        } else {
          MicrophoneLeaseRegistry.Holder.MEETING_RECORDER
        }
        if (lease.tryAcquire(holder) != null) winners.incrementAndGet()
      }
    }
    start.countDown()
    pool.shutdown()
    assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS))
    assertEquals(1, winners.get())
  }

  @Test
  fun `os lock backs the ticket and is dropped on release`() {
    val lockFile = File(dir, "mic.lock")
    val lease = MicrophoneLeaseRegistry { lockFile }
    val ticket = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER)!!
    assertTrue(ticket.osLocked)
    assertTrue(lease.release(ticket))
    assertFalse(ticket.osLocked)
    val next = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT)
    assertNotNull(next)
    assertTrue(next!!.osLocked)
  }

  @Test
  fun `an unusable lock path falls back to the in-process fence instead of permanent busy`() {
    // A directory cannot be opened as a lock file.
    val lease = MicrophoneLeaseRegistry { dir }
    val ticket = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT)
    assertNotNull(ticket)
    assertFalse(ticket!!.osLocked)
    assertNull(lease.tryAcquire(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER))
    assertTrue(lease.release(ticket))
    assertNotNull(lease.tryAcquire(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER))
  }

  @Test
  fun `another process holding the lock means busy, and its death frees the microphone`() {
    val lockFile = File(dir, "mic.lock")
    val classpath = listOf(
      MicrophoneLeaseProbe::class.java,
      MicrophoneLeaseRegistry::class.java,
      Unit::class.java,
    ).map { File(it.protectionDomain.codeSource.location.toURI()).absolutePath }
      .distinct()
      .joinToString(File.pathSeparator)
    val java = File(System.getProperty("java.home"), "bin/java").absolutePath
    val probe = ProcessBuilder(java, "-cp", classpath, MicrophoneLeaseProbe::class.java.name, lockFile.absolutePath)
      .redirectErrorStream(true)
      .start()
    try {
      val reader = BufferedReader(InputStreamReader(probe.inputStream))
      assertEquals("ACQUIRED", reader.readLine())

      val lease = MicrophoneLeaseRegistry { lockFile }
      assertNull(
        "another process owns the microphone",
        lease.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT)
      )

      // Process death: the kernel drops the OS lock with no cleanup code running.
      probe.destroyForcibly()
      assertTrue(probe.waitFor(10, TimeUnit.SECONDS))

      // Windows hosts drop a dead process's locks asynchronously ("dependent on available
      // system resources"); Linux/Android drop them at exit. Poll within a short bound.
      var ticket: MicrophoneLeaseRegistry.Ticket? = null
      val deadline = System.currentTimeMillis() + 10_000
      while (ticket == null && System.currentTimeMillis() < deadline) {
        ticket = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT)
        if (ticket == null) Thread.sleep(100)
      }
      assertNotNull("a dead owner never leaves the microphone busy", ticket)
      assertTrue(ticket!!.osLocked)
      assertTrue(lease.release(ticket))
    } finally {
      probe.destroyForcibly()
    }
  }

  @Test
  fun `handoff ticket is claimed once and the abandon timer never releases a claimed ticket`() {
    val lease = memoryRegistry()
    val handoff = PendingLeaseHandoff { lease.release(it) }
    val ticket = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER)!!
    handoff.offer("meeting-1", ticket)
    assertNull(handoff.claim("meeting-2"))
    assertTrue(handoff.claim("meeting-1") === ticket)
    assertNull(handoff.claim("meeting-1"))
    assertFalse(handoff.abandon(ticket))
    assertTrue(lease.isActive(ticket))
  }

  @Test
  fun `unclaimed handoff ticket is released by the abandon timer exactly once`() {
    val lease = memoryRegistry()
    val handoff = PendingLeaseHandoff { lease.release(it) }
    val ticket = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER)!!
    handoff.offer("meeting-1", ticket)
    assertTrue(handoff.abandon(ticket))
    assertFalse(handoff.abandon(ticket))
    assertNull(lease.activeHolder())
    assertNull(handoff.claim("meeting-1"))
  }

  @Test
  fun `native modules keep their public names and the busy code`() {
    assertEquals("MIC_IN_USE", LafinaMicrophoneLease.BUSY_CODE)
    val speech = LafinaSpeechToTextModule::class.java.declaredMethods.map { it.name }
    listOf("startListening", "stopListening", "cancelListening", "transcribe", "isAvailable", "release")
      .forEach { assertTrue(it, speech.contains(it)) }
    val meeting = LafinaMeetingRecorderModule::class.java.declaredMethods.map { it.name }
    listOf(
      "startRecording", "pauseRecording", "resumeRecording", "stopRecording",
      "importAudioFile", "transcribeChunkWithTimestamps"
    ).forEach { assertTrue(it, meeting.contains(it)) }
  }
}
