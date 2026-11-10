import {
  playSpeechFile,
  speakTextWithTts,
  stopSpeechPlayback,
} from '../ai/tts/ttsService';

export interface CallSpeechResult {
  source: 'elevenlabs' | 'native_tts' | 'cancelled';
  fallbackReason?: string;
}

/**
 * Speaks a reply while it is still being written: each finished sentence is
 * voiced as soon as it exists instead of after the whole reply.
 */
export interface SpeechStream {
  /** The reply so far; call again each time it grows. */
  update: (replySoFar: string) => void;
  /** The finished reply. Resolves once all of it has been spoken. */
  finish: (finalReply: string) => Promise<CallSpeechResult>;
  /** Drops the reply (an error or a newer request); stops its speech. */
  cancel: () => void;
}

export interface CallSpeechProvider {
  speakText: (
    text: string,
    options?: {fallbackAudioPath?: string | null},
  ) => Promise<CallSpeechResult>;
  stopSpeech?: () => Promise<void>;
  prepareText?: (text: string) => Promise<void>;
  /** Starts speaking a reply that is still arriving. */
  startSpeechStream?: () => SpeechStream;
  /** Checks online speech ahead of time so the first reply starts sooner. */
  warmUp?: () => Promise<void>;
  dispose?: () => Promise<void>;
}

/**
 * Default offline implementation using react-native-tts (Android TextToSpeech).
 */
export const defaultCallSpeechProvider: CallSpeechProvider = {
  speakText: async (
    text: string,
    options?: {fallbackAudioPath?: string | null},
  ): Promise<CallSpeechResult> => {
    if (options?.fallbackAudioPath) {
      try {
        const success = await playSpeechFile(options.fallbackAudioPath);
        if (success) {
          return {source: 'native_tts'};
        }
      } catch {
        // Fall through to react-native-tts synthesis
      }
    }
    await speakTextWithTts(text);
    return {source: 'native_tts'};
  },
  stopSpeech: async (): Promise<void> => {
    await stopSpeechPlayback();
  },
};
