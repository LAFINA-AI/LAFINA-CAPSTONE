/**
 * One-click Developer benchmarks (Developer Testing Hub).
 *
 * Every case goes through the real `chatOrchestrator.processMessage`, with
 * the same parser, offline model timeout, online client and routing Chat
 * uses. Isolation comes from `benchmark` (see BenchmarkIsolation): the run
 * stops at the proposal or clarification and never writes the planner,
 * chat history or memory. Proposals a case produced are cancelled by their
 * operation id afterwards; nothing else is touched.
 *
 * Cases run one at a time so they never compete for the model or network.
 */
import {
  CHAT_OFFLINE_SLM_TIMEOUT_MS,
  chatOrchestrator,
  type ChatOrchestratorResult,
  type ProcessMessageOptions,
} from '../chatOrchestrator';
import {cancelReviewedCommand} from '../nlu/commandReview';
import {formatLocalDate} from '../nlu/fastPathParser';
import {
  BENCHMARK_SUITE_VERSION,
  countProviderRequests,
  customCase,
  planSuite,
  SUITES,
  type BenchmarkCase,
  type BenchmarkMode,
  type CaseExpectation,
  type ExpectedDate,
  type PlannedAttempt,
  type SuiteId,
} from './benchmarkCases';
import {
  createRequestTrace,
  isoWithOffset,
  monotonicNow,
  newRequestId,
  type ExecutionPath,
  type TraceOutcome,
  type TraceSnapshot,
} from './requestTrace';
import {latencyStats, PERCENTILE_METHOD, type LatencyStats} from './stats';
import {
  compareSnapshots,
  getRunEnvironment,
  runOnlinePreflight,
  snapshotPersonalData,
  type OnlinePreflight,
  type RunEnvironment,
  type SideEffectCheck,
} from './environment';

export const BENCHMARK_SCHEMA = 'lafina.devbenchmark/1';

export type AttemptStatus =
  | 'PASS'
  | 'FAIL'
  | 'SKIPPED'
  | 'UNAVAILABLE'
  | 'CANCELLED';

export interface Assertion {
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL' | 'UNAVAILABLE';
}

/** Structured facts read from a result (never reply text). */
export interface Observed {
  intent: string;
  intentSource: string;
  intentValid: boolean;
  route: string;
  review: 'proposal' | 'clarify' | 'invalid' | 'none';
  proposalIntent: string | null;
  date: string | null;
  time: string | null;
  endTime: string | null;
  executionPath: ExecutionPath;
  modelUsed: boolean;
  onlineUsed: boolean;
  dryRunOperation: string | null;
  skillLaunch: boolean;
  multiAction: boolean;
}

export interface AttemptResult {
  attemptId: string;
  index: number;
  caseId: string;
  caseName: string;
  category: string;
  requestedMode: BenchmarkMode;
  repeatIndex: number;
  simulated: boolean;
  simulationLabel: string | null;
  custom: boolean;
  status: AttemptStatus;
  outcome: TraceOutcome | 'skipped' | 'not_run';
  /** Why the attempt was skipped, cancelled or failed to run. */
  reason: string | null;
  observed: Observed | null;
  assertions: Assertion[];
  trace: TraceSnapshot | null;
  /** Requested online, but the reply did not come from the provider (or the reverse). */
  modeMismatch: boolean;
  /** Prompt text; null when redacted (custom prompt without opt-in). */
  promptText: string | null;
  /** Reply text; only kept when content inclusion is on. */
  replyText: string | null;
  replyLength: number | null;
  /** Proposals this attempt created and the runner cancelled (by operation id). */
  proposalsCancelled: number;
}

export interface LatencyGroup {
  key: string;
  caseId: string;
  caseName: string;
  requestedMode: BenchmarkMode;
  executionPath: ExecutionPath;
  modelState: string;
  /** Send → reply ready. */
  replyReady: LatencyStats;
  /** Online sent → first reply text (online only). */
  firstContent: LatencyStats | null;
}

