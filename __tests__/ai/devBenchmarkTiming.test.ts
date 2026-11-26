/**
 * Developer Testing Hub (DEVTEST-01): per-request timing lifecycle, routing
 * labels, statistics, CSV/JSON export and the instrumentation switch.
 * Jest only: no device, model, provider or screen rendering is measured.
 */
import {NativeModules, Platform} from 'react-native';
import {
  compactTimingLabel,
  createRequestTrace,
  deriveExecutionPath,
  isoWithOffset,
  timingBreakdown,
} from '../../src/ai/benchmark/requestTrace';
import {
  latencyStats,
  medianOf,
  nearestRankPercentile,
} from '../../src/ai/benchmark/stats';
import {
  buildCsv,
  buildJson,
  csvField,
  CSV_COLUMNS,
  REDACTED,
} from '../../src/ai/benchmark/benchmarkExport';
import {summarizeAttempts} from '../../src/ai/benchmark/benchmarkRunner';
import type {
  AttemptResult,
  BenchmarkRun,
} from '../../src/ai/benchmark/benchmarkRunner';
import {
  isPerfTrackingEnabled,
  refreshPerfTrackingCache,
  setPerfTrackingEnabled,
} from '../../src/ai/benchmark/perfSettings';
import {developerTestService} from '../../src/ui/components/profile/developerTestService';
import {initDatabase, db} from '../../src/storage';
import {intentService} from '../../src/ai/nlu/intentService';

jest.mock('../../src/ai/nlu/modelManager', () => ({
  ...jest.requireActual('../../src/ai/nlu/modelManager'),
  getActiveOfflineModelReadyConfig: jest.fn(async () => ({
    modelId: 'test-model',
    modelPath: '/data/test-model.gguf',
    promptFormat: 'chatml',
    minValidSizeBytes: 1,
  })),
}));

