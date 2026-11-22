/**
 * Read-only facts about the phone and app for Developer benchmarks: run
 * metadata, the online preflight, offline model status and a before/after
 * snapshot that proves a run did not change personal data.
 *
 * Nothing here signs in, downloads, changes settings or connectivity, or
 * reads personal content. Exports carry no tokens, keys, email addresses,
 * student numbers, user ids or planner text.
 */
import {NativeModules, Platform} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {APP_VERSION} from '../../appVersion';
import {db} from '../../storage/database';
import {userStore} from '../../storage/userStore';
import {localSettingsStore} from '../../storage/localSettingsStore';
import {chatMemoryStore} from '../../storage/chatMemoryStore';
import {cloudClient} from '../../cloud/cloudClient';
import {backendSelection} from '../../cloud/backendSelection';
import {directProviderTestEnabled} from '../../cloud/directProviderTest';
import {
  getActiveOfflineModelReadyConfig,
  getSelectedOfflineModelId,
  isOfflineModelEngineAvailable,
} from '../nlu/modelManager';
import {monotonicClockSource} from './requestTrace';

export interface ModelEnvironment {
  selectedModelId: string;
  engineAvailable: boolean | null;
  /** A model is installed, valid and ready to load. */
  ready: boolean;
  /** installed | not_installed | engine_unavailable | fast_path_only_selected | not_checked */
  availability: string;
}

export const getModelEnvironment = async (
  userId: string,
): Promise<ModelEnvironment> => {
  let selectedModelId = 'unknown';
  try {
    selectedModelId = getSelectedOfflineModelId(userId);
  } catch {
    // Reported as unknown.
  }
  let engineAvailable: boolean | null = null;
  try {
    engineAvailable = await isOfflineModelEngineAvailable();
  } catch {
    engineAvailable = null;
  }
  let ready = false;
  try {
    ready = (await getActiveOfflineModelReadyConfig(userId)) !== null;
  } catch {
    ready = false;
  }
  const availability = ready
    ? 'installed'
    : selectedModelId === 'fast_path_only'
    ? 'fast_path_only_selected'
    : engineAvailable === false
    ? 'engine_unavailable'
    : engineAvailable === null
    ? 'not_checked'
    : 'not_installed';
  return {selectedModelId, engineAvailable, ready, availability};
};

