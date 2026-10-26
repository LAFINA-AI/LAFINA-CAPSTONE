/* Synthetic/public/consented transcripts only. Exact text match is not intent accuracy. */
function words(text) {
  if (typeof text !== 'string' || text.length > 2000) {
    throw new Error(
      'A transcript must be a string of at most 2000 characters.',
    );
  }
  const result =
    text
      .normalize('NFKC')
      .toLocaleLowerCase('en')
      .replace(/[’']/gu, '')
      .match(/[\p{L}\p{N}]+/gu) || [];
  if (result.length > 400) throw new Error('A transcript exceeds 400 words.');
  return result;
}

/** Word Levenshtein alignment. Stable ties prefer substitution, deletion, insertion. */
function score(reference, hypothesis) {
  const ref = words(reference);
  const hyp = words(hypothesis);
  const grid = Array.from({length: ref.length + 1}, () =>
    Array(hyp.length + 1).fill(0),
  );
  for (let r = 0; r <= ref.length; r++) grid[r][0] = r;
  for (let h = 0; h <= hyp.length; h++) grid[0][h] = h;
  for (let r = 1; r <= ref.length; r++) {
    for (let h = 1; h <= hyp.length; h++) {
      grid[r][h] = Math.min(
        grid[r - 1][h - 1] + (ref[r - 1] === hyp[h - 1] ? 0 : 1),
        grid[r - 1][h] + 1,
        grid[r][h - 1] + 1,
      );
    }
  }
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  let r = ref.length;
  let h = hyp.length;
  while (r || h) {
    if (
      r &&
      h &&
      ref[r - 1] === hyp[h - 1] &&
      grid[r][h] === grid[r - 1][h - 1]
    ) {
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
    normalizedExactMatch: ref.join(' ') === hyp.join(' '),
  };
}

function summarize(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000) {
    throw new Error('Supply 1–1000 labelled transcript pairs.');
  }
  const samples = rows.map(row => ({
    id: row.id,
    ...score(row.reference, row.hypothesis),
  }));
  const total = key => samples.reduce((sum, row) => sum + row[key], 0);
  return {
    n: samples.length,
    referenceWords: total('referenceWords'),
    errors: total('errors'),
    wer: total('referenceWords')
      ? total('errors') / total('referenceWords')
      : null,
    normalizedExactMatchRate:
      samples.filter(row => row.normalizedExactMatch).length / samples.length,
    samples,
  };
}
module.exports = {words, score, summarize};
