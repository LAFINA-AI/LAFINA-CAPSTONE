import type {SyncEntityType} from '../storage/syncTypes';

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

/** The planner types every request declares. */
export const CLIENT_SYNC_ENTITY_TYPES: readonly SyncEntityType[] = [
  ...LEGACY_SYNC_ENTITY_TYPES,
];

/**
 * Chat history (ADR-040). Declared only while the account's chat sync is on
 * and the server has listed both types, so an older server never sees them.
 */
export const CHAT_SYNC_ENTITY_TYPES: readonly SyncEntityType[] = [
  'chat_session',
  'chat_message',
];

export const AUTHORITATIVE_SYNC_ENTITY_TYPES: readonly SyncEntityType[] = [
  'task',
  'event',
  'time_block',
  'reminder',
  'note',
  'custom_category',
];

/** Chat is authoritative too, but only when it was declared. */
export const CHAT_AUTHORITATIVE_SYNC_ENTITY_TYPES: readonly SyncEntityType[] =
  CHAT_SYNC_ENTITY_TYPES;

export const SINGLETON_SYNC_ENTITY_TYPES: readonly SyncEntityType[] = [
  'profile',
];

/** Sent without a baseVersion: the newest write wins, no conflict prompt. */
export const LAST_WRITE_WINS_ENTITY_TYPES: readonly SyncEntityType[] = [
  ...CHAT_SYNC_ENTITY_TYPES,
];

export const isChatSyncEntityType = (entityType: string): boolean =>
  (CHAT_SYNC_ENTITY_TYPES as readonly string[]).includes(entityType);

export const isSupportedSyncEntityType = (
  entityType: string,
): entityType is SyncEntityType =>
  (CLIENT_SYNC_ENTITY_TYPES as readonly string[]).includes(entityType);

/**
 * The types one request declares: the planner types, plus chat when the
 * account syncs chat and the server already listed both chat types.
 */
export const declaredSyncEntityTypes = (
  chatSyncEnabled: boolean,
  serverSupported: readonly string[] | null | undefined,
): SyncEntityType[] => {
  const server = new Set<string>(serverSupported ?? []);
  const withChat =
    chatSyncEnabled &&
    CHAT_SYNC_ENTITY_TYPES.every(entityType => server.has(entityType));
  return withChat
    ? [...CLIENT_SYNC_ENTITY_TYPES, ...CHAT_SYNC_ENTITY_TYPES]
    : [...CLIENT_SYNC_ENTITY_TYPES];
};

export const effectiveSyncEntityTypes = (
  serverSupported: readonly string[] | null | undefined,
  declared: readonly SyncEntityType[] = CLIENT_SYNC_ENTITY_TYPES,
): SyncEntityType[] => {
  const server = new Set<string>(serverSupported ?? LEGACY_SYNC_ENTITY_TYPES);
  return declared.filter(entityType => server.has(entityType));
};

/** Authoritative types of a request whose effective types are `effective`. */
export const authoritativeSyncEntityTypes = (
  effective: readonly SyncEntityType[],
): SyncEntityType[] =>
  [
    ...AUTHORITATIVE_SYNC_ENTITY_TYPES,
    ...CHAT_AUTHORITATIVE_SYNC_ENTITY_TYPES,
  ].filter(entityType => effective.includes(entityType));

export const sameEntityTypeSet = (
  left: readonly string[],
  right: readonly string[],
): boolean => {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every(entityType => rightSet.has(entityType))
  );
};
