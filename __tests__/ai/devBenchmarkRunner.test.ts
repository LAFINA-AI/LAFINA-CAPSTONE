/**
 * Developer Testing Hub (DEVTEST-01): one-click runs go through the real
 * chat orchestrator, check structured results, and never change the
 * student's planner, chat history, memory or settings. Jest with an
 * in-memory database: these are mocked runs, not device or provider results.
 */
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {
  BENCHMARK_SUITE_VERSION,
  buildCsv,
  buildJson,
  createRequestTrace,
  describePlannedRun,
  runBenchmark,
  snapshotPersonalData,
} from '../../src/ai/benchmark';
import {latestPendingReview} from '../../src/ai/nlu/commandReview';
import {cloudClient} from '../../src/cloud/cloudClient';
import {
  chatMemoryStore,
  chatStore,
  db,
  initDatabase,
  localSettingsStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {generateId} from '../../src/utils/id';

let owner: string;

const noEnvironment = async () => null;
const passingPreflight = async () => ({
  ok: true,
  checks: [{name: 'Account', status: 'PASS' as const, detail: 'test'}],
});

beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  db.executeSync('DELETE FROM local_settings');
  owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
});
afterEach(() => jest.restoreAllMocks());

const countRows = (table: string): number =>
  Number(
    db.executeSync(`SELECT COUNT(*) AS c FROM ${table} WHERE user_id = ?`, [
      owner,
    ]).rows?.[0]?.c ?? 0,
  );

describe('Quick Offline Test through the real pipeline', () => {
  it('checks structured results, stops at proposals and writes nothing', async () => {
    localSettingsStore.set(owner, 'chat.onlineMode', 'false');
    const before = snapshotPersonalData(owner);
    const request = jest.spyOn(cloudClient, 'request');
    const stream = jest.spyOn(cloudClient, 'stream');
    const progress: number[] = [];

    const run = await runBenchmark({
      userId: owner,
      suiteId: 'quick_offline',
      onProgress: p => progress.push(p.completed),
      deps: {environment: noEnvironment},
    });

    expect(run.suiteVersion).toBe(BENCHMARK_SUITE_VERSION);
    expect(run.status).toBe('completed');
    const byCase = Object.fromEntries(run.attempts.map(a => [a.caseId, a]));
    for (const id of [
      'greeting',
      'reminder',
      'task',
      'datetime',
      'ambiguous',
      'unsupported',
      'readonly',
      'repeated',
      'missingModel',
    ]) {
      expect({
        id,
        status: byCase[id].status,
        failed: byCase[id].assertions.filter(a => a.status === 'FAIL'),
      }).toEqual({id, status: 'PASS', failed: []});
    }
    // No offline model in Jest: the model-only assertion is UNAVAILABLE, never PASS.
    expect(byCase.varied.status).toBe('UNAVAILABLE');
    expect(
      byCase.varied.assertions.find(a => a.name === 'offline model answered')
        ?.status,
    ).toBe('UNAVAILABLE');
    expect(byCase.missingModel.simulated).toBe(true);
    expect(byCase.reminder.observed).toMatchObject({
      intent: 'create_reminder',
      review: 'proposal',
      time: '09:00',
      executionPath: 'fast_path',
    });

    // Proposals were cancelled by their own operation ids.
    expect(byCase.reminder.proposalsCancelled).toBe(1);
    expect(latestPendingReview(owner, 'chat')).toBeNull();
    // Nothing was saved or sent.
    expect(countRows('tasks')).toBe(0);
    expect(countRows('reminders')).toBe(0);
    expect(countRows('sync_outbox')).toBe(0);
    expect(request).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    expect(run.isolation.sideEffectCheck).toMatchObject({status: 'PASS'});
    expect(snapshotPersonalData(owner)).toEqual(before);
    // (Reading history creates a session lazily, so it is checked last.)
    expect(chatStore.getRecentMessages(owner, 50)).toHaveLength(0);
    expect(localSettingsStore.get(owner, 'chat.onlineMode')).toBe('false');

    // Latency excludes the simulated case and keeps cases apart.
    expect(run.summary.simulatedExcluded).toBe(1);
    expect(run.summary.latency.every(g => g.caseId !== 'missingModel')).toBe(
      true,
    );
    expect(progress[progress.length - 1]).toBe(run.attempts.length);

    // Exports carry no user id.
    expect(buildJson(run)).not.toContain(owner);
    expect(buildCsv(run)).not.toContain(owner);
  });

  it('a low-risk change is worked out but never applied', async () => {
    tasksStore.insertTask({
      id: generateId('task'),
      userId: owner,
      title: 'Lab report',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Medium',
      category: 'Academic',
      notes: null,
      recurrenceRule: null,
    });
    const before = snapshotPersonalData(owner);
    const trace = createRequestTrace({
      requestedMode: 'offline',
      source: 'benchmark',
    });
    const result = await chatOrchestrator.processMessage(
      owner,
      'Mark lab report as done',
      {trace, benchmark: {runId: 'test'}},
    );
    expect(result.dryRun).toEqual({
      status: 'would_apply',
      operation: 'complete_task',
    });
    expect(result.undo).toBeUndefined();
    expect(
      db.executeSync('SELECT is_completed FROM tasks WHERE user_id = ?', [
        owner,
      ]).rows?.[0]?.is_completed,
    ).toBe(0);
    expect(trace.finalize().bypassed).toContain('immediate low-risk change');
    expect(snapshotPersonalData(owner)).toEqual(before);
  });

  it('"forget everything" as a custom prompt never clears memory', async () => {
    chatMemoryStore.add(owner, 'I study best at night');
    const count = chatMemoryStore.list(owner).length;
    const revision = chatMemoryStore.revision(owner);
    const run = await runBenchmark({
      userId: owner,
      customPrompt: {
        text: 'forget everything you know about me',
        mode: 'offline',
      },
      deps: {environment: noEnvironment},
    });
    expect(chatMemoryStore.list(owner)).toHaveLength(count);
    expect(count).toBeGreaterThan(0);
    expect(chatMemoryStore.revision(owner)).toBe(revision);
    expect(run.isolation.bypassedStages).toContain('forget all memories');
    // The custom prompt is not kept unless the run opted in.
    expect(run.attempts[0].promptText).toBeNull();
    expect(buildCsv(run)).not.toContain('forget everything you know');
  });

  it('a memory sentence is not saved', async () => {
    const memoriesBefore = chatMemoryStore.list(owner).length;
    const run = await runBenchmark({
      userId: owner,
      customPrompt: {
        text: 'Remember that I prefer morning classes',
        mode: 'offline',
      },
      includeContent: true,
      deps: {environment: noEnvironment},
    });
    expect(chatMemoryStore.list(owner)).toHaveLength(memoriesBefore);
    expect(
      chatMemoryStore.list(owner).some(m => /morning classes/i.test(m.text)),
    ).toBe(false);
    expect(run.isolation.bypassedStages).toContain('memory save');
    expect(run.attempts[0].promptText).toBe(
      'Remember that I prefer morning classes',
    );
  });

  it("never decides the student's own open review card", async () => {
    const real = await chatOrchestrator.processMessage(
      owner,
      'Remind me to call the registrar tomorrow at 10 AM',
    );
    expect(real.review?.status).toBe('proposal');
    const trace = createRequestTrace({
      requestedMode: 'offline',
      source: 'benchmark',
    });
    const bench = await chatOrchestrator.processMessage(owner, 'yes confirm', {
      trace,
      benchmark: {runId: 'test'},
    });
    expect(bench.resolvedReview).toBeUndefined();
    expect(latestPendingReview(owner, 'chat')).not.toBeNull();
    expect(countRows('reminders')).toBe(0);
    expect(trace.finalize().bypassed).toContain(
      'decisions on an open review card',
    );
  });
});

