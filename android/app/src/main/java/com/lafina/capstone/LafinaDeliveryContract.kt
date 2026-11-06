package com.lafina.capstone

/*
 * AGY-PORT 03 reminder delivery contract. Everything in this file is plain
 * Kotlin (no Android framework types), so the identity format, registry codec,
 * claim/fence rules, boot-restore bounds and the legacy cutover plan run as
 * JVM unit tests. LafinaReminderModule supplies the SharedPreferences,
 * AlarmManager and notification I/O around it.
 *
 * Protocol: native code never opens lafina.db (ADR-016: one SQLite library per
 * process). JS owns the authoritative jobs in SQLite and registers each armed
 * generation here; this registry is the native side's own durable state in a
 * separate SharedPreferences file. Receipts flow back to JS as redacted events.
 */

/** Owner + reminder + generation. Generation 0 marks an adopted legacy registration. */
data class DeliveryIdentity(val ownerId: String, val reminderId: String, val generation: Long) {
  init {
    require(reminderId.isNotEmpty() && reminderId.length <= DeliveryContract.MAX_ID_LENGTH) {
      "reminderId is required"
    }
    require(ownerId.length <= DeliveryContract.MAX_ID_LENGTH) { "ownerId is too long" }
    require(generation >= 0) { "generation must not be negative" }
  }

  /** Full Intent data URI; Android matches PendingIntents on it, so hashes never merge work. */
  fun uri(operation: String): String {
    require(operation in DeliveryContract.OPERATIONS) { "unknown operation" }
    return "${DeliveryContract.SCHEME}://${DeliveryContract.HOST}/$operation/" +
        "${DeliveryContract.encode(ownerId)}/${DeliveryContract.encode(reminderId)}/$generation"
  }

  fun notificationTag(): String = DeliveryContract.notificationTag(reminderId)
}

data class DeliveryRegistration(
    val identity: DeliveryIdentity,
    val triggerAtMs: Long,
    val task: String
) {
  fun encode(): String =
      listOf(
              DeliveryContract.RECORD_FORMAT,
              DeliveryContract.encode(identity.ownerId),
              DeliveryContract.encode(identity.reminderId),
              identity.generation.toString(),
              triggerAtMs.toString(),
              DeliveryContract.encode(task))
          .joinToString("|")

  companion object {
    /** Null for a malformed record or one written by a newer format (left untouched). */
    fun decode(raw: String?): DeliveryRegistration? {
      val parts = raw?.split("|") ?: return null
      if (parts.size != 6 || parts[0] != DeliveryContract.RECORD_FORMAT) return null
      return try {
        DeliveryRegistration(
            DeliveryIdentity(
                DeliveryContract.decode(parts[1]),
                DeliveryContract.decode(parts[2]),
                parts[3].toLong()),
            parts[4].toLong(),
            DeliveryContract.decode(parts[5]))
      } catch (_: Exception) {
        null
      }
    }
  }
}

data class ParsedDeliveryUri(val identity: DeliveryIdentity, val operation: String)

/** A pre-AGY-PORT-03 registry entry (hash request code, no owner or generation). */
data class LegacyAlarm(val reminderId: String, val task: String, val triggerAtMs: Long)

data class DeliveryReceipt(
    val atMs: Long,
    val event: String,
    val reminderId: String,
    val ownerId: String,
    val generation: Long
) {
  fun encode(): String =
      "$atMs|${DeliveryContract.encode(event)}|${DeliveryContract.encode(reminderId)}|" +
          "${DeliveryContract.encode(ownerId)}|$generation"

  companion object {
    fun decode(line: String): DeliveryReceipt? {
      val parts = line.split("|")
      if (parts.size != 5) return null
      return try {
        DeliveryReceipt(
            parts[0].toLong(),
            DeliveryContract.decode(parts[1]),
            DeliveryContract.decode(parts[2]),
            DeliveryContract.decode(parts[3]),
            parts[4].toLong())
      } catch (_: Exception) {
        null
      }
    }
  }
}

