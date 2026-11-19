package com.lafina.capstone

import android.content.Context
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition
import java.io.InputStream

/**
 * Reads the first page of a PDF's own text layer as positioned words.
 *
 * The USTP portal COR is a generated (not scanned) PDF, so its text layer is
 * exact. Reading it avoids OCR entirely. A scanned PDF has no text layer and
 * returns no words; the caller then falls back to OCR.
 */
object CorPdfTextExtractor {
  data class Result(
    val pageWidth: Float,
    val pageHeight: Float,
    val pageCount: Int,
    val producer: String,
    val creator: String,
    val words: List<CorPdfWords.Word>
  )

  @Volatile private var initialized = false

  fun ensureInit(context: Context) {
    if (!initialized) {
      synchronized(this) {
        if (!initialized) {
          PDFBoxResourceLoader.init(context.applicationContext)
          initialized = true
        }
      }
    }
  }

  private class GlyphCollector : PDFTextStripper() {
    val glyphs = mutableListOf<CorPdfWords.Glyph>()

    override fun processTextPosition(text: TextPosition) {
      val unicode = text.unicode ?: return
      glyphs.add(
        CorPdfWords.Glyph(
          text = unicode,
          x = text.xDirAdj,
          baseline = text.yDirAdj,
          width = text.widthDirAdj,
          fontSize = text.fontSizeInPt
        )
      )
    }
  }

  fun extract(input: InputStream): Result {
    PDDocument.load(input).use { document ->
      val pageCount = document.numberOfPages
      if (pageCount <= 0) {
        return Result(0f, 0f, 0, "", "", emptyList())
      }
      val page = document.getPage(0)
      val box = page.cropBox ?: page.mediaBox
      val collector = GlyphCollector()
      collector.startPage = 1
      collector.endPage = 1
      collector.getText(document)
      val info = document.documentInformation
      return Result(
        pageWidth = box.width,
        pageHeight = box.height,
        pageCount = pageCount,
        producer = info?.producer ?: "",
        creator = info?.creator ?: "",
        words = CorPdfWords.group(collector.glyphs)
      )
    }
  }
}
