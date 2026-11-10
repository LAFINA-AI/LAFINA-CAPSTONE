import RNFS from 'react-native-fs';
import { cloudClient } from './cloudClient';
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
export const transcribeChunkWithElevenLabs = async (
  audioPath: string,
  offsetMs: number,
  userId?: string,
): Promise<TranscriptSegment[] | null> => {
  try {
    const exists = await RNFS.exists(audioPath);
    if (!exists) return null;

    const base64Audio = await RNFS.readFile(audioPath, 'base64');
    if (!base64Audio) return null;

    const result = await cloudClient.request<SttResponse>(
      '/v1/ai/stt',
      {
        method: 'POST',
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
        return result.data.segments.map((s) => ({
          start_ms: Math.round(s.start_ms + offsetMs),
          end_ms: Math.round(s.end_ms + offsetMs),
          text: s.text.trim(),
        }));
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
