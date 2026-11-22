package com.lafina.capstone

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Rect
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.util.Xml
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import org.xmlpull.v1.XmlPullParser
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.util.zip.ZipInputStream
import kotlin.math.abs

class LafinaVisionModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var pendingCameraPromise: Promise? = null
  private var currentPhotoPath: String? = null
  private val pdfCacheLock = Any()
  private var cachedPdfUri: String? = null
  private var cachedPdfFile: File? = null

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

  override fun invalidate() {
    super.invalidate()
    synchronized(pdfCacheLock) {
      clearPdfCacheLocked()
    }
  }

  private fun clearPdfCacheLocked(expectedUri: String? = null) {
    if (expectedUri != null && cachedPdfUri != expectedUri) return
    try {
      cachedPdfFile?.delete()
    } catch (_: Throwable) {}
    cachedPdfUri = null
    cachedPdfFile = null
  }

  private fun getOrCopyPdfCache(uri: Uri, uriString: String, forceRefresh: Boolean): File {
    synchronized(pdfCacheLock) {
      val existing = cachedPdfFile
      if (!forceRefresh && cachedPdfUri == uriString && existing != null && existing.exists()) {
        return existing
      }
      clearPdfCacheLocked()
      val cacheRoot = File(reactContext.cacheDir, "material_pdf_cache")
      if (!cacheRoot.exists()) cacheRoot.mkdirs()
      val target = File(cacheRoot, "pdf_${System.currentTimeMillis()}.pdf")
      try {
        openInput(uri).use { input ->
          target.outputStream().use { output ->
            val buf = ByteArray(16 * 1024)
            var total = 0L
            while (true) {
              val read = input.read(buf)
              if (read <= 0) break
              total += read
              if (total > MAX_MATERIAL_PDF_BYTES) {
                throw IllegalStateException("PDF_TOO_LARGE")
              }
              output.write(buf, 0, read)
            }
          }
        }
        cachedPdfUri = uriString
        cachedPdfFile = target
        return target
      } catch (e: Throwable) {
        try { target.delete() } catch (_: Throwable) {}
        throw e
      }
    }
  }

  @ReactMethod
  fun getFileSize(uriString: String, promise: Promise) {
    Thread {
      try {
        val uri = Uri.parse(uriString)
        if (uri.scheme == "file" && !uri.path.isNullOrBlank()) {
          val file = File(uri.path!!)
          promise.resolve(if (file.exists()) file.length().toDouble() else -1.0)
          return@Thread
        }
        val size = reactContext.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
        promise.resolve(size.toDouble())
      } catch (_: Throwable) {
        promise.resolve(-1.0)
      }
    }.start()
  }

  @ReactMethod
  fun releasePdfCache(uriString: String?, promise: Promise) {
    synchronized(pdfCacheLock) {
      clearPdfCacheLocked(uriString)
    }
    promise.resolve(true)
  }

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
    if (mimeType.startsWith("image/", ignoreCase = true)) return false
    val lower = uriString.lowercase()
    if (lower.endsWith(".pdf") || lower.contains(".pdf?")) return true
    if (listOf(".png", ".jpg", ".jpeg", ".webp", ".gif").any { lower.endsWith(it) || lower.contains("$it?") }) {
      return false
    }
    return try {
      openInput(uri).use { stream ->
        val header = ByteArray(5)
        val read = stream.read(header)
        read >= 5 && String(header, Charsets.US_ASCII) == "%PDF-"
      }
    } catch (_: Exception) {
      false
    }
  }

  private fun openPdfDescriptor(uri: Uri): ParcelFileDescriptor =
    if (uri.scheme == "file" && !uri.path.isNullOrBlank()) {
      ParcelFileDescriptor.open(File(uri.path!!), ParcelFileDescriptor.MODE_READ_ONLY)
    } else {
      reactContext.contentResolver.openFileDescriptor(uri, "r")
        ?: throw IllegalStateException("Could not open PDF file descriptor.")
    }

  private fun renderPdfPage(renderer: PdfRenderer, pageIndex: Int, targetWidth: Float = 3100f): Bitmap {
    renderer.openPage(pageIndex).use { page ->
      val scale = (targetWidth / page.width.coerceAtLeast(1)).coerceIn(2.0f, 4.5f)
      val width = (page.width * scale).toInt().coerceAtLeast(1)
      val height = (page.height * scale).toInt().coerceAtLeast(1)
      val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      bitmap.eraseColor(Color.WHITE)
      page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
      return bitmap
    }
  }

  private fun renderPdfFirstPage(uri: Uri): Bitmap {
    openPdfDescriptor(uri).use { descriptor ->
      PdfRenderer(descriptor).use { renderer ->
        if (renderer.pageCount <= 0) {
          throw IllegalStateException("The selected PDF has no pages.")
        }
        return renderPdfPage(renderer, 0)
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

  private fun openInput(uri: Uri): InputStream =
    if (uri.scheme == "file" && !uri.path.isNullOrBlank()) {
      File(uri.path!!).inputStream()
    } else {
      reactContext.contentResolver.openInputStream(uri)
        ?: throw IllegalStateException("Could not open the selected file.")
    }

  /**
   * Reads a PDF's own text layer as positioned words (exact, no OCR).
   * Resolves null when the file is not a PDF; an image-only PDF resolves
   * with no words so the caller falls back to OCR.
   */
  @ReactMethod
  fun extractPdfWords(uriString: String, promise: Promise) {
    val uri = Uri.parse(uriString)
    if (!isPdfUri(uri, uriString)) {
      promise.resolve(null)
      return
    }
    Thread {
      try {
        CorPdfTextExtractor.ensureInit(reactContext)
        val result = openInput(uri).use { CorPdfTextExtractor.extract(it) }
        val map = Arguments.createMap()
        map.putString("source", "pdf")
        map.putDouble("pageWidth", result.pageWidth.toDouble())
        map.putDouble("pageHeight", result.pageHeight.toDouble())
        map.putInt("pageCount", result.pageCount)
        map.putString("producer", result.producer)
        map.putString("creator", result.creator)
        val words = Arguments.createArray()
        for (word in result.words) {
          val w = Arguments.createMap()
          w.putString("t", word.text)
          w.putDouble("x0", word.x0.toDouble())
          w.putDouble("y0", word.y0.toDouble())
          w.putDouble("x1", word.x1.toDouble())
          w.putDouble("y1", word.y1.toDouble())
          w.putDouble("s", word.size.toDouble())
          words.pushMap(w)
        }
        map.putArray("words", words)
        promise.resolve(map)
      } catch (e: Throwable) {
        promise.reject("PDF_TEXT_FAILED", e.message ?: "Could not read the PDF text.", e)
      }
    }.start()
  }

  private fun normalizePdfPageText(rawText: String): String =
    rawText
      .replace("\r\n", "\n")
      .replace(Regex("-[ \\t]*\\n[ \\t]*"), "")
      .replace(Regex("[ \\t]+"), " ")
      .replace(Regex("\\n{3,}"), "\n\n")
      .trim()

  /**
   * Reads up to [maxPages] pages of a PDF in spatial reading order using PDFBox,
   * automatically falling back to on-device ML Kit OCR on scanned/image-only pages.
   */
  @ReactMethod
  fun extractDocumentText(uriString: String, maxPages: Int, promise: Promise) {
    val uri = Uri.parse(uriString)
    Thread {
      var pfd: ParcelFileDescriptor? = null
      var renderer: PdfRenderer? = null
      var recognizer: TextRecognizer? = null
      try {
        if (!isPdfUri(uri, uriString)) {
          promise.reject("NOT_A_PDF", "The selected file is not a valid PDF document.")
          return@Thread
        }
        CorPdfTextExtractor.ensureInit(reactContext)
        val limitPages = maxPages.coerceIn(1, 20)
        val pageTexts = mutableListOf<String>()
        var pageCount = 0
        var pagesRead = 0
        var ocrPages = 0

        openInput(uri).use { stream ->
          PDDocument.load(stream, MemoryUsageSetting.setupTempFileOnly()).use { document ->
            pageCount = document.numberOfPages
            if (pageCount <= 0) {
              val emptyMap = Arguments.createMap()
              emptyMap.putString("text", "")
              emptyMap.putInt("pageCount", 0)
              emptyMap.putInt("pagesRead", 0)
              emptyMap.putInt("ocrPages", 0)
              promise.resolve(emptyMap)
              return@Thread
            }
            val toRead = minOf(pageCount, limitPages)
            pagesRead = toRead
            val stripper = PDFTextStripper().apply {
              sortByPosition = true
            }
            for (pageNum in 1..toRead) {
              stripper.startPage = pageNum
              stripper.endPage = pageNum
              val rawText = try {
                stripper.getText(document) ?: ""
              } catch (_: Throwable) {
                ""
              }
              val normalized = normalizePdfPageText(rawText)
              if (normalized.length >= 20) {
                pageTexts.add(normalized)
                continue
              }
              // Scanned / image-only page: fall back to ML Kit OCR
              try {
                if (renderer == null) {
                  pfd = openPdfDescriptor(uri)
                  renderer = PdfRenderer(pfd!!)
                }
                if (recognizer == null) {
                  recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
                }
                if (pageNum - 1 < (renderer?.pageCount ?: 0)) {
                  val bitmap = renderPdfPage(renderer!!, pageNum - 1, 2200f)
                  try {
                    val image = InputImage.fromBitmap(bitmap, 0)
                    val visionText = Tasks.await(recognizer!!.process(image))
                    val ocrText = buildCoordinateSortedText(visionText).trim()
                    if (ocrText.isNotEmpty()) {
                      pageTexts.add(ocrText)
                      ocrPages += 1
                    } else if (normalized.isNotEmpty()) {
                      pageTexts.add(normalized)
                    }
                  } finally {
                    bitmap.recycle()
                  }
                } else if (normalized.isNotEmpty()) {
                  pageTexts.add(normalized)
                }
              } catch (_: Throwable) {
                if (normalized.isNotEmpty()) {
                  pageTexts.add(normalized)
                }
              }
            }
          }
        }

        val result = Arguments.createMap()
        result.putString("text", pageTexts.joinToString("\n\n"))
        result.putInt("pageCount", pageCount)
        result.putInt("pagesRead", pagesRead)
        result.putInt("ocrPages", ocrPages)
        promise.resolve(result)
      } catch (e: Throwable) {
        promise.reject("PDF_DOCUMENT_FAILED", e.message ?: "Could not read the PDF document.", e)
      } finally {
        try { recognizer?.close() } catch (_: Throwable) {}
        try { renderer?.close() } catch (_: Throwable) {}
        try { pfd?.close() } catch (_: Throwable) {}
      }
    }.start()
  }

  /**
   * Extracts a batch of PDF pages (`startPage..endPage`, 1-based) with per-page text and OCR flags,
   * allowing JS callers to display progress and cancel between batches up to [maxPages] (max 100).
   */
  @ReactMethod
  fun extractDocumentPages(
    uriString: String,
    startPage: Int,
    batchSize: Int,
    maxPages: Int,
    promise: Promise
  ) {
    val uri = Uri.parse(uriString)
    Thread {
      var pfd: ParcelFileDescriptor? = null
      var renderer: PdfRenderer? = null
      var recognizer: TextRecognizer? = null
      try {
        if (!isPdfUri(uri, uriString)) {
          promise.reject("NOT_A_PDF", "The selected file is not a valid PDF document.")
          return@Thread
        }
        CorPdfTextExtractor.ensureInit(reactContext)
        val safeMaxPages = maxPages.coerceIn(1, MAX_MATERIAL_PDF_PAGES)
        val safeBatch = batchSize.coerceIn(1, 20)
        val safeStart = startPage.coerceAtLeast(1)
        val pagesArray: WritableArray = Arguments.createArray()
        var pageCount = 0
        var pagesRead = 0
        var endPage = 0
        var ocrPages = 0
        var hasMore = false

        openPdfFile@ run {
          val pdfFile = getOrCopyPdfCache(uri, uriString, safeStart == 1)
          PDDocument.load(pdfFile, MemoryUsageSetting.setupTempFileOnly()).use { document ->
            pageCount = document.numberOfPages
            val totalCap = minOf(pageCount, safeMaxPages)
            if (pageCount <= 0 || safeStart > totalCap) {
              val emptyMap = Arguments.createMap()
              emptyMap.putInt("pageCount", pageCount)
              emptyMap.putInt("pagesRead", minOf(totalCap, safeStart - 1).coerceAtLeast(0))
              emptyMap.putInt("startPage", safeStart)
              emptyMap.putInt("endPage", minOf(totalCap, safeStart - 1).coerceAtLeast(0))
              emptyMap.putInt("nextStartPage", safeStart)
              emptyMap.putBoolean("hasMore", false)
              emptyMap.putInt("ocrPages", 0)
              emptyMap.putArray("pages", pagesArray)
              synchronized(pdfCacheLock) { clearPdfCacheLocked(uriString) }
              promise.resolve(emptyMap)
              return@Thread
            }
            endPage = minOf(totalCap, safeStart + safeBatch - 1)
            pagesRead = endPage
            hasMore = endPage < totalCap
            val stripper = PDFTextStripper().apply {
              sortByPosition = true
            }
            for (pageNum in safeStart..endPage) {
              stripper.startPage = pageNum
              stripper.endPage = pageNum
              val rawText = try {
                stripper.getText(document) ?: ""
              } catch (_: Throwable) {
                ""
              }
              val normalized = normalizePdfPageText(rawText)
              var finalPageText = normalized
              var usedOcr = false
              if (normalized.length < 20) {
                try {
                  if (renderer == null) {
                    pfd = ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY)
                    renderer = PdfRenderer(pfd!!)
                  }
                  if (recognizer == null) {
                    recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
                  }
                  if (pageNum - 1 < (renderer?.pageCount ?: 0)) {
                    val bitmap = renderPdfPage(renderer!!, pageNum - 1, 2100f)
                    try {
                      val image = InputImage.fromBitmap(bitmap, 0)
                      val visionText = Tasks.await(recognizer!!.process(image))
                      val ocrText = buildCoordinateSortedText(visionText).trim()
                      if (ocrText.isNotEmpty()) {
                        finalPageText = ocrText
                        usedOcr = true
                        ocrPages += 1
                      }
                    } finally {
                      bitmap.recycle()
                    }
                  }
                } catch (_: Throwable) {
                  // Retain any partial text-layer string if OCR fails on this page.
                }
              }
              val pageMap = Arguments.createMap()
              pageMap.putInt("pageNumber", pageNum)
              pageMap.putString("text", finalPageText)
              pageMap.putBoolean("usedOcr", usedOcr)
              pagesArray.pushMap(pageMap)
            }
          }
        }

        if (!hasMore) {
          synchronized(pdfCacheLock) { clearPdfCacheLocked(uriString) }
        }

        val result = Arguments.createMap()
        result.putInt("pageCount", pageCount)
        result.putInt("pagesRead", pagesRead)
        result.putInt("startPage", safeStart)
        result.putInt("endPage", endPage)
        result.putInt("nextStartPage", endPage + 1)
        result.putBoolean("hasMore", hasMore)
        result.putInt("ocrPages", ocrPages)
        result.putArray("pages", pagesArray)
        promise.resolve(result)
      } catch (e: Throwable) {
        synchronized(pdfCacheLock) { clearPdfCacheLocked(uriString) }
        val msg = e.message ?: "Could not read the PDF document."
        if (msg == "PDF_TOO_LARGE") {
          promise.reject("PDF_TOO_LARGE", "Choose a file smaller than 15 MB.", e)
        } else if (msg.contains("password", ignoreCase = true) || msg.contains("encrypted", ignoreCase = true)) {
          promise.reject("PDF_ENCRYPTED", "This PDF is password-protected. Remove the password and try again.", e)
        } else {
          promise.reject("PDF_DOCUMENT_FAILED", msg, e)
        }
      } finally {
        try { recognizer?.close() } catch (_: Throwable) {}
        try { renderer?.close() } catch (_: Throwable) {}
        try { pfd?.close() } catch (_: Throwable) {}
      }
    }.start()
  }

  private fun readBoundedStream(
    input: InputStream,
    maxBytes: Int,
    overflowCode: String = "FILE_TOO_LARGE"
  ): ByteArray {
    val out = ByteArrayOutputStream()
    val buf = ByteArray(16 * 1024)
    var total = 0
    while (true) {
      val read = input.read(buf)
      if (read <= 0) break
      total += read
      if (total > maxBytes) {
        throw IllegalStateException(overflowCode)
      }
      out.write(buf, 0, read)
    }
    return out.toByteArray()
  }

  private fun normalizeZipTarget(baseDir: String, rawTarget: String): String {
    val combined = if (rawTarget.startsWith("/")) {
      rawTarget.removePrefix("/")
    } else {
      "$baseDir$rawTarget"
    }
    val parts = mutableListOf<String>()
    for (segment in combined.split('/')) {
      when {
        segment.isEmpty() || segment == "." -> {}
        segment == ".." -> if (parts.isNotEmpty()) parts.removeAt(parts.size - 1)
        else -> parts.add(segment)
      }
    }
    return parts.joinToString("/")
  }

  private fun parseRelsMap(xmlBytes: ByteArray, baseDir: String): Map<String, String> {
    val map = mutableMapOf<String, String>()
    try {
      val parser = Xml.newPullParser()
      parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
      parser.setInput(ByteArrayInputStream(xmlBytes), "UTF-8")
      var event = parser.eventType
      while (event != XmlPullParser.END_DOCUMENT) {
        if (event == XmlPullParser.START_TAG && parser.name == "Relationship") {
          val id = parser.getAttributeValue(null, "Id")
          val target = parser.getAttributeValue(null, "Target")
          if (!id.isNullOrBlank() && !target.isNullOrBlank()) {
            map[id] = normalizeZipTarget(baseDir, target)
          }
        }
        event = parser.next()
      }
    } catch (_: Throwable) {
      // Ignore malformed .rels and fall back cleanly
    }
    return map
  }

  private fun parsePresentationSlideRids(xmlBytes: ByteArray): List<String> {
    val rids = mutableListOf<String>()
    try {
      val parser = Xml.newPullParser()
      parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
      parser.setInput(ByteArrayInputStream(xmlBytes), "UTF-8")
      var event = parser.eventType
      while (event != XmlPullParser.END_DOCUMENT) {
        if (event == XmlPullParser.START_TAG && parser.name == "sldId") {
          var rid: String? = null
          for (i in 0 until parser.attributeCount) {
            val attrName = parser.getAttributeName(i)
            val attrNs = parser.getAttributeNamespace(i) ?: ""
            if (attrName == "id" && (attrNs.contains("relationships") || parser.getAttributePrefix(i) == "r")) {
              rid = parser.getAttributeValue(i)
              break
            }
          }
          if (rid == null) {
            rid = parser.getAttributeValue(null, "r:id")
          }
          if (!rid.isNullOrBlank()) {
            rids.add(rid)
          }
        }
        event = parser.next()
      }
    } catch (_: Throwable) {
      // Ignore malformed presentation.xml and fall back cleanly
    }
    return rids
  }

  private fun splitLongDocxText(text: String, targetChars: Int = 3000): List<String> {
    if (text.length <= targetChars) return listOf(text)
    val paragraphs = text.split(Regex("\\n{2,}"))
    val sections = mutableListOf<String>()
    val current = StringBuilder()
    for (para in paragraphs) {
      val trimmed = para.trim()
      if (trimmed.isEmpty()) continue
      if (current.isNotEmpty() && current.length + trimmed.length + 2 > targetChars) {
        sections.add(current.toString().trim())
        current.clear()
      }
      if (trimmed.length > targetChars && current.isEmpty()) {
        var idx = 0
        while (idx < trimmed.length) {
          val end = minOf(trimmed.length, idx + targetChars)
          sections.add(trimmed.substring(idx, end).trim())
          idx = end
        }
      } else {
        if (current.isNotEmpty()) current.append("\n\n")
        current.append(trimmed)
      }
    }
    if (current.isNotEmpty()) sections.add(current.toString().trim())
    return if (sections.isEmpty()) listOf(text) else sections
  }

  private fun parseDocxPages(xmlBytes: ByteArray): List<String> {
    val parser = Xml.newPullParser()
    parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
    parser.setInput(ByteArrayInputStream(xmlBytes), "UTF-8")

    val pages = mutableListOf<String>()
    val pageBuf = StringBuilder()
    val paraBuf = StringBuilder()
    var paragraphDepth = 0
    var inText = false
    var totalChars = 0

    fun flushParagraph() {
      val para = paraBuf.toString().trim()
      paraBuf.clear()
      if (para.isNotEmpty()) {
        if (pageBuf.isNotEmpty()) pageBuf.append("\n\n")
        pageBuf.append(para)
      }
    }

    fun flushPage() {
      flushParagraph()
      val content = pageBuf.toString().trim()
      pageBuf.clear()
      if (content.isNotEmpty()) pages.add(content)
    }

    var event = parser.eventType
    while (event != XmlPullParser.END_DOCUMENT && totalChars < MAX_OFFICE_EXTRACTED_CHARS) {
      when (event) {
        XmlPullParser.START_TAG -> {
          val name = parser.name
          when (name) {
            "p" -> {
              if (paragraphDepth > 0) flushParagraph()
              paragraphDepth += 1
            }
            "t" -> if (paragraphDepth > 0) inText = true
            "tab" -> if (paragraphDepth > 0) paraBuf.append(' ')
            "cr" -> if (paragraphDepth > 0) paraBuf.append('\n')
            "br" -> {
              val brType = parser.getAttributeValue(null, "type")
                ?: parser.getAttributeValue(WORD_MAIN_NS, "type")
              if ("page".equals(brType, ignoreCase = true)) {
                flushPage()
              } else if (paragraphDepth > 0) {
                paraBuf.append('\n')
              }
            }
            "lastRenderedPageBreak" -> {
              if (pageBuf.isNotEmpty() || paraBuf.isNotEmpty()) {
                flushPage()
              }
            }
          }
        }
        XmlPullParser.TEXT -> {
          if (inText && paragraphDepth > 0) {
            val txt = parser.text ?: ""
            val room = MAX_OFFICE_EXTRACTED_CHARS - totalChars
            if (room > 0) {
              val slice = if (txt.length > room) txt.substring(0, room) else txt
              paraBuf.append(slice)
              totalChars += slice.length
            }
          }
        }
        XmlPullParser.END_TAG -> {
          when (parser.name) {
            "t" -> inText = false
            "p" -> {
              flushParagraph()
              if (paragraphDepth > 0) paragraphDepth -= 1
              inText = false
            }
          }
        }
      }
      event = parser.next()
    }
    flushPage()

    if (pages.size == 1 && pages[0].length > 3000) {
      return splitLongDocxText(pages[0], 3000)
    }
    return pages
  }

  private fun parsePptxSlide(xmlBytes: ByteArray, remainingBudget: Int): String {
    val parser = Xml.newPullParser()
    parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
    parser.setInput(ByteArrayInputStream(xmlBytes), "UTF-8")

    val slideBuf = StringBuilder()
    val paraBuf = StringBuilder()
    var inText = false
    var used = 0

    var event = parser.eventType
    while (event != XmlPullParser.END_DOCUMENT && used < remainingBudget) {
      when (event) {
        XmlPullParser.START_TAG -> {
          when (parser.name) {
            "p" -> paraBuf.clear()
            "t" -> inText = true
            "br" -> paraBuf.append('\n')
            "tab" -> paraBuf.append(' ')
          }
        }
        XmlPullParser.TEXT -> {
          if (inText) {
            val txt = parser.text ?: ""
            val room = remainingBudget - used
            if (room > 0) {
              val slice = if (txt.length > room) txt.substring(0, room) else txt
              paraBuf.append(slice)
              used += slice.length
            }
          }
        }
        XmlPullParser.END_TAG -> {
          when (parser.name) {
            "t" -> inText = false
            "p" -> {
              val line = paraBuf.toString().trim()
              paraBuf.clear()
              if (line.isNotEmpty()) {
                if (slideBuf.isNotEmpty()) slideBuf.append('\n')
                slideBuf.append(line)
              }
            }
          }
        }
      }
      event = parser.next()
    }
    return slideBuf.toString().trim()
  }

  /**
   * Reads a Word (.docx) or PowerPoint (.pptx) document on-device via Android's built-in
   * ZIP/XML parsers, returning page/slide entries without external dependencies.
   */
  @ReactMethod
  fun extractOfficeDocumentPages(uriString: String, fileName: String, promise: Promise) {
    val uri = Uri.parse(uriString)
    Thread {
      try {
        val bytes = openInput(uri).use { readBoundedStream(it, MAX_OFFICE_BYTES) }
        if (bytes.isEmpty()) {
          promise.reject("OFFICE_EMPTY", "The selected file is empty.")
          return@Thread
        }
        val isZip = bytes.size >= 4 && bytes[0] == 'P'.code.toByte() && bytes[1] == 'K'.code.toByte()
        if (!isZip) {
          val lower = fileName.lowercase()
          val isOleLegacy = bytes.size >= 4 &&
            bytes[0] == 0xD0.toByte() &&
            bytes[1] == 0xCF.toByte() &&
            bytes[2] == 0x11.toByte() &&
            bytes[3] == 0xE0.toByte()
          if (isOleLegacy || lower.endsWith(".doc") || lower.endsWith(".ppt")) {
            promise.reject(
              "OFFICE_LEGACY_FORMAT",
              "Older .doc or .ppt files are not supported. Save the file as .docx, .pptx, or PDF and try again."
            )
          } else {
            promise.reject(
              "OFFICE_UNREADABLE",
              "This file is not a valid Word (.docx) or PowerPoint (.pptx) document."
            )
          }
          return@Thread
        }

        var wordBody: ByteArray? = null
        var presentationXml: ByteArray? = null
        var presentationRelsXml: ByteArray? = null
        val slideXmlByPath = mutableMapOf<String, ByteArray>()
        val slideRelsXmlByPath = mutableMapOf<String, ByteArray>()
        val notesXmlByPath = mutableMapOf<String, ByteArray>()
        val slidePattern = Regex("^ppt/slides/slide(\\d+)\\.xml$")
        val slideRelsPattern = Regex("^ppt/slides/_rels/(slide\\d+\\.xml)\\.rels$")
        val notesPattern = Regex("^ppt/notesSlides/notesSlide(\\d+)\\.xml$")
        var entryCount = 0
        var totalUncompressedBytes = 0L

        fun readZipEntryBounded(zip: ZipInputStream): ByteArray {
          val remaining = (MAX_TOTAL_UNCOMPRESSED_BYTES - totalUncompressedBytes)
            .coerceAtMost(MAX_ENTRY_UNCOMPRESSED_BYTES.toLong())
            .toInt()
          if (remaining <= 0) throw IllegalStateException("ZIP_TOO_LARGE")
          val data = readBoundedStream(zip, remaining, "ZIP_TOO_LARGE")
          totalUncompressedBytes += data.size
          return data
        }

        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
          while (true) {
            val entry = zip.nextEntry ?: break
            entryCount += 1
            if (entryCount > MAX_ZIP_ENTRIES) {
              promise.reject("OFFICE_UNREADABLE", "This Office document contains too many internal entries.")
              return@Thread
            }
            if (!entry.isDirectory) {
              when (val entryName = entry.name) {
                "word/document.xml" -> wordBody = readZipEntryBounded(zip)
                "ppt/presentation.xml" -> presentationXml = readZipEntryBounded(zip)
                "ppt/_rels/presentation.xml.rels" -> presentationRelsXml = readZipEntryBounded(zip)
                else -> when {
                  slidePattern.matches(entryName) -> slideXmlByPath[entryName] = readZipEntryBounded(zip)
                  slideRelsPattern.matches(entryName) -> {
                    val m = slideRelsPattern.matchEntire(entryName)!!
                    slideRelsXmlByPath["ppt/slides/${m.groupValues[1]}"] = readZipEntryBounded(zip)
                  }
                  notesPattern.matches(entryName) -> notesXmlByPath[entryName] = readZipEntryBounded(zip)
                }
              }
            }
            zip.closeEntry()
          }
        }

        val pagesArray: WritableArray = Arguments.createArray()
        val kind: String
        var pageCount = 0

        if (wordBody != null) {
          kind = "docx"
          val parsedPages = parseDocxPages(wordBody!!)
          if (parsedPages.isEmpty()) {
            promise.reject("OFFICE_EMPTY", "No readable text was found in that Word file.")
            return@Thread
          }
          pageCount = parsedPages.size
          parsedPages.forEachIndexed { idx, txt ->
            val map = Arguments.createMap()
            map.putInt("pageNumber", idx + 1)
            map.putString("text", txt)
            map.putBoolean("usedOcr", false)
            pagesArray.pushMap(map)
          }
        } else if (slideXmlByPath.isNotEmpty()) {
          kind = "pptx"
          val orderedPaths = mutableListOf<String>()
          if (presentationXml != null && presentationRelsXml != null) {
            val rels = parseRelsMap(presentationRelsXml!!, "ppt/")
            for (rid in parsePresentationSlideRids(presentationXml!!)) {
              val target = rels[rid]
              if (target != null && slideXmlByPath.containsKey(target) && !orderedPaths.contains(target)) {
                orderedPaths.add(target)
              }
            }
          }
          val remainingFallback = slideXmlByPath.keys
            .filter { !orderedPaths.contains(it) }
            .sortedBy { slidePattern.matchEntire(it)?.groupValues?.get(1)?.toIntOrNull() ?: Int.MAX_VALUE }
          orderedPaths.addAll(remainingFallback)

          pageCount = orderedPaths.size
          var remainingBudget = MAX_OFFICE_EXTRACTED_CHARS
          orderedPaths.forEachIndexed { idx, slidePath ->
            if (remainingBudget <= 0) return@forEachIndexed
            val visualSlideNum = idx + 1
            val xmlBytes = slideXmlByPath[slidePath] ?: return@forEachIndexed
            val slideText = parsePptxSlide(xmlBytes, remainingBudget)
            val sb = StringBuilder(slideText)
            remainingBudget -= slideText.length

            val relsBytes = slideRelsXmlByPath[slidePath]
            if (relsBytes != null && remainingBudget > 0) {
              val slideRels = parseRelsMap(relsBytes, "ppt/slides/")
              for (target in slideRels.values) {
                if (notesPattern.matches(target) && remainingBudget > 0) {
                  val notesBytes = notesXmlByPath[target] ?: continue
                  val notesText = parsePptxSlide(notesBytes, remainingBudget)
                  if (notesText.isNotEmpty() && notesText != visualSlideNum.toString()) {
                    remainingBudget -= notesText.length
                    if (sb.isNotEmpty()) sb.append("\nSpeaker notes:\n")
                    sb.append(notesText)
                  }
                }
              }
            }

            val combinedText = sb.toString().trim()
            if (combinedText.isNotEmpty()) {
              val map = Arguments.createMap()
              map.putInt("pageNumber", visualSlideNum)
              map.putString("text", combinedText)
              map.putBoolean("usedOcr", false)
              pagesArray.pushMap(map)
            }
          }
          if (pagesArray.size() == 0) {
            promise.reject(
              "OFFICE_EMPTY",
              "No readable text was found in that PowerPoint file. Slides made only of images cannot be read."
            )
            return@Thread
          }
        } else {
          promise.reject(
            "OFFICE_UNREADABLE",
            "This file does not contain a readable Word document or PowerPoint slides."
          )
          return@Thread
        }

        val result = Arguments.createMap()
        result.putString("kind", kind)
        result.putInt("pageCount", pageCount)
        result.putInt("pagesRead", pagesArray.size())
        result.putInt("ocrPages", 0)
        result.putArray("pages", pagesArray)
        promise.resolve(result)
      } catch (e: Throwable) {
        val msg = e.message ?: ""
        when (msg) {
          "FILE_TOO_LARGE" -> promise.reject("OFFICE_TOO_LARGE", "Choose a file smaller than 15 MB.", e)
          "ZIP_TOO_LARGE" -> promise.reject("OFFICE_UNREADABLE", "This Office document is too large to process safely.", e)
          else -> promise.reject(
            "OFFICE_UNREADABLE",
            "Could not read that Office file. If it is password-protected or damaged, export it as PDF and try again.",
            e
          )
        }
      }
    }.start()
  }

  /**
   * Small screenshots (e.g. a ~800 px wide COR) put the smallest COR text at a
   * few pixels tall, below what OCR reads reliably. They are enlarged first.
   * Large photos keep the original path (which also honors EXIF rotation).
   */
  private fun loadImageForOcr(uri: Uri): Pair<InputImage, IntArray> {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    openInput(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    val width = bounds.outWidth
    val height = bounds.outHeight
    if (width in 1 until OCR_MIN_WIDTH && height > 0) {
      val decoded = openInput(uri).use { BitmapFactory.decodeStream(it) }
        ?: throw IllegalStateException("Could not decode the image.")
      val factor = OCR_TARGET_WIDTH.toFloat() / decoded.width
      val scaled = Bitmap.createScaledBitmap(
        decoded,
        OCR_TARGET_WIDTH,
        (decoded.height * factor).toInt().coerceAtLeast(1),
        true
      )
      return Pair(InputImage.fromBitmap(scaled, 0), intArrayOf(scaled.width, scaled.height))
    }
    val image = InputImage.fromFilePath(reactContext, uri)
    return Pair(image, intArrayOf(image.width, image.height))
  }

  @ReactMethod
  fun recognizeText(uriString: String, promise: Promise) {
    try {
      val uri = Uri.parse(uriString)
      val (image, size) = if (isPdfUri(uri, uriString)) {
        val pdfBitmap = renderPdfFirstPage(uri)
        Pair(InputImage.fromBitmap(pdfBitmap, 0), intArrayOf(pdfBitmap.width, pdfBitmap.height))
      } else {
        loadImageForOcr(uri)
      }
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

      recognizer.process(image)
        .addOnSuccessListener { visionText ->
          val structuredText = buildCoordinateSortedText(visionText)
          val result: WritableMap = Arguments.createMap()
          result.putString("text", visionText.text)
          result.putString("structuredText", structuredText)
          result.putInt("blockCount", visionText.textBlocks.size)
          result.putInt("imageWidth", size[0])
          result.putInt("imageHeight", size[1])
          val words = Arguments.createArray()
          for (block in visionText.textBlocks) {
            for (line in block.lines) {
              for (element in line.elements) {
                val box = element.boundingBox ?: continue
                val text = element.text.trim()
                if (text.isEmpty()) continue
                val w = Arguments.createMap()
                w.putString("t", text)
                w.putDouble("x0", box.left.toDouble())
                w.putDouble("y0", box.top.toDouble())
                w.putDouble("x1", box.right.toDouble())
                w.putDouble("y1", box.bottom.toDouble())
                words.pushMap(w)
              }
            }
          }
          result.putArray("words", words)
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
    /** Images narrower than this are enlarged before OCR. */
    private const val OCR_MIN_WIDTH = 1600
    private const val OCR_TARGET_WIDTH = 2400
    private const val MAX_MATERIAL_PDF_PAGES = 100
    private const val MAX_MATERIAL_PDF_BYTES = 15 * 1024 * 1024L
    private const val MAX_OFFICE_BYTES = 15 * 1024 * 1024
    private const val MAX_ZIP_ENTRIES = 500
    private const val MAX_ENTRY_UNCOMPRESSED_BYTES = 20_000_000
    private const val MAX_TOTAL_UNCOMPRESSED_BYTES = 35_000_000L
    private const val MAX_OFFICE_EXTRACTED_CHARS = 400_000
    private const val WORD_MAIN_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  }
}
