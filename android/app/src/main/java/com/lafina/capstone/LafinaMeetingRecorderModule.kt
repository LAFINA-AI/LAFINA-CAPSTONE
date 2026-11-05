package com.lafina.capstone

import android.content.Intent
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.StatFs
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * React Native bridge for starting/stopping `LafinaMeetingService` and
 * transcribing recorded WAV chunks with timestamps via `LafinaWhisperBridge`.
 */
class LafinaMeetingRecorderModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val WAV_HEADER_BYTES = 44
        private const val WHISPER_IDLE_RELEASE_SEC = 45L
    }

    private val transcribeExecutor = Executors.newSingleThreadScheduledExecutor()
    private var whisperContext = 0L
    private var whisperRelease: ScheduledFuture<*>? = null

    override fun getName(): String = "LafinaMeetingRecorder"

    private fun obtainWhisperContext(): Long {
        whisperRelease?.cancel(false)
        whisperRelease = null
        if (whisperContext == 0L) {
            whisperContext = LafinaWhisperBridge.initContext(
                reactContext.assets,
                LafinaWhisperBridge.MODEL_ASSET
            )
        }
        return whisperContext
    }

    private fun scheduleWhisperRelease() {
        whisperRelease?.cancel(false)
        whisperRelease = transcribeExecutor.schedule(
            { freeWhisperContext() },
            WHISPER_IDLE_RELEASE_SEC,
            TimeUnit.SECONDS
        )
    }

    private fun freeWhisperContext() {
        if (whisperContext != 0L) {
            LafinaWhisperBridge.freeContext(whisperContext)
            whisperContext = 0L
        }
    }

    @ReactMethod
    fun getAvailableStorageMB(promise: Promise) {
        try {
            val stat = StatFs(reactContext.filesDir.absolutePath)
            val freeMb = stat.availableBytes / (1024.0 * 1024.0)
            promise.resolve(freeMb)
        } catch (e: Exception) {
            promise.reject("STORAGE_CHECK_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startRecording(meetingId: String, title: String, promise: Promise) {
        try {
            if (LafinaMeetingService.isRunning) {
                promise.reject("ALREADY_RECORDING", "A meeting is already being recorded.")
                return
            }
            if (LafinaMicrophoneLease.activeHolder() != null) {
                promise.reject("MIC_IN_USE", "Microphone is currently in use by voice assistant.")
                return
            }
            val stat = StatFs(reactContext.filesDir.absolutePath)
            val freeMb = stat.availableBytes / (1024L * 1024L)
            if (freeMb < 60L) {
                promise.reject(
                    "INSUFFICIENT_STORAGE",
                    "At least 60 MB of free storage is required to record a meeting."
                )
                return
            }

            val intent = Intent(reactContext, LafinaMeetingService::class.java).apply {
                action = LafinaMeetingService.ACTION_START
                putExtra(LafinaMeetingService.EXTRA_MEETING_ID, meetingId)
                putExtra(LafinaMeetingService.EXTRA_MEETING_TITLE, title)
            }
            ContextCompat.startForegroundService(reactContext, intent)
            promise.resolve(meetingId)
        } catch (e: Exception) {
            promise.reject("MEETING_START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun pauseRecording(promise: Promise) {
        try {
            val intent = Intent(reactContext, LafinaMeetingService::class.java).apply {
                action = LafinaMeetingService.ACTION_PAUSE
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("MEETING_PAUSE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun resumeRecording(promise: Promise) {
        try {
            val intent = Intent(reactContext, LafinaMeetingService::class.java).apply {
                action = LafinaMeetingService.ACTION_RESUME
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("MEETING_RESUME_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        val stopIntent = Intent(reactContext, LafinaMeetingService::class.java).apply {
            action = LafinaMeetingService.ACTION_STOP
        }
        reactContext.startService(stopIntent)

        transcribeExecutor.execute {
            try {
                var waited = 0
                while (LafinaMeetingService.isRunning && waited < 3500) {
                    Thread.sleep(100)
                    waited += 100
                }
                val chunks = LafinaMeetingService.snapshotChunks()
                val durations = LafinaMeetingService.snapshotChunkDurationsMs()

                val filesArr = Arguments.createArray()
                chunks.forEach { filesArr.pushString(it) }

                val durationsArr = Arguments.createArray()
                durations.forEach { durationsArr.pushDouble(it.toDouble()) }

                val map = Arguments.createMap().apply {
                    putString("meetingId", LafinaMeetingService.activeMeetingId ?: "")
                    putArray("chunkFiles", filesArr)
                    putArray("chunkDurationsMs", durationsArr)
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("MEETING_STOP_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun isRecording(promise: Promise) {
        promise.resolve(LafinaMeetingService.isRunning)
    }

    @ReactMethod
    fun isPaused(promise: Promise) {
        promise.resolve(LafinaMeetingService.isPausedState)
    }

    @ReactMethod
    fun getRecoveryState(promise: Promise) {
        try {
            val state = LafinaMeetingService.readRecoveryState(reactContext)
            if (state == null) {
                promise.resolve(null)
                return
            }
            val filesArr = Arguments.createArray()
            val filesJson = state.optJSONArray("chunkFiles") ?: JSONArray()
            for (i in 0 until filesJson.length()) {
                filesArr.pushString(filesJson.optString(i))
            }

            val durationsArr = Arguments.createArray()
            val durationsJson = state.optJSONArray("chunkDurationsMs") ?: JSONArray()
            for (i in 0 until durationsJson.length()) {
                durationsArr.pushDouble(durationsJson.optDouble(i, 0.0))
            }

            val map = Arguments.createMap().apply {
                putString("meetingId", state.optString("meetingId", ""))
                putString("title", state.optString("title", "Meeting"))
                putString("status", state.optString("status", "stopped"))
                putDouble("updatedAt", state.optDouble("updatedAt", 0.0))
                putArray("chunkFiles", filesArr)
                putArray("chunkDurationsMs", durationsArr)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("RECOVERY_READ_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun clearRecoveryState(promise: Promise) {
        LafinaMeetingService.clearRecoveryState(reactContext)
        promise.resolve(true)
    }

    @ReactMethod
    fun transcribeChunkWithTimestamps(audioPath: String, chunkOffsetMs: Double, promise: Promise) {
        transcribeExecutor.execute {
            try {
                val file = File(audioPath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "Audio chunk file not found: $audioPath")
                    return@execute
                }
                val audioBytes = file.readBytes()
                if (audioBytes.size <= WAV_HEADER_BYTES) {
                    promise.resolve(Arguments.createArray())
                    return@execute
                }
                val pcmBytes = audioBytes.copyOfRange(WAV_HEADER_BYTES, audioBytes.size)
                val sampleCount = pcmBytes.size / 2
                val floatSamples = FloatArray(sampleCount)
                val byteBuffer = ByteBuffer.wrap(pcmBytes).order(ByteOrder.LITTLE_ENDIAN)
                for (i in 0 until sampleCount) {
                    floatSamples[i] = byteBuffer.short / 32768.0f
                }

                val context = obtainWhisperContext()
                if (context == 0L) {
                    promise.reject("WHISPER_INIT_ERROR", "Failed to initialize Whisper model")
                    return@execute
                }
                val cores = Runtime.getRuntime().availableProcessors()
                val threads = cores.coerceAtLeast(2).coerceAtMost(4)
                val rawJson = try {
                    LafinaWhisperBridge.transcribeWithTimestamps(context, floatSamples, threads)
                } finally {
                    scheduleWhisperRelease()
                }
                val parsed = JSONArray(rawJson)
                val result = Arguments.createArray()
                val offset = chunkOffsetMs.toLong()
                for (i in 0 until parsed.length()) {
                    val obj = parsed.getJSONObject(i)
                    val seg = Arguments.createMap().apply {
                        putDouble("start_ms", (obj.optLong("start_ms", 0L) + offset).toDouble())
                        putDouble("end_ms", (obj.optLong("end_ms", 0L) + offset).toDouble())
                        putString("text", obj.optString("text", ""))
                    }
                    result.pushMap(seg)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("MEETING_TRANSCRIBE_ERROR", e.message, e)
            }
        }
    }

    override fun invalidate() {
        transcribeExecutor.execute { freeWhisperContext() }
        transcribeExecutor.shutdown()
        super.invalidate()
    }

    @ReactMethod
    fun deleteAudioFile(path: String, promise: Promise) {
        try {
            val f = File(path)
            val deleted = if (f.exists()) f.delete() else true
            val parent = f.parentFile
            if (parent != null && parent.exists() && parent.listFiles()?.isEmpty() == true) {
                parent.delete()
            }
            promise.resolve(deleted)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Lists the 16 kHz mono PCM WAV chunks stored on disk for a meeting.
     * Duration is derived from the WAV payload size (32,000 bytes per second),
     * so recovered recordings and retries work without an in-memory snapshot.
     */
    @ReactMethod
    fun listMeetingAudio(meetingId: String, promise: Promise) {
        try {
            val safeId = File(meetingId).name
            val dir = File(LafinaMeetingService.meetingsRootDir(reactContext), safeId)
            val chunks = Arguments.createArray()
            var totalBytes = 0L

            if (dir.exists() && dir.isDirectory) {
                val files = dir.listFiles { file ->
                    file.isFile && file.name.endsWith(".wav") && file.length() > 44L
                }?.sortedBy { it.name } ?: emptyList()

                for (file in files) {
                    val bytes = file.length()
                    val pcmBytes = (bytes - 44L).coerceAtLeast(0L)
                    val durationMs = (pcmBytes * 1000L) / (16000L * 2L)
                    totalBytes += bytes
                    chunks.pushMap(Arguments.createMap().apply {
                        putString("path", file.absolutePath)
                        putDouble("durationMs", durationMs.toDouble())
                        putDouble("sizeBytes", bytes.toDouble())
                    })
                }
            }

            promise.resolve(Arguments.createMap().apply {
                putArray("chunks", chunks)
                putDouble("totalBytes", totalBytes.toDouble())
            })
        } catch (e: Exception) {
            promise.reject("MEETING_AUDIO_LIST_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun deleteMeetingAudio(meetingId: String, promise: Promise) {
        try {
            val safeId = File(meetingId).name
            val dir = File(LafinaMeetingService.meetingsRootDir(reactContext), safeId)
            if (dir.exists() && dir.isDirectory) {
                dir.listFiles()?.forEach { it.delete() }
                dir.delete()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Imports an external audio recording (WAV, MP3, M4A, AAC, OGG, FLAC) from the device,
     * decodes all audio tracks into 16 kHz mono 16-bit PCM, and slices the stream into
     * rolling 30-second WAV chunks in the meeting directory for offline Whisper transcription.
     */
    @ReactMethod
    fun importAudioFile(fileUri: String, meetingId: String, promise: Promise) {
        transcribeExecutor.execute {
            var extractor: MediaExtractor? = null
            var codec: MediaCodec? = null
            var pfd: android.os.ParcelFileDescriptor? = null
            try {
                if (LafinaMeetingService.isRunning) {
                    promise.reject("RECORDING_IN_PROGRESS", "Cannot import audio while a live recording is in progress.")
                    return@execute
                }

                val stat = StatFs(reactContext.filesDir.absolutePath)
                val freeMb = stat.availableBytes / (1024L * 1024L)
                if (freeMb < 50L) {
                    promise.reject("INSUFFICIENT_STORAGE", "At least 50 MB of free storage is required to import an audio recording.")
                    return@execute
                }

                val uri = Uri.parse(fileUri)
                val safeMeetingId = File(meetingId).name
                val meetingDir = File(LafinaMeetingService.meetingsRootDir(reactContext), safeMeetingId)
                if (!meetingDir.exists()) {
                    meetingDir.mkdirs()
                }

                extractor = MediaExtractor()
                if (fileUri.startsWith("content://")) {
                    pfd = reactContext.contentResolver.openFileDescriptor(uri, "r")
                        ?: throw IllegalArgumentException("Could not open file descriptor for: $fileUri")
                    extractor.setDataSource(pfd.fileDescriptor)
                } else {
                    val path = if (fileUri.startsWith("file://")) uri.path ?: fileUri.removePrefix("file://") else fileUri
                    extractor.setDataSource(path)
                }

                var audioTrackIndex = -1
                var audioFormat: MediaFormat? = null
                for (i in 0 until extractor.trackCount) {
                    val format = extractor.getTrackFormat(i)
                    val mime = format.getString(MediaFormat.KEY_MIME) ?: ""
                    if (mime.startsWith("audio/")) {
                        audioTrackIndex = i
                        audioFormat = format
                        break
                    }
                }

                if (audioTrackIndex < 0 || audioFormat == null) {
                    promise.reject("NO_AUDIO_TRACK", "No audio track was found in the selected file.")
                    return@execute
                }

                extractor.selectTrack(audioTrackIndex)
                val mime = audioFormat.getString(MediaFormat.KEY_MIME) ?: ""
                val sampleRate = if (audioFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
                    audioFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                } else 16000
                val channels = if (audioFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
                    audioFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                } else 1

                codec = MediaCodec.createDecoderByType(mime)
                codec.configure(audioFormat, null, null, 0)
                codec.start()

                val info = MediaCodec.BufferInfo()
                var isInputEOS = false
                var isOutputEOS = false
                val timeoutUs = 5000L

                val TARGET_SAMPLE_RATE = 16000
                val CHUNK_DURATION_SEC = 30
                val SAMPLES_PER_CHUNK = TARGET_SAMPLE_RATE * CHUNK_DURATION_SEC // 480,000 shorts

                val chunkFiles = Arguments.createArray()
                val chunkDurations = Arguments.createArray()
                var chunkIndex = 0
                var totalDurationMs = 0L
                var totalAudioBytes = 0L

                val chunkBuffer = ShortArray(SAMPLES_PER_CHUNK)
                var chunkBufferCount = 0

                fun flushCurrentChunk() {
                    if (chunkBufferCount <= 0) return
                    val chunkFile = File(meetingDir, String.format("chunk_%03d.wav", chunkIndex))
                    val shortsToSave = chunkBuffer.copyOfRange(0, chunkBufferCount)
                    writeWavFile(chunkFile, shortsToSave, TARGET_SAMPLE_RATE)

                    val durationMs = (chunkBufferCount * 1000L) / TARGET_SAMPLE_RATE
                    totalDurationMs += durationMs
                    val fileSize = chunkFile.length()
                    totalAudioBytes += fileSize

                    chunkFiles.pushString(chunkFile.absolutePath)
                    chunkDurations.pushDouble(durationMs.toDouble())

                    chunkIndex += 1
                    chunkBufferCount = 0
                }

                fun appendSamples(samples: ShortArray) {
                    var offset = 0
                    var remaining = samples.size
                    while (remaining > 0) {
                        val space = SAMPLES_PER_CHUNK - chunkBufferCount
                        val toCopy = Math.min(space, remaining)
                        System.arraycopy(samples, offset, chunkBuffer, chunkBufferCount, toCopy)
                        chunkBufferCount += toCopy
                        offset += toCopy
                        remaining -= toCopy
                        if (chunkBufferCount >= SAMPLES_PER_CHUNK) {
                            flushCurrentChunk()
                        }
                    }
                }

                while (!isOutputEOS) {
                    if (!isInputEOS) {
                        val inIndex = codec.dequeueInputBuffer(timeoutUs)
                        if (inIndex >= 0) {
                            val inBuffer = codec.getInputBuffer(inIndex)
                            if (inBuffer != null) {
                                inBuffer.clear()
                                val sampleSize = extractor.readSampleData(inBuffer, 0)
                                if (sampleSize < 0) {
                                    codec.queueInputBuffer(inIndex, 0, 0, 0L, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                    isInputEOS = true
                                } else {
                                    val pts = extractor.sampleTime
                                    codec.queueInputBuffer(inIndex, 0, sampleSize, pts, 0)
                                    extractor.advance()
                                }
                            }
                        }
                    }

                    val outIndex = codec.dequeueOutputBuffer(info, timeoutUs)
                    if (outIndex >= 0) {
                        if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                            isOutputEOS = true
                        }
                        val outBuffer = codec.getOutputBuffer(outIndex)
                        if (outBuffer != null && info.size > 0) {
                            outBuffer.position(info.offset)
                            outBuffer.limit(info.offset + info.size)
                            val shortCount = info.size / 2
                            val rawShorts = ShortArray(shortCount)
                            outBuffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(rawShorts)

                            val monoShorts = if (channels > 1 && channels <= 8) {
                                val monoLen = rawShorts.size / channels
                                val mono = ShortArray(monoLen)
                                for (m in 0 until monoLen) {
                                    var sum = 0
                                    for (c in 0 until channels) {
                                        sum += rawShorts[m * channels + c]
                                    }
                                    mono[m] = (sum / channels).coerceIn(-32768, 32767).toShort()
                                }
                                mono
                            } else {
                                rawShorts
                            }

                            val targetShorts = if (sampleRate != TARGET_SAMPLE_RATE && sampleRate > 0) {
                                resampleLinear(monoShorts, sampleRate, TARGET_SAMPLE_RATE)
                            } else {
                                monoShorts
                            }

                            appendSamples(targetShorts)
                        }
                        codec.releaseOutputBuffer(outIndex, false)
                    }
                }

                flushCurrentChunk()

                if (chunkIndex == 0) {
                    promise.reject("EMPTY_AUDIO", "The imported file contains no playable audio data.")
                    return@execute
                }

                val result = Arguments.createMap().apply {
                    putString("meetingId", meetingId)
                    putDouble("durationSeconds", totalDurationMs / 1000.0)
                    putDouble("audioBytes", totalAudioBytes.toDouble())
                    putArray("chunkFiles", chunkFiles)
                    putArray("chunkDurationsMs", chunkDurations)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("AUDIO_IMPORT_ERROR", e.message, e)
            } finally {
                try { codec?.stop() } catch (_: Exception) {}
                try { codec?.release() } catch (_: Exception) {}
                try { extractor?.release() } catch (_: Exception) {}
                try { pfd?.close() } catch (_: Exception) {}
            }
        }
    }

    private fun resampleLinear(input: ShortArray, fromRate: Int, toRate: Int): ShortArray {
        if (fromRate == toRate || input.isEmpty()) return input
        val outLength = ((input.size.toLong() * toRate) / fromRate).toInt()
        if (outLength <= 0) return ShortArray(0)
        val output = ShortArray(outLength)
        val ratio = fromRate.toDouble() / toRate.toDouble()
        for (i in 0 until outLength) {
            val srcPos = i * ratio
            val srcIndex = srcPos.toInt()
            val frac = srcPos - srcIndex
            if (srcIndex + 1 < input.size) {
                val s1 = input[srcIndex].toDouble()
                val s2 = input[srcIndex + 1].toDouble()
                output[i] = (s1 + frac * (s2 - s1)).toInt().coerceIn(-32768, 32767).toShort()
            } else if (srcIndex < input.size) {
                output[i] = input[srcIndex]
            }
        }
        return output
    }

    private fun writeWavFile(file: File, pcmShorts: ShortArray, sampleRate: Int) {
        val pcmByteCount = pcmShorts.size * 2
        val riffSize = 36 + pcmByteCount
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray(Charsets.US_ASCII))
            putInt(riffSize)
            put("WAVE".toByteArray(Charsets.US_ASCII))
            put("fmt ".toByteArray(Charsets.US_ASCII))
            putInt(16)
            putShort(1.toShort()) // PCM
            putShort(1.toShort()) // mono
            putInt(sampleRate)
            putInt(sampleRate * 2)
            putShort(2.toShort()) // blockAlign
            putShort(16.toShort()) // bitsPerSample
            put("data".toByteArray(Charsets.US_ASCII))
            putInt(pcmByteCount)
        }
        val pcmBytes = ByteBuffer.allocate(pcmByteCount).order(ByteOrder.LITTLE_ENDIAN)
        for (s in pcmShorts) {
            pcmBytes.putShort(s)
        }
        FileOutputStream(file).use { fos ->
            fos.write(header.array())
            fos.write(pcmBytes.array())
        }
    }
}
