/* Evaluates only the fixed synthetic PCM corpus. No scheduling/intent side effects. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {summarize} = require('./stt-metrics.cjs');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--output') {
  throw new Error(
    'Usage: node scripts/evaluate-stt.cjs --input raw.json --output new-report.json',
  );
}
function local(value) {
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Paths must stay inside this repository.');
  return resolved;
}
const input = local(args[1]);
const output = local(args[3]);
if (fs.existsSync(output))
  throw new Error('Preserve prior measurements; choose a new output path.');
const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const corpus = JSON.parse(
  fs.readFileSync(
    path.join(root, 'docs/benchmarks/phase-06-corpus.json'),
    'utf8',
  ),
);
if (
  raw.kind !== 'DIRECT_SYNTHETIC_PCM_EMULATOR_OR_DEVICE_NOT_MICROPHONE' ||
  !Array.isArray(raw.samples) ||
  raw.samples.length !== corpus.samples.length
) {
  throw new Error(
    'Only the complete fixed synthetic PCM benchmark is accepted.',
  );
}
const seen = new Set();
for (const row of raw.samples) {
  const reference = corpus.samples.find(item => item.id === row.id);
  if (
    !reference ||
    seen.has(row.id) ||
    reference.reference !== row.reference ||
    !['RESULT', 'EMPTY', 'ERROR'].includes(row.outcome) ||
    typeof row.hypothesis !== 'string' ||
    !Number.isFinite(row.totalPrepareLoadDecodeMs) ||
    row.totalPrepareLoadDecodeMs < 0
  ) {
    throw new Error(
      'Unexpected, duplicate, missing or malformed synthetic sample.',
    );
  }
  seen.add(row.id);
}
function timings(rows) {
  const sorted = rows
    .map(row => row.totalPrepareLoadDecodeMs)
    .sort((a, b) => a - b);
  const n = sorted.length;
  return {
    n,
    p50Ms: n
      ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2
      : null,
    p95NearestRankMs: n ? sorted[Math.ceil(n * 0.95) - 1] : null,
    minMs: n ? sorted[0] : null,
    maxMs: n ? sorted[n - 1] : null,
  };
}
const report = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  label: 'SYNTHETIC_DIRECT_PCM_ACCURACY_AND_LOAD_DECODE_NOT_REAL_MICROPHONE',
  input: path.relative(root, input).replaceAll('\\', '/'),
  inputSha256: crypto
    .createHash('sha256')
    .update(fs.readFileSync(input))
    .digest('hex'),
  modelSha256: raw.modelSha256,
  device: {model: raw.deviceModel, api: raw.api, abis: raw.abis},
  appVersion: raw.appVersion,
  modelCachePresentBefore: raw.modelCachePresentBefore,
  results: summarize(raw.samples),
  failures: raw.samples
    .filter(row => row.outcome !== 'RESULT')
    .map(row => ({id: row.id, outcome: row.outcome})),
  allRequestTimings: timings(raw.samples),
  successfulRequestTimings: timings(
    raw.samples.filter(row => row.outcome === 'RESULT'),
  ),
  sampledMaxProcessPssKiB: Math.max(
    ...raw.samples.map(row => row.sampledMaxPssKiB || 0),
  ),
  limitations: [
    'All six rows, including empty/error outcomes, contribute to WER and exact-text rate.',
    'Exact phrase match is not intent parsing or successful scheduling; Phase07 has not started.',
    'Timings include model preparation/verification/load/decode from supplied PCM, not hold/release capture or human speech.',
    'One decoder is loaded/freed per request; OS disk/page caches may be warm.',
    'Synthetic English SAPI voice does not establish Filipino accents, noisy rooms, phone capture, interruption, battery or low-RAM quality.',
    'PSS maxima are sampled instrumentation-process observations, not absolute whole-app peaks.',
  ],
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(
  JSON.stringify({
    n: report.results.n,
    wer: report.results.wer,
    exactTextRate: report.results.normalizedExactMatchRate,
    failures: report.failures.length,
    timing: report.allRequestTimings,
  }),
);
