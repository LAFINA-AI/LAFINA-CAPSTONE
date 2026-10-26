package com.lafina.capstone.reminders

/** A UI ticket is distinct from the durable alarm generation: even the same alert can reopen. */
data class ReminderViewTicket internal constructor(val epoch: Long, val identity: ReminderIdentity?)

/** Rejects old load/action/timeout callbacks after a new intent or transition to answered UI. */
class ReminderPresentation {
  private var epoch = 0L
  private var identity: ReminderIdentity? = null

  fun replace(value: ReminderIdentity?): ReminderViewTicket {
    identity = value
    return invalidate()
  }

  fun invalidate(): ReminderViewTicket {
    epoch++
    return ticket()
  }

  fun ticket(): ReminderViewTicket = ReminderViewTicket(epoch, identity)
  fun accepts(value: ReminderViewTicket): Boolean = value == ticket()
}
