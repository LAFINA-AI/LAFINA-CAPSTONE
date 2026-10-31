package com.lafina.capstone.reminders

import java.util.Locale

/** A proposal for the visible reminder only; parsing never acknowledges or schedules it. */
data class ReminderResponseCommand(val action: ReminderAction, val minutes: Int = 10)

/** Deliberately smaller than Chat's grammar: no source mutation or implicit completion. */
object ReminderResponsePolicy {
  private val snooze = Regex("snooze (?:for )?([1-9][0-9]{0,2}|one|two|five|ten|fifteen|thirty|sixty) minutes?")
  private val spokenMinutes = mapOf("one" to 1, "two" to 2, "five" to 5, "ten" to 10,
    "fifteen" to 15, "thirty" to 30, "sixty" to 60)

  fun parse(text: String): ReminderResponseCommand? {
    // This English command grammar accepts printable ASCII only. Do not erase
    // hidden controls/newlines and accidentally combine two different commands.
    if (text.length > 2000 || text.any { it.code !in 32..126 }) return null
    var normalized = text.trim(' ').lowercase(Locale.ROOT).replace(Regex(" +"), " ")
    if (normalized.isNotEmpty() && normalized.last() in ".!?") normalized = normalized.dropLast(1)
    return when (normalized) {
      "acknowledge", "acknowledge reminder", "acknowledge this reminder" ->
        ReminderResponseCommand(ReminderAction.ACK)
      "snooze" -> ReminderResponseCommand(ReminderAction.SNOOZE)
      else -> {
        val token = snooze.matchEntire(normalized)?.groupValues?.get(1) ?: return null
        val minutes = spokenMinutes[token] ?: token.toIntOrNull() ?: return null
        if (minutes !in 1..120) return null
        ReminderResponseCommand(ReminderAction.SNOOZE, minutes)
      }
    }
  }

  fun review(command: ReminderResponseCommand): String = when (command.action) {
    ReminderAction.ACK -> "Acknowledge this reminder. The task stays open; it is not completed."
    ReminderAction.SNOOZE -> {
      require(command.minutes in 1..120) { "INVALID_SNOOZE" }
      "Snooze this reminder for ${command.minutes} ${if (command.minutes == 1) "minute" else "minutes"}. The task stays open; it is not completed."
    }
    else -> throw IllegalArgumentException("UNSUPPORTED_REMINDER_RESPONSE")
  }
}
