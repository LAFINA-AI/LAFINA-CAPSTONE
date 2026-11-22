package com.lafina.capstone

import android.content.Context
import android.content.SharedPreferences

data class NativeAlertPreferences(
  val defaultAlarmSoundUri: String? = null,
  val alarmVibrationPattern: String = AlertPreferencesContract.PATTERN_STANDARD,
  val alarmVolumeRampSec: Int = 30,
  val notificationSoundUri: String? = null,
  val notificationVibrate: Boolean = true,
  val notificationVibrationPattern: String = AlertPreferencesContract.PATTERN_STANDARD,
  val notificationSnoozeMinutes: Int = 10,
  val lockScreenPrivacy: String = AlertPreferencesContract.PRIVACY_HIDE_TASK,
  val callRingtoneUri: String? = null,
  val callVibrate: Boolean = true,
  val callVibrationPattern: String = AlertPreferencesContract.PATTERN_STANDARD,
  val callRingTimeoutSec: Int = 45,
)

/**
 * SharedPreferences mirror for device-local alert, notification, and call
 * customization (ADR-016: native services and receivers read here instead of
 * opening lafina.db).
 */
object AlertPreferencesStoreNative {
  private val LOCK = Any()

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(AlertPrefsKeys.PREFS_NAME, Context.MODE_PRIVATE)

  fun read(context: Context): NativeAlertPreferences = synchronized(LOCK) {
    val sp = prefs(context)
    return NativeAlertPreferences(
      defaultAlarmSoundUri =
        AlertPreferencesContract.sanitizeToneUri(
          sp.getString(AlertPrefsKeys.DEFAULT_ALARM_SOUND_URI, null),
        ),
      alarmVibrationPattern =
        AlertPreferencesContract.sanitizeVibrationPattern(
          sp.getString(AlertPrefsKeys.ALARM_VIBRATION_PATTERN, null),
        ),
      alarmVolumeRampSec =
        AlertPreferencesContract.clampRampSeconds(
          sp.getInt(AlertPrefsKeys.ALARM_VOLUME_RAMP_SEC, 30),
        ),
      notificationSoundUri =
        AlertPreferencesContract.sanitizeToneUri(
          sp.getString(AlertPrefsKeys.NOTIFICATION_SOUND_URI, null),
        ),
      notificationVibrate = sp.getBoolean(AlertPrefsKeys.NOTIFICATION_VIBRATE, true),
      notificationVibrationPattern =
        AlertPreferencesContract.sanitizeVibrationPattern(
          sp.getString(AlertPrefsKeys.NOTIFICATION_VIBRATION_PATTERN, null),
        ),
      notificationSnoozeMinutes =
        AlertPreferencesContract.clampSnoozeMinutes(
          sp.getInt(AlertPrefsKeys.NOTIFICATION_SNOOZE_MINUTES, 10),
        ),
      lockScreenPrivacy =
        AlertPreferencesContract.sanitizeLockScreenPrivacy(
          sp.getString(AlertPrefsKeys.LOCK_SCREEN_PRIVACY, null),
        ),
      callRingtoneUri =
        AlertPreferencesContract.sanitizeToneUri(
          sp.getString(AlertPrefsKeys.CALL_RINGTONE_URI, null),
        ),
      callVibrate = sp.getBoolean(AlertPrefsKeys.CALL_VIBRATE, true),
      callVibrationPattern =
        AlertPreferencesContract.sanitizeVibrationPattern(
          sp.getString(AlertPrefsKeys.CALL_VIBRATION_PATTERN, null),
        ),
      callRingTimeoutSec =
        AlertPreferencesContract.clampRingTimeoutSec(
          sp.getInt(AlertPrefsKeys.CALL_RING_TIMEOUT_SEC, 45),
        ),
    )
  }

