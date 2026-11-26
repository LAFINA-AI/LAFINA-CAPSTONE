package com.lafina.capstone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class Cycle1NativeAuditTest {

  @get:Rule
  val tempFolder = TemporaryFolder()

  @Test
  fun `sanitizeMeetingId rejects traversal and accepts safe identifiers`() {
    assertEquals("meeting_12345", LafinaMeetingService.sanitizeMeetingId("meeting_12345"))
    assertEquals("mtg-abc_1", LafinaMeetingService.sanitizeMeetingId("  mtg-abc_1  "))
    assertNull(LafinaMeetingService.sanitizeMeetingId(null))
    assertNull(LafinaMeetingService.sanitizeMeetingId(""))
    assertNull(LafinaMeetingService.sanitizeMeetingId("   "))
    assertNull(LafinaMeetingService.sanitizeMeetingId("."))
    assertNull(LafinaMeetingService.sanitizeMeetingId(".."))
    assertNull(LafinaMeetingService.sanitizeMeetingId("../escape"))
    assertNull(LafinaMeetingService.sanitizeMeetingId("a/b"))
    assertNull(LafinaMeetingService.sanitizeMeetingId("a\\b"))
    assertNull(LafinaMeetingService.sanitizeMeetingId("bad\u0000id"))
  }

  @Test
  fun `resolveDocumentFile decodes percent-encoded file URIs and preserves plus signs`() {
    val root = tempFolder.newFolder("skills_documents")
    val userDir = File(root, "user-1").apply { mkdirs() }
    val doc = File(userDir, "CS 101+Notes.pdf").apply { writeText("PDF") }

    val encodedUri = "file://${userDir.absolutePath}/CS%20101+Notes.pdf"
    assertEquals(
      doc.canonicalFile,
      SkillsFileOpenPolicy.resolveDocumentFile(root, encodedUri),
    )
  }
}
