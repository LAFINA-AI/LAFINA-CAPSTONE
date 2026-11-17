import {useCallback, useSyncExternalStore} from 'react';
import {db} from '../../storage/database';

/** Only committed changes to the requested tables invalidate a screen. */
export function useStorageRevision(tables: readonly string[]): number {
  const key = tables.join(',');
  const snapshot = useCallback(() => db.getDataRevision(key.split(',')), [key]);
  return useSyncExternalStore(db.subscribeDataChanges, snapshot, snapshot);
}
