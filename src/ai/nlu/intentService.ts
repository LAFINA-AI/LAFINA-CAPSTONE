import {NativeModules, Platform} from 'react-native';
import {
  parseIntentFastPath,
  isTitleNoisy,
  distillScheduleTitle,
  toTitleCase,
  detectCategory,
} from './fastPathParser';
import {
  getActiveOfflineModelReadyConfig,
  getSelectedOfflineModelId,
  isOfflineModelEngineAvailable,
} from './modelManager';
import {executeNluAction, type ActionExecutorOptions} from './actionExecutor';
import {
  validateIntent,
  type ExtractedIntent,
  type ValidatedIntent,
  type NluActionResult,
  type ParsedIntentType,
} from './types';
import {monotonicNow, type RequestTrace} from '../benchmark/requestTrace';

export interface IntentExtractionOptions {
  referenceDate?: Date;
  preferOnDeviceSlm?: boolean;
  userId?: string;
  /**
   * Longest wait for the on-device model before the parser's reading is
   * used instead (a live call cannot wait). No limit when left out.
   */
  slmTimeoutMs?: number;
  /**
   * A live call: a confident, clean parser reading is used at once even when
   * the on-device model is preferred, so the student is not kept waiting.
   */
  trustConfidentFastPath?: boolean;
  /** Developer timing for this one request (only when tracking is on). */
  trace?: RequestTrace | null;
  /** Stops waiting for the on-device model (and asks it to stop). */
  signal?: AbortSignal;
  /**
   * Developer benchmark only, labelled SIMULATED in results: behave as if no
   * offline model were installed. Never set by product code.
   */
  simulateMissingModel?: boolean;
}

/**
 * Races `work` against both an optional timeout (`slmTimeoutMs`) and an
 * optional `AbortSignal`, cleaning up both timer and abort listener as soon as
 * either settles so nothing leaks or fires duplicate cancellations.
 */
