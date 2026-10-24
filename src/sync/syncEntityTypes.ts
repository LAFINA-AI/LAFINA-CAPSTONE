import type { SyncEntityType } from '../storage/syncTypes';

export const LEGACY_SYNC_ENTITY_TYPES: readonly SyncEntityType[] = [
  'profile',
  'task',
  'event',
  'time_block',
  'reminder',
  'note',
  'custom_category',
];

export const PERSONAL_SYNC_ENTITY_TYPES: readonly SyncEntityType[] =
  LEGACY_SYNC_ENTITY_TYPES;

export const CLIENT_SYNC_ENTITY_TYPES: readonly SyncEntityType[] = [
  ...LEGACY_SYNC_ENTITY_TYPES,
];

export const AUTHORITATIVE_SYNC_ENTITY_TYPES: readonly SyncEntityType[] = [
  'task',
  'event',
  'time_block',
  'reminder',
  'note',
  'custom_category',
];

export const SINGLETON_SYNC_ENTITY_TYPES: readonly SyncEntityType[] = [
  'profile',
];

export const LAST_WRITE_WINS_ENTITY_TYPES: readonly SyncEntityType[] = [];

export const isSupportedSyncEntityType = (
  entityType: string,
): entityType is SyncEntityType =>
  (CLIENT_SYNC_ENTITY_TYPES as readonly string[]).includes(entityType);

export const effectiveSyncEntityTypes = (
  serverSupported: readonly string[] | null | undefined,
): SyncEntityType[] => {
  const server = new Set<string>(serverSupported ?? LEGACY_SYNC_ENTITY_TYPES);
  return CLIENT_SYNC_ENTITY_TYPES.filter((entityType) => server.has(entityType));
};

export const sameEntityTypeSet = (
  left: readonly string[],
  right: readonly string[],
): boolean => {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every((entityType) => rightSet.has(entityType))
  );
};
