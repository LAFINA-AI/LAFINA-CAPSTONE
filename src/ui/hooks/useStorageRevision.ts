import {useCallback, useMemo, useSyncExternalStore} from 'react';
import {db} from '../../storage/database';

/** Only committed changes to the requested tables invalidate a screen. */
export function useStorageRevision(tables: readonly string[]): number {
  const key = tables.join(',');
  const list = useMemo(() => (key ? key.split(',') : []), [key]);
  const snapshot = useCallback(() => db.getDataRevision(list), [list]);
  return useSyncExternalStore(db.subscribeDataChanges, snapshot, snapshot);
}
