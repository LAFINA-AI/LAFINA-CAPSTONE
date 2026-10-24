import {
  playSpeechFile,
  speakTextWithTts,
  stopSpeechPlayback,
} from '../ai/tts/ttsService';

export interface CallSpeechResult {
  source: 'gemini' | 'native_tts';
}

export interface CallSpeechProvider {
  speakText: (
    text: string,
    options?: { fallbackAudioPath?: string | null },
  ) => Promise<CallSpeechResult>;
  stopSpeech?: () => Promise<void>;
  prepareText?: (text: string) => Promise<void>;
  dispose?: () => Promise<void>;
}

/**
 * Default offline implementation using react-native-tts (Android TextToSpeech).
 */
export const defaultCallSpeechProvider: CallSpeechProvider = {
  speakText: async (
    text: string,
    options?: { fallbackAudioPath?: string | null },
  ): Promise<CallSpeechResult> => {
    if (options?.fallbackAudioPath) {
      try {
        const success = await playSpeechFile(options.fallbackAudioPath);
        if (success) {
          return { source: 'native_tts' };
        }
      } catch {
        // Fall through to react-native-tts synthesis
      }
    }
    await speakTextWithTts(text);
    return { source: 'native_tts' };
  },
  stopSpeech: async (): Promise<void> => {
    await stopSpeechPlayback();
  },
};
