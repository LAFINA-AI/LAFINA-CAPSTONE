package com.lafina.capstone

import android.app.Activity
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LafinaSoundPickerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener, LifecycleEventListener {

  private var pendingPickerPromise: Promise? = null
  private var pendingPickerKind: String = KIND_ALARM
  private var previewPlayer: MediaPlayer? = null
  private var previewFocusRequest: AudioFocusRequest? = null
  private val handler = Handler(Looper.getMainLooper())
  private val stopPreviewRunnable = Runnable { stopPreviewInternal() }

  init {
    reactContext.addActivityEventListener(this)
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = "LafinaSoundPicker"

  override fun onHostResume() = Unit

  override fun onHostPause() {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      stopPreviewInternal()
    } else {
      handler.post { stopPreviewInternal() }
    }
  }

  override fun onHostDestroy() {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      stopPreviewInternal()
    } else {
      handler.post { stopPreviewInternal() }
    }
    pendingPickerPromise?.let {
      pendingPickerPromise = null
      it.resolve(
        Arguments.createMap().apply {
          putBoolean("cancelled", true)
          putNull("uri")
          putString("title", "")
        },
      )
    }
  }

  override fun invalidate() {
    reactContext.removeActivityEventListener(this)
    reactContext.removeLifecycleEventListener(this)
    handler.removeCallbacksAndMessages(null)
    if (Looper.myLooper() == Looper.getMainLooper()) {
      stopPreviewInternal()
    } else {
      handler.post { stopPreviewInternal() }
    }
    pendingPickerPromise = null
    super.invalidate()
  }

  override fun onNewIntent(intent: Intent) = Unit

  @ReactMethod
  fun listBundledTones(promise: Promise) {
    try {
      val list = Arguments.createArray()
      val pkg = reactContext.packageName
      for (tone in AlertPreferencesContract.BUNDLED_TONES) {
        list.pushMap(
          Arguments.createMap().apply {
            putString("id", tone.id)
            putString("rawName", tone.rawName)
            putString("label", tone.label)
            putString("uri", AlertPreferencesContract.bundledToneUri(pkg, tone.rawName))
          },
        )
      }
      promise.resolve(list)
    } catch (e: Exception) {
      promise.reject("TONE_LIST_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun pickSystemTone(kind: String, currentUri: String?, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Cannot open tone picker without an active screen.")
      return
    }
    if (pendingPickerPromise != null) {
      promise.reject("PICKER_BUSY", "A tone picker is already open.")
      return
    }
    val normalizedKind = normalizeKind(kind)
    val ringtoneType = ringtoneTypeForKind(normalizedKind)
    val allowSilent = normalizedKind != KIND_ALARM

    val intent =
      Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
        putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, ringtoneType)
        putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
        putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, allowSilent)
        putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, RingtoneManager.getDefaultUri(ringtoneType))
        putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, pickerTitleForKind(normalizedKind))
        val cleanCurrent = AlertPreferencesContract.sanitizeToneUri(currentUri)
        if (cleanCurrent != null && cleanCurrent != AlertPreferencesContract.TONE_SILENT) {
          putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(cleanCurrent))
        }
      }

    pendingPickerPromise = promise
    pendingPickerKind = normalizedKind
    try {
      activity.startActivityForResult(intent, REQUEST_CODE_PICK_TONE)
    } catch (e: Exception) {
      pendingPickerPromise = null
      promise.reject("PICKER_LAUNCH_ERROR", e.message, e)
    }
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) {
    if (requestCode != REQUEST_CODE_PICK_TONE) return
    val promise = pendingPickerPromise ?: return
    val kind = pendingPickerKind
    pendingPickerPromise = null

    if (resultCode != Activity.RESULT_OK) {
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("cancelled", true)
          putNull("uri")
          putString("title", "")
        },
      )
      return
    }

    val pickedUri: Uri? =
      if (data == null) null
      else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI, Uri::class.java)
      } else {
        @Suppress("DEPRECATION")
        data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
      }

    if (pickedUri == null) {
      if (kind != KIND_ALARM) {
        promise.resolve(
          Arguments.createMap().apply {
            putBoolean("cancelled", false)
            putString("uri", AlertPreferencesContract.TONE_SILENT)
            putString("title", "Silent")
          },
        )
      } else {
        promise.resolve(
          Arguments.createMap().apply {
            putBoolean("cancelled", false)
            putNull("uri")
            putString("title", "Default alarm tone")
          },
        )
      }
      return
    }

    val uriString = AlertPreferencesContract.sanitizeToneUri(pickedUri.toString())
    if (uriString == null) {
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("cancelled", false)
          putNull("uri")
          putString("title", defaultLabelForKind(kind))
        },
      )
      return
    }
    promise.resolve(
      Arguments.createMap().apply {
        putBoolean("cancelled", false)
        putString("uri", uriString)
        putString("title", resolveTitleSync(uriString, kind))
      },
    )
  }

  @ReactMethod
  fun resolveToneTitle(uri: String?, promise: Promise) {
    try {
      promise.resolve(resolveTitleSync(uri, KIND_ALARM))
    } catch (e: Exception) {
      promise.reject("RESOLVE_TITLE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun previewTone(uri: String?, kind: String, promise: Promise) {
    val normalizedKind = normalizeKind(kind)
    val cleanUri = AlertPreferencesContract.sanitizeToneUri(uri)
    if (cleanUri == AlertPreferencesContract.TONE_SILENT) {
      handler.post { stopPreviewInternal() }
      promise.resolve(false)
      return
    }
    val targetUri =
      cleanUri?.let { Uri.parse(it) }
        ?: RingtoneManager.getActualDefaultRingtoneUri(reactContext, ringtoneTypeForKind(normalizedKind))
        ?: RingtoneManager.getDefaultUri(ringtoneTypeForKind(normalizedKind))
    if (targetUri == null) {
      promise.resolve(false)
      return
    }

    handler.post {
      try {
        stopPreviewInternal()
        val audioManager = reactContext.getSystemService(android.content.Context.AUDIO_SERVICE) as AudioManager
        val attrs = audioAttributesForKind(normalizedKind)
        requestFocus(audioManager, attrs)
        val mp = MediaPlayer()
        previewPlayer = mp
        mp.apply {
          setAudioAttributes(attrs)
          setDataSource(reactContext, targetUri)
          isLooping = false
          setOnCompletionListener { player ->
            if (previewPlayer === player) stopPreviewInternal()
          }
          setOnErrorListener { player, _, _ ->
            if (previewPlayer === player) stopPreviewInternal()
            true
          }
          setOnPreparedListener { player ->
            if (previewPlayer === player) {
              try {
                player.start()
                handler.postDelayed(stopPreviewRunnable, PREVIEW_MAX_MS)
              } catch (_: Exception) {
                stopPreviewInternal()
              }
            } else {
              try {
                player.release()
              } catch (_: Exception) {
              }
            }
          }
          prepareAsync()
        }
        promise.resolve(true)
      } catch (e: Exception) {
        stopPreviewInternal()
        promise.reject("PREVIEW_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun stopPreview(promise: Promise) {
    handler.post {
      stopPreviewInternal()
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun openChannelNotificationSettings(channelId: String?, promise: Promise) {
    try {
      val cleanChannelId = channelId?.trim()?.takeIf { it.isNotEmpty() }
      val intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && cleanChannelId != null) {
          Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.packageName)
            putExtra(Settings.EXTRA_CHANNEL_ID, cleanChannelId)
          }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.packageName)
          }
        } else {
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${reactContext.packageName}")
          }
        }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        reactContext.startActivity(intent)
      } catch (_: Exception) {
        val fallback =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
              putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.packageName)
            }
          } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
              data = Uri.parse("package:${reactContext.packageName}")
            }
          }
        fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(fallback)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SETTINGS_ERROR", e.message, e)
    }
  }

  private fun stopPreviewInternal() {
    handler.removeCallbacks(stopPreviewRunnable)
    previewPlayer?.let { mp ->
      try {
        if (mp.isPlaying) mp.stop()
      } catch (_: Exception) {
      }
      try {
        mp.release()
      } catch (_: Exception) {
      }
    }
    previewPlayer = null
    val audioManager = reactContext.getSystemService(android.content.Context.AUDIO_SERVICE) as AudioManager
    abandonFocus(audioManager)
  }

  private fun requestFocus(audioManager: AudioManager, attrs: AudioAttributes) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val req =
          AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(attrs)
            .setOnAudioFocusChangeListener {}
            .build()
        previewFocusRequest = req
        audioManager.requestAudioFocus(req)
      } else {
        @Suppress("DEPRECATION")
        audioManager.requestAudioFocus(
          null,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK,
        )
      }
    } catch (_: Exception) {
    }
  }

  private fun abandonFocus(audioManager: AudioManager) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        previewFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        previewFocusRequest = null
      } else {
        @Suppress("DEPRECATION")
        audioManager.abandonAudioFocus(null)
      }
    } catch (_: Exception) {
    }
  }

  private fun resolveTitleSync(uri: String?, kind: String): String {
    val clean = AlertPreferencesContract.sanitizeToneUri(uri) ?: return defaultLabelForKind(kind)
    if (clean == AlertPreferencesContract.TONE_SILENT) return "Silent"
    AlertPreferencesContract.findBundledToneByUri(clean)?.let { return it.label }
    return try {
      val ringtone = RingtoneManager.getRingtone(reactContext, Uri.parse(clean))
      val title = ringtone?.getTitle(reactContext)?.trim()
      if (!title.isNullOrEmpty()) title else "Custom tone"
    } catch (_: Exception) {
      "Custom tone"
    }
  }

  companion object {
    private const val REQUEST_CODE_PICK_TONE = 7451
    private const val PREVIEW_MAX_MS = 5_000L
    private const val KIND_ALARM = "alarm"
    private const val KIND_RINGTONE = "ringtone"
    private const val KIND_NOTIFICATION = "notification"

    private fun normalizeKind(raw: String?): String = when (raw?.trim()?.lowercase()) {
      KIND_RINGTONE -> KIND_RINGTONE
      KIND_NOTIFICATION -> KIND_NOTIFICATION
      else -> KIND_ALARM
    }

    private fun ringtoneTypeForKind(kind: String): Int = when (kind) {
      KIND_RINGTONE -> RingtoneManager.TYPE_RINGTONE
      KIND_NOTIFICATION -> RingtoneManager.TYPE_NOTIFICATION
      else -> RingtoneManager.TYPE_ALARM
    }

    private fun pickerTitleForKind(kind: String): String = when (kind) {
      KIND_RINGTONE -> "Choose call ringtone"
      KIND_NOTIFICATION -> "Choose notification sound"
      else -> "Choose alarm tone"
    }

    private fun defaultLabelForKind(kind: String): String = when (kind) {
      KIND_RINGTONE -> "Default ringtone"
      KIND_NOTIFICATION -> "Default notification sound"
      else -> "Default alarm tone"
    }

    private fun audioAttributesForKind(kind: String): AudioAttributes {
      val usage = when (kind) {
        KIND_RINGTONE -> AudioAttributes.USAGE_NOTIFICATION_RINGTONE
        KIND_NOTIFICATION -> AudioAttributes.USAGE_NOTIFICATION
        else -> AudioAttributes.USAGE_ALARM
      }
      return AudioAttributes.Builder()
        .setUsage(usage)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
    }
  }
}
