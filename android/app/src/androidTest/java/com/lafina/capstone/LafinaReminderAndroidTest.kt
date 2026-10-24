package com.lafina.capstone

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LafinaReminderAndroidTest {
  private val context: Context
    get() = InstrumentationRegistry.getInstrumentation().targetContext

  @Test
  fun systemServicesAreAvailable() {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
    val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
    assertNotNull("AlarmManager must be accessible in Android test environment", alarmManager)
    assertNotNull(
        "NotificationManager must be accessible in Android test environment", notificationManager)
  }

  @Test
  fun reminderReceiverActionContract() {
    assertEquals(
        "com.lafina.capstone.ACTION_TRIGGER_REMINDER",
        LafinaReminderModule.ACTION_TRIGGER_REMINDER)
    assertEquals("call", LafinaReminderModule.ACTION_CALL)
    assertEquals("answer", LafinaReminderModule.ACTION_ANSWER)
    assertEquals("decline", LafinaReminderModule.ACTION_DECLINE)

    val intent =
        Intent(context, LafinaReminderReceiver::class.java).apply {
          action = LafinaReminderModule.ACTION_TRIGGER_REMINDER
          putExtra("reminderId", "test-rem-id")
          putExtra("task", "Study Algorithm Design")
        }

    assertEquals("test-rem-id", intent.getStringExtra("reminderId"))
    assertEquals("Study Algorithm Design", intent.getStringExtra("task"))
    assertEquals(LafinaReminderModule.ACTION_TRIGGER_REMINDER, intent.action)
  }

  @Test
  fun receiversInstantiateCleanly() {
    val baseReceiver = LafinaReminderReceiver()
    val alarmReceiver = ReminderAlarmReceiver()
    val bootReceiver = ReminderBootReceiver()

    assertNotNull(baseReceiver)
    assertNotNull(alarmReceiver)
    assertNotNull(bootReceiver)
    assertTrue(alarmReceiver is LafinaReminderReceiver)
    assertTrue(bootReceiver is LafinaReminderReceiver)
  }
}
