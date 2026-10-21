import {open} from '@op-engineering/op-sqlite';
import type {PreferencesRepository} from '../domain/preferences';
import {createPreferencesRepository} from './preferencesRepository';

/** Lazily open app-private storage; failures propagate to the recoverable boot screen. */
export function openPreferences(): PreferencesRepository {
  const db = open({name: 'lafina-capstone.sqlite'});
  try {
    return createPreferencesRepository({
      execute: (sql, params) => db.executeSync(sql, params).rows,
    });
  } catch (error) {
    db.close();
    throw error;
  }
}
