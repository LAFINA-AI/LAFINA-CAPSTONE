import {db} from './database';
import type {DatabaseTransaction} from './database';
import {
  PRESENTATION_MODE_KEY,
  PRESENTATION_SNAPSHOT_KEY,
  presentationModeStore,
  type PresentationModeState,
} from './presentationModeStore';
import {syncOutboxStore} from './syncOutboxStore';

export const PRESENTATION_SNAPSHOT_VERSION = 1;

/**
 * Direct `user_id`-scoped tables captured in a Presentation Mode snapshot.
 * Listed in parent-before-child insertion order; deletion runs in reverse order
 * so foreign keys and SQLite triggers stay consistent.
 */
export const PRESENTATION_USER_TABLES: readonly string[] = [
  'tasks',
  'events',
  'event_time_local',
  'time_blocks',
  'reminders',
  'alarms',
  'notes',
  'custom_categories',
  'chat_sessions',
  'chat_memories',
  'recorded_meetings',
  'user_materials',
  'user_material_chunks',
  'user_material_qa_messages',
  'user_preferences',
  'user_behavior_logs',
  'ml_feature_snapshots',
  'sync_outbox',
  'sync_metadata',
  'sync_state',
  'sync_conflicts',
];

/**
 * Join-scoped child tables whose rows belong to an owner via a parent table
 * rather than carrying a `user_id` column of their own.
 */
interface ChildTableSpec {
  table: string;
  parentTable: string;
  parentFkColumn: string;
}

export const PRESENTATION_CHILD_TABLES: readonly ChildTableSpec[] = [
  {
    table: 'messages',
    parentTable: 'chat_sessions',
    parentFkColumn: 'session_id',
  },
  {
    table: 'reminder_delivery_styles',
    parentTable: 'reminders',
    parentFkColumn: 'reminder_id',
  },
];

const MANAGED_SETTING_EXACT_KEYS: ReadonlySet<string> = new Set([
  'academic.profile.v1',
  'student.setup.v1',
  'onboarding.memory.v1',
  'cor.draft.v1',
  'cor.import.ledger.v1',
  'schedule.entries.v1',
  'event_memory_v1',
  'memory.enabled',
  'memory.revision',
  'chat.currentSession',
  'chat.useHandbook',
  'ustp_handbook_enabled',
  'product_tour',
]);

export const isPresentationManagedSettingKey = (key: string): boolean => {
  if (key === PRESENTATION_MODE_KEY || key === PRESENTATION_SNAPSHOT_KEY) {
    return false;
  }
  return key.startsWith('skills.') || MANAGED_SETTING_EXACT_KEYS.has(key);
};

export interface UserProfileSnapshot {
  username: string;
  avatar_seed: string | null;
  avatar_uri: string | null;
  is_new_user: number;
  product_tour_version: number;
}

export interface SettingRowSnapshot {
  key: string;
  value: string;
  updated_at: string;
}

export interface PresentationSnapshot {
  version: 1;
  ownerId: string;
  capturedAt: string;
  syncWasSuppressed: boolean;
  userProfile: UserProfileSnapshot | null;
  tables: Record<string, Array<Record<string, unknown>>>;
  localSettings: SettingRowSnapshot[];
}

export interface EnterSandboxResult {
  entered: boolean;
  alreadyActive: boolean;
  state: PresentationModeState;
}

export interface RefreshSandboxResult {
  refreshed: boolean;
  state: PresentationModeState;
}

export interface RestoreSandboxResult {
  restored: boolean;
  ownerId: string;
  hadSnapshot: boolean;
}

type Executor = Pick<DatabaseTransaction, 'executeSync'>;

const tableExists = (tx: Executor, tableName: string): boolean =>
  (tx.executeSync(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [tableName],
  ).rows?.length ?? 0) > 0;

const getTableColumns = (tx: Executor, tableName: string): string[] => {
  const rows = tx.executeSync(`PRAGMA table_info("${tableName}")`).rows ?? [];
  return rows
    .map(row => (typeof row.name === 'string' ? row.name : ''))
    .filter(Boolean);
};