const fakeClock = () => {
  let now = 1000;
  return {
    clock: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe('request trace lifecycle', () => {
  it('measures marks from Send on the monotonic clock, first write wins', () => {
    const c = fakeClock();
    const trace = createRequestTrace({
      requestedMode: 'offline',
      source: 'chat',
      clock: c.clock,
    });
    c.advance(5);
    trace.mark('userSaved');
    c.advance(10);
    trace.mark('userSaved'); // ignored: already marked
    trace.mark('processingStarted');
    trace.addDuration('intentParse', 7);
    trace.addDuration('intentParse', 99); // ignored
    trace.addDuration('modelLoad', -1); // ignored: not a duration
    c.advance(20);
    trace.mark('replyReady');
    const snap = trace.finalize();
    expect(snap.marks).toEqual({
      userSaved: 5,
      processingStarted: 15,
      replyReady: 35,
    });
    expect(snap.durations).toEqual({intentParse: 7});
    expect(snap.totalMs).toBe(35);
    expect(snap.finalized).toBe(true);
  });

  it('ignores stale callbacks after finalize and finalizes once', () => {
    const c = fakeClock();
    const onFinalize = jest.fn();
    const trace = createRequestTrace({
      requestedMode: 'online',
      source: 'chat',
      clock: c.clock,
      onFinalize,
    });
    trace.setOutcome('success');
    const first = trace.finalize();
    c.advance(500);
    trace.mark('firstContentRendered');
    trace.note({onlineUsed: true});
    trace.setOutcome('failure');
    trace.bypass('late');
    expect(trace.finalize()).toBe(first);
    expect(onFinalize).toHaveBeenCalledTimes(1);
    expect(first.marks.firstContentRendered).toBeUndefined();
    expect(first.outcome).toBe('success');
    expect(first.bypassed).toEqual([]);
  });

  it('keeps overlapping requests apart (concurrent request id isolation)', () => {
    const c = fakeClock();
    const a = createRequestTrace({
      requestedMode: 'offline',
      source: 'chat',
      clock: c.clock,
    });
    c.advance(100);
    const b = createRequestTrace({
      requestedMode: 'online',
      source: 'chat',
      clock: c.clock,
    });
    c.advance(50);
    a.mark('replyReady');
    b.mark('onlineDispatched');
    expect(a.requestId).not.toBe(b.requestId);
    expect(a.snapshot().marks).toEqual({replyReady: 150});
    expect(b.snapshot().marks).toEqual({onlineDispatched: 50});
  });

  it('labels the execution path from what happened, not the mode switch', () => {
    expect(deriveExecutionPath({onlineUsed: true, fallbackReason: 'x'})).toBe(
      'online_provider',
    );
    expect(
      deriveExecutionPath({
        onlineAttempted: true,
        fallbackReason: 'online offline',
      }),
    ).toBe('fallback');
    expect(
      deriveExecutionPath({modelUsed: true, intentSource: 'on_device_slm'}),
    ).toBe('offline_model');
    expect(deriveExecutionPath({intentSource: 'fast_path'})).toBe('fast_path');
    expect(deriveExecutionPath({})).toBe('unknown');
  });

  it('reports unavailable stages with a reason instead of a number', () => {
    const trace = createRequestTrace({
      requestedMode: 'offline',
      source: 'benchmark',
    });
    trace.note({intentSource: 'fast_path'});
    trace.mark('replyReady');
    const rows = timingBreakdown(trace.finalize());
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
    expect(byKey.modelLoad.ms).toBeNull();
    expect(byKey.modelLoad.unavailable).toMatch(/not asked/);
    expect(byKey.firstContent.unavailable).toMatch(/no online chat request/);
    expect(byKey.finalRendered.unavailable).toMatch(
      /benchmark runs do not render/,
    );
    expect(byKey.persist.unavailable).toMatch(/not saved/);
    expect(byKey.total.ms).not.toBeNull();
  });

  it('shows network data and first reply text as different stages', () => {
    const c = fakeClock();
    const trace = createRequestTrace({
      requestedMode: 'online',
      source: 'chat',
      clock: c.clock,
    });
    trace.note({onlineAttempted: true, streamed: true});
    trace.mark('onlineDispatched');
    c.advance(200);
    trace.mark('firstNetworkChunk');
    c.advance(300);
    trace.mark('firstContentReceived');
    const row = timingBreakdown(trace.finalize()).find(
      r => r.key === 'firstContent',
    );
    expect(row?.ms).toBe(500);
  });

  it('wall-clock run ids carry the timezone offset', () => {
    expect(isoWithOffset(new Date())).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/,
    );
  });

  it('compact label names the path and the non-success outcome', () => {
    const trace = createRequestTrace({requestedMode: 'online', source: 'chat'});
    trace.note({
      onlineAttempted: true,
      fallbackReason: 'online offline; local reply used',
    });
    trace.setOutcome('interrupted_stream');
    expect(compactTimingLabel(trace.finalize())).toMatch(
      /Fallback.*interrupted_stream/,
    );
  });
});

describe('statistics', () => {
  it('uses nearest-rank percentiles and the usual median', () => {
    const sorted = Array.from({length: 20}, (_, i) => i + 1);
    expect(nearestRankPercentile(sorted, 95)).toBe(19);
    expect(nearestRankPercentile(sorted, 100)).toBe(20);
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
    expect(medianOf([5, 1, 3].sort((a, b) => a - b))).toBe(3);
  });

  it('labels small samples honestly', () => {
    expect(latencyStats([])).toMatchObject({
      n: 0,
      median: null,
      note: 'no samples',
    });
    const two = latencyStats([10, 30]);
    expect(two).toMatchObject({
      n: 2,
      min: 10,
      max: 30,
      median: null,
      p95: null,
    });
    expect(two.note).toMatch(/too few for a median/);
    const five = latencyStats([5, 1, 4, 2, 3]);
    expect(five).toMatchObject({median: 3, p95: null});
    expect(five.note).toMatch(/p95 needs ≥20/);
    const twenty = latencyStats(Array.from({length: 20}, (_, i) => 20 - i));
    expect(twenty).toMatchObject({p95: 19, note: null});
  });
});

const attempt = (over: Partial<AttemptResult>): AttemptResult => {
  const trace = createRequestTrace({
    requestedMode: 'offline',
    source: 'benchmark',
  });
  trace.note({intentSource: 'fast_path'});
  trace.mark('replyReady');
  trace.setOutcome('success');
  return {
    attemptId: 'a',
    index: 1,
    caseId: 'reminder',
    caseName: 'Simple reminder',
    category: 'reminder',
    requestedMode: 'offline',
    repeatIndex: 0,
    simulated: false,
    simulationLabel: null,
    custom: false,
    status: 'PASS',
    outcome: 'success',
    reason: null,
    observed: null,
    assertions: [],
    trace: trace.finalize(),
    modeMismatch: false,
    promptText: 'Remind me to submit my thesis tomorrow at 9 AM',
    replyText: null,
    replyLength: 10,
    proposalsCancelled: 1,
    ...over,
  };
};

const runWith = (
  attempts: AttemptResult[],
  includeContent = false,
): BenchmarkRun => ({
  schema: 'lafina.devbenchmark/1',
  runId: 'run-1',
  suiteId: 'quick_offline',
  suiteName: 'Quick Offline Test',
  suiteVersion: 'devbench-1.0.0',
  startedAt: '2026-11-23T10:00:00.000+08:00',
  finishedAt: '2026-11-23T10:01:00.000+08:00',
  status: 'completed',
  config: {
    repeats: 1,
    modes: ['offline'],
    sequential: true,
    offlineTimeoutMs: 45000,
    onlineTimeoutMs: 60000,
    slmTimeoutMs: 10000,
    includeContent,
    plannedRequests: attempts.length,
    plannedProviderRequests: 0,
    referenceDate: '2026-11-23T10:00:00.000+08:00',
  },
  environment: null,
  onlinePreflight: null,
  isolation: {
    method: 'm',
    bypassedStages: [],
    sideEffectCheck: null,
    settingsChanged: 'none',
  },
  attempts,
  summary: summarizeAttempts(attempts),
  notes: [],
});

describe('exports', () => {
  it('escapes CSV fields (RFC 4180) and defuses spreadsheet formulas', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvField(null)).toBe('');
    expect(csvField(12.345)).toBe('12.3');
  });

  it('writes one row per attempt with as many fields as the header', () => {
    const run = runWith([
      attempt({}),
      attempt({attemptId: 'b', index: 2, reason: 'has, comma\nand "quotes"'}),
    ]);
    const csv = buildCsv(run);
    const lines = csv.trim().split('\r\n');
    expect(lines[0].split(',')).toHaveLength(CSV_COLUMNS.length);
    expect(lines).toHaveLength(3);
  });

  it('redacts custom prompts and replies unless the run opted in', () => {
    const secret = 'my student number is 2020-12345';
    const custom = attempt({
      caseId: 'custom',
      custom: true,
      promptText: null,
      replyText: null,
    });
    const run = runWith([custom]);
    const csv = buildCsv(run);
    const json = buildJson(run);
    expect(csv).not.toContain(secret);
    expect(csv).toContain(REDACTED);
    expect(JSON.parse(json).attempts[0].promptText).toBe(REDACTED);
    expect(JSON.parse(json).attempts[0].replyText).toBe(REDACTED);

    const included = runWith(
      [attempt({custom: true, promptText: secret, replyText: 'ok reply'})],
      true,
    );
    expect(buildCsv(included)).toContain(secret);
    expect(JSON.parse(buildJson(included)).attempts[0].replyText).toBe(
      'ok reply',
    );
  });

  it('keeps simulated and unsuccessful attempts out of latency, but visible', () => {
    const run = runWith([
      attempt({}),
      attempt({attemptId: 's', simulated: true, simulationLabel: 'SIMULATED'}),
      attempt({attemptId: 't', status: 'FAIL', outcome: 'timeout'}),
      attempt({
        attemptId: 'c',
        status: 'CANCELLED',
        outcome: 'not_run',
        trace: null,
      }),
    ]);
    expect(run.summary).toMatchObject({
      passed: 2,
      failed: 1,
      cancelled: 1,
      simulatedExcluded: 1,
      unsuccessfulExcluded: 1,
    });
    expect(run.summary.latency).toHaveLength(1);
    expect(run.summary.latency[0].replyReady.n).toBe(1);
    expect(run.attempts).toHaveLength(4);
  });
});

