import { NativeModules, Platform } from 'react-native';
import {
  parseIntentFastPath,
  isTitleNoisy,
  distillScheduleTitle,
  toTitleCase,
  detectCategory,
} from './fastPathParser';
import { getQwenModelPath, isQwenModelReady } from './modelManager';
import { executeNluAction, type ActionExecutorOptions } from './actionExecutor';
import {
  validateIntent,
  type ExtractedIntent,
  type ValidatedIntent,
  type NluActionResult,
  type ParsedIntentType,
} from './types';

export interface IntentExtractionOptions {
  referenceDate?: Date;
  preferOnDeviceSlm?: boolean;
}

const SCHEDULE_INTENTS: ReadonlySet<ParsedIntentType> = new Set([
  'create_task',
  'create_time_block',
  'create_reminder',
]);

function formatSlmTitle(
  slmTitle: string | null | undefined,
  fastPathTitle: string | null,
  intent: ParsedIntentType,
  rawTranscript: string,
): string | null {
  const candidate =
    slmTitle &&
    typeof slmTitle === 'string' &&
    slmTitle.trim().length > 0 &&
    slmTitle.trim().toLowerCase() !== rawTranscript.trim().toLowerCase()
      ? slmTitle.trim()
      : fastPathTitle;

  if (!candidate) {
    return fastPathTitle;
  }

  if (SCHEDULE_INTENTS.has(intent)) {
    const distilled = distillScheduleTitle(candidate);
    return distilled ? toTitleCase(distilled) : toTitleCase(candidate);
  }

  return candidate;
}

export class IntentService {
  /**
   * Smart Hybrid Intent Extractor:
   * 1. Evaluates deterministic fast path (< 5ms).
   * 2. Non-schedule-creation intents (query_schedule, CRUD update/delete, create_note, call responses)
   *    always return deterministically without SLM interference.
   * 3. If confidence is high (>= 0.85) and title is clean, returns immediately with zero battery/memory overhead.
   * 4. If ambiguous or noisy title detected on a schedule creation intent, and Qwen model is downloaded,
   *    invokes on-device SLM and fuses Qwen's distilled semantic title with Fast Path's deterministic local date/time arithmetic.
   * 5. Enforces strict schema validation before returning.
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

    // Non-creation intents (query_schedule, CRUD update/delete, create_note, call responses, chat)
    // must NEVER be sent to the SLM title distiller (which previously overwrote query_schedule with create_task).
    if (!SCHEDULE_INTENTS.has(fastPathResult.intent)) {
      return validateIntent(fastPathResult);
    }

    const noisy = isTitleNoisy(fastPathResult.title || '', trimmed);

    // If fast path has high confidence and a clean title (e.g. clear command, exact date/time)
    if (fastPathResult.confidence >= 0.85 && !options.preferOnDeviceSlm && !noisy) {
      return validateIntent(fastPathResult);
    }

    // Step 2: Check if Qwen on-device model is available for noisy schedule creation titles
    const extractor = NativeModules.LafinaIntentExtractor;
    if (Platform.OS === 'android' && extractor) {
      try {
        const modelReady = await isQwenModelReady();
        if (modelReady) {
          const modelPath = getQwenModelPath();
          const rawNativeJson = await extractor.extractIntent({
            transcript: trimmed,
            modelPath,
          });

          if (rawNativeJson) {
            const parsed = JSON.parse(rawNativeJson);
            // Preserve explicit time_block or reminder intent from fast path so SLM doesn't downgrade them to create_task
            const resolvedIntent: ParsedIntentType =
              fastPathResult.intent === 'create_time_block' ||
              fastPathResult.intent === 'create_reminder'
                ? fastPathResult.intent
                : SCHEDULE_INTENTS.has(parsed.intent)
                  ? parsed.intent
                  : fastPathResult.intent;

            const fusedTitle = formatSlmTitle(
              parsed.title,
              fastPathResult.title,
              resolvedIntent,
              trimmed,
            );

            // Best-of-Both Fusion:
            // - Title comes from Qwen's semantic distillation (cleaned & Title-Cased)
            // - Date, Time, EndTime, and Duration prioritize Fast Path's exact local clock math
            const slmIntent: ExtractedIntent = {
              intent: resolvedIntent,
              title: fusedTitle,
              date: fastPathResult.date || parsed.date || null,
              time: fastPathResult.time || parsed.time || null,
              endTime: fastPathResult.endTime || parsed.endTime || null,
              durationMinutes:
                fastPathResult.durationMinutes ?? parsed.duration_minutes ?? null,
              category:
                fastPathResult.category === 'Academic'
                  ? 'Academic'
                  : parsed.category ||
                    fastPathResult.category ||
                    detectCategory(`${fusedTitle || ''} ${trimmed}`),
              details: parsed.details || fusedTitle || trimmed,
              snoozeMinutes: fastPathResult.snoozeMinutes ?? parsed.snooze_minutes ?? null,
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

    // Step 3: Fallback to validated fast path (already sanitized via distillScheduleTitle)
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
