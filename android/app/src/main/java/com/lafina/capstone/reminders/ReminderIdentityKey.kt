package com.lafina.capstone.reminders

import java.net.URLEncoder

/** Lossless stable platform identity, independently testable without Android stubs. */
object ReminderIdentityKey {
  fun value(packageName: String, identity: ReminderIdentity, kind: String): String {
    ReminderPolicy.validateIdentity(identity)
    require(kind in setOf("due", "timeout", "open", "ack", "snooze"))
    fun encode(value: String) = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
    return "lafina-reminder://$packageName/${encode(kind)}/${encode(identity.jobId)}/${encode(identity.occurrenceKey)}/${identity.generation}"
  }
}
