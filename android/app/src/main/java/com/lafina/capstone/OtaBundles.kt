package com.lafina.capstone

import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.StatFs
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.zip.ZipFile

/**
 * In-app updates from the GitHub release: where downloads live, which
 * JavaScript bundle starts, and how a download arrives. Adapted from LAFINA's
 * `OtaBundles` (com.lafina) for the student app.
 *
 * Two kinds of update, both described by the release's signed manifest, which
 * the JS side checks before asking for anything here:
 *
 *  - A **bundle** (JavaScript and images, zipped) for a release that did not
 *    change native code. It is checked against the signed size and SHA-256,
 *    unpacked into `files/ota/` and only *staged*: [resolveBundlePath] starts
 *    it the next time the app starts, before React Native loads.
 *  - An **APK** for a release that did. It is kept in `files/ota/apk/` until
 *    Android's package installer replaces the app with it. A dropped download
 *    resumes where it stopped instead of starting the ~140 MB again.
 *
 * A bundle has launches to prove itself: JS confirms one with
 * [markLaunchSuccessful] as soon as a root component mounts. A bundle that
 * starts [MAX_UNCONFIRMED_LAUNCHES] times without confirming is assumed to
 * crash, is rolled back to the one before it, and is never offered again.
 * A new APK brings its own bundle, so downloaded ones are dropped as soon as
 * the installed APK changes.
 *
 * Only release builds take in-app updates: debug and test builds have another
 * application ID, and debug builds load JavaScript from Metro.
 */
object OtaBundles {
  private const val TAG = "LafinaOta"
  private const val ROOT = "ota"
  private const val STATE_FILE = "state.json"
  private const val DOWNLOAD_FILE = "download.part"
  const val BUNDLE_FILE = "index.android.bundle"
  private const val APK_DIR = "apk"
  /** Written just before an APK is handed to the installer; read after the app is replaced. */
  private const val INSTALLING_FILE = "installing.json"
  /** GitHub's limit for one release asset; the app APK is well under it. */
  private const val MAX_APK_BYTES = 2L * 1024 * 1024 * 1024

  /** Far above a real bundle, low enough that a hostile archive cannot fill the phone. */
  private const val MAX_EXTRACTED_BYTES = 300L * 1024 * 1024
  private const val MAX_ENTRIES = 2_000
  private const val CONNECT_TIMEOUT_MS = 20_000
  /** A download that has not received a byte for this long is treated as dropped. */
  private const val READ_TIMEOUT_MS = 60_000
  private const val MAX_REJECTED = 20
  /**
   * Two unconfirmed starts before a rollback: one start that was closed during
   * the splash screen (or killed by the system) must not throw a good update away.
   */
  private const val MAX_UNCONFIRMED_LAUNCHES = 2

  private val APK_NAME = Regex("""^lafina-(\d+)\.apk$""")
  private val APK_SHA_NAME = Regex("""^lafina-(\d+)\.sha256$""")
  private val APK_PART_NAME = Regex("""^lafina-(\d+)-([a-f0-9]{64})\.part$""")
  private val SHA256_HEX = Regex("^[a-f0-9]{64}$")

  /** The OTA version this process started with, or null for the APK's own bundle. */
  @Volatile
  var runningVersion: String? = null
    private set

  class OtaException(val code: String, message: String) : Exception(message)

  val updatesEnabled: Boolean
    get() = BuildConfig.BUILD_TYPE == "release"

  private data class Bundle(
    val version: String,
    val dir: String,
    val nativeVersionCode: Int,
    val apkUpdateTime: Long,
    var confirmed: Boolean,
    var launches: Int,
  ) {
    fun toJson(): JSONObject = JSONObject()
      .put("version", version)
      .put("dir", dir)
      .put("nativeVersionCode", nativeVersionCode)
      .put("apkUpdateTime", apkUpdateTime)
      .put("confirmed", confirmed)
      .put("launches", launches)

    companion object {
      fun fromJson(json: JSONObject?): Bundle? {
        if (json == null) return null
        return try {
          Bundle(
            version = json.getString("version"),
            dir = json.getString("dir"),
            nativeVersionCode = json.getInt("nativeVersionCode"),
            apkUpdateTime = json.getLong("apkUpdateTime"),
            confirmed = json.optBoolean("confirmed", false),
            launches = json.optInt("launches", 0),
          )
        } catch (error: Exception) {
          null
        }
      }
    }
  }

