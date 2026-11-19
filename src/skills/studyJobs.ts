import {useCallback, useSyncExternalStore} from 'react';
interface JobState<T> {
  busy: boolean;
  result: T | null;
  error: string;
  progress: number;
}
const EMPTY: JobState<never> = {
  busy: false,
  result: null,
  error: '',
  progress: 0,
};
const states = new Map<string, JobState<unknown>>();
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
  const setProgress = useCallback(
    (progress: number) => {
      const current = states.get(key);
      if (current?.busy) {
        states.set(key, {...current, progress});
        emit();
      }
    },
    [key],
  );
  const run = async (operation: () => Promise<T>) => {
    if (states.get(key)?.busy) return;
    states.set(key, {busy: true, result: null, error: '', progress: 0});
    emit();
    try {
      const result = await operation();
      states.set(key, {busy: false, result, error: '', progress: 3});
    } catch (e) {
      states.set(key, {
        busy: false,
        result: null,
        error: (e as Error).message || 'Please try again.',
        progress: 0,
      });
    }
    emit();
  };
  return {...state, run, consume, setProgress};
}
