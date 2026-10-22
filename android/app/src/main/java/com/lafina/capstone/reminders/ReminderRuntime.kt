package com.lafina.capstone.reminders

import android.app.AlarmManager
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.Executors

/** All Android SQLite access occurs in :reminders, never alongside OP-SQLite's SQLite copy. */
object ReminderRuntime {
  private val lock = Any()
  val worker = Executors.newSingleThreadExecutor()
  private const val MAX_REGISTERED = 128
  private const val MAX_DUE_PER_PASS = 256
  private val registrationPolicy = AlarmRegistrationPolicy()

  fun <T> withStore(context: Context, block: (ReminderStore) -> T): T = synchronized(lock) {
    check(android.app.Application.getProcessName() == "${context.packageName}:reminders")
    val store = ReminderStore(context.applicationContext)
    try { block(store) } finally { store.close() }
  }

  fun reconcile(context: Context, forceRestore: Boolean = false): JSONObject = withStore(context) { store ->
    if (forceRestore) registrationPolicy.invalidate()
    reconcileLocked(context, store)
  }

  fun cancelIdentity(context: Context, identity: ReminderIdentity) {
    val alarms = context.getSystemService(AlarmManager::class.java)
    for (kind in listOf(ReminderIntents.DUE, ReminderIntents.TIMEOUT)) {
      val pending = ReminderIntents.pending(context, identity, kind)
      alarms.cancel(pending)
      pending.cancel()
    }
    ReminderNotifications.cancel(context, identity)
    for (kind in listOf(ReminderIntents.OPEN, ReminderIntents.ACK, ReminderIntents.SNOOZE)) {
      ReminderIntents.pending(context, identity, kind).cancel()
    }
  }

