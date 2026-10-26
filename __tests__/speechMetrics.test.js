const {score, summarize, words} = require('../scripts/stt-metrics.cjs');

describe('word error metrics, not speech-engine or intent proof', () => {
  it('normalizes case/punctuation/Unicode but preserves number wording differences', () => {
    expect(words('Please, READ “Calculus”!')).toEqual([
      'please',
      'read',
      'calculus',
    ]);
    expect(score('Don’t forget.', 'dont forget').wer).toBe(0);
    expect(score('at nine', 'at 9').substitutions).toBe(1);
    expect(words('Mag aral sa Lunes')).toEqual(['mag', 'aral', 'sa', 'lunes']);
  });
  it('separates substitution, deletion and insertion', () => {
    expect(score('read chapter one', 'read chapter two')).toMatchObject({
      substitutions: 1,
      deletions: 0,
      insertions: 0,
      wer: 1 / 3,
    });
    expect(score('read chapter one', 'read one').deletions).toBe(1);
    expect(score('read one', 'read chapter one').insertions).toBe(1);
  });
  it('does not turn silence/deletion into an accurate transcript', () => {
    expect(score('cancel my reminder', '')).toMatchObject({
      deletions: 3,
      wer: 1,
      normalizedExactMatch: false,
    });
    expect(score('', 'hallucination')).toMatchObject({
      insertions: 1,
      wer: null,
      normalizedExactMatch: false,
    });
  });
  it('can report WER over one and uses corpus word totals rather than mean WER', () => {
    expect(score('read', 'read all three chapters').wer).toBe(3);
    const result = summarize([
      {id: 'a', reference: 'one', hypothesis: 'two'},
      {id: 'b', reference: 'a b c d', hypothesis: 'a b c d'},
    ]);
    expect(result.wer).toBe(1 / 5);
    expect(result.normalizedExactMatchRate).toBe(0.5);
  });
  it('bounds input and rejects an empty corpus', () => {
    expect(() => words('x'.repeat(2001))).toThrow();
    expect(() => words('a '.repeat(401))).toThrow();
    expect(() => summarize([])).toThrow();
  });
});
