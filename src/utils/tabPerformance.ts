import {db} from '../storage/database';
import {NativeModules} from 'react-native';

let owner: string | null = null;
const visited = new Set<string>(['dashboard']);
let pending: {
  tab: string;
  started: number;
  warm: boolean;
  queries: number;
} | null = null;
const enabled = () =>
  NativeModules.CapstoneBuild?.performanceHarnessEnabled === true;

/** Test-build telemetry only. Contains tab names/timings, never student data. */
export function beginTabSwitch(tab: string, userId: string | null): void {
  if (!enabled()) return;
  if (owner !== userId) {
    owner = userId;
    visited.clear();
    visited.add('dashboard');
  }
  pending = {
    tab,
    started: performance.now(),
    warm: visited.has(tab),
    queries: db.getQueryCount(),
  };
}

export function finishTabSwitch(tab: string): void {
  if (!enabled() || pending?.tab !== tab) return;
  const sample = pending;
  pending = null;
  visited.add(tab);
  const jsCommitMs = performance.now() - sample.started;
  requestAnimationFrame(() => {
    console.info(
      '[TabPerformance]',
      JSON.stringify({
        tab,
        warm: sample.warm,
        jsCommitMs,
        queriesThroughAnimationFrame: db.getQueryCount() - sample.queries,
        nextAnimationFrameMs: performance.now() - sample.started,
      }),
    );
  });
}