describe('online runs', () => {
  it('shows the planned and provider request counts before running', () => {
    const plan = describePlannedRun({suiteId: 'quick_online', repeats: 3});
    expect(plan.total).toBe(18);
    // The simulated failure sends no request.
    expect(plan.providerRequests).toBe(15);
  });

  it('skips online cases when the preflight fails, but still runs simulated ones', async () => {
    const run = await runBenchmark({
      userId: owner,
      suiteId: 'quick_online',
      deps: {
        environment: noEnvironment,
        preflight: async () => ({
          ok: false,
          checks: [{name: 'Account', status: 'FAIL', detail: 'Guest account'}],
        }),
      },
    });
    const statuses = Object.fromEntries(
      run.attempts.map(a => [a.caseId, a.status]),
    );
    expect(statuses.greeting).toBe('SKIPPED');
    expect(statuses.reminder).toBe('SKIPPED');
    expect(statuses.onlineFailure).toBe('PASS');
    const fallback = run.attempts.find(a => a.caseId === 'onlineFailure');
    expect(fallback?.trace?.executionPath).toBe('fallback');
    expect(fallback?.trace?.facts.transportNote).toMatch(/SIMULATED/);
    expect(fallback?.trace?.facts.fallbackReason).toMatch(/SIMULATED/);
    expect(run.summary.latency).toHaveLength(0);
    expect(run.notes.join(' ')).toMatch(/preflight did not pass/);
  });

  it('records the actual online route and stream timing', async () => {
    const body =
      ': keep-alive\n\n' +
      ['Hi', ' there']
        .map(t => `data: ${JSON.stringify({type: 'delta', text: t})}\n\n`)
        .join('') +
      `data: ${JSON.stringify({
        type: 'done',
        model: 'deepseek-chat',
        sources: [],
      })}\n\n`;
    jest
      .spyOn(cloudClient, 'stream')
      .mockImplementation(async (_p, _b, options) => {
        options.onText(': keep-alive\n\n');
        options.onText(body.slice(': keep-alive\n\n'.length));
        return {status: 'success', data: body, httpStatus: 200};
      });
    const trace = createRequestTrace({
      requestedMode: 'online',
      source: 'benchmark',
    });
    const result = await chatOrchestrator.processMessage(owner, 'Hello', {
      onlineMode: true,
      onReplyText: () => undefined,
      trace,
      benchmark: {runId: 'test'},
    });
    const snap = trace.finalize();
    expect(result.usedOnline).toBe(true);
    expect(snap.executionPath).toBe('online_provider');
    expect(snap.facts).toMatchObject({
      streamed: true,
      onlineModelId: 'deepseek-chat',
    });
    expect(snap.marks.onlineDispatched).toBeDefined();
    expect(snap.marks.firstNetworkChunk).toBeDefined();
    expect(snap.marks.firstContentReceived).toBeGreaterThanOrEqual(
      snap.marks.firstNetworkChunk as number,
    );
    // A benchmark does not touch memory bookkeeping either.
    expect(snap.bypassed).toContain('memory "last used" update');
  });

  it('an interrupted stream is reported as interrupted, not success', async () => {
    const body = `data: ${JSON.stringify({
      type: 'delta',
      text: 'Partial',
    })}\n\n`;
    jest
      .spyOn(cloudClient, 'stream')
      .mockImplementation(async (_p, _b, options) => {
        options.onText(body);
        return {status: 'server_unavailable', error: 'reset', data: body};
      });
    const trace = createRequestTrace({
      requestedMode: 'online',
      source: 'benchmark',
    });
    await chatOrchestrator.processMessage(owner, 'Hello', {
      onlineMode: true,
      onReplyText: () => undefined,
      trace,
      benchmark: {runId: 'test'},
    });
    trace.setOutcome('success'); // the caller's later outcome does not win
    expect(trace.finalize().outcome).toBe('interrupted_stream');
  });
});

