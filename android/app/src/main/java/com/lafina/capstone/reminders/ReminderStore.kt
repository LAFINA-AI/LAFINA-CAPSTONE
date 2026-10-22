package com.lafina.capstone.reminders

import android.app.Application
import android.content.Context
import android.database.Cursor
import android.database.DatabaseErrorHandler
import android.database.sqlite.SQLiteDatabase
import com.lafina.capstone.BuildConfig
import org.json.JSONObject
import java.time.LocalDate

/**
 * Android SQLite lives exclusively in :reminders. OP-SQLite owns the main process.
 * Both coordinate the same file through DELETE-journal/POSIX locks; do not load two SQLite
 * implementations into one process or replace/delete a live database file.
 * The JS migration owns schema creation. Native opening never repairs or resets it.
 */
class ReminderStore(
  private val context: Context,
  private val databaseName: String = PRIMARY_DATABASE,
) : AutoCloseable {
  init {
    if (databaseName == PRIMARY_DATABASE) {
      if (!Application.getProcessName().endsWith(":reminders")) {
        throw RecoverableStoreException("WRONG_DATABASE_PROCESS")
      }
    } else if (!BuildConfig.ENABLE_PLANNER_HARNESS ||
      !Regex("lafina-phase03-test-[A-Za-z0-9-]+\\.sqlite").matches(databaseName)) {
      throw RecoverableStoreException("INVALID_TEST_DATABASE")
    }
  }

  // No retained connection: every operation releases its own handle in finally.
  override fun close() = Unit

  fun listCurrent(): List<ReminderRecord> = transaction { db ->
    db.rawQuery("$SELECT WHERE j.status IN ('PENDING','RINGING') ORDER BY j.run_at,j.id", null)
      .use { cursor -> buildList { while (cursor.moveToNext()) add(decode(cursor)) } }
  }

  fun get(identity: ReminderIdentity): ReminderRecord? {
    ReminderPolicy.validateIdentity(identity)
    return transaction { db -> current(db, identity) }
  }

  fun settings(): NativeDeliverySettings = transaction { readSettings(it) }

  /** Display preference only; an unreadable value never rewrites the saved record. */
  fun appearance(): String = transaction { db ->
    db.rawQuery("SELECT payload FROM app_settings WHERE id=1", null).use { cursor ->
      if (!cursor.moveToFirst()) return@use "system"
      val theme = try { JSONObject(cursor.text("payload")).opt("theme") } catch (_: Exception) { null }
      if (theme is String && theme in listOf("system", "light", "dark")) theme else "system"
    }
  }

  fun setSettings(settings: NativeDeliverySettings) = transaction { db ->
    db.execSQL("UPDATE native_delivery_settings SET enabled=?,full_screen=? WHERE id=1",
      arrayOf(if (settings.enabled) 1 else 0, if (settings.fullScreen) 1 else 0))
    if (changes(db) != 1) throw RecoverableStoreException("MISSING_DELIVERY_SETTINGS")
  }

  fun claimDue(identity: ReminderIdentity, nowUtc: String, canNotify: Boolean): ClaimResult {
    validate(identity, nowUtc)
    return transaction { db ->
      val record = current(db, identity) ?: return@transaction ClaimResult(ClaimKind.STALE, null)
      if (!record.sourceValid) {
        cancelInvalidSource(db, record, nowUtc)
        return@transaction ClaimResult(ClaimKind.STALE, currentById(db, identity.jobId))
      }
      if (record.status != "PENDING" || record.reminderStatus !in listOf("SCHEDULED", "SNOOZED")) {
        return@transaction ClaimResult(ClaimKind.STALE, record)
      }
      val due = ReminderPolicy.evaluate(record.runAt, nowUtc, null)
      if (due.kind == ClaimKind.FUTURE) return@transaction ClaimResult(ClaimKind.FUTURE, record)
      if (due.kind == ClaimKind.MISSED) {
        transition(db, record, "MISSED", "MISSED", nowUtc)
        event(db, identity, "CLAIM_MISSED", nowUtc, record.runAt, null)
        return@transaction ClaimResult(ClaimKind.MISSED, current(db, identity))
      }
      if (!readSettings(db).enabled || !canNotify) {
        val reason = if (canNotify) "DELIVERY_DISABLED" else "NOTIFICATIONS_DENIED"
        delivery(db, identity, "FAILED", reason)
        event(db, identity, "DELIVERY_UNAVAILABLE", nowUtc, record.runAt, reason)
        return@transaction ClaimResult(ClaimKind.UNAVAILABLE, current(db, identity))
      }
      val decision = try {
        ReminderPolicy.evaluate(record.runAt, nowUtc, quietHours(db))
      } catch (_: Exception) {
        delivery(db, identity, "FAILED", "INVALID_QUIET_POLICY")
        event(db, identity, "DELIVERY_UNAVAILABLE", nowUtc, record.runAt, "INVALID_QUIET_POLICY")
        return@transaction ClaimResult(ClaimKind.UNAVAILABLE, current(db, identity))
      }
      when (decision.kind) {
        ClaimKind.FUTURE -> Unit
        ClaimKind.MISSED -> transition(db, record, "MISSED", "MISSED", nowUtc)
        ClaimKind.QUIET -> transition(db, record, "SNOOZED", "PENDING", nowUtc,
          runAt = requireNotNull(decision.nextAtUtc), newGeneration = nextGeneration(record))
        ClaimKind.RING -> transition(db, record, "RINGING", "RINGING", nowUtc,
          deadline = ReminderPolicy.ringingDeadline(nowUtc), attemptIncrement = 1)
        else -> throw RecoverableStoreException("INVALID_CLAIM_DECISION")
      }
      if (decision.kind != ClaimKind.FUTURE) {
        event(db, identity, "CLAIM_${decision.kind.name}", nowUtc, record.runAt, null)
      }
      ClaimResult(decision.kind, currentById(db, identity.jobId))
    }
  }

  fun action(
    identity: ReminderIdentity,
    action: ReminderAction,
    minutes: Int = 10,
    nowUtc: String,
  ): ActionResult {
    validate(identity, nowUtc)
    if (action == ReminderAction.SNOOZE) require(minutes in 1..120) { "INVALID_SNOOZE" }
    return transaction { db ->
      val record = current(db, identity) ?: return@transaction ActionResult(false, null)
      if (!record.sourceValid) {
        cancelInvalidSource(db, record, nowUtc)
        return@transaction ActionResult(false, currentById(db, identity.jobId))
      }
      if (record.status in TERMINAL || record.reminderStatus in TERMINAL) {
        return@transaction ActionResult(false, record)
      }
      if (action == ReminderAction.CANCEL) {
        transition(db, record, "CANCELLED", "CANCELLED", nowUtc,
          newGeneration = nextGeneration(record))
      } else {
        if (record.status != "RINGING" || record.reminderStatus != "RINGING") {
          return@transaction ActionResult(false, record)
        }
        val deadline = record.ringingDeadline
        if (deadline == null) {
          // A corrupt/v1-simulated ring must not block unrelated reminders. Only
          // MISS repairs it; acknowledgement/snooze must never invent delivery.
          if (action != ReminderAction.MISS) return@transaction ActionResult(false, record)
          delivery(db, identity, "FAILED", "MALFORMED_RING_STATE")
          transition(db, record, "MISSED", "MISSED", nowUtc)
          event(db, identity, "MALFORMED_RING_STATE", nowUtc, record.runAt, null)
          return@transaction ActionResult(true, current(db, identity))
        }
        if (nowUtc >= deadline) {
          transition(db, record, "MISSED", "MISSED", nowUtc)
          event(db, identity, "RING_TIMEOUT", nowUtc, deadline, null)
          return@transaction ActionResult(false, current(db, identity))
        }
        when (action) {
          // Acknowledgement changes only reminder delivery, never the source task.
          ReminderAction.ACK -> transition(db, record, "ACKNOWLEDGED", "ACKNOWLEDGED", nowUtc)
          ReminderAction.MISS -> transition(db, record, "MISSED", "MISSED", nowUtc)
          ReminderAction.SNOOZE -> transition(db, record, "SNOOZED", "PENDING", nowUtc,
            runAt = ReminderPolicy.snoozeAt(nowUtc, minutes), newGeneration = nextGeneration(record))
          ReminderAction.CANCEL -> Unit
        }
      }
      event(db, identity, "ACTION_${action.name}", nowUtc, record.runAt, null)
      ActionResult(true, currentById(db, identity.jobId))
    }
  }

  fun timeout(identity: ReminderIdentity, expectedDeadline: String, nowUtc: String): ActionResult {
    validate(identity, nowUtc)
    ReminderPolicy.instant(expectedDeadline)
    return transaction { db ->
      val record = current(db, identity) ?: return@transaction ActionResult(false, null)
      if (!record.sourceValid) {
        cancelInvalidSource(db, record, nowUtc)
        return@transaction ActionResult(false, currentById(db, identity.jobId))
      }
      if (record.status != "RINGING" || record.reminderStatus != "RINGING" ||
        record.ringingDeadline != expectedDeadline || nowUtc < expectedDeadline) {
        return@transaction ActionResult(false, record)
      }
      transition(db, record, "MISSED", "MISSED", nowUtc)
      event(db, identity, "RING_TIMEOUT", nowUtc, expectedDeadline, null)
      ActionResult(true, current(db, identity))
    }
  }

  /** Call only after NotificationManager accepted notify(), never when merely queued. */
  fun markNotificationPosted(identity: ReminderIdentity, nowUtc: String): Boolean {
    validate(identity, nowUtc)
    return transaction { db ->
      val record = current(db, identity) ?: return@transaction false
      if (!record.sourceValid || record.status != "RINGING" || record.reminderStatus != "RINGING" ||
        record.ringingDeadline == null || nowUtc >= record.ringingDeadline || record.notifiedAt != null) {
        return@transaction false
      }
      db.execSQL("UPDATE reminder_jobs SET notified_at=?,delivery_state='REGISTERED',delivery_reason=NULL WHERE id=?",
        arrayOf(nowUtc, identity.jobId))
      event(db, identity, "NOTIFICATION_POSTED", nowUtc, record.runAt, null)
      true
    }
  }

  fun markDelivery(identity: ReminderIdentity, state: String, reason: String?, nowUtc: String): Boolean {
    validate(identity, nowUtc)
    require(state in listOf("UNAVAILABLE", "PENDING", "REGISTERED", "FAILED")) { "INVALID_DELIVERY_STATE" }
    reason?.let { requireCode(it) }
    return transaction { db ->
      val record = current(db, identity) ?: return@transaction false
      if (!record.sourceValid || record.status in TERMINAL) return@transaction false
      delivery(db, identity, state, reason)
      event(db, identity, "DELIVERY_$state", nowUtc, record.runAt, reason)
      true
    }
  }

  fun registrations(): List<AlarmRegistration> = transaction { db ->
    db.rawQuery("SELECT * FROM native_alarm_registrations ORDER BY job_id", null).use { cursor ->
      buildList {
        while (cursor.moveToNext()) {
          val identity = ReminderIdentity(cursor.text("job_id"), cursor.text("occurrence_key"), cursor.integer("generation"))
          ReminderPolicy.validateIdentity(identity)
          val runAt = cursor.text("run_at").also { ReminderPolicy.instant(it) }
          val scheduledAt = cursor.text("scheduled_at").also { ReminderPolicy.instant(it) }
          val precision = cursor.text("precision").also { require(it in PRECISIONS) }
          add(AlarmRegistration(identity, runAt, precision, scheduledAt))
        }
      }
    }
  }

  /** Cache is derived OS state, never a second authoritative reminder registry. */
  fun upsertRegistration(registration: AlarmRegistration): Boolean {
    validate(registration.identity, registration.scheduledAt)
    ReminderPolicy.instant(registration.runAt)
    require(registration.precision in PRECISIONS) { "INVALID_PRECISION" }
    return transaction { db ->
      val record = current(db, registration.identity) ?: return@transaction false
      if (!record.sourceValid || record.status != "PENDING" || record.runAt != registration.runAt) {
        return@transaction false
      }
      db.execSQL("""INSERT INTO native_alarm_registrations(job_id,generation,occurrence_key,run_at,precision,scheduled_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET generation=excluded.generation,
        occurrence_key=excluded.occurrence_key,run_at=excluded.run_at,precision=excluded.precision,scheduled_at=excluded.scheduled_at""",
        arrayOf(registration.identity.jobId, registration.identity.generation, registration.identity.occurrenceKey,
          registration.runAt, registration.precision, registration.scheduledAt))
      delivery(db, registration.identity, "REGISTERED", if (registration.precision == "INEXACT") "INEXACT_ALARM" else null)
      event(db, registration.identity, "ALARM_REGISTERED", registration.scheduledAt, registration.runAt, registration.precision)
      true
    }
  }

  fun removeRegistration(jobId: String) {
    require(jobId.isNotBlank() && jobId.length <= 1024 && jobId.none { it.isISOControl() })
    transaction { db -> db.execSQL("DELETE FROM native_alarm_registrations WHERE job_id=?", arrayOf(jobId)) }
  }

  fun recordEvent(identity: ReminderIdentity, event: String, nowUtc: String, plannedAt: String? = null, detail: String? = null) {
    validate(identity, nowUtc)
    requireCode(event)
    plannedAt?.let { ReminderPolicy.instant(it) }
    detail?.let { requireCode(it) }
    transaction { db -> event(db, identity, event, nowUtc, plannedAt, detail) }
  }

  /** No task title, agenda text, transcript, or exception messages enter this log. */
  fun recentEvents(limit: Int = 40): List<Map<String, Any?>> {
    require(limit in 1..200) { "INVALID_EVENT_LIMIT" }
    return transaction { db ->
      db.rawQuery("SELECT * FROM native_alarm_events ORDER BY id DESC LIMIT ?", arrayOf(limit.toString())).use { cursor ->
        buildList {
          while (cursor.moveToNext()) add(mapOf(
            "id" to cursor.getLong(cursor.getColumnIndexOrThrow("id")),
            "jobId" to cursor.nullable("job_id"), "generation" to cursor.integer("generation"),
            "event" to cursor.text("event"), "atUtc" to cursor.text("at_utc"),
            "plannedAt" to cursor.nullable("planned_at"), "detail" to cursor.nullable("detail"),
          ))
        }
      }
    }
  }

  /** Include terminal failed deliveries; active-job UI counts would hide them. */
  fun countFailedDeliveries(): Int = transaction { db ->
    db.rawQuery("SELECT COUNT(*) FROM reminder_jobs WHERE delivery_state='FAILED'", null).use { cursor ->
      if (!cursor.moveToFirst()) throw RecoverableStoreException("FAILED_COUNT_UNAVAILABLE")
      cursor.getInt(0)
    }
  }

  private fun <T> transaction(block: (SQLiteDatabase) -> T): T {
    val path = context.getDatabasePath(databaseName)
    if (!path.isFile) throw RecoverableStoreException("DATABASE_NOT_INITIALIZED")
    try {
      // Override Android's default corruption handler, which may delete user data.
      val handler = DatabaseErrorHandler { throw RecoverableStoreException("DATABASE_CORRUPT") }
      // Inspect unsupported/unmigrated files read-only before journal configuration.
      SQLiteDatabase.openDatabase(path.absolutePath, null,
        SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS, handler).use { db ->
        configureBusyTimeout(db)
        requireReady(db)
      }
      val params = SQLiteDatabase.OpenParams.Builder()
        .setOpenFlags(SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.NO_LOCALIZED_COLLATORS)
        .setErrorHandler(handler).setJournalMode("DELETE").setSynchronousMode("FULL").build()
      SQLiteDatabase.openDatabase(path, params).use { db ->
        configureBusyTimeout(db)
        db.execSQL("PRAGMA foreign_keys=ON")
        // IMMEDIATE transaction fences every read/paired write against JS and receivers.
        db.beginTransactionNonExclusive()
        try {
          requireReady(db)
          val result = block(db)
          db.setTransactionSuccessful()
          return result
        } finally {
          db.endTransaction()
        }
      }
    } catch (error: RecoverableStoreException) {
      throw error
    } catch (error: Exception) {
      throw RecoverableStoreException("DATABASE_OPERATION_FAILED", error)
    }
  }

  private fun requireReady(db: SQLiteDatabase) {
    val version = db.rawQuery("PRAGMA user_version", null).use { cursor ->
      if (!cursor.moveToFirst()) throw RecoverableStoreException("SCHEMA_UNREADABLE")
      cursor.getInt(0)
    }
    if (version != 2) throw RecoverableStoreException("SCHEMA_NOT_READY")
    val mode = db.rawQuery("PRAGMA journal_mode", null).use { cursor ->
      if (!cursor.moveToFirst()) "" else cursor.getString(0)
    }
    if (!mode.equals("delete", true)) throw RecoverableStoreException("ROLLBACK_JOURNAL_REQUIRED")
  }

  private fun configureBusyTimeout(db: SQLiteDatabase) {
    // busy_timeout returns a row even when assigning; modern Android rejects
    // row-producing PRAGMAs passed to execSQL rather than rawQuery.
    db.rawQuery("PRAGMA busy_timeout=5000", null).use { cursor ->
      if (!cursor.moveToFirst() || cursor.getInt(0) != 5000) {
        throw RecoverableStoreException("BUSY_TIMEOUT_UNAVAILABLE")
      }
    }
  }

  private fun readSettings(db: SQLiteDatabase): NativeDeliverySettings =
    db.rawQuery("SELECT enabled,full_screen FROM native_delivery_settings WHERE id=1", null).use { cursor ->
      if (!cursor.moveToFirst()) throw RecoverableStoreException("MISSING_DELIVERY_SETTINGS")
      val enabled = cursor.integer("enabled")
      val fullScreen = cursor.integer("full_screen")
      if (enabled !in 0..1 || fullScreen !in 0..1) throw RecoverableStoreException("INVALID_DELIVERY_SETTINGS")
      NativeDeliverySettings(enabled == 1, fullScreen == 1)
    }

  private fun quietHours(db: SQLiteDatabase): QuietHours? {
    val payload = db.rawQuery("SELECT payload FROM app_settings WHERE id=1", null).use { cursor ->
      if (cursor.moveToFirst()) cursor.text("payload") else null
    } ?: return null
    val value = JSONObject(payload)
    require(value.get("schemaVersion") == 1 && value.get("quietHoursEnabled") is Boolean)
    if (!value.getBoolean("quietHoursEnabled")) return null
    val zone = value.get("timezone") as? String ?: throw IllegalArgumentException("INVALID_TIMEZONE")
    ReminderPolicy.zone(zone)
    return QuietHours(zone, value.get("quietStart") as String, value.get("quietEnd") as String)
  }

  private fun current(db: SQLiteDatabase, identity: ReminderIdentity): ReminderRecord? =
    currentById(db, identity.jobId)?.takeIf { ReminderPolicy.matches(it, identity) }

  private fun currentById(db: SQLiteDatabase, jobId: String): ReminderRecord? =
    db.rawQuery("$SELECT WHERE j.id=?", arrayOf(jobId)).use { cursor ->
      if (cursor.moveToFirst()) decode(cursor) else null
    }

  private fun decode(cursor: Cursor): ReminderRecord {
    val identity = ReminderIdentity(cursor.text("id"), cursor.text("occurrence_key"), cursor.integer("generation"))
    ReminderPolicy.validateIdentity(identity)
    val taskId = cursor.nullable("task_id")
    val eventId = cursor.nullable("event_id")
    val sourceId = taskId ?: eventId ?: ""
    val task = taskId != null
    val runAt = cursor.text("run_at").also { ReminderPolicy.instant(it) }
    val sourceVersion = cursor.optionalInteger(if (task) "task_version" else "event_version") ?: 0
    val status = cursor.text("status").also { require(it in JOB_STATES) }
    val reminderStatus = cursor.text("reminder_status").also { require(it in REMINDER_STATES) }
    val deadline = cursor.nullable("ringing_deadline")?.also { ReminderPolicy.instant(it) }
    val notifiedAt = cursor.nullable("notified_at")?.also { ReminderPolicy.instant(it) }
    val timezone = cursor.nullable(if (task) "task_timezone" else "event_timezone") ?: "UTC"
    val title = cursor.nullable(if (task) "task_title" else "event_title") ?: "Academic reminder"
    val valid = try {
      require((taskId == null) != (eventId == null))
      require(sourceVersion >= 1 && title.isNotBlank() && title.length <= 1000)
      ReminderPolicy.zone(timezone)
      require(cursor.text("reminder_occurrence_key") == identity.occurrenceKey)
      require(identity.occurrenceKey.startsWith("$sourceId|"))
      val occurrence = identity.occurrenceKey.removePrefix("$sourceId|")
      val occurrenceInstant = ReminderPolicy.instant(occurrence)
      val lead = cursor.integer("lead_minutes")
      require(lead in 0..120)
      val scheduled = cursor.text("scheduled_at").also { ReminderPolicy.instant(it) }
      require(ReminderPolicy.format(occurrenceInstant.minusSeconds(lead * 60L)) == scheduled)
      if (task) {
        require(cursor.nullable("task_deleted") == null && cursor.nullable("task_status") in listOf("TODO", "IN_PROGRESS"))
        require(cursor.nullable("task_due") == occurrence && cursor.optionalInteger("task_lead") == lead)
      } else {
        require(cursor.nullable("event_deleted") == null && cursor.nullable("event_status") == "ACTIVE")
        require(cursor.optionalInteger("event_lead") == lead)
        val start = cursor.text("event_start").also { ReminderPolicy.instant(it) }
        val recurrence = cursor.nullable("event_recurrence")
        if (recurrence == null) require(occurrence == start) else {
          val rule = JSONObject(recurrence)
          val weekdays = rule.getJSONArray("weekdays")
          val selected = (0 until weekdays.length()).map { weekdays.getInt(it) }
          require(selected.isNotEmpty() && selected.size <= 7 && selected.distinct().size == selected.size && selected.all { it in 0..6 })
          val local = occurrenceInstant.atZone(ReminderPolicy.zone(timezone))
          val first = ReminderPolicy.instant(start).atZone(ReminderPolicy.zone(timezone))
          val until = LocalDate.parse(rule.getString("untilDate"))
          require(local.toLocalDate() >= first.toLocalDate() && local.toLocalDate() <= until &&
            local.toLocalTime() == first.toLocalTime() && (local.dayOfWeek.value % 7) in selected)
        }
      }
      true
    } catch (_: Exception) { false }
    return ReminderRecord(identity, cursor.text("reminder_id"), title, timezone, sourceId,
      if (task) "task" else "event", sourceVersion, valid, runAt, status, reminderStatus,
      cursor.integer("attempt_count"), deadline, notifiedAt, cursor.text("delivery_state"), cursor.nullable("delivery_reason"))
  }

  private fun transition(
    db: SQLiteDatabase, record: ReminderRecord, reminderStatus: String, jobStatus: String,
    nowUtc: String, runAt: String = record.runAt, newGeneration: Int = record.identity.generation,
    deadline: String? = null, attemptIncrement: Int = 0,
  ) {
    if (attemptIncrement > 0 && record.attemptCount == Int.MAX_VALUE) {
      throw RecoverableStoreException("ATTEMPT_COUNT_EXHAUSTED")
    }
    db.execSQL("UPDATE reminders SET status=?,version=version+1,last_outcome_at=? WHERE id=?",
      arrayOf(reminderStatus, nowUtc, record.reminderId))
    if (changes(db) != 1) throw RecoverableStoreException("REMINDER_WRITE_CONFLICT")
    val preserveFailure = if (jobStatus == "MISSED") 1 else 0
    db.execSQL("""UPDATE reminder_jobs SET status=?,run_at=?,generation=?,attempt_count=attempt_count+?,
      ringing_deadline=?,notified_at=NULL,
      delivery_state=CASE WHEN ?=1 AND delivery_state='FAILED' THEN 'FAILED' ELSE ? END,
      delivery_reason=CASE WHEN ?=1 AND delivery_state='FAILED' THEN delivery_reason ELSE NULL END
      WHERE id=? AND generation=? AND occurrence_key=?""",
      arrayOf(jobStatus, runAt, newGeneration, attemptIncrement, deadline,
        preserveFailure, if (jobStatus == "PENDING") "PENDING" else "UNAVAILABLE", preserveFailure,
        record.identity.jobId, record.identity.generation, record.identity.occurrenceKey))
    if (changes(db) != 1) throw RecoverableStoreException("JOB_WRITE_CONFLICT")
    // Preserve the prior OS identity until the coordinator cancels its alarm,
    // notification and timeout. The cache has no FK specifically to survive
    // source deletion/generation changes and make that cleanup possible.
  }

  private fun cancelInvalidSource(db: SQLiteDatabase, record: ReminderRecord, nowUtc: String) {
    if (record.status !in TERMINAL && record.reminderStatus !in TERMINAL) {
      transition(db, record, "CANCELLED", "CANCELLED", nowUtc, newGeneration = nextGeneration(record))
      event(db, record.identity, "STALE_SOURCE", nowUtc, record.runAt, null)
    }
  }

  private fun nextGeneration(record: ReminderRecord): Int {
    if (record.identity.generation == Int.MAX_VALUE) throw RecoverableStoreException("GENERATION_EXHAUSTED")
    return record.identity.generation + 1
  }

  private fun delivery(db: SQLiteDatabase, identity: ReminderIdentity, state: String, reason: String?) {
    db.execSQL("UPDATE reminder_jobs SET delivery_state=?,delivery_reason=? WHERE id=? AND generation=? AND occurrence_key=?",
      arrayOf(state, reason, identity.jobId, identity.generation, identity.occurrenceKey))
  }

  private fun event(db: SQLiteDatabase, identity: ReminderIdentity, event: String, nowUtc: String, plannedAt: String?, detail: String?) {
    db.execSQL("INSERT INTO native_alarm_events(job_id,generation,event,at_utc,planned_at,detail) VALUES(?,?,?,?,?,?)",
      arrayOf(identity.jobId, identity.generation, event, nowUtc, plannedAt, detail))
    db.execSQL("DELETE FROM native_alarm_events WHERE id NOT IN (SELECT id FROM native_alarm_events ORDER BY id DESC LIMIT 200)")
  }

  private fun changes(db: SQLiteDatabase): Int = db.rawQuery("SELECT changes()", null).use { cursor ->
    if (!cursor.moveToFirst()) throw RecoverableStoreException("WRITE_RESULT_UNAVAILABLE")
    cursor.getInt(0)
  }

  private fun validate(identity: ReminderIdentity, nowUtc: String) {
    ReminderPolicy.validateIdentity(identity)
    ReminderPolicy.instant(nowUtc)
  }

  private fun requireCode(code: String) {
    require(Regex("[A-Z][A-Z0-9_]{0,63}").matches(code)) { "INVALID_DIAGNOSTIC_CODE" }
  }

  private fun Cursor.text(column: String): String {
    val index = getColumnIndexOrThrow(column)
    if (getType(index) != Cursor.FIELD_TYPE_STRING) throw RecoverableStoreException("INVALID_STORED_TEXT")
    return getString(index)
  }
  private fun Cursor.nullable(column: String): String? =
    if (isNull(getColumnIndexOrThrow(column))) null else text(column)
  private fun Cursor.integer(column: String): Int {
    val index = getColumnIndexOrThrow(column)
    if (getType(index) != Cursor.FIELD_TYPE_INTEGER) throw RecoverableStoreException("INVALID_STORED_INTEGER")
    val value = getLong(index)
    if (value !in 0..Int.MAX_VALUE.toLong()) throw RecoverableStoreException("INVALID_STORED_INTEGER")
    return value.toInt()
  }
  private fun Cursor.optionalInteger(column: String): Int? =
    if (isNull(getColumnIndexOrThrow(column))) null else integer(column)

  companion object {
    const val PRIMARY_DATABASE = "lafina-capstone.sqlite"
    private val TERMINAL = listOf("ACKNOWLEDGED", "MISSED", "CANCELLED")
    private val JOB_STATES = TERMINAL + listOf("PENDING", "RINGING")
    private val REMINDER_STATES = TERMINAL + listOf("SCHEDULED", "SNOOZED", "RINGING")
    private val PRECISIONS = listOf("EXACT", "INEXACT")
    private val SELECT = """SELECT j.*,r.id AS rid,r.task_id,r.event_id,r.occurrence_key AS reminder_occurrence_key,
      r.scheduled_at,r.lead_minutes,r.status AS reminder_status,
      t.id AS task_source_id,t.title AS task_title,t.due_at AS task_due,t.timezone AS task_timezone,
      t.status AS task_status,t.version AS task_version,t.deleted_at AS task_deleted,t.reminder_lead_minutes AS task_lead,
      e.id AS event_source_id,e.title AS event_title,e.start_at AS event_start,e.timezone AS event_timezone,
      e.status AS event_status,e.version AS event_version,e.deleted_at AS event_deleted,
      e.recurrence AS event_recurrence,e.reminder_lead_minutes AS event_lead
      FROM reminder_jobs j JOIN reminders r ON r.id=j.reminder_id
      LEFT JOIN tasks t ON t.id=r.task_id LEFT JOIN events e ON e.id=r.event_id"""
  }
}
