import {useCallback, useSyncExternalStore} from 'react';

interface JobState<T> {
  busy: boolean;
  result: T | null;
  error: string;
  progress: number;
  statusText: string;
  startedAt: number | null;
}

export type StudyJobContext = AbortSignal & {
  isCancelled: () => boolean;
  signal: AbortSignal;
  setProgress: (progress: number, statusText?: string) => void;
};

const EMPTY: JobState<never> = {
  busy: false,
  result: null,
  error: '',
  progress: 0,
  statusText: '',
  startedAt: null,
};

const states = new Map<string, JobState<unknown>>();
const generations = new Map<string, number>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** Jobs survive page navigation, but never pretend to survive process death. */
export function useStudyJob<T>(owner: string, kind: string) {
  const key = `${owner}:${kind}`;
  const subscribe = useCallback((l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const snapshot = useCallback(
    () => (states.get(key) ?? EMPTY) as JobState<T>,
    [key],
  );
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  const consume = useCallback(() => {
    const current = states.get(key);
    if (current?.result !== null && current) {
      states.set(key, {...current, result: null});
      emit();
    }
  }, [key]);
  const clearError = useCallback(() => {
    const current = states.get(key);
    if (current?.error) {
      states.set(key, {...current, error: ''});
      emit();
    }
  }, [key]);
  const cancel = useCallback(() => {
    generations.set(key, (generations.get(key) ?? 0) + 1);
    const controller = controllers.get(key);
    if (controller) {
      controllers.delete(key);
      controller.abort();
    }
    states.set(key, {...EMPTY});
    emit();
  }, [key]);
  const setProgress = useCallback(
    (progress: number, statusText?: string) => {
      const current = states.get(key);
      if (current?.busy) {
        states.set(key, {
          ...current,
          progress,
          ...(statusText !== undefined ? {statusText} : {}),
        });
        emit();
      }
    },
    [key],
  );
  const run = useCallback(
    async (operation: (ctx: StudyJobContext) => Promise<T>) => {
      if (states.get(key)?.busy) return;
      const myGen = (generations.get(key) ?? 0) + 1;
      generations.set(key, myGen);
      const controller = new AbortController();
      controllers.set(key, controller);
      const isCancelled = () =>
        generations.get(key) !== myGen || controller.signal.aborted;
      const setJobProgress = (progress: number, statusText?: string) => {
        if (isCancelled()) return;
        const current = states.get(key);
        if (current?.busy) {
          states.set(key, {
            ...current,
            progress,
            ...(statusText !== undefined ? {statusText} : {}),
          });
          emit();
        }
      };
      states.set(key, {
        busy: true,
        result: null,
        error: '',
        progress: 0,
        statusText: '',
        startedAt: Date.now(),
      });
      emit();
      try {
        const ctx = Object.assign(controller.signal, {
          isCancelled,
          signal: controller.signal,
          setProgress: setJobProgress,
        }) as StudyJobContext;
        const result = await operation(ctx);
        if (isCancelled()) return;
        if (controllers.get(key) === controller) controllers.delete(key);
        states.set(key, {
          busy: false,
          result,
          error: '',
          progress: 3,
          statusText: '',
          startedAt: null,
        });
      } catch (e) {
        if (isCancelled()) return;
        if (controllers.get(key) === controller) controllers.delete(key);
        states.set(key, {
          busy: false,
          result: null,
          error: (e as Error).message || 'Please try again.',
          progress: 0,
          statusText: '',
          startedAt: null,
        });
      }
      emit();
    },
    [key],
  );
  return {...state, run, consume, clearError, cancel, setProgress};
}

export function resetStudyJobsForTests(): void {
  for (const controller of controllers.values()) {
    controller.abort();
  }
  controllers.clear();
  generations.clear();
  states.clear();
  emit();
}