  private class State(
    var current: Bundle? = null,
    var previous: Bundle? = null,
    var pending: Bundle? = null,
    val rejected: MutableList<String> = mutableListOf(),
  )

  private val lock = Any()

  private fun root(context: Context): File = File(context.filesDir, ROOT)

  private fun dirOf(context: Context, bundle: Bundle): File = File(root(context), bundle.dir)

  private fun apkUpdateTime(context: Context): Long =
    context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime

  private fun readState(context: Context): State {
    val file = File(root(context), STATE_FILE)
    if (!file.isFile) return State()
    return try {
      val json = JSONObject(file.readText())
      val rejected = json.optJSONArray("rejected")
      State(
        current = Bundle.fromJson(json.optJSONObject("current")),
        previous = Bundle.fromJson(json.optJSONObject("previous")),
        pending = Bundle.fromJson(json.optJSONObject("pending")),
        rejected = MutableList(rejected?.length() ?: 0) { index -> rejected!!.getString(index) },
      )
    } catch (error: Exception) {
      Log.w(TAG, "Unreadable update state; starting from the APK's bundle", error)
      State()
    }
  }

  private fun writeState(context: Context, state: State) {
    val dir = root(context)
    dir.mkdirs()
    val json = JSONObject()
      .put("current", state.current?.toJson() ?: JSONObject.NULL)
      .put("previous", state.previous?.toJson() ?: JSONObject.NULL)
      .put("pending", state.pending?.toJson() ?: JSONObject.NULL)
      .put("rejected", JSONArray(state.rejected.takeLast(MAX_REJECTED)))
    // Written beside the real file and renamed over it, so a crash mid-write
    // never leaves a half-written state to start from.
    val temp = File(dir, "$STATE_FILE.tmp")
    temp.writeText(json.toString())
    if (!temp.renameTo(File(dir, STATE_FILE))) {
      File(dir, STATE_FILE).delete()
      temp.renameTo(File(dir, STATE_FILE))
    }
  }

  /**
   * The bundle this launch should run, or null for the one inside the APK.
   * Called once per process, when React Native is created. Never throws: any
   * trouble falls back to the APK's own bundle.
   */
  fun resolveBundlePath(context: Context): String? {
    if (!updatesEnabled) return null
    return try {
      synchronized(lock) { resolve(context) }
    } catch (error: Exception) {
      Log.e(TAG, "Could not choose an update bundle; using the APK's", error)
      null
    }
  }

  private fun resolve(context: Context): String? {
    val state = readState(context)
    val apkTime = apkUpdateTime(context)
    val fits = { bundle: Bundle ->
      bundle.nativeVersionCode == BuildConfig.VERSION_CODE &&
        bundle.apkUpdateTime == apkTime &&
        File(dirOf(context, bundle), BUNDLE_FILE).isFile
    }

    // A download finished since the last start: it becomes the current bundle.
    state.pending?.let { staged ->
      state.pending = null
      if (fits(staged)) {
        state.previous = state.current?.takeIf { it.confirmed }
        state.current = staged.copy(confirmed = false, launches = 0)
      }
    }

    // A new APK brings its own bundle; ones built for the old APK no longer fit.
    if (state.current?.let(fits) == false) state.current = null
    if (state.previous?.let(fits) == false) state.previous = null

    // A bundle that never confirmed its recent launches is assumed to crash on start.
    val trial = state.current
    if (trial != null && !trial.confirmed && trial.launches >= MAX_UNCONFIRMED_LAUNCHES) {
      Log.w(TAG, "Update ${trial.version} did not finish starting ${trial.launches} times; rolling back")
      if (!state.rejected.contains(trial.version)) state.rejected.add(trial.version)
      state.current = state.previous
      state.previous = null
    }

    state.current?.let { active -> if (!active.confirmed) active.launches += 1 }
    writeState(context, state)
    removeUnused(context, state)

    val active = state.current ?: return null
    runningVersion = active.version
    return File(dirOf(context, active), BUNDLE_FILE).absolutePath
  }

