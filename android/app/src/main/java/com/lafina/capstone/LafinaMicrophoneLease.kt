package com.lafina.capstone

import android.content.Context
import java.io.File

/**
 * Process-wide microphone ownership for LAFINA native audio modules (AGY-PORT 05).
 *
 * Android permits only one active AudioRecord stream per process on many OEM HALs;
 * starting push-to-talk capture while a meeting is being recorded (or vice versa) can
 * silently starve one of the streams. Each recorder acquires a [MicrophoneLeaseRegistry.Ticket] before opening
 * AudioRecord and releases that exact ticket when its worker has actually returned.
 *
 * Ownership is token-fenced (see [MicrophoneLeaseRegistry]): the same holder kind
 * cannot re-acquire, a rejected contender holds nothing, and a stale release is a
 * no-op. An OS file lock in `noBackupFilesDir` is dropped by the kernel when the
 * process dies.
 */
object LafinaMicrophoneLease {
  /** Promise rejection code used by every native module when the microphone is owned. */
  const val BUSY_CODE = "MIC_IN_USE"
  private const val LOCK_FILE_NAME = "lafina-microphone.lock"

  @Volatile private var lockFile: File? = null

  private val registry = MicrophoneLeaseRegistry { lockFile }

  /** Points the OS lock at app-private no-backup storage. Safe to call repeatedly. */
  fun configure(context: Context) {
    if (lockFile == null) {
      lockFile = File(context.applicationContext.noBackupFilesDir, LOCK_FILE_NAME)
    }
  }

  fun tryAcquire(holder: MicrophoneLeaseRegistry.Holder): MicrophoneLeaseRegistry.Ticket? = registry.tryAcquire(holder)

  fun release(ticket: MicrophoneLeaseRegistry.Ticket?): Boolean = registry.release(ticket)

  fun isActive(ticket: MicrophoneLeaseRegistry.Ticket?): Boolean = registry.isActive(ticket)

  fun activeHolder(): MicrophoneLeaseRegistry.Holder? = registry.activeHolder()

  /** A short, student-safe reason naming the current owner. */
  fun busyMessage(): String = when (activeHolder()) {
    MicrophoneLeaseRegistry.Holder.MEETING_RECORDER -> "Microphone is currently in use by meeting recorder."
    MicrophoneLeaseRegistry.Holder.SPEECH_TO_TEXT -> "Microphone is currently in use by voice assistant."
    MicrophoneLeaseRegistry.Holder.VOICE_CONVERSATION -> "Microphone is currently in use by a voice conversation."
    null -> "Microphone is currently in use."
  }
}
