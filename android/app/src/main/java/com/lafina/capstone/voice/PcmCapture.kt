package com.lafina.capstone.voice

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import java.io.Closeable
import java.util.concurrent.atomic.AtomicBoolean

internal class CaptureFailure(val reason: String) : Exception(reason)

/** A single foreground 16kHz PCM recorder, bounded in memory and stopped before decoding. */
internal class PcmCapture private constructor(
  private val record: AudioRecord,
  private val audio: AudioManager,
  private val focus: AudioFocusRequest,
) : Closeable {
  private val stopped = AtomicBoolean(false)
  private val closed = AtomicBoolean(false)

  fun read(holding: AtomicBoolean, cancelled: AtomicBoolean): FloatArray {
    val samples = FloatArray(SpeechInputPolicy.MAX_SAMPLES)
    val chunk = ShortArray(1_024)
    var count = 0
    try {
      while (holding.get() && !cancelled.get() && count < samples.size) {
        if (audio.mode != AudioManager.MODE_NORMAL) throw CaptureFailure("AUDIO_INTERRUPTED")
        if (record.activeRecordingConfiguration?.isClientSilenced == true) throw CaptureFailure("MIC_BUSY")
        val read = record.read(chunk, 0, minOf(chunk.size, samples.size - count), AudioRecord.READ_BLOCKING)
        when (SpeechInputPolicy.readOutcome(read, holding.get(), cancelled.get())) {
          CaptureReadOutcome.FINISHED -> break
          CaptureReadOutcome.ERROR -> throw CaptureFailure("MIC_READ_FAILED")
          CaptureReadOutcome.DATA -> Unit
        }
        for (index in 0 until read) samples[count++] = chunk[index] / 32_768f
      }
      return samples.copyOf(count)
    } finally {
      // No audio file/cache survives the request. The caller also drops the final PCM after decode.
      samples.fill(0f)
      chunk.fill(0)
      close()
    }
  }

  fun stop() {
    if (stopped.compareAndSet(false, true)) {
      try { record.stop() } catch (_: Exception) { }
    }
  }

  override fun close() {
    stop()
    if (closed.compareAndSet(false, true)) {
      try { record.release() } catch (_: Exception) { }
      try { audio.abandonAudioFocusRequest(focus) } catch (_: Exception) { }
    }
  }

  companion object {
    /** Caller has just checked RECORD_AUDIO and a visible explicit hold on the main thread. */
    @SuppressLint("MissingPermission")
    fun open(context: Context, interrupted: (String) -> Unit): PcmCapture {
      val audio = context.getSystemService(AudioManager::class.java)
      if (audio.mode != AudioManager.MODE_NORMAL) throw CaptureFailure("AUDIO_INTERRUPTED")
      val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
        .setAudioAttributes(AudioAttributes.Builder().setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY).build())
        .setAcceptsDelayedFocusGain(false).setWillPauseWhenDucked(true)
        .setOnAudioFocusChangeListener({ change ->
          if (change != AudioManager.AUDIOFOCUS_GAIN) interrupted("AUDIO_FOCUS_LOST")
        }, Handler(Looper.getMainLooper())).build()
      val focusGranted = try { audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED } catch (_: Exception) { false }
      if (!focusGranted) throw CaptureFailure("AUDIO_FOCUS_DENIED")
      var record: AudioRecord? = null
      try {
        val minimum = AudioRecord.getMinBufferSize(SpeechInputPolicy.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minimum <= 0) throw CaptureFailure("MIC_FORMAT_UNAVAILABLE")
        record = AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
          .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(SpeechInputPolicy.SAMPLE_RATE).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build())
          .setBufferSizeInBytes(maxOf(minimum * 2, 3_200)).build()
        if (record.state != AudioRecord.STATE_INITIALIZED) throw CaptureFailure("MIC_UNAVAILABLE")
        record.startRecording()
        if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) throw CaptureFailure("MIC_UNAVAILABLE")
        return PcmCapture(record, audio, focus)
      } catch (failure: Exception) {
        try { record?.release() } catch (_: Exception) { }
        try { audio.abandonAudioFocusRequest(focus) } catch (_: Exception) { }
        throw failure
      }
    }
  }
}
