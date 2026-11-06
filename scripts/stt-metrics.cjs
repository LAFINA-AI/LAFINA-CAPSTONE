/*
 * AGY-PORT 12: host-only, fixed-corpus WER scoring for offline Whisper results.
 * Adapted from LAFINA scripts/stt-metrics.cjs (donor 0d4bbe39). Changes for AGY:
 * the only engine is Whisper.cpp (AGY has no Android on-device recognizer, see
 * ADR-022), edit distance is bounded, reports go only to the AGY-PORT evidence
 * folder and never overwrite. This module never imports or mutates app state,
 * and never exports raw transcript text.
 */
const {createHash} = require('node:crypto');
const {readFileSync, writeFileSync, realpathSync} = require('node:fs');
const {resolve, relative, isAbsolute, dirname, extname, sep} = require('node:path');

const sha256 = value => createHash('sha256').update(value).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const MAX_TEXT = 2000;
const MAX_WORDS = 400;
const MAX_SAMPLES = 720;
const MAX_MS = 600000;
const PROVENANCE = ['DIRECT_SYNTHETIC_PCM', 'PUBLIC_FIXTURE_AUDIO', 'CONSENTED_RECORDING', 'SCORER_SELF_TEST'];

function words(value) {
  if (typeof value !== 'string' || value.length > MAX_TEXT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
    throw new Error('Supply bounded transcript text.');
  }
  const tokens = value.normalize('NFKC').toLocaleLowerCase('en').replace(/['’]/gu, '').match(/[\p{L}\p{N}]+/gu) || [];
  if (tokens.length > MAX_WORDS) throw new Error(`Transcript exceeds ${MAX_WORDS} words.`);
  return tokens;
}

/** Word edit distance with stable substitution/deletion/insertion tie order (bounded inputs). */
function scoreWords(reference, hypothesis) {
  const ref = words(reference);
  const hyp = words(hypothesis);
  const grid = Array.from({length: ref.length + 1}, () => new Uint16Array(hyp.length + 1));
  for (let r = 0; r <= ref.length; r++) grid[r][0] = r;
  for (let h = 0; h <= hyp.length; h++) grid[0][h] = h;
  for (let r = 1; r <= ref.length; r++) {
    for (let h = 1; h <= hyp.length; h++) {
      grid[r][h] = Math.min(
        grid[r - 1][h - 1] + Number(ref[r - 1] !== hyp[h - 1]),
        grid[r - 1][h] + 1,
        grid[r][h - 1] + 1,
      );
    }
  }
  let r = ref.length;
  let h = hyp.length;
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  while (r || h) {
    if (r && h && ref[r - 1] === hyp[h - 1] && grid[r][h] === grid[r - 1][h - 1]) {
      r--;
      h--;
    } else if (r && h && grid[r][h] === grid[r - 1][h - 1] + 1) {
      substitutions++;
      r--;
      h--;
    } else if (r && grid[r][h] === grid[r - 1][h] + 1) {
      deletions++;
      r--;
    } else {
      insertions++;
      h--;
    }
  }
  const errors = substitutions + deletions + insertions;
  return {
    referenceWords: ref.length,
    hypothesisWords: hyp.length,
    substitutions,
    deletions,
    insertions,
    errors,
    wer: ref.length ? errors / ref.length : null,
    normalizedExactMatch: errors === 0,
  };
}

/** Median and nearest-rank p95 of observed, bounded durations (failures included by the caller). */
function summarizeTimings(values) {
  if (!Array.isArray(values) || values.length > MAX_SAMPLES || values.some(v => !Number.isFinite(v) || v < 0 || v > MAX_MS)) {
    throw new Error('Invalid elapsed request times.');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    n,
    p50Ms: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
    p95Ms: n ? sorted[Math.ceil(n * 0.95) - 1] : null,
    maxMs: n ? sorted[n - 1] : null,
  };
}

function keys(value, expected) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('|') !== [...expected].sort().join('|')
  ) {
    throw new Error('Unexpected evaluation shape.');
  }
}
const label = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ._+/-]{0,95}$/.test(value);

/**
 * Validates a complete versioned cohort. Every case runs in a fresh context
 * ('fresh') and in a shared, already-loaded context ('shared') the same number
 * of times; EMPTY and ERROR attempts are kept and count as missing words.
 */
