/* Host-only synthetic benchmark. Never infer Android performance from these results. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {DatabaseSync} = require('node:sqlite');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const argument = process.argv.slice(2);
if (argument.length && (argument.length !== 2 || argument[0] !== '--output')) {
  throw new Error(
    'Usage: node scripts/benchmark-planner.cjs [--output new-file.json]',
  );
}
const output = path.resolve(
  root,
  argument[1] || 'docs/benchmarks/phase-02-host.json',
);
const relativeOutput = path.relative(root, output);
if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
  throw new Error('Benchmark evidence must stay inside this repository.');
}
if (fs.existsSync(output)) {
  throw new Error(
    'Evidence already exists. Choose a new --output path; never overwrite a baseline.',
  );
}

const sourcePaths = [
  'scripts/benchmark-planner.cjs',
  'src/core/storage/plannerRepository.ts',
  'src/core/storage/plannerRows.ts',
  'src/core/storage/reminderOperations.ts',
  'src/core/storage/plannerDatabase.ts',
  'src/core/storage/openLocalDatabase.ts',
  'src/core/domain/planner.ts',
  'src/core/domain/plannerValidation.ts',
  'src/core/domain/scheduleTime.ts',
  'package-lock.json',
];
const hashSources = () =>
  Object.fromEntries(
    sourcePaths.map(file => [
      file,
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, file)))
        .digest('hex'),
    ]),
  );
const initialHashes = hashSources();
const priorLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const relative = path.relative(path.join(root, 'src'), filename);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      'Only repository source modules may use the benchmark TS loader.',
    );
  }
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  });
  module._compile(compiled.outputText, filename);
};

const warmupCount = 10;
const sampleCount = 100;
const baseNow = '2026-10-22T00:00:00.000Z';
const baseDue = Date.parse('2026-10-23T01:00:00.000Z');
let syntheticNow = baseNow;
const metrics = {};
const memory = [];
const snapshotMemory = label => {
  const usage = process.memoryUsage();
  memory.push({
    label,
    hostRssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
  });
};
const rounded = value => Number(value.toFixed(6));
function statistics(samples) {
  if (samples.length === 0) {
    return {n: 0, min: null, p50: null, p95: null, max: null};
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = percentile => sorted[Math.ceil(percentile * sorted.length) - 1];
  return {
    n: samples.length,
    min: rounded(sorted[0]),
    p50: rounded(rank(0.5)),
    p95: rounded(rank(0.95)),
    max: rounded(sorted[sorted.length - 1]),
  };
}
function run(name, inputs, invoke, verify = () => {}, warmups = warmupCount) {
  const durations = [];
  const errors = [];
  const results = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const start = performance.now();
    try {
      const result = invoke(inputs[index]);
      const elapsed = performance.now() - start;
      // Verify outside the timed region: failures remain counted in evidence.
      verify(result, inputs[index]);
      results.push(result);
      if (index >= warmups) {
        durations.push(elapsed);
      }
    } catch (error) {
      if (index < warmups) {
        throw error;
      }
      errors.push({
        sampleIndex: index - warmups,
        message: String(error.message || error),
      });
      results.push(null);
    }
  }
  metrics[name] = {
    warmupCount: warmups,
    attempted: inputs.length - warmups,
    succeeded: durations.length,
    errorCount: errors.length,
    errors,
    latencyMs: statistics(durations),
    samplesMs: durations.map(rounded),
  };
  snapshotMemory(name);
  return results;
}
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};
const applied = result =>
  assert(result === 'applied', 'Expected an applied reminder transition.');
const indices = Array.from(
  {length: warmupCount + sampleCount},
  (_, index) => index,
);
const database = new DatabaseSync(':memory:');
try {
  const {
    createPlannerRepository,
  } = require('../src/core/storage/plannerRepository.ts');
  const {
    initializePlannerDatabase,
  } = require('../src/core/storage/plannerDatabase.ts');
  const {expandWeekly} = require('../src/core/domain/scheduleTime.ts');
  const adapter = {
    execute(sql, parameters = []) {
      const statement = database.prepare(sql);
      if (statement.columns().length > 0) {
        return statement.all(...parameters);
      }
      statement.run(...parameters);
      return [];
    },
  };
  initializePlannerDatabase(adapter, baseNow);
  const repository = createPlannerRepository(adapter, {
    now: () => syntheticNow,
  });
  const sqliteVersion = database
    .prepare('SELECT sqlite_version() AS version')
    .get().version;
  snapshotMemory('initialized_before_workload');
  const createCommand = (prefix, index) => ({
    token: `${prefix}_${index}`,
    draft: {
      title: `Synthetic benchmark task ${index}`,
      notes: 'Synthetic fixture; no student information.',
      dueAt: new Date(baseDue + index * 60000).toISOString(),
      dueDate: null,
      timezone: 'Asia/Manila',
      status: 'TODO',
    },
    reminderLeadMinutes: 15,
  });
  const commands = indices.map(index => createCommand('host_create', index));
  const tasks = run(
    'create_task_reminder_job_transaction',
    commands,
    command => repository.createTask(command),
    task => assert(task.version === 1, 'Expected a new version-one task.'),
  );
  const edits = tasks.map((task, index) => ({
    token: `host_edit_${index}`,
    id: task.id,
    expectedVersion: task.version,
    draft: {...commands[index].draft, title: `Synthetic edited task ${index}`},
    reminderLeadMinutes: 15,
  }));
  run(
    'edit_task_metadata_transaction',
    edits,
    command => repository.updateTask(command),
    task => assert(task.version === 2, 'Expected a version-two task.'),
  );
  const jobForTask = id =>
    database
      .prepare(
        `SELECT j.* FROM reminder_jobs j
    JOIN reminders r ON r.id=j.reminder_id WHERE r.task_id=?`,
      )
      .get(id);
  const ringCommands = tasks.map((task, index) => {
    const job = jobForTask(task.id);
    return {
      token: `host_ring_${index}`,
      id: job.reminder_id,
      occurrenceKey: job.occurrence_key,
      generation: job.generation,
      action: {kind: 'RING', timezone: 'Asia/Manila', quietHours: null},
      runAt: job.run_at,
    };
  });
  run(
    'ring_reminder_transaction',
    ringCommands,
    ({runAt, ...command}) => {
      syntheticNow = runAt;
      return repository.reminderAction(command);
    },
    applied,
  );
  const acknowledgements = ringCommands.map(({runAt, ...command}, index) => ({
    ...command,
    token: `host_ack_${index}`,
    action: {kind: 'ACK'},
    runAt,
  }));
  run(
    'acknowledge_reminder_transaction',
    acknowledgements,
    ({runAt, ...command}) => {
      syntheticNow = runAt;
      return repository.reminderAction(command);
    },
    applied,
  );

  // Separate setup creates and rings independent tasks; setup calls are untimed.
  const snoozeCommands = indices.map(index => {
    syntheticNow = baseNow;
    const task = repository.createTask(
      createCommand('host_snooze_setup', index),
    );
    const job = jobForTask(task.id);
    syntheticNow = job.run_at;
    applied(
      repository.reminderAction({
        token: `host_snooze_ring_${index}`,
        id: job.reminder_id,
        occurrenceKey: job.occurrence_key,
        generation: job.generation,
        action: {kind: 'RING', timezone: 'Asia/Manila', quietHours: null},
      }),
    );
    return {
      token: `host_snooze_${index}`,
      id: job.reminder_id,
      occurrenceKey: job.occurrence_key,
      generation: job.generation,
      action: {kind: 'SNOOZE', minutes: 10},
      runAt: job.run_at,
    };
  });
  run(
    'snooze_reminder_transaction',
    snoozeCommands,
    ({runAt, ...command}) => {
      syntheticNow = runAt;
      return repository.reminderAction(command);
    },
    applied,
  );

  const weekly = {
    startDate: '2024-01-01',
    time: '09:00',
    timezone: 'Asia/Manila',
    rule: {weekdays: [0, 1, 2, 3, 4, 5, 6], untilDate: '2024-12-31'},
    fromUtc: '2024-01-01T00:00:00.000Z',
    toUtc: '2025-01-01T00:00:00.000Z',
  };
  run(
    'weekly_expand_366_calendar_dates',
    Array.from({length: 20}, () => weekly),
    query => expandWeekly(query),
    occurrences =>
      assert(
        occurrences.length === 366,
        'Expected 366 anchored weekly occurrences.',
      ),
    10,
  );

  const snapshot = repository.snapshot();
  assert(
    snapshot.tasks.length === 220 &&
      snapshot.reminders.length === 220 &&
      snapshot.jobs.length === 220,
    'Expected 220 owned task/reminder/job records after warmups and setup.',
  );
  assert(
    snapshot.reminders.filter(reminder => reminder.status === 'ACKNOWLEDGED')
      .length === 110,
    'Expected 110 acknowledged reminders.',
  );
  assert(
    snapshot.reminders.filter(reminder => reminder.status === 'SNOOZED')
      .length === 110,
    'Expected 110 snoozed reminders.',
  );
  assert(
    snapshot.tasks.every(task => task.status === 'TODO'),
    'Reminder outcomes must not complete tasks.',
  );
  assert(
    snapshot.jobs.every(job => job.deliveryState === 'UNAVAILABLE'),
    'This benchmark must not simulate native delivery success.',
  );
  snapshotMemory('after_workload_and_integrity_checks');
  assert(
    JSON.stringify(initialHashes) === JSON.stringify(hashSources()),
    'Production sources changed during benchmark. Retry into a new evidence file after edits finish.',
  );
  const result = {
    schemaVersion: 1,
    phase: '02',
    label: 'HOST_ONLY_IN_MEMORY_SQLITE_SYNTHETIC',
    measuredAtUtc: new Date().toISOString(),
    command: `node scripts/benchmark-planner.cjs${
      argument.length ? ` --output ${argument[1]}` : ''
    }`,
    sourceSha256: initialHashes,
    environment: {
      node: process.version,
      sqlite: sqliteVersion,
      typescript: ts.version,
      os: {
        platform: process.platform,
        release: os.release(),
        architecture: process.arch,
      },
      cpuModel: os.cpus()[0]?.model || 'unavailable',
      logicalCpuCount: os.cpus().length,
    },
    conditions: {
      database:
        'One fresh node:sqlite DatabaseSync :memory: connection; foreign keys ON; no file durability or fsync cost.',
      sqlAdapter:
        'Prepare each SQL statement per execute, synchronous all/run; not the Android OP-SQLite bridge.',
      fixture:
        'Synthetic tasks, Asia/Manila, fixed clock starting 2026-10-22T00:00:00.000Z; due 2026-10-23T01:00Z plus index minutes; lead15; snooze10.',
      samples:
        '10 warmups +100 measured calls per transaction workload; 10 warmups +10 measured 366-date weekly expansions.',
      timer:
        'performance.now(); successful repository invocation latency; result assertions outside timer; RING/ACK/SNOOZE include synchronous injected-clock assignment and command destructuring.',
      percentileMethod:
        'Nearest rank: sorted successful latency at ceil(p*n), with raw successful samples retained in call order.',
      exclusions:
        'No build, module transpilation/import, migration, fixture preparation, final snapshot, filesystem persistence, native bridge, Android UI, AlarmManager, STT, TTS or network inside measured regions.',
      gc: 'No forced GC; host scheduling, JIT, SQLite allocator and other running programs are uncontrolled.',
    },
    metrics,
    integrity: {
      tasks: snapshot.tasks.length,
      reminders: snapshot.reminders.length,
      jobs: snapshot.jobs.length,
      acknowledgedReminders: 110,
      snoozedReminders: 110,
      tasksStillTodo: true,
      nativeDeliveryState: 'UNAVAILABLE',
    },
    memory: {
      label:
        'HOST PROCESS RSS BYTES; NOT Android PSS and NOT a sampled physical-device peak',
      samples: memory,
      maxObservedHostRssBytes: Math.max(
        ...memory.map(sample => sample.hostRssBytes),
      ),
      limitation:
        'Discrete checkpoints only; includes Node, TS transpiler, modules, fixtures and in-memory DB. No allocation profiler or continuous peak sampler.',
    },
    deviceMeasurements: Object.fromEntries(
      [
        'androidStartup',
        'androidPeakPss',
        'androidBattery',
        'androidReminderReliability',
        'androidSttAccuracyLatency',
        'androidSystemTtsLatencyQuality',
        'kokoroComparison',
        'legacyComparableBaseline',
        'physicalLowRamDevice',
      ].map(name => [
        name,
        {
          status: 'NOT RUN',
          reason:
            'Host-only benchmark; requires a comparable real Android device protocol.',
        },
      ]),
    ),
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, {
    flag: 'wx',
  });
  console.log(`Saved ${path.relative(root, output)} (${result.label}).`);
  for (const [name, metric] of Object.entries(metrics)) {
    console.log(
      `${name}: n=${metric.latencyMs.n}, p50=${metric.latencyMs.p50}ms, p95=${metric.latencyMs.p95}ms, errors=${metric.errorCount}`,
    );
  }
  if (Object.values(metrics).some(metric => metric.errorCount > 0)) {
    process.exitCode = 1;
  }
} finally {
  database.close();
  if (priorLoader) {
    require.extensions['.ts'] = priorLoader;
  } else {
    delete require.extensions['.ts'];
  }
}
