package com.lafina.capstone.voice

import android.content.Context
import android.os.Looper
import com.lafina.capstone.BuildConfig
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest

/** Optional, checksum-pinned offline model. No microphone, network or retained decoder. */
object WhisperTranscriber {
  const val MODEL_ASSET = "stt/ggml-tiny-q5_1.bin"
  const val MODEL_BYTES = 32_152_673L
  const val MODEL_SHA256 = "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7"
  private val libraryAvailable = try {
    System.loadLibrary("capstone_whisper")
    true
  } catch (_: LinkageError) { false } catch (_: SecurityException) { false }

  /** Candidate availability only. Expensive integrity checks run on the inference worker. */
  fun isAvailable(context: Context): Boolean {
    if (!libraryAvailable || !BuildConfig.WHISPER_MODEL_INCLUDED) return false
    return try {
      context.assets.openFd(MODEL_ASSET).use { it.length == MODEL_BYTES }
    } catch (_: Exception) { false }
  }

  /** One context per request; PCM is discarded after inference and never written to disk. */
  @Synchronized
  fun transcribe(
    context: Context,
    samples: FloatArray,
    language: String,
    cancelled: () -> Boolean,
  ): String {
    check(Looper.myLooper() != Looper.getMainLooper()) { "WHISPER_WORKER_REQUIRED" }
    try {
      require(samples.size in 1600..240_000 && samples.all { it.isFinite() && it in -1f..1f }) {
        "WHISPER_INVALID_INPUT"
      }
      val languageCode = when (language.lowercase()) {
        "en", "en-us" -> "en"
        "tl", "fil-ph" -> "tl"
        else -> throw IllegalArgumentException("WHISPER_LANGUAGE_UNAVAILABLE")
      }
      check(isAvailable(context)) { "WHISPER_UNAVAILABLE" }
      // A separate reminder process shares the model file but must not load a second
      // decoder concurrently. Do not block the main thread or queue repeated requests.
      FileOutputStream(File(context.noBackupFilesDir, "whisper-inference.lock"), true).channel.use { channel ->
        val lock = channel.tryLock() ?: throw IllegalStateException("WHISPER_BUSY")
        lock.use {
          check(!cancelled()) { "WHISPER_CANCELLED_OR_TIMEOUT" }
          val model = verifiedModel(context, cancelled)
          check(!cancelled()) { "WHISPER_CANCELLED_OR_TIMEOUT" }
          return transcribeNative(model.absolutePath, samples, languageCode, Cancellation(cancelled))
            .trim().also { check(it.length <= 2000) { "WHISPER_OUTPUT_LIMIT" } }
        }
      }
    } finally {
      // Best-effort application-buffer clearing, not a forensic zeroization guarantee.
      samples.fill(0f)
    }
  }

  private fun verifiedModel(context: Context, cancelled: () -> Boolean): File {
    val directory = File(context.noBackupFilesDir, "offline-speech").apply {
      check(isDirectory || mkdirs()) { "WHISPER_STORAGE_UNAVAILABLE" }
    }
    val model = File(directory, "tiny-q5_1-$MODEL_SHA256.bin")
    if (model.isFile && model.length() == MODEL_BYTES && digest(model, cancelled) == MODEL_SHA256) return model
    val temporary = File(directory, "tiny-copy.tmp")
    try {
      val digest = MessageDigest.getInstance("SHA-256")
      var total = 0L
      context.assets.open(MODEL_ASSET).use { input ->
        FileOutputStream(temporary).use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            check(!cancelled()) { "WHISPER_CANCELLED_OR_TIMEOUT" }
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            check(total <= MODEL_BYTES) { "WHISPER_MODEL_INTEGRITY" }
            output.write(buffer, 0, read)
            digest.update(buffer, 0, read)
          }
          output.fd.sync()
        }
      }
      check(total == MODEL_BYTES && hex(digest.digest()) == MODEL_SHA256) { "WHISPER_MODEL_INTEGRITY" }
      if (model.exists()) check(model.delete()) { "WHISPER_STORAGE_UNAVAILABLE" }
      check(temporary.renameTo(model)) { "WHISPER_STORAGE_UNAVAILABLE" }
      return model
    } finally {
      if (temporary.exists()) temporary.delete()
    }
  }

  private fun digest(file: File, cancelled: () -> Boolean): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        check(!cancelled()) { "WHISPER_CANCELLED_OR_TIMEOUT" }
        val read = input.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
      }
    }
    return hex(digest.digest())
  }

  private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }

  // Called by JNI on its inference thread or an attached GGML worker thread.
  class Cancellation(private val cancelled: () -> Boolean) {
    fun isCancelled(): Boolean = cancelled()
  }

  private external fun transcribeNative(
    modelPath: String,
    samples: FloatArray,
    language: String,
    cancellation: Cancellation,
  ): String
}
