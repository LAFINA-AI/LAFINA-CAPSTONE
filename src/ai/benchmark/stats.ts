/**
 * Latency statistics for the Developer Testing Hub.
 *
 * Percentile method: nearest-rank on the sorted sample. The p-th percentile is
 * the value at 1-based rank ceil(p/100 × n). The median is the usual middle
 * value (the mean of the two middle values when n is even).
 *
 * Small samples are labelled instead of dressed up: the median is reported
 * from MIN_SAMPLES_FOR_MEDIAN samples, p95 only from MIN_SAMPLES_FOR_P95
 * (below 20 samples nearest-rank p95 is simply the maximum, which would
 * mislead), and every sample under that size is flagged as small.
 */
export const MIN_SAMPLES_FOR_MEDIAN = 3;
export const MIN_SAMPLES_FOR_P95 = 20;
export const PERCENTILE_METHOD =
  'nearest-rank (rank = ceil(p/100 × n)); median = middle value or mean of the two middle values';

export interface LatencyStats {
  n: number;
  min: number | null;
  max: number | null;
  median: number | null;
  p95: number | null;
  /** Why median/p95 are missing, or a note that the sample is small. */
  note: string | null;
}

export const nearestRankPercentile = (
  sorted: readonly number[],
  p: number,
): number | null => {
  if (sorted.length === 0 || !(p > 0) || p > 100) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
};

export const medianOf = (sorted: readonly number[]): number | null => {
  const n = sorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const latencyStats = (values: readonly number[]): LatencyStats => {
  const sorted = values
    .filter(v => typeof v === 'number' && Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return {
      n,
      min: null,
      max: null,
      median: null,
      p95: null,
      note: 'no samples',
    };
  }
  const median = n >= MIN_SAMPLES_FOR_MEDIAN ? medianOf(sorted) : null;
  const p95 =
    n >= MIN_SAMPLES_FOR_P95 ? nearestRankPercentile(sorted, 95) : null;
  let note: string | null = null;
  if (n < MIN_SAMPLES_FOR_MEDIAN) {
    note = `n=${n}: too few for a median; min/max only`;
  } else if (n < MIN_SAMPLES_FOR_P95) {
    note = `n=${n}: small sample; p95 needs ≥${MIN_SAMPLES_FOR_P95}`;
  }
  return {n, min: sorted[0], max: sorted[n - 1], median, p95, note};
};