const insertRows = (
  tx: Executor,
  tableName: string,
  rows: ReadonlyArray<Record<string, unknown>>,
): void => {
  if (rows.length === 0 || !tableExists(tx, tableName)) return;
  const availableColumns = new Set(getTableColumns(tx, tableName));
  if (availableColumns.size === 0) return;

  for (const row of rows) {
    const columns = Object.keys(row).filter(col => availableColumns.has(col));
    if (columns.length === 0) continue;
    const colList = columns.map(col => `"${col}"`).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map(col => row[col] ?? null);
    tx.executeSync(
      `INSERT OR REPLACE INTO "${tableName}" (${colList}) VALUES (${placeholders})`,
      values,
    );
  }
};

/**
 * Captures every owner-scoped table, profile display field, and managed
 * `local_settings` entry for `userId` inside an active transaction.
 */
export const captureOwnerSnapshot = (
  tx: Executor,
  userId: string,
  syncWasSuppressed: boolean,
  capturedAt: string = new Date().toISOString(),
): PresentationSnapshot => {
  const tables: Record<string, Array<Record<string, unknown>>> = {};

  for (const table of PRESENTATION_USER_TABLES) {
    if (!tableExists(tx, table)) {
      tables[table] = [];
      continue;
    }
    const rows =
      tx.executeSync(`SELECT * FROM "${table}" WHERE user_id = ?`, [userId])
        .rows ?? [];
    tables[table] = rows.map(row => ({...row}));
  }

  for (const spec of PRESENTATION_CHILD_TABLES) {
    if (!tableExists(tx, spec.table) || !tableExists(tx, spec.parentTable)) {
      tables[spec.table] = [];
      continue;
    }
    const rows =
      tx.executeSync(
        `SELECT child.* FROM "${spec.table}" child
         INNER JOIN "${spec.parentTable}" parent ON parent.id = child."${spec.parentFkColumn}"
         WHERE parent.user_id = ?`,
        [userId],
      ).rows ?? [];
    tables[spec.table] = rows.map(row => ({...row}));
  }

  let userProfile: UserProfileSnapshot | null = null;
  if (tableExists(tx, 'users')) {
    const userColumns = new Set(getTableColumns(tx, 'users'));
    const row = tx.executeSync('SELECT * FROM users WHERE id = ? LIMIT 1', [
      userId,
    ]).rows?.[0];
    if (row) {
      userProfile = {
        username: typeof row.username === 'string' ? row.username : 'Student',
        avatar_seed:
          userColumns.has('avatar_seed') && typeof row.avatar_seed === 'string'
            ? row.avatar_seed
            : null,
        avatar_uri: typeof row.avatar_uri === 'string' ? row.avatar_uri : null,
        is_new_user: Number(row.is_new_user ?? 0),
        product_tour_version: Number(row.product_tour_version ?? 0),
      };
    }
  }

  const allSettings =
    tx.executeSync(
      'SELECT key, value, updated_at FROM local_settings WHERE user_id = ?',
      [userId],
    ).rows ?? [];
  const localSettings: SettingRowSnapshot[] = [];
  for (const row of allSettings) {
    const key = typeof row.key === 'string' ? row.key : '';
    if (!key || !isPresentationManagedSettingKey(key)) continue;
    localSettings.push({
      key,
      value: typeof row.value === 'string' ? row.value : '',
      updated_at:
        typeof row.updated_at === 'string' ? row.updated_at : capturedAt,
    });
  }

  return {
    version: PRESENTATION_SNAPSHOT_VERSION,
    ownerId: userId,
    capturedAt,
    syncWasSuppressed,
    userProfile,
    tables,
    localSettings,
  };
};

/**
 * Deletes every owner-scoped presentation/user row in child-before-parent order
 * without touching `users`, `active_session`, `remember_me`, or unmanaged
 * preferences (like voice, theme, floating orb, or alert settings).
 */
export const clearOwnerScopedData = (tx: Executor, userId: string): void => {
  for (const spec of PRESENTATION_CHILD_TABLES) {
    if (!tableExists(tx, spec.table) || !tableExists(tx, spec.parentTable)) {
      continue;
    }
    tx.executeSync(
      `DELETE FROM "${spec.table}"
       WHERE "${spec.parentFkColumn}" IN (
         SELECT id FROM "${spec.parentTable}" WHERE user_id = ?
       )`,
      [userId],
    );
  }

  for (let i = PRESENTATION_USER_TABLES.length - 1; i >= 0; i -= 1) {
    const table = PRESENTATION_USER_TABLES[i];
    if (!tableExists(tx, table)) continue;
    tx.executeSync(`DELETE FROM "${table}" WHERE user_id = ?`, [userId]);
  }

  if (tableExists(tx, 'job_queue_items')) {
    tx.executeSync('DELETE FROM job_queue_items WHERE user_id = ?', [userId]);
  }

  const settingRows =
    tx.executeSync('SELECT key FROM local_settings WHERE user_id = ?', [userId])
      .rows ?? [];
  for (const row of settingRows) {
    const key = typeof row.key === 'string' ? row.key : '';
    if (key && isPresentationManagedSettingKey(key)) {
      tx.executeSync(
        'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
        [userId, key],
      );
    }
  }
};

