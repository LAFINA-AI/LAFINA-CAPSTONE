import {accountLinkService} from '../cloud/accountLinkService';
import {cloudClient} from '../cloud/cloudClient';
import {reconcileReminderDelivery} from '../scheduler';
import {runAttachmentCleanup} from '../storage/attachmentCleanup';
import {CHAT_LIMIT_REASON, chatSyncStore} from '../storage/chatSyncStore';
import {db, DatabaseTransaction} from '../storage/database';
import {normalizeAvatarSeed} from '../storage/profileSyncPayload';
import {syncConflictStore} from '../storage/syncConflictStore';
import {syncMetadataStore} from '../storage/syncMetadataStore';
import {OutboxItem, syncOutboxStore} from '../storage/syncOutboxStore';
import {syncStateStore} from '../storage/syncStateStore';
import type {
  SyncEntityType,
  SyncOperation,
  SyncPayload,
} from '../storage/syncTypes';
import {userStore} from '../storage/userStore';
import {generateId} from '../utils';
import {emitChatRemoteChanged} from './chatSyncEvents';
import {
  authoritativeSyncEntityTypes,
  declaredSyncEntityTypes,
  effectiveSyncEntityTypes,
  isChatSyncEntityType,
  LAST_WRITE_WINS_ENTITY_TYPES,
  sameEntityTypeSet,
  SINGLETON_SYNC_ENTITY_TYPES,
} from './syncEntityTypes';
import {syncState} from './syncState';

export type {SyncEntityType} from '../storage/syncTypes';

interface MutationResult {
  mutationId: string;
  entityType: SyncEntityType;
  entityId: string;
  status: 'accepted' | 'rejected';
  reason?: string;
  serverVersion?: number;
  serverPayload?: Record<string, unknown>;
}

interface SyncChange {
  changeId: number;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  version: number;
  payload: Record<string, unknown>;
  updatedAt: string;
  deletedAt?: string | null;
}

interface SnapshotPosition {
  entityType: SyncEntityType;
  entityId: string;
}

interface SnapshotPrunePolicy {
  preserveOutboxStatuses: Array<'pending' | 'in_progress' | 'failed'>;
  requireExistingSyncMetadata: boolean;
}

interface SnapshotPage {
  boundaryCursor: number;
  items: SyncChange[];
  nextAfter: SnapshotPosition | null;
  hasMore: boolean;
  complete: boolean;
  authoritativeEntityTypes: SyncEntityType[];
  prunePolicy: SnapshotPrunePolicy;
}

interface SnapshotRequestPayload {
  boundaryCursor?: number;
  after?: SnapshotPosition;
}

export interface SyncBatchResponsePayload {
  accepted: MutationResult[];
  rejected: MutationResult[];
  changes: SyncChange[];
  nextCursor: number;
  hasMore: boolean;
  resetRequired: boolean;
  serverTime: string;
  snapshot?: SnapshotPage | null;
  supportedEntityTypes?: string[];
}

interface OutboundMutation {
  mutationId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  clientUpdatedAt: string;
  payload: SyncPayload;
  baseVersion?: number;
}

interface ApplyPageResult {
  reminderTextUpdated: boolean;
}

interface AppliedChange {
  reminderTextUpdated: boolean;
  /** False when a chat row was kept because this phone never synced it. */
  recordMetadata: boolean;
  /** A chat row of this phone changed. */
  chatChanged: boolean;
  /** A chat delete removed rows whose files now wait for cleanup. */
  chatRemoved: boolean;
}

const ACCOUNT_SCOPE = 'account';
const serversWithoutProfileAvatarSeed = new Set<string>();
const pendingAvatarSeedCompatRetries = new Map<string, string>();

const activeSyncServerKey = (): string => cloudClient.getBaseUrl();

const stripAvatarSeed = (payload: SyncPayload): SyncPayload => {
  if (!Object.prototype.hasOwnProperty.call(payload, 'avatar_seed')) {
    return payload;
  }
  const copy: SyncPayload = {...payload};
  delete copy.avatar_seed;
  return copy;
};

const isProfileAvatarSeedValidationRejection = (
  result: MutationResult,
  sent: OutboundMutation,
): boolean => {
  if (result.entityType !== 'profile') return false;
  if (!Object.prototype.hasOwnProperty.call(sent.payload, 'avatar_seed')) {
    return false;
  }
  const reason = (result.reason ?? '').toLowerCase();
  if (!reason || reason.includes('conflict')) return false;
  return (
    reason.includes('invalid_payload') ||
    reason.includes('validation') ||
    reason.includes('extra') ||
    reason.includes('avatar_seed') ||
    reason.includes('schema')
  );
};
const OUTBOX_BATCH_SIZE = 100;
const MAX_SYNC_REQUESTS = 100;
const MAX_BATCH_BYTES = 768 * 1024;
const OUTBOX_PRESERVE_STATUSES = ['pending', 'in_progress', 'failed'];

const utf8Length = (value: string): number => {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
};

let inFlightSync: Promise<void> | null = null;
let followUpSyncRequested = false;
let retryAttempt = 0;
let remoteChangesApplied = 0;

type RemoteChangeListener = (userId: string, changeCount: number) => void;
const remoteChangeListeners = new Set<RemoteChangeListener>();

const notifyRemoteChanges = (userId: string, changeCount: number): void => {
  if (changeCount <= 0) return;
  for (const listener of remoteChangeListeners) {
    try {
      listener(userId, changeCount);
    } catch (error) {
      console.warn('[SyncWorker] Remote change listener error:', error);
    }
  }
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Sync failed';

const requireString = (
  payload: Record<string, unknown>,
  key: string,
): string => {
  const value = payload[key];
  if (typeof value !== 'string') {
    throw new Error(`Sync payload field "${key}" must be a string.`);
  }
  return value;
};

const stringOrDefault = (
  payload: Record<string, unknown>,
  key: string,
  fallback: string,
): string => {
  const value = payload[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    throw new Error(`Sync payload field "${key}" must be a string.`);
  }
  return value;
};

const nullableString = (
  payload: Record<string, unknown>,
  key: string,
): string | null => {
  const value = payload[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`Sync payload field "${key}" must be a string or null.`);
  }
  return value;
};

