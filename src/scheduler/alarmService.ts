import {AppState, NativeModules, Platform} from 'react-native';
import {db} from '../storage/database';
import {alarmsStore, onAlarmsChanged} from '../storage/alarmsStore';
import type {Alarm} from '../storage/alarmsStore';
import {nextAlarmTrigger} from './alarmSchedule';
import {migrateAlarmReminders} from './alarmMigration';

/**
 * Alarm plan A2: keeps Android's copy of the active student's alarms in step
 * with SQLite, and records what native did (rang, dismissed, snoozed, timed
 * out). Native never writes lafina.db (ADR-016); this is the only bridge.
 */

export interface AlarmNativeEvent {
  alarmId: string;
  kind: 'fired' | 'dismissed' | 'snoozed' | 'timed_out' | 'one_shot_done';
  atMs: number;
  generation: number;
}

export interface AlarmHealth {
  canScheduleExactAlarms: boolean;
  canUseFullScreenIntent: boolean;
  notificationsEnabled: boolean;
  ignoringBatteryOptimizations: boolean;
  manufacturer: string;
  /** False when nothing native is available (tests without it, other platforms). */
  available: boolean;
}

interface NativeAlarmModule {
  reconcile(
    alarms: Record<string, unknown>[],
  ): Promise<{id: string; nextTriggerMs: number | null}[]>;
  drainEvents(): Promise<AlarmNativeEvent[]>;
  testAlarm(seconds: number): Promise<number>;
  testAlarmWithSound?: (
    seconds: number,
    soundUri: string | null,
  ) => Promise<number>;
  setAlarmAudioPreferences?: (options: {
    defaultAlarmSoundUri: string | null;
    alarmVibrationPattern: string;
    alarmVolumeRampSec: number;
  }) => Promise<boolean>;
  stopRinging(): Promise<boolean>;
  getStatus(): Promise<Omit<AlarmHealth, 'available'>>;
  openBatterySettings(): Promise<boolean>;
}

const native = (): NativeAlarmModule | null =>
  Platform.OS === 'android'
    ? (NativeModules.LafinaAlarm as NativeAlarmModule | undefined) ?? null
    : null;

const toNative = (alarm: Alarm) => ({
  id: alarm.id,
  ownerId: alarm.userId,
  hour: alarm.hour,
  minute: alarm.minute,
  repeatDays: alarm.repeatDays,
  oneShotDate: alarm.oneShotDate,
  label: alarm.label || 'Alarm',
  enabled: alarm.enabled,
  snoozeMinutes: alarm.snoozeMinutes,
  vibrate: alarm.vibrate,
  soundUri: alarm.soundUri,
  generation: alarm.generation,
  briefing: alarm.briefing,
});

/** Brands whose battery savers are known to stop alarm apps (guidance only). */
const AGGRESSIVE_OEMS =
  /xiaomi|redmi|poco|oppo|realme|vivo|oneplus|huawei|honor|infinix|tecno|itel|samsung/i;

export const needsBatteryGuidance = (health: AlarmHealth): boolean =>
  health.available &&
  !health.ignoringBatteryOptimizations &&
  AGGRESSIVE_OEMS.test(health.manufacturer);

/** How long after Dismiss opening LAFINA still plays the morning briefing. */
export const BRIEFING_WINDOW_MS = 10 * 60 * 1000;

const NATIVE_ALARM_TIMEOUT_MS = 5_000;

const boundedNativeAlarm = <T>(work: Promise<T>, what: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() =>
        reject(new Error(`${what} did not answer within ${NATIVE_ALARM_TIMEOUT_MS} ms`)),
      NATIVE_ALARM_TIMEOUT_MS,
    );
    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

let activeOwner: string | null = null;
let lifecycleSeq = 0;
let pending: Promise<void> = Promise.resolve();
const briefingListeners = new Set<(alarm: Alarm) => void>();

/** Called when a wake-up alarm with a morning briefing was dismissed (A4). */
export const onAlarmDismissedForBriefing = (
  listener: (alarm: Alarm) => void,
) => {
  briefingListeners.add(listener);
  return () => {
    briefingListeners.delete(listener);
  };
};

/**
 * Hands native exactly the active owner's alarms (none when signed out) and
 * stores each alarm's next ring for the screens. Serialized, so two quick
 * edits can't book out of order.
 */
export const reconcileAlarms = (userId: string | null): Promise<void> => {
  const run = async (): Promise<void> => {
    const alarms = userId ? alarmsStore.list(userId) : [];
    const module = native();
    if (!module) {
      db.transactionSync(tx => {
        for (const alarm of alarms) {
          const next = nextAlarmTrigger(alarm);
          const nextIso = next ? next.toISOString() : null;
          if (alarm.nextTriggerAt !== nextIso) {
            alarmsStore.setNextTrigger(alarm.id, nextIso, tx);
          }
        }
      });
      return;
    }
    try {
      const booked = await boundedNativeAlarm(
        Promise.resolve(module.reconcile(alarms.map(toNative))),
        'Alarm reconcile',
      );
      const existingById = new Map(alarms.map(a => [a.id, a.nextTriggerAt]));
      db.transactionSync(tx => {
        for (const entry of booked) {
          if (!entry || typeof entry.id !== 'string') continue;
          const nextIso =
            typeof entry.nextTriggerMs === 'number' &&
            Number.isFinite(entry.nextTriggerMs)
              ? new Date(entry.nextTriggerMs).toISOString()
              : null;
          if (existingById.get(entry.id) !== nextIso) {
            alarmsStore.setNextTrigger(entry.id, nextIso, tx);
          }
        }
      });
    } catch (error) {
      console.warn('[alarmService] Could not book alarms:', error);
    }
  };
  pending = pending.then(run, run);
  return pending;
};

