/**
 * Codex audit A4 (codex-audit-20261106-phase11.md): controlled interruption of
 * the background-entry reconcile. These tests pin the RESIDUAL limitation
 * rather than hide it: when a pass is cut off before it cancels an obsolete
 * registration, Android still holds it until a later pass, and only JS
 * admission (on open) can dismiss a call it fires. Real SQLite with a
 * stateful fake of the native registry; no Android alarm is claimed.
 */
import {NativeModules} from 'react-native';
import {db, initDatabase, remindersStore} from '../../src/storage';
import {
  admitReminderCall,
  disconnectCall,
  NATIVE_CALL_TIMEOUT_MS,
  reconcileReminderDelivery,
} from '../../src/scheduler';
import type {NativeDeliveryRegistration} from '../../src/scheduler';

const A = 'a4-owner';
type NativeMock = Record<string, jest.Mock>;
const native = (): NativeMock => NativeModules.LafinaReminder as unknown as NativeMock;

const installFakeRegistry = () => {
  const registry = new Map<string, NativeDeliveryRegistration>();
  const original = {...native()};
  const module = native();
  module.scheduleExactAlarm = jest.fn(async options => {
    registry.set(options.reminderId, {
      reminderId: options.reminderId,
      ownerId: options.ownerId,
      generation: options.generation,
      triggerAtMs: options.triggerAtMs,
      armed: true,
    });
    return true;
  });
  module.cancelAlarm = jest.fn(async (reminderId: string) => {
    registry.delete(reminderId);
    return true;
  });
  module.listDeliveryRegistrations = jest.fn(async () =>
    Array.from(registry.values()).map(entry => ({...entry})),
  );
  module.drainDeliveryReceipts = jest.fn(async () => []);
  module.setDeliveryOwner = jest.fn(async () => true);
  return {registry, restore: () => Object.assign(module, original)};
};

const iso = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();

const insert = (id: string, offsetMs: number): void =>
  remindersStore.insertReminder({
    id,
    userId: A,
    task: `Synthetic ${id}`,
    description: null,
    scheduledAt: iso(offsetMs),
    triggerAt: iso(offsetMs),
    status: 'pending',
    preCastAudioPath: null,
  });

/** A raw retirement (like a sync upsert) that does not touch Android. */
const retireRaw = (id: string): void => {
  db.executeSync('UPDATE reminders SET deleted_at = ?, updated_at = ? WHERE id = ?', [iso(0), iso(0), id]);
};

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  for (const level of ['log', 'warn', 'error'] as const) {
    jest.spyOn(console, level).mockImplementation(() => undefined);
  }
  for (const table of ['sync_outbox', 'reminders', 'reminder_delivery_jobs', 'reminder_delivery_events', 'active_session']) {
    db.executeSync(`DELETE FROM ${table}`);
  }
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [A, A, `${A}@example.invalid`, now, now],
  );
});

afterEach(() => {
  disconnectCall();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('codex audit A4: interrupted background reconcile (residual limitation)', () => {
  it('a pass cut off before cancelling leaves the obsolete registration; the next pass removes it', async () => {
    const fake = installFakeRegistry();
    try {
      insert('r-stale', 60 * 60_000);
      await reconcileReminderDelivery(A);
      retireRaw('r-stale');

      // Fault: the process dies while the background pass is listing.
      native().listDeliveryRegistrations.mockImplementationOnce(() =>
        Promise.reject(new Error('process killed mid-pass')),
      );
      await reconcileReminderDelivery(A);
      // RESIDUAL: Android still holds work SQLite has retired, and could ring it.
      expect(fake.registry.has('r-stale')).toBe(true);

      // If it fires before the next pass, JS admission dismisses it on open
      // and cancels it (the ringtone may already have played natively).
      expect(admitReminderCall({reminderId: 'r-stale', ownerId: A, generation: 1}, A)).toMatchObject({
        admitted: false,
      });

      // The next start (or foreground pass) removes it.
      fake.registry.set('r-stale', {reminderId: 'r-stale', ownerId: A, generation: 1, triggerAtMs: Date.parse(iso(60 * 60_000)), armed: true});
      await reconcileReminderDelivery(A);
      expect(fake.registry.has('r-stale')).toBe(false);
    } finally {
      fake.restore();
    }
  });

  it('a pass interrupted between cancels keeps the cancelled ones cancelled and retries the rest', async () => {
    const fake = installFakeRegistry();
    try {
      insert('r-one', 60 * 60_000);
      insert('r-two', 2 * 60 * 60_000);
      await reconcileReminderDelivery(A);
      retireRaw('r-one');
      retireRaw('r-two');
      const cancel = native().cancelAlarm.getMockImplementation()!;
      native().cancelAlarm
        .mockImplementationOnce(cancel)
        .mockImplementationOnce(() => Promise.reject(new Error('bridge torn down')));
      const summary = await reconcileReminderDelivery(A);
      expect(summary.cancelled).toBe(1);
      expect(fake.registry.size).toBe(1);

      await reconcileReminderDelivery(A);
      expect(fake.registry.size).toBe(0);
    } finally {
      fake.restore();
    }
  });

  it('a native call that never answers no longer blocks every later pass in this process', async () => {
    const fake = installFakeRegistry();
    try {
      insert('r-hang', 60 * 60_000);
      await reconcileReminderDelivery(A);
      retireRaw('r-hang');

      jest.useFakeTimers();
      native().listDeliveryRegistrations.mockImplementationOnce(() => new Promise(() => undefined));
      const hung = reconcileReminderDelivery(A);
      const next = reconcileReminderDelivery(A);
      await jest.advanceTimersByTimeAsync(NATIVE_CALL_TIMEOUT_MS + 1);
      await hung;
      await next;
      jest.useRealTimers();
      // The queued pass ran after the bounded one and removed the stale work.
      expect(fake.registry.has('r-hang')).toBe(false);
    } finally {
      fake.restore();
    }
  });
});
