package com.lafina.capstone.reminders

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Real Android SQLite integration on isolated synthetic files, never a student's DB. */
@RunWith(AndroidJUnit4::class)
class ReminderStoreTest {
  private lateinit var context: Context
  private lateinit var name: String
  private lateinit var store: ReminderStore
  private val at = "2026-10-23T04:00:00.000Z"
  private val key = "task-test|2026-10-23T04:15:00.000Z"
  private val identity get() = ReminderIdentity("job-test", key, 1)

  @Before fun before() {
    context = InstrumentationRegistry.getInstrumentation().targetContext
    name = "lafina-phase03-test-${UUID.randomUUID()}.sqlite"
    // Test-only fixture is intentionally the minimal SQL surface used by the store.
    // TS migration tests separately check the full production schema/migration.
    open(create = true).use { db ->
      db.execSQL("PRAGMA user_version=2")
      db.execSQL("CREATE TABLE app_settings(id INTEGER PRIMARY KEY,payload TEXT NOT NULL)")
      db.execSQL("CREATE TABLE native_delivery_settings(id INTEGER PRIMARY KEY,enabled INTEGER,full_screen INTEGER)")
      db.execSQL("INSERT INTO native_delivery_settings VALUES(1,1,0)")
      db.execSQL("CREATE TABLE tasks(id TEXT PRIMARY KEY,title TEXT,due_at TEXT,timezone TEXT,status TEXT,version INTEGER,deleted_at TEXT,reminder_lead_minutes INTEGER)")
      db.execSQL("CREATE TABLE events(id TEXT PRIMARY KEY,title TEXT,start_at TEXT,timezone TEXT,status TEXT,version INTEGER,deleted_at TEXT,recurrence TEXT,reminder_lead_minutes INTEGER)")
      db.execSQL("CREATE TABLE reminders(id TEXT PRIMARY KEY,task_id TEXT,event_id TEXT,occurrence_key TEXT,scheduled_at TEXT,lead_minutes INTEGER,status TEXT,version INTEGER,last_outcome_at TEXT)")
      db.execSQL("CREATE TABLE reminder_jobs(id TEXT PRIMARY KEY,reminder_id TEXT,occurrence_key TEXT,run_at TEXT,status TEXT,generation INTEGER,attempt_count INTEGER,delivery_state TEXT,delivery_reason TEXT,ringing_deadline TEXT,notified_at TEXT)")
      db.execSQL("CREATE TABLE native_alarm_registrations(job_id TEXT PRIMARY KEY,generation INTEGER,occurrence_key TEXT,run_at TEXT,precision TEXT,scheduled_at TEXT)")
      db.execSQL("CREATE TABLE native_alarm_events(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT,generation INTEGER,event TEXT,at_utc TEXT,planned_at TEXT,detail TEXT)")
      db.execSQL("INSERT INTO tasks VALUES('task-test','Synthetic class','2026-10-23T04:15:00.000Z','Asia/Manila','TODO',1,NULL,15)")
      db.execSQL("INSERT INTO reminders VALUES('reminder-test','task-test',NULL,?, ?,15,'SCHEDULED',1,NULL)", arrayOf(key, at))
      db.execSQL("INSERT INTO reminder_jobs VALUES('job-test','reminder-test',?,?,'PENDING',1,0,'PENDING',NULL,NULL,NULL)", arrayOf(key, at))
    }
    store = ReminderStore(context, name)
  }

  @After fun after() {
    store.close()
    context.deleteDatabase(name)
  }

  @Test fun primaryStoreRefusesMainProcess() {
    val error = assertThrows(RecoverableStoreException::class.java) { ReminderStore(context) }
    assertEquals("WRONG_DATABASE_PROCESS", error.code)
  }

  @Test fun missingAndTextOnlySpeechPreferencesNeverEnableReminderAudio() {
    assertFalse(store.speechPreferences().enabled)
    execute("INSERT INTO app_settings VALUES(1,'{\"schemaVersion\":1,\"replyMode\":\"text\"}')")
    assertFalse(store.speechPreferences().enabled)
    assertNull(store.speechPreferences().options)
  }

