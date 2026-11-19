package com.lafina.capstone

import kotlin.math.abs

/**
 * Groups PDF glyphs into positioned words for the COR layout reader.
 *
 * Pure (no Android or PDFBox types) so it is unit-tested on the JVM. Glyphs
 * arrive in content-stream order; a word ends at a space, a baseline change,
 * a gap wider than a fraction of the font size, or a jump backwards.
 * Coordinates are PDF points with y growing downward (top-left origin).
 */
object CorPdfWords {
  data class Glyph(
    val text: String,
    /** Left edge. */
    val x: Float,
    /** Baseline (top-left origin). */
    val baseline: Float,
    val width: Float,
    val fontSize: Float
  )

  data class Word(
    val text: String,
    val x0: Float,
    val y0: Float,
    val x1: Float,
    val y1: Float,
    val size: Float
  )

  /** Share of the font size above the baseline used for the word box. */
  private const val ASCENT = 0.75f

  fun group(glyphs: List<Glyph>): List<Word> {
    val words = mutableListOf<Word>()
    val text = StringBuilder()
    var x0 = 0f
    var x1 = 0f
    var baseline = 0f
    var size = 0f

    fun flush() {
      val clean = text.toString().trim()
      if (clean.isNotEmpty()) {
        words.add(
          Word(
            text = clean,
            x0 = x0,
            y0 = baseline - size * ASCENT,
            x1 = x1,
            y1 = baseline + size * (1f - ASCENT),
            size = size
          )
        )
      }
      text.setLength(0)
    }

    for (glyph in glyphs) {
      if (glyph.text.isBlank()) {
        flush()
        continue
      }
      if (text.isNotEmpty()) {
        val em = maxOf(size, glyph.fontSize, 1f)
        val sameLine = abs(glyph.baseline - baseline) <= em * 0.3f
        val gap = glyph.x - x1
        val joined = sameLine && gap <= em * 0.25f && gap >= -em * 0.5f
        if (!joined) flush()
      }
      if (text.isEmpty()) {
        x0 = glyph.x
        x1 = glyph.x + glyph.width
        baseline = glyph.baseline
        size = glyph.fontSize
      } else {
        x1 = maxOf(x1, glyph.x + glyph.width)
        size = maxOf(size, glyph.fontSize)
      }
      text.append(glyph.text)
    }
    flush()
    return words
  }
}