object DeliveryContract {
  const val SCHEME = "lafina-capstone"
  const val HOST = "reminder"
  const val OP_DUE = "due"
  const val OP_CALL = "call"
  const val OP_ANSWER = "answer"
  const val OP_DECLINE = "decline"
  val OPERATIONS = setOf(OP_DUE, OP_CALL, OP_ANSWER, OP_DECLINE)
  const val RECORD_FORMAT = "v2"
  const val MAX_ID_LENGTH = 2048
  /** Same finite late-delivery bound as the JS rescheduler's missed threshold. */
  const val LATE_GRACE_MS = 15L * 60L * 1000L
  const val MAX_RECEIPTS = 64
  private const val EMPTY = "~"
  private const val HEX = "0123456789ABCDEF"

  /** Keeps A-Z a-z 0-9 - . _, percent-encodes every other UTF-8 byte; "" is "~". */
  fun encode(value: String): String {
    if (value.isEmpty()) return EMPTY
    val out = StringBuilder()
    for (byte in value.toByteArray(Charsets.UTF_8)) {
      val c = byte.toInt() and 0xFF
      val ch = c.toChar()
      if (ch in 'A'..'Z' || ch in 'a'..'z' || ch in '0'..'9' || ch == '-' || ch == '.' || ch == '_') {
        out.append(ch)
      } else {
        out.append('%').append(HEX[c shr 4]).append(HEX[c and 0x0F])
      }
    }
    return out.toString()
  }

  fun decode(value: String): String {
    if (value == EMPTY) return ""
    val bytes = java.io.ByteArrayOutputStream()
    var i = 0
    while (i < value.length) {
      val ch = value[i]
      if (ch == '%') {
        require(i + 2 < value.length) { "truncated escape" }
        bytes.write(value.substring(i + 1, i + 3).toInt(16))
        i += 3
      } else {
        require(ch.code < 0x80) { "unencoded character" }
        bytes.write(ch.code)
        i += 1
      }
    }
    return String(bytes.toByteArray(), Charsets.UTF_8)
  }

  fun notificationTag(reminderId: String): String = "lafina-reminder:${encode(reminderId)}"

  fun parse(uri: String?): ParsedDeliveryUri? {
    val prefix = "$SCHEME://$HOST/"
    if (uri == null || !uri.startsWith(prefix)) return null
    val parts = uri.substring(prefix.length).split("/")
    if (parts.size != 4 || parts[0] !in OPERATIONS) return null
    return try {
      ParsedDeliveryUri(
          DeliveryIdentity(decode(parts[1]), decode(parts[2]), parts[3].toLong()), parts[0])
    } catch (_: Exception) {
      null
    }
  }
}

/** Synchronous durable key/value storage (SharedPreferences with commit() on Android). */
interface DeliveryKeyValueStore {
  fun all(): Map<String, String>
  fun get(key: String): String?
  fun put(key: String, value: String)
  fun remove(key: String)
}

enum class FireOutcome {
  FIRE,
  DUPLICATE,
  STALE,
  OWNER_SUPPRESSED
}

data class FireDecision(val outcome: FireOutcome, val registration: DeliveryRegistration?)

/** Result of a foreground (JS fallback) claim; see [DeliveryRegistryCore.claimForeground]. */
enum class ForegroundOutcome(val code: String) {
  /** JS may ring this generation; native can no longer ring it. */
  CLAIMED("claimed"),
  /** Native (or an earlier foreground claim) already took this or a newer generation. */
  ALREADY_CLAIMED("already_claimed"),
  /** Native holds a newer or different identity: the caller's view is out of date. */
  STALE("stale")
}

/** [superseded] is the registration the claim removed; its PendingIntent must be cancelled. */
data class ForegroundClaim(val outcome: ForegroundOutcome, val superseded: DeliveryRegistration?)

sealed class RestoreAction {
  data class Rearm(val registration: DeliveryRegistration) : RestoreAction()
  data class FireLate(val registration: DeliveryRegistration) : RestoreAction()
  data class Expire(val registration: DeliveryRegistration) : RestoreAction()
}

/**
 * Registry logic. Callers serialize access (one lock per process); every write
 * is a synchronous commit, so a claim is durable before a call is posted and a
 * duplicate broadcast finds nothing left to claim.
 */
