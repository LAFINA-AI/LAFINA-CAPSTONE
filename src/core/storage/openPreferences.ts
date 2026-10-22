import type {PreferencesRepository} from '../domain/preferences';
import {openLocalDatabase} from './openLocalDatabase';
import {createPreferencesRepository} from './preferencesRepository';

/** Lazily open app-private storage; failures propagate to the recoverable boot screen. */
export function openPreferences(): PreferencesRepository {
  return createPreferencesRepository(openLocalDatabase());
}
