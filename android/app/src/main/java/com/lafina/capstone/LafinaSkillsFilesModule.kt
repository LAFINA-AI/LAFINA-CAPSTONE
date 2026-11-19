package com.lafina.capstone

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class LafinaSkillsFilesModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "LafinaSkillsFiles"
  @ReactMethod fun copy(text: String) {
    context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("LAFINA summary",text))
  }
  @ReactMethod fun openFile(path: String, mime: String, promise: Promise) {
    try {
      val file = File(path.removePrefix("file://")).canonicalFile
      val root = File(context.filesDir,"skills_documents").canonicalFile
      require(file.path.startsWith(root.path + File.separator) && file.isFile) { "That saved file is unavailable." }
      val uri = FileProvider.getUriForFile(context,context.packageName + ".fileprovider",file)
      val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri,mime)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) { promise.reject("SKILL_FILE_OPEN", "Install an app that can open this file, or use Share.", error) }
  }
  @ReactMethod fun recordingLevel(promise: Promise) {
    promise.resolve(if (LafinaMeetingService.isRunning && !LafinaMeetingService.isPausedState) LafinaMeetingService.audioLevel else 0.0)
  }
}
