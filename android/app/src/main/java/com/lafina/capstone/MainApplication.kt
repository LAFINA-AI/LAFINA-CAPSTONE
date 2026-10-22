package com.lafina.capstone

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.lafina.capstone.reminders.ReminderPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(CapstoneBuildPackage())
          add(ReminderPackage())
        },
      useDevSupport = BuildConfig.BUILD_TYPE == "debug",
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Native reminder delivery must not load React/Hermes or OP-SQLite's SQLite copy.
    if (Application.getProcessName() == packageName) loadReactNative(this)
  }
}
