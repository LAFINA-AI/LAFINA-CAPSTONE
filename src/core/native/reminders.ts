import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

export interface AlarmIdentity {
  jobId: string;
  occurrenceKey: string;
  generation: number;
}
export interface AlarmCapabilities {
  sdk: number;
  enabled: boolean;
  notifications: boolean;
  exact: boolean;
  fullScreen: boolean;
  fullScreenEnabled: boolean;
  channelImportance: number;
  reason?: string;
}
export interface AlarmDiagnostics {
  capabilities: AlarmCapabilities;
  counts: {
    pending: number;
    ringing: number;
    registered: number;
    failed: number;
  };
  events: Array<{
    jobId: string;
    generation: number;
    event: string;
    atUtc: string;
    plannedAt?: string;
    detail?: string;
  }>;
}
export type AlarmSettings =
  | 'notifications'
  | 'exact'
  | 'fullScreen'
  | 'channel';
export interface AlarmClient {
  capabilities(): Promise<AlarmCapabilities>;
  reconcile(): Promise<
    AlarmCapabilities & {scheduled: number; cancelled: number; failed: number}
  >;
  setEnabled(enabled: boolean): Promise<AlarmCapabilities>;
  setFullScreenEnabled(enabled: boolean): Promise<AlarmCapabilities>;
  requestNotifications(): Promise<boolean>;
  openSettings(kind: AlarmSettings): Promise<boolean>;
  openReminder(identity: AlarmIdentity): Promise<boolean>;
  diagnostics(): Promise<AlarmDiagnostics>;
}

/** Fixed commands only: native SQL stays in the private reminder process. */
export interface NativeReminderBridge {
  capabilities(): Promise<string>;
  reconcile(): Promise<string>;
  setEnabled(enabled: boolean): Promise<string>;
  setFullScreenEnabled(enabled: boolean): Promise<string>;
  openSettings(kind: AlarmSettings): Promise<boolean>;
  openReminder(
    jobId: string,
    occurrenceKey: string,
    generation: number,
  ): Promise<boolean>;
  diagnostics(): Promise<string>;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Android reminder response');
  }
  return value as Record<string, unknown>;
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid Android reminder count');
  }
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error('Invalid Android reminder capability');
  }
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new Error('Invalid Android reminder text');
  }
  return value;
}
function capabilities(value: unknown): AlarmCapabilities {
  const row = object(value);
  return {
    sdk: count(row.sdk),
    enabled: flag(row.enabled),
    notifications: flag(row.notifications),
    exact: flag(row.exact),
    fullScreen: flag(row.fullScreen),
    fullScreenEnabled: flag(row.fullScreenEnabled),
    // Android IMPORTANCE_UNSPECIFIED is -1000 before channel creation.
    channelImportance:
      row.channelImportance === -1000 ? -1000 : count(row.channelImportance),
    ...(row.reason == null ? {} : {reason: text(row.reason)}),
  };
}
function parse(raw: string): unknown {
  if (typeof raw !== 'string' || raw.length > 512_000) {
    throw new Error('Invalid Android reminder response');
  }
  return JSON.parse(raw) as unknown;
}
export function createAlarmClient(
  bridge: () => NativeReminderBridge | undefined,
  requestNotifications: () => Promise<boolean>,
): AlarmClient {
  function native() {
    const module = bridge();
    if (!module) {
      throw new Error(
        'Android reminders are unavailable. Your saved planner remains usable.',
      );
    }
    return module;
  }
  return {
    capabilities: async () =>
      capabilities(parse(await native().capabilities())),
    reconcile: async () => {
      const result = object(parse(await native().reconcile()));
      return {
        ...capabilities(result),
        scheduled: count(result.scheduled),
        cancelled: count(result.cancelled),
        failed: count(result.failed),
      };
    },
    setEnabled: async enabled =>
      capabilities(parse(await native().setEnabled(enabled))),
    setFullScreenEnabled: async enabled =>
      capabilities(parse(await native().setFullScreenEnabled(enabled))),
    requestNotifications,
    openSettings: async kind => flag(await native().openSettings(kind)),
    openReminder: async identity => {
      if (
        !identity.jobId ||
        identity.jobId.length > 1024 ||
        !identity.occurrenceKey ||
        identity.occurrenceKey.length > 1024 ||
        !Number.isSafeInteger(identity.generation) ||
        identity.generation < 1 ||
        identity.generation > 2_147_483_647
      ) {
        throw new Error('The reminder identity is invalid');
      }
      return flag(
        await native().openReminder(
          identity.jobId,
          identity.occurrenceKey,
          identity.generation,
        ),
      );
    },
    diagnostics: async () => {
      const result = object(parse(await native().diagnostics()));
      const counts = object(result.counts);
      if (!Array.isArray(result.events) || result.events.length > 200) {
        throw new Error('Invalid Android reminder history');
      }
      return {
        capabilities: capabilities(result.capabilities),
        counts: {
          pending: count(counts.pending),
          ringing: count(counts.ringing),
          registered: count(counts.registered),
          failed: count(counts.failed),
        },
        events: result.events.map(value => {
          const event = object(value);
          return {
            jobId: text(event.jobId),
            generation: count(event.generation),
            event: text(event.event),
            atUtc: text(event.atUtc),
            ...(event.plannedAt == null
              ? {}
              : {plannedAt: text(event.plannedAt)}),
            ...(event.detail == null ? {} : {detail: text(event.detail)}),
          };
        }),
      };
    },
  };
}

export const alarmClient = createAlarmClient(
  () => NativeModules.CapstoneReminders as NativeReminderBridge | undefined,
  async () => {
    if (Platform.OS !== 'android') {
      return false;
    }
    if (Number(Platform.Version) < 33) {
      return true;
    }
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  },
);
