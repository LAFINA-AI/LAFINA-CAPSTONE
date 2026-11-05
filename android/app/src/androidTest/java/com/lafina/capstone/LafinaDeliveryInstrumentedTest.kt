package com.lafina.capstone

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * AGY-PORT 03 device checks that need the Android framework. Uses only
 * test-named SharedPreferences files and synthetic identities; it never reads,
 * clears or replaces the app's real reminder registry or lafina.db.
 */
@RunWith(AndroidJUnit4::class)
class LafinaDeliveryInstrumentedTest {
  private val context: Context
    get() = InstrumentationRegistry.getInstrumentation().targetContext

  private lateinit var registryPrefs: SharedPreferences
  private lateinit var statePrefs: SharedPreferences

  private class PrefsStore(private val preferences: SharedPreferences) : DeliveryKeyValueStore {
    override fun all(): Map<String, String> =
        preferences.all.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }.toMap()
    override fun get(key: String): String? = preferences.getString(key, null)
    override fun put(key: String, value: String) {
      preferences.edit().putString(key, value).commit()
    }
    override fun remove(key: String) {
      preferences.edit().remove(key).commit()
    }
  }

  @Before
  fun setUp() {
    registryPrefs = context.getSharedPreferences("agy_port_03_test_registry", Context.MODE_PRIVATE)
    statePrefs = context.getSharedPreferences("agy_port_03_test_state", Context.MODE_PRIVATE)
    registryPrefs.edit().clear().commit()
    statePrefs.edit().clear().commit()
  }

  @After
  fun tearDown() {
    registryPrefs.edit().clear().commit()
    statePrefs.edit().clear().commit()
  }

  @Test
  fun claimsSurviveReopeningTheRegistry() {
    val now = System.currentTimeMillis()
    val first = DeliveryRegistryCore(PrefsStore(registryPrefs), PrefsStore(statePrefs)) { now }
    val identity = DeliveryIdentity("synthetic-owner", "synthetic-reminder", 3)
    first.put(DeliveryRegistration(identity, now + 60_000, "Synthetic"))
    assertEquals(FireOutcome.FIRE, first.claim(identity).outcome)

    val reopened = DeliveryRegistryCore(PrefsStore(registryPrefs), PrefsStore(statePrefs)) { now }
    assertEquals(FireOutcome.DUPLICATE, reopened.claim(identity).outcome)
    assertEquals(listOf("fired", "duplicate_ignored"), reopened.drainReceipts().map { it.event })
  }

  @Test
  fun dataUrisKeepHashCollidingPendingIntentsApart() {
    val requestCode = 7399
    fun intentFor(id: String) =
        Intent(context, LafinaReminderReceiver::class.java).apply {
          action = "com.lafina.capstone.TEST_ONLY_IDENTITY"
          data = Uri.parse(DeliveryIdentity("synthetic-owner", id, 1).uri(DeliveryContract.OP_DUE))
        }
    val aa = PendingIntent.getBroadcast(context, requestCode, intentFor("Aa"),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    try {
      assertNotNull(PendingIntent.getBroadcast(context, requestCode, intentFor("Aa"),
          PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE))
      assertNull(PendingIntent.getBroadcast(context, requestCode, intentFor("BB"),
          PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE))
    } finally {
      aa.cancel()
    }
  }
}
