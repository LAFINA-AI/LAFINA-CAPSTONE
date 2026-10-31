package com.lafina.capstone.reminders

/** Reference identity ties a confirmation to this exact, still-pending review. */
data class ReminderResponseReview internal constructor(val command: ReminderResponseCommand)

/** Foreground-only review ownership. Persistence must independently recheck the snapshot. */
class ReminderResponseSession(
  val record: ReminderRecord,
  nowUtc: String,
  elapsedRealtime: Long,
  maxWindowMillis: Long = ReminderPolicy.RING_SECONDS * 1000,
) {
  private val startedAt = elapsedRealtime
  private val deadline = try { record.ringingDeadline?.let(ReminderPolicy::instant) }
    catch (_: Exception) { null }
  private val windowMillis = try {
    if (deadline == null || !record.sourceValid || record.status != "RINGING" ||
      record.reminderStatus != "RINGING" || startedAt < 0) 0L
    else (deadline.toEpochMilli() - ReminderPolicy.instant(nowUtc).toEpochMilli())
      .coerceIn(0L, minOf(ReminderPolicy.RING_SECONDS * 1000, maxWindowMillis.coerceAtLeast(0)))
  } catch (_: Exception) { 0L }
  private var closed = false
  private var submitted = false
  private var pending: ReminderResponseReview? = null

  fun active(nowUtc: String, elapsedRealtime: Long): Boolean {
    if (closed || submitted) return false
    val valid = try {
      deadline != null && windowMillis > 0 && elapsedRealtime >= startedAt &&
        elapsedRealtime - startedAt < windowMillis && ReminderPolicy.instant(nowUtc) < deadline
    } catch (_: Exception) { false }
    // Once a clock/lifecycle check expires the view, a later clock rollback
    // cannot bring its previously offered confirmation back to life.
    if (!valid) close()
    return valid
  }

  fun prepare(command: ReminderResponseCommand, nowUtc: String, elapsedRealtime: Long): ReminderResponseReview? {
    pending = null
    if (!active(nowUtc, elapsedRealtime) || command.action !in listOf(ReminderAction.ACK, ReminderAction.SNOOZE) ||
      (command.action == ReminderAction.SNOOZE && command.minutes !in 1..120)) return null
    return ReminderResponseReview(command).also { pending = it }
  }

  fun consume(review: ReminderResponseReview, nowUtc: String, elapsedRealtime: Long): Boolean {
    if (pending !== review || !active(nowUtc, elapsedRealtime)) return false
    pending = null
    submitted = true
    return true
  }

  fun cancelReview() { pending = null }

  fun close() { closed = true; pending = null }
}
