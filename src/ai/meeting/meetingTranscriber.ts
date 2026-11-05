import {
  meetingRecorder,
  TranscriptSegment,
} from '../native/meetingRecorder';

export interface MeetingTranscriptionProgress {
  meetingId: string;
  completedChunks: number;
  totalChunks: number;
  failedChunks: number;
  segments: TranscriptSegment[];
  fullTranscript: string;
  cancelled: boolean;
  lastError: string | null;
}

export interface TranscribeMeetingOptions {
  meetingId: string;
  chunkFiles: string[];
  chunkDurationsMs?: number[];
  /**
   * When false (default), raw audio chunk files are automatically deleted
   * immediately after transcription to free device storage.
   * When true, raw audio files remain on disk so the user can re-transcribe.
   */
  keepAudio?: boolean;
  /** Checked between chunks so the user can cancel a long transcription. */
  shouldCancel?: () => boolean;
  onProgress?: (
    progress: number,
    completedChunks: number,
    totalChunks: number,
  ) => void;
}

const DEFAULT_CHUNK_DURATION_MS = 30_000;

/**
 * Sequentially transcribes 30-second WAV chunks recorded by `LafinaMeetingService`
 * using the bundled `whisper.cpp` JNI engine (`LafinaWhisperBridge`) and deletes
 * each raw audio file immediately after transcription unless `keepAudio: true`
 * is explicitly passed.
 */
export const transcribeMeetingChunks = async (
  options: TranscribeMeetingOptions,
): Promise<MeetingTranscriptionProgress> => {
  const { meetingId, chunkFiles, chunkDurationsMs, onProgress } = options;
  const keepAudio = Boolean(options.keepAudio);
  const segments: TranscriptSegment[] = [];
  const totalChunks = chunkFiles.length;
  let offsetMs = 0;
  let failedChunks = 0;
  let cancelled = false;
  let lastError: string | null = null;

  for (let index = 0; index < totalChunks; index += 1) {
    if (options.shouldCancel?.()) {
      cancelled = true;
      break;
    }
    const chunkPath = chunkFiles[index];
    const chunkDuration =
      chunkDurationsMs &&
      typeof chunkDurationsMs[index] === 'number' &&
      chunkDurationsMs[index] > 0
        ? chunkDurationsMs[index]
        : DEFAULT_CHUNK_DURATION_MS;
    try {
      const chunkSegments = await meetingRecorder.transcribeChunk(
        chunkPath,
        offsetMs,
      );
      for (const seg of chunkSegments) {
        const cleaned = seg.text.trim();
        if (cleaned.length > 0) {
          segments.push({
            start_ms: seg.start_ms,
            end_ms: seg.end_ms,
            text: cleaned,
          });
        }
      }
    } catch (err) {
      failedChunks += 1;
      lastError = err instanceof Error ? err.message : String(err);
      console.error(
        `[MeetingTranscriber] Failed to transcribe chunk ${index}:`,
        err,
      );
    } finally {
      if (!keepAudio) {
        await meetingRecorder.deleteAudioFile(chunkPath).catch(() => false);
      }
    }
    offsetMs += chunkDuration;
    onProgress?.((index + 1) / totalChunks, index + 1, totalChunks);
  }

  const fullTranscript = segments.map((s) => s.text).join(' ');
  if (!keepAudio && !cancelled) {
    await meetingRecorder.clearRecoveryState().catch(() => false);
  }
  return {
    meetingId,
    completedChunks: cancelled ? segments.length : totalChunks,
    totalChunks,
    failedChunks,
    segments,
    fullTranscript,
    cancelled,
    lastError,
  };
};
