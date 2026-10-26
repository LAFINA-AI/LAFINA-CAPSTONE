/* Synthetic host query evidence only; this is not Android performance. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {DatabaseSync} = require('node:sqlite');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  const flag = args[index];
  if (
    !['--output', '--cohort'].includes(flag) ||
    !args[index + 1] ||
    options[flag]
  ) {
    throw new Error(
      'Usage: node scripts/benchmark-planner-queries.cjs [--cohort student|stress] [--output new-file.json]',
    );
  }
  options[flag] = args[index + 1];
}
const cohort = options['--cohort'] || 'stress';
if (!['student', 'stress'].includes(cohort)) {
  throw new Error('Choose student or stress cohort.');
}
const workload =
  cohort === 'student'
    ? {
        tasks: 200,
        denseDayTasks: 100,
        events: 12,
        weeklyEvents: 8,
        dailyEvents: 4,
      }
    : {
        tasks: 5000,
        denseDayTasks: 1000,
        events: 60,
        weeklyEvents: 40,
        dailyEvents: 20,
      };
const output = path.resolve(
  root,
  options['--output'] || `docs/benchmarks/phase-04-queries-host-${cohort}.json`,
);
const relativeOutput = path.relative(root, output);
if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
  throw new Error('Evidence must stay inside this repository.');
}
if (fs.existsSync(output)) {
  throw new Error('Evidence already exists. Choose a new --output path.');
}
const sourcePaths = [
  'scripts/benchmark-planner-queries.cjs',
  'src/core/domain/planner.ts',
  'src/core/domain/plannerValidation.ts',
  'src/core/domain/scheduleTime.ts',
  'src/core/storage/plannerQueries.ts',
  'src/core/storage/plannerRepository.ts',
  'src/core/storage/plannerRows.ts',
  'src/core/storage/plannerDatabase.ts',
  'src/core/storage/reminderOperations.ts',
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
const sourceSha256 = hashSources();
const priorLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const relative = path.relative(path.join(root, 'src'), filename);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Only repository source may use the benchmark TS loader.');
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
const database = new DatabaseSync(':memory:');
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};
const rounded = value => Number(value.toFixed(6));
const warmups = 5;
const measured = 50;
const metrics = {};
const memory = [];
let observing = false;
let sqlCalls = 0;
let rowsReturned = 0;
let largestResult = 0;
function memoryCheckpoint(label) {
  const usage = process.memoryUsage();
  memory.push({
    label,
    hostRssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
  });
}
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
    max: rounded(sorted.at(-1)),
  };
}
function run(name, invoke, verify) {
  const samples = [];
  const errors = [];
  const querySamples = [];
  for (let index = 0; index < warmups + measured; index += 1) {
    sqlCalls = 0;
    rowsReturned = 0;
    largestResult = 0;
    observing = true;
    const start = performance.now();
    try {
      const result = invoke();
      const elapsed = performance.now() - start;
      observing = false;
      verify(result);
      if (index >= warmups) {
        samples.push(elapsed);
        querySamples.push({
          sqlCalls,
          rowsReturned,
          largestSingleSqlResult: largestResult,
        });
      }
    } catch (error) {
      observing = false;
      if (index < warmups) {
        throw error;
      }
      errors.push({
        sample: index - warmups,
        message: String(error.message || error),
      });
    }
  }
  metrics[name] = {
    warmups,
    attempted: measured,
    succeeded: samples.length,
    errorCount: errors.length,
    errors,
    latencyMs: statistics(samples),
    samplesMs: samples.map(rounded),
    querySamples,
  };
  memoryCheckpoint(name);
}
try {
  const {
    initializePlannerDatabase,
  } = require('../src/core/storage/plannerDatabase.ts');
  const {
    createPlannerRepository,
  } = require('../src/core/storage/plannerRepository.ts');
  const now = '2026-10-22T00:00:00.000Z';
  const adapter = {
    execute(sql, parameters = []) {
      const statement = database.prepare(sql);
      let result;
      if (statement.columns().length) {
        result = statement.all(...parameters);
      } else {
        statement.run(...parameters);
        result = [];
      }
      if (observing) {
        sqlCalls += 1;
        rowsReturned += result.length;
        largestResult = Math.max(largestResult, result.length);
      }
      return result;
    },
  };
  initializePlannerDatabase(adapter, now);
  const repository = createPlannerRepository(adapter, {now: () => now});
  // Preparation is outside the timer. Every row is public synthetic content;
  // Direct prepared inserts avoid measuring unrelated operation receipts.
  const insert = database.prepare(`INSERT INTO tasks
    (id,title,notes,due_at,due_date,timezone,status,version,created_at,updated_at)
    VALUES(?,?,?,?,?,'Asia/Manila',?,1,?,?)`);
  database.exec('BEGIN');
  for (let index = 0; index < workload.tasks; index += 1) {
    const date =
      index < workload.denseDayTasks
        ? '2026-10-22'
        : new Date(
            Date.parse('2026-09-01T00:00:00.000Z') + (index % 90) * 86400000,
          )
            .toISOString()
            .slice(0, 10);
    const kind = index % 4;
    insert.run(
      `task:synthetic_${String(index).padStart(4, '0')}`,
      `Synthetic task ${index}`,
      'Public synthetic academic notes. '.repeat(16),
      kind < 2
        ? `${date}T09:${String(index % 60).padStart(2, '0')}:00.000Z`
        : null,
      kind === 2 ? date : null,
      index % 5 === 0 ? 'COMPLETED' : 'TODO',
      now,
      now,
    );
  }
  database.exec('COMMIT');
  let reminderEventId;
  for (let index = 0; index < workload.events; index += 1) {
    const recurrence =
      index < workload.weeklyEvents
        ? {
            weekdays:
              index < workload.dailyEvents ? [0, 1, 2, 3, 4, 5, 6] : [2, 4, 6],
            untilDate: '2026-12-31',
          }
        : null;
    const startAt = recurrence
      ? '2026-01-01T01:00:00.000Z'
      : '2026-10-22T01:00:00.000Z';
    const endAt = recurrence
      ? '2026-01-01T02:00:00.000Z'
      : '2026-10-22T02:00:00.000Z';
    const event = repository.createEvent({
      token: `synthetic_event_${index}`,
      reminderLeadMinutes: index === 0 ? 15 : null,
      draft: {
        title: `Synthetic class ${index}`,
        notes: 'Synthetic query fixture.',
        startAt,
        endAt,
        timezone: 'Asia/Manila',
        recurrence,
        status: 'ACTIVE',
      },
    });
    if (index === 0) {
      reminderEventId = event.id;
    }
  }
  memoryCheckpoint(
    `prepared_${workload.tasks}_tasks_${workload.events}_events`,
  );
  const day = {
    fromDate: '2026-10-22',
    toDate: '2026-10-22',
    timezone: 'Asia/Manila',
    limit: 20,
  };
  const cursor = repository.agendaPage(day).nextCursor;
  assert(cursor !== null, 'Dense day must have another page.');
  run(
    'tasks_active_first_page',
    () => repository.tasksPage({filter: 'active', limit: 20}),
    result =>
      assert(
        result.items.length === 20 && result.hasMore,
        'Expected a full active task page.',
      ),
  );
  run(
    'tasks_completed_first_page',
    () => repository.tasksPage({filter: 'completed', limit: 20}),
    result =>
      assert(
        result.items.length === 20 && result.hasMore,
        'Expected a full completed task page.',
      ),
  );
  run(
    'agenda_day_first_page',
    () => repository.agendaPage(day),
    result =>
      assert(
        result.items.length === 20 && result.nextCursor !== null,
        'Expected a full agenda page.',
      ),
  );
  run(
    'agenda_day_next_page',
    () => repository.agendaPage({...day, after: cursor}),
    result =>
      assert(
        result.items.length === 20 && result.nextCursor !== null,
        'Expected a second agenda page.',
      ),
  );
  run(
    'agenda_week_first_page',
    () => repository.agendaPage({...day, toDate: '2026-10-28'}),
    result =>
      assert(
        result.items.length === 20 && result.nextCursor !== null,
        'Expected a full week page.',
      ),
  );
  run(
    'reminder_history_first_page',
    () =>
      repository.reminderPage({kind: 'event', id: reminderEventId, limit: 20}),
    result =>
      assert(
        result.items.length === 20 && result.hasMore,
        'Expected paired reminder history.',
      ),
  );
  assert(
    JSON.stringify(sourceSha256) === JSON.stringify(hashSources()),
    'Sources changed during benchmark. Retry with a new evidence path.',
  );
  const result = {
    schemaVersion: 1,
    phase: '04',
    label: 'HOST_ONLY_SYNTHETIC_PRODUCT_QUERIES',
    measuredAtUtc: new Date().toISOString(),
    command: `node scripts/benchmark-planner-queries.cjs${
      args.length ? ` ${args.join(' ')}` : ''
    }`,
    cohort,
    syntheticWorkload: workload,
    sourceSha256,
    environment: {
      node: process.version,
      sqlite: adapter.execute('SELECT sqlite_version() AS version')[0].version,
      typescript: ts.version,
      platform: process.platform,
      osRelease: os.release(),
      architecture: process.arch,
      cpuModel: os.cpus()[0]?.model || 'unavailable',
      logicalCpuCount: os.cpus().length,
    },
    conditions: {
      database:
        'Fresh node:sqlite synchronous :memory: database; schema2; DELETE journal semantics have no disk/fsync cost here.',
      workload: `${workload.tasks} synthetic tasks (${workload.denseDayTasks} dense-day; rest across 90 dates; 25% undated; 20% completed), ${workload.events} events (${workload.weeklyEvents} weekly; rest single). One daily class has 365 reminder/job pairs. No source deletion or cancellation.`,
      samples:
        '5 warmups and50 measured read calls per metric, same stable database, page20.',
      timer:
        'performance.now(); includes SQL prepare/all, adapter result counting, decoding, timezone boundaries, recurrence and paging. Verification outside timer.',
      percentileMethod:
        'Nearest rank: sorted successful samples at ceil(p*n); raw latency and SQL result sizes retained.',
      exclusions:
        'No file durability, migration, fixture generation, TS loader, Android bridge/UI, native alarms, network, STT/TTS or model inference in measured calls.',
      controlLimits:
        'No forcedGC; host scheduling/JIT/allocator/other processes uncontrolled. Observations are not a matched legacy baseline or device speed claim.',
    },
    metrics,
    memory: {
      label:
        'HOST_PROCESS_DISCRETE_CHECKPOINTS_NOT_ANDROID_PSS_OR_CONTINUOUS_PEAK',
      samples: memory,
      maxObservedHostRssBytes: Math.max(
        ...memory.map(sample => sample.hostRssBytes),
      ),
      designBounds:
        'Agenda retains one <=50-row SQL batch, one <=45-date weekly window and top page+1<=51 entries; scan time/candidate count are not bounded. Task/history SQL returns <=51 rows. SQLite internal query pages/cache and sorting are outside these JS array bounds.',
    },
    deviceMeasurements: Object.fromEntries(
      [
        'androidPeakPss',
        'androidColdStartup',
        'androidBattery',
        'physicalLowRamDevice',
        'legacyMatchedQueryComparison',
      ].map(name => [
        name,
        {
          status: 'NOT RUN',
          reason:
            'Host-only synthetic query benchmark; follow physical-device protocol.',
        },
      ]),
    ),
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, {
    flag: 'wx',
  });
  console.log(`Saved ${relativeOutput}`);
  for (const [name, metric] of Object.entries(metrics)) {
    console.log(
      `${name}: n=${metric.latencyMs.n}, p50=${metric.latencyMs.p50}ms, p95=${metric.latencyMs.p95}ms, errors=${metric.errorCount}`,
    );
  }
  if (Object.values(metrics).some(metric => metric.errorCount)) {
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
