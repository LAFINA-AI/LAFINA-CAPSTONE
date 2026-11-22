/**
 * CSV (one row per attempt) and JSON (the whole run) evidence for Developer
 * benchmarks. Exports hold structured results and timings. Prompt text is
 * included only for the prepared test prompts; custom prompt and every
 * reply's text are left out unless the run opted in (`includeContent`).
 * No tokens, keys, emails, student numbers, user ids or planner content.
 */
import type {AttemptResult, BenchmarkRun} from './benchmarkRunner';
import {listCases} from './benchmarkCases';
import type {TraceDuration, TraceMark} from './requestTrace';

export const REDACTED = '[redacted]';

/**
 * One CSV field: quoted when it holds a comma, quote or line break (quotes
 * doubled, RFC 4180). Text that a spreadsheet would run as a formula is
 * prefixed with an apostrophe.
 */
export const csvField = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(Math.round(value * 10) / 10) : '';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const MARK_COLUMNS: [string, TraceMark][] = [
  ['user_saved_ms', 'userSaved'],
  ['processing_started_ms', 'processingStarted'],
  ['online_dispatched_ms', 'onlineDispatched'],
  ['first_network_chunk_ms', 'firstNetworkChunk'],
  ['first_content_received_ms', 'firstContentReceived'],
  ['reply_ready_ms', 'replyReady'],
];

const DURATION_COLUMNS: [string, TraceDuration][] = [
  ['intent_parse_ms', 'intentParse'],
  ['fast_path_ms', 'fastPath'],
  ['model_load_ms', 'modelLoad'],
  ['model_inference_ms', 'modelInference'],
  ['model_call_ms', 'modelCall'],
  ['online_intent_extraction_ms', 'onlineIntentExtraction'],
];

export const CSV_COLUMNS = [
  'run_id',
  'run_started_at',
  'suite',
  'suite_version',
  'attempt',
  'case_id',
  'case_name',
  'category',
  'repeat',
  'requested_mode',
  'actual_path',
  'route',
  'mode_mismatch',
  'simulated',
  'status',
  'outcome',
  'reason',
  'expected_intent',
  'actual_intent',
  'intent_source',
  'review',
  'proposal_type',
  'assertions_pass',
  'assertions_fail',
  'assertions_unavailable',
  'failed_assertions',
  'model_state',
  'offline_model_id',
  'online_model_id',
  'streamed',
  'transport_note',
  'fallback_reason',
  'bypassed_stages',
  ...MARK_COLUMNS.map(([c]) => c),
  ...DURATION_COLUMNS.map(([c]) => c),
  'total_ms',
  'proposals_cancelled',
  'prompt',
  'reply_length',
  'reply',
] as const;

const expectedIntent = (a: AttemptResult): string => {
  const testCase = listCases().find(c => c.id === a.caseId);
  return testCase?.expect[a.requestedMode]?.intents?.join(' | ') ?? '';
};

const promptFor = (a: AttemptResult): string =>
  a.promptText ?? (a.custom ? REDACTED : '');

export const attemptRow = (run: BenchmarkRun, a: AttemptResult): string[] => {
  const t = a.trace;
  const count = (status: string) =>
    a.assertions.filter(x => x.status === status).length;
  const values: unknown[] = [
    run.runId,
    run.startedAt,
    run.suiteId,
    run.suiteVersion,
    a.index,
    a.caseId,
    a.caseName,
    a.category,
    a.repeatIndex + 1,
    a.requestedMode,
    t?.executionPath ?? '',
    a.observed?.route ?? '',
    a.modeMismatch,
    a.simulationLabel ?? false,
    a.status,
    a.outcome,
    a.reason,
    expectedIntent(a),
    a.observed?.intent ?? '',
    a.observed?.intentSource ?? '',
    a.observed?.review ?? '',
    a.observed?.proposalIntent ?? '',
    count('PASS'),
    count('FAIL'),
    count('UNAVAILABLE'),
    a.assertions
      .filter(x => x.status === 'FAIL')
      .map(x => `${x.name}: expected ${x.expected}, got ${x.actual}`)
      .join('; '),
    t?.facts.modelState ?? '',
    t?.facts.offlineModelId ?? '',
    t?.facts.onlineModelId ?? (t?.facts.onlineAttempted ? 'unknown' : ''),
    t?.facts.streamed ?? '',
    t?.facts.transportNote ?? '',
    t?.facts.fallbackReason ?? '',
    t?.bypassed.join('; ') ?? '',
    ...MARK_COLUMNS.map(([, key]) => t?.marks[key]),
    ...DURATION_COLUMNS.map(([, key]) => t?.durations[key]),
    t?.totalMs,
    a.proposalsCancelled,
    promptFor(a),
    a.replyLength,
    run.config.includeContent ? a.replyText ?? '' : REDACTED,
  ];
  return values.map(csvField);
};

/** One row per attempt, CRLF line endings, header first. */
export const buildCsv = (run: BenchmarkRun): string =>
  [
    CSV_COLUMNS.join(','),
    ...run.attempts.map(a => attemptRow(run, a).join(',')),
  ].join('\r\n') + '\r\n';

/** The run as JSON, with content redacted unless the run opted in. */
export const buildJson = (run: BenchmarkRun): string => {
  const cases = listCases()
    .filter(c => run.attempts.some(a => a.caseId === c.id))
    .map(c => ({
      id: c.id,
      name: c.name,
      category: c.category,
      prompt: c.custom ? REDACTED : c.prompt,
      modes: c.modes,
      simulated: Boolean(c.simulate),
      expect: c.expect,
    }));
  const attempts = run.attempts.map(a => ({
    ...a,
    promptText: promptFor(a),
    replyText: run.config.includeContent ? a.replyText : REDACTED,
  }));
  return JSON.stringify(
    {
      schema: run.schema,
      run: {
        runId: run.runId,
        suiteId: run.suiteId,
        suiteName: run.suiteName,
        suiteVersion: run.suiteVersion,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        status: run.status,
      },
      config: run.config,
      environment: run.environment,
      onlinePreflight: run.onlinePreflight,
      isolation: run.isolation,
      cases,
      attempts,
      summary: run.summary,
      notes: [
        ...run.notes,
        'Timings are client-side (phone) durations, not server inference time.',
        'Rendering is not measured in benchmark runs; see per-message timing in Chat.',
      ],
    },
    null,
    2,
  );
};