export interface RunSummary {
  attempted: number;
  passed: number;
  failed: number;
  skipped: number;
  unavailable: number;
  cancelled: number;
  /** Attempts excluded from latency because they were simulated. */
  simulatedExcluded: number;
  /** Attempts excluded from latency because they did not complete successfully. */
  unsuccessfulExcluded: number;
  /** Real, successful attempts grouped by case × mode × path × model state. */
  latency: LatencyGroup[];
  percentileMethod: string;
}

export interface BenchmarkRun {
  schema: string;
  runId: string;
  suiteId: SuiteId | 'custom';
  suiteName: string;
  suiteVersion: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  config: {
    repeats: number;
    modes: BenchmarkMode[];
    sequential: true;
    offlineTimeoutMs: number;
    onlineTimeoutMs: number;
    slmTimeoutMs: number;
    includeContent: boolean;
    plannedRequests: number;
    plannedProviderRequests: number;
    referenceDate: string;
  };
  environment: RunEnvironment | null;
  onlinePreflight: OnlinePreflight | null;
  isolation: {
    method: string;
    bypassedStages: string[];
    sideEffectCheck: SideEffectCheck | null;
    settingsChanged: string;
  };
  attempts: AttemptResult[];
  summary: RunSummary;
  notes: string[];
}

export interface RunProgress {
  runId: string;
  completed: number;
  total: number;
  currentCase: string | null;
  currentMode: BenchmarkMode | null;
  elapsedMs: number;
  attempts: readonly AttemptResult[];
}

export interface RunBenchmarkOptions {
  userId: string;
  suiteId?: SuiteId;
  /** Runs one custom prompt instead of a suite. */
  customPrompt?: {text: string; mode: BenchmarkMode};
  repeats?: number;
  modes?: BenchmarkMode[];
  /** Keep prompt and reply text in results and exports (off by default). */
  includeContent?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: RunProgress) => void;
  offlineTimeoutMs?: number;
  onlineTimeoutMs?: number;
  /** A preflight already shown to the student (avoids a second check). */
  onlinePreflight?: OnlinePreflight | null;
  /** Test seams. */
  deps?: Partial<RunnerDeps>;
}

export interface RunnerDeps {
  processMessage: (
    userId: string,
    text: string,
    options: ProcessMessageOptions,
  ) => Promise<ChatOrchestratorResult>;
  cancelProposal: (userId: string, operationId: string) => boolean;
  environment: (userId: string) => Promise<RunEnvironment | null>;
  preflight: (userId: string) => Promise<OnlinePreflight>;
  snapshot: typeof snapshotPersonalData;
  now: () => Date;
}

const defaultDeps: RunnerDeps = {
  processMessage: (userId, text, options) =>
    chatOrchestrator.processMessage(userId, text, options),
  cancelProposal: cancelReviewedCommand,
  environment: userId => getRunEnvironment(userId).catch(() => null),
  preflight: userId => runOnlinePreflight(userId),
  snapshot: snapshotPersonalData,
  now: () => new Date(),
};

export const DEFAULT_OFFLINE_TIMEOUT_MS = 45_000;
export const DEFAULT_ONLINE_TIMEOUT_MS = 60_000;
/** Attempts kept per run (a run is bounded by MAX_REPEATS anyway). */
const MAX_ATTEMPTS_PER_RUN = 400;

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/** The date an expectation names, given the run's reference date. */
export const expectedDateValue = (
  expected: ExpectedDate,
  reference: Date,
): string => {
  if (expected.kind === 'offsetDays') {
    return formatLocalDate(addDays(reference, expected.days));
  }
  const diff = (expected.weekday - reference.getDay() + 7) % 7;
  return formatLocalDate(addDays(reference, diff));
};

const describeDate = (expected: ExpectedDate, reference: Date): string =>
  expected.kind === 'offsetDays'
    ? expectedDateValue(expected, reference)
    : `a ${
        [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ][expected.weekday]
      } within 7 days (${expectedDateValue(
        expected,
        reference,
      )} or the week after)`;