const parseSnapshot = (
  raw: string,
  expectedOwnerId: string,
): PresentationSnapshot | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<PresentationSnapshot>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.version !== PRESENTATION_SNAPSHOT_VERSION ||
      parsed.ownerId !== expectedOwnerId ||
      !parsed.tables ||
      typeof parsed.tables !== 'object'
    ) {
      return null;
    }
    return {
      version: PRESENTATION_SNAPSHOT_VERSION,
      ownerId: parsed.ownerId,
      capturedAt:
        typeof parsed.capturedAt === 'string' ? parsed.capturedAt : '',
      syncWasSuppressed: Boolean(parsed.syncWasSuppressed),
      userProfile: parsed.userProfile ?? null,
      tables: parsed.tables as Record<string, Array<Record<string, unknown>>>,
      localSettings: Array.isArray(parsed.localSettings)
        ? (parsed.localSettings as SettingRowSnapshot[])
        : [],
    };
  } catch {
    return null;
  }
};

/**
 * Restores a previously captured owner snapshot verbatim inside an active
 * transaction. Caller must invoke `clearOwnerScopedData` first.
 */
export const restoreOwnerSnapshot = (
  tx: Executor,
  snapshot: PresentationSnapshot,
): void => {
  for (const table of PRESENTATION_USER_TABLES) {
    const rows = snapshot.tables[table];
    if (Array.isArray(rows) && rows.length > 0) {
      insertRows(tx, table, rows);
    }
  }

  for (const spec of PRESENTATION_CHILD_TABLES) {
    const rows = snapshot.tables[spec.table];
    if (Array.isArray(rows) && rows.length > 0) {
      insertRows(tx, spec.table, rows);
    }
  }

  if (snapshot.userProfile && tableExists(tx, 'users')) {
    const userColumns = new Set(getTableColumns(tx, 'users'));
    const sets: string[] = [
      'username = ?',
      'avatar_uri = ?',
      'is_new_user = ?',
      'product_tour_version = ?',
    ];
    const params: unknown[] = [
      snapshot.userProfile.username,
      snapshot.userProfile.avatar_uri,
      snapshot.userProfile.is_new_user,
      snapshot.userProfile.product_tour_version,
    ];
    if (userColumns.has('avatar_seed')) {
      sets.push('avatar_seed = ?');
      params.push(snapshot.userProfile.avatar_seed);
    }
    params.push(snapshot.ownerId);
    tx.executeSync(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  for (const entry of snapshot.localSettings) {
    if (!entry.key || !isPresentationManagedSettingKey(entry.key)) continue;
    tx.executeSync(
      `INSERT INTO local_settings (user_id, key, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [snapshot.ownerId, entry.key, entry.value, entry.updated_at],
    );
  }
};

/**
 * Atomically snapshots the owner's real local data, pauses cloud sync, clears
 * the owner's working tables, runs `seed` inside the same transaction, and
 * marks Presentation Mode active.
 *
 * Refuses to overwrite an existing snapshot if Presentation Mode is already on.
 */
export const enterPresentationSandbox = (
  userId: string,
  seed?: (tx: DatabaseTransaction) => void,
  nowIso: string = new Date().toISOString(),
): EnterSandboxResult => {
  if (!userId || db.isFallback()) {
    throw new Error('Presentation Mode requires an active local database.');
  }

  return db.transactionSync(tx => {
    const existingState = presentationModeStore.getState(userId, tx);
    if (existingState?.active) {
      return {
        entered: false,
        alreadyActive: true,
        state: existingState,
      };
    }

    const syncWasSuppressed = syncOutboxStore.isSuppressed(
      userId,
      'account',
      userId,
      tx,
    );
    const snapshot = captureOwnerSnapshot(
      tx,
      userId,
      syncWasSuppressed,
      nowIso,
    );
    presentationModeStore.saveSnapshotJson(
      userId,
      JSON.stringify(snapshot),
      tx,
    );
    syncOutboxStore.setSuppression(userId, true, 'account', userId, tx);

    clearOwnerScopedData(tx, userId);

    if (seed) {
      seed(tx);
    }

    const nextState: PresentationModeState = {
      version: 1,
      active: true,
      ownerId: userId,
      activatedAt: nowIso,
      lastRefreshedAt: nowIso,
      syncWasSuppressed,
    };
    presentationModeStore.setState(nextState, tx);

    return {
      entered: true,
      alreadyActive: false,
      state: nextState,
    };
  });
};

/**
 * Re-seeds the active presentation dataset fresh without modifying the stored
 * backup of the user's real data.
 */
export const refreshPresentationSandbox = (
  userId: string,
  seed: (tx: DatabaseTransaction) => void,
  nowIso: string = new Date().toISOString(),
): RefreshSandboxResult => {
  if (!userId || db.isFallback()) {
    throw new Error('Presentation Mode requires an active local database.');
  }

  return db.transactionSync(tx => {
    const existingState = presentationModeStore.getState(userId, tx);
    if (
      !existingState?.active ||
      !presentationModeStore.hasSnapshot(userId, tx)
    ) {
      throw new Error(
        'Presentation Mode must be active with a saved backup before refreshing.',
      );
    }

    syncOutboxStore.setSuppression(userId, true, 'account', userId, tx);
    clearOwnerScopedData(tx, userId);
    seed(tx);

    const nextState: PresentationModeState = {
      ...existingState,
      lastRefreshedAt: nowIso,
    };
    presentationModeStore.setState(nextState, tx);

    return {
      refreshed: true,
      state: nextState,
    };
  });
};

/**
 * Atomically wipes presentation data, restores the user's original local
 * snapshot verbatim, restores `sync_control`, and clears Presentation Mode.
 */
export const exitPresentationSandbox = (
  userId: string,
): RestoreSandboxResult => {
  if (!userId || db.isFallback()) {
    return {restored: false, ownerId: userId, hadSnapshot: false};
  }

  return db.transactionSync(tx => {
    const state = presentationModeStore.getState(userId, tx);
    const rawSnapshot = presentationModeStore.readSnapshotJson(userId, tx);

    if (!state?.active && !rawSnapshot) {
      return {restored: false, ownerId: userId, hadSnapshot: false};
    }

    const snapshot = rawSnapshot ? parseSnapshot(rawSnapshot, userId) : null;
    syncOutboxStore.setSuppression(userId, true, 'account', userId, tx);
    clearOwnerScopedData(tx, userId);

    if (snapshot) {
      restoreOwnerSnapshot(tx, snapshot);
    }

    const restoreSuppressed =
      snapshot?.syncWasSuppressed ?? state?.syncWasSuppressed ?? false;
    syncOutboxStore.setSuppression(
      userId,
      restoreSuppressed,
      'account',
      userId,
      tx,
    );
    presentationModeStore.clearSnapshotJson(userId, tx);
    presentationModeStore.clearState(userId, tx);

    return {
      restored: true,
      ownerId: userId,
      hadSnapshot: snapshot !== null,
    };
  });
};

/**
 * Restores any active Presentation Mode owner before a sign-out or account
 * switch so real local data is never orphaned and cloud sync is never left
 * suppressed.
 */
export const restoreActivePresentationOnSessionExit = (
  keepOwnerId?: string | null,
): {restored: boolean; ownerId: string | null} => {
  if (db.isFallback()) {
    return {restored: false, ownerId: null};
  }
  try {
    const activeOwner = presentationModeStore.findActiveOwner();
    if (!activeOwner) {
      return {restored: false, ownerId: null};
    }
    if (keepOwnerId && activeOwner === keepOwnerId) {
      return {restored: false, ownerId: activeOwner};
    }
    const result = exitPresentationSandbox(activeOwner);
    return {restored: result.restored, ownerId: activeOwner};
  } catch (error) {
    console.warn(
      '[PresentationSnapshot] Failed to restore presentation sandbox on session exit:',
      error,
    );
    return {restored: false, ownerId: null};
  }
};
