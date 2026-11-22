package com.lafina.capstone

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

internal class SkillsFileMissingException(message: String) : IllegalStateException(message)

internal class SkillsFileInvalidException(message: String) : IllegalArgumentException(message)

internal object SkillsFileOpenPolicy {
  fun resolveDocumentFile(skillsRoot: File, rawPath: String): File {
    val trimmed = rawPath.removePrefix("file://").trim()
    if (trimmed.isEmpty()) {
      throw SkillsFileInvalidException("That saved file path is not allowed.")
    }
    val root = skillsRoot.canonicalFile
    val file = File(trimmed).canonicalFile
    val rootPrefix = root.path.trimEnd(File.separatorChar) + File.separator
    if (!file.path.startsWith(rootPrefix)) {
      throw SkillsFileInvalidException("That saved file path is not allowed.")
    }
    if (!file.isFile) {
      throw SkillsFileMissingException("This file is no longer on this phone. Generate it again.")
    }
    return file
  }

  fun classifyOpenError(error: Throwable): Pair<String, String> = when (error) {
    is SkillsFileMissingException ->
      "SKILL_FILE_MISSING" to "This file is no longer on this phone. Generate it again."
    is SkillsFileInvalidException ->
      "SKILL_FILE_INVALID" to "That saved file is unavailable."
    is ActivityNotFoundException ->
      "SKILL_NO_VIEWER" to "No app on this phone can open this file type. Use Share to send or save it."
    else ->
      "SKILL_FILE_OPEN" to "Could not open this file. Try using Share instead."
  }
}

class LafinaSkillsFilesModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "LafinaSkillsFiles"
  @ReactMethod fun copy(text: String, promise: Promise) {
    try {
      val manager = context.getSystemService(ClipboardManager::class.java)
        ?: throw IllegalStateException("Clipboard service is unavailable.")
      manager.setPrimaryClip(ClipData.newPlainText("LAFINA", text))
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("SKILL_CLIPBOARD", error.message ?: "Could not copy to clipboard.", error)
    }
  }
  @ReactMethod fun openFile(path: String, mime: String, promise: Promise) {
    try {
      val root = File(context.filesDir, "skills_documents")
      val file = SkillsFileOpenPolicy.resolveDocumentFile(root, path)
      val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
      val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      val (code, message) = SkillsFileOpenPolicy.classifyOpenError(error)
      promise.reject(code, message, error)
    }
  }
  @ReactMethod fun recordingLevel(promise: Promise) {
    promise.resolve(if (LafinaMeetingService.isRunning && !LafinaMeetingService.isPausedState) LafinaMeetingService.audioLevel else 0.0)
  }
}