export interface ConnectivityInfo {
  type: string;
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

export const getConnectivity = async (): Promise<ConnectivityInfo | null> => {
  try {
    const state = await NetInfo.fetch();
    return {
      type: String(state?.type ?? 'unknown'),
      isConnected: state?.isConnected ?? null,
      isInternetReachable: state?.isInternetReachable ?? null,
    };
  } catch {
    return null;
  }
};

export interface RunEnvironment {
  appVersion: string;
  build: {
    versionName: string | null;
    versionCode: number | null;
    buildType: string;
    jsDevBundle: boolean;
  };
  platform: {os: string; apiLevel: string; release: string | null};
  /** Manufacturer and model only (no serial, fingerprint or ids). */
  device: {manufacturer: string | null; model: string | null};
  offlineModel: ModelEnvironment;
  connectivity: ConnectivityInfo | null;
  /** Which server choice is active (never the URL or credentials). */
  backendChoice: string;
  accountKind: 'guest' | 'signed_in' | 'none';
  directProviderTestBuild: boolean;
  clockSource: string;
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 60) : null;

export const getRunEnvironment = async (
  userId: string,
): Promise<RunEnvironment> => {
  const build = (NativeModules.CapstoneBuild || {}) as {
    buildType?: unknown;
    versionCode?: unknown;
    versionName?: unknown;
  };
  const constants = (Platform as {constants?: Record<string, unknown>})
    .constants;
  const devFlag = (globalThis as {__DEV__?: boolean}).__DEV__ === true;
  let accountKind: RunEnvironment['accountKind'] = 'none';
  try {
    if (userId) accountKind = userStore.isGuest(userId) ? 'guest' : 'signed_in';
  } catch {
    accountKind = 'none';
  }
  let backendChoice = 'unknown';
  try {
    backendChoice = backendSelection.current() || 'default';
  } catch {
    backendChoice = 'unknown';
  }
  let directProviderTestBuild = false;
  try {
    directProviderTestBuild = directProviderTestEnabled();
  } catch {
    directProviderTestBuild = false;
  }
  return {
    appVersion: APP_VERSION,
    build: {
      versionName: str(build.versionName),
      versionCode:
        typeof build.versionCode === 'number' ? build.versionCode : null,
      buildType:
        str(build.buildType) ??
        (devFlag ? 'debug (JS dev bundle)' : 'unknown (no native build info)'),
      jsDevBundle: devFlag,
    },
    platform: {
      os: Platform.OS,
      apiLevel: String(Platform.Version),
      release: str(constants?.Release),
    },
    device: {
      manufacturer: str(constants?.Manufacturer),
      model: str(constants?.Model),
    },
    offlineModel: await getModelEnvironment(userId),
    connectivity: await getConnectivity(),
    backendChoice,
    accountKind,
    directProviderTestBuild,
    clockSource: monotonicClockSource(),
  };
};

export type CheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';

export interface PreflightCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface OnlinePreflight {
  ok: boolean;
  checks: PreflightCheck[];
}

/**
 * Checks that online tests can run, without signing in, renewing a
 * subscription, changing a setting or touching connectivity. The service
 * check is one read-only GET the app already makes before online speech.
 */
export const runOnlinePreflight = async (
  userId: string,
  deps: {
    connectivity?: () => Promise<ConnectivityInfo | null>;
    serviceCheck?: () => Promise<{status: string; httpStatus?: number}>;
  } = {},
): Promise<OnlinePreflight> => {
  const checks: PreflightCheck[] = [];
  let guest = true;
  let hasSession = false;
  try {
    guest = !userId || userStore.isGuest(userId);
    const session = userStore.getActiveSessionToken();
    hasSession =
      session.userId === userId &&
      Boolean(session.accessToken || session.refreshToken);
  } catch {
    hasSession = false;
  }
  const direct = (() => {
    try {
      return directProviderTestEnabled();
    } catch {
      return false;
    }
  })();
  if (direct) {
    checks.push({
      name: 'Account',
      status: 'SKIPPED',
      detail: 'Direct provider test build: no LAFINA account is used.',
    });
  } else {
    checks.push({
      name: 'Account',
      status: !guest && hasSession ? 'PASS' : 'FAIL',
      detail: guest
        ? 'Guest account: online AI needs a signed-in account. Sign in from Profile yourself; the test will not sign in.'
        : hasSession
        ? 'Signed in.'
        : 'No active sign-in on this phone. Sign in again from Profile.',
    });
  }

  const net = await (deps.connectivity ?? getConnectivity)();
  const connected = Boolean(
    net?.isConnected && net.isInternetReachable !== false,
  );
  checks.push({
    name: 'Connectivity',
    status: connected ? 'PASS' : 'FAIL',
    detail: net
      ? `${net.type}; connected=${String(net.isConnected)}; internet=${String(
          net.isInternetReachable,
        )}`
      : 'Connectivity could not be read.',
  });

  const accountOk = checks[0].status !== 'FAIL';
  if (!connected || !accountOk) {
    checks.push({
      name: 'Service',
      status: 'SKIPPED',
      detail: 'Not checked: account or connectivity failed first.',
    });
  } else if (direct) {
    checks.push({
      name: 'Service',
      status: 'SKIPPED',
      detail: 'Direct provider test build: the LAFINA server is not used.',
    });
  } else {
    const check =
      deps.serviceCheck ??
      (async () => {
        const result = await cloudClient.request<unknown>(
          '/v1/ai/tts/capabilities',
          {method: 'GET'},
          true,
        );
        return {status: result.status, httpStatus: result.httpStatus};
      });
    try {
      const result = await check();
      checks.push({
        name: 'Service',
        status: result.status === 'success' ? 'PASS' : 'FAIL',
        detail:
          result.status === 'success'
            ? 'LAFINA server answered.'
            : `LAFINA server check failed: ${result.status}${
                result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''
              }.`,
      });
    } catch {
      checks.push({
        name: 'Service',
        status: 'FAIL',
        detail: 'LAFINA server check failed.',
      });
    }
  }
  return {ok: checks.every(c => c.status !== 'FAIL'), checks};
};

/** Tables whose change time is not called updated_at. */
const CHANGE_COLUMN: Record<string, string> = {
  assistant_operation_receipts: 'applied_at',
};

/** Tables a benchmark must never change, counted for the run's owner. */
const OWNED_TABLES = [
  'tasks',
  'events',
  'time_blocks',
  'reminders',
  'notes',
  'custom_categories',
  'chat_memories',
  'chat_sessions',
  'sync_outbox',
  'assistant_operation_receipts',
  'reminder_delivery_jobs',
  'alarms',
] as const;

export interface DataSnapshot {
  /** table → "count|latest update" (or "unavailable"). */
  tables: Record<string, string>;
  messages: string;
  memoryRevision: string;
  /** The Chat Online Mode switch, which a run must leave as it was. */
  onlineModeSetting: string | null;
}

const fingerprint = (table: string, userId: string): string => {
  try {
    let latest = '';
    try {
      latest = String(
        db.executeSync(
          `SELECT MAX(${
            CHANGE_COLUMN[table] ?? 'updated_at'
          }) AS u FROM ${table} WHERE user_id = ?`,
          [userId],
        ).rows?.[0]?.u ?? '',
      );
    } catch {
      latest = 'n/a';
    }
    const count = Number(
      db.executeSync(`SELECT COUNT(*) AS c FROM ${table} WHERE user_id = ?`, [
        userId,
      ]).rows?.[0]?.c ?? 0,
    );
    return `${count}|${latest}`;
  } catch {
    return 'unavailable';
  }
};

/** Counts and latest-update marks only; never row content. */
export const snapshotPersonalData = (userId: string): DataSnapshot => {
  const tables: Record<string, string> = {};
  for (const table of OWNED_TABLES) tables[table] = fingerprint(table, userId);
  let messages = 'unavailable';
  try {
    const row = db.executeSync(
      `SELECT COUNT(*) AS c, MAX(m.updated_at) AS u FROM messages m
       JOIN chat_sessions s ON s.id = m.session_id WHERE s.user_id = ?`,
      [userId],
    ).rows?.[0];
    messages = `${Number(row?.c ?? 0)}|${String(row?.u ?? '')}`;
  } catch {
    messages = 'unavailable';
  }
  let memoryRevision = 'unavailable';
  try {
    memoryRevision = chatMemoryStore.revision(userId);
  } catch {
    memoryRevision = 'unavailable';
  }
  let onlineModeSetting: string | null = null;
  try {
    onlineModeSetting = localSettingsStore.get(userId, 'chat.onlineMode');
  } catch {
    onlineModeSetting = null;
  }
  return {tables, messages, memoryRevision, onlineModeSetting};
};

export interface SideEffectCheck {
  status: 'PASS' | 'FAIL';
  /** Names of what changed during the run (no content). */
  changed: string[];
  note: string;
}

export const compareSnapshots = (
  before: DataSnapshot,
  after: DataSnapshot,
): SideEffectCheck => {
  const changed: string[] = [];
  for (const [table, value] of Object.entries(before.tables)) {
    if (after.tables[table] !== value) changed.push(table);
  }
  if (after.messages !== before.messages) changed.push('messages');
  if (after.memoryRevision !== before.memoryRevision) {
    changed.push('memory revision');
  }
  if (after.onlineModeSetting !== before.onlineModeSetting) {
    changed.push('Chat Online Mode setting');
  }
  return changed.length === 0
    ? {
        status: 'PASS',
        changed,
        note: 'Planner, chat history, memory, sync outbox, receipts, alarms and the Online Mode setting are unchanged.',
      }
    : {
        status: 'FAIL',
        changed,
        note: 'Changed during the run. Background sync or using the app at the same time can also cause this; investigate before trusting the run.',
      };
};
