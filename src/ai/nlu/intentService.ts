import { NativeModules, Platform } from 'react-native';
import { parseIntentFastPath } from './fastPathParser';
import { getQwenModelPath, isQwenModelReady } from './modelManager';
import { executeNluAction, type ActionExecutorOptions } from './actionExecutor';
import {
  validateIntent,
  type ExtractedIntent,
  type ValidatedIntent,
  type NluActionResult,
} from './types';

const { LafinaIntentExtractor } = NativeModules;

export interface IntentExtractionOptions {
  referenceDate?: Date;
  preferOnDeviceSlm?: boolean;
}

export class IntentService {
  /**
   * Smart Hybrid Intent Extractor:
   * 1. Evaluates deterministic fast path (< 5ms).
   * 2. If confidence is high (>= 0.85), returns immediately with zero battery/memory overhead.
   * 3. If ambiguous or SLM preferred, and Qwen model is downloaded, invokes on-device SLM.
   * 4. Enforces strict schema validation before returning.
   */
  async extractIntent(
    transcript: string,
    options: IntentExtractionOptions = {},
  ): Promise<ValidatedIntent> {
    const trimmed = (transcript || '').trim();
    if (!trimmed) {
      return validateIntent({
        intent: 'out_of_scope',
        title: null,
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Personal',
        details: null,
        snoozeMinutes: null,
        confidence: 0,
        source: 'fast_path',
        rawTranscript: transcript,
      });
    }

    // Step 1: Run Deterministic Fast Path
    const fastPathResult = parseIntentFastPath(trimmed, options.referenceDate);

    // If fast path has high confidence (e.g. clear command, exact date/time, call response)
    if (fastPathResult.confidence >= 0.85 && !options.preferOnDeviceSlm) {
      return validateIntent(fastPathResult);
    }

    // Step 2: Check if Qwen on-device model is available
    if (Platform.OS === 'android' && LafinaIntentExtractor) {
      try {
        const modelReady = await isQwenModelReady();
        if (modelReady) {
          const modelPath = getQwenModelPath();
          const rawNativeJson = await LafinaIntentExtractor.extractIntent({
            transcript: trimmed,
            modelPath,
          });

          if (rawNativeJson) {
            const parsed = JSON.parse(rawNativeJson);
            const slmIntent: ExtractedIntent = {
              intent: parsed.intent || fastPathResult.intent,
              title: parsed.title || fastPathResult.title,
              date: parsed.date || fastPathResult.date,
              time: parsed.time || fastPathResult.time,
              endTime: parsed.endTime || fastPathResult.endTime,
              durationMinutes: parsed.duration_minutes || fastPathResult.durationMinutes,
              category: parsed.category || fastPathResult.category,
              details: parsed.details || trimmed,
              snoozeMinutes: parsed.snooze_minutes || fastPathResult.snoozeMinutes,
              confidence: 0.95,
              source: 'on_device_slm',
              rawTranscript: transcript,
            };
            return validateIntent(slmIntent);
          }
        }
      } catch (err) {
        console.warn('[IntentService] Native SLM extraction error, falling back to fast-path:', err);
      }
    }

    // Step 3: Fallback to validated fast path
    return validateIntent(fastPathResult);
  }

  /**
   * End-to-end NLU loop:
   * Extracts validated intent from transcript and executes the resulting database & scheduler mutations.
   */
  async processAndExecuteIntent(
    userId: string,
    transcript: string,
    options: ActionExecutorOptions = {},
  ): Promise<NluActionResult> {
    const validated = await this.extractIntent(transcript, { referenceDate: options.referenceDate });
    return executeNluAction(userId, validated, options);
  }
}

export const intentService = new IntentService();
