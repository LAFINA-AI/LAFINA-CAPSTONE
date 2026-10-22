package com.lafina.capstone.reminders

/**
 * A persisted registration becomes reusable only after this native process has
 * completed reconciliation. A fresh process must rebuild because a stopped UID
 * can lose OS alarms while the derived database rows survive.
 */
class AlarmRegistrationPolicy {
  private var restored = false

  fun invalidate() { restored = false }
  fun completePass() { restored = true }

  fun canReuse(registration: AlarmRegistration?, record: ReminderRecord, precision: String): Boolean =
    restored && record.sourceValid && record.status == "PENDING" &&
      record.reminderStatus in setOf("SCHEDULED", "SNOOZED") && record.deliveryState == "REGISTERED" &&
      registration != null && registration.identity == record.identity &&
      registration.runAt == record.runAt && registration.precision == precision

  /** A receipt is written only after scheduling this generation's immutable ring deadline. */
  fun canReuseTimeout(record: ReminderRecord): Boolean =
    restored && record.sourceValid && record.status == "RINGING" && record.reminderStatus == "RINGING" &&
      record.ringingDeadline != null && record.notifiedAt != null
}
