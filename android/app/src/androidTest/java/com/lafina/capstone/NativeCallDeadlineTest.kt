package com.lafina.capstone

import android.app.PendingIntent
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Runs real bridge-side preferences and AlarmManager, exclusively with test-named storage/IDs. */
@RunWith(AndroidJUnit4::class)
class NativeCallDeadlineTest {
  @Test fun timeoutPersistsOnceAndSchedulesARetryWithoutJavascript() {
    val base = InstrumentationRegistry.getInstrumentation().targetContext
    val stores = mutableSetOf<String>()
    val context = object : ContextWrapper(base) {
      override fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
        val isolated = "call_fix_deadline_test_$name"
        stores.add(isolated)
        return base.getSharedPreferences(isolated, mode)
      }
    }
    val identity = DeliveryIdentity("test-owner", "call-fix-timeout-test", 7)
    val intent = Intent(context, LafinaReminderReceiver::class.java).apply {
      action = LafinaReminderModule.ACTION_CALL_DEADLINE
      data = Uri.parse(identity.uri("call") + "/deadline")
      putExtra("reminderId", identity.reminderId)
      putExtra("ownerId", identity.ownerId)
      putExtra("generation", identity.generation)
    }
    try {
      val pending = PendingReminderCalls(context)
      pending.put(JSONObject().put("ownerId", identity.ownerId).put("reminderId", identity.reminderId)
        .put("generation", identity.generation).put("action", "call").put("deadlineMs", System.currentTimeMillis() - 1))
      LafinaReminderModule.handleCallDeadline(context, intent)
      val expired = pending.get(identity.ownerId, identity.reminderId, identity.generation)!!
      assertEquals("timeout", expired.getString("action"))
      assertEquals(1, expired.getInt("timeoutCount"))
      assertTrue(expired.getLong("retryAtMs") > System.currentTimeMillis())
      assertNotNull(PendingIntent.getBroadcast(context, 7304, intent, PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE))
      // Redelivery of the timeout must neither double-snooze nor ring early.
      LafinaReminderModule.handleCallDeadline(context, intent)
      assertEquals(1, pending.get(identity.ownerId, identity.reminderId, identity.generation)!!.getInt("timeoutCount"))
    } finally {
      LafinaReminderModule.cancelScheduledAlarm(context, identity.reminderId, true)
      for (name in stores) base.getSharedPreferences(name, Context.MODE_PRIVATE).edit().clear().commit()
    }
  }
}