  fun write(context: Context, value: NativeAlertPreferences) = synchronized(LOCK) {
    val editor = prefs(context).edit()
    val alarmUri = AlertPreferencesContract.sanitizeToneUri(value.defaultAlarmSoundUri)
    if (alarmUri == null) editor.remove(AlertPrefsKeys.DEFAULT_ALARM_SOUND_URI)
    else editor.putString(AlertPrefsKeys.DEFAULT_ALARM_SOUND_URI, alarmUri)

    editor.putString(
      AlertPrefsKeys.ALARM_VIBRATION_PATTERN,
      AlertPreferencesContract.sanitizeVibrationPattern(value.alarmVibrationPattern),
    )
    editor.putInt(
      AlertPrefsKeys.ALARM_VOLUME_RAMP_SEC,
      AlertPreferencesContract.clampRampSeconds(value.alarmVolumeRampSec),
    )

    val notifyUri = AlertPreferencesContract.sanitizeToneUri(value.notificationSoundUri)
    if (notifyUri == null) editor.remove(AlertPrefsKeys.NOTIFICATION_SOUND_URI)
    else editor.putString(AlertPrefsKeys.NOTIFICATION_SOUND_URI, notifyUri)

    editor.putBoolean(AlertPrefsKeys.NOTIFICATION_VIBRATE, value.notificationVibrate)
    editor.putString(
      AlertPrefsKeys.NOTIFICATION_VIBRATION_PATTERN,
      AlertPreferencesContract.sanitizeVibrationPattern(value.notificationVibrationPattern),
    )
    editor.putInt(
      AlertPrefsKeys.NOTIFICATION_SNOOZE_MINUTES,
      AlertPreferencesContract.clampSnoozeMinutes(value.notificationSnoozeMinutes),
    )
    editor.putString(
      AlertPrefsKeys.LOCK_SCREEN_PRIVACY,
      AlertPreferencesContract.sanitizeLockScreenPrivacy(value.lockScreenPrivacy),
    )

    val callUri = AlertPreferencesContract.sanitizeToneUri(value.callRingtoneUri)
    if (callUri == null) editor.remove(AlertPrefsKeys.CALL_RINGTONE_URI)
    else editor.putString(AlertPrefsKeys.CALL_RINGTONE_URI, callUri)

    editor.putBoolean(AlertPrefsKeys.CALL_VIBRATE, value.callVibrate)
    editor.putString(
      AlertPrefsKeys.CALL_VIBRATION_PATTERN,
      AlertPreferencesContract.sanitizeVibrationPattern(value.callVibrationPattern),
    )
    editor.putInt(
      AlertPrefsKeys.CALL_RING_TIMEOUT_SEC,
      AlertPreferencesContract.clampRingTimeoutSec(value.callRingTimeoutSec),
    )
    editor.commit()
  }

  fun updateAlarmAudio(
    context: Context,
    defaultAlarmSoundUri: String?,
    vibrationPattern: String?,
    rampSec: Int,
  ) = synchronized(LOCK) {
    val editor = prefs(context).edit()
    val alarmUri = AlertPreferencesContract.sanitizeToneUri(defaultAlarmSoundUri)
    if (alarmUri == null || alarmUri == AlertPreferencesContract.TONE_SILENT) {
      editor.remove(AlertPrefsKeys.DEFAULT_ALARM_SOUND_URI)
    } else {
      editor.putString(AlertPrefsKeys.DEFAULT_ALARM_SOUND_URI, alarmUri)
    }
    editor.putString(
      AlertPrefsKeys.ALARM_VIBRATION_PATTERN,
      AlertPreferencesContract.sanitizeVibrationPattern(vibrationPattern),
    )
    editor.putInt(
      AlertPrefsKeys.ALARM_VOLUME_RAMP_SEC,
      AlertPreferencesContract.clampRampSeconds(rampSec),
    )
    editor.commit()
  }

  fun getActiveNotifyChannelId(context: Context): String? = synchronized(LOCK) {
    prefs(context).getString(AlertPrefsKeys.ACTIVE_NOTIFY_CHANNEL_ID, null)
  }

  fun setActiveNotifyChannelId(context: Context, channelId: String) = synchronized(LOCK) {
    prefs(context).edit().putString(AlertPrefsKeys.ACTIVE_NOTIFY_CHANNEL_ID, channelId).commit()
  }

  fun getActiveCallChannelId(context: Context): String? = synchronized(LOCK) {
    prefs(context).getString(AlertPrefsKeys.ACTIVE_CALL_CHANNEL_ID, null)
  }

  fun setActiveCallChannelId(context: Context, channelId: String) = synchronized(LOCK) {
    prefs(context).edit().putString(AlertPrefsKeys.ACTIVE_CALL_CHANNEL_ID, channelId).commit()
  }
}