/** Structured facts from an orchestrator result and its trace. */
export const observeResult = (
  result: ChatOrchestratorResult,
  trace: TraceSnapshot,
): Observed => {
  const review = result.review;
  return {
    intent: result.intent.intent,
    intentSource: result.intent.source,
    intentValid: result.intent.isValid,
    route:
      result.route ??
      (result.skillLaunch ? 'skill' : result.multiBatch ? 'multi' : 'local'),
    review: !review
      ? 'none'
      : review.status === 'proposal'
      ? 'proposal'
      : review.status === 'clarify'
      ? 'clarify'
      : 'invalid',
    proposalIntent:
      review?.status === 'proposal' ? String(review.proposal.intent) : null,
    date: result.intent.date ?? null,
    time: result.intent.time ?? null,
    endTime: result.intent.endTime ?? null,
    executionPath: trace.executionPath,
    modelUsed: trace.facts.modelUsed === true,
    onlineUsed: result.usedOnline === true,
    dryRunOperation:
      result.dryRun?.status === 'would_apply' ? result.dryRun.operation : null,
    skillLaunch: Boolean(result.skillLaunch),
    multiAction: Boolean(result.multiBatch),
  };
};

const structureKey = (o: Observed): string =>
  [
    o.intent,
    o.route,
    o.review,
    o.proposalIntent,
    o.date,
    o.time,
    o.endTime,
  ].join('|');

/**
 * Checks a result against its expectation. Capabilities that are not present
 * (no offline model installed) are UNAVAILABLE, never PASS.
 */
export const evaluateAssertions = (
  expect: CaseExpectation,
  observed: Observed,
  context: {
    reference: Date;
    modelReady: boolean;
    earlier: (caseId: string) => Observed | null;
  },
): Assertion[] => {
  const out: Assertion[] = [];
  const check = (
    name: string,
    expected: string,
    actual: string,
    pass: boolean,
  ) => out.push({name, expected, actual, status: pass ? 'PASS' : 'FAIL'});

  if (expect.intents) {
    check(
      'intent',
      expect.intents.join(' | '),
      observed.intent,
      expect.intents.includes(observed.intent),
    );
  }
  if (expect.routes) {
    check(
      'route',
      expect.routes.join(' | '),
      observed.route,
      expect.routes.includes(observed.route),
    );
  }
  if (expect.review) {
    const actual = observed.review;
    const pass =
      expect.review === 'clarify'
        ? actual === 'clarify' || actual === 'invalid'
        : expect.review === 'none'
        ? actual === 'none' && !observed.dryRunOperation
        : actual === 'proposal';
    check(
      'review',
      expect.review === 'clarify'
        ? 'clarification (no card)'
        : expect.review === 'none'
        ? 'no planner card'
        : 'proposal card',
      actual,
      pass,
    );
  }
  if (expect.proposalIntents) {
    check(
      'proposal type',
      expect.proposalIntents.join(' | '),
      observed.proposalIntent ?? 'none',
      observed.proposalIntent !== null &&
        expect.proposalIntents.includes(observed.proposalIntent),
    );
  }
  if (expect.date) {
    const want = expectedDateValue(expect.date, context.reference);
    let pass = observed.date === want;
    if (!pass && expect.date.kind === 'weekdayWithinWeek' && observed.date) {
      // Either reading of "Friday" on a Friday is a supported answer.
      pass =
        observed.date ===
        formatLocalDate(addDays(new Date(`${want}T12:00:00`), 7));
    }
    check(
      'date',
      describeDate(expect.date, context.reference),
      observed.date ?? 'none',
      pass,
    );
  }
  if (expect.time) {
    check(
      'time',
      expect.time,
      observed.time ?? 'none',
      observed.time === expect.time,
    );
  }
  if (expect.endTime) {
    check(
      'end time',
      expect.endTime,
      observed.endTime ?? 'none',
      observed.endTime === expect.endTime,
    );
  }
  if (expect.paths) {
    check(
      'execution path',
      expect.paths.join(' | '),
      observed.executionPath,
      expect.paths.includes(observed.executionPath),
    );
  }
  if (expect.requiresOfflineModel) {
    if (!context.modelReady) {
      out.push({
        name: 'offline model answered',
        expected: 'on-device model reading',
        actual: 'no offline model installed or the engine is unavailable',
        status: 'UNAVAILABLE',
      });
    } else {
      check(
        'offline model answered',
        'on-device model reading',
        observed.modelUsed ? 'offline model' : observed.executionPath,
        observed.modelUsed,
      );
    }
  }
  if (expect.requiresOnlineProvider) {
    check(
      'online provider answered',
      'online provider',
      observed.executionPath,
      observed.onlineUsed && observed.executionPath === 'online_provider',
    );
  }
  if (expect.sameStructureAs) {
    const earlier = context.earlier(expect.sameStructureAs);
    if (!earlier) {
      out.push({
        name: 'same result as earlier',
        expected: `same structure as "${expect.sameStructureAs}"`,
        actual: 'the earlier case did not run in this mode',
        status: 'UNAVAILABLE',
      });
    } else {
      check(
        'same result as earlier',
        structureKey(earlier),
        structureKey(observed),
        structureKey(earlier) === structureKey(observed),
      );
    }
  }
  return out;
};