  /** Deletes bundle folders and partial downloads nothing refers to any more. */
  private fun removeUnused(context: Context, state: State) {
    val keep = listOfNotNull(state.current, state.previous, state.pending).map { it.dir }.toSet() + APK_DIR
    root(context).listFiles()?.forEach { file ->
      if (file.isDirectory && file.name !in keep) file.deleteRecursively()
      if (file.isFile && file.name == DOWNLOAD_FILE) file.delete()
    }
    pruneApks(context)
  }

  // ── APKs for a newer native build ─────────────────────────────────────────

  private fun apkDir(context: Context): File = File(root(context), APK_DIR)

  private fun apkFile(context: Context, versionCode: Int): File =
    File(apkDir(context), "lafina-$versionCode.apk")

  private fun apkShaFile(context: Context, versionCode: Int): File =
    File(apkDir(context), "lafina-$versionCode.sha256")

  private fun apkPartFile(context: Context, versionCode: Int, sha256: String): File =
    File(apkDir(context), "lafina-$versionCode-$sha256.part")

  /** The build a file in the APK folder belongs to, or null for a stray file. */
  private fun apkVersionOf(file: File): Int? =
    (APK_NAME.find(file.name) ?: APK_SHA_NAME.find(file.name) ?: APK_PART_NAME.find(file.name))
      ?.groupValues?.get(1)?.toIntOrNull()

  /** Drops APKs (and partial downloads) already installed or older, and stray files. */
  private fun pruneApks(context: Context) {
    apkDir(context).listFiles()?.forEach { file ->
      if (file.name == INSTALLING_FILE) return@forEach
      val versionCode = apkVersionOf(file)
      if (versionCode == null || versionCode <= BuildConfig.VERSION_CODE) file.delete()
    }
  }

  data class ReadyApk(val versionCode: Int, val sha256: String)

  /**
   * The newest fully downloaded APK for a build above this one, with the
   * checksum it was verified against, or null. Never re-hashes the file: the
   * install step does that right before handing it over.
   */
  fun readyApk(context: Context): ReadyApk? {
    val newest = apkDir(context).listFiles()
      ?.mapNotNull { file -> APK_NAME.find(file.name)?.groupValues?.get(1)?.toIntOrNull() }
      ?.filter { it > BuildConfig.VERSION_CODE }
      ?.maxOrNull() ?: return null
    val sha = try {
      apkShaFile(context, newest).takeIf { it.isFile }?.readText()?.trim()
    } catch (error: Exception) {
      null
    }
    if (sha == null || !SHA256_HEX.matches(sha)) return null
    return ReadyApk(newest, sha)
  }

  private fun checkedUrl(url: String): URL {
    val parsed = try {
      URL(url)
    } catch (error: Exception) {
      throw OtaException("E_VERIFY", "The update has an invalid address.")
    }
    if (parsed.protocol != "https" || parsed.host != "github.com") {
      throw OtaException("E_VERIFY", "Updates are only downloaded from GitHub over HTTPS.")
    }
    return parsed
  }

