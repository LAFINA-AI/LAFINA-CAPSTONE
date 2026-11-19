/**
 * Local-only accuracy test against a real USTP COR.
 *
 * `cor-sample/` is git-ignored (it holds real student data). When present it
 * contains the COR's positioned words — from pdfplumber, and from the app's
 * own extractors run on a phone — plus `expected.json`, the ground truth.
 * Without it (CI, other machines) this suite is skipped.
 */
import fs from 'fs';
import path from 'path';
import {
  parseCorLayout,
  type CorPageWords,
} from '../../src/ai/vision/corLayoutParser';
import {checkCorExtraction} from '../../src/ai/vision/corChecks';
import {chooseCorReading} from '../../src/ai/vision/corExtraction';
import {scoreCor, type ExpectedCor} from '../fixtures/corAccuracy';

const SAMPLE_DIR = path.join(__dirname, '..', '..', 'cor-sample');
const expectedPath = path.join(SAMPLE_DIR, 'expected.json');
const hasSample = fs.existsSync(expectedPath);
const wordFiles = hasSample
  ? fs
      .readdirSync(SAMPLE_DIR)
      .filter(name => /\.words\..+\.json$/.test(name))
      .sort()
  : [];

const describeIfSample =
  hasSample && wordFiles.length > 0 ? describe : describe.skip;
const REF_DATE = new Date('2026-11-11T09:00:00Z');

describeIfSample('Real USTP COR accuracy (local cor-sample)', () => {
  const expected: ExpectedCor = hasSample
    ? JSON.parse(fs.readFileSync(expectedPath, 'utf8'))
    : {profile: {}, courses: []};
  const summary: string[] = [];

  afterAll(() => {
    console.log(`COR accuracy:\n${summary.join('\n')}`);
  });

  test.each(wordFiles.map(name => [name]))('%s', name => {
    const page: CorPageWords = JSON.parse(
      fs.readFileSync(path.join(SAMPLE_DIR, name), 'utf8'),
    );
    const outcome = parseCorLayout(page, REF_DATE);
    const reading =
      page.source === 'pdf'
        ? outcome.ok
          ? outcome.result
          : null
        : chooseCorReading({
            ocrWords: page,
            ocrText: null,
            referenceDate: REF_DATE,
          })?.parsed ?? null;
    expect(reading).not.toBeNull();
    const parsed = reading!;
    const report = parsed.checks ?? checkCorExtraction(parsed);
    const score = scoreCor(parsed, expected);
    const wrong = score.fields.filter(f => !f.ok);
    summary.push(
      `  ${name}: ${score.correct}/${score.total} fields (${(
        (100 * score.correct) /
        score.total
      ).toFixed(1)}%), method=${report.method}, level=${report.level}${
        wrong.length
          ? `\n    wrong: ${wrong
              .map(
                f =>
                  `${f.field} expected=${JSON.stringify(
                    f.expected,
                  )} got=${JSON.stringify(f.actual)}`,
              )
              .join('\n           ')}`
          : ''
      }${
        report.issues.length
          ? `\n    flagged: ${report.issues.map(i => i.code).join(', ')}`
          : ''
      }`,
    );

    if (page.source === 'pdf') {
      // The PDF text layer must be read exactly, with every check passing.
      expect(wrong).toEqual([]);
      expect(report.level).toBe('exact');
    } else {
      // OCR may misread, but never silently: every wrong field must sit in a
      // subject the checks flagged, and no header field may be wrong.
      const flaggedCodes = new Set(report.issues.map(i => i.courseCode));
      const silent = wrong.filter(f => {
        const course = /^course\[\d+:([^\]]+)\]/.exec(f.field)?.[1];
        return !course || !flaggedCodes.has(course);
      });
      expect(silent).toEqual([]);
      if (wrong.length > 0) expect(report.level).toBe('needs_attention');
    }
  });
});