const withinLimitAndSignal = <T>(
  work: Promise<T>,
  ms: number | undefined,
  signal: AbortSignal | undefined,
  onTimeout: () => void,
  onAbort: () => void,
): Promise<T | null> => {
  const hasTimeout = Boolean(ms && ms > 0);
  if (!hasTimeout && !signal) return work;
  if (signal?.aborted) {
    work.catch(() => undefined);
    try {
      onAbort();
    } catch {}
    return Promise.resolve(null);
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;
  const racers: Array<Promise<T | null>> = [work];
  if (hasTimeout) {
    racers.push(
      new Promise<null>(resolve => {
        timer = setTimeout(() => {
          timer = null;
          try {
            onTimeout();
          } catch {}
          resolve(null);
        }, ms);
      }),
    );
  }
  if (signal) {
    racers.push(
      new Promise<null>(resolve => {
        abortListener = () => {
          try {
            onAbort();
          } catch {}
          resolve(null);
        };
        signal.addEventListener('abort', abortListener);
      }),
    );
  }
  return Promise.race(racers).finally(() => {
    if (timer) clearTimeout(timer);
    if (signal && abortListener) {
      signal.removeEventListener('abort', abortListener);
    }
  });
};

/** Load and inference timings the native engine reports with an answer. */
const readNativeTiming = (
  parsed: unknown,
): {loadMs: number; inferenceMs: number; cold: boolean} | null => {
  const timing = (parsed as {timing?: unknown} | null)?.timing as
    | {load_ms?: unknown; inference_ms?: unknown; cold?: unknown}
    | undefined;
  if (
    !timing ||
    typeof timing.load_ms !== 'number' ||
    typeof timing.inference_ms !== 'number'
  ) {
    return null;
  }
  return {
    loadMs: timing.load_ms,
    inferenceMs: timing.inference_ms,
    cold: timing.cold === true,
  };
};

/** Why no offline model was asked; only worked out while timing is on. */
const describeMissingModel = async (userId?: string): Promise<string> => {
  try {
    if (getSelectedOfflineModelId(userId) === 'fast_path_only')
      return 'fast_path_only_selected';
    if (!(await isOfflineModelEngineAvailable())) return 'engine_unavailable';
    return 'not_installed';
  } catch {
    return 'not_checked';
  }
};

let slmRequestSeq = 0;

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
  if (
    !trimmed ||
    trimmed.endsWith('?') ||
    QUESTION_PREFIX_REGEX.test(trimmed)
  ) {
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
   *
   * With `options.trace` (Developer timing only) it also records how long
   * parsing took, whether the model was asked, its load and inference times
   * when the engine reports them, and why its answer was not used.
   */
  async extractIntent(
    transcript: string,
    options: IntentExtractionOptions = {},
  ): Promise<ValidatedIntent> {
    const trace = options.trace ?? null;
    if (!trace) return this.extract(transcript, options);
    const startedAt = monotonicNow();
    try {
      const result = await this.extract(transcript, options);
      trace.note({intentSource: result.source, intent: result.intent});
      return result;
    } finally {
      trace.addDuration('intentParse', monotonicNow() - startedAt);
    }
  }

  private async extract(
    transcript: string,
    options: IntentExtractionOptions,
  ): Promise<ValidatedIntent> {
    const trace = options.trace ?? null;
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
    const fastStartedAt = trace ? monotonicNow() : 0;
    const fastPathResult = parseIntentFastPath(trimmed, options.referenceDate);
    const unstructuredCandidate = isUnstructuredOfflineScheduleCandidate(
      trimmed,
      fastPathResult,
    );
    trace?.addDuration('fastPath', monotonicNow() - fastStartedAt);

    // Non-creation intents (query_schedule, CRUD update/delete, create_note, call responses, chat)
    // must NEVER be sent to the SLM title distiller (except explicit unstructured scheduling phrases in `chat`).
    if (
      !SCHEDULE_INTENTS.has(fastPathResult.intent) &&
      !unstructuredCandidate
    ) {
      trace?.note({modelState: 'not_used'});
      return validateIntent(fastPathResult);
    }

    const noisy = isTitleNoisy(fastPathResult.title || '', trimmed);
    const taglishOrColloquial = isTaglishOrColloquialSchedule(trimmed);

    // If fast path has high confidence and a clean title (e.g. clear command, exact date/time)
    if (
      SCHEDULE_INTENTS.has(fastPathResult.intent) &&
      fastPathResult.confidence >= 0.85 &&
      (!options.preferOnDeviceSlm || options.trustConfidentFastPath) &&
      !noisy &&
      !taglishOrColloquial
    ) {
      trace?.note({modelState: 'not_used'});
      return validateIntent(fastPathResult);
    }

    // Step 2: Check if the user's selected offline AI preset is downloaded and active
    const extractor = NativeModules.LafinaIntentExtractor;
    if (options.simulateMissingModel) {
      trace?.note({modelAvailability: 'simulated_missing', modelState: 'not_used'});
    } else if (Platform.OS === 'android' && extractor) {
      try {
        if (options.signal?.aborted) {
          trace?.note({
            fallbackReason: 'cancelled before the offline model started',
          });
          return validateIntent(fastPathResult);
        }
        const activeModel = await getActiveOfflineModelReadyConfig(
          options.userId,
        );
        if (options.signal?.aborted) {
          trace?.note({
            fallbackReason: 'cancelled before the offline model started',
          });
          return validateIntent(fastPathResult);
        }
        if (!activeModel && trace) {
          trace.note({
            modelAvailability: await describeMissingModel(options.userId),
            modelState: 'not_used',
          });
        }
        if (activeModel) {
          trace?.note({
            modelAvailability: 'installed',
            modelAttempted: true,
            offlineModelId: activeModel.modelId,
          });
          const askedAt = Date.now();
          const callStartedAt = trace ? monotonicNow() : 0;
          const requestId = `slm-${Date.now()}-${++slmRequestSeq}`;
          const cancelNative = () => {
            void Promise.resolve(
              extractor.cancelExtraction?.(requestId),
            ).catch(() => undefined);
          };
          let timedOut = false;
          const rawNativeJson = await withinLimitAndSignal<string>(
            extractor.extractIntent({
              transcript: trimmed,
              modelPath: activeModel.modelPath,
              promptFormat: activeModel.promptFormat,
              minValidBytes: activeModel.minValidSizeBytes,
              requestId,
            }),
            options.slmTimeoutMs,
            options.signal,
            () => {
              timedOut = true;
              cancelNative();
            },
            cancelNative,
          );
          trace?.addDuration('modelCall', monotonicNow() - callStartedAt);
          if (rawNativeJson === null && options.slmTimeoutMs && timedOut)
            console.log(
              `[IntentService] On-device model took over ${options.slmTimeoutMs}ms; using the parser`,
            );

          const parsed = rawNativeJson ? JSON.parse(rawNativeJson) : null;
          console.log(
            `[IntentService] ${activeModel.modelId}: ${
              parsed?.engine === 'slm' ? 'model answered' : 'no model answer'
            } in ${Date.now() - askedAt}ms`,
          );
          if (trace) {
            const nativeTiming = readNativeTiming(parsed);
            if (nativeTiming) {
              trace.addDuration('modelLoad', nativeTiming.loadMs);
              trace.addDuration('modelInference', nativeTiming.inferenceMs);
            }
            trace.note({
              modelState: nativeTiming
                ? nativeTiming.cold
                  ? 'cold'
                  : 'warm'
                : 'unknown',
            });
            if (rawNativeJson === null) {
              trace.note({
                fallbackReason: options.signal?.aborted
                  ? 'cancelled while the offline model was reading'
                  : timedOut
                  ? `offline model took over ${options.slmTimeoutMs}ms; parser answered`
                  : 'offline model gave no answer; parser answered',
              });
            } else if (parsed?.engine !== 'slm') {
              trace.note({
                fallbackReason:
                  'offline model could not run; native regex fallback, parser answered',
              });
            }
          }
          // Only a real model answer may override the fast path (audit H4):
          // the native Kotlin regex fallback is weaker than the TypeScript
          // parser and must never be labelled on_device_slm.
          if (parsed && parsed.engine === 'slm') {
            if (unstructuredCandidate && !SCHEDULE_INTENTS.has(parsed.intent)) {
              trace?.note({
                fallbackReason:
                  'offline model answer was not a scheduling intent; parser answered',
              });
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
            // - Date, Time, EndTime, Duration, and deterministic modifiers (deliveryStyle,
            //   recurrenceRule, priority, targetEntityType, leadMinutes, targetTitle)
            //   prioritize Fast Path's exact local parsing.
            const slmDate =
              typeof parsed.date === 'string' && parsed.date.trim()
                ? parsed.date.trim()
                : null;
            const slmTime =
              typeof parsed.time === 'string' && parsed.time.trim()
                ? parsed.time.trim()
                : null;
            const slmEndTime =
              typeof parsed.endTime === 'string' && parsed.endTime.trim()
                ? parsed.endTime.trim()
                : null;
            const slmDuration =
              typeof parsed.duration_minutes === 'number' &&
              Number.isFinite(parsed.duration_minutes) &&
              parsed.duration_minutes > 0
                ? parsed.duration_minutes
                : null;
            const slmCategory =
              typeof parsed.category === 'string' && parsed.category.trim()
                ? parsed.category.trim()
                : null;
            const slmDetails =
              typeof parsed.details === 'string' && parsed.details.trim()
                ? parsed.details.trim()
                : null;
            const slmSnooze =
              typeof parsed.snooze_minutes === 'number' &&
              Number.isFinite(parsed.snooze_minutes) &&
              parsed.snooze_minutes > 0
                ? parsed.snooze_minutes
                : null;

            const slmIntent: ExtractedIntent = {
              ...fastPathResult,
              intent: resolvedIntent,
              title: fusedTitle,
              date: fastPathResult.date || slmDate || null,
              time: fastPathResult.time || slmTime || null,
              endTime: fastPathResult.endTime || slmEndTime || null,
              durationMinutes:
                fastPathResult.durationMinutes ?? slmDuration ?? null,
              category:
                fastPathResult.category === 'Academic'
                  ? 'Academic'
                  : slmCategory ||
                    fastPathResult.category ||
                    detectCategory(`${fusedTitle || ''} ${trimmed}`),
              details: slmDetails || fusedTitle || trimmed,
              snoozeMinutes:
                fastPathResult.snoozeMinutes ?? slmSnooze ?? null,
              confidence: 0.95,
              source: 'on_device_slm',
              rawTranscript: transcript,
            };
            const slmValidated = validateIntent(slmIntent);
            // A malformed model field (bad time, empty title) falls back to
            // the deterministic parse instead of surfacing an error.
            if (slmValidated.isValid) {
              trace?.note({modelUsed: true});
              return slmValidated;
            }
            trace?.note({
              fallbackReason:
                'offline model answer failed validation; parser answered',
            });
            return validateIntent(fastPathResult);
          }
        }
      } catch (err) {
        trace?.note({
          fallbackReason: 'offline model error; parser answered',
        });
        console.warn(
          '[IntentService] Native SLM extraction error, falling back to fast-path:',
          err,
        );
      }
    } else {
      trace?.note({modelAvailability: 'engine_unavailable', modelState: 'not_used'});
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

/**
 * Loads the student's installed offline model and reads its instructions
 * ahead of the first request (an offline call starts this as it connects).
 * Resolves false when no model is installed or this build cannot load one.
 */
export async function warmUpOfflineModel(userId?: string): Promise<boolean> {
  const extractor = NativeModules.LafinaIntentExtractor;
  if (Platform.OS !== 'android' || typeof extractor?.warmupModel !== 'function')
    return false;
  try {
    const activeModel = await getActiveOfflineModelReadyConfig(userId);
    if (!activeModel) return false;
    const startedAt = Date.now();
    const ready: boolean = await extractor.warmupModel(
      activeModel.modelPath,
      activeModel.promptFormat,
      activeModel.minValidSizeBytes,
    );
    console.log(
      `[IntentService] ${activeModel.modelId} ${
        ready ? 'ready' : 'not ready'
      } after ${Date.now() - startedAt}ms`,
    );
    return ready === true;
  } catch (error) {
    console.warn('[IntentService] Offline model warmup failed:', error);
    return false;
  }
}
