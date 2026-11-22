/**
 * Developer-only timing for one chat request (Developer Testing Hub).
 *
 * A trace belongs to exactly one request and is handed down explicitly
 * (never looked up from a global), so overlapping requests, retries and late
 * callbacks cannot mix their numbers. Elapsed times use a monotonic clock;
 * the wall clock only labels the run. After `finalize()` the trace ignores
 * every further mark, so a callback that fires after the request ended (a
 * stream chunk, a render after navigation) cannot change the result.
 */

/** Milliseconds from an arbitrary origin that never goes backwards. */
export const monotonicNow = (): number => {
  const perf = (globalThis as {performance?: {now?: () => number}}).performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
};

/** Which clock produced the elapsed times (written into exports). */
export const monotonicClockSource = (): string => {
  const perf = (globalThis as {performance?: {now?: () => number}}).performance;
  return typeof perf?.now === 'function'
    ? 'performance.now()'
    : 'Date.now() (no monotonic clock available)';
};

/** Points in time, measured from the moment Send was pressed. */
export type TraceMark =
  /** The student's message was saved locally (or held in memory for a temporary chat). */
  | 'userSaved'
  /** The orchestrator started working on the request after saving it. */
  | 'processingStarted'
  /** The online chat request left the phone. */
  | 'onlineDispatched'
  /** The first bytes of the online response body arrived (may be a keep-alive, not text). */
  | 'firstNetworkChunk'
  /** The first non-empty reply text arrived from the provider. */
  | 'firstContentReceived'
  /** The orchestrator returned the finished reply. */
  | 'replyReady'
  /** First frame after the first reply text was committed to the screen. */
  | 'firstContentRendered'
  /** First frame after the saved final reply was committed to the screen. */
  | 'finalRendered';

/** Durations measured directly (not from Send). */
export type TraceDuration =
  | 'intentParse'
  | 'fastPath'
  | 'modelLoad'
  | 'modelInference'
  | 'modelCall'
  | 'onlineIntentExtraction'
  | 'persistUser'
  | 'persistAssistant';

export type ExecutionPath =
  | 'fast_path'
  | 'offline_model'
  | 'online_provider'
  | 'fallback'
  | 'unknown';

export type TraceOutcome =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'timeout'
  | 'interrupted_stream';

export type ModelState = 'cold' | 'warm' | 'unknown' | 'not_used';

export interface TraceFacts {
  /** Intent source the extractor reported: fast_path, on_device_slm, deepseek... */
  intentSource?: string;
  /** The extracted intent name (structured, never the student's words). */
  intent?: string;
  /** The orchestrator's route: reviewed_mutation, read_only, conversation... */
  route?: string;
  /** Observed offline model id, from the config actually given to the engine. */
  offlineModelId?: string;
  /** Observed online provider/model id, when the server reported one. */
  onlineModelId?: string;
  modelState?: ModelState;
  /** installed | not_installed | engine_unavailable | simulated_missing | not_checked */
  modelAvailability?: string;
  /** Whether the reply arrived as a stream of pieces. */
  streamed?: boolean;
  /** How the online reply travelled, e.g. a stream that fell back to the regular endpoint. */
  transportNote?: string;
  /** Final online result status (success, offline, auth_required...). */
  onlineStatus?: string;
  /** Why the request did not finish on its first-choice path. */
  fallbackReason?: string;
  /** Online provider attempted for the reply. */
  onlineAttempted?: boolean;
  /** The provider produced the reply that was used. */
  onlineUsed?: boolean;
  /** The on-device model was asked. */
  modelAttempted?: boolean;
  /** The on-device model's answer was used. */
  modelUsed?: boolean;
}

export interface TraceSnapshot {
  readonly requestId: string;
  /** Wall-clock start, ISO 8601 with the phone's UTC offset (identifies the run). */
  readonly startedAt: string;
  readonly requestedMode: 'online' | 'offline';
  /** Where the request came from. */
  readonly source: 'chat' | 'benchmark';
  readonly marks: Readonly<Partial<Record<TraceMark, number>>>;
  readonly durations: Readonly<Partial<Record<TraceDuration, number>>>;
  readonly facts: Readonly<TraceFacts>;
  readonly executionPath: ExecutionPath;
  readonly outcome: TraceOutcome | null;
  readonly errorDetail: string | null;
  /** Stages deliberately skipped (benchmark isolation). */
  readonly bypassed: readonly string[];
  /** Send → finalize, or null while still open. */
  readonly totalMs: number | null;
  readonly finalized: boolean;
}