/** Records native's queued events: last ring, outcome, finished one-shots. */
export const syncAlarmEvents = async (
  userId: string | null,
  now: number = Date.now(),
): Promise<AlarmNativeEvent[]> => {
  const module = native();
  if (!module) return [];
  let events: AlarmNativeEvent[] = [];
  try {
    events = await boundedNativeAlarm(
      Promise.resolve(module.drainEvents()),
      'Alarm event drain',
    );
  } catch (error) {
    console.warn('[alarmService] Could not read alarm events:', error);
    return [];
  }
  let changed = false;
  const dismissedBriefings: Alarm[] = [];
  if (Array.isArray(events) && events.length > 0) {
    db.transactionSync(tx => {
      for (const event of events) {
        if (!event || typeof event.alarmId !== 'string') continue;
        const atMs = Number.isFinite(event.atMs) ? event.atMs : now;
        const at = new Date(atMs).toISOString();
        if (event.kind === 'one_shot_done') {
          alarmsStore.markOneShotDone(event.alarmId, event.generation, tx);
          changed = true;
        } else {
          alarmsStore.recordOutcome(event.alarmId, event.kind, at, tx);
        }
        // A wake-up briefing only soon after the student dismissed the alarm
        // (long enough to unlock the phone, never hours later).
        if (
          userId &&
          event.kind === 'dismissed' &&
          now - atMs >= -60_000 &&
          now - atMs < BRIEFING_WINDOW_MS
        ) {
          const alarm = alarmsStore.get(event.alarmId, userId, tx);
          if (alarm?.briefing) dismissedBriefings.push(alarm);
        }
      }
    });
  }
  for (const alarm of dismissedBriefings) {
    for (const listener of Array.from(briefingListeners)) {
      try {
        listener(alarm);
      } catch (error) {
        console.warn('[alarmService] Briefing listener failed:', error);
      }
    }
  }
  if (changed) await reconcileAlarms(userId);
  return events;
};

export const getAlarmHealth = async (): Promise<AlarmHealth> => {
  const module = native();
  if (!module)
    return {
      canScheduleExactAlarms: true,
      canUseFullScreenIntent: true,
      notificationsEnabled: true,
      ignoringBatteryOptimizations: true,
      manufacturer: '',
      available: false,
    };
  try {
    return {...(await module.getStatus()), available: true};
  } catch {
    return {
      canScheduleExactAlarms: false,
      canUseFullScreenIntent: false,
      notificationsEnabled: false,
      ignoringBatteryOptimizations: false,
      manufacturer: '',
      available: true,
    };
  }
};

/** Rings a test alarm (default 60 s from now). Resolves the time, or null. */
export const ringTestAlarm = async (
  seconds = 60,
  soundUri?: string | null,
): Promise<Date | null> => {
  const module = native();
  if (!module) return null;
  try {
    if (soundUri !== undefined && module.testAlarmWithSound) {
      return new Date(await module.testAlarmWithSound(seconds, soundUri));
    }
    return new Date(await module.testAlarm(seconds));
  } catch (error) {
    console.warn('[alarmService] Test alarm failed:', error);
    return null;
  }
};

export const openBatterySettings = async (): Promise<boolean> => {
  try {
    return (await native()?.openBatterySettings()) ?? false;
  } catch {
    return false;
  }
};

/** The next ring among the owner's alarms (for Home and Schedule). */
export const nextAlarm = (
  userId: string,
  now: Date = new Date(),
): {alarm: Alarm; at: Date} | null => {
  let best: {alarm: Alarm; at: Date} | null = null;
  for (const alarm of alarmsStore.list(userId)) {
    const at = nextAlarmTrigger(alarm, now);
    if (at && (!best || at.getTime() < best.at.getTime())) best = {alarm, at};
  }
  return best;
};

/**
 * App lifecycle: book on start, on owner change, after every change and when
 * the app comes back; read native's events at the same points. Returns the
 * cleanup for React's effect.
 */
export const startAlarmLifecycle = (userId: string | null): (() => void) => {
  const seq = ++lifecycleSeq;
  activeOwner = userId;
  // Alarm plan A4: old "Alarm" reminders become real alarms (idempotent).
  if (userId) migrateAlarmReminders(userId);
  void syncAlarmEvents(userId)
    .then(() => (seq === lifecycleSeq ? reconcileAlarms(userId) : undefined))
    .catch(() => undefined);
  const unsubscribeStore = onAlarmsChanged(changedOwner => {
    if (seq === lifecycleSeq && changedOwner === activeOwner) {
      void reconcileAlarms(activeOwner).catch(() => undefined);
    }
  });
  const subscription = AppState.addEventListener('change', state => {
    if (seq === lifecycleSeq && state === 'active') {
      void syncAlarmEvents(activeOwner)
        .then(() =>
          seq === lifecycleSeq ? reconcileAlarms(activeOwner) : undefined,
        )
        .catch(() => undefined);
    }
  });
  return () => {
    if (seq === lifecycleSeq) {
      lifecycleSeq += 1;
      activeOwner = null;
    }
    unsubscribeStore();
    subscription.remove();
  };
};
