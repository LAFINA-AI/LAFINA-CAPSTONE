import {localSettingsStore} from '../../storage/localSettingsStore';
import {DEVICE_SETTINGS_OWNER} from '../../cloud/backendSelection';
import type {BenchmarkRun} from './benchmarkRunner';

const RESULTS_KEY = 'debug.benchmark_runs';
/** Runs kept on the phone; older ones are dropped. */
export const MAX_SAVED_RUNS = 5;

/**
 * Saved benchmark runs, kept apart from personal data (a device-level
 * Developer setting). Clearing them touches nothing else.
 */
export const benchmarkResultsStore = {
  list(): BenchmarkRun[] {
    try {
      const raw = localSettingsStore.get(DEVICE_SETTINGS_OWNER, RESULTS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as BenchmarkRun[]) : [];
    } catch {
      return [];
    }
  },
  latest(): BenchmarkRun | null {
    return benchmarkResultsStore.list()[0] ?? null;
  },
  save(run: BenchmarkRun): boolean {
    const runs = [
      run,
      ...benchmarkResultsStore.list().filter(r => r.runId !== run.runId),
    ].slice(0, MAX_SAVED_RUNS);
    try {
      return localSettingsStore.set(
        DEVICE_SETTINGS_OWNER,
        RESULTS_KEY,
        JSON.stringify(runs),
      );
    } catch {
      return false;
    }
  },
  clear(): boolean {
    return localSettingsStore.set(DEVICE_SETTINGS_OWNER, RESULTS_KEY, '[]');
  },
};
