package com.lafina.capstone

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.StatFs
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Foreground service that records meeting audio into rolling 30-second
 * 16 kHz mono PCM WAV chunks so long lectures and study sessions survive
 * screen lock and backgrounding without holding a huge buffer in RAM.
 *
 * Privacy guarantee: chunks are written inside `filesDir/meetings/<meetingId>/`
 * and are deleted by `meetingTranscriber.ts` immediately after transcription
 * unless the user explicitly opts into keeping audio.
 */
class LafinaMeetingService : Service() {

    companion object {
        private const val TAG = "LafinaMeetingService"
        private const val CHANNEL_ID = "lafina_meeting_recorder"
        private const val NOTIFICATION_ID = 4102

        const val ACTION_START = "com.lafina.capstone.meeting.START"
        const val ACTION_PAUSE = "com.lafina.capstone.meeting.PAUSE"
        const val ACTION_RESUME = "com.lafina.capstone.meeting.RESUME"
        const val ACTION_STOP = "com.lafina.capstone.meeting.STOP"

        const val EXTRA_MEETING_ID = "meeting_id"
        const val EXTRA_MEETING_TITLE = "meeting_title"

        private const val SAMPLE_RATE = 16000
        private const val CHUNK_SECONDS = 30
        private const val SAMPLES_PER_CHUNK = SAMPLE_RATE * CHUNK_SECONDS
        private const val MIN_FREE_BYTES = 50L * 1024L * 1024L // 50 MB safety floor
        private const val RECOVERY_FILE = "active_recording.json"

        @Volatile
        var isRunning: Boolean = false
            private set

        @Volatile
        var isPausedState: Boolean = false
            private set

        @Volatile
        var activeMeetingId: String? = null
            private set

        /** Microphone ticket acquired by the bridge, waiting for this service to claim it. */
        val leaseHandoff = PendingLeaseHandoff { LafinaMicrophoneLease.release(it) }

        private val completedChunks = mutableListOf<String>()
        private val completedChunkDurationsMs = mutableListOf<Long>()

        @Synchronized
        fun snapshotChunks(): List<String> = completedChunks.toList()

        @Synchronized
        fun snapshotChunkDurationsMs(): List<Long> = completedChunkDurationsMs.toList()

        @Synchronized
        private fun recordChunk(path: String, durationMs: Long) {
            completedChunks.add(path)
            completedChunkDurationsMs.add(durationMs)
        }

        @Synchronized
        private fun resetChunks() {
            completedChunks.clear()
            completedChunkDurationsMs.clear()
        }

        fun meetingsRootDir(context: Context): File = File(context.filesDir, "meetings")

        fun readRecoveryState(context: Context): JSONObject? {
            return try {
                val file = File(meetingsRootDir(context), RECOVERY_FILE)
                if (!file.exists()) return null
                JSONObject(file.readText())
            } catch (e: Exception) {
                Log.w(TAG, "Failed to read recovery state: ${e.message}")
                null
            }
        }

        fun clearRecoveryState(context: Context) {
            try {
                val file = File(meetingsRootDir(context), RECOVERY_FILE)
                if (file.exists()) file.delete()
            } catch (e: Exception) {
                Log.w(TAG, "Failed to clear recovery state: ${e.message}")
            }
        }

        private fun writeRecoveryState(
            context: Context,
            meetingId: String,
            title: String,
            status: String,
        ) {
            try {
                val root = meetingsRootDir(context)
                if (!root.exists()) root.mkdirs()
                val chunksJson = JSONArray()
                val durationsJson = JSONArray()
                synchronized(this) {
                    completedChunks.forEach { chunksJson.put(it) }
                    completedChunkDurationsMs.forEach { durationsJson.put(it) }
                }
                val payload = JSONObject().apply {
                    put("meetingId", meetingId)
                    put("title", title)
                    put("status", status)
                    put("updatedAt", System.currentTimeMillis())
                    put("chunkFiles", chunksJson)
                    put("chunkDurationsMs", durationsJson)
                }
                File(root, RECOVERY_FILE).writeText(payload.toString())
            } catch (e: Exception) {
                Log.w(TAG, "Failed to write recovery state: ${e.message}")
            }
        }
    }