  @Test fun legacyVoicePreferenceUsesSafeOfflineSelectionDefaultsWithoutWritingSettings() {
    val payload = "{\"schemaVersion\":1,\"replyMode\":\"voice\"}"
    open().use { it.execSQL("INSERT INTO app_settings VALUES(1,?)", arrayOf(payload)) }
    val preferences = store.speechPreferences()
    assertTrue(preferences.enabled)
    assertEquals("en-US", preferences.options!!.languageTag)
    assertNull(preferences.options.enginePackage)
    assertNull(preferences.options.voiceName)
    assertEquals(payload, scalar("SELECT payload FROM app_settings"))
    assertEquals("TODO", scalar("SELECT status FROM tasks"))
  }

  @Test fun explicitSpeechOptionsAreReadFromTheSharedPreferencePayload() {
    val payload = "{\"schemaVersion\":1,\"replyMode\":\"both\",\"tts\":{\"enginePackage\":\"test.engine\",\"voiceName\":\"offline\",\"languageTag\":\"fil-PH\",\"rate\":0.75,\"pitch\":1.25}}"
    open().use { it.execSQL("INSERT INTO app_settings VALUES(1,?)", arrayOf(payload)) }
    val preferences = store.speechPreferences()
    assertTrue(preferences.enabled)
    assertEquals("test.engine", preferences.options!!.enginePackage)
    assertEquals("offline", preferences.options.voiceName)
    assertEquals("fil-PH", preferences.options.languageTag)
    assertEquals(0.75, preferences.options.rate, 0.0)
    assertEquals(1.25, preferences.options.pitch, 0.0)
  }

  @Test fun malformedSpeechPreferencesDisableOnlyAudioWithoutChangingReminderOrTask() {
    execute("INSERT INTO app_settings VALUES(1,'{\"schemaVersion\":1,\"replyMode\":\"both\",\"tts\":{\"rate\":\"1\"}}')")
    assertFalse(store.speechPreferences().enabled)
    assertEquals("INVALID_SPEECH_PREFERENCES", store.speechPreferences().reason)
    assertEquals("PENDING", store.get(identity)!!.status)
    assertEquals("TODO", scalar("SELECT status FROM tasks"))
  }

  @Test fun missingDatabaseIsNeverCreated() {
    val absent = "lafina-phase03-test-${UUID.randomUUID()}.sqlite"
    assertThrows(RecoverableStoreException::class.java) { ReminderStore(context, absent).settings() }
    assertFalse(context.getDatabasePath(absent).exists())
  }

  @Test fun unmigratedDatabaseIsRejectedWithoutChangingVersion() {
    execute("PRAGMA user_version=1")
    assertEquals("SCHEMA_NOT_READY", assertThrows(RecoverableStoreException::class.java) { store.listCurrent() }.code)
    assertEquals("1", scalar("PRAGMA user_version"))
    assertEquals("SCHEDULED", scalar("SELECT status FROM reminders"))
  }

  @Test fun nonDeleteJournalIsRejectedWithoutSwitchingMode() {
    val params = SQLiteDatabase.OpenParams.Builder().setOpenFlags(SQLiteDatabase.OPEN_READWRITE)
      .setJournalMode("PERSIST").build()
    SQLiteDatabase.openDatabase(context.getDatabasePath(name), params).use { db ->
      // PERSIST is connection-local/nonpersistent in SQLite, so keep its handle
      // alive and assert native readiness never flips a live WAL database instead.
      db.enableWriteAheadLogging()
      assertEquals("ROLLBACK_JOURNAL_REQUIRED",
        assertThrows(RecoverableStoreException::class.java) { store.settings() }.code)
      db.rawQuery("PRAGMA journal_mode", null).use { cursor ->
        assertTrue(cursor.moveToFirst())
        assertEquals("wal", cursor.getString(0))
      }
      db.disableWriteAheadLogging()
    }
  }

