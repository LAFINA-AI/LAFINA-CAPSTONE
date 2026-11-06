/**
 * Exponentially Weighted Moving Average (EWMA) Module
 * Section 2.4.8: S_t = alpha * Y_t + (1 - alpha) * S_{t-1}
 *
 * Provides recency-sensitive time-series tracking for user behavior
 * (e.g. preparation latency, snooze duration drift) with O(1) computational
 * complexity and zero retraining overhead.
 */

import type {EwmaConfig, EwmaState} from './types';

export const DEFAULT_EWMA_ALPHA = 0.25;

/**
 * Validates and clamps alpha to the open interval (0, 1].
 */
export function clampAlpha(alpha: number): number {
  if (isNaN(alpha) || alpha <= 0) return 0.01;
  if (alpha > 1) return 1.0;
  return alpha;
}

/**
 * Computes a single EWMA update: S_t = alpha * Y_t + (1 - alpha) * S_{t-1}
 *
 * @param previousSmoothed Value of moving average at previous time period (S_{t-1})
 * @param observation Actual observation at time t (Y_t)
 * @param alpha Constant smoothing factor between 0 and 1
 */
export function stepEwma(
  previousSmoothed: number,
  observation: number,
  alpha = DEFAULT_EWMA_ALPHA,
): number {
  const safeAlpha = clampAlpha(alpha);
  return safeAlpha * observation + (1.0 - safeAlpha) * previousSmoothed;
}

/**
 * Stateful EWMA tracker for a single behavioral time series.
 */
export class EwmaTracker {
  private config: EwmaConfig;
  private state: EwmaState;

  constructor(config: Partial<EwmaConfig> = {}) {
    this.config = {
      alpha: clampAlpha(config.alpha ?? DEFAULT_EWMA_ALPHA),
      initialValue: config.initialValue ?? 0,
    };
    this.state = {
      value: this.config.initialValue,
      sampleCount: 0,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  /**
   * Restores state from persisted storage or snapshots.
   */
  static fromState(config: EwmaConfig, state: EwmaState): EwmaTracker {
    const tracker = new EwmaTracker(config);
    tracker.state = {...state};
    return tracker;
  }

  /**
   * Ingests a new observation Y_t and updates S_t.
   */
  observe(observation: number): number {
    if (this.state.sampleCount === 0) {
      // First observation initializes the series if initialValue was unset/zero
      this.state.value = observation;
    } else {
      this.state.value = stepEwma(
        this.state.value,
        observation,
        this.config.alpha,
      );
    }
    this.state.sampleCount += 1;
    this.state.lastUpdatedAt = new Date().toISOString();
    return this.state.value;
  }

  /** Current smoothed estimate S_t */
  getValue(): number {
    return this.state.value;
  }

  /** Total observations processed */
  getSampleCount(): number {
    return this.state.sampleCount;
  }

  /** Current snapshot state for database persistence */
  getState(): Readonly<EwmaState> {
    return {...this.state};
  }

  /** Resets tracker back to baseline */
  reset(initialValue?: number): void {
    const resetVal = initialValue ?? this.config.initialValue;
    this.state = {
      value: resetVal,
      sampleCount: 0,
      lastUpdatedAt: new Date().toISOString(),
    };
  }
}
