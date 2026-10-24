package com.lafina.capstone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LafinaReminderTest {

  @Test
  fun `reminder action constants follow exact contract`() {
    assertEquals("com.lafina.capstone.ACTION_TRIGGER_REMINDER", LafinaReminderModule.ACTION_TRIGGER_REMINDER)
    assertEquals("call", LafinaReminderModule.ACTION_CALL)
    assertEquals("answer", LafinaReminderModule.ACTION_ANSWER)
    assertEquals("decline", LafinaReminderModule.ACTION_DECLINE)
    assertEquals("LAFINA_NATIVE_CALL_TRIGGER", LafinaReminderModule.EVENT_CALL_TRIGGER)
  }

  @Test
  fun `receivers instantiate cleanly and implement broadcast receiver contract`() {
    val reminderReceiver = LafinaReminderReceiver()
    assertNotNull(reminderReceiver)

    val alarmReceiver = ReminderAlarmReceiver()
    assertNotNull(alarmReceiver)
    assertTrue(alarmReceiver is LafinaReminderReceiver)

    val bootReceiver = ReminderBootReceiver()
    assertNotNull(bootReceiver)
    assertTrue(bootReceiver is LafinaReminderReceiver)
  }

  @Test
  fun `reminder service actions follow exact contract`() {
    assertEquals("com.lafina.capstone.ACTION_START_ACTIVE_CALL", LafinaReminderService.ACTION_START_ACTIVE_CALL)
    assertEquals("extra_task", LafinaReminderService.EXTRA_TASK)
  }
}