describe('instrumentation switch', () => {
  beforeAll(async () => {
    await initDatabase();
  });
  beforeEach(() => {
    db.executeSync('DELETE FROM local_settings');
    refreshPerfTrackingCache();
  });

  it('records only while Developer Mode and tracking are both on', () => {
    expect(isPerfTrackingEnabled()).toBe(false);
    setPerfTrackingEnabled(true);
    expect(isPerfTrackingEnabled()).toBe(false); // Developer Mode is off
    developerTestService.setDeveloperModeEnabled(true);
    expect(isPerfTrackingEnabled()).toBe(true);
    developerTestService.setDeveloperModeEnabled(false);
    expect(isPerfTrackingEnabled()).toBe(false);
  });

  it('a request without a trace behaves exactly as before', async () => {
    const plain = await intentService.extractIntent(
      'Remind me to submit my thesis tomorrow at 9 AM',
    );
    const trace = createRequestTrace({
      requestedMode: 'offline',
      source: 'chat',
    });
    const traced = await intentService.extractIntent(
      'Remind me to submit my thesis tomorrow at 9 AM',
      {trace},
    );
    expect(traced).toEqual(plain);
    expect(trace.snapshot().durations.intentParse).toBeGreaterThanOrEqual(0);
    expect(trace.snapshot().facts.modelState).toBe('not_used');
  });
});