  @Test fun claimAndAcknowledgementArePairedAndNeverCompleteTask() {
    assertEquals(ClaimKind.RING, store.claimDue(identity, at, true).kind)
    val ring = store.get(identity)!!
    assertEquals("2026-10-23T04:01:00.000Z", ring.ringingDeadline)
    assertEquals(1, ring.attemptCount)
    assertTrue(store.action(identity, ReminderAction.ACK, nowUtc = "2026-10-23T04:00:10.000Z").applied)
    assertEquals("ACKNOWLEDGED", scalar("SELECT status FROM reminders"))
    assertEquals("ACKNOWLEDGED", scalar("SELECT status FROM reminder_jobs"))
    assertEquals("TODO", scalar("SELECT status FROM tasks"))
  }

  @Test fun repeatedOrStaleCallbacksDoNotIncrementAttempts() {
    assertEquals(ClaimKind.STALE, store.claimDue(identity.copy(generation = 2), at, true).kind)
    assertEquals(ClaimKind.STALE, store.claimDue(identity.copy(occurrenceKey = "other"), at, true).kind)
    assertEquals(ClaimKind.RING, store.claimDue(identity, at, true).kind)
    assertEquals(ClaimKind.STALE, store.claimDue(identity, at, true).kind)
    assertEquals(1, store.get(identity)!!.attemptCount)
  }

  @Test fun concurrentClaimsHaveOneWinner() {
    val executor = Executors.newFixedThreadPool(2)
    val start = CountDownLatch(1)
    try {
      val results = (1..2).map { executor.submit<ClaimKind> {
        start.await()
        store.claimDue(identity, at, true).kind
      } }
      start.countDown()
      assertEquals(listOf(ClaimKind.RING, ClaimKind.STALE).sortedBy { it.name },
        results.map { it.get(15, TimeUnit.SECONDS) }.sortedBy { it.name })
      assertEquals(1, store.get(identity)!!.attemptCount)
    } finally { executor.shutdownNow() }
  }

  @Test fun deniedNotificationsPreserveManualPendingStateWithFailureReason() {
    assertEquals(ClaimKind.UNAVAILABLE, store.claimDue(identity, at, false).kind)
    val record = store.get(identity)!!
    assertEquals("PENDING", record.status)
    assertEquals("FAILED", record.deliveryState)
    assertEquals("NOTIFICATIONS_DENIED", record.deliveryReason)
    assertEquals(0, record.attemptCount)
    assertEquals("TODO", scalar("SELECT status FROM tasks"))
  }

  @Test fun overdueReminderMissesEvenWhenNotificationPermissionIsDenied() {
    assertEquals(ClaimKind.MISSED, store.claimDue(identity, "2026-10-23T04:15:00.001Z", false).kind)
    assertEquals("MISSED", scalar("SELECT status FROM reminders"))
    assertEquals("MISSED", scalar("SELECT status FROM reminder_jobs"))
  }

  @Test fun snoozeChangesGenerationAndOldTimeoutCannotConsumeIt() {
    store.claimDue(identity, at, true)
    assertTrue(store.action(identity, ReminderAction.SNOOZE, 10, "2026-10-23T04:00:10.000Z").applied)
    val next = identity.copy(generation = 2)
    assertEquals("2026-10-23T04:10:10.000Z", store.get(next)!!.runAt)
    assertFalse(store.timeout(identity, "2026-10-23T04:01:00.000Z", "2026-10-23T04:01:00.000Z").applied)
    assertEquals("PENDING", store.get(next)!!.status)
    assertThrows(IllegalArgumentException::class.java) { store.action(next, ReminderAction.SNOOZE, 121, at) }
  }

  @Test fun timeoutRequiresExactDeadlineAndIsIdempotent() {
    store.claimDue(identity, at, true)
    assertFalse(store.timeout(identity, "2026-10-23T04:02:00.000Z", "2026-10-23T04:03:00.000Z").applied)
    assertFalse(store.timeout(identity, "2026-10-23T04:01:00.000Z", "2026-10-23T04:00:59.999Z").applied)
    assertTrue(store.timeout(identity, "2026-10-23T04:01:00.000Z", "2026-10-23T04:01:00.000Z").applied)
    assertFalse(store.timeout(identity, "2026-10-23T04:01:00.000Z", "2026-10-23T04:02:00.000Z").applied)
  }

