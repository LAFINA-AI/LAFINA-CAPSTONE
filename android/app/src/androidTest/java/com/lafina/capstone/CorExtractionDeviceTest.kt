package com.lafina.capstone

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import android.util.Log
import java.io.File
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

private const val TAG = "CorExtractionTest"

/**
 * On-device COR extraction harness (local accuracy testing only).
 *
 * Push COR files to the app's external files dir under `cor/` first, e.g.
 *   adb push cor-sample/ustp-cor.pdf /sdcard/Android/data/<appId>/files/cor/
 * Each input is read with the app's real extractors (PDFBox text layer and
 * ML Kit OCR, same settings as LafinaVisionModule) and written next to it as
 * `<name>.words.device-<kind>.json`, the shape the JS layout reader takes.
 * Pull those files into cor-sample/ and run the Jest accuracy suite.
 * Skips when no inputs are present, so it is harmless in normal runs.
 */
@RunWith(AndroidJUnit4::class)
class CorExtractionDeviceTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext
  private val dir = File(context.getExternalFilesDir(null), "cor")

  private fun inputs(): List<File> =
    dir.listFiles()
      ?.filter { it.isFile && !it.name.endsWith(".json") && !it.name.endsWith(".log") }
      ?.sortedBy { it.name } ?: emptyList()

  private fun wordsJson(source: String, width: Double, height: Double, words: JSONArray, extra: JSONObject.() -> Unit = {}) =
    JSONObject().apply {
      put("source", source)
      put("pageWidth", width)
      put("pageHeight", height)
      put("words", words)
      extra()
    }

  private fun word(t: String, x0: Double, y0: Double, x1: Double, y1: Double) =
    JSONObject().apply {
      put("t", t); put("x0", x0); put("y0", y0); put("x1", x1); put("y1", y1)
    }

  private fun ocr(bitmap: Bitmap): JSONObject {
    progress("ocr start ${bitmap.width}x${bitmap.height}")
    val started = System.nanoTime()
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    val text = try {
      Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), 90, TimeUnit.SECONDS)
    } catch (e: TimeoutException) {
      Log.e(TAG, "OCR timed out after 90 s")
      return JSONObject().put("error", "ocr_timeout").put("width", bitmap.width).put("height", bitmap.height)
    }
    progress("ocr done in ${(System.nanoTime() - started) / 1_000_000} ms")
    val words = JSONArray()
    for (block in text.textBlocks) for (line in block.lines) for (el in line.elements) {
      val box = el.boundingBox ?: continue
      if (el.text.isBlank()) continue
      words.put(word(el.text.trim(), box.left.toDouble(), box.top.toDouble(), box.right.toDouble(), box.bottom.toDouble()))
    }
    return wordsJson("ocr", bitmap.width.toDouble(), bitmap.height.toDouble(), words)
  }

  /** Same rendering as LafinaVisionModule.renderPdfFirstPage. */
  private fun renderPdf(file: File): Bitmap =
    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { pfd ->
      PdfRenderer(pfd).use { renderer ->
        renderer.openPage(0).use { page ->
          val scale = (3100f / page.width.coerceAtLeast(1)).coerceIn(2.5f, 4.5f)
          val bmp = Bitmap.createBitmap((page.width * scale).toInt(), (page.height * scale).toInt(), Bitmap.Config.ARGB_8888)
          bmp.eraseColor(Color.WHITE)
          page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
          bmp
        }
      }
    }

  /** Same enlargement rule as LafinaVisionModule.loadImageForOcr. */
  private fun loadImage(file: File): Bitmap {
    val decoded = BitmapFactory.decodeFile(file.absolutePath)
    if (decoded.width >= 1600) return decoded
    val factor = 2400f / decoded.width
    return Bitmap.createScaledBitmap(decoded, 2400, (decoded.height * factor).toInt(), true)
  }

  private fun write(input: File, kind: String, json: JSONObject) {
    val base = input.name.substringBeforeLast('.')
    File(dir, "$base.words.device-$kind.json").writeText(json.toString(1))
  }

  /** Some phones (e.g. Transsion HiOS) drop app logcat output, so progress goes to a file. */
  private fun progress(message: String) {
    Log.i(TAG, message)
    File(dir, "progress.log").appendText("${System.currentTimeMillis()} $message\n")
  }

  @Test fun extractsPushedCorFiles() {
    val files = inputs()
    assumeTrue("No COR files pushed to ${dir.absolutePath}", files.isNotEmpty())
    File(dir, "progress.log").delete()
    val only = InstrumentationRegistry.getArguments().getString("only")
    progress("init start")
    CorPdfTextExtractor.ensureInit(context)
    progress("init done")
    for (file in files) {
      if (only != null && !file.name.contains(only)) continue
      progress("file ${file.name}")
      if (file.name.endsWith(".pdf", ignoreCase = true)) {
        val started = System.nanoTime()
        val result = file.inputStream().use { CorPdfTextExtractor.extract(it) }
        progress("pdf text done: ${result.words.size} words")
        val ms = (System.nanoTime() - started) / 1_000_000
        val words = JSONArray()
        for (w in result.words) {
          words.put(word(w.text, w.x0.toDouble(), w.y0.toDouble(), w.x1.toDouble(), w.y1.toDouble()).put("s", w.size.toDouble()))
        }
        write(file, "pdftext", wordsJson("pdf", result.pageWidth.toDouble(), result.pageHeight.toDouble(), words) {
          put("pageCount", result.pageCount)
          put("producer", result.producer)
          put("creator", result.creator)
          put("elapsedMs", ms)
        })
        progress("pdf text written ($ms ms)")
        if (InstrumentationRegistry.getArguments().getString("skipPdfOcr") != "true") {
          val rendered = renderPdf(file)
          progress("pdf rendered ${rendered.width}x${rendered.height}")
          write(file, "ocr-pdfrender", ocr(rendered))
          progress("pdf render ocr written")
        }
      } else {
        val image = loadImage(file)
        progress("image loaded ${image.width}x${image.height}")
        write(file, "ocr", ocr(image))
        progress("image ocr written")
      }
    }
    progress("all done")
  }
}
