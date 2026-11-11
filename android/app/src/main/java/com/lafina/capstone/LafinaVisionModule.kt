package com.lafina.capstone

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Rect
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import kotlin.math.abs

class LafinaVisionModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var pendingCameraPromise: Promise? = null
  private var currentPhotoPath: String? = null

  private val activityEventListener: ActivityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
      ) {
        if (requestCode == REQUEST_IMAGE_CAPTURE) {
          val promise = pendingCameraPromise
          val photoPath = currentPhotoPath
          pendingCameraPromise = null
          currentPhotoPath = null

          if (promise == null) return

          if (resultCode == Activity.RESULT_OK && photoPath != null) {
            val file = File(photoPath)
            if (file.exists() && file.length() > 0) {
              val result: WritableMap = Arguments.createMap()
              result.putString("uri", Uri.fromFile(file).toString())
              result.putString("path", file.absolutePath)
              promise.resolve(result)
            } else {
              promise.reject("CAMERA_ERROR", "Captured file not found or empty.")
            }
          } else {
            // User cancelled
            promise.resolve(null)
          }
        }
      }
    }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "LafinaVision"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(true)
  }

  @ReactMethod
  fun takePhoto(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Cannot take photo: current activity is null.")
      return
    }

    if (pendingCameraPromise != null) {
      promise.reject("BUSY", "Another camera operation is already in progress.")
      return
    }

    try {
      val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
      val packageManager = activity.packageManager
      if (intent.resolveActivity(packageManager) == null) {
        promise.reject("CAMERA_UNAVAILABLE", "No camera app found on device.")
        return
      }

      val cacheDir = File(reactContext.cacheDir, "camera_captures")
      if (!cacheDir.exists()) cacheDir.mkdirs()

      val photoFile = File(cacheDir, "schedule_${System.currentTimeMillis()}.jpg")
      currentPhotoPath = photoFile.absolutePath

      val photoUri: Uri = FileProvider.getUriForFile(
        reactContext,
        "${reactContext.packageName}.fileprovider",
        photoFile
      )

      intent.putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)

      pendingCameraPromise = promise
      activity.startActivityForResult(intent, REQUEST_IMAGE_CAPTURE)
    } catch (e: Exception) {
      pendingCameraPromise = null
      currentPhotoPath = null
      promise.reject("CAMERA_ERROR", e.message, e)
    }
  }

  private fun isPdfUri(uri: Uri, uriString: String): Boolean {
    val mimeType = try {
      reactContext.contentResolver.getType(uri) ?: ""
    } catch (_: Exception) {
      ""
    }
    if (mimeType.equals("application/pdf", ignoreCase = true)) return true
    val lower = uriString.lowercase()
    return lower.endsWith(".pdf") || lower.contains(".pdf?")
  }

  private fun renderPdfFirstPage(uri: Uri): Bitmap {
    val pfd: ParcelFileDescriptor =
      if (uri.scheme == "file" && !uri.path.isNullOrBlank()) {
        ParcelFileDescriptor.open(File(uri.path!!), ParcelFileDescriptor.MODE_READ_ONLY)
      } else {
        reactContext.contentResolver.openFileDescriptor(uri, "r")
          ?: throw IllegalStateException("Could not open PDF file descriptor.")
      }

    pfd.use { descriptor ->
      PdfRenderer(descriptor).use { renderer ->
        if (renderer.pageCount <= 0) {
          throw IllegalStateException("The selected PDF has no pages.")
        }
        renderer.openPage(0).use { page ->
          val scale = (3100f / page.width.coerceAtLeast(1)).coerceIn(2.5f, 4.5f)
          val width = (page.width * scale).toInt().coerceAtLeast(1)
          val height = (page.height * scale).toInt().coerceAtLeast(1)
          val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
          bitmap.eraseColor(Color.WHITE)
          page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
          return bitmap
        }
      }
    }
  }

  private data class PositionedLine(val text: String, val box: Rect)

  /**
   * Reconstructs element-level spacing inside an ML Kit line so narrow spaces between
   * words/initials (e.g. "LEMAR" + "L") or adjacent table tokens are not dropped.
   */
  private fun buildElementSpacedLineText(line: Text.Line): String {
    val elements = line.elements
    if (elements.isEmpty()) return line.text.trim()

    val sorted = elements.sortedBy { it.boundingBox?.left ?: 0 }
    val sb = StringBuilder()
    var prevRight: Int? = null

    for (el in sorted) {
      val token = el.text.trim()
      if (token.isEmpty()) continue
      val box = el.boundingBox
      if (sb.isNotEmpty()) {
        val gap = if (prevRight != null && box != null) box.left - prevRight else 10
        val avgCharW = if (box != null && token.isNotEmpty()) {
          ((box.right - box.left).toFloat() / token.length).coerceAtLeast(4f)
        } else {
          10f
        }
        // Only glue directly if bounding boxes touch/overlap inside the same token;
        // otherwise preserve whitespace between tokens (including single-letter initials).
        if (gap > avgCharW * 0.15f) {
          sb.append(' ')
        }
      }
      sb.append(token)
      if (box != null) prevRight = box.right
    }

    val rebuilt = sb.toString().trim()
    return if (rebuilt.isNotEmpty()) rebuilt else line.text.trim()
  }

  /**
   * Reconstructs horizontal reading order across multi-column tables (such as USTP CORs)
   * by clustering ML Kit lines with similar vertical centerY and sorting left-to-right.
   */
  private fun buildCoordinateSortedText(visionText: Text): String {
    val lines = mutableListOf<PositionedLine>()
    for (block in visionText.textBlocks) {
      for (line in block.lines) {
        val box = line.boundingBox
        val clean = buildElementSpacedLineText(line)
        if (box != null && clean.isNotEmpty()) {
          lines.add(PositionedLine(clean, box))
        }
      }
    }
    if (lines.isEmpty()) return visionText.text

    val avgHeight = lines.map { (it.box.bottom - it.box.top).coerceAtLeast(1) }.average()
    val rowTolerance = (avgHeight * 0.55).coerceAtLeast(8.0)

    val sortedByY = lines.sortedWith(compareBy({ it.box.centerY() }, { it.box.left }))
    val rows = mutableListOf<MutableList<PositionedLine>>()

    for (item in sortedByY) {
      val currentRow = rows.lastOrNull()
      if (currentRow == null) {
        rows.add(mutableListOf(item))
      } else {
        val rowCenterY = currentRow.map { it.box.centerY() }.average()
        if (abs(item.box.centerY() - rowCenterY) <= rowTolerance) {
          currentRow.add(item)
        } else {
          rows.add(mutableListOf(item))
        }
      }
    }

    return rows.joinToString("\n") { row ->
      row.sortedBy { it.box.left }.joinToString(" ") { it.text }
    }
  }

  @ReactMethod
  fun recognizeText(uriString: String, promise: Promise) {
    try {
      val uri = Uri.parse(uriString)
      val image: InputImage = if (isPdfUri(uri, uriString)) {
        val pdfBitmap = renderPdfFirstPage(uri)
        InputImage.fromBitmap(pdfBitmap, 0)
      } else {
        InputImage.fromFilePath(reactContext, uri)
      }
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

      recognizer.process(image)
        .addOnSuccessListener { visionText ->
          val structuredText = buildCoordinateSortedText(visionText)
          val result: WritableMap = Arguments.createMap()
          result.putString("text", visionText.text)
          result.putString("structuredText", structuredText)
          result.putInt("blockCount", visionText.textBlocks.size)
          promise.resolve(result)
        }
        .addOnFailureListener { e ->
          promise.reject("OCR_FAILED", e.message, e)
        }
    } catch (e: Exception) {
      promise.reject("IMAGE_ERROR", e.message, e)
    }
  }

  companion object {
    private const val REQUEST_IMAGE_CAPTURE = 9201
  }
}
