/* AGY-PORT 12: scorer unit cases, independent of any recognizer. Run: node --test scripts/tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {scoreWords, summarizeTimings, createReport, writeNewReport} = require('../stt-metrics.cjs');

const corpusPath = path.join(__dirname, '..', '..', 'evaluation', 'stt-corpus-v1.json');
const corpusText = fs.readFileSync(corpusPath, 'utf8');
const corpus = JSON.parse(corpusText);
const corpusSha256 = crypto.createHash('sha256').update(corpusText).digest('hex');
const HASH = 'a'.repeat(64);

const cohort = (mutate = row => row) => ({
  version: 1,
  corpusSha256,
  artifactSha256: HASH,
  sourceCommit: 'c85b023',
  provenance: 'SCORER_SELF_TEST',
  engine: {name: 'Whisper.cpp', version: '1.7.x', model: 'ggml-base.en-q5_1', modelSha256: HASH},
  repetitionsPerCondition: 1,
  samples: corpus.samples.flatMap(sample =>
    ['fresh', 'shared'].map(condition =>
      mutate({caseId: sample.id, condition, iteration: 0, outcome: 'RESULT', hypothesis: sample.reference, elapsedMs: 900}),
    ),
  ),
});

test('exact, substitution, deletion and insertion counts', () => {
  assert.equal(scoreWords('remind me at eight', 'Remind me at eight.').errors, 0);
  assert.deepEqual(
    (({substitutions, deletions, insertions}) => ({substitutions, deletions, insertions}))(
      scoreWords('remind me at eight', 'remind him at eight please'),
    ),
    {substitutions: 1, deletions: 0, insertions: 1},
  );
  assert.equal(scoreWords('remind me at eight', 'remind eight').deletions, 2);
  assert.equal(scoreWords('', 'anything').wer, null);
});

test('normalization: case, punctuation, apostrophes and unicode width', () => {
  assert.equal(scoreWords("What's my next class", 'whats my NEXT class?').errors, 0);
  assert.equal(scoreWords('ｔｅｎ minutes', 'ten minutes').errors, 0);
});

test('bounds: oversized, control characters and too many words are refused', () => {
  assert.throws(() => scoreWords('x'.repeat(2001), 'x'));
  assert.throws(() => scoreWords('ok\u0007', 'ok'));
  assert.throws(() => scoreWords(Array(401).fill('w').join(' '), 'w'));
  assert.throws(() => scoreWords(null, 'x'));
});

test('timings: median, nearest-rank p95 and refusal of invalid values', () => {
  assert.deepEqual(summarizeTimings([100, 300, 200, 400]), {n: 4, p50Ms: 250, p95Ms: 400, maxMs: 400});
  assert.deepEqual(summarizeTimings([]), {n: 0, p50Ms: null, p95Ms: null, maxMs: null});
  assert.throws(() => summarizeTimings([-1]));
  assert.throws(() => summarizeTimings([Number.NaN]));
  assert.throws(() => summarizeTimings([600001]));
});

test('a complete self-test cohort is labelled as not recognition evidence', () => {
  const report = createReport(cohort(), corpus, corpusSha256);
  assert.equal(report.classification, 'SCORER_SELF_TEST_NOT_RECOGNITION_EVIDENCE');
  assert.equal(report.metrics.werIncludingFailures, 0);
  assert.equal(JSON.stringify(report).includes(corpus.samples[0].reference), false);
});

test('empty and error attempts are counted as missing words, never dropped', () => {
  let flip = 0;
  const report = createReport(
    cohort(row => {
      flip += 1;
      if (flip === 1) return {...row, outcome: 'EMPTY', hypothesis: ''};
      if (flip === 2) return {...row, outcome: 'ERROR', hypothesis: '', elapsedMs: 3000};
      return row;
    }),
    corpus,
    corpusSha256,
  );
  const missing = corpus.samples[0].reference.split(' ').length * 2;
  assert.equal(report.metrics.empty, 1);
  assert.equal(report.metrics.error, 1);
  assert.equal(report.metrics.errors, missing);
  assert.equal(report.metrics.samples, corpus.samples.length * 2);
  assert.equal(report.metrics.fresh.maxMs, 900);
  assert.equal(report.metrics.shared.maxMs, 3000);
});

test('incomplete, duplicate, wrong corpus, wrong engine and non-Whisper cohorts are refused', () => {
  const full = cohort();
  assert.throws(() => createReport({...full, samples: full.samples.slice(1)}, corpus, corpusSha256));
  assert.throws(() => createReport({...full, samples: [...full.samples.slice(1), full.samples[0]].map((r, i) => (i === 0 ? full.samples[0] : r))}, corpus, corpusSha256));
  assert.throws(() => createReport({...full, corpusSha256: 'b'.repeat(64)}, corpus, corpusSha256));
  assert.throws(() => createReport({...full, engine: {...full.engine, name: 'AndroidOnDevice', modelSha256: null}}, corpus, corpusSha256));
  assert.throws(() => createReport({...full, provenance: 'STUDENT_MICROPHONE'}, corpus, corpusSha256));
  assert.throws(() => createReport(cohort(row => ({...row, outcome: 'RESULT', hypothesis: ''})), corpus, corpusSha256));
});

test('reports are written only as new files inside the evidence folder', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-stt-'));
  const evidence = path.join(root, 'docs', 'plans', 'agy-improvements', 'reports', 'evidence');
  fs.mkdirSync(evidence, {recursive: true});
  const output = path.join('docs', 'plans', 'agy-improvements', 'reports', 'evidence', 'stt-new.json');
  writeNewReport({ok: true}, output, root);
  assert.throws(() => writeNewReport({ok: true}, output, root), /EEXIST/);
  assert.throws(() => writeNewReport({}, 'outside.json', root));
  assert.throws(() => writeNewReport({}, path.join('docs', 'plans', 'agy-improvements', 'reports', 'evidence', 'x.txt'), root));
  fs.rmSync(root, {recursive: true, force: true});
});
