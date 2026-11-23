package com.lafina.capstone

import android.app.ActivityManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Where Android's package installer reports on an update LAFINA handed it
 * (`LafinaUpdaterModule.installApk`). When it needs the person to confirm, its
 * confirmation screen is shown — directly while LAFINA is on screen, or as a
 * notification if the person switched away (Android does not let a background
 * app open a screen). Anything else is passed to JS as a
 * `LafinaUpdaterInstallStatus` event. On success Android replaces the app,
 * which ends this process; [LafinaUpdateCompletedReceiver] takes over.
 */
class LafinaApkInstallReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
    when (status) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        val confirm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(Intent.EXTRA_INTENT)
        }
        if (confirm == null) {
          LafinaUpdaterModule.reportInstallStatus("failure", "Android did not show its install confirmation. Try again.")
          return
        }
        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (isInForeground()) {
          try {
            context.startActivity(confirm)
            LafinaUpdaterModule.reportInstallStatus("confirming", null)
            return
          } catch (error: Exception) {
            Log.w(TAG, "Could not show the install confirmation directly", error)
          }
        }
        if (UpdateNotifications.showConfirm(context, confirm)) {
          LafinaUpdaterModule.reportInstallStatus("confirming", null)
        } else {
          LafinaUpdaterModule.reportInstallStatus(
            "failure",
            "Android could not show its install confirmation. Open LAFINA and tap Install again.",
          )
        }
      }
      PackageInstaller.STATUS_SUCCESS -> LafinaUpdaterModule.reportInstallStatus("success", null)
      else -> {
        val detail = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        Log.w(TAG, "Install failed: $status $detail")
        UpdateNotifications.cancelConfirm(context)
        LafinaUpdaterModule.reportInstallStatus(
          if (status == PackageInstaller.STATUS_FAILURE_ABORTED) "cancelled" else "failure",
          describe(status),
        )
      }
    }
  }

  private fun isInForeground(): Boolean {
    val state = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(state)
    return state.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  private fun describe(status: Int): String = when (status) {
    PackageInstaller.STATUS_FAILURE_ABORTED -> "The update was not installed."
    PackageInstaller.STATUS_FAILURE_BLOCKED -> "Android blocked installing the update."
    PackageInstaller.STATUS_FAILURE_CONFLICT ->
      "The update is signed differently from the installed app, so Android refused it. Install it from the release page instead."
    PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> "This update does not work on this phone."
    PackageInstaller.STATUS_FAILURE_INVALID -> "The update file is not a valid app, so it was not installed."
    PackageInstaller.STATUS_FAILURE_STORAGE -> "There is not enough free space to install the update."
    else -> "The update could not be installed. Try again."
  }

  companion object {
    private const val TAG = "LafinaApkInstall"
  }
}

/**
 * After an update LAFINA installed itself, Android has closed the app. This
 * says so and offers to open it again. Updates installed any other way (from
 * a file manager, or adb during development) show nothing.
 */
class LafinaUpdateCompletedReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    UpdateNotifications.cancelConfirm(context)
    val version = OtaBundles.takeCompletedInstall(context) ?: return
    UpdateNotifications.showUpdated(context, version)
  }
}

internal object UpdateNotifications {
  private const val CHANNEL_ID = "lafina_app_updates"
  private const val CONFIRM_ID = 7301
  private const val UPDATED_ID = 7302

  private fun manager(context: Context): NotificationManager? {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return null
    if (!manager.areNotificationsEnabled()) return null
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        android.app.NotificationChannel(CHANNEL_ID, "App updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "When a LAFINA update needs you, or has finished installing"
          setSound(null, null)
        },
      )
    }
    return manager
  }

  fun showConfirm(context: Context, confirm: Intent): Boolean {
    val manager = manager(context) ?: return false
    return try {
      val tap = PendingIntent.getActivity(
        context,
        CONFIRM_ID,
        confirm,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      manager.notify(
        CONFIRM_ID,
        NotificationCompat.Builder(context, CHANNEL_ID)
          .setSmallIcon(R.mipmap.ic_launcher)
          .setContentTitle("Finish updating LAFINA")
          .setContentText("Tap to confirm the update.")
          .setContentIntent(tap)
          .setAutoCancel(true)
          .build(),
      )
      true
    } catch (error: Exception) {
      Log.w("LafinaApkInstall", "Could not post the install confirmation", error)
      false
    }
  }

  fun cancelConfirm(context: Context) {
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)?.cancel(CONFIRM_ID)
  }

  fun showUpdated(context: Context, version: String) {
    val manager = manager(context) ?: return
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    try {
      val tap = PendingIntent.getActivity(
        context,
        UPDATED_ID,
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      manager.notify(
        UPDATED_ID,
        NotificationCompat.Builder(context, CHANNEL_ID)
          .setSmallIcon(R.mipmap.ic_launcher)
          .setContentTitle(if (version.isBlank()) "LAFINA was updated" else "LAFINA $version is installed")
          .setContentText("Tap to open LAFINA and see what's new.")
          .setContentIntent(tap)
          .setAutoCancel(true)
          .build(),
      )
    } catch (error: Exception) {
      Log.w("LafinaApkInstall", "Could not post the update notice", error)
    }
  }
}