const statusFromAssertions = (assertions: Assertion[]): AttemptStatus =>
  assertions.some(a => a.status === 'FAIL')
    ? 'FAIL'
    : assertions.some(a => a.status === 'UNAVAILABLE')
    ? 'UNAVAILABLE'
    : 'PASS';

const simulationLabel = (testCase: BenchmarkCase): string | null =>
  testCase.simulate?.missingModel
    ? 'SIMULATED: no offline model'
    : testCase.simulate?.onlineFailure
    ? `SIMULATED: online ${testCase.simulate.onlineFailure} failure (no request sent)`
    : null;

const emptySummary = (): RunSummary => ({
  attempted: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  unavailable: 0,
  cancelled: 0,
  simulatedExcluded: 0,
  unsuccessfulExcluded: 0,
  latency: [],
  percentileMethod: PERCENTILE_METHOD,
});

/**
 * Counts and latency groups. Simulated attempts and attempts that did not
 * complete successfully stay in the attempt list but never enter latency.
 * Groups never mix cases, modes, paths or cold/warm state, so the summary
 * cannot be read as an online-versus-offline ranking.
 */
export const summarizeAttempts = (
  attempts: readonly AttemptResult[],
): RunSummary => {
  const summary = emptySummary();
  const groups = new Map<
    string,
    {
      meta: Omit<LatencyGroup, 'replyReady' | 'firstContent'>;
      ready: number[];
      first: number[];
    }
  >();
  for (const a of attempts) {
    if (a.status === 'SKIPPED') summary.skipped++;
    else if (a.status === 'CANCELLED') summary.cancelled++;
    else {
      summary.attempted++;
      if (a.status === 'PASS') summary.passed++;
      else if (a.status === 'FAIL') summary.failed++;
      else if (a.status === 'UNAVAILABLE') summary.unavailable++;
    }
    if (a.status === 'SKIPPED' || a.status === 'CANCELLED' || !a.trace)
      continue;
    if (a.simulated) {
      summary.simulatedExcluded++;
      continue;
    }
    if (a.outcome !== 'success') {
      summary.unsuccessfulExcluded++;
      continue;
    }
    const ready = a.trace.marks.replyReady;
    if (ready === undefined) continue;
    const modelState = a.trace.facts.modelState ?? 'unknown';
    const key = `${a.caseId}|${a.requestedMode}|${a.trace.executionPath}|${modelState}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        meta: {
          key,
          caseId: a.caseId,
          caseName: a.caseName,
          requestedMode: a.requestedMode,
          executionPath: a.trace.executionPath,
          modelState,
        },
        ready: [],
        first: [],
      };
      groups.set(key, group);
    }
    group.ready.push(ready);
    const sent = a.trace.marks.onlineDispatched;
    const first = a.trace.marks.firstContentReceived;
    if (sent !== undefined && first !== undefined)
      group.first.push(first - sent);
  }
  summary.latency = [...groups.values()].map(g => ({
    ...g.meta,
    replyReady: latencyStats(g.ready),
    firstContent: g.first.length ? latencyStats(g.first) : null,
  }));
  return summary;
};

const errorText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 200);

/** A run that has not started yet (used for the initial state and tests). */
const newRun = (
  runId: string,
  suiteId: SuiteId | 'custom',
  suiteName: string,
  config: BenchmarkRun['config'],
  startedAt: string,
): BenchmarkRun => ({
  schema: BENCHMARK_SCHEMA,
  runId,
  suiteId,
  suiteName,
  suiteVersion: BENCHMARK_SUITE_VERSION,
  startedAt,
  finishedAt: null,
  status: 'running',
  config,
  environment: null,
  onlinePreflight: null,
  isolation: {
    method:
      'chatOrchestrator.processMessage with benchmark isolation: temporary (unsaved) chat, no TTS, low-risk changes dry-run, proposals cancelled by operation id, memory/skill-control/review-card decisions skipped',
    bypassedStages: [],
    sideEffectCheck: null,
    settingsChanged:
      'none: Online/Offline is passed per request; the Chat Online Mode switch is never written',
  },
  attempts: [],
  summary: emptySummary(),
  notes: [],
});

/** Plans the run without starting it: the request counts shown before Online runs. */
export const describePlannedRun = (
  options: Pick<
    RunBenchmarkOptions,
    'suiteId' | 'customPrompt' | 'repeats' | 'modes'
  >,
): {total: number; providerRequests: number; planned: PlannedAttempt[]} => {
  const planned = options.customPrompt
    ? [
        {
          testCase: customCase(
            options.customPrompt.text,
            options.customPrompt.mode,
          ),
          mode: options.customPrompt.mode,
          repeatIndex: 0,
        },
      ]
    : planSuite(SUITES[options.suiteId ?? 'quick_offline'], {
        repeats: options.repeats,
        modes: options.modes,
      });
  return {
    total: planned.length,
    providerRequests: countProviderRequests(planned),
    planned,
  };
};

export const runBenchmark = async (
  options: RunBenchmarkOptions,
): Promise<BenchmarkRun> => {
  const deps: RunnerDeps = {...defaultDeps, ...options.deps};
  const suite = options.customPrompt
    ? null
    : SUITES[options.suiteId ?? 'quick_offline'];
  const {planned, providerRequests} = describePlannedRun(options);
  const reference = deps.now();
  const includeContent = options.includeContent === true;
  const runId = newRequestId('run');
  const runStartedMono = monotonicNow();
  const offlineTimeoutMs =
    options.offlineTimeoutMs ?? DEFAULT_OFFLINE_TIMEOUT_MS;
  const onlineTimeoutMs = options.onlineTimeoutMs ?? DEFAULT_ONLINE_TIMEOUT_MS;
  const modes = [...new Set(planned.map(p => p.mode))];
  const run = newRun(
    runId,
    suite ? suite.id : 'custom',
    suite ? suite.name : 'Custom prompt',
    {
      repeats: options.customPrompt
        ? 1
        : Math.max(...planned.map(p => p.repeatIndex + 1), 1),
      modes,
      sequential: true,
      offlineTimeoutMs,
      onlineTimeoutMs,
      slmTimeoutMs: CHAT_OFFLINE_SLM_TIMEOUT_MS,
      includeContent,
      plannedRequests: planned.length,
      plannedProviderRequests: providerRequests,
      referenceDate: isoWithOffset(reference),
    },
    isoWithOffset(reference),
  );

  const progress = (current: PlannedAttempt | null) => {
    try {
      options.onProgress?.({
        runId,
        completed: run.attempts.length,
        total: planned.length,
        currentCase: current?.testCase.name ?? null,
        currentMode: current?.mode ?? null,
        elapsedMs: monotonicNow() - runStartedMono,
        attempts: run.attempts,
      });
    } catch {
      // Progress display never stops a run.
    }
  };

  run.environment = await deps.environment(options.userId);
  const modelReady = run.environment?.offlineModel.ready === true;
  if (modes.includes('online')) {
    run.onlinePreflight =
      options.onlinePreflight ?? (await deps.preflight(options.userId));
  }
  const onlineBlocked =
    modes.includes('online') && run.onlinePreflight?.ok !== true;
  if (onlineBlocked) {
    run.notes.push(
      'Online cases were skipped: the online preflight did not pass. Simulated online-failure cases still ran (they send no request).',
    );
  }

  const before = deps.snapshot(options.userId);
  const observedByCase = new Map<string, Observed>();
  const bypassed = new Set<string>();
  const late: Promise<unknown>[] = [];

  const finishAttempt = (attempt: AttemptResult) => {
    if (run.attempts.length < MAX_ATTEMPTS_PER_RUN) run.attempts.push(attempt);
  };

  const cleanup = (result: ChatOrchestratorResult | null): number => {
    if (result?.review?.status === 'proposal') {
      return deps.cancelProposal(
        options.userId,
        result.review.proposal.operationId,
      )
        ? 1
        : 0;
    }
    return 0;
  };

  for (let i = 0; i < planned.length; i++) {
    const item = planned[i];
    const {testCase, mode} = item;
    const base = {
      attemptId: `${runId}-${i + 1}`,
      index: i + 1,
      caseId: testCase.id,
      caseName: testCase.name,
      category: testCase.category,
      requestedMode: mode,
      repeatIndex: item.repeatIndex,
      simulated: Boolean(testCase.simulate),
      simulationLabel: simulationLabel(testCase),
      custom: testCase.custom === true,
      promptText: testCase.custom && !includeContent ? null : testCase.prompt,
    };
    if (options.signal?.aborted) {
      finishAttempt({
        ...base,
        status: 'CANCELLED',
        outcome: 'not_run',
        reason: 'Run cancelled before this case started.',
        observed: null,
        assertions: [],
        trace: null,
        modeMismatch: false,
        replyText: null,
        replyLength: null,
        proposalsCancelled: 0,
      });
      continue;
    }
    if (
      mode === 'online' &&
      onlineBlocked &&
      !testCase.simulate?.onlineFailure
    ) {
      finishAttempt({
        ...base,
        status: 'SKIPPED',
        outcome: 'skipped',
        reason: 'Online preflight did not pass.',
        observed: null,
        assertions: [],
        trace: null,
        modeMismatch: false,
        replyText: null,
        replyLength: null,
        proposalsCancelled: 0,
      });
      progress(null);
      continue;
    }
    progress(item);

    const controller = new AbortController();
    let abortReason: 'timeout' | 'cancelled' | null = null;
    const onRunAbort = () => {
      abortReason = abortReason ?? 'cancelled';
      controller.abort();
    };
    options.signal?.addEventListener('abort', onRunAbort);
    const timeoutMs = mode === 'online' ? onlineTimeoutMs : offlineTimeoutMs;
    const timer = setTimeout(() => {
      abortReason = abortReason ?? 'timeout';
      controller.abort();
    }, timeoutMs);

    const trace = createRequestTrace({
      requestedMode: mode,
      source: 'benchmark',
    });
    // Streamed text is not drawn here; the hook makes the request stream as
    // Chat's does and lets the trace see the first text arrive.
    const onReplyText = mode === 'online' ? () => undefined : undefined;
    const work = deps.processMessage(options.userId, testCase.prompt, {
      onlineMode: mode === 'online',
      referenceDate: reference,
      slmTimeoutMs: CHAT_OFFLINE_SLM_TIMEOUT_MS,
      trace,
      signal: controller.signal,
      onReplyText,
      benchmark: {
        runId,
        simulateMissingModel: testCase.simulate?.missingModel === true,
        ...(testCase.simulate?.onlineFailure
          ? {simulateOnlineFailure: testCase.simulate.onlineFailure}
          : {}),
      },
    });
    let result: ChatOrchestratorResult | null = null;
    let failure: string | null = null;
    try {
      result = await Promise.race([
        work,
        new Promise<null>(resolve => {
          if (controller.signal.aborted) resolve(null);
          controller.signal.addEventListener('abort', () => resolve(null));
        }),
      ]);
    } catch (error) {
      failure = errorText(error);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onRunAbort);
    }
    if (!result && !failure) {
      // Abandoned at the timeout or cancel: if it still finishes, cancel
      // whatever card it prepared. Nothing else is cleaned up.
      late.push(
        work.then(
          finished => cleanup(finished),
          () => 0,
        ),
      );
    }
    const proposalsCancelled = cleanup(result);
    const reason = abortReason as 'timeout' | 'cancelled' | null;
    const outcome: TraceOutcome = failure
      ? 'failure'
      : reason === 'timeout'
      ? 'timeout'
      : reason === 'cancelled'
      ? 'cancelled'
      : 'success';
    trace.setOutcome(outcome, failure);
    const snapshot = trace.finalize();
    for (const stage of snapshot.bypassed) bypassed.add(stage);

    if (!result) {
      finishAttempt({
        ...base,
        status: outcome === 'cancelled' ? 'CANCELLED' : 'FAIL',
        outcome: snapshot.outcome ?? outcome,
        reason:
          outcome === 'timeout'
            ? `No reply within ${timeoutMs}ms.`
            : outcome === 'cancelled'
            ? 'Cancelled while running.'
            : failure,
        observed: null,
        assertions: [],
        trace: snapshot,
        modeMismatch: false,
        replyText: null,
        replyLength: null,
        proposalsCancelled,
      });
      continue;
    }

    const observed = observeResult(result, snapshot);
    const expectation = testCase.expect[mode] ?? {};
    const assertions = evaluateAssertions(expectation, observed, {
      reference,
      modelReady,
      earlier: id => observedByCase.get(`${id}|${mode}`) ?? null,
    });
    if (testCase.custom) {
      assertions.push({
        name: 'completed',
        expected: 'a reply without error',
        actual: result.reply ? 'reply' : 'empty reply',
        status: result.reply ? 'PASS' : 'FAIL',
      });
    }
    if (!observedByCase.has(`${testCase.id}|${mode}`)) {
      observedByCase.set(`${testCase.id}|${mode}`, observed);
    }
    const interrupted = snapshot.outcome === 'interrupted_stream';
    if (interrupted) {
      assertions.push({
        name: 'stream completed',
        expected: 'the full reply',
        actual: 'interrupted before it finished',
        status: 'FAIL',
      });
    }
    const modeMismatch =
      !testCase.simulate &&
      ((mode === 'online' &&
        !observed.onlineUsed &&
        observed.route === 'conversation') ||
        (mode === 'offline' && observed.onlineUsed));
    finishAttempt({
      ...base,
      status: statusFromAssertions(assertions),
      outcome: snapshot.outcome ?? outcome,
      reason: snapshot.facts.fallbackReason ?? null,
      observed,
      assertions,
      trace: snapshot,
      modeMismatch,
      replyText: includeContent ? result.reply : null,
      replyLength: result.reply.length,
      proposalsCancelled,
    });
  }

  // Give abandoned requests a moment to finish so their cards are cancelled.
  if (late.length) {
    await Promise.race([
      Promise.allSettled(late),
      new Promise(resolve => setTimeout(resolve, 2_000)),
    ]);
  }

  const after = deps.snapshot(options.userId);
  run.isolation.sideEffectCheck = compareSnapshots(before, after);
  run.isolation.bypassedStages = [...bypassed];
  run.summary = summarizeAttempts(run.attempts);
  run.finishedAt = isoWithOffset(deps.now());
  run.status = options.signal?.aborted ? 'cancelled' : 'completed';
  progress(null);
  return run;
};
