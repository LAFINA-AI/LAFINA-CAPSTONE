package com.lafina.capstone

import android.content.ComponentName
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CallPrivacyTest {
  @Test fun mainActivityNeverOptsOutOfKeyguard() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    @Suppress("DEPRECATION")
    val info = context.packageManager.getActivityInfo(ComponentName(context, MainActivity::class.java), 0)
    // Manifest bits are @hide in the public SDK; inspect the installed package
    // flags without hidden-API reflection. Values verified against AOSP:
    // https://github.com/aosp-mirror/platform_frameworks_base/blob/master/core/java/android/content/pm/ActivityInfo.java
    assertEquals(0, info.flags and 0x800000) // FLAG_SHOW_WHEN_LOCKED
    assertEquals(0, info.flags and 0x1000000) // FLAG_TURN_SCREEN_ON
  }
}
