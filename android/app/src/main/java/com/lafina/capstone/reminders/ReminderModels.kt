package com.lafina.capstone.reminders

data class ReminderIdentity(val jobId: String, val occurrenceKey: String, val generation: Int)

data class ReminderRecord(
  val identity: ReminderIdentity,
  val reminderId: String,
  val title: String,
  val timezone: String,
  val sourceId: String,
  val sourceKind: String,
  val sourceVersion: Int,
  val sourceValid: Boolean,
  val runAt: String,
  val status: String,
  val reminderStatus: String,
  val attemptCount: Int,
  val ringingDeadline: String?,
  val notifiedAt: String?,
  val deliveryState: String,
  val deliveryReason: String?,
)

data class NativeDeliverySettings(val enabled: Boolean = false, val fullScreen: Boolean = false)
data class AlarmRegistration(
  val identity: ReminderIdentity,
  val runAt: String,
  val precision: String,
  val scheduledAt: String,
)
enum class ClaimKind { RING, MISSED, QUIET, FUTURE, STALE, UNAVAILABLE }
enum class ReminderAction { ACK, SNOOZE, MISS, CANCEL }
data class ClaimResult(val kind: ClaimKind, val record: ReminderRecord?)
data class ActionResult(val applied: Boolean, val record: ReminderRecord?)
data class QuietHours(val timezone: String, val start: String, val end: String)
data class ReminderTimeDecision(val kind: ClaimKind, val nextAtUtc: String? = null)

/** Codes are safe to expose in diagnostics; SQLite error text can contain personal data. */
class RecoverableStoreException(val code: String, cause: Throwable? = null) :
  RuntimeException(code, cause)