const booleanOrDefault = (
  payload: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean => {
  const value = payload[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new Error(`Sync payload field "${key}" must be a boolean.`);
  }
  return value;
};

const integerOrDefault = (
  payload: Record<string, unknown>,
  key: string,
  fallback: number,
): number => {
  const value = payload[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Sync payload field "${key}" must be an integer.`);
  }
  return value;
};

const normalizeTaskPriority = (
  payload: Record<string, unknown>,
): 'High' | 'Medium' | 'Low' => {
  const value = stringOrDefault(payload, 'priority', 'Medium').toLowerCase();
  switch (value) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      throw new Error('Sync payload field "priority" is not canonical.');
  }
};

const normalizeNoteTags = (payload: Record<string, unknown>): string => {
  const value = stringOrDefault(payload, 'tags', '[]').trim();
  if (!value) return '[]';
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.every(entry => typeof entry === 'string')
    ) {
      return JSON.stringify(parsed);
    }
  } catch {
    // Legacy comma-delimited cloud data is normalized below.
  }
  return JSON.stringify(
    value
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean),
  );
};

const normalizeStudyPeakHours = (value: string): string => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.every(entry => typeof entry === 'string')
    ) {
      return JSON.stringify(parsed);
    }
  } catch {
    // The backend also accepts a single value such as "morning".
  }

  return JSON.stringify(
    value
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean),
  );
};

const assertEntityOwnership = (
  tx: DatabaseTransaction,
  table: string,
  entityId: string,
  localUserId: string,
): void => {
  const result = tx.executeSync(`SELECT user_id FROM ${table} WHERE id = ?`, [
    entityId,
  ]);
  const owner = result.rows?.[0]?.user_id;
  if (owner === 'cloud') {
    tx.executeSync(
      `UPDATE ${table} SET user_id = ? WHERE id = ? AND user_id = 'cloud'`,
      [localUserId, entityId],
    );
    return;
  }
  if (typeof owner === 'string' && owner !== localUserId) {
    throw new Error(
      `Refusing to apply ${table} change ${entityId} to another local account.`,
    );
  }
};

const applyProfile = (
  tx: DatabaseTransaction,
  localUserId: string,
  change: SyncChange,
): void => {
  if (change.operation === 'delete') return;

  const payload = change.payload;
  const username = requireString(payload, 'username');
  const wakeTime = stringOrDefault(payload, 'wake_time', '07:00');
  const sleepTime = stringOrDefault(payload, 'sleep_time', '23:00');
  const studyPeakHours = normalizeStudyPeakHours(
    stringOrDefault(payload, 'study_peak_hours', 'morning'),
  );
  const busiestDay = stringOrDefault(payload, 'busiest_day', 'Monday');
  const reminderLeadMinutes = integerOrDefault(
    payload,
    'reminder_lead_minutes',
    15,
  );
  const snoozeTendency = stringOrDefault(
    payload,
    'snooze_tendency',
    'snooze_once',
  );
  const weeklyClassCount = stringOrDefault(
    payload,
    'weekly_class_count',
    '4-6',
  );
  const longestClassGap = stringOrDefault(
    payload,
    'longest_class_gap',
    '1 hour',
  );
  const hasAvatarSeedField = Object.prototype.hasOwnProperty.call(
    payload,
    'avatar_seed',
  );
  const incomingAvatarSeed = hasAvatarSeedField
    ? normalizeAvatarSeed(nullableString(payload, 'avatar_seed'))
    : undefined;
  const userUpdate = hasAvatarSeedField
    ? tx.executeSync(
        `UPDATE users
         SET username = ?, time_format_24h = ?, week_starts_monday = ?,
             dark_mode = ?, avatar_seed = ?, updated_at = ?
         WHERE id = ?`,
        [
          username,
          0,
          booleanOrDefault(payload, 'week_starts_monday', false) ? 1 : 0,
          booleanOrDefault(payload, 'dark_mode', false) ? 1 : 0,
          incomingAvatarSeed ?? null,
          change.updatedAt,
          localUserId,
        ],
      )
    : tx.executeSync(
        `UPDATE users
         SET username = ?, time_format_24h = ?, week_starts_monday = ?,
             dark_mode = ?, updated_at = ?
         WHERE id = ?`,
        [
          username,
          0,
          booleanOrDefault(payload, 'week_starts_monday', false) ? 1 : 0,
          booleanOrDefault(payload, 'dark_mode', false) ? 1 : 0,
          change.updatedAt,
          localUserId,
        ],
      );
  if (userUpdate.rowsAffected !== 1) {
    throw new Error('The active local user disappeared during sync.');
  }

  const existingPreferences = tx.executeSync(
    'SELECT id FROM user_preferences WHERE user_id = ?',
    [localUserId],
  ).rows?.[0];
  if (existingPreferences) {
    tx.executeSync(
      `UPDATE user_preferences
       SET wake_time = ?, sleep_time = ?, study_peak_hours = ?, busiest_day = ?,
           reminder_lead_minutes = ?, snooze_tendency = ?, weekly_class_count = ?,
           longest_class_gap = ?, updated_at = ?
       WHERE user_id = ?`,
      [
        wakeTime,
        sleepTime,
        studyPeakHours,
        busiestDay,
        reminderLeadMinutes,
        snoozeTendency,
        weeklyClassCount,
        longestClassGap,
        change.updatedAt,
        localUserId,
      ],
    );
    return;
  }

  tx.executeSync(
    `INSERT INTO user_preferences (
       id, user_id, wake_time, sleep_time, study_peak_hours, busiest_day,
       reminder_lead_minutes, snooze_tendency, weekly_class_count,
       longest_class_gap, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `sync_pref_${localUserId}`,
      localUserId,
      wakeTime,
      sleepTime,
      studyPeakHours,
      busiestDay,
      reminderLeadMinutes,
      snoozeTendency,
      weeklyClassCount,
      longestClassGap,
      change.updatedAt,
      change.updatedAt,
    ],
  );
};

const applyTask = (
  tx: DatabaseTransaction,
  localUserId: string,
  change: SyncChange,
): void => {
  assertEntityOwnership(tx, 'tasks', change.entityId, localUserId);
  const payload = change.payload;
  tx.executeSync(
    `INSERT INTO tasks (
       id, user_id, title, due_date, due_time, is_completed, priority,
       category, notes, recurrence_rule, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, due_date = excluded.due_date,
       due_time = excluded.due_time, is_completed = excluded.is_completed,
       priority = excluded.priority, category = excluded.category,
       notes = excluded.notes, recurrence_rule = excluded.recurrence_rule,
       updated_at = excluded.updated_at, deleted_at = NULL`,
    [
      change.entityId,
      localUserId,
      requireString(payload, 'title'),
      nullableString(payload, 'due_date'),
      nullableString(payload, 'due_time'),
      booleanOrDefault(payload, 'is_completed', false) ? 1 : 0,
      normalizeTaskPriority(payload),
      stringOrDefault(payload, 'category', 'General'),
      nullableString(payload, 'notes'),
      nullableString(payload, 'recurrence_rule'),
      change.updatedAt,
      change.updatedAt,
    ],
  );
};

const applyEvent = (
  tx: DatabaseTransaction,
  localUserId: string,
  change: SyncChange,
): void => {
  assertEntityOwnership(tx, 'events', change.entityId, localUserId);
  const payload = change.payload;
  tx.executeSync(
    `INSERT INTO events (
       id, user_id, title, date, start_time, end_time, location,
       linked_calendar_block, recurrence_rule, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, date = excluded.date,
       start_time = excluded.start_time, end_time = excluded.end_time,
       location = excluded.location,
       linked_calendar_block = excluded.linked_calendar_block,
       recurrence_rule = excluded.recurrence_rule,
       updated_at = excluded.updated_at, deleted_at = NULL`,
    [
      change.entityId,
      localUserId,
      requireString(payload, 'title'),
      requireString(payload, 'date'),
      requireString(payload, 'start_time'),
      requireString(payload, 'end_time'),
      nullableString(payload, 'location'),
      nullableString(payload, 'linked_calendar_block'),
      nullableString(payload, 'recurrence_rule'),
      change.updatedAt,
      change.updatedAt,
    ],
  );
};

const applyTimeBlock = (
  tx: DatabaseTransaction,
  localUserId: string,
  change: SyncChange,
): void => {
  assertEntityOwnership(tx, 'time_blocks', change.entityId, localUserId);
  const payload = change.payload;
  tx.executeSync(
    `INSERT INTO time_blocks (
       id, user_id, title, date, start_time, end_time, color, category,
       notes, recurrence_rule, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, date = excluded.date,
       start_time = excluded.start_time, end_time = excluded.end_time,
       color = excluded.color, category = excluded.category,
       notes = excluded.notes, recurrence_rule = excluded.recurrence_rule,
       updated_at = excluded.updated_at, deleted_at = NULL`,
    [
      change.entityId,
      localUserId,
      requireString(payload, 'title'),
      requireString(payload, 'date'),
      requireString(payload, 'start_time'),
      requireString(payload, 'end_time'),
      requireString(payload, 'color'),
      requireString(payload, 'category'),
      nullableString(payload, 'notes'),
      nullableString(payload, 'recurrence_rule'),
      change.updatedAt,
      change.updatedAt,
    ],
  );
};

const applyReminder = (
  tx: DatabaseTransaction,
  localUserId: string,
  change: SyncChange,
): void => {
  assertEntityOwnership(tx, 'reminders', change.entityId, localUserId);
  const payload = change.payload;
  tx.executeSync(
    `INSERT INTO reminders (
       id, user_id, task, description, scheduled_at, trigger_at, status,
       snooze_count, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       task = excluded.task, description = excluded.description,
       scheduled_at = excluded.scheduled_at, trigger_at = excluded.trigger_at,
       status = excluded.status, snooze_count = excluded.snooze_count,
       precast_audio_path = CASE
         WHEN reminders.task <> excluded.task THEN NULL
         ELSE reminders.precast_audio_path
       END,
       updated_at = excluded.updated_at, deleted_at = NULL`,
    [
      change.entityId,
      localUserId,
      requireString(payload, 'task'),
      nullableString(payload, 'description'),
      requireString(payload, 'scheduled_at'),
      requireString(payload, 'trigger_at'),
      stringOrDefault(payload, 'status', 'pending'),
      integerOrDefault(payload, 'snooze_count', 0),
      change.updatedAt,
      change.updatedAt,
    ],
  );
};

const applyNote = (
  tx: DatabaseTransaction,
  localUserId: string,
  change: SyncChange,
): void => {
  assertEntityOwnership(tx, 'notes', change.entityId, localUserId);
  const payload = change.payload;
  tx.executeSync(
    `INSERT INTO notes (
       id, user_id, title, body, is_pinned, tags, category,
       is_voice_transcribed, sort_order, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, body = excluded.body,
       is_pinned = excluded.is_pinned, tags = excluded.tags,
       category = excluded.category,
       is_voice_transcribed = excluded.is_voice_transcribed,
       sort_order = excluded.sort_order, updated_at = excluded.updated_at,
       deleted_at = NULL`,
    [
      change.entityId,
      localUserId,
      requireString(payload, 'title'),
      requireString(payload, 'body'),
      booleanOrDefault(payload, 'is_pinned', false) ? 1 : 0,
      normalizeNoteTags(payload),
      stringOrDefault(payload, 'category', 'General'),
      booleanOrDefault(payload, 'is_voice_transcribed', false) ? 1 : 0,
      integerOrDefault(payload, 'sort_order', 0),
      change.updatedAt,
      change.updatedAt,
    ],
  );
};

const applyCustomCategory = (
  tx: DatabaseTransaction,
  localUserId: string,
  change: SyncChange,
): void => {
  assertEntityOwnership(tx, 'custom_categories', change.entityId, localUserId);
  const payload = change.payload;
  tx.executeSync(
    `INSERT INTO custom_categories (
       id, user_id, name, color, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, color = excluded.color,
       updated_at = excluded.updated_at, deleted_at = NULL`,
    [
      change.entityId,
      localUserId,
      requireString(payload, 'name'),
      requireString(payload, 'color'),
      change.updatedAt,
      change.updatedAt,
    ],
  );
};

const getPersonalEntityTable = (entityType: SyncEntityType): string | null => {
  switch (entityType) {
    case 'task':
      return 'tasks';
    case 'event':
      return 'events';
    case 'time_block':
      return 'time_blocks';
    case 'reminder':
      return 'reminders';
    case 'note':
      return 'notes';
    case 'custom_category':
      return 'custom_categories';
    case 'profile':
    default:
      return null;
  }
};

const applyDelete = (
  tx: DatabaseTransaction,
  localUserId: string,
  change: SyncChange,
): void => {
  if (SINGLETON_SYNC_ENTITY_TYPES.includes(change.entityType)) {
    throw new Error(
      `Cloud ${change.entityType} deletion cannot be applied to an offline local account.`,
    );
  }

  const table = getPersonalEntityTable(change.entityType);
  if (!table) {
    throw new Error(`Unsupported sync entity type: ${change.entityType}`);
  }
  assertEntityOwnership(tx, table, change.entityId, localUserId);
  const deletedAt = change.deletedAt ?? change.updatedAt;
  tx.executeSync(
    `UPDATE ${table}
     SET deleted_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [deletedAt, change.updatedAt, change.entityId, localUserId],
  );
};

const applyChatChange = (
  tx: DatabaseTransaction,
  localUserId: string,
  change: SyncChange,
): AppliedChange => {
  const entityType = change.entityType as 'chat_session' | 'chat_message';
  if (change.operation === 'delete') {
    const result = chatSyncStore.applyRemoteDelete(
      tx,
      localUserId,
      entityType,
      change.entityId,
    );
    return {
      reminderTextUpdated: false,
      recordMetadata: result.recordMetadata,
      chatChanged: result.removed,
      chatRemoved: result.removed,
    };
  }
  const applied =
    entityType === 'chat_session'
      ? chatSyncStore.applyRemoteSession(
          tx,
          localUserId,
          change.entityId,
          change.payload,
          change.updatedAt,
        )
      : chatSyncStore.applyRemoteMessage(
          tx,
          localUserId,
          change.entityId,
          change.payload,
          change.updatedAt,
        );
  return {
    reminderTextUpdated: false,
    recordMetadata: true,
    chatChanged: applied,
    chatRemoved: false,
  };
};

const applyChange = (
  tx: DatabaseTransaction,
  localUserId: string,
  change: SyncChange,
): AppliedChange => {
  if (isChatSyncEntityType(change.entityType)) {
    return applyChatChange(tx, localUserId, change);
  }
  const planner = (reminderTextUpdated: boolean): AppliedChange => ({
    reminderTextUpdated,
    recordMetadata: true,
    chatChanged: false,
    chatRemoved: false,
  });
  if (change.operation === 'delete') {
    applyDelete(tx, localUserId, change);
    return planner(change.entityType === 'reminder');
  }

  switch (change.entityType) {
    case 'profile':
      applyProfile(tx, localUserId, change);
      break;
    case 'task':
      applyTask(tx, localUserId, change);
      break;
    case 'event':
      applyEvent(tx, localUserId, change);
      break;
    case 'time_block':
      applyTimeBlock(tx, localUserId, change);
      break;
    case 'reminder':
      applyReminder(tx, localUserId, change);
      return planner(true);
    case 'note':
      applyNote(tx, localUserId, change);
      break;
    case 'custom_category':
      applyCustomCategory(tx, localUserId, change);
      break;
    default:
      throw new Error(
        `Unsupported sync entity type: ${String(change.entityType)}`,
      );
  }
  return planner(false);
};

/** Counts chat effects of one apply transaction, reported after it commits. */
interface ChatApplyTally {
  changed: boolean;
  removed: boolean;
}

const tallyChat = (tally: ChatApplyTally, applied: AppliedChange): void => {
  tally.changed = tally.changed || applied.chatChanged;
  tally.removed = tally.removed || applied.chatRemoved;
};

const reportChatChanges = (
  localUserId: string,
  tally: ChatApplyTally,
): void => {
  if (tally.removed) {
    // Files of messages deleted on another phone (ADR-026 obligations).
    void runAttachmentCleanup(
      localUserId,
      () => userStore.getActiveSessionToken().userId === localUserId,
    ).catch(() => undefined);
  }
  if (tally.changed) emitChatRemoteChanged(localUserId);
};

const assertActiveLocalUser = (localUserId: string): void => {
  const session = userStore.getActiveSessionToken();
  if (session.userId !== localUserId || !userStore.getUserById(localUserId)) {
    throw new Error('The active local account changed during sync.');
  }
};

const formatMutation = (
  localUserId: string,
  item: OutboxItem,
): OutboundMutation => {
  const resolvedBaseVersion = LAST_WRITE_WINS_ENTITY_TYPES.includes(
    item.entityType,
  )
    ? null
    : item.operation === 'create'
    ? 0
    : item.baseVersion ??
      syncMetadataStore.getVersion(
        localUserId,
        item.entityType,
        item.entityId,
        item.scopeType,
        item.scopeId,
      );
  const outboundPayload =
    item.entityType === 'profile' &&
    serversWithoutProfileAvatarSeed.has(activeSyncServerKey())
      ? stripAvatarSeed(item.payload)
      : item.payload;
  return {
    mutationId: item.id,
    entityType: item.entityType,
    entityId: item.entityId,
    operation: item.operation,
    clientUpdatedAt: item.updatedAt,
    payload: outboundPayload,
    ...(resolvedBaseVersion === null ? {} : {baseVersion: resolvedBaseVersion}),
  };
};

const validateMutationResults = (
  response: SyncBatchResponsePayload,
  sentMutations: OutboundMutation[],
): void => {
  const sentById = new Map(
    sentMutations.map(mutation => [mutation.mutationId, mutation]),
  );
  const seen = new Set<string>();
  for (const result of response.accepted) {
    if (result.status !== 'accepted') {
      throw new Error('Server put a non-accepted result in the accepted list.');
    }
  }
  for (const result of response.rejected) {
    if (result.status !== 'rejected') {
      throw new Error('Server put a non-rejected result in the rejected list.');
    }
  }
  for (const result of [...response.accepted, ...response.rejected]) {
    const sent = sentById.get(result.mutationId);
    if (!sent) {
      throw new Error(
        `Server returned an unknown mutation result: ${result.mutationId}`,
      );
    }
    if (
      result.entityType !== sent.entityType ||
      result.entityId !== sent.entityId
    ) {
      throw new Error(
        `Server returned mismatched entity details for mutation ${result.mutationId}.`,
      );
    }
    if (seen.has(result.mutationId)) {
      throw new Error(
        `Server returned duplicate mutation results for: ${result.mutationId}`,
      );
    }
    seen.add(result.mutationId);
  }
  if (seen.size !== sentById.size) {
    const missingIds = [...sentById.keys()].filter(id => !seen.has(id));
    throw new Error(
      `Server omitted mutation results for: ${missingIds.join(', ')}`,
    );
  }
};

const validatePage = (
  response: SyncBatchResponsePayload,
  requestCursor: number,
): void => {
  if (
    !Number.isInteger(response.nextCursor) ||
    response.nextCursor < requestCursor
  ) {
    throw new Error('Server returned an invalid or regressing sync cursor.');
  }
  let greatestChangeId = requestCursor;
  for (const change of response.changes) {
    if (
      !Number.isInteger(change.changeId) ||
      change.changeId <= requestCursor
    ) {
      throw new Error(
        'Server returned a change at or behind the requested cursor.',
      );
    }
    if (change.changeId <= greatestChangeId) {
      throw new Error('Server returned changes out of order.');
    }
    greatestChangeId = change.changeId;
  }
  if (response.changes.length === 0 && response.nextCursor !== requestCursor) {
    throw new Error('Server advanced the cursor without returning changes.');
  }
  if (response.changes.length > 0 && response.nextCursor !== greatestChangeId) {
    throw new Error('Server cursor does not match the last returned change.');
  }
  if (response.hasMore && response.nextCursor === requestCursor) {
    throw new Error('Server pagination made no cursor progress.');
  }
  for (const change of response.changes) {
    if (!Number.isInteger(change.version) || change.version <= 0) {
      throw new Error('Server returned a non-positive entity version.');
    }
  }
};

const sameStringSet = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  return (
    leftSet.size === right.length && right.every(item => leftSet.has(item))
  );
};

const validateSnapshotResponse = (
  response: SyncBatchResponsePayload,
  requestCursor: number,
  request: SnapshotRequestPayload,
  effectiveTypes: readonly SyncEntityType[],
): SnapshotPage => {
  const authoritativeTypes = authoritativeSyncEntityTypes(effectiveTypes);
  const snapshot = response.snapshot;
  if (!snapshot) {
    throw new Error(
      'Server omitted the requested current-state snapshot page.',
    );
  }
  if (
    response.resetRequired ||
    response.changes.length > 0 ||
    response.hasMore ||
    response.nextCursor !== requestCursor
  ) {
    throw new Error('Server mixed delta progress into a snapshot response.');
  }
  if (
    !Number.isInteger(snapshot.boundaryCursor) ||
    snapshot.boundaryCursor < 0 ||
    (request.boundaryCursor !== undefined &&
      snapshot.boundaryCursor !== request.boundaryCursor)
  ) {
    throw new Error(
      'Server returned an invalid or changing snapshot boundary.',
    );
  }
  if (snapshot.hasMore === snapshot.complete) {
    throw new Error('Server returned inconsistent snapshot pagination flags.');
  }
  if (
    (snapshot.hasMore && !snapshot.nextAfter) ||
    (snapshot.complete && snapshot.nextAfter)
  ) {
    throw new Error(
      'Server returned an invalid snapshot continuation position.',
    );
  }
  if (snapshot.hasMore && snapshot.items.length === 0) {
    throw new Error('Server snapshot pagination made no item progress.');
  }
  if (
    request.after &&
    snapshot.nextAfter &&
    request.after.entityType === snapshot.nextAfter.entityType &&
    request.after.entityId === snapshot.nextAfter.entityId
  ) {
    throw new Error('Server repeated the same snapshot continuation position.');
  }
  if (!sameStringSet(snapshot.authoritativeEntityTypes, authoritativeTypes)) {
    throw new Error(
      'Server snapshot did not cover every personal entity type.',
    );
  }
  if (
    !snapshot.prunePolicy.requireExistingSyncMetadata ||
    !sameStringSet(
      snapshot.prunePolicy.preserveOutboxStatuses,
      OUTBOX_PRESERVE_STATUSES,
    )
  ) {
    throw new Error('Server returned an unsafe snapshot prune policy.');
  }

  for (const change of snapshot.items) {
    if (
      !Number.isInteger(change.changeId) ||
      change.changeId <= 0 ||
      change.changeId > snapshot.boundaryCursor ||
      !Number.isInteger(change.version) ||
      change.version <= 0
    ) {
      throw new Error('Server returned invalid snapshot entity metadata.');
    }
    if (change.operation !== 'update' && change.operation !== 'delete') {
      throw new Error(
        'Server returned a non-current-state snapshot operation.',
      );
    }
    if (!effectiveTypes.includes(change.entityType)) {
      throw new Error(
        `Unsupported snapshot entity type: ${String(change.entityType)}`,
      );
    }
  }
  return snapshot;
};

const hasPendingLocalMutation = (
  tx: DatabaseTransaction,
  localUserId: string,
  entityType: SyncEntityType,
  entityId: string,
): boolean =>
  Boolean(
    tx.executeSync(
      `SELECT 1 FROM sync_outbox
       WHERE user_id = ? AND scope_type = ? AND scope_id = ?
         AND entity_type = ? AND entity_id = ?
         AND status = 'pending'
       LIMIT 1`,
      [localUserId, ACCOUNT_SCOPE, localUserId, entityType, entityId],
    ).rows?.[0],
  );

const pruneServerMissingEntities = (
  tx: DatabaseTransaction,
  localUserId: string,
  items: SyncChange[],
  serverTime: string,
  authoritativeTypes: readonly SyncEntityType[],
  chatTally: ChatApplyTally,
): {reminderTextUpdated: boolean; remoteChanges: number} => {
  const snapshotIds = new Map<SyncEntityType, Set<string>>();
  for (const entityType of authoritativeTypes) {
    snapshotIds.set(entityType, new Set());
  }
  for (const item of items) {
    snapshotIds.get(item.entityType)?.add(item.entityId);
  }

  let reminderTextUpdated = false;
  let remoteChanges = 0;
  for (const entityType of authoritativeTypes) {
    const isChat = isChatSyncEntityType(entityType);
    const table = isChat ? null : getPersonalEntityTable(entityType);
    if (!table && !isChat) continue;
    const syncedRows =
      tx.executeSync(
        `SELECT entity_id AS id
         FROM sync_metadata
         WHERE user_id = ? AND scope_type = ? AND scope_id = ?
           AND entity_type = ?`,
        [localUserId, ACCOUNT_SCOPE, localUserId, entityType],
      ).rows ?? [];

    for (const row of syncedRows) {
      const entityId = String(row.id);
      if (snapshotIds.get(entityType)?.has(entityId)) continue;
      const protectedMutation = tx.executeSync(
        `SELECT id FROM sync_outbox
         WHERE user_id = ? AND scope_type = ? AND scope_id = ?
           AND entity_type = ? AND entity_id = ?
           AND status IN ('pending', 'in_progress', 'failed')
         LIMIT 1`,
        [localUserId, ACCOUNT_SCOPE, localUserId, entityType, entityId],
      ).rows?.[0];
      if (protectedMutation) continue;

      if (isChat) {
        const removed = chatSyncStore.applyRemoteDelete(
          tx,
          localUserId,
          entityType as 'chat_session' | 'chat_message',
          entityId,
        ).removed;
        if (removed) {
          remoteChanges += 1;
          chatTally.changed = true;
          chatTally.removed = true;
        }
      } else {
        const result = tx.executeSync(
          `UPDATE ${table}
           SET deleted_at = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
          [serverTime, serverTime, entityId, localUserId],
        );
        if ((result.rowsAffected ?? 0) > 0) {
          remoteChanges += 1;
          if (entityType === 'reminder') reminderTextUpdated = true;
        }
      }
      tx.executeSync(
        `DELETE FROM sync_metadata
         WHERE user_id = ? AND scope_type = ? AND scope_id = ?
           AND entity_type = ? AND entity_id = ?`,
        [localUserId, ACCOUNT_SCOPE, localUserId, entityType, entityId],
      );
    }
  }
  return {reminderTextUpdated, remoteChanges};
};

