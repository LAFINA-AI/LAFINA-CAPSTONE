package com.lafina.capstone

import org.junit.Assert.assertEquals
import org.junit.Test

class CorPdfWordsTest {
  private fun glyphs(text: String, x: Float, baseline: Float, size: Float = 8f, advance: Float = 4f) =
    text.mapIndexed { i, ch ->
      CorPdfWords.Glyph(ch.toString(), x + i * advance, baseline, advance, size)
    }

  @Test fun splitsOnSpacesAndKeepsWordBoxes() {
    val words = CorPdfWords.group(glyphs("IT Elective 3", 80f, 264f))
    assertEquals(listOf("IT", "Elective", "3"), words.map { it.text })
    assertEquals(80f, words[0].x0, 0.01f)
    assertEquals(88f, words[0].x1, 0.01f)
    assertEquals(264f - 8f * 0.75f, words[0].y0, 0.01f)
  }

  @Test fun separatesCellsDrawnApartOnTheSameBaseline() {
    // "IT414" (code column) and "IT4R11_Track2" (section column) are separate fields.
    val words = CorPdfWords.group(glyphs("IT414", 34f, 264f) + glyphs("IT4R11_Track2", 300f, 264f))
    assertEquals(listOf("IT414", "IT4R11_Track2"), words.map { it.text })
  }

  @Test fun splitsWhenTheBaselineChanges() {
    val words = CorPdfWords.group(glyphs("Loredel", 481f, 264f, 7f) + glyphs("Tamayo", 509f, 274f, 7f))
    assertEquals(listOf("Loredel", "Tamayo"), words.map { it.text })
  }

  @Test fun keepsGluedSourceTextTogether() {
    // The portal prints label and value as one string here.
    val words = CorPdfWords.group(glyphs("Nationality:Filipino", 110f, 195f))
    assertEquals(listOf("Nationality:Filipino"), words.map { it.text })
  }

  @Test fun splitsOnALargeGapWithoutASpaceGlyph() {
    val words = CorPdfWords.group(glyphs("2", 238f, 264f) + glyphs("1", 258f, 264f) + glyphs("3", 282f, 264f))
    assertEquals(listOf("2", "1", "3"), words.map { it.text })
  }
}
