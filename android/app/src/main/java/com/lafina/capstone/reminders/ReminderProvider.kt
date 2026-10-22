package com.lafina.capstone.reminders

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.Binder
import android.os.Bundle
import android.os.Process
import org.json.JSONObject

/** Private command boundary; no raw SQL, paths, or arbitrary table access crosses Binder. */
class ReminderProvider : ContentProvider() {
  override fun onCreate() = true

  override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
    check(Binder.getCallingUid() == Process.myUid())
    val app = requireNotNull(context)
    return try {
      val json = when (method) {
        "capabilities" -> ReminderRuntime.withStore(app) { ReminderCapabilities.json(app, it.settings()) }
        "reconcile" -> ReminderRuntime.reconcile(app)
        "diagnostics" -> ReminderRuntime.diagnostics(app)
        "setEnabled", "setFullScreenEnabled" -> {
          require(arg == "true" || arg == "false")
          ReminderRuntime.withStore(app) { store ->
            val before = store.settings()
            store.setSettings(if (method == "setEnabled") before.copy(enabled = arg == "true") else before.copy(fullScreen = arg == "true"))
          }
          ReminderRuntime.reconcile(app)
        }
        "canOpen" -> {
          val input = JSONObject(requireNotNull(arg))
          val identity = ReminderIdentity(input.getString("jobId"), input.getString("occurrenceKey"), input.getInt("generation"))
          ReminderPolicy.validateIdentity(identity)
          require(identity.generation > 0)
          val available = ReminderRuntime.withStore(app) {
            val record = it.get(identity)
            record != null && record.sourceValid && record.status == "RINGING" &&
              record.ringingDeadline?.let { deadline -> java.time.Instant.parse(deadline) > java.time.Instant.now() } == true
          }
          JSONObject().put("available", available)
        }
        else -> throw IllegalArgumentException("UNKNOWN_COMMAND")
      }
      Bundle().apply { putString("json", json.toString()) }
    } catch (_: Exception) {
      android.util.Log.e("CapstoneReminders", "PRIVATE_COMMAND_FAILED")
      Bundle().apply { putString("error", "REMINDER_STORAGE_OR_PLATFORM_UNAVAILABLE") }
    }
  }

  override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = throw UnsupportedOperationException()
  override fun getType(uri: Uri): String? = null
  override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException()
  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException()
  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException()
}