  private fun sha256Of(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(1024 * 1024)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  /**
   * Downloads the APK of a newer native build, checked against the signed size
   * and SHA-256 before it is kept. A partial download of the same file is
   * resumed. Installing it is a separate step (`LafinaUpdaterModule.installApk`),
   * because Android asks the person first.
   */
  fun downloadApk(
    context: Context,
    url: String,
    versionCode: Int,
    size: Long,
    sha256: String,
    isCancelled: () -> Boolean,
    onProgress: (received: Long, total: Long) -> Unit,
  ) {
    if (!updatesEnabled) throw OtaException("E_INCOMPATIBLE", "In-app updates work only in release builds.")
    if (versionCode <= BuildConfig.VERSION_CODE) {
      throw OtaException("E_INCOMPATIBLE", "This phone already has this version of the app or a newer one.")
    }
    if (size <= 0 || size > MAX_APK_BYTES) {
      throw OtaException("E_VERIFY", "The update has an invalid size, so it was not downloaded.")
    }
    if (!SHA256_HEX.matches(sha256)) throw OtaException("E_VERIFY", "The update has an invalid checksum.")
    val parsed = checkedUrl(url)
    val dir = apkDir(context)
    dir.mkdirs()

    val target = apkFile(context, versionCode)
    val shaFile = apkShaFile(context, versionCode)
    if (target.isFile && target.length() == size && sha256Of(target) == sha256) {
      shaFile.writeText(sha256)
      onProgress(size, size)
      return
    }
    val partial = apkPartFile(context, versionCode, sha256)
    // Only this exact file is worth resuming; anything else in the folder is superseded.
    dir.listFiles()?.forEach { if (it != partial && it.name != INSTALLING_FILE) it.delete() }

    // The rest of the download, plus the copy Android's installer makes of it.
    val alreadyHave = if (partial.isFile) partial.length().coerceAtMost(size) else 0L
    val needed = (size - alreadyHave) + size + 100L * 1024 * 1024
    if (StatFs(dir.absolutePath).availableBytes < needed) {
      throw OtaException(
        "E_STORAGE",
        "The update needs about ${needed / 1024 / 1024} MB free, and this phone does not have enough space.",
      )
    }

    // A failed or cancelled download keeps its part file, to resume next time.
    fetch(parsed, partial, size, sha256, resume = true, isCancelled = isCancelled, onProgress = onProgress)
    target.delete()
    if (!partial.renameTo(target)) {
      partial.delete()
      throw OtaException("E_DOWNLOAD", "The update could not be saved. Try again.")
    }
    shaFile.writeText(sha256)
  }

  /**
   * The downloaded APK, checked again right before it is handed to the
   * installer, in case it changed on disk since. Null when it is gone or no
   * longer matches.
   */
  fun verifiedApk(context: Context, versionCode: Int, sha256: String): File? {
    val file = apkFile(context, versionCode)
    if (!file.isFile) return null
    if (sha256Of(file) == sha256) return file
    file.delete()
    apkShaFile(context, versionCode).delete()
    return null
  }

  private fun digestOf(signature: Signature): String =
    MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) }

  /** SHA-256 of the certificates the installed app is signed with. */
  fun installedSignerSha256(context: Context): List<String> = try {
    val info = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
    info.signingInfo?.apkContentsSigners?.map(::digestOf) ?: emptyList()
  } catch (error: Exception) {
    emptyList()
  }

  /**
   * Why Android would refuse this APK as an update of the installed app, or
   * null when it looks right. Checked before the installer is involved so the
   * person gets a clear reason instead of "App not installed".
   */
  fun apkProblem(context: Context, apk: File, expectedVersionCode: Int): String? {
    val manager = context.packageManager
    val archive = manager.getPackageArchiveInfo(apk.absolutePath, PackageManager.GET_SIGNING_CERTIFICATES)
      ?: return "The downloaded update is not a valid app, so it was not installed."
    if (archive.packageName != context.packageName) {
      return "The downloaded update is for a different app, so it was not installed."
    }
    if (archive.longVersionCode != expectedVersionCode.toLong()) {
      return "The downloaded update is not the version the release describes, so it was not installed."
    }
    val installed = installedSignerSha256(context).toSet()
    val signing = archive.signingInfo ?: return null // Unreadable here: Android's installer still checks.
    val accepted = (if (signing.hasPastSigningCertificates()) signing.signingCertificateHistory else signing.apkContentsSigners)
      ?.map(::digestOf)?.toSet() ?: return null
    if (installed.isNotEmpty() && installed.none { it in accepted }) {
      return "This copy of LAFINA was installed from a differently signed build, so Android cannot update it in place. " +
        "Install the new version from the release page once; after that, updates install from inside the app."
    }
    return null
  }

  /** Remembers which update is being installed, for the notice after the app is replaced. */
  fun markInstalling(context: Context, versionCode: Int, versionName: String) {
    try {
      val dir = apkDir(context)
      dir.mkdirs()
      File(dir, INSTALLING_FILE).writeText(
        JSONObject().put("versionCode", versionCode).put("versionName", versionName).toString(),
      )
    } catch (error: Exception) {
      Log.w(TAG, "Could not note the update being installed", error)
    }
  }

  /**
   * The version name of an update installed from inside the app that is now
   * running, or null. Cleared once read, so the notice shows only once.
   */
  fun takeCompletedInstall(context: Context): String? {
    val file = File(apkDir(context), INSTALLING_FILE)
    if (!file.isFile) return null
    return try {
      val json = JSONObject(file.readText())
      if (json.optInt("versionCode", -1) == BuildConfig.VERSION_CODE) json.optString("versionName") else null
    } catch (error: Exception) {
      null
    } finally {
      file.delete()
    }
  }

  /** Startup finished on the current bundle; it is kept from now on. */
  fun markLaunchSuccessful(context: Context): Boolean = synchronized(lock) {
    val state = readState(context)
    val current = state.current ?: return@synchronized false
    if (current.version != runningVersion) return@synchronized false
    if (!current.confirmed) {
      current.confirmed = true
      current.launches = 0
      writeState(context, state)
    }
    true
  }

  data class Info(val pendingVersion: String?, val rejected: List<String>)

  fun info(context: Context): Info = synchronized(lock) {
    val state = readState(context)
    Info(state.pending?.version, state.rejected.toList())
  }

  /**
   * Downloads the release zip, checks it against the signed size and SHA-256,
   * and unpacks it as the pending bundle. Everything is checked before the
   * bundle is staged; any failure leaves the current bundle untouched.
   */
  fun download(
    context: Context,
    url: String,
    version: String,
    nativeVersionCode: Int,
    size: Long,
    sha256: String,
    isCancelled: () -> Boolean,
    onProgress: (received: Long, total: Long) -> Unit,
  ) {
    if (!updatesEnabled) throw OtaException("E_INCOMPATIBLE", "In-app updates work only in release builds.")
    if (nativeVersionCode != BuildConfig.VERSION_CODE) {
      throw OtaException("E_INCOMPATIBLE", "This update was built for a different version of the app.")
    }
    if (size <= 0 || size > MAX_EXTRACTED_BYTES) {
      throw OtaException("E_VERIFY", "The update has an invalid size, so it was not downloaded.")
    }
    if (!SHA256_HEX.matches(sha256)) throw OtaException("E_VERIFY", "The update has an invalid checksum.")
    val parsed = checkedUrl(url)

    val dir = root(context)
    dir.mkdirs()
    // Room for the zip and everything in it at once.
    val free = StatFs(dir.absolutePath).availableBytes
    if (free < size * 4 + 20L * 1024 * 1024) {
      throw OtaException(
        "E_STORAGE",
        "The update needs about ${(size * 4) / 1024 / 1024} MB free, and this phone does not have enough space.",
      )
    }

    val partial = File(dir, DOWNLOAD_FILE)
    partial.delete()
    try {
      fetch(parsed, partial, size, sha256, resume = false, isCancelled = isCancelled, onProgress = onProgress)
      val staged = unpack(context, partial, version)
      synchronized(lock) {
        val state = readState(context)
        state.pending?.let { old -> File(dir, old.dir).deleteRecursively() }
        state.pending = Bundle(
          version = version,
          dir = staged.name,
          nativeVersionCode = nativeVersionCode,
          apkUpdateTime = apkUpdateTime(context),
          confirmed = false,
          launches = 0,
        )
        writeState(context, state)
      }
    } finally {
      partial.delete()
    }
  }

  private fun networkError(): OtaException =
    OtaException("E_NETWORK", "Could not reach GitHub. Check the connection and try again.")

  /**
   * Streams [url] into [destination], hashing as it goes. With [resume], bytes
   * already in [destination] are kept and only the rest is asked for (HTTP
   * Range); a server that answers with the whole file starts it over.
   */
  private fun fetch(
    url: URL,
    destination: File,
    size: Long,
    sha256: String,
    resume: Boolean,
    isCancelled: () -> Boolean,
    onProgress: (received: Long, total: Long) -> Unit,
  ) {
    var offset = if (resume && destination.isFile) destination.length() else 0L
    if (offset > size) {
      destination.delete()
      offset = 0L
    }
    val digest = MessageDigest.getInstance("SHA-256")
    if (offset > 0) {
      FileInputStream(destination).use { input ->
        val buffer = ByteArray(1024 * 1024)
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          digest.update(buffer, 0, read)
        }
      }
    }
    if (offset == size) {
      val actual = digest.digest().joinToString("") { "%02x".format(it) }
      if (actual == sha256) {
        onProgress(size, size)
        return
      }
      // Complete but wrong: start over.
      destination.delete()
      offset = 0L
      digest.reset()
    }

    // GitHub answers with a redirect to its storage host; both are HTTPS, so it is followed.
    val connection = try {
      (url.openConnection() as HttpURLConnection).apply {
        connectTimeout = CONNECT_TIMEOUT_MS
        readTimeout = READ_TIMEOUT_MS
        instanceFollowRedirects = true
        setRequestProperty("Accept", "application/octet-stream")
        setRequestProperty("User-Agent", "LAFINA-Android")
        if (offset > 0) setRequestProperty("Range", "bytes=$offset-")
      }
    } catch (error: Exception) {
      throw networkError()
    }

    try {
      val status = try {
        connection.responseCode
      } catch (error: Exception) {
        throw networkError()
      }
      val append = when {
        offset > 0 && status == HttpURLConnection.HTTP_PARTIAL -> true
        status == HttpURLConnection.HTTP_OK -> false
        status == 416 -> {
          // The saved part no longer matches what the server has.
          destination.delete()
          throw OtaException("E_NETWORK", "The download has to start over. Try again.")
        }
        else -> throw OtaException("E_NETWORK", "GitHub answered $status for the download. Try again later.")
      }
      if (connection.url.protocol != "https") {
        throw OtaException("E_VERIFY", "The download was redirected away from HTTPS, so it was stopped.")
      }
      if (!append && offset > 0) {
        offset = 0L
        digest.reset()
      }

      var received = offset
      var lastReport = 0L
      try {
        connection.inputStream.use { input ->
          FileOutputStream(destination, append).use { output ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
              if (isCancelled()) throw OtaException("E_CANCELLED", "The update was cancelled.")
              val read = input.read(buffer)
              if (read < 0) break
              received += read
              if (received > size) {
                destination.delete()
                throw OtaException("E_VERIFY", "The update was larger than its signed size, so it was discarded.")
              }
              digest.update(buffer, 0, read)
              output.write(buffer, 0, read)
              val now = System.currentTimeMillis()
              if (now - lastReport > 200) {
                lastReport = now
                onProgress(received, size)
              }
            }
          }
        }
      } catch (error: OtaException) {
        throw error
      } catch (error: Exception) {
        if (isCancelled()) throw OtaException("E_CANCELLED", "The update was cancelled.")
        throw OtaException("E_NETWORK", "The download stopped. Check the connection and try again.")
      }

      if (received != size) {
        throw OtaException("E_NETWORK", "The download ended early. Try again.")
      }
      val actual = digest.digest().joinToString("") { "%02x".format(it) }
      if (actual != sha256) {
        destination.delete()
        throw OtaException("E_VERIFY", "The update did not match its signed checksum, so it was discarded.")
      }
      onProgress(received, size)
    } finally {
      connection.disconnect()
    }
  }

  /** Unpacks into a fresh folder. Entries that would land outside it are refused. */
  private fun unpack(context: Context, zip: File, version: String): File {
    val safeVersion = version.replace(Regex("[^A-Za-z0-9.-]"), "_")
    val target = File(root(context), "b-$safeVersion-${System.currentTimeMillis()}")
    val targetPath = target.canonicalPath + File.separator
    target.mkdirs()
    try {
      ZipFile(zip).use { archive ->
        if (archive.size() > MAX_ENTRIES) throw OtaException("E_VERIFY", "The update has too many files.")
        var total = 0L
        for (entry in archive.entries()) {
          val out = File(target, entry.name)
          if (!out.canonicalPath.startsWith(targetPath)) {
            throw OtaException("E_VERIFY", "The update contains a file outside its folder, so it was discarded.")
          }
          if (entry.isDirectory) {
            out.mkdirs()
            continue
          }
          out.parentFile?.mkdirs()
          archive.getInputStream(entry).use { input ->
            FileOutputStream(out).use { output ->
              val buffer = ByteArray(64 * 1024)
              while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > MAX_EXTRACTED_BYTES) {
                  throw OtaException("E_VERIFY", "The update unpacks to more than it should, so it was discarded.")
                }
                output.write(buffer, 0, read)
              }
            }
          }
        }
      }
      if (!File(target, BUNDLE_FILE).isFile) {
        throw OtaException("E_VERIFY", "The update has no app bundle in it, so it was discarded.")
      }
      return target
    } catch (error: OtaException) {
      target.deleteRecursively()
      throw error
    } catch (error: Exception) {
      target.deleteRecursively()
      throw OtaException("E_VERIFY", "The update could not be unpacked, so it was discarded.")
    }
  }
}
