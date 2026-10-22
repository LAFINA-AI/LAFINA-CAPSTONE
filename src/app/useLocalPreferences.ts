import {useCallback, useEffect, useRef, useState} from 'react';
import {defaultPreferences} from '../core/domain/preferences';
import type {
  Preferences,
  PreferencesRepository,
} from '../core/domain/preferences';

type State =
  | {kind: 'loading'}
  | {kind: 'error'}
  | {kind: 'ready'; preferences: Preferences};
export function useLocalPreferences(factory: () => PreferencesRepository) {
  const repository = useRef<PreferencesRepository | null>(null);
  const mounted = useRef(true);
  const [state, setState] = useState<State>({kind: 'loading'});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    async function load() {
      try {
        repository.current ??= factory();
        const preferences = await repository.current.load();
        let timezone = 'UTC';
        if (!preferences) {
          try {
            timezone =
              Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
          } catch {
            // Saved preferences never depend on a fresh runtime zone lookup.
          }
        }
        if (active) {
          setState({
            kind: 'ready',
            preferences: preferences ?? defaultPreferences(timezone),
          });
        }
      } catch {
        if (active) {
          setState({kind: 'error'});
        }
      }
    }
    void load();
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [factory, attempt]);

  const save = useCallback(async (preferences: Preferences) => {
    if (!repository.current) {
      throw new Error('Local preferences unavailable');
    }
    await repository.current.save(preferences);
    if (mounted.current) {
      setState({kind: 'ready', preferences});
    }
  }, []);
  const retry = useCallback(() => {
    setState({kind: 'loading'});
    setAttempt(value => value + 1);
  }, []);
  return {state, save, retry};
}