function createReport(input, corpus, corpusSha256) {
  keys(input, ['version', 'corpusSha256', 'artifactSha256', 'sourceCommit', 'provenance', 'engine', 'repetitionsPerCondition', 'samples']);
  keys(corpus, ['version', 'classification', 'samples']);
  if (
    corpus.version !== 1 ||
    corpus.classification !== 'PUBLIC_SYNTHETIC_ENGLISH_TEXT' ||
    !Array.isArray(corpus.samples) ||
    !corpus.samples.length ||
    corpus.samples.length > 24
  ) {
    throw new Error('Invalid fixed corpus.');
  }
  const references = new Map();
  for (const row of corpus.samples) {
    keys(row, ['id', 'reference']);
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(row.id) || references.has(row.id) || !words(row.reference).length) {
      throw new Error('Invalid fixed corpus reference.');
    }
    references.set(row.id, row.reference);
  }
  const repeat = input.repetitionsPerCondition;
  if (
    input.version !== 1 ||
    !HASH.test(corpusSha256) ||
    input.corpusSha256 !== corpusSha256 ||
    !HASH.test(input.artifactSha256) ||
    !/^[a-f0-9]{7,40}$/.test(input.sourceCommit) ||
    !Number.isInteger(repeat) ||
    repeat < 1 ||
    repeat > 30 ||
    !PROVENANCE.includes(input.provenance) ||
    !Array.isArray(input.samples) ||
    input.samples.length !== references.size * 2 * repeat
  ) {
    throw new Error('Invalid or incomplete evaluation cohort.');
  }
  keys(input.engine, ['name', 'version', 'model', 'modelSha256']);
  if (input.engine.name !== 'Whisper.cpp' || !label(input.engine.version) || !label(input.engine.model) || !HASH.test(input.engine.modelSha256)) {
    throw new Error('Invalid engine provenance.');
  }
  const seen = new Set();
  const cases = [];
  const times = {fresh: [], shared: []};
  const counts = {RESULT: 0, EMPTY: 0, ERROR: 0};
  let referenceWords = 0;
  let errors = 0;
  let exact = 0;
  for (const row of input.samples) {
    keys(row, ['caseId', 'condition', 'iteration', 'outcome', 'hypothesis', 'elapsedMs']);
    const key = `${row.caseId}:${row.condition}:${row.iteration}`;
    if (
      !references.has(row.caseId) ||
      !['fresh', 'shared'].includes(row.condition) ||
      !Number.isInteger(row.iteration) ||
      row.iteration < 0 ||
      row.iteration >= repeat ||
      seen.has(key) ||
      !['RESULT', 'EMPTY', 'ERROR'].includes(row.outcome) ||
      typeof row.hypothesis !== 'string' ||
      (row.outcome === 'RESULT' ? !words(row.hypothesis).length : row.hypothesis !== '')
    ) {
      throw new Error('Invalid or duplicate evaluation sample.');
    }
    summarizeTimings([row.elapsedMs]);
    seen.add(key);
    counts[row.outcome]++;
    const score = scoreWords(references.get(row.caseId), row.hypothesis);
    referenceWords += score.referenceWords;
    errors += score.errors;
    exact += Number(score.normalizedExactMatch);
    times[row.condition].push(row.elapsedMs);
    cases.push({caseId: row.caseId, condition: row.condition, iteration: row.iteration, outcome: row.outcome, hypothesisSha256: sha256(row.hypothesis), score});
  }
  return {
    version: 1,
    classification:
      input.provenance === 'SCORER_SELF_TEST' ? 'SCORER_SELF_TEST_NOT_RECOGNITION_EVIDENCE' : 'OBSERVED_STT_COHORT_NOT_PHONE_CERTIFICATION',
    recordedAtUtc: new Date().toISOString(),
    corpusSha256,
    artifactSha256: input.artifactSha256,
    sourceCommit: input.sourceCommit,
    scorerSha256: sha256(readFileSync(__filename)),
    engine: {...input.engine},
    provenance: input.provenance,
    metrics: {
      samples: cases.length,
      result: counts.RESULT,
      empty: counts.EMPTY,
      error: counts.ERROR,
      referenceWords,
      errors,
      werIncludingFailures: referenceWords ? errors / referenceWords : null,
      normalizedExactMatches: exact,
      fresh: summarizeTimings(times.fresh),
      shared: summarizeTimings(times.shared),
    },
    cases,
    limits: [
      'WER is word transcription error, not intent accuracy or scheduling safety.',
      'Empty/error attempts count as missing reference words; failures are never discarded.',
      'Times include failed attempts and say nothing about audibility, battery or microphone quality.',
      'Synthetic or fixture audio does not establish accent, noise or phone performance.',
      'Provenance is supplied by the collector; this scorer cannot authenticate recording origin.',
      'Raw hypotheses are not exported; their hashes are fingerprints, not anonymization.',
    ],
  };
}

/** Exclusive JSON evidence inside docs/plans/agy-improvements/reports/evidence only. */
function writeNewReport(report, output, root = resolve(__dirname, '..')) {
  const allowed = realpathSync(resolve(root, 'docs/plans/agy-improvements/reports/evidence'));
  const destination = resolve(root, output);
  const parent = realpathSync(dirname(destination));
  const local = relative(allowed, parent);
  if (extname(destination) !== '.json' || isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`)) {
    throw new Error('Choose a new JSON path inside the AGY-PORT evidence folder.');
  }
  writeFileSync(destination, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
}

module.exports = {scoreWords, summarizeTimings, createReport, writeNewReport, words};
