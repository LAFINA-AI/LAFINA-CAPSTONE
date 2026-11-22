/**
 * The Pomodoro timer outside its page (ADR-041), so LAFINA can read it,
 * pause it, or resume it during a call, and the page and the call never
 * disagree. The page uses the same `applyPomodoro` for its own buttons.
 *
 * The timer is a persisted deadline (owner-scoped skill state) plus the
 * native `LafinaFocus` notification. Saving comes first: a failed local
 * write never starts a notification the screen cannot show.
 */
import {NativeModules, PermissionsAndroid, Platform} from 'react-native';
import {readSkillState, writeSkillState} from './skillsState';
import {newPomodoro, reconcilePomodoro} from './studyLogic';
import type {PomodoroState} from './studyLogic';

interface FocusNative {
  schedule: (
    owner: string,
    deadline: number,
    focus: boolean,
    silence: boolean,
  ) => Promise<boolean>;
  cancel: () => Promise<boolean>;
}

const native = (): FocusNative | undefined =>
  NativeModules.LafinaFocus as FocusNative | undefined;

const listeners = new Map<string, Set<() => void>>();

const notify = (owner: string): void => {
  for (const listener of Array.from(listeners.get(owner) ?? [])) listener();
};

/** The page re-reads the timer when the call changed it. */
export const subscribePomodoro = (
  owner: string,
  listener: () => void,
): (() => void) => {
  let set = listeners.get(owner);
  if (!set) {
    set = new Set();
    listeners.set(owner, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set?.size === 0) listeners.delete(owner);
  };
};

/** The timer as it is now (a finished session is counted, not saved). */
export const readPomodoro = (owner: string, now = Date.now()): PomodoroState =>
  reconcilePomodoro(readSkillState(owner, 'pomodoro', newPomodoro()), now);

export interface PomodoroApplyResult {
  state: PomodoroState;
  /** Something the student should know, the timer still runs. */
  notice?: string;
  /** The timer was saved but its notification could not be set up. */
  error?: string;
}

/**
 * Saves a timer state and sets up (or cancels) its notification. `starting`
 * sets the deadline from the remaining time. Throws only when the local
 * save itself failed (nothing was started).
 */
export const applyPomodoro = async (
  owner: string,
  draft: PomodoroState,
  options: {starting?: boolean} = {},
): Promise<PomodoroApplyResult> => {
  let next = draft;
  writeSkillState(owner, 'pomodoro', next);
  let savedLocal = true;
  let notice = '';
  try {
    if (options.starting || next.deadline) {
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED)
          notice = 'Notifications are off. The visual timer still works.';
      }
      if (options.starting) {
        savedLocal = false;
        next = {
          ...next,
          deadline: Date.now() + Math.max(1, next.remaining) * 1000,
        };
        writeSkillState(owner, 'pomodoro', next);
        savedLocal = true;
      }
      if (next.deadline) {
        const focus = native();
        const exact = await focus?.schedule(
          owner,
          next.deadline,
          next.mode === 'Focus 25',
          next.silence,
        );
        if (exact === false)
          notice =
            'Exact alarms are not allowed. The session notification may arrive late.';
        if (!focus)
          notice = 'Background notifications are unavailable in this build.';
      }
    } else {
      await native()?.cancel();
    }
    notify(owner);
    return {state: next, ...(notice ? {notice} : {})};
  } catch (e) {
    if (!savedLocal) throw e;
    notify(owner);
    return {
      state: next,
      error: `Timer saved; notification setup failed. ${(e as Error).message}`,
    };
  }
};

/** Pauses a running session. Returns null when nothing was running. */
export const pausePomodoro = async (
  owner: string,
): Promise<PomodoroState | null> => {
  const current = readPomodoro(owner);
  if (!current.deadline) return null;
  const result = await applyPomodoro(owner, {...current, deadline: null});
  return result.state;
};

/** Resumes a paused session where it stopped. Null when one is running. */
export const resumePomodoro = async (
  owner: string,
): Promise<PomodoroState | null> => {
  const current = readPomodoro(owner);
  if (current.deadline) return null;
  const result = await applyPomodoro(
    owner,
    {...current, deadline: null},
    {starting: true},
  );
  return result.state;
};

/** Whole minutes left in a running session, or null when none runs. */
export const pomodoroMinutesLeft = (
  state: PomodoroState,
  now = Date.now(),
): number | null =>
  state.deadline === null
    ? null
    : Math.max(0, Math.ceil((state.deadline - now) / 60000));