export interface RequestTrace {
  readonly requestId: string;
  /** Marks a point in time once; later marks of the same name are ignored. */
  mark(name: TraceMark): void;
  /** Records a measured duration once; negative or non-finite values are ignored. */
  addDuration(name: TraceDuration, ms: number): void;
  /** Adds facts about the request. Ignored after finalize. */
  note(facts: TraceFacts): void;
  /** Records a stage the benchmark skipped on purpose. */
  bypass(stage: string): void;
  /** Sets the outcome; the first outcome wins. */
  setOutcome(outcome: TraceOutcome, detail?: string | null): void;
  /** Milliseconds since Send, on the trace's monotonic clock. */
  elapsed(): number;
  /** Freezes the trace. Returns the final snapshot (the same one on repeat calls). */
  finalize(): TraceSnapshot;
  isFinalized(): boolean;
  snapshot(): TraceSnapshot;
}

let traceSeq = 0;

/** Wall-clock time with the phone's offset, e.g. 2026-11-23T09:15:02.123+08:00. */
export const isoWithOffset = (date: Date = new Date()): string => {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds(),
    )}.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
};

/** A request id that is unique within this app process. */
export const newRequestId = (prefix = 'req'): string =>
  `${prefix}-${Date.now().toString(36)}-${(++traceSeq).toString(
    36,
  )}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Decides the execution path from what was observed, never from the mode
 * switch: a reply the provider wrote is online; a provider that failed and a
 * local answer that stood in is a fallback; the model's answer is offline
 * model; anything else came from the deterministic parser and local rules.
 */
export const deriveExecutionPath = (facts: TraceFacts): ExecutionPath => {
  if (facts.onlineUsed) return 'online_provider';
  if (facts.fallbackReason) return 'fallback';
  if (facts.modelUsed) return 'offline_model';
  if (facts.intentSource || facts.route) return 'fast_path';
  return 'unknown';
};

export interface CreateTraceOptions {
  requestedMode: 'online' | 'offline';
  source: 'chat' | 'benchmark';
  requestId?: string;
  /** Monotonic time Send was pressed; defaults to now. */
  startedAtMonotonic?: number;
  /** Called once with the final snapshot. */
  onFinalize?: (snapshot: TraceSnapshot) => void;
  /** Test hook: a fake monotonic clock. */
  clock?: () => number;
}

export const createRequestTrace = (
  options: CreateTraceOptions,
): RequestTrace => {
  const clock = options.clock ?? monotonicNow;
  const t0 = options.startedAtMonotonic ?? clock();
  const requestId = options.requestId ?? newRequestId();
  const startedAt = isoWithOffset();
  const marks: Partial<Record<TraceMark, number>> = {};
  const durations: Partial<Record<TraceDuration, number>> = {};
  const facts: TraceFacts = {};
  const bypassed: string[] = [];
  let outcome: TraceOutcome | null = null;
  let errorDetail: string | null = null;
  let finalSnapshot: TraceSnapshot | null = null;

  const build = (totalMs: number | null): TraceSnapshot => ({
    requestId,
    startedAt,
    requestedMode: options.requestedMode,
    source: options.source,
    marks: {...marks},
    durations: {...durations},
    facts: {...facts},
    executionPath: deriveExecutionPath(facts),
    outcome,
    errorDetail,
    bypassed: [...bypassed],
    totalMs,
    finalized: totalMs !== null,
  });

  return {
    requestId,
    mark(name) {
      if (finalSnapshot || marks[name] !== undefined) return;
      marks[name] = Math.max(0, clock() - t0);
    },
    addDuration(name, ms) {
      if (finalSnapshot || durations[name] !== undefined) return;
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return;
      durations[name] = ms;
    },
    note(next) {
      if (finalSnapshot) return;
      for (const [key, value] of Object.entries(next)) {
        if (value !== undefined) {
          (facts as Record<string, unknown>)[key] = value;
        }
      }
    },
    bypass(stage) {
      if (finalSnapshot || bypassed.includes(stage)) return;
      bypassed.push(stage);
    },
    setOutcome(next, detail) {
      if (finalSnapshot || outcome) return;
      outcome = next;
      errorDetail = detail ?? null;
    },
    elapsed: () => Math.max(0, clock() - t0),
    finalize() {
      if (finalSnapshot) return finalSnapshot;
      finalSnapshot = build(Math.max(0, clock() - t0));
      try {
        options.onFinalize?.(finalSnapshot);
      } catch {
        // Recording a timing must never break the request.
      }
      return finalSnapshot;
    },
    isFinalized: () => finalSnapshot !== null,
    snapshot: () => finalSnapshot ?? build(null),
  };
};

export interface TimingRow {
  key: string;
  label: string;
  ms: number | null;
  /** Why the value is missing, when it is. */
  unavailable?: string;
}

const durationOrReason = (
  snap: TraceSnapshot,
  key: TraceDuration,
  reason: string,
): Pick<TimingRow, 'ms' | 'unavailable'> =>
  snap.durations[key] !== undefined
    ? {ms: snap.durations[key] as number}
    : {ms: null, unavailable: reason};

const markOrReason = (
  snap: TraceSnapshot,
  key: TraceMark,
  reason: string,
): Pick<TimingRow, 'ms' | 'unavailable'> =>
  snap.marks[key] !== undefined
    ? {ms: snap.marks[key] as number}
    : {ms: null, unavailable: reason};

/**
 * The timing breakdown shown in Chat and the hub. Every row is either a
 * measured number or "unavailable" with the reason it could not be measured.
 */
export const timingBreakdown = (snap: TraceSnapshot): TimingRow[] => {
  const online = snap.facts.onlineAttempted === true;
  const modelAsked = snap.facts.modelAttempted === true;
  const benchmark = snap.source === 'benchmark';
  const renderReason = benchmark
    ? 'benchmark runs do not render Chat'
    : 'not observed (screen closed, chat changed or no frame yet)';
  const nativeTimingReason =
    snap.durations.modelCall !== undefined
      ? 'this build does not report load and inference separately'
      : 'the offline model was not asked';
  return [
    {
      key: 'userSaved',
      label: 'Send → message saved',
      ...markOrReason(snap, 'userSaved', 'not reached'),
    },
    {
      key: 'processingStarted',
      label: 'Send → processing started',
      ...markOrReason(snap, 'processingStarted', 'not reached'),
    },
    {
      key: 'intentParse',
      label: 'Intent parsing',
      ...durationOrReason(
        snap,
        'intentParse',
        'this request skipped intent parsing',
      ),
    },
    {
      key: 'modelLoad',
      label: 'Offline model load',
      ...(modelAsked
        ? durationOrReason(snap, 'modelLoad', nativeTimingReason)
        : {ms: null, unavailable: 'the offline model was not asked'}),
    },
    {
      key: 'modelInference',
      label: 'Offline model inference',
      ...(modelAsked
        ? durationOrReason(snap, 'modelInference', nativeTimingReason)
        : {ms: null, unavailable: 'the offline model was not asked'}),
    },
    {
      key: 'onlineDispatched',
      label: 'Send → online request sent',
      ...(online
        ? markOrReason(snap, 'onlineDispatched', 'not reached')
        : {ms: null, unavailable: 'no online chat request'}),
    },
    {
      key: 'firstContent',
      label: 'Online sent → first text received',
      ...(online &&
      snap.marks.onlineDispatched !== undefined &&
      snap.marks.firstContentReceived !== undefined
        ? {
            ms:
              (snap.marks.firstContentReceived as number) -
              (snap.marks.onlineDispatched as number),
          }
        : {
            ms: null,
            unavailable: online
              ? 'no reply text arrived'
              : 'no online chat request',
          }),
    },
    {
      key: 'firstContentRendered',
      label: 'Send → first text on screen',
      ...markOrReason(snap, 'firstContentRendered', renderReason),
    },
    {
      key: 'finalRendered',
      label: 'Send → final reply on screen',
      ...markOrReason(snap, 'finalRendered', renderReason),
    },
    {
      key: 'replyReady',
      label: 'Send → reply ready (not yet drawn)',
      ...markOrReason(snap, 'replyReady', 'the request did not finish'),
    },
    {
      key: 'persist',
      label: 'Saving to chat history',
      ...(snap.durations.persistUser !== undefined ||
      snap.durations.persistAssistant !== undefined
        ? {
            ms:
              (snap.durations.persistUser ?? 0) +
              (snap.durations.persistAssistant ?? 0),
          }
        : {
            ms: null,
            unavailable: 'not saved (temporary chat or benchmark)',
          }),
    },
    {
      key: 'total',
      label: benchmark ? 'Total (Send → reply ready)' : 'Total (Send → done)',
      ...(snap.totalMs !== null
        ? {ms: snap.totalMs}
        : {ms: null, unavailable: 'still running'}),
    },
  ];
};

export const EXECUTION_PATH_LABEL: Record<ExecutionPath, string> = {
  fast_path: 'Fast path (parser/local rules)',
  offline_model: 'Offline model',
  online_provider: 'Online provider',
  fallback: 'Fallback',
  unknown: 'Unknown',
};

const fmtMs = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;

/** One short line under a chat reply, e.g. "⏱ 2.41s · first text 640ms · Online provider". */
export const compactTimingLabel = (snap: TraceSnapshot): string => {
  const parts: string[] = [];
  const total =
    snap.marks.finalRendered ?? snap.totalMs ?? snap.marks.replyReady;
  if (total !== undefined && total !== null) parts.push(fmtMs(total));
  if (
    snap.marks.firstContentRendered !== undefined &&
    snap.facts.streamed === true
  ) {
    parts.push(`first text ${fmtMs(snap.marks.firstContentRendered)}`);
  }
  if (snap.durations.intentParse !== undefined) {
    parts.push(`intent ${fmtMs(snap.durations.intentParse)}`);
  }
  parts.push(EXECUTION_PATH_LABEL[snap.executionPath]);
  if (snap.facts.modelState && snap.facts.modelState !== 'not_used') {
    parts.push(snap.facts.modelState);
  }
  if (snap.outcome && snap.outcome !== 'success') parts.push(snap.outcome);
  return `⏱ ${parts.join(' · ')}`;
};

export const formatMs = fmtMs;