describe('cancel and timeout', () => {
  it('Cancel Run stops at once; the rest are CANCELLED and stay visible', async () => {
    const controller = new AbortController();
    let calls = 0;
    const run = await runBenchmark({
      userId: owner,
      suiteId: 'quick_offline',
      signal: controller.signal,
      deps: {
        environment: noEnvironment,
        processMessage: (userId, text, options) => {
          calls++;
          if (calls === 2) {
            controller.abort();
            return new Promise(() => undefined); // never answers
          }
          return chatOrchestrator.processMessage(userId, text, options);
        },
      },
    });
    expect(run.status).toBe('cancelled');
    expect(calls).toBe(2);
    expect(run.attempts[0].status).toBe('PASS');
    expect(run.attempts[1]).toMatchObject({
      status: 'CANCELLED',
      outcome: 'cancelled',
    });
    expect(run.attempts.slice(2).every(a => a.status === 'CANCELLED')).toBe(
      true,
    );
    expect(run.summary.cancelled).toBe(run.attempts.length - 1);
    expect(run.isolation.sideEffectCheck?.status).toBe('PASS');
  });

  it('a case that never answers times out as a FAIL, outside the latency stats', async () => {
    const run = await runBenchmark({
      userId: owner,
      customPrompt: {text: 'Hello', mode: 'offline'},
      offlineTimeoutMs: 30,
      deps: {
        environment: noEnvironment,
        processMessage: () => new Promise(() => undefined),
      },
    });
    expect(run.attempts[0]).toMatchObject({status: 'FAIL', outcome: 'timeout'});
    expect(run.summary.unsuccessfulExcluded).toBe(1);
    expect(run.summary.latency).toHaveLength(0);
  });

  it('an error inside a case is a FAIL and the run continues', async () => {
    let calls = 0;
    const run = await runBenchmark({
      userId: owner,
      suiteId: 'quick_offline',
      deps: {
        environment: noEnvironment,
        processMessage: (userId, text, options) => {
          calls++;
          if (calls === 1) return Promise.reject(new Error('boom'));
          return chatOrchestrator.processMessage(userId, text, options);
        },
      },
    });
    expect(run.attempts[0]).toMatchObject({
      status: 'FAIL',
      outcome: 'failure',
      reason: 'boom',
    });
    expect(run.attempts[1].status).toBe('PASS');
    expect(run.status).toBe('completed');
  });

  it('online runs use the preflight already shown, without changing settings', async () => {
    localSettingsStore.set(owner, 'chat.onlineMode', 'false');
    const preflight = jest.fn(passingPreflight);
    jest.spyOn(cloudClient, 'stream').mockResolvedValue({
      status: 'offline',
      error: 'no network',
    });
    jest.spyOn(cloudClient, 'request').mockResolvedValue({
      status: 'offline',
      error: 'no network',
    });
    const run = await runBenchmark({
      userId: owner,
      customPrompt: {text: 'Hello', mode: 'online'},
      onlinePreflight: await passingPreflight(),
      deps: {environment: noEnvironment, preflight},
    });
    expect(preflight).not.toHaveBeenCalled();
    // A real provider failure is reported as an actual fallback.
    expect(run.attempts[0].trace?.executionPath).toBe('fallback');
    expect(run.attempts[0].modeMismatch).toBe(true);
    expect(localSettingsStore.get(owner, 'chat.onlineMode')).toBe('false');
  });
});
