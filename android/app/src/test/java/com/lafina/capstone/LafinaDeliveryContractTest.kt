package com.lafina.capstone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** AGY-PORT 03: pure delivery contract (identity, codec, claims, restore, cutover) on the JVM. */
class LafinaDeliveryContractTest {

  private class MemoryStore : DeliveryKeyValueStore {
    val values = linkedMapOf<String, String>()
    override fun all(): Map<String, String> = LinkedHashMap(values)
    override fun get(key: String): String? = values[key]
    override fun put(key: String, value: String) {
      values[key] = value
    }
    override fun remove(key: String) {
      values.remove(key)
    }
  }

  private var now = 1_800_000_000_000L
  private val registryStore = MemoryStore()
  private val stateStore = MemoryStore()
  private val core = DeliveryRegistryCore(registryStore, stateStore) { now }

  private fun registration(id: String, owner: String = "owner-a", generation: Long = 1, offsetMs: Long = 60_000) =
      DeliveryRegistration(DeliveryIdentity(owner, id, generation), now + offsetMs, "Synthetic $id")

  private fun events() = core.drainReceipts().map { it.event }

  @Test
  fun `identity uri matches the shared JS vector`() {
    assertEquals(
        "lafina-capstone://reminder/due/user%40ustp.edu.ph/rem%201%2F%C3%BC%7E/7",
        DeliveryIdentity("user@ustp.edu.ph", "rem 1/ü~", 7).uri(DeliveryContract.OP_DUE))
    assertEquals("lafina-capstone://reminder/call/~/r/0", DeliveryIdentity("", "r", 0).uri("call"))
  }

  @Test
  fun `java hash-colliding ids get distinct uris and tags`() {
    assertEquals("Aa".hashCode(), "BB".hashCode())
    val aa = DeliveryIdentity("o", "Aa", 1)
    val bb = DeliveryIdentity("o", "BB", 1)
    assertNotEquals(aa.uri("due"), bb.uri("due"))
    assertNotEquals(aa.notificationTag(), bb.notificationTag())
  }

  @Test
  fun `uri parse round-trips and rejects foreign or malformed data`() {
    val identity = DeliveryIdentity("owner|x", "rem/1", 42)
    val parsed = DeliveryContract.parse(identity.uri("answer"))!!
    assertEquals(identity, parsed.identity)
    assertEquals("answer", parsed.operation)
    assertNull(DeliveryContract.parse(null))
    assertNull(DeliveryContract.parse("https://reminder/due/o/r/1"))
    assertNull(DeliveryContract.parse("lafina-capstone://reminder/ring/o/r/1"))
    assertNull(DeliveryContract.parse("lafina-capstone://reminder/due/o/r/-1"))
    assertNull(DeliveryContract.parse("lafina-capstone://reminder/due/o/%4/1"))
  }

  @Test
  fun `registry records round-trip and newer formats are left untouched`() {
    val record = registration("r|1").copy(task = "Exam | room 3")
    assertEquals(record, DeliveryRegistration.decode(record.encode()))
    registryStore.values["future"] = "v3|x"
    assertTrue(core.list().isEmpty())
    assertEquals(listOf("future"), core.unreadableKeys())
    core.restore()
    assertEquals("v3|x", registryStore.values["future"])
  }

  @Test
  fun `only the exact current identity fires, once`() {
    core.put(registration("r1", generation = 2))
    assertEquals(FireOutcome.STALE, core.claim(DeliveryIdentity("owner-a", "r1", 1)).outcome)
    assertEquals(FireOutcome.STALE, core.claim(DeliveryIdentity("owner-b", "r1", 2)).outcome)
    assertEquals(FireOutcome.FIRE, core.claim(DeliveryIdentity("owner-a", "r1", 2)).outcome)
    assertEquals(FireOutcome.DUPLICATE, core.claim(DeliveryIdentity("owner-a", "r1", 2)).outcome)
    assertEquals(listOf("stale_ignored", "stale_ignored", "fired", "duplicate_ignored"), events())
  }

  @Test
  fun `put returns the replaced registration so its intent can be cancelled`() {
    assertNull(core.put(registration("r1", generation = 1)))
    assertEquals(1L, core.put(registration("r1", generation = 2))!!.identity.generation)
  }

  @Test
  fun `inactive owners and signed-out devices are suppressed natively`() {
    core.put(registration("ra", owner = "owner-a"))
    core.put(registration("rb", owner = "owner-b"))
    core.put(registration("legacy", owner = "", generation = 0))
    core.setActiveOwner("owner-b")
    assertEquals(FireOutcome.OWNER_SUPPRESSED, core.claim(DeliveryIdentity("owner-a", "ra", 1)).outcome)
    assertEquals(FireOutcome.FIRE, core.claim(DeliveryIdentity("owner-b", "rb", 1)).outcome)
    core.setActiveOwner("")
    assertEquals(FireOutcome.OWNER_SUPPRESSED, core.claim(DeliveryIdentity("", "legacy", 0)).outcome)
  }

