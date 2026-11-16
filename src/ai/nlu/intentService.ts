import { NativeModules, Platform } from 'react-native';
import {
  parseIntentFastPath,
  isTitleNoisy,
  distillScheduleTitle,
  toTitleCase,
  detectCategory,
} from './fastPathParser';
import { getActiveOfflineModelReadyConfig } from './modelManager';
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
  userId?: string;
}

const SCHEDULE_INTENTS: ReadonlySet<ParsedIntentType> = new Set([
  'create_task',
  'create_time_block',
  'create_reminder',
]);

const QUESTION_PREFIX_REGEX =
  /^(?:what|who|where|when|why|how|tell\s+me|show\s+me|check\s+my|audit|am\s+i\s+free|can\s+you\s+check|give\s+me)\b/i;

const UNSTRUCTURED_TAGLISH_SCHEDULE_REGEX =
  /\b(?:pa-?(?:remind|schedule|add|book)|mag-?(?:aral|study|review|meeting|pasa)|may\s+(?:quiz|exam|midterm|finals|pasok|klase|meeting|defense|deadline|reporting)\s+(?:kami|ako|tayo)|bukas\s+(?:ng\s+)?\d|mamaya(?:ng)?\s+\d)\b/i;

const TAGLISH_OR_COLLOQUIAL_SCHEDULE_REGEX =
  /\b(?:pa-?(?:remind|schedule|add|book)|bukas|mamaya|magpasa|mag-?(?:aral|study|review|pasa))\b/i;

function isUnstructuredOfflineScheduleCandidate(
  transcript: string,
  fastPathResult: ExtractedIntent,
): boolean {
  if (fastPathResult.intent !== 'chat') {
    return false;
  }
  const trimmed = transcript.trim();
  if (!trimmed || trimmed.endsWith('?') || QUESTION_PREFIX_REGEX.test(trimmed)) {
    return false;
  }
  return UNSTRUCTURED_TAGLISH_SCHEDULE_REGEX.test(trimmed);
}

function isTaglishOrColloquialSchedule(transcript: string): boolean {
  return TAGLISH_OR_COLLOQUIAL_SCHEDULE_REGEX.test(transcript.trim());
}

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
   *    return deterministically without SLM interference unless an explicit unstructured scheduling phrase fell back to `chat`.
   * 3. If confidence is high (>= 0.85) and title is clean (and not Taglish/colloquial), returns immediately with zero battery/memory overhead.
   * 4. If ambiguous, noisy, or unstructured scheduling is detected, and the user's selected offline model is downloaded
   *    (and not set to `fast_path_only`), invokes the on-device SLM with the preset's promptFormat (`chatml` or `gemma`)
   *    and fuses its distilled semantic fields with Fast Path's deterministic local date/time arithmetic.
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
    const unstructuredCandidate = isUnstructuredOfflineScheduleCandidate(
      trimmed,
      fastPathResult,
    );

    // Non-creation intents (query_schedule, CRUD update/delete, create_note, call responses, chat)
    // must NEVER be sent to the SLM title distiller (except explicit unstructured scheduling phrases in `chat`).
    if (!SCHEDULE_INTENTS.has(fastPathResult.intent) && !unstructuredCandidate) {
      return validateIntent(fastPathResult);
    }

    const noisy = isTitleNoisy(fastPathResult.title || '', trimmed);
    const taglishOrColloquial = isTaglishOrColloquialSchedule(trimmed);

    // If fast path has high confidence and a clean title (e.g. clear command, exact date/time)
    if (
      SCHEDULE_INTENTS.has(fastPathResult.intent) &&
      fastPathResult.confidence >= 0.85 &&
      !options.preferOnDeviceSlm &&
      !noisy &&
      !taglishOrColloquial
    ) {
      return validateIntent(fastPathResult);
    }

    // Step 2: Check if the user's selected offline AI preset is downloaded and active
    const extractor = NativeModules.LafinaIntentExtractor;
    if (Platform.OS === 'android' && extractor) {
      try {
        const activeModel = await getActiveOfflineModelReadyConfig(
          options.userId,
        );
        if (activeModel) {
          const rawNativeJson = await extractor.extractIntent({
            transcript: trimmed,
            modelPath: activeModel.modelPath,
            promptFormat: activeModel.promptFormat,
          });

          if (rawNativeJson) {
            const parsed = JSON.parse(rawNativeJson);
            if (unstructuredCandidate && !SCHEDULE_INTENTS.has(parsed.intent)) {
              return validateIntent(fastPathResult);
            }

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
            // - Title comes from the active offline SLM's semantic distillation (cleaned & Title-Cased)
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
              snoozeMinutes:
                fastPathResult.snoozeMinutes ?? parsed.snooze_minutes ?? null,
              confidence: 0.95,
              source: 'on_device_slm',
              rawTranscript: transcript,
            };
            return validateIntent(slmIntent);
          }
        }
      } catch (err) {
        console.warn(
          '[IntentService] Native SLM extraction error, falling back to fast-path:',
          err,
        );
      }
    }

    // Step 3: Fallback to validated fast path (already sanitized via distillScheduleTitle)
    return validateIntent(fastPathResult);
  }

  /**
   * End-to-end NLU loop:
   * Extracts validated intent from transcript and executes the resulting database & scheduler mutations.
   *
   * @deprecated Test-only (AGY-PORT 04). It writes without a review, so no
   * product code may call it: Chat and Voice go through
   * `chatOrchestrator.processMessage`, which prepares a reviewed command and
   * writes only on Confirm. `scripts/check-architecture.mjs` fails the build if
   * any module under `src/` other than this file references it. It stays so the
   * Phase 07 parser/executor regression tests keep exercising
   * `executeNluAction` end to end.
   */
  async processAndExecuteIntent(
    userId: string,
    transcript: string,
    options: ActionExecutorOptions = {},
  ): Promise<NluActionResult> {
    const validated = await this.extractIntent(transcript, {
      referenceDate: options.referenceDate,
      userId,
    });
    return executeNluAction(userId, validated, options);
  }
}

export const intentService = new IntentService();