const applyAuthoritativeSnapshot = (
  localUserId: string,
  items: SyncChange[],
  boundaryCursor: number,
  serverTime: string,
  effectiveTypes: readonly SyncEntityType[],
): ApplyPageResult => {
  let reminderTextUpdated = false;
  let localRemoteChanges = 0;
  const chatTally: ChatApplyTally = {changed: false, removed: false};
  db.transactionSync((tx: DatabaseTransaction) => {
    syncOutboxStore.setSuppression(
      localUserId,
      true,
      ACCOUNT_SCOPE,
      localUserId,
      tx,
    );
    try {
      const pruned = pruneServerMissingEntities(
        tx,
        localUserId,
        items,
        serverTime,
        authoritativeSyncEntityTypes(effectiveTypes),
        chatTally,
      );
      reminderTextUpdated = pruned.reminderTextUpdated;
      localRemoteChanges += pruned.remoteChanges;
      for (const change of items) {
        if (
          hasPendingLocalMutation(
            tx,
            localUserId,
            change.entityType,
            change.entityId,
          )
        ) {
          continue;
        }
        const knownVersion = syncMetadataStore.getVersion(
          localUserId,
          change.entityType,
          change.entityId,
          ACCOUNT_SCOPE,
          localUserId,
          tx,
        );
        if (knownVersion !== change.version) localRemoteChanges += 1;
        const applied = applyChange(tx, localUserId, change);
        reminderTextUpdated =
          applied.reminderTextUpdated || reminderTextUpdated;
        if (knownVersion !== change.version) tallyChat(chatTally, applied);
        if (!applied.recordMetadata) continue;
        syncMetadataStore.upsert(
          localUserId,
          {
            entityType: change.entityType,
            entityId: change.entityId,
            version: change.version,
            changeId: change.changeId,
            updatedAt: change.updatedAt,
          },
          ACCOUNT_SCOPE,
          localUserId,
          tx,
        );
      }
      syncState.saveProgress(
        localUserId,
        boundaryCursor,
        serverTime,
        'Syncing',
        null,
        tx,
      );
      syncStateStore.saveSnapshotEntityTypes(
        localUserId,
        effectiveTypes,
        ACCOUNT_SCOPE,
        localUserId,
        tx,
      );
    } finally {
      syncOutboxStore.setSuppression(
        localUserId,
        false,
        ACCOUNT_SCOPE,
        localUserId,
        tx,
      );
    }
  });
  remoteChangesApplied += localRemoteChanges;
  syncState.reload(localUserId);
  notifyRemoteChanges(localUserId, localRemoteChanges);
  reportChatChanges(localUserId, chatTally);
  return {reminderTextUpdated};
};

