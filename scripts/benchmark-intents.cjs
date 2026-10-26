/* Frozen synthetic text evidence. Does not execute commands or open a database. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const corpusPath = 'docs/benchmarks/phase-07-command-corpus.json';
const frozenSha256 =
  '41ff335b5c20c054ba98b626cc21058fc8d1208f1c9e6a1b6e0196021c16e6ef';
const firstOutput = 'docs/benchmarks/phase-07-intents-host-first.json';
const repetitions = 100;
const options = {};
for (let index = 0; index < process.argv.slice(2).length; index += 2) {
  const flag = process.argv[index + 2];
  const value = process.argv[index + 3];
  if (!['--output', '--evaluation'].includes(flag) || !value || options[flag]) {
    throw new Error(
      'Usage: node scripts/benchmark-intents.cjs [--output new-file.json] [--evaluation first-held-out|regression]',
    );
  }
  options[flag] = value;
}
const evaluation = options['--evaluation'] || 'first-held-out';
if (!['first-held-out', 'regression'].includes(evaluation)) {
  throw new Error('Choose first-held-out or regression evaluation.');
}
const output = path.resolve(root, options['--output'] || firstOutput);
const relativeOutput = path.relative(root, output).replaceAll('\\', '/');
if (
  relativeOutput.startsWith('..') ||
  path.isAbsolute(relativeOutput) ||
  !relativeOutput.endsWith('.json') ||
  fs.existsSync(output)
) {
  throw new Error('Choose a new JSON output inside this repository.');
}
if (evaluation === 'first-held-out' && relativeOutput !== firstOutput) {
  throw new Error(`First evaluation must preserve ${firstOutput}.`);
}
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const corpusBytes = fs.readFileSync(path.join(root, corpusPath));
if (sha256(corpusBytes) !== frozenSha256) {
  throw new Error(
    'Frozen corpus changed; do not tune or relabel after results.',
  );
}
const corpus = JSON.parse(corpusBytes.toString('utf8'));
if (
  corpus.schemaVersion !== 1 ||
  corpus.caseCount !== 64 ||
  corpus.cases.length !== 64 ||
  new Set(corpus.cases.map(row => row.id)).size !== 64 ||
  corpus.cases.filter(row => row.expected.status === 'ready').length !== 32 ||
  corpus.cases.filter(row => row.expected.status === 'refusal').length !== 32
) {
  throw new Error('Frozen corpus structure differs from the declared cohort.');
}
const loadedSourceSha256 = {};
const priorLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const relative = path.relative(root, filename).replaceAll('\\', '/');
  if (
    !relative.startsWith('src/core/ai/') &&
    !relative.startsWith('src/core/domain/')
  ) {
    throw new Error('The parser benchmark may load only AI/domain source.');
  }
  const bytes = fs.readFileSync(filename);
  loadedSourceSha256[relative] = sha256(bytes);
  const compiled = ts.transpileModule(bytes.toString('utf8'), {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  });
  module._compile(compiled.outputText, filename);
};

function leaves(value, prefix = '') {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, nested]) =>
      leaves(nested, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [[prefix, value]];
}
function lookup(value, key) {
  return key.split('.').reduce((current, part) => current?.[part], value);
}
const mutating = new Set([
  'create_task',
  'create_event',
  'move',
  'complete',
  'delete',
  'ack',
  'snooze',
]);
const scheduling = new Set(['create_task', 'create_event', 'move']);
function score(expected, actual) {
  const ready = actual?.status === 'ready';
  const kind = ready ? actual.intent?.kind : null;
  const recognizedStatus = ['ready', 'clarification', 'unsupported'].includes(
    actual?.status,
  );
  const kindMatches =
    expected.status === 'ready' && ready && kind === expected.kind;
  const slotResults =
    expected.status === 'ready'
      ? leaves(expected.slots).map(([slot, value]) => ({
          slot,
          expected: value,
          actual: lookup(actual?.intent, slot) ?? null,
          present: lookup(actual?.intent, slot) !== undefined,
          match:
            kindMatches &&
            JSON.stringify(lookup(actual.intent, slot)) ===
              JSON.stringify(value),
        }))
      : [];
  const metadataValid = ready
    ? actual.timezone === corpus.context.timezone &&
      actual.confidence === 1 &&
      actual.sourceTargetId === null &&
      actual.needsConfirmation === mutating.has(kind) &&
      Array.isArray(actual.slots?.present) &&
      Array.isArray(actual.slots?.missing) &&
      actual.slots.missing.length === 0
    : recognizedStatus &&
      actual.confidence === 0 &&
      actual.needsConfirmation === false &&
      Array.isArray(actual.missingSlots);
  const intentMatches =
    expected.status === 'ready'
      ? kindMatches
      : ['clarification', 'unsupported'].includes(actual?.status);
  return {
    pass: intentMatches && metadataValid && slotResults.every(row => row.match),
    intentMatches,
    metadataValid,
    slotResults,
    falseAck: expected.status === 'refusal' && ready && kind === 'ack',
    falseScheduling:
      expected.status === 'refusal' && ready && scheduling.has(kind),
    unsafeReady: expected.status === 'refusal' && ready && mutating.has(kind),
    threw: actual?.status === 'THREW',
  };
}
function statistics(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const center = Math.floor(sorted.length / 2);
  return {
    n: sorted.length,
    p50:
      sorted.length % 2
        ? sorted[center]
        : (sorted[center - 1] + sorted[center]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}
function execute(parser, text) {
  const started = performance.now();
  try {
    const value = parser(text, {...corpus.context});
    const durationMs = performance.now() - started;
    return {actual: JSON.parse(JSON.stringify(value)), durationMs};
  } catch (error) {
    const durationMs = performance.now() - started;
    return {
      actual: {
        status: 'THREW',
        error:
          error instanceof Error
            ? error.message.slice(0, 200)
            : 'Unknown error',
      },
      durationMs,
    };
  }
}

try {
  const {parseIntent} = require('../src/core/ai/parseIntent.ts');
  if (typeof parseIntent !== 'function')
    throw new Error('parseIntent unavailable.');
  const startedAtUtc = new Date().toISOString();
  const memoryBefore = process.memoryUsage();
  const rows = corpus.cases.map(fixture => {
    const first = execute(parseIntent, fixture.text);
    const firstScore = score(fixture.expected, first.actual);
    const latencyMs = [];
    const variants = new Map();
    let repeatedFailures = 0;
    for (let index = 0; index < repetitions; index++) {
      const sample = execute(parseIntent, fixture.text);
      latencyMs.push(sample.durationMs);
      const serialized = JSON.stringify(sample.actual);
      const previous = variants.get(serialized);
      if (previous) previous.count++;
      else {
        variants.set(serialized, {
          firstSampleIndex: index,
          count: 1,
          actual: sample.actual,
          score: score(fixture.expected, sample.actual),
        });
      }
      if (!score(fixture.expected, sample.actual).pass) repeatedFailures++;
    }
    return {
      ...fixture,
      firstActual: first.actual,
      firstScore,
      firstCallMs: first.durationMs,
      repeatedSamples: repetitions,
      repeatedFailures,
      outputVariants: [...variants.values()],
      latencyMs: {raw: latencyMs, ...statistics(latencyMs)},
    };
  });
  const memoryAfter = process.memoryUsage();
  const sourceDrift = Object.entries(loadedSourceSha256)
    .filter(
      ([file, expected]) =>
        sha256(fs.readFileSync(path.join(root, file))) !== expected,
    )
    .map(([file]) => file);
  const slots = rows.flatMap(row => row.firstScore.slotResults);
  const allLatency = rows.flatMap(row => row.latencyMs.raw);
  const summary = {
    cases: rows.length,
    readyLabelCases: 32,
    refusalLabelCases: 32,
    exactPasses: rows.filter(row => row.firstScore.pass).length,
    intentOrRefusalMatches: rows.filter(row => row.firstScore.intentMatches)
      .length,
    metadataValidCases: rows.filter(row => row.firstScore.metadataValid).length,
    selectedSlotMatches: slots.filter(row => row.match).length,
    selectedSlotTotal: slots.length,
    falseAckCasesOnRefusalLabels: rows.filter(row => row.firstScore.falseAck)
      .length,
    falseSchedulingCasesOnRefusalLabels: rows.filter(
      row => row.firstScore.falseScheduling,
    ).length,
    unsafeReadyCasesOnRefusalLabels: rows.filter(
      row => row.firstScore.unsafeReady,
    ).length,
    thrownCases: rows.filter(row => row.firstScore.threw).length,
    repeatedFailedCalls: rows.reduce(
      (total, row) => total + row.repeatedFailures,
      0,
    ),
    nondeterministicCases: rows.filter(row => row.outputVariants.length > 1)
      .length,
    failedCaseIds: rows.filter(row => !row.firstScore.pass).map(row => row.id),
    aggregateLatencyMs: statistics(allLatency),
  };
  const result = {
    schemaVersion: 1,
    kind: 'HOST_SYNTHETIC_PARSER_CLASSIFICATION_NOT_COMMAND_EXECUTION_OR_ANDROID',
    evaluation,
    corpus: {
      path: corpusPath,
      sha256: frozenSha256,
      frozenAtUtc: corpus.frozenAtUtc,
    },
    context: corpus.context,
    startedAtUtc,
    completedAtUtc: new Date().toISOString(),
    loadedSourceSha256,
    harnessSha256: sha256(fs.readFileSync(__filename)),
    packageLockSha256: sha256(
      fs.readFileSync(path.join(root, 'package-lock.json')),
    ),
    sourceDrift,
    environment: {
      node: process.version,
      typescript: ts.version,
      platform: process.platform,
      osRelease: os.release(),
      architecture: process.arch,
      cpuModel: os.cpus()[0]?.model || 'unavailable',
      logicalCpuCount: os.cpus().length,
    },
    conditions: {
      input:
        'Frozen64 synthetic English text cases, fixed clock and selected timezone.',
      samples:
        'One first outcome/case then100 repeated timed calls/case; no explicit warmups or forcedGC. Each raw duration and every distinct output/error variant retained.',
      timer:
        'performance.now around parseIntent only; corpus loading, TypeScript transpilation, output serialization/scoring and writing excluded.',
      percentile:
        'p50 is arithmetic median; p95 nearest rank ceil(.95*n); errors/refusals remain in timing denominators.',
      safetyRates:
        'FalseACK/falseScheduling use32 expected-refusal cases as denominator; parser ready is a proposal, never an executed storage mutation.',
      selectedSlots:
        'Only frozen expected leaf fields scored; extra output fields such as query scope are retained but not retroactively added to labels.',
      evaluationBoundary:
        'Only the first retained evaluation is held-out. Later unchanged-label runs are regressions if implementation has seen results.',
    },
    summary,
    cases: rows,
    hostMemoryCheckpoints: {
      before: memoryBefore,
      after: memoryAfter,
      limit:
        'Two host process snapshots; not continuous peak, Android PSS, phone memory or energy.',
    },
    notRun: [
      'Actual command-to-database/native-alarm side effects (separate executor/device tests)',
      'Human or STT speech, Filipino accents/noise and language understanding beyond this grammar',
      'Android parser startup/latency/PSS/battery/low-RAM acceptance',
      'Matched legacy parser/model/phone comparison',
      'Optional NLU model inference: absent by design; no measured justification for an extra model',
    ],
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, {
    flag: 'wx',
  });
  console.log(
    JSON.stringify(
      {saved: relativeOutput, evaluation, sourceDrift, summary},
      null,
      2,
    ),
  );
  if (
    summary.exactPasses !== rows.length ||
    summary.repeatedFailedCalls ||
    sourceDrift.length
  ) {
    process.exitCode = 1;
  }
} finally {
  if (priorLoader) require.extensions['.ts'] = priorLoader;
  else delete require.extensions['.ts'];
}