  @Test fun deletedOrCompletedSourceCannotRing() {
    execute("UPDATE tasks SET deleted_at=?", arrayOf(at))
    assertEquals(ClaimKind.STALE, store.claimDue(identity, at, true).kind)
    assertEquals("CANCELLED", scalar("SELECT status FROM reminders"))
    assertEquals("CANCELLED", scalar("SELECT status FROM reminder_jobs"))
  }

  @Test fun sourceTimeChangeInvalidatesOldOccurrenceEvenWithoutGenerationUpdate() {
    execute("UPDATE tasks SET due_at='2026-10-23T05:00:00.000Z'")
    assertEquals(ClaimKind.STALE, store.claimDue(identity, at, true).kind)
    assertEquals("0", scalar("SELECT attempt_count FROM reminder_jobs"))
  }

  @Test fun notificationReceiptRequiresLiveUnexpiredRingAndDoesNotRepeat() {
    assertFalse(store.markNotificationPosted(identity, at))
    store.claimDue(identity, at, true)
    assertTrue(store.markNotificationPosted(identity, "2026-10-23T04:00:01.000Z"))
    assertFalse(store.markNotificationPosted(identity, "2026-10-23T04:00:02.000Z"))
    assertEquals("2026-10-23T04:00:01.000Z", store.get(identity)!!.notifiedAt)
  }

  @Test fun pairedWriteFailureRollsBackReminderChange() {
    execute("CREATE TRIGGER reject_ring BEFORE UPDATE ON reminder_jobs BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END")
    assertThrows(RecoverableStoreException::class.java) { store.claimDue(identity, at, true) }
    assertEquals("SCHEDULED", scalar("SELECT status FROM reminders"))
    assertEquals("PENDING", scalar("SELECT status FROM reminder_jobs"))
    assertEquals("0", scalar("SELECT count(*) FROM native_alarm_events"))
  }

  @Test fun registrationCacheAndDiagnosticsAreBoundedAndRedacted() {
    assertTrue(store.upsertRegistration(AlarmRegistration(identity, at, "INEXACT", at)))
    assertEquals("INEXACT_ALARM", store.get(identity)!!.deliveryReason)
    assertFalse(store.upsertRegistration(AlarmRegistration(identity.copy(generation = 2), at, "EXACT", at)))
    repeat(205) { store.recordEvent(identity, "TEST_EVENT", at, at, "SYNTHETIC") }
    assertEquals(200, store.recentEvents(200).size)
    assertThrows(IllegalArgumentException::class.java) { store.recordEvent(identity, "TEST_EVENT", at, detail = "Private agenda text") }
    store.claimDue(identity, at, true)
    assertEquals(identity, store.registrations().single().identity)
    store.removeRegistration(identity.jobId)
    assertTrue(store.registrations().isEmpty())
  }

  @Test fun quietHoursDeferUsingSavedGlobalZoneAndFenceOldCallback() {
    execute("UPDATE reminder_jobs SET run_at='2026-10-23T15:00:00.000Z'")
    execute("INSERT INTO app_settings VALUES(1,?)", arrayOf("""{"schemaVersion":1,"timezone":"Asia/Manila","quietHoursEnabled":true,"quietStart":"22:00","quietEnd":"07:00"}"""))
    assertEquals(ClaimKind.QUIET, store.claimDue(identity, "2026-10-23T15:00:00.000Z", true).kind)
    val deferred = store.get(identity.copy(generation = 2))!!
    assertEquals("2026-10-23T23:00:00.000Z", deferred.runAt)
    assertEquals(0, deferred.attemptCount)
    assertEquals(ClaimKind.STALE, store.claimDue(identity, "2026-10-23T15:00:00.000Z", true).kind)
  }

  @Test fun lowercaseSourceAndQuietZonesRemainValidWithoutRewritingSavedValues() {
    execute("UPDATE tasks SET timezone='asia/manila'")
    execute("UPDATE reminder_jobs SET run_at='2026-10-23T15:00:00.000Z'")
    val payload = """{"schemaVersion":1,"timezone":"asia/manila","quietHoursEnabled":true,"quietStart":"22:00","quietEnd":"07:00"}"""
    execute("INSERT INTO app_settings VALUES(1,?)", arrayOf(payload))
    assertTrue(store.get(identity)!!.sourceValid)
    assertEquals(ClaimKind.QUIET, store.claimDue(identity, "2026-10-23T15:00:00.000Z", true).kind)
    assertEquals("2026-10-23T23:00:00.000Z", store.get(identity.copy(generation = 2))!!.runAt)
    assertEquals("asia/manila", scalar("SELECT timezone FROM tasks"))
    assertEquals(payload, scalar("SELECT payload FROM app_settings"))
    assertEquals("2026-10-23T04:15:00.000Z", scalar("SELECT due_at FROM tasks"))
  }

