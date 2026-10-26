package com.lafina.capstone.voice

import android.content.Context
import java.io.Closeable
import java.io.File
import java.io.RandomAccessFile
import java.nio.channels.FileLock

/** OS lock shared by the app and reminder processes. The empty file contains no audio or transcript. */
class MicrophoneLease private constructor(private val file: RandomAccessFile, private val lock: FileLock) : Closeable {
  override fun close() {
    try { if (lock.isValid) lock.release() } catch (_: Exception) { }
    try { file.close() } catch (_: Exception) { }
  }

  companion object {
    fun acquire(context: Context): MicrophoneLease? = acquire(File(context.noBackupFilesDir, "capstone-microphone.lock"))

    /** Injectable path permits isolated instrumentation without touching a live microphone owner. */
    fun acquire(path: File): MicrophoneLease? {
      var file: RandomAccessFile? = null
      return try {
        file = RandomAccessFile(path, "rw")
        val lock = file.channel.tryLock()
        if (lock == null) { file.close(); null } else MicrophoneLease(file, lock)
      } catch (_: Exception) {
        try { file?.close() } catch (_: Exception) { }
        null
      }
    }
  }
}