describe('offline model timing', () => {
  const originalOS = Platform.OS;
  const originalExtractor = NativeModules.LafinaIntentExtractor;
  let extract: jest.Mock;
  beforeEach(() => {
    Platform.OS = 'android';
    extract = jest.fn();
    NativeModules.LafinaIntentExtractor = {
      extractIntent: extract,
      cancelExtraction: jest.fn(async () => true),
    };
  });
  afterEach(() => {
    Platform.OS = originalOS;
    NativeModules.LafinaIntentExtractor = originalExtractor;
  });

  it('separates model load from inference and marks a cold load', async () => {
    extract.mockResolvedValue(
      JSON.stringify({
        intent: 'create_reminder',
        title: 'Study',
        engine: 'slm',
        timing: {load_ms: 1200, inference_ms: 800, cold: true},
      }),
    );
    const trace = createRequestTrace({
      requestedMode: 'offline',
      source: 'benchmark',
    });
    const result = await intentService.extractIntent(
      'pa-remind ako mag-aral bukas ng 7pm',
      {preferOnDeviceSlm: true, userId: 'u-1', trace},
    );
    const snap = trace.finalize();
    expect(result.source).toBe('on_device_slm');
    expect(snap.durations.modelLoad).toBe(1200);
    expect(snap.durations.modelInference).toBe(800);
    expect(snap.facts).toMatchObject({
      modelState: 'cold',
      modelUsed: true,
      offlineModelId: 'test-model',
    });
    expect(snap.executionPath).toBe('offline_model');
  });

  it('an older engine without timing reports unknown state, not a guess', async () => {
    extract.mockResolvedValue(
      JSON.stringify({
        intent: 'create_reminder',
        title: 'Study',
        engine: 'slm',
      }),
    );
    const trace = createRequestTrace({
      requestedMode: 'offline',
      source: 'chat',
    });
    await intentService.extractIntent('pa-remind ako mag-aral bukas ng 7pm', {
      preferOnDeviceSlm: true,
      userId: 'u-1',
      trace,
    });
    const snap = trace.finalize();
    expect(snap.facts.modelState).toBe('unknown');
    expect(snap.durations.modelLoad).toBeUndefined();
    const load = timingBreakdown(snap).find(r => r.key === 'modelLoad');
    expect(load?.unavailable).toMatch(
      /does not report load and inference separately/,
    );
  });

  it('a model timeout is recorded as a fallback with its reason', async () => {
    extract.mockImplementation(() => new Promise(() => undefined));
    const trace = createRequestTrace({
      requestedMode: 'offline',
      source: 'chat',
    });
    const result = await intentService.extractIntent(
      'pa-remind ako mag-aral bukas ng 7pm',
      {preferOnDeviceSlm: true, userId: 'u-1', slmTimeoutMs: 20, trace},
    );
    const snap = trace.finalize();
    expect(result.source).not.toBe('on_device_slm');
    expect(snap.executionPath).toBe('fallback');
    expect(snap.facts.fallbackReason).toMatch(/took over 20ms/);
  });

  it('cancelling stops waiting for the model', async () => {
    const controller = new AbortController();
    extract.mockImplementation(() => {
      queueMicrotask(() => controller.abort());
      return new Promise(() => undefined);
    });
    const trace = createRequestTrace({
      requestedMode: 'offline',
      source: 'benchmark',
    });
    const result = await intentService.extractIntent(
      'pa-remind ako mag-aral bukas ng 7pm',
      {
        preferOnDeviceSlm: true,
        userId: 'u-1',
        trace,
        signal: controller.signal,
      },
    );
    expect(result.source).not.toBe('on_device_slm');
    expect(
      NativeModules.LafinaIntentExtractor.cancelExtraction,
    ).toHaveBeenCalled();
    expect(trace.finalize().facts.fallbackReason).toMatch(/cancelled/);
  });

  it('a simulated missing model never asks the engine', async () => {
    const trace = createRequestTrace({
      requestedMode: 'offline',
      source: 'benchmark',
    });
    await intentService.extractIntent('pa-remind ako mag-aral bukas ng 7pm', {
      preferOnDeviceSlm: true,
      userId: 'u-1',
      trace,
      simulateMissingModel: true,
    });
    expect(extract).not.toHaveBeenCalled();
    expect(trace.finalize().facts.modelAvailability).toBe('simulated_missing');
  });
});
