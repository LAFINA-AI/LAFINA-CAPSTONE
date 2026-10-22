package com.lafina.capstone.reminders

import android.os.Build
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/** Exercises actual Android Intent/PendingIntent identity; never touches planner data. */
class ReminderIntentsTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext

  @Test fun encodedIdentityRoundTripsAcrossRealAndroidUri() {
    val identity = ReminderIdentity("test/学 + ${UUID.randomUUID()}", "date/one|two + %", 7)
    val intent = ReminderIntents.intent(context, identity, ReminderIntents.DUE)
    assertEquals(identity, ReminderIntents.identity(context, intent))
    assertEquals(ReminderIntents.DUE, ReminderIntents.kind(intent))
    assertEquals(ReminderReceiver::class.java.name, intent.component?.className)
    assertEquals(context.packageName, intent.component?.packageName)
    assertEquals(null, ReminderIntents.identity(context, android.content.Intent().setData(android.net.Uri.parse("lafina-reminder://other/due/a/b/7"))))
  }

  @Test fun concurrentGenerationsCallbacksAndJobsUseDistinctPlatformPendingIntents() {
    val identity = ReminderIdentity("test:${UUID.randomUUID()}", "test|occurrence", 1)
    val due = ReminderIntents.pending(context, identity, ReminderIntents.DUE)
    val same = ReminderIntents.pending(context, identity, ReminderIntents.DUE)
    val timeout = ReminderIntents.pending(context, identity, ReminderIntents.TIMEOUT)
    val next = ReminderIntents.pending(context, identity.copy(generation = 2), ReminderIntents.DUE)
    val other = ReminderIntents.pending(context, identity.copy(jobId = identity.jobId + ":other"), ReminderIntents.DUE)
    try {
      assertEquals(due, same)
      assertNotEquals(due, timeout)
      assertNotEquals(due, next)
      assertNotEquals(due, other)
      if (Build.VERSION.SDK_INT >= 31) assertTrue(due.isImmutable)
    } finally {
      listOf(due, timeout, next, other).forEach { it.cancel() }
    }
  }
}
