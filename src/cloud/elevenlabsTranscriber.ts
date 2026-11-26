import RNFS from 'react-native-fs';
import { cloudClient, LONG_REQUEST_TIMEOUT_MS } from './cloudClient';
import type { TranscriptSegment } from '../ai/native/meetingRecorder';

interface SttResponse {
  provider?: string;
  text?: string;
  segments?: Array<{
    start_ms: number;
    end_ms: number;
    text: string;
  }>;
  words?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

/**
 * ponytail: Transcribes an audio chunk using ElevenLabs speech-to-text via backend proxy.
 * Returns null on any failure so the caller seamlessly falls back to on-device Whisper.
 */
const MAX_CLOUD_STT_AUDIO_BYTES = 25 * 1024 * 1024;

export const transcribeChunkWithElevenLabs = async (
  audioPath: string,
  offsetMs: number,
  userId?: string,
  signal?: AbortSignal,
): Promise<TranscriptSegment[] | null> => {
  try {
    if (signal?.aborted) return null;
    if (!cloudClient.getAccessToken()) return null;
    if (!(await cloudClient.isOnline())) return null;
    if (signal?.aborted) return null;

    const exists = await RNFS.exists(audioPath);
    if (!exists) return null;
    if (typeof RNFS.stat === 'function') {
      const stat = await RNFS.stat(audioPath).catch(() => null);
      const bytes = Number(stat?.size ?? 0);
      if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_CLOUD_STT_AUDIO_BYTES) {
        return null;
      }
    }
    if (signal?.aborted) return null;

    const base64Audio = await RNFS.readFile(audioPath, 'base64');
    if (!base64Audio || signal?.aborted) return null;

    const result = await cloudClient.request<SttResponse>(
      '/v1/ai/stt',
      {
        method: 'POST',
        timeoutMs: LONG_REQUEST_TIMEOUT_MS,
        ...(signal ? {signal} : {}),
        body: JSON.stringify({
          audio: base64Audio,
          mimeType: 'audio/wav',
          provider: 'elevenlabs',
          model: 'scribe_v1',
          offset_ms: offsetMs,
          user_id: userId,
        }),
      },
      true,
    );

    if (result.status === 'success' && result.data) {
      if (
        Array.isArray(result.data.segments) &&
        result.data.segments.length > 0
      ) {
        const validSegments = result.data.segments
          .filter(
            s =>
              s != null &&
              typeof s.text === 'string' &&
              s.text.trim().length > 0 &&
              typeof s.start_ms === 'number' &&
              Number.isFinite(s.start_ms) &&
              typeof s.end_ms === 'number' &&
              Number.isFinite(s.end_ms),
          )
          .map(s => ({
            start_ms: Math.round(s.start_ms + offsetMs),
            end_ms: Math.round(s.end_ms + offsetMs),
            text: s.text.trim(),
          }));
        if (validSegments.length > 0) return validSegments;
      }

      if (result.data.text && result.data.text.trim().length > 0) {
        return [
          {
            start_ms: offsetMs,
            end_ms: offsetMs + 30_000,
            text: result.data.text.trim(),
          },
        ];
      }
    }

    return null;
  } catch (err) {
    console.warn(
      '[ElevenLabsTranscriber] Cloud STT error, falling back to local Whisper:',
      err,
    );
    return null;
  }
};