  private fun schedule(context: Context, identity: ReminderIdentity, kind: String, whenAt: String): String {
    val alarm = context.getSystemService(AlarmManager::class.java)
    val pending = ReminderIntents.pending(context, identity, kind)
    val time = maxOf(System.currentTimeMillis() + 1, Instant.parse(whenAt).toEpochMilli())
    if (ReminderCapabilities.exact(context)) {
      try {
        alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, pending)
        return "EXACT"
      } catch (_: SecurityException) {
        // The special access may be revoked between capability check and scheduling.
      }
    }
    alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, pending)
    return "INEXACT"
  }

  private fun maintenance(context: Context, atMillis: Long?) {
    val alarms = context.getSystemService(AlarmManager::class.java)
    val pending = ReminderIntents.maintenance(context)
    alarms.cancel(pending)
    if (atMillis != null) alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, maxOf(System.currentTimeMillis() + 1000, atMillis), pending)
  }

  private fun deliver(context: Context, store: ReminderStore, identity: ReminderIdentity, now: String) {
    val result = store.claimDue(identity, now, ReminderCapabilities.notifications(context))
    val record = result.record ?: return
    if (result.kind != ClaimKind.RING) return
    try {
      val deadline = record.ringingDeadline ?: return
      schedule(context, identity, ReminderIntents.TIMEOUT, deadline)
      ReminderNotifications.post(context, record, store.settings())
      if (!store.markNotificationPosted(identity, ReminderPolicy.format(Instant.now()))) ReminderNotifications.cancel(context, identity)
    } catch (_: SecurityException) {
      store.markDelivery(identity, "FAILED", "NOTIFICATION_PERMISSION", now)
      store.action(identity, ReminderAction.MISS, nowUtc = now)
      ReminderNotifications.cancel(context, identity)
    } catch (_: RuntimeException) {
      store.markDelivery(identity, "FAILED", "NOTIFICATION_FAILED", now)
      store.action(identity, ReminderAction.MISS, nowUtc = now)
      ReminderNotifications.cancel(context, identity)
    }
  }

  private fun reconcileLocked(context: Context, store: ReminderStore): JSONObject {
    ReminderCapabilities.ensureChannel(context)
    val now = Instant.now()
    val stamp = ReminderPolicy.format(now)
    val settings = store.settings()
    var scheduled = 0
    var cancelled = 0
    var failed = 0
    var current = store.listCurrent()
    val byJob = current.associateBy { it.identity.jobId }
    store.registrations().forEach { registered ->
      val record = byJob[registered.identity.jobId]
      if (!settings.enabled || record == null || !record.sourceValid || record.identity != registered.identity ||
        (record.status == "PENDING" && record.runAt != registered.runAt)) {
        cancelIdentity(context, registered.identity)
        store.removeRegistration(registered.identity.jobId)
        cancelled++
      }
    }
    current.filter { !it.sourceValid }.forEach {
      store.action(it.identity, ReminderAction.CANCEL, nowUtc = stamp)
    }
    current = store.listCurrent()
    if (!settings.enabled || !ReminderCapabilities.notifications(context)) {
      current.forEach {
        cancelIdentity(context, it.identity)
        store.removeRegistration(it.identity.jobId)
        store.markDelivery(it.identity, "UNAVAILABLE", if (!settings.enabled) "DELIVERY_DISABLED" else "NOTIFICATIONS_BLOCKED", stamp)
        if (it.status == "RINGING") store.action(it.identity, ReminderAction.MISS, nowUtc = stamp)
      }
      maintenance(context, null)
      val result = ReminderCapabilities.json(context, settings).put("scheduled", 0).put("cancelled", cancelled).put("failed", 0)
      registrationPolicy.completePass()
      return result
    }
    current.filter { it.status == "RINGING" }.forEach { record ->
      val deadline = record.ringingDeadline
      if (!record.sourceValid || deadline == null || Instant.parse(deadline) <= now) {
        if (deadline != null) store.timeout(record.identity, deadline, stamp)
        else store.action(record.identity, ReminderAction.MISS, nowUtc = stamp)
        cancelIdentity(context, record.identity)
        store.removeRegistration(record.identity.jobId)
      } else {
        try {
          if (!registrationPolicy.canReuseTimeout(record)) {
            schedule(context, record.identity, ReminderIntents.TIMEOUT, deadline)
          }
          if (record.notifiedAt == null) {
            ReminderNotifications.post(context, record, settings)
            if (!store.markNotificationPosted(record.identity, stamp)) ReminderNotifications.cancel(context, record.identity)
          } else if (ReminderNotifications.visible(context, record.identity)) {
            // Refresh edited title/content silently, but never resurrect a dismissed alert.
            ReminderNotifications.post(context, record, settings)
          }
        } catch (_: RuntimeException) {
          store.markDelivery(record.identity, "FAILED", "RING_RESTORE_FAILED", stamp)
          store.action(record.identity, ReminderAction.MISS, nowUtc = stamp)
          cancelIdentity(context, record.identity)
          failed++
        }
      }
    }
    val due = current.filter { it.status == "PENDING" && Instant.parse(it.runAt) <= now }
    due.take(MAX_DUE_PER_PASS).forEach { deliver(context, store, it.identity, stamp) }
    current = store.listCurrent()
    val future = current.filter { it.status == "PENDING" && Instant.parse(it.runAt) > now && it.sourceValid }
      .sortedBy { Instant.parse(it.runAt) }
    val selected = future.take(MAX_REGISTERED).map { it.identity }.toSet()
    // An inserted earlier reminder can move an old registration outside the window.
    store.registrations().forEach { registration ->
      val record = current.firstOrNull { it.identity == registration.identity }
      if (record?.status == "PENDING" && registration.identity !in selected) {
        cancelIdentity(context, registration.identity)
        store.removeRegistration(registration.identity.jobId)
        store.markDelivery(registration.identity, "PENDING", "WINDOW_DEFERRED", stamp)
      }
    }
    val registrations = store.registrations().associateBy { it.identity.jobId }
    val precision = if (ReminderCapabilities.exact(context)) "EXACT" else "INEXACT"
    future.take(MAX_REGISTERED).forEach { record ->
      // Avoid resetting unchanged neighboring alarms on every due callback or
      // app resume: Android can clamp each new set() to its minimum futurity.
      // Only this process's completed restoration makes the cache trustworthy.
      if (registrationPolicy.canReuse(registrations[record.identity.jobId], record, precision)) return@forEach
      try {
        val actualPrecision = schedule(context, record.identity, ReminderIntents.DUE, record.runAt)
        if (store.upsertRegistration(AlarmRegistration(record.identity, record.runAt, actualPrecision, stamp))) scheduled++
        else cancelIdentity(context, record.identity)
      } catch (_: RuntimeException) {
        cancelIdentity(context, record.identity)
        store.markDelivery(record.identity, "FAILED", "ALARM_REGISTRATION_FAILED", stamp)
        store.recordEvent(record.identity, "REGISTRATION_FAILED", stamp, record.runAt, "ALARM_REGISTRATION_FAILED")
        failed++
      }
    }
    // Keep the platform queue bounded. One inexact sweep advances the next window;
    // it never promises exact delivery if exact-alarm access is unavailable.
    val overflow = future.size > MAX_REGISTERED || due.size > MAX_DUE_PER_PASS
    maintenance(context, if (!overflow) null else if (due.size > MAX_DUE_PER_PASS) now.toEpochMilli() + 60_000
      else Instant.parse(future.first().runAt).toEpochMilli() + 1000)
    val result = ReminderCapabilities.json(context, settings).put("scheduled", scheduled).put("cancelled", cancelled).put("failed", failed)
    registrationPolicy.completePass()
    return result
  }

  fun handle(context: Context, intent: android.content.Intent) = withStore(context) { store ->
    if (ReminderIntents.kind(intent) == ReminderIntents.MAINTENANCE) {
      reconcileLocked(context, store)
      return@withStore
    }
    val identity = ReminderIntents.identity(context, intent) ?: return@withStore
    val now = ReminderPolicy.format(Instant.now())
    when (ReminderIntents.kind(intent)) {
      ReminderIntents.DUE -> if (store.settings().enabled) deliver(context, store, identity, now)
      ReminderIntents.TIMEOUT -> {
        val current = store.get(identity)
        val applied = current?.ringingDeadline?.let { store.timeout(identity, it, now).applied } ?: false
        if (applied || current == null || current.status != "RINGING") cancelIdentity(context, identity)
      }
      ReminderIntents.ACK -> {
        if (store.action(identity, ReminderAction.ACK, nowUtc = now).applied) cancelIdentity(context, identity)
      }
      ReminderIntents.SNOOZE -> {
        if (store.action(identity, ReminderAction.SNOOZE, nowUtc = now).applied) cancelIdentity(context, identity)
      }
    }
    reconcileLocked(context, store)
  }

  fun diagnostics(context: Context): JSONObject = withStore(context) { store ->
    val current = store.listCurrent()
    val counts = JSONObject().put("pending", current.count { it.status == "PENDING" })
      .put("ringing", current.count { it.status == "RINGING" }).put("registered", store.registrations().size)
      .put("failed", store.countFailedDeliveries())
    val events = JSONArray()
    store.recentEvents().forEach { events.put(JSONObject(it)) }
    JSONObject().put("capabilities", ReminderCapabilities.json(context, store.settings())).put("counts", counts).put("events", events)
  }
}
