import {useSyncExternalStore} from 'react';
import type {ConversationSnapshot} from '../../cloud/voiceConversation';

/** The live microphone and LAFINA's voice levels, 0..1. */
export interface CallLevels {
  level: number;
  outputLevel: number;
}

/**
 * Audio levels change up to 10 times a second during a call. They are kept
 * out of the call snapshot that React holds, so only the avatar and the
 * waveform redraw for them, not the whole call screen.
 */
export interface CallMeter {
  get: () => CallLevels;
  subscribe: (listener: () => void) => () => void;
}

export interface WritableCallMeter extends CallMeter {
  set: (levels: CallLevels) => void;
}

const SILENT: CallLevels = {level: 0, outputLevel: 0};

export function createCallMeter(): WritableCallMeter {
  let current = SILENT;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: levels => {
      if (
        levels.level === current.level &&
        levels.outputLevel === current.outputLevel
      )
        return;
      current = levels;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** The meter's reading of a controller snapshot. */
export const levelsOf = (snapshot: ConversationSnapshot): CallLevels => ({
  level: snapshot.level,
  outputLevel: snapshot.outputLevel ?? 0,
});

/** True when two snapshots differ in nothing but their audio levels. */
export function differsOnlyInLevels(
  previous: ConversationSnapshot,
  next: ConversationSnapshot,
): boolean {
  if (previous === next) return true;
  for (const key of Object.keys(next) as (keyof ConversationSnapshot)[]) {
    if (key === 'level' || key === 'outputLevel') continue;
    if (previous[key] !== next[key]) return false;
  }
  for (const key of Object.keys(previous) as (keyof ConversationSnapshot)[]) {
    if (!(key in next)) return false;
  }
  return true;
}

/**
 * Routes one controller snapshot: levels go to the meter, everything else
 * to React state (kept as is when only the levels moved).
 */
export function routeSnapshot(
  meter: WritableCallMeter,
  setSnapshot: (
    update: (previous: ConversationSnapshot) => ConversationSnapshot,
  ) => void,
  next: ConversationSnapshot,
): void {
  meter.set(levelsOf(next));
  setSnapshot(previous =>
    differsOnlyInLevels(previous, next) ? previous : next,
  );
}

/** Subscribes a component to the live levels alone. */
export function useCallLevels(meter: CallMeter): CallLevels {
  return useSyncExternalStore(meter.subscribe, meter.get, meter.get);
}