  @Test
  fun `restore rearms future work, fires within 15 minutes and expires older work`() {
    core.put(registration("future", offsetMs = 60_000))
    core.put(registration("late", offsetMs = -14 * 60_000))
    core.put(registration("old", offsetMs = -16 * 60_000))
    val actions = core.restore().associateBy {
      when (it) {
        is RestoreAction.Rearm -> it.registration.identity.reminderId
        is RestoreAction.FireLate -> it.registration.identity.reminderId
        is RestoreAction.Expire -> it.registration.identity.reminderId
      }
    }
    assertTrue(actions["future"] is RestoreAction.Rearm)
    assertTrue(actions["late"] is RestoreAction.FireLate)
    assertTrue(actions["old"] is RestoreAction.Expire)
    assertEquals(listOf("future"), core.list().map { it.identity.reminderId })
    // A second restore (both boot receivers run) cannot fire the late one again.
    assertFalse(core.restore().any { it is RestoreAction.FireLate })
  }

  @Test
  fun `legacy cutover adopts generation 0 once and never overwrites newer registrations`() {
    core.put(registration("kept", generation = 5))
    val actions =
        core.adoptLegacy(
            listOf(
                LegacyAlarm("kept", "Old", now + 1_000),
                LegacyAlarm("future", "F", now + 60_000),
                LegacyAlarm("late", "L", now - 60_000),
                LegacyAlarm("ancient", "A", now - 3_600_000)))
    assertEquals(3, actions.size)
    assertEquals(5L, core.get("kept")!!.identity.generation)
    assertEquals(DeliveryIdentity("", "future", 0), core.get("future")!!.identity)
    assertNull(core.get("late"))
    assertNull(core.get("ancient"))
    assertTrue(actions.any { it is RestoreAction.FireLate && it.registration.identity.reminderId == "late" })
    assertFalse(core.cutoverDone())
    core.markCutoverDone()
    assertTrue(core.cutoverDone())
    assertTrue(core.adoptLegacy(listOf(LegacyAlarm("future", "F", now + 60_000))).isEmpty())
  }

  @Test
  fun `receipts are bounded, redacted and drained once`() {
    repeat(DeliveryContract.MAX_RECEIPTS + 10) { core.receipt("fired", DeliveryIdentity("o", "r$it", 1)) }
    val drained = core.drainReceipts()
    assertEquals(DeliveryContract.MAX_RECEIPTS, drained.size)
    assertEquals("r10", drained.first().reminderId)
    assertTrue(core.drainReceipts().isEmpty())
    assertFalse(stateStore.values.values.any { it.contains("Synthetic") })
  }

  // Pre-advance remediation: one engine per generation, even in the listing-to-dispatch gap.

  @Test
  fun `native fires first then the foreground claim is refused`() {
    val reg = registration("r1", generation = 3)
    core.put(reg)
    assertEquals(FireOutcome.FIRE, core.claim(reg.identity).outcome)
    val claim = core.claimForeground(reg.identity)
    assertEquals(ForegroundOutcome.ALREADY_CLAIMED, claim.outcome)
    assertNull(claim.superseded)
  }

  @Test
  fun `foreground claims first then the alarm broadcast is inert`() {
    val reg = registration("r2", generation = 4)
    core.put(reg)
    val claim = core.claimForeground(reg.identity)
    assertEquals(ForegroundOutcome.CLAIMED, claim.outcome)
    assertEquals(reg, claim.superseded)
    assertNull(core.get("r2"))
    assertEquals(FireOutcome.DUPLICATE, core.claim(reg.identity).outcome)
    // A second foreground pass for the same generation is refused too.
    assertEquals(ForegroundOutcome.ALREADY_CLAIMED, core.claimForeground(reg.identity).outcome)
  }

  @Test
  fun `foreground may ring when native never held the reminder`() {
    val identity = DeliveryIdentity("owner-a", "r3", 2)
    assertEquals(ForegroundOutcome.CLAIMED, core.claimForeground(identity).outcome)
    // A later generation (for example after a snooze) can be claimed again.
    assertEquals(ForegroundOutcome.CLAIMED, core.claimForeground(identity.copy(generation = 3)).outcome)
    assertEquals(3L, core.lastClaimedGeneration("r3"))
  }

  @Test
  fun `foreground supersedes an older or adopted entry but never a newer or foreign one`() {
    core.put(DeliveryRegistration(DeliveryIdentity("", "legacy", 0), now + 60_000, "Old"))
    val adopted = core.claimForeground(DeliveryIdentity("owner-a", "legacy", 1))
    assertEquals(ForegroundOutcome.CLAIMED, adopted.outcome)
    assertEquals(0L, adopted.superseded?.identity?.generation)

    core.put(registration("newer", generation = 5))
    assertEquals(ForegroundOutcome.STALE, core.claimForeground(DeliveryIdentity("owner-a", "newer", 4)).outcome)
    assertTrue(core.get("newer") != null)

    core.put(registration("foreign", owner = "owner-b", generation = 1))
    assertEquals(ForegroundOutcome.STALE, core.claimForeground(DeliveryIdentity("owner-a", "foreign", 2)).outcome)
    assertTrue(core.get("foreign") != null)
  }

  @Test
  fun `claim markers stay bounded`() {
    for (i in 0 until DeliveryRegistryCore.MAX_CLAIMS + 10) {
      core.claimForeground(DeliveryIdentity("owner-a", "bulk-$i", 1))
    }
    assertNull(core.lastClaimedGeneration("bulk-0"))
    assertEquals(1L, core.lastClaimedGeneration("bulk-${DeliveryRegistryCore.MAX_CLAIMS + 9}"))
  }
}