    private val recording = AtomicBoolean(false)
    private val paused = AtomicBoolean(false)
    private var workerThread: Thread? = null
    /** This recording's own microphone ticket; released only when the worker returns. */
    @Volatile private var ownedTicket: MicrophoneLeaseRegistry.Ticket? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var currentTitle: String = "Meeting"

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        LafinaMicrophoneLease.configure(this)
        ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val meetingId = intent.getStringExtra(EXTRA_MEETING_ID) ?: "meeting_${System.currentTimeMillis()}"
                val title = intent.getStringExtra(EXTRA_MEETING_TITLE) ?: "Meeting"
                startRecordingInternal(meetingId, title)
            }
            ACTION_PAUSE -> {
                if (recording.get()) {
                    paused.set(true)
                    isPausedState = true
                    activeMeetingId?.let { writeRecoveryState(this, it, currentTitle, "paused") }
                    updateForegroundNotification("Recording paused: $currentTitle")
                }
            }
            ACTION_RESUME -> {
                if (recording.get()) {
                    paused.set(false)
                    isPausedState = false
                    activeMeetingId?.let { writeRecoveryState(this, it, currentTitle, "recording") }
                    updateForegroundNotification("Recording: $currentTitle")
                }
            }
            ACTION_STOP -> {
                stopRecordingInternal()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopRecordingInternal()
        super.onDestroy()
    }

    private fun startRecordingInternal(meetingId: String, title: String) {
        // The bridge parked a ticket for this meeting; claim it so the abandon timer
        // cannot release it. A start without a parked ticket acquires its own.
        val handedOff = leaseHandoff.claim(meetingId)
        if (recording.get()) {
            LafinaMicrophoneLease.release(handedOff)
            return
        }
        val hasPerm = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasPerm) {
            Log.w(TAG, "RECORD_AUDIO permission not granted; aborting meeting service")
            LafinaMicrophoneLease.release(handedOff)
            stopSelf()
            return
        }
        val ticket = handedOff
            ?: LafinaMicrophoneLease.tryAcquire(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER)
        if (ticket == null) {
            Log.w(TAG, "Microphone lease held by another module; aborting meeting service")
            stopSelf()
            return
        }
        ownedTicket = ticket

        currentTitle = title
        val notification = buildNotification("Recording: $title")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        acquireWakeLock()
        resetChunks()
        activeMeetingId = meetingId
        paused.set(false)
        isPausedState = false
        recording.set(true)
        isRunning = true
        writeRecoveryState(this, meetingId, title, "recording")

        val outDir = File(meetingsRootDir(this), meetingId)
        if (!outDir.exists()) outDir.mkdirs()

        try {
            workerThread = Thread({
                try {
                    runCaptureLoop(outDir)
                } finally {
                    // Every exit path, including AudioRecord init failures, returns the
                    // microphone, and only this recording's own ticket.
                    releaseOwnedTicket(ticket)
                }
            }, "LafinaMeetingRecorder").also { it.start() }
        } catch (e: Exception) {
            Log.e(TAG, "Could not start the meeting capture thread: ${e.message}", e)
            workerThread = null
            recording.set(false)
            isRunning = false
            releaseWakeLock()
            releaseOwnedTicket(ticket)
        }
    }

    private fun releaseOwnedTicket(ticket: MicrophoneLeaseRegistry.Ticket) {
        LafinaMicrophoneLease.release(ticket)
        if (ownedTicket === ticket) ownedTicket = null
    }

    private fun updateForegroundNotification(text: String) {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIFICATION_ID, buildNotification(text))
        } catch (e: Exception) {
            Log.w(TAG, "Failed to update notification: ${e.message}")
        }
    }

    private fun stopRecordingInternal() {
        if (!recording.getAndSet(false)) {
            // Nothing is recording. A ticket without a live worker (never started) is ours
            // to return; a worker that is still unwinding releases its own when it returns.
            val ticket = ownedTicket
            if (ticket != null && workerThread?.isAlive != true) releaseOwnedTicket(ticket)
            return
        }
        paused.set(false)
        isPausedState = false
        val worker = workerThread
        try {
            worker?.join(3000)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
        if (worker?.isAlive == true) {
            // Still flushing its last chunk: it keeps the microphone until it returns.
            Log.w(TAG, "Meeting capture worker still finishing; it releases the microphone itself")
        } else {
            workerThread = null
            ownedTicket?.let { releaseOwnedTicket(it) }
        }
        isRunning = false
        activeMeetingId?.let { writeRecoveryState(this, it, currentTitle, "stopped") }
        releaseWakeLock()
    }

    private fun hasEnoughStorage(dir: File): Boolean {
        return try {
            val stat = StatFs(dir.absolutePath)
            stat.availableBytes >= MIN_FREE_BYTES
        } catch (_: Exception) {
            true
        }
    }

    private fun runCaptureLoop(outDir: File) {
        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuf == AudioRecord.ERROR || minBuf == AudioRecord.ERROR_BAD_VALUE) {
            Log.e(TAG, "Invalid AudioRecord buffer size: $minBuf")
            recording.set(false)
            isRunning = false
            return
        }

        val recorder = try {
            AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                maxOf(minBuf * 2, SAMPLE_RATE * 2)
            )
        } catch (se: SecurityException) {
            Log.e(TAG, "SecurityException opening AudioRecord: ${se.message}")
            recording.set(false)
            isRunning = false
            return
        }

        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            Log.e(TAG, "AudioRecord failed to initialize")
            recorder.release()
            recording.set(false)
            isRunning = false
            return
        }

        val readBuf = ShortArray(1024)
        var chunkIndex = 0

        try {
            recorder.startRecording()
            while (recording.get()) {
                if (!hasEnoughStorage(outDir)) {
                    Log.w(TAG, "Low storage (<50MB free); stopping meeting recording safely")
                    recording.set(false)
                    break
                }
                if (paused.get()) {
                    Thread.sleep(100)
                    continue
                }

                val chunkFile = File(outDir, "chunk_%04d.wav".format(chunkIndex))
                var samplesWritten = 0L

                FileOutputStream(chunkFile).use { fos ->
                    fos.write(ByteArray(44))
                    val byteBuf = ByteBuffer.allocate(readBuf.size * 2).order(ByteOrder.LITTLE_ENDIAN)

                    while (recording.get() && samplesWritten < SAMPLES_PER_CHUNK) {
                        if (paused.get()) {
                            Thread.sleep(80)
                            continue
                        }
                        val read = recorder.read(readBuf, 0, readBuf.size)
                        if (read > 0) {
                            byteBuf.clear()
                            for (i in 0 until read) {
                                byteBuf.putShort(readBuf[i])
                            }
                            fos.write(byteBuf.array(), 0, read * 2)
                            samplesWritten += read
                        } else if (read < 0) {
                            Log.w(TAG, "AudioRecord read error: $read")
                            break
                        }
                    }
                    fos.fd.sync()
                }

                if (samplesWritten > SAMPLE_RATE / 2) {
                    patchWavHeader(chunkFile, samplesWritten)
                    val durationMs = (samplesWritten * 1000L) / SAMPLE_RATE
                    recordChunk(chunkFile.absolutePath, durationMs)
                    activeMeetingId?.let { writeRecoveryState(this, it, currentTitle, "recording") }
                    chunkIndex += 1
                } else {
                    chunkFile.delete()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Capture loop error: ${e.message}", e)
        } finally {
            try {
                recorder.stop()
            } catch (_: Exception) {
            }
            recorder.release()
            isRunning = false
        }
    }

    private fun patchWavHeader(file: File, totalSamples: Long) {
        val byteRate = SAMPLE_RATE * 2
        val dataSize = (totalSamples * 2).toInt()
        val riffSize = 36 + dataSize
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray(Charsets.US_ASCII))
            putInt(riffSize)
            put("WAVE".toByteArray(Charsets.US_ASCII))
            put("fmt ".toByteArray(Charsets.US_ASCII))
            putInt(16)
            putShort(1) // PCM
            putShort(1) // mono
            putInt(SAMPLE_RATE)
            putInt(byteRate)
            putShort(2) // blockAlign
            putShort(16) // bitsPerSample
            put("data".toByteArray(Charsets.US_ASCII))
            putInt(dataSize)
        }
        RandomAccessFile(file, "rw").use { raf ->
            raf.seek(0)
            raf.write(header.array())
        }
    }

    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "LAFINA::MeetingRecorderWakeLock"
            ).apply {
                setReferenceCounted(false)
                acquire(3 * 60 * 60 * 1000L) // 3h safety cap
            }
        } catch (e: Exception) {
            Log.w(TAG, "WakeLock acquire failed: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) it.release()
            }
        } catch (_: Exception) {
        } finally {
            wakeLock = null
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CHANNEL_ID,
                "LAFINA Meeting Recorder",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows while LAFINA is recording a lecture or study session."
            }
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(contentText: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = if (launchIntent != null) {
            PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else {
            null
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("LAFINA Lecture & Meeting Recorder")
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }
}