const persistMutationResults = (
  tx: DatabaseTransaction,
  localUserId: string,
  response: SyncBatchResponsePayload,
  inFlightMutations: OutboundMutation[],
): number => {
  if (
    inFlightMutations.length === 0 &&
    response.accepted.length === 0 &&
    response.rejected.length === 0
  ) {
    return 0;
  }
  const sentById = new Map(
    inFlightMutations.map(mutation => [mutation.mutationId, mutation]),
  );
  // Chats the server refused because the account has its most chats stay on
  // this phone; they are not conflicts and do not mark the sync as failed.
  const heldForLimit = new Set<string>();
  // Older servers that do not yet accept profile.avatar_seed: strip the field
  // and retry seamlessly so the rest of the profile still syncs without errors.
  const deferredCompatRetries = new Set<string>();
  for (const result of response.rejected) {
    const sent = sentById.get(result.mutationId);
    if (!sent) {
      throw new Error(
        `Cannot persist rejection for unknown mutation ${result.mutationId}.`,
      );
    }
    if (
      isChatSyncEntityType(result.entityType) &&
      result.reason === CHAT_LIMIT_REASON
    ) {
      chatSyncStore.holdForLimit(
        tx,
        localUserId,
        result.entityType as 'chat_session' | 'chat_message',
        result.entityId,
        sent.payload,
      );
      heldForLimit.add(result.mutationId);
      continue;
    }
    if (isProfileAvatarSeedValidationRejection(result, sent)) {
      const retryId = generateId('mut');
      const serverKey = activeSyncServerKey();
      const reasonLower = (result.reason ?? '').toLowerCase();
      if (reasonLower.includes('avatar_seed')) {
        serversWithoutProfileAvatarSeed.add(serverKey);
      } else {
        pendingAvatarSeedCompatRetries.set(retryId, serverKey);
      }
      tx.executeSync(
        `UPDATE sync_outbox
         SET id = ?, payload = ?, status = 'pending', attempts = 0, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          retryId,
          JSON.stringify(stripAvatarSeed(sent.payload)),
          new Date().toISOString(),
          result.mutationId,
          localUserId,
        ],
      );
      deferredCompatRetries.add(result.mutationId);
      continue;
    }
    // If a stripped retry still failed validation, the error was unrelated to
    // avatar_seed; do not mark this server as incompatible.
    pendingAvatarSeedCompatRetries.delete(result.mutationId);
    syncConflictStore.record(
      localUserId,
      {
        mutationId: result.mutationId,
        entityType: result.entityType,
        entityId: result.entityId,
        operation: sent.operation,
        reason: result.reason ?? 'server_rejected',
        localPayload: sent.payload,
        baseVersion: sent.baseVersion ?? null,
        serverVersion: result.serverVersion ?? null,
        serverPayload: result.serverPayload ?? null,
      },
      ACCOUNT_SCOPE,
      localUserId,
      tx,
    );
  }
  for (const item of response.accepted) {
    const compatServer = pendingAvatarSeedCompatRetries.get(item.mutationId);
    if (compatServer) {
      serversWithoutProfileAvatarSeed.add(compatServer);
      pendingAvatarSeedCompatRetries.delete(item.mutationId);
    }
  }
  syncOutboxStore.acknowledgeMutations(
    localUserId,
    response.accepted.map(item => item.mutationId),
    ACCOUNT_SCOPE,
    localUserId,
    tx,
  );
  syncOutboxStore.markMutationsFailed(
    localUserId,
    response.rejected
      .map(item => item.mutationId)
      .filter(
        mutationId =>
          !heldForLimit.has(mutationId) &&
          !deferredCompatRetries.has(mutationId),
      ),
    ACCOUNT_SCOPE,
    localUserId,
    tx,
  );
  return (
    response.rejected.length -
    heldForLimit.size -
    deferredCompatRetries.size
  );
};

const applyPage = (
  localUserId: string,
  response: SyncBatchResponsePayload,
  finalStatus: 'Syncing' | 'Synced' | 'Attention required',
  finalError: string | null,
  inFlightMutations: OutboundMutation[] = [],
): ApplyPageResult & {rejectedCount: number} => {
  let reminderTextUpdated = false;
  let localRemoteChanges = 0;
  let rejectedCount = 0;
  const ownEchoes = new Set(
    response.accepted.map(
      result =>
        `${result.entityType}:${result.entityId}:${result.serverVersion}`,
    ),
  );

  const chatTally: ChatApplyTally = {changed: false, removed: false};
  db.transactionSync((tx: DatabaseTransaction) => {
    syncOutboxStore.setSuppression(
      localUserId,
      true,
      ACCOUNT_SCOPE,
      localUserId,
      tx,
    );
    try {
      for (const change of response.changes) {
        const ownEcho = ownEchoes.has(
          `${change.entityType}:${change.entityId}:${change.version}`,
        );
        if (
          hasPendingLocalMutation(
            tx,
            localUserId,
            change.entityType,
            change.entityId,
          )
        ) {
          if (ownEcho) {
            syncMetadataStore.upsert(
              localUserId,
              {
                entityType: change.entityType,
                entityId: change.entityId,
                version: change.version,
                changeId: change.changeId,
                updatedAt: change.updatedAt,
              },
              ACCOUNT_SCOPE,
              localUserId,
              tx,
            );
          }
          continue;
        }
        if (!ownEcho) {
          localRemoteChanges += 1;
        }
        const applied = applyChange(tx, localUserId, change);
        reminderTextUpdated =
          applied.reminderTextUpdated || reminderTextUpdated;
        if (!ownEcho) tallyChat(chatTally, applied);
        if (!applied.recordMetadata) continue;
        syncMetadataStore.upsert(
          localUserId,
          {
            entityType: change.entityType,
            entityId: change.entityId,
            version: change.version,
            changeId: change.changeId,
            updatedAt: change.updatedAt,
          },
          ACCOUNT_SCOPE,
          localUserId,
          tx,
        );
      }

      rejectedCount = persistMutationResults(
        tx,
        localUserId,
        response,
        inFlightMutations,
      );

      syncState.saveProgress(
        localUserId,
        response.nextCursor,
        response.serverTime,
        finalStatus,
        finalError,
        tx,
      );
    } finally {
      syncOutboxStore.setSuppression(
        localUserId,
        false,
        ACCOUNT_SCOPE,
        localUserId,
        tx,
      );
    }
  });

  remoteChangesApplied += localRemoteChanges;
  syncState.reload(localUserId);
  notifyRemoteChanges(localUserId, localRemoteChanges);
  reportChatChanges(localUserId, chatTally);
  return {reminderTextUpdated, rejectedCount};
};

const settleMutationResults = (
  localUserId: string,
  response: SyncBatchResponsePayload,
  inFlightMutations: OutboundMutation[],
): number =>
  db.transactionSync(tx =>
    persistMutationResults(tx, localUserId, response, inFlightMutations),
  );

interface PreparedOutboxBatch {
  mutations: OutboundMutation[];
  ids: string[];
  oversizedCount: number;
}

const failOversizedMutations = (
  localUserId: string,
  oversized: OutboundMutation[],
): void => {
  if (oversized.length === 0) return;
  db.transactionSync(tx => {
    for (const mutation of oversized) {
      syncConflictStore.record(
        localUserId,
        {
          mutationId: mutation.mutationId,
          entityType: mutation.entityType,
          entityId: mutation.entityId,
          operation: mutation.operation,
          reason: 'payload_too_large',
          localPayload: {},
          baseVersion: mutation.baseVersion ?? null,
          serverVersion: null,
          serverPayload: null,
        },
        ACCOUNT_SCOPE,
        localUserId,
        tx,
      );
    }
    syncOutboxStore.markMutationsFailed(
      localUserId,
      oversized.map(mutation => mutation.mutationId),
      ACCOUNT_SCOPE,
      localUserId,
      tx,
    );
  });
};

/**
 * Queues chat history the cloud has never had from this phone, a bounded
 * batch per call (ADR-040). Only once chat is part of this pass's state: right
 * after its snapshot, or on a pass that needs none.
 */
const queueUnsyncedChat = (
  localUserId: string,
  effectiveTypes: readonly SyncEntityType[],
): void => {
  if (!effectiveTypes.includes('chat_message')) return;
  try {
    chatSyncStore.enqueueUnsynced(localUserId);
  } catch (error) {
    console.warn('[SyncWorker] Chat history was not queued:', error);
  }
};

const prepareOutboxBatch = (
  localUserId: string,
  effectiveTypes: readonly SyncEntityType[],
): PreparedOutboxBatch => {
  let oversizedCount = 0;
  for (let claimAttempt = 0; claimAttempt < 2; claimAttempt += 1) {
    let mutations: OutboundMutation[] = [];
    while (true) {
      const pending = syncOutboxStore.getPendingMutations(
        localUserId,
        OUTBOX_BATCH_SIZE,
        ACCOUNT_SCOPE,
        localUserId,
        undefined,
        effectiveTypes,
      );
      const seenEntities = new Set<string>();
      mutations = [];
      const oversized: OutboundMutation[] = [];
      let batchBytes = 0;
      for (const item of pending) {
        const key = `${item.entityType}:${item.entityId}`;
        if (seenEntities.has(key)) continue;
        seenEntities.add(key);
        const mutation = formatMutation(localUserId, item);
        const size = utf8Length(JSON.stringify(mutation));
        if (size > MAX_BATCH_BYTES) {
          oversized.push(mutation);
          continue;
        }
        if (batchBytes + size > MAX_BATCH_BYTES) break;
        batchBytes += size;
        mutations.push(mutation);
      }
      failOversizedMutations(localUserId, oversized);
      oversizedCount += oversized.length;
      if (mutations.length > 0 || oversized.length === 0) {
        break;
      }
    }
    const ids = mutations.map(mutation => mutation.mutationId);
    const claimed = syncOutboxStore.markMutationsInProgress(
      localUserId,
      ids,
      ACCOUNT_SCOPE,
      localUserId,
    );
    if (claimed === ids.length) {
      return {mutations, ids, oversizedCount};
    }

    syncOutboxStore.requeueMutations(
      localUserId,
      ids,
      ACCOUNT_SCOPE,
      localUserId,
    );
  }

  throw new Error('Could not claim a stable account-scoped outbox batch.');
};

export const syncWorker = {
  getRetryAttempt: (): number => retryAttempt,

  resetServerCompatibility: (): void => {
    serversWithoutProfileAvatarSeed.clear();
    pendingAvatarSeedCompatRetries.clear();
  },

  onRemoteChanges: (listener: RemoteChangeListener): (() => void) => {
    remoteChangeListeners.add(listener);
    return () => {
      remoteChangeListeners.delete(listener);
    };
  },

  takeRemoteChangeCount: (): number => {
    const count = remoteChangesApplied;
    remoteChangesApplied = 0;
    return count;
  },

  performSync: (): Promise<void> => {
    if (inFlightSync) {
      followUpSyncRequested = true;
      return inFlightSync;
    }
    followUpSyncRequested = false;
    const runLoop = async (): Promise<void> => {
      do {
        followUpSyncRequested = false;
        await syncWorker.runSyncPass();
      } while (followUpSyncRequested);
    };
    inFlightSync = runLoop().finally(() => {
      inFlightSync = null;
      followUpSyncRequested = false;
    });
    return inFlightSync;
  },

  runSyncPass: async (): Promise<void> => {
    let localUserId: string | null = null;
    let inFlightMutationIds: string[] = [];
    let inFlightMutations: OutboundMutation[] = [];
    try {
      if (!db.isFallback() && !db.getHealth().durable) {
        syncState.deactivate('Local only');
        return;
      }
      const session = userStore.getActiveSessionToken();
      localUserId = session.userId;
      if (!localUserId || !userStore.getUserById(localUserId)) {
        syncState.deactivate('Sign-in required');
        return;
      }
      if (db.isFallback()) {
        syncState.deactivate('Local only');
        return;
      }

      const persistedState = syncState.activate(localUserId);
      const isOnline = await cloudClient.isOnline();
      if (!isOnline) {
        syncState.setStatus(localUserId, 'Offline');
        return;
      }

      if (!cloudClient.getAccessToken()) {
        const linkResult = await accountLinkService.completeDeferredCloudLink(
          localUserId,
        );
        if (linkResult.status !== 'success' || !cloudClient.getAccessToken()) {
          syncState.setStatus(
            localUserId,
            linkResult.status === 'offline' ? 'Offline' : 'Sign-in required',
            linkResult.message,
          );
          return;
        }
      }

      syncState.setStatus(localUserId, 'Syncing');

      try {
        await accountLinkService.refreshCloudProfile(localUserId, {
          skipIfFresh: true,
        });
      } catch (error: unknown) {
        console.warn('[SyncWorker] Profile refresh note:', error);
      }
      assertActiveLocalUser(localUserId);

      syncOutboxStore.recoverInProgressMutations(
        localUserId,
        ACCOUNT_SCOPE,
        localUserId,
      );
      const negotiated = syncStateStore.loadEntityTypes(localUserId);
      let knownServerTypes = negotiated.serverEntityTypes;
      // Chat is declared only while this account syncs chat and the server
      // has listed it; the set stays fixed for the whole pass (ADR-040).
      const chatSyncEnabled = chatSyncStore.isEnabled(localUserId);
      let chatDeleteRejections = 0;
      if (!chatSyncEnabled && chatSyncStore.serverSupportsChat(localUserId)) {
        // Turning upload/download off never withholds a student's explicit deletion.
        // This feed is deliberately not applied or used to advance the normal cursor.
        for (let batch = 0; batch < MAX_SYNC_REQUESTS; batch += 1) {
          const pendingDeletes = syncOutboxStore.getPendingMutations(
            localUserId,
            OUTBOX_BATCH_SIZE,
            ACCOUNT_SCOPE,
            localUserId,
            undefined,
            ['chat_session', 'chat_message'],
            'delete',
          );
          if (!pendingDeletes.length) break;
          inFlightMutations = pendingDeletes.map(item =>
            formatMutation(localUserId!, item),
          );
          inFlightMutationIds = pendingDeletes.map(item => item.id);
          syncOutboxStore.markMutationsInProgress(
            localUserId,
            inFlightMutationIds,
            ACCOUNT_SCOPE,
            localUserId,
          );
          const deleted = await cloudClient.request<SyncBatchResponsePayload>(
            '/v1/sync/batch',
            {
              method: 'POST',
              body: JSON.stringify({
                mutations: inFlightMutations,
                cursor: 0,
                entityTypes: declaredSyncEntityTypes(true, knownServerTypes),
              }),
            },
          );
          assertActiveLocalUser(localUserId);
          if (deleted.status !== 'success' || !deleted.data)
            throw new Error(
              deleted.error || 'Cloud chat deletion could not finish.',
            );
          validateMutationResults(deleted.data, inFlightMutations);
          chatDeleteRejections += settleMutationResults(
            localUserId,
            deleted.data,
            inFlightMutations,
          );
          inFlightMutationIds = [];
          inFlightMutations = [];
          if (batch === MAX_SYNC_REQUESTS - 1)
            throw new Error(
              'More cloud chat deletions are waiting for the next sync.',
            );
        }
      }
      const declaredTypes = declaredSyncEntityTypes(
        chatSyncEnabled,
        knownServerTypes,
      );
      let effectiveTypes = effectiveSyncEntityTypes(
        knownServerTypes,
        declaredTypes,
      );
      const snapshotFirst =
        negotiated.snapshotEntityTypes === null ||
        !sameEntityTypeSet(negotiated.snapshotEntityTypes, effectiveTypes);
      if (!snapshotFirst) queueUnsyncedChat(localUserId, effectiveTypes);
      let preparedBatch: PreparedOutboxBatch = snapshotFirst
        ? {mutations: [], ids: [], oversizedCount: 0}
        : prepareOutboxBatch(localUserId, effectiveTypes);
      let outboundMutations = preparedBatch.mutations;
      inFlightMutationIds = preparedBatch.ids;
      inFlightMutations = preparedBatch.mutations;
      let requestCursor = snapshotFirst ? 0 : persistedState.cursor;
      let resetHandled = false;
      let snapshotRequest: SnapshotRequestPayload | null = snapshotFirst
        ? {}
        : null;
      let snapshotItems: SyncChange[] = [];
      const snapshotItemKeys = new Set<string>();
      let rejectedCount = preparedBatch.oversizedCount + chatDeleteRejections;
      let reminderTextUpdated = false;

      for (
        let requestNumber = 1;
        requestNumber <= MAX_SYNC_REQUESTS;
        requestNumber += 1
      ) {
        assertActiveLocalUser(localUserId);
        const result = await cloudClient.request<SyncBatchResponsePayload>(
          '/v1/sync/batch',
          {
            method: 'POST',
            body: JSON.stringify({
              mutations: outboundMutations,
              cursor: requestCursor,
              entityTypes: declaredTypes,
              ...(snapshotRequest === null ? {} : {snapshot: snapshotRequest}),
            }),
          },
          true,
        );

        if (result.status === 'offline') {
          syncOutboxStore.requeueMutations(
            localUserId,
            inFlightMutationIds,
            ACCOUNT_SCOPE,
            localUserId,
          );
          inFlightMutationIds = [];
          inFlightMutations = [];
          syncState.setStatus(localUserId, 'Offline');
          return;
        }
        if (result.status === 'auth_required') {
          syncOutboxStore.requeueMutations(
            localUserId,
            inFlightMutationIds,
            ACCOUNT_SCOPE,
            localUserId,
          );
          inFlightMutationIds = [];
          inFlightMutations = [];
          syncState.setStatus(localUserId, 'Sign-in required');
          return;
        }
        if (result.status !== 'success' || !result.data) {
          syncOutboxStore.requeueMutations(
            localUserId,
            inFlightMutationIds,
            ACCOUNT_SCOPE,
            localUserId,
          );
          inFlightMutationIds = [];
          inFlightMutations = [];
          retryAttempt += 1;
          syncState.setStatus(
            localUserId,
            'Attention required',
            result.error || 'Sync request failed',
          );
          return;
        }

        const response = result.data;
        validateMutationResults(response, inFlightMutations);
        assertActiveLocalUser(localUserId);

        effectiveTypes = effectiveSyncEntityTypes(
          response.supportedEntityTypes,
          declaredTypes,
        );
        if (
          response.supportedEntityTypes &&
          (knownServerTypes === null ||
            !sameEntityTypeSet(knownServerTypes, response.supportedEntityTypes))
        ) {
          knownServerTypes = [...response.supportedEntityTypes];
          syncStateStore.saveServerEntityTypes(localUserId, knownServerTypes);
          // A server that just started listing chat: sync it in the next pass
          // right away instead of on the next timer tick.
          if (
            !sameEntityTypeSet(
              declaredSyncEntityTypes(chatSyncEnabled, knownServerTypes),
              declaredTypes,
            )
          ) {
            followUpSyncRequested = true;
          }
        }

        if (snapshotRequest !== null) {
          const snapshot = validateSnapshotResponse(
            response,
            requestCursor,
            snapshotRequest,
            effectiveTypes,
          );
          for (const item of snapshot.items) {
            const key = `${item.entityType}:${item.entityId}`;
            if (snapshotItemKeys.has(key)) {
              throw new Error(`Server repeated snapshot entity ${key}.`);
            }
            snapshotItemKeys.add(key);
            snapshotItems.push(item);
          }

          if (!snapshot.complete) {
            if (!snapshot.nextAfter) {
              throw new Error('Server omitted the next snapshot position.');
            }
            snapshotRequest = {
              boundaryCursor: snapshot.boundaryCursor,
              after: snapshot.nextAfter,
            };
            continue;
          }

          const snapshotResult = applyAuthoritativeSnapshot(
            localUserId,
            snapshotItems,
            snapshot.boundaryCursor,
            response.serverTime,
            effectiveTypes,
          );
          reminderTextUpdated =
            reminderTextUpdated || snapshotResult.reminderTextUpdated;
          requestCursor = snapshot.boundaryCursor;
          snapshotRequest = null;
          snapshotItems = [];
          snapshotItemKeys.clear();

          // Now that the cloud's chats are here, send this phone's own.
          queueUnsyncedChat(localUserId, effectiveTypes);
          preparedBatch = prepareOutboxBatch(localUserId, effectiveTypes);
          rejectedCount += preparedBatch.oversizedCount;
          outboundMutations = preparedBatch.mutations;
          inFlightMutationIds = preparedBatch.ids;
          inFlightMutations = preparedBatch.mutations;
          if (outboundMutations.length > 0) {
            continue;
          }

          const snapshotRejectedMessage =
            rejectedCount > 0
              ? `${rejectedCount} mutation${
                  rejectedCount === 1 ? '' : 's'
                } rejected by server`
              : null;
          syncState.setStatus(
            localUserId,
            rejectedCount > 0 ? 'Attention required' : 'Synced',
            snapshotRejectedMessage,
          );
          retryAttempt = 0;
          if (reminderTextUpdated) {
            await reconcileReminderDelivery(localUserId);
          }
          return;
        }

        if (response.snapshot) {
          throw new Error(
            'Server returned an unsolicited current-state snapshot.',
          );
        }
        validatePage(response, requestCursor);
        if (response.resetRequired) {
          if (
            resetHandled ||
            response.changes.length > 0 ||
            response.hasMore ||
            response.nextCursor !== requestCursor
          ) {
            throw new Error('Server repeatedly requested a sync cursor reset.');
          }
          rejectedCount += settleMutationResults(
            localUserId,
            response,
            inFlightMutations,
          );
          inFlightMutationIds = [];
          inFlightMutations = [];
          resetHandled = true;
          requestCursor = 0;
          snapshotRequest = {};
          snapshotItems = [];
          snapshotItemKeys.clear();
          outboundMutations = [];
          continue;
        }

        const pageResult = applyPage(
          localUserId,
          response,
          'Syncing',
          null,
          inFlightMutations,
        );
        reminderTextUpdated =
          reminderTextUpdated || pageResult.reminderTextUpdated;
        rejectedCount += pageResult.rejectedCount;
        inFlightMutationIds = [];
        inFlightMutations = [];
        requestCursor = response.nextCursor;

        if (response.hasMore) {
          outboundMutations = [];
          continue;
        }

        preparedBatch = prepareOutboxBatch(localUserId, effectiveTypes);
        rejectedCount += preparedBatch.oversizedCount;
        outboundMutations = preparedBatch.mutations;
        inFlightMutationIds = preparedBatch.ids;
        inFlightMutations = preparedBatch.mutations;
        if (outboundMutations.length > 0) {
          continue;
        }

        const rejectedMessage =
          rejectedCount > 0
            ? `${rejectedCount} mutation${
                rejectedCount === 1 ? '' : 's'
              } rejected by server`
            : null;
        syncState.setStatus(
          localUserId,
          rejectedCount > 0 ? 'Attention required' : 'Synced',
          rejectedMessage,
        );
        retryAttempt = 0;
        if (reminderTextUpdated) {
          await reconcileReminderDelivery(localUserId);
        }
        return;
      }

      throw new Error(
        `Sync exceeded the ${MAX_SYNC_REQUESTS}-request safety limit.`,
      );
    } catch (error: unknown) {
      if (localUserId) {
        syncOutboxStore.requeueMutations(
          localUserId,
          inFlightMutationIds,
          ACCOUNT_SCOPE,
          localUserId,
        );
        inFlightMutationIds = [];
        inFlightMutations = [];
      }
      retryAttempt += 1;
      console.error('[SyncWorker] Error during sync pass:', error);
      if (
        localUserId &&
        userStore.getActiveSessionToken().userId === localUserId
      ) {
        syncState.setStatus(
          localUserId,
          'Attention required',
          getErrorMessage(error),
        );
      } else {
        syncState.deactivate(
          localUserId ? 'Local only' : 'Attention required',
          localUserId ? null : getErrorMessage(error),
        );
      }
    }
  },
};
