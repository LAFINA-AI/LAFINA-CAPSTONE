package com.lafina.capstone

import android.content.ActivityNotFoundException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class LafinaSkillsFilesModuleTest {

  @get:Rule
  val tempFolder = TemporaryFolder()

  @Test
  fun `resolveDocumentFile accepts raw path and file URI inside skills_documents`() {
    val root = tempFolder.newFolder("skills_documents")
    val userDir = File(root, "user-1").apply { mkdirs() }
    val doc = File(userDir, "study_guide.pdf").apply { writeText("PDF") }

    assertEquals(
      doc.canonicalFile,
      SkillsFileOpenPolicy.resolveDocumentFile(root, doc.absolutePath),
    )
    assertEquals(
      doc.canonicalFile,
      SkillsFileOpenPolicy.resolveDocumentFile(root, "file://${doc.absolutePath}"),
    )
  }

  @Test
  fun `resolveDocumentFile rejects path traversal and external paths`() {
    val root = tempFolder.newFolder("skills_documents")
    val outside = tempFolder.newFile("secret.pdf")

    val traversal = assertThrows(SkillsFileInvalidException::class.java) {
      SkillsFileOpenPolicy.resolveDocumentFile(root, "${root.absolutePath}/../secret.pdf")
    }
    assertEquals(
      "SKILL_FILE_INVALID" to "That saved file is unavailable.",
      SkillsFileOpenPolicy.classifyOpenError(traversal),
    )

    assertThrows(SkillsFileInvalidException::class.java) {
      SkillsFileOpenPolicy.resolveDocumentFile(root, outside.absolutePath)
    }
  }

  @Test
  fun `resolveDocumentFile classifies missing file separately from missing viewer app`() {
    val root = tempFolder.newFolder("skills_documents")
    val missingPath = File(File(root, "user-1"), "deleted.pptx").absolutePath

    val missing = assertThrows(SkillsFileMissingException::class.java) {
      SkillsFileOpenPolicy.resolveDocumentFile(root, missingPath)
    }
    assertEquals(
      "SKILL_FILE_MISSING" to "This file is no longer on this phone. Generate it again.",
      SkillsFileOpenPolicy.classifyOpenError(missing),
    )

    assertEquals(
      "SKILL_NO_VIEWER" to "No app on this phone can open this file type. Use Share to send or save it.",
      SkillsFileOpenPolicy.classifyOpenError(ActivityNotFoundException("No viewer")),
    )

    assertEquals(
      "SKILL_FILE_OPEN" to "Could not open this file. Try using Share instead.",
      SkillsFileOpenPolicy.classifyOpenError(IllegalStateException("Unexpected")),
    )
  }
}
