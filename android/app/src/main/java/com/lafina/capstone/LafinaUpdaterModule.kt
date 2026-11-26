package com.lafina.capstone

import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.FileInputStream
import java.lang.ref.WeakReference
import java.security.KeyFactory
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.X509EncodedKeySpec
import java.net.HttpURLConnection
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * The native half of in-app updates from the GitHub release: signature checks,
 * the downloads, the restart that puts a downloaded bundle into use, and — for
 * a release that changes native code — installing the new APK through
 * Android's package installer, which always asks the person to confirm.
 * Deciding *whether* to update lives in `src/updates/` on the JS side; see
 * [OtaBundles] for how downloads are kept.
 */
class LafinaUpdaterModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  /** Downloads and installs: long-running, one at a time. */
  private val worker = Executors.newSingleThreadExecutor()
  /** Quick reads and writes that must not wait behind a download. */
  private val quick = Executors.newSingleThreadExecutor()
  private val downloading = AtomicBoolean(false)
  private val cancelled = AtomicBoolean(false)
  private val activeConnection = AtomicReference<HttpURLConnection?>(null)

  private fun submitQuick(promise: Promise, code: String, block: () -> Unit) {
    if (quick.isShutdown) {
      promise.reject(code, "Updater is shutting down.")
      return
    }
    try {
      quick.execute(block)
    } catch (e: RejectedExecutionException) {
      promise.reject(code, "Updater is shutting down.", e)
    }
  }

  private fun submitWorker(promise: Promise, code: String, onRejected: (() -> Unit)? = null, block: () -> Unit) {
    if (worker.isShutdown) {
      onRejected?.invoke()
      promise.reject(code, "Updater is shutting down.")
      return
    }
    try {
      worker.execute(block)
    } catch (e: RejectedExecutionException) {
      onRejected?.invoke()
      promise.reject(code, "Updater is shutting down.", e)
    }
  }

  init {
    active = WeakReference(this)
  }

  override fun getName(): String = "LafinaUpdater"

  override fun getConstants(): Map<String, Any> = mapOf(
    "updatesEnabled" to OtaBundles.updatesEnabled,
    "buildType" to BuildConfig.BUILD_TYPE,
  )

  @ReactMethod
  fun getInfo(promise: Promise) {
    submitQuick(promise, "E_INFO") {
      try {
        val info = OtaBundles.info(reactContext)
        val ready = OtaBundles.readyApk(reactContext)
        val map = Arguments.createMap().apply {
          putInt("nativeVersionCode", BuildConfig.VERSION_CODE)
          putString("nativeVersionName", BuildConfig.VERSION_NAME)
          putBoolean("isDebug", BuildConfig.DEBUG)
          putBoolean("updatesEnabled", OtaBundles.updatesEnabled)
          putString("runningVersion", OtaBundles.runningVersion)
          putString("pendingVersion", info.pendingVersion)
          putArray("rejectedVersions", Arguments.fromList(info.rejected))
          putArray("signerSha256", Arguments.fromList(OtaBundles.installedSignerSha256(reactContext)))
          putArray("supportedAbis", Arguments.fromList(Build.SUPPORTED_ABIS.toList()))
          ready?.let {
            putInt("readyApkVersionCode", it.versionCode)
            putString("readyApkSha256", it.sha256)
          }
        }
        promise.resolve(map)
      } catch (error: Exception) {
        promise.reject("E_INFO", error.message, error)
      }
    }
  }

  /**
   * Checks an ECDSA P-256 / SHA-256 signature over the manifest's bytes with
   * the release public key, and returns those bytes as text only when it holds.
   */
  @ReactMethod
  fun verifyManifest(payloadBase64: String, signatureBase64: String, publicKeyBase64: String, promise: Promise) {
    try {
      val key = KeyFactory.getInstance("EC")
        .generatePublic(X509EncodedKeySpec(Base64.decode(publicKeyBase64, Base64.DEFAULT)))
      if (key !is ECPublicKey || key.params.curve.field.fieldSize != 256) {
        promise.reject("E_KEY", "The update signing key must be an ECDSA P-256 key.")
        return
      }
      val payload = Base64.decode(payloadBase64, Base64.DEFAULT)
      val verifier = Signature.getInstance("SHA256withECDSA")
      verifier.initVerify(key)
      verifier.update(payload)
      if (!verifier.verify(Base64.decode(signatureBase64, Base64.DEFAULT))) {
        promise.reject("E_SIGNATURE", "bad signature")
        return
      }
      promise.resolve(String(payload, Charsets.UTF_8))
    } catch (error: Exception) {
      // A malformed key, payload or signature is refused the same way as a wrong one.
      promise.reject("E_SIGNATURE", "bad signature")
    }
  }

  @ReactMethod
  fun downloadBundle(options: ReadableMap, promise: Promise) {
    val url: String
    val version: String
    val nativeVersionCode: Int
    val size: Long
    val sha256: String
    try {
      url = options.getString("url") ?: ""
      version = options.getString("version") ?: ""
      nativeVersionCode = options.getInt("nativeVersionCode")
      // JS numbers arrive as doubles; sizes are far below where that loses precision.
      size = options.getDouble("size").toLong()
      sha256 = options.getString("sha256") ?: ""
    } catch (error: Exception) {
      promise.reject("E_ARGS", "Invalid update options.", error)
      return
    }
    if (!downloading.compareAndSet(false, true)) {
      promise.reject("E_BUSY", "An update is already downloading.")
      return
    }
    cancelled.set(false)
    submitWorker(promise, "E_DOWNLOAD", onRejected = { downloading.set(false) }) {
      try {
        OtaBundles.download(
          context = reactContext,
          url = url,
          version = version,
          nativeVersionCode = nativeVersionCode,
          size = size,
          sha256 = sha256,
          isCancelled = { cancelled.get() },
          onProgress = { received, total -> emitProgress(received, total) },
          onConnection = { conn -> activeConnection.set(conn) },
        )
        promise.resolve(true)
      } catch (error: OtaBundles.OtaException) {
        promise.reject(error.code, error.message, error)
      } catch (error: Exception) {
        promise.reject("E_DOWNLOAD", "The update could not be saved. Try again.", error)
      } finally {
        activeConnection.set(null)
        downloading.set(false)
      }
    }
  }

  /** Downloads (or resumes) the APK of a newer native build; see [OtaBundles.downloadApk]. */
  @ReactMethod
  fun downloadApk(options: ReadableMap, promise: Promise) {
    val url: String
    val versionCode: Int
    val size: Long
    val sha256: String
    try {
      url = options.getString("url") ?: ""
      versionCode = options.getInt("versionCode")
      size = options.getDouble("size").toLong()
      sha256 = options.getString("sha256") ?: ""
    } catch (error: Exception) {
      promise.reject("E_ARGS", "Invalid update options.", error)
      return
    }
    if (!downloading.compareAndSet(false, true)) {
      promise.reject("E_BUSY", "An update is already downloading.")
      return
    }
    cancelled.set(false)
    submitWorker(promise, "E_DOWNLOAD", onRejected = { downloading.set(false) }) {
      try {
        OtaBundles.downloadApk(
          context = reactContext,
          url = url,
          versionCode = versionCode,
          size = size,
          sha256 = sha256,
          isCancelled = { cancelled.get() },
          onProgress = { received, total -> emitProgress(received, total) },
          onConnection = { conn -> activeConnection.set(conn) },
        )
        promise.resolve(true)
      } catch (error: OtaBundles.OtaException) {
        promise.reject(error.code, error.message, error)
      } catch (error: Exception) {
        promise.reject("E_DOWNLOAD", "The update could not be saved. Try again.", error)
      } finally {
        activeConnection.set(null)
        downloading.set(false)
      }
    }
  }

  /**
   * Whether Android lets LAFINA install its own updates. It asks once, per app,
   * in its settings ("Install unknown apps"); nothing can grant it silently.
   */
  @ReactMethod
  fun canInstallApks(promise: Promise) {
    promise.resolve(reactContext.packageManager.canRequestPackageInstalls())
  }

  /** Opens LAFINA's "Install unknown apps" setting for the person to turn on. */
  @ReactMethod
  fun openInstallPermissionSettings(promise: Promise) {
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:${reactContext.packageName}"),
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      (reactContext.currentActivity ?: reactContext).startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_SETTINGS", "The install setting could not be opened.", error)
    }
  }

  /**
   * Hands the downloaded APK to Android's package installer, which shows its
   * own "update this app?" confirmation. The APK is checked first (checksum,
   * package, version and signer) so a mismatch gets a clear reason. The result
   * arrives through [LafinaApkInstallReceiver] as a `LafinaUpdaterInstallStatus`
   * event; on success Android replaces the app, which ends this process.
   */
  @ReactMethod
  fun installApk(options: ReadableMap, promise: Promise) {
    val versionCode = options.getInt("versionCode")
    val sha256 = options.getString("sha256") ?: ""
    val versionName = options.getString("versionName") ?: ""
    submitWorker(promise, "E_INSTALL") {
      try {
        // Checked again right before it is installed, in case it changed on disk since.
        val apk = OtaBundles.verifiedApk(reactContext, versionCode, sha256)
        if (apk == null) {
          promise.reject("E_VERIFY", "The downloaded update is missing or changed on disk, so it was not installed. Download it again.")
          return@submitWorker
        }
        OtaBundles.apkProblem(reactContext, apk, versionCode)?.let { problem ->
          promise.reject("E_SIGNER", problem)
          return@submitWorker
        }
        if (!reactContext.packageManager.canRequestPackageInstalls()) {
          promise.reject("E_PERMISSION", "Allow LAFINA to install updates first.")
          return@submitWorker
        }
        val installer = reactContext.packageManager.packageInstaller
        // Clean up any abandoned/stale sessions left behind by cancelled attempts.
        runCatching {
          for (existing in installer.mySessions) {
            if (!existing.isActive) {
              runCatching { installer.abandonSession(existing.sessionId) }
            }
          }
        }
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
          setAppPackageName(reactContext.packageName)
          setSize(apk.length())
          setInstallReason(android.content.pm.PackageManager.INSTALL_REASON_USER)
        }
        val sessionId = installer.createSession(params)
        try {
          installer.openSession(sessionId).use { session ->
            session.openWrite("lafina.apk", 0, apk.length()).use { output ->
              FileInputStream(apk).use { input -> input.copyTo(output, 1024 * 1024) }
              session.fsync(output)
            }
            val status = PendingIntent.getBroadcast(
              reactContext,
              sessionId,
              Intent(reactContext, LafinaApkInstallReceiver::class.java).setPackage(reactContext.packageName),
              // The installer fills in the status extras, so it must be mutable.
              PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            OtaBundles.markInstalling(reactContext, versionCode, versionName)
            session.commit(status.intentSender)
          }
        } catch (error: Exception) {
          runCatching { installer.abandonSession(sessionId) }
          throw error
        }
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("E_INSTALL", "Android could not start installing the update: ${error.message}", error)
      }
    }
  }

  @ReactMethod
  fun cancelDownload() {
    cancelled.set(true)
    activeConnection.getAndSet(null)?.let { conn -> runCatching { conn.disconnect() } }
  }

  @ReactMethod
  fun markLaunchSuccessful(promise: Promise) {
    submitQuick(promise, "E_CONFIRM") {
      try {
        promise.resolve(OtaBundles.markLaunchSuccessful(reactContext))
      } catch (error: Exception) {
        promise.reject("E_CONFIRM", error.message, error)
      }
    }
  }

  /**
   * Restarts the app so the staged bundle starts. A small activity in its own
   * process ends this one and opens LAFINA again, the way ProcessPhoenix does:
   * a process cannot reliably relaunch itself on its way out.
   */
  @ReactMethod
  fun restart(promise: Promise) {
    try {
      val intent = Intent(reactContext, LafinaRestartActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        .putExtra(LafinaRestartActivity.EXTRA_PID, Process.myPid())
      val activity = reactContext.currentActivity
      if (activity != null) activity.startActivity(intent) else reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_RESTART", "LAFINA could not restart itself. Close and reopen the app to finish the update.", error)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  internal fun emitInstallStatus(status: String, message: String?) {
    if (!reactContext.hasActiveReactInstance()) return
    val payload = Arguments.createMap().apply {
      putString("status", status)
      putString("message", message)
    }
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_INSTALL_STATUS, payload)
  }

  private fun emitProgress(received: Long, total: Long) {
    if (!reactContext.hasActiveReactInstance()) return
    val payload = Arguments.createMap().apply {
      putDouble("received", received.toDouble())
      putDouble("total", total.toDouble())
    }
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_PROGRESS, payload)
  }

  override fun invalidate() {
    cancelled.set(true)
    activeConnection.getAndSet(null)?.let { conn -> runCatching { conn.disconnect() } }
    worker.shutdown()
    quick.shutdown()
    super.invalidate()
  }

  companion object {
    const val EVENT_PROGRESS = "LafinaUpdaterProgress"
    const val EVENT_INSTALL_STATUS = "LafinaUpdaterInstallStatus"

    /** The live module, for the install receiver to report through. */
    @Volatile private var active: WeakReference<LafinaUpdaterModule>? = null

    fun reportInstallStatus(status: String, message: String?) {
      active?.get()?.emitInstallStatus(status, message)
    }
  }
}
