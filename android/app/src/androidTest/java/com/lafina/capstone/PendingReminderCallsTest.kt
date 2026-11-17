package com.lafina.capstone

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PendingReminderCallsTest {
  @Test fun queueIsDurableAndSettlementCannotEraseAnotherCall() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val name = "call_fix_test_pending"
    val prefs = context.getSharedPreferences(name, Context.MODE_PRIVATE)
    prefs.edit().clear().commit()
    try {
      val store = PendingReminderCalls(context, name)
      fun row(id: String, generation: Int) = JSONObject().put("reminderId", id).put("ownerId", "test-owner")
        .put("generation", generation).put("action", "call").put("atMs", 10)
      store.put(row("A", 1)); store.put(row("B", 1)); store.put(row("A", 2))
      assertEquals(3, PendingReminderCalls(context, name).all().size)
      store.remove("test-owner", "A", 1)
      assertNotNull(store.get("test-owner", "B", 1))
      assertNotNull(store.get("test-owner", "A", 2))
      assertNull(store.get("test-owner", "A", 1))
    } finally { prefs.edit().clear().commit() }
  }
  @Test fun adoptsLegacySlotWithoutLosingSubsequentCalls() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val prefs = context.getSharedPreferences("call_fix_test_legacy", Context.MODE_PRIVATE)
    prefs.edit().clear().putString("reminder_id", "legacy-A").putString("owner_id", "test-owner").putLong("generation", 1).commit()
    try {
      val store = PendingReminderCalls(context, "call_fix_test_legacy")
      store.put(JSONObject().put("reminderId", "new-B").put("ownerId", "test-owner").put("generation", 1))
      assertEquals(2, store.all().size)
      assertNotNull(store.get("test-owner", "legacy-A", 1))
    } finally { prefs.edit().clear().commit() }
  }
}