class DeliveryRegistryCore(
    private val registry: DeliveryKeyValueStore,
    private val state: DeliveryKeyValueStore,
    private val clock: () -> Long
) {
  companion object {
    const val KEY_ACTIVE_OWNER = "active_owner"
    const val KEY_CUTOVER = "legacy_cutover_version"
    const val KEY_RECEIPTS = "receipts"
    const val KEY_CLAIMS = "claims"
    const val CUTOVER_VERSION = "1"
    /** Last claimed generation per reminder, bounded like receipts. */
    const val MAX_CLAIMS = 256
  }

  fun get(reminderId: String): DeliveryRegistration? = DeliveryRegistration.decode(registry.get(reminderId))

  /** Readable registrations; newer-format or corrupt records are reported, never deleted. */
  fun list(): List<DeliveryRegistration> =
      registry.all().values.mapNotNull { DeliveryRegistration.decode(it) }
          .sortedBy { it.identity.reminderId }

  fun unreadableKeys(): List<String> =
      registry.all().filter { DeliveryRegistration.decode(it.value) == null }.keys.sorted()

  /** Stores the registration and returns the one it replaces (its PendingIntent must be cancelled). */
  fun put(registration: DeliveryRegistration): DeliveryRegistration? {
    val previous = get(registration.identity.reminderId)
    registry.put(registration.identity.reminderId, registration.encode())
    return previous
  }

  fun remove(reminderId: String): DeliveryRegistration? {
    val previous = get(reminderId)
    if (registry.get(reminderId) != null) registry.remove(reminderId)
    return previous
  }

  /** null = unknown (older JS never set it), "" = nobody signed in, else the active owner. */
  fun activeOwner(): String? = state.get(KEY_ACTIVE_OWNER)

  fun setActiveOwner(ownerId: String) = state.put(KEY_ACTIVE_OWNER, ownerId)

  private fun suppressedFor(registration: DeliveryRegistration): Boolean {
    val active = activeOwner() ?: return false
    if (active.isEmpty()) return true
    val owner = registration.identity.ownerId
    return owner.isNotEmpty() && owner != active
  }

  /**
   * Claims the registration an alarm broadcast names. Only the exact current
   * identity fires, once; superseded generations and duplicates are inert.
   */
  fun claim(identity: DeliveryIdentity): FireDecision {
    val current = get(identity.reminderId)
    if (current == null) {
      receipt("duplicate_ignored", identity)
      return FireDecision(FireOutcome.DUPLICATE, null)
    }
    if (current.identity != identity) {
      receipt("stale_ignored", identity)
      return FireDecision(FireOutcome.STALE, current)
    }
    registry.remove(identity.reminderId)
    recordClaim(identity)
    if (suppressedFor(current)) {
      receipt("suppressed_inactive_owner", identity)
      return FireDecision(FireOutcome.OWNER_SUPPRESSED, current)
    }
    receipt("fired", identity)
    return FireDecision(FireOutcome.FIRE, current)
  }

  /**
   * Claim for the in-app fallback ringer. It and [claim] run under the same
   * process lock and both consume the same registry entry, and every claim is
   * remembered per reminder, so exactly one of them can ring a generation:
   * - an entry for this identity, or an older generation of the same owner
   *   (including an adopted legacy entry), is removed and claimed here;
   * - no entry, but this or a newer generation was already claimed (native
   *   fired first): [ForegroundOutcome.ALREADY_CLAIMED];
   * - no entry and no earlier claim (registration had failed): claimed;
   * - a newer or foreign identity: [ForegroundOutcome.STALE].
   */
  fun claimForeground(identity: DeliveryIdentity): ForegroundClaim {
    val current = get(identity.reminderId)
    if (current == null) {
      val claimed = lastClaimedGeneration(identity.reminderId)
      if (claimed != null && claimed >= identity.generation) {
        receipt("foreground_already_claimed", identity)
        return ForegroundClaim(ForegroundOutcome.ALREADY_CLAIMED, null)
      }
      recordClaim(identity)
      receipt("foreground_claimed", identity)
      return ForegroundClaim(ForegroundOutcome.CLAIMED, null)
    }
    val held = current.identity
    val sameOwner = held.ownerId.isEmpty() || held.ownerId == identity.ownerId
    if (held == identity || (sameOwner && held.generation < identity.generation)) {
      registry.remove(identity.reminderId)
      recordClaim(identity)
      receipt("foreground_claimed", identity)
      return ForegroundClaim(ForegroundOutcome.CLAIMED, current)
    }
    receipt("foreground_stale", identity)
    return ForegroundClaim(ForegroundOutcome.STALE, null)
  }

  /** The highest generation already claimed for [reminderId], or null. */
  fun lastClaimedGeneration(reminderId: String): Long? {
    val key = DeliveryContract.encode(reminderId)
    return claimLines()
        .mapNotNull { line ->
          val parts = line.split(" ")
          if (parts.size == 2 && parts[0] == key) parts[1].toLongOrNull() else null
        }
        .maxOrNull()
  }

  private fun claimLines(): List<String> =
      state.get(KEY_CLAIMS)?.split("\n")?.filter { it.isNotEmpty() } ?: emptyList()

  private fun recordClaim(identity: DeliveryIdentity) {
    val key = DeliveryContract.encode(identity.reminderId)
    val kept = claimLines().filterNot { it.startsWith("$key ") }
    state.put(KEY_CLAIMS, (kept + "$key ${identity.generation}").takeLast(MAX_CLAIMS).joinToString("\n"))
  }

  /** Boot, package replace, time or timezone change, exact-alarm permission change. */
  fun restore(): List<RestoreAction> {
    val now = clock()
    return list().map { registration -> restoreOne(registration, now) }
  }

  private fun restoreOne(registration: DeliveryRegistration, now: Long): RestoreAction {
    if (registration.triggerAtMs > now) return RestoreAction.Rearm(registration)
    if (now - registration.triggerAtMs <= DeliveryContract.LATE_GRACE_MS) {
      val decision = claim(registration.identity)
      return if (decision.outcome == FireOutcome.FIRE) RestoreAction.FireLate(registration)
      else RestoreAction.Expire(registration)
    }
    registry.remove(registration.identity.reminderId)
    receipt("expired", registration.identity)
    return RestoreAction.Expire(registration)
  }

  fun cutoverDone(): Boolean = state.get(KEY_CUTOVER) == CUTOVER_VERSION

  /**
   * Versioned, idempotent cutover of the old registry. Each legacy alarm is
   * adopted as owner "" generation 0 (unless a v2 registration already exists)
   * and then handled like a restore. The caller cancels each legacy
   * PendingIntent, removes the legacy entry, and finally calls [markCutoverDone].
   */
  fun adoptLegacy(legacy: List<LegacyAlarm>): List<RestoreAction> {
    val now = clock()
    val actions = mutableListOf<RestoreAction>()
    for (alarm in legacy) {
      if (alarm.reminderId.isEmpty() || alarm.reminderId.length > DeliveryContract.MAX_ID_LENGTH) continue
      if (get(alarm.reminderId) != null) continue
      val registration =
          DeliveryRegistration(DeliveryIdentity("", alarm.reminderId, 0), alarm.triggerAtMs, alarm.task)
      registry.put(alarm.reminderId, registration.encode())
      receipt("legacy_adopted", registration.identity)
      actions.add(restoreOne(registration, now))
    }
    return actions
  }

  fun markCutoverDone() = state.put(KEY_CUTOVER, CUTOVER_VERSION)

  fun receipt(event: String, identity: DeliveryIdentity) {
    val line = DeliveryReceipt(clock(), event, identity.reminderId, identity.ownerId, identity.generation).encode()
    val existing = state.get(KEY_RECEIPTS)?.split("\n")?.filter { it.isNotEmpty() } ?: emptyList()
    state.put(KEY_RECEIPTS, (existing + line).takeLast(DeliveryContract.MAX_RECEIPTS).joinToString("\n"))
  }

  fun drainReceipts(): List<DeliveryReceipt> {
    val lines = state.get(KEY_RECEIPTS)?.split("\n")?.filter { it.isNotEmpty() } ?: emptyList()
    state.remove(KEY_RECEIPTS)
    return lines.mapNotNull { DeliveryReceipt.decode(it) }
  }
}