  @Test fun terminalMissPreservesFailureReasonAndIncludesItInDiagnostics() {
    assertEquals(0, store.countFailedDeliveries())
    store.claimDue(identity, at, true)
    assertTrue(store.markDelivery(identity, "FAILED", "NOTIFICATION_FAILED", at))
    assertTrue(store.action(identity, ReminderAction.MISS, nowUtc = at).applied)
    val missed = store.get(identity)!!
    assertEquals("MISSED", missed.status)
    assertEquals("FAILED", missed.deliveryState)
    assertEquals("NOTIFICATION_FAILED", missed.deliveryReason)
    assertEquals(1, store.countFailedDeliveries())
    assertTrue(store.listCurrent().isEmpty())
  }

  @Test fun malformedRingOnlyAllowsMissRepairAndDoesNotBlockUnrelatedDueJob() {
    execute("UPDATE reminders SET status='RINGING'")
    execute("UPDATE reminder_jobs SET status='RINGING',ringing_deadline=NULL")
    assertFalse(store.action(identity, ReminderAction.ACK, nowUtc = at).applied)
    assertFalse(store.action(identity, ReminderAction.SNOOZE, 10, at).applied)
    assertTrue(store.action(identity, ReminderAction.MISS, nowUtc = at).applied)
    assertEquals("MISSED", scalar("SELECT status FROM reminders WHERE id='reminder-test'"))
    assertEquals("MALFORMED_RING_STATE", store.get(identity)!!.deliveryReason)
    assertEquals("TODO", scalar("SELECT status FROM tasks WHERE id='task-test'"))
    val otherKey = "task-other|2026-10-23T04:15:00.000Z"
    execute("INSERT INTO tasks SELECT 'task-other',title,due_at,timezone,status,version,deleted_at,reminder_lead_minutes FROM tasks WHERE id='task-test'")
    execute("INSERT INTO reminders VALUES('reminder-other','task-other',NULL,?,?,15,'SCHEDULED',1,NULL)", arrayOf(otherKey, at))
    execute("INSERT INTO reminder_jobs VALUES('job-other','reminder-other',?,?,'PENDING',1,0,'PENDING',NULL,NULL,NULL)", arrayOf(otherKey, at))
    assertEquals(ClaimKind.RING, store.claimDue(ReminderIdentity("job-other", otherKey, 1), at, true).kind)
  }

  @Test fun clockRollbackCanCloseCurrentRingWithoutExtendingResponseWindow() {
    store.claimDue(identity, at, true)
    assertTrue(store.action(identity, ReminderAction.MISS, nowUtc = "2026-10-23T03:00:00.000Z").applied)
    assertEquals("MISSED", store.get(identity)!!.status)
    assertFalse(store.action(identity, ReminderAction.ACK, nowUtc = "2026-10-23T03:00:01.000Z").applied)
    assertEquals("TODO", scalar("SELECT status FROM tasks"))
  }

  private fun open(create: Boolean = false): SQLiteDatabase {
    val flags = SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.NO_LOCALIZED_COLLATORS or
      if (create) SQLiteDatabase.CREATE_IF_NECESSARY else 0
    val params = SQLiteDatabase.OpenParams.Builder().setOpenFlags(flags).setJournalMode("DELETE").build()
    return SQLiteDatabase.openDatabase(context.getDatabasePath(name), params)
  }
  private fun execute(sql: String, params: Array<Any?> = emptyArray()) = open().use { it.execSQL(sql, params) }
  private fun scalar(sql: String): String = open().use { db -> db.rawQuery(sql, null).use { cursor ->
    check(cursor.moveToFirst())
    cursor.getString(0)
  } }
}
