package com.lafina.capstone

import android.content.Context
import org.json.JSONObject

/** Durable pending requests. All callers hold LafinaReminderModule's delivery lock. */
internal class PendingReminderCalls(context: Context, name: String = "lafina_pending_call") {
  private val prefs = context.getSharedPreferences(name, Context.MODE_PRIVATE)
  private fun read(): JSONObject {
    val saved = prefs.getString("calls_v1", null)
    if (saved != null) return runCatching { JSONObject(saved) }.getOrElse { JSONObject() }
    val calls = JSONObject()
    val id = prefs.getString("reminder_id", null)
    if (!id.isNullOrBlank()) {
      val owner = prefs.getString("owner_id", "").orEmpty()
      val generation = prefs.getLong("generation", 0)
      calls.put(key(owner, id, generation), JSONObject().put("reminderId", id).put("ownerId", owner)
          .put("generation", generation).put("task", prefs.getString("task", ""))
          .put("action", prefs.getString("action", "call")).put("atMs", System.currentTimeMillis()))
    }
    return calls
  }
  fun all(): List<JSONObject> {
    val calls = read()
    return calls.keys().asSequence().mapNotNull { calls.optJSONObject(it) }.sortedBy { it.optLong("atMs") }.toList()
  }
  fun get(owner: String, id: String, generation: Long): JSONObject? = read().optJSONObject(key(owner, id, generation))
  fun put(row: JSONObject) {
    val calls = read()
    calls.put(key(row.optString("ownerId"), row.getString("reminderId"), row.optLong("generation")), row)
    check(prefs.edit().putString("calls_v1", calls.toString()).remove("reminder_id").commit()) { "Pending call commit failed" }
  }
  fun remove(owner: String, id: String, generation: Long) {
    val calls = read()
    calls.remove(key(owner, id, generation))
    check(prefs.edit().putString("calls_v1", calls.toString()).remove("reminder_id").commit()) { "Pending call commit failed" }
  }
  companion object {
    fun key(owner: String, id: String, generation: Long): String = DeliveryIdentity(owner, id, generation).uri("call")
  }
}
