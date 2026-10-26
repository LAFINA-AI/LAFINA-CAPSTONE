/* Host-only synthetic file-backed SQLite evidence. Never opens an app database. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {DatabaseSync} = require('node:sqlite');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output')) {
  throw new Error(
    'Usage: node scripts/benchmark-notes.cjs [--output new-file.json]',
  );
}
const output = path.resolve(
  root,
  args[1] || 'docs/benchmarks/phase-07-1-nol-ui-notes-host-initial.json',
);
const relativeOutput = path.relative(root, output).replaceAll('\\', '/');
if (
  relativeOutput.startsWith('..') ||
  path.isAbsolute(relativeOutput) ||
  !relativeOutput.endsWith('.json') ||
  fs.existsSync(output)
) {
  throw new Error(
    'Choose a new JSON evidence path inside this repository. Existing evidence is never overwritten.',
  );
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceSha256 = {};
const loadedTypescript = new Set();
for (const file of ['scripts/benchmark-notes.cjs', 'package-lock.json']) {
  sourceSha256[file] = hash(fs.readFileSync(path.join(root, file)));
}
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const relative = path.relative(root, filename).replaceAll('\\', '/');
  if (
    !relative.startsWith('src/core/domain/') &&
    !relative.startsWith('src/core/storage/')
  ) {
    throw new Error(
      'The benchmark TS loader accepts only local domain/storage source.',
    );
  }
  const bytes = fs.readFileSync(filename);
  sourceSha256[relative] = hash(bytes);
  loadedTypescript.add(relative);
  const compiled = ts.transpileModule(bytes.toString('utf8'), {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  });
  module._compile(compiled.outputText, filename);
};

const localRoot = path.join(root, '.local');
fs.mkdirSync(localRoot, {recursive: true});
const temporaryDirectory = fs.mkdtempSync(
  path.join(localRoot, 'notes-benchmark-'),
);
const databasePath = path.join(temporaryDirectory, 'synthetic-notes.sqlite');
const database = new DatabaseSync(databasePath);
const startedAtUtc = new Date().toISOString();
const started = performance.now();
const warmups = 5;
const measured = 100;
const syntheticNow = '2026-10-27T00:00:00.000Z';
const body =
  'Public synthetic academic note. Review the lecture, list questions and revise key concepts. '.repeat(
    4,
  );
const metrics = {};
const hostFreeMemoryBefore = os.freemem();
let observing = false;
let sqlCalls = 0;
let rowsReturned = 0;
let largestResult = 0;
let journalMode;
let synchronous;
let finalCounts;
let integrity;
let cleanupComplete = false;

function check(condition, message) {
  if (!condition) throw new Error(message);
}
const rounded = number => Number(number.toFixed(6));
function statistics(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = percentile => sorted[Math.ceil(percentile * sorted.length) - 1];
  return samples.length
    ? {
        n: samples.length,
        min: rounded(sorted[0]),
        p50: rounded(rank(0.5)),
        p95: rounded(rank(0.95)),
        max: rounded(sorted.at(-1)),
      }
    : {n: 0, min: null, p50: null, p95: null, max: null};
}
function counts() {
  return {
    notes: database
      .prepare('SELECT COUNT(*) AS total FROM notes WHERE deleted_at IS NULL')
      .get().total,
    receipts: database
      .prepare('SELECT COUNT(*) AS total FROM operation_receipts')
      .get().total,
  };
}
function run(name, invoke, verify) {
  const before = counts();
  const rawSamples = [];
  const warmupFailures = [];
  for (let index = 0; index < warmups + measured; index += 1) {
    sqlCalls = 0;
    rowsReturned = 0;
    largestResult = 0;
    observing = true;
    const tick = performance.now();
    let elapsed;
    let failure = null;
    try {
      const result = invoke(index);
      elapsed = performance.now() - tick;
      observing = false;
      verify(result, index);
    } catch (error) {
      elapsed ??= performance.now() - tick;
      observing = false;
      failure = String(error.message || error)
        .replaceAll(databasePath, '<synthetic-db>')
        .slice(0, 240);
    }
    const sample = {
      index: index - warmups,
      durationMs: rounded(elapsed),
      sqlCalls,
      rowsReturned,
      largestSingleSqlResult: largestResult,
      failure,
    };
    if (index < warmups) {
      if (failure) warmupFailures.push(sample);
    } else {
      rawSamples.push(sample);
    }
  }
  const successful = rawSamples.filter(sample => sample.failure === null);
  metrics[name] = {
    warmups,
    attempted: measured,
    succeeded: successful.length,
    failureCount: rawSamples.length - successful.length,
    warmupFailures,
    latencyMs: statistics(successful.map(sample => sample.durationMs)),
    rawSamples,
    datasetBefore: before,
    datasetAfter: counts(),
  };
}

try {
  const {
    initializePlannerDatabase,
  } = require('../src/core/storage/plannerDatabase.ts');
  const {
    createNotesRepository,
  } = require('../src/core/storage/notesRepository.ts');
  const adapter = {
    execute(sql, parameters = []) {
      const statement = database.prepare(sql);
      let rows;
      if (statement.columns().length) rows = statement.all(...parameters);
      else {
        statement.run(...parameters);
        rows = [];
      }
      if (observing) {
        sqlCalls += 1;
        rowsReturned += rows.length;
        largestResult = Math.max(largestResult, rows.length);
      }
      return rows;
    },
  };
  journalMode = adapter.execute('PRAGMA journal_mode=DELETE')[0].journal_mode;
  adapter.execute('PRAGMA synchronous=FULL');
  synchronous = adapter.execute('PRAGMA synchronous')[0].synchronous;
  check(
    journalMode === 'delete' && synchronous === 2,
    'File journal/full synchronous configuration failed',
  );
  initializePlannerDatabase(adapter, syntheticNow);
  const notes = createNotesRepository(adapter, {now: () => syntheticNow});
  const insertNote = database.prepare(
    'INSERT INTO notes(id,title,body,category,pinned,version,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,1,?,?,NULL)',
  );
  const insertTask = database.prepare(
    "INSERT INTO tasks(id,title,notes,timezone,status,version,created_at,updated_at) VALUES(?,?,'','UTC',?,1,?,?)",
  );
  database.exec('BEGIN IMMEDIATE');
  for (let index = 0; index < 500; index += 1) {
    insertNote.run(
      `note_seed_${String(index).padStart(4, '0')}`,
      `Synthetic lecture ${index}`,
      `${body} token_${String(index).padStart(4, '0')}`,
      index % 2 ? 'Personal' : 'Coursework',
      index % 10 === 0 ? 1 : 0,
      syntheticNow,
      syntheticNow,
    );
  }
  for (let index = 0; index < 200; index += 1) {
    insertTask.run(
      `synthetic_task_${index}`,
      `Synthetic task ${index}`,
      index < 40 ? 'COMPLETED' : 'TODO',
      syntheticNow,
      syntheticNow,
    );
  }
  database.exec('COMMIT');
  check(
    notes.counts().notes === 500 && notes.counts().completedTasks === 40,
    'Synthetic fixture count differs',
  );

  run(
    'note_create_transaction',
    index =>
      notes.create({
        token: `bench_create_${index}`,
        draft: {
          title: `Created synthetic note ${index}`,
          body,
          category: 'Coursework',
          pinned: false,
        },
      }),
    note =>
      check(note.version === 1 && note.body === body, 'Create result differs'),
  );
  let editTarget = notes.get('note_seed_0000');
  run(
    'note_edit_transaction',
    index =>
      notes.update({
        token: `bench_edit_${index}`,
        id: editTarget.id,
        expectedVersion: editTarget.version,
        draft: {
          title: `Edited synthetic note ${index}`,
          body,
          category: editTarget.category,
          pinned: true,
        },
      }),
    result => {
      check(result.version === editTarget.version + 1, 'Edit version differs');
      editTarget = result;
    },
  );
  run(
    'notes_first_page_20',
    () => notes.page({filter: 'All', limit: 20}),
    page =>
      check(
        page.items.length === 20 && page.hasMore,
        'Page bound/result differs',
      ),
  );
  run(
    'notes_body_search_page_20',
    () => notes.page({filter: 'All', search: 'academic note', limit: 20}),
    page =>
      check(
        page.items.length === 20 && page.hasMore,
        'Search page bound/result differs',
      ),
  );
  run(
    'notes_body_search_no_match',
    () =>
      notes.page({
        filter: 'All',
        search: 'absent synthetic phrase qzv987',
        limit: 20,
      }),
    page =>
      check(
        page.items.length === 0 && !page.hasMore,
        'No-match result differs',
      ),
  );
  run(
    'profile_exact_counts',
    () => notes.counts(),
    result =>
      check(
        result.notes === 605 && result.completedTasks === 40,
        'Exact profile count differs',
      ),
  );
  finalCounts = {...notes.counts(), receipts: counts().receipts, tasks: 200};
  integrity = {
    sqlite: adapter.execute('PRAGMA integrity_check')[0].integrity_check,
    foreignKeyViolations: adapter.execute('PRAGMA foreign_key_check').length,
  };
  check(
    integrity.sqlite === 'ok' && integrity.foreignKeyViolations === 0,
    'Final integrity check failed',
  );
} finally {
  database.close();
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
  // Only the explicitly created synthetic files are removed. No recursive delete.
  check(
    path.dirname(temporaryDirectory) === localRoot &&
      path.basename(temporaryDirectory).startsWith('notes-benchmark-'),
    'Unexpected cleanup directory',
  );
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = `${databasePath}${suffix}`;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  fs.rmdirSync(temporaryDirectory);
  cleanupComplete = true;
}

const sourceDrift = Object.keys(sourceSha256).filter(
  file => hash(fs.readFileSync(path.join(root, file))) !== sourceSha256[file],
);
const totalFailures = Object.values(metrics).reduce(
  (sum, metric) => sum + metric.failureCount + metric.warmupFailures.length,
  0,
);
const evidence = {
  schemaVersion: 1,
  phase: '07.1',
  label: 'HOST_ONLY_SYNTHETIC_FILE_BACKED_NOTES',
  startedAtUtc,
  finishedAtUtc: new Date().toISOString(),
  elapsedSeconds: rounded((performance.now() - started) / 1000),
  command: `node scripts/benchmark-notes.cjs --output ${relativeOutput}`,
  sourceSha256,
  loadedTypescript: [...loadedTypescript],
  sourceDrift,
  environment: {
    node: process.version,
    sqlite: process.versions.sqlite,
    typescript: ts.version,
    platform: process.platform,
    architecture: process.arch,
    osRelease: os.release(),
    cpuModel: os.cpus()[0]?.model ?? null,
    logicalCpuCount: os.cpus().length,
    hostTotalMemoryBytes: os.totalmem(),
    hostFreeMemoryBefore,
    hostFreeMemoryAfter: os.freemem(),
  },
  conditions: {
    database:
      'Fresh isolated .local temporary SQLite file, schema3; closed and removed after measurements. Never opens app/student data.',
    journalMode,
    synchronous,
    fixture: {
      notes: 500,
      bodyBaseCharacters: body.length,
      bodySuffixCharacters: 11,
      categories: {Personal: 250, Coursework: 250},
      pinned: 50,
      tasks: 200,
      completedTasks: 40,
    },
    sampling:
      '5 untimed-cohort warmup calls plus 100 measured calls per metric; six metrics. Create adds 105 notes; edit updates one seeded note 105 times. Page/count metrics therefore observe 605 live notes. Warmup failures are retained.',
    timer:
      'performance.now(); includes production validation/transaction/SQL prepare/decoding/receipt work and file commit for mutations. Assertions, fixture/migration/TS compilation and cleanup are outside each measured call.',
    percentiles:
      'Nearest rank ceil(p*n) over successful samples; all 100 measured samples including failures retained; durations rounded to six decimals.',
    controls:
      'No forced GC, cache eviction or background-process isolation. Concurrent capstone development/build activity was not stopped. Host scheduling, filesystem cache and device firmware durability are uncontrolled.',
    limits:
      'Page20 bounds returned JS records (SQLite may return 21 to detect hasMore), not SQL scan cost. LIKE body search can scan history. File-backed FULL synchronous is a host configuration, not Android/JSI or power-loss proof.',
    exclusions:
      'No Android device, UI rendering, native alarm, speech/audio, cloud/backend, private data, battery, startup, peak PSS, low-RAM acceptance or old/new speed comparison.',
  },
  metrics,
  finalCounts,
  integrity,
  cleanupComplete,
  totalFailures,
  result: sourceDrift.length || totalFailures ? 'FAIL' : 'PASS',
};
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, {
  flag: 'wx',
});
process.stdout.write(
  `${evidence.result}: notes host cohort saved to ${relativeOutput}; ${totalFailures} failures, ${sourceDrift.length} source changes during run.\n`,
);
if (sourceDrift.length || totalFailures) process.exitCode = 1;
