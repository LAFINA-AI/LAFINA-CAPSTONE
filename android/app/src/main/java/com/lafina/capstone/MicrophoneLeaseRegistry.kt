package com.lafina.capstone

import java.io.File
import java.io.RandomAccessFile
import java.nio.channels.FileLock
import java.nio.channels.OverlappingFileLockException
import java.util.concurrent.atomic.AtomicLong

/**
 * Token-fenced microphone ownership (AGY-PORT 05). Pure JVM logic; no Android types.
 *
 * Rules:
 * - Every successful [tryAcquire] returns a new [Ticket] with a unique token.
 * - While any ticket is active, every acquisition fails, including one by the same
 *   holder kind. A second Whisper capture is not a fresh owner of the first one's lease.
 * - Only the exact active ticket releases the lease. A rejected contender never has a
 *   ticket, and a stale ticket (already released, or from an earlier owner) is ignored.
 * - The optional lock file adds an OS advisory lock. The kernel drops it when the
 *   process dies, so a crash never leaves the microphone permanently busy.
 *
 * Adapted from the LAFINA donor `LafinaMicrophoneLease.kt` (blob fab9afbb), which used
 * only the file lock. This version keeps the donor's rule that the process never opens
 * a second descriptor for a lock file it already holds (on POSIX, closing any
 * descriptor of that file can drop the process's lock).
 */
class MicrophoneLeaseRegistry(private val lockFile: () -> File?) {
  enum class Holder {
    SPEECH_TO_TEXT,
    MEETING_RECORDER,
    VOICE_CONVERSATION,
  }

  class Ticket internal constructor(
    val holder: Holder,
    val token: Long,
    internal val file: RandomAccessFile?,
    internal val lock: FileLock?,
  ) {
    /** True when the OS advisory lock backs this ticket (false = in-process fence only). */
    val osLocked: Boolean get() = lock?.isValid == true

    override fun toString(): String = "Ticket(holder=$holder, token=$token)"
  }

  private val nextToken = AtomicLong(System.nanoTime() and 0x7fff_ffffL)
  private var active: Ticket? = null

  /**
   * Returns a fresh ticket, or null when the microphone is already owned (by anyone,
   * in this process or, with a lock file, another process).
   */
  @Synchronized
  fun tryAcquire(holder: Holder): Ticket? {
    if (active != null) return null
    val path = try {
      lockFile()
    } catch (_: Exception) {
      null
    }
    var file: RandomAccessFile? = null
    var lock: FileLock? = null
    if (path != null) {
      try {
        path.parentFile?.mkdirs()
        val opened = RandomAccessFile(path, "rw")
        file = opened
        val acquired = opened.channel.tryLock()
        if (acquired == null) {
          // Another process owns the microphone.
          closeQuietly(opened)
          return null
        }
        lock = acquired
      } catch (_: OverlappingFileLockException) {
        // Another component of this JVM holds the file lock directly: busy.
        closeQuietly(file)
        return null
      } catch (_: Exception) {
        // The lock file cannot be used (I/O failure). Fall back to the in-process fence
        // rather than leaving the microphone unusable; this app records in one process.
        closeQuietly(file)
        file = null
        lock = null
      }
    }
    val ticket = Ticket(holder, nextToken.incrementAndGet(), file, lock)
    active = ticket
    return ticket
  }

  /**
   * Releases [ticket] only if it is the active one. Returns true when this call released
   * the lease; false for null, stale, already released or foreign tickets.
   */
  @Synchronized
  fun release(ticket: Ticket?): Boolean {
    if (ticket == null) return false
    val current = active ?: return false
    if (current !== ticket || current.token != ticket.token) return false
    active = null
    try {
      ticket.lock?.let { if (it.isValid) it.release() }
    } catch (_: Exception) {
    }
    closeQuietly(ticket.file)
    return true
  }

  @Synchronized
  fun isActive(ticket: Ticket?): Boolean = ticket != null && active === ticket

  @Synchronized
  fun activeHolder(): Holder? = active?.holder

  private fun closeQuietly(file: RandomAccessFile?) {
    try {
      file?.close()
    } catch (_: Exception) {
    }
  }
}

/**
 * Hands a ticket acquired by the meeting bridge to the foreground service that opens
 * AudioRecord. The bridge acquires first so a busy microphone is reported to JS as a
 * rejected start instead of a service that silently stops. If the service never
 * claims the ticket (start intent lost), [abandon] releases it exactly once; a ticket
 * that was already claimed is never released by the abandon path.
 */
class PendingLeaseHandoff(private val release: (MicrophoneLeaseRegistry.Ticket) -> Boolean) {
  private var pendingKey: String? = null
  private var pendingTicket: MicrophoneLeaseRegistry.Ticket? = null

  /** Parks [ticket] for [key]. Any older unclaimed ticket is released first. */
  @Synchronized
  fun offer(key: String, ticket: MicrophoneLeaseRegistry.Ticket) {
    pendingTicket?.let { if (it !== ticket) release(it) }
    pendingKey = key
    pendingTicket = ticket
  }

  /** Takes the parked ticket when it was offered for [key]; otherwise null. */
  @Synchronized
  fun claim(key: String): MicrophoneLeaseRegistry.Ticket? {
    if (pendingKey != key) return null
    val ticket = pendingTicket
    pendingKey = null
    pendingTicket = null
    return ticket
  }

  /** Releases [ticket] only if it is still parked (never claimed). Returns true if released. */
  @Synchronized
  fun abandon(ticket: MicrophoneLeaseRegistry.Ticket): Boolean {
    if (pendingTicket !== ticket) return false
    pendingKey = null
    pendingTicket = null
    return release(ticket)
  }
}
