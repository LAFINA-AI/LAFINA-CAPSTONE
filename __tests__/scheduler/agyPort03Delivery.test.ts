/**
 * AGY-PORT 03: durable reminder delivery jobs, identities, fences and the
 * single authoritative engine, on real SQLite (node:sqlite) with a stateful
 * fake of the native delivery registry. Fakes are contract evidence only; no
 * Android alarm, notification or ringtone is claimed from these tests.
 */
import {DeviceEventEmitter, NativeModules} from 'react-native';
import {
  db,
  deliveryIdentityUri,
  deliveryNotificationTag,
  deliveryStore,
  guestMigration,
  initDatabase,
  remindersStore,
  tasksStore,
} from '../../src/storage';
import {
  acknowledgeReminderAction,
  admitReminderCall,
  answerCall,
  autoSnoozeReminderAction,
  checkAndTriggerReminders,
  EVENT_CALL_TRIGGER,
  manualAcknowledgeCall,
  disconnectCall,
  reconcileIfDeliveryChanged,
  reconcileReminderDelivery,
  rescheduleUserReminders,
  scheduleReminderAlarm,
  shouldDispatchInJs,
  snoozeReminderAction,
} from '../../src/scheduler';
import type {NativeDeliveryRegistration} from '../../src/scheduler';

const A = 'delivery-owner-a';
const B = 'delivery-owner-b';
const GUEST = 'local_guest_user';

type NativeMock = Record<string, jest.Mock>;
const native = (): NativeMock =>
  NativeModules.LafinaReminder as unknown as NativeMock;

/** Stateful fake of the Kotlin registry: one registration per reminder. */
const installFakeRegistry = () => {
  const registry = new Map<string, NativeDeliveryRegistration>();
  const receipts: Array<Record<string, unknown>> = [];
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
  module.drainDeliveryReceipts = jest.fn(async () =>
    receipts.splice(0, receipts.length),
  );
  module.setDeliveryOwner = jest.fn(async () => true);
  return {
    registry,
    receipts,
    restore: () => Object.assign(module, original),
  };
};

const iso = (offsetMs: number): string =>
  new Date(Date.now() + offsetMs).toISOString();

const insert = (
  id: string,
  owner: string,
  offsetMs: number,
  status: 'pending' | 'snoozed' | 'triggered' | 'acknowledged' = 'pending',
  task = `Synthetic ${id}`,
): void => {
  remindersStore.insertReminder({
    id,
    userId: owner,
    task,
    description: null,
    scheduledAt: iso(offsetMs),
    triggerAt: iso(offsetMs),
    status,
    preCastAudioPath: null,
  });
};

const job = (id: string) => deliveryStore.get(id)!;
const outboxCount = (): number =>
  Number(db.executeSync('SELECT COUNT(*) AS n FROM sync_outbox').rows[0].n);

const addUser = (id: string): void => {
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
};

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  for (const table of [
    'sync_outbox',
    'reminders',
    'reminder_delivery_jobs',
    'reminder_delivery_events',
    'tasks',
    'user_preferences',
    'active_session',
    'users',
  ]) {
    db.executeSync(`DELETE FROM ${table}`);
  }
  [A, B, GUEST].forEach(addUser);
});

afterEach(() => {
  disconnectCall();
  jest.restoreAllMocks();
});

describe('schema 19 delivery jobs follow every reminder writer', () => {
  test('create makes one armed generation-1 job and exactly one outbox row', () => {
    insert('r1', A, 60_000);
    expect(job('r1')).toMatchObject({
      userId: A,
      generation: 1,
      state: 'armed',
      registrationState: 'unregistered',
    });
    expect(outboxCount()).toBe(1);
  });

  test('ringing keeps the generation; ACK retires without a bump; repeats are no-ops', () => {
    insert('r1', A, 60_000);
    remindersStore.updateReminderStatus('r1', 'triggered');
    expect(job('r1')).toMatchObject({generation: 1, state: 'ringing'});
    remindersStore.acknowledgeReminder('r1');
    expect(job('r1')).toMatchObject({generation: 1, state: 'retired'});
    const before = job('r1').updatedAt;
    db.executeSync(
      "UPDATE reminders SET status = 'acknowledged' WHERE id = 'r1'",
    );
    expect(job('r1')).toMatchObject({generation: 1, updatedAt: before});
  });

  test('a new instant, deletion, owner change or re-arm bumps the generation', () => {
    insert('r1', A, 60_000);
    remindersStore.snoozeReminderAt('r1', iso(120_000));
    expect(job('r1')).toMatchObject({generation: 2, state: 'armed'});
    remindersStore.updateReminderStatus('r1', 'triggered');
    remindersStore.updateReminderStatus('r1', 'pending');
    expect(job('r1').generation).toBe(3);
    remindersStore.deleteReminder('r1');
    expect(job('r1')).toMatchObject({generation: 4, state: 'retired'});
    db.executeSync("DELETE FROM reminders WHERE id = 'r1'");
    expect(job('r1')).toMatchObject({generation: 5, state: 'retired'});
    insert('r1', A, 60_000);
    expect(job('r1')).toMatchObject({generation: 6, state: 'armed'});
  });

  test('task text edits re-register without invalidating the identity', () => {
    insert('r1', A, 60_000);
    deliveryStore.recordRegistration('r1', 1, 'registered');
    db.executeSync("UPDATE reminders SET task = 'Renamed' WHERE id = 'r1'");
    expect(job('r1')).toMatchObject({
      generation: 1,
      registrationState: 'unregistered',
    });
    remindersStore.updateReminderStatus('r1', 'triggered');
    db.executeSync(
      "UPDATE reminders SET task = 'Renamed again' WHERE id = 'r1'",
    );
    expect(job('r1')).toMatchObject({generation: 1, state: 'ringing'});
  });

  test('sync-pull upserts bump only when delivery fields change, and write no outbox rows', () => {
    insert('r1', A, 60_000);
    const row = remindersStore.getReminderById('r1')!;
    const outbox = outboxCount();
    const upsert = (triggerAt: string, status: string) =>
      db.executeSync(
        `INSERT INTO reminders (id, user_id, task, description, scheduled_at, trigger_at, status, snooze_count, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, 0, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET task = excluded.task, scheduled_at = excluded.scheduled_at,
           trigger_at = excluded.trigger_at, status = excluded.status, updated_at = excluded.updated_at, deleted_at = NULL`,
        [
          row.id,
          A,
          row.task,
          row.scheduledAt,
          triggerAt,
          status,
          row.createdAt,
          iso(0),
        ],
      );
    upsert(row.triggerAt, 'pending');
    expect(job('r1').generation).toBe(1);
    upsert(iso(300_000), 'pending');
    expect(job('r1').generation).toBe(2);
    expect(outboxCount()).toBe(outbox);
  });

  test('guest linking rekeys the job atomically with the reminder', async () => {
    insert('rg', GUEST, 60_000);
    await guestMigration.linkGuestToCloudAccount(B, 'b@example.invalid');
    expect(job('rg')).toMatchObject({userId: B, generation: 2, state: 'armed'});
  });

  test('a rolled-back writer leaves the job untouched', () => {
    insert('r1', A, 60_000);
    expect(() =>
      db.transactionSync(tx => {
        tx.executeSync("UPDATE reminders SET trigger_at = ? WHERE id = 'r1'", [
          iso(500_000),
        ]);
        throw new Error('synthetic failure');
      }),
    ).toThrow('synthetic failure');
    expect(job('r1').generation).toBe(1);
  });

  test('delivery evidence is bounded and redacted', () => {
    insert('r1', A, 60_000, 'pending', 'Private exam topic');
    for (let i = 0; i < 520; i += 1) {
      deliveryStore.recordEvent({
        reminderId: 'r1',
        userId: A,
        generation: 1,
        event: 'call_admitted',
      });
    }
    const rows = db.executeSync('SELECT * FROM reminder_delivery_events').rows;
    expect(rows.length).toBe(500);
    expect(JSON.stringify(rows)).not.toContain('Private exam topic');
  });

  test('exact-source linkage is owner-checked and local-only', () => {
    tasksStore.insertTask({
      id: 't-a',
      userId: A,
      title: 'Lab report',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Medium',
      category: 'academic',
      notes: null,
      recurrenceRule: null,
    });
    insert('r1', A, 60_000);
    insert('r2', B, 60_000);
    const outbox = outboxCount();
    deliveryStore.linkSource('r1', 'task', 't-a');
    expect(deliveryStore.findBySource(A, 'task', 't-a')).toEqual(['r1']);
    expect(() => deliveryStore.linkSource('r2', 'task', 't-a')).toThrow(
      'ownership',
    );
    expect(outboxCount()).toBe(outbox);
  });
});

describe('identities', () => {
  test('full URIs and tags keep Java hash-colliding reminder IDs apart', () => {
    // "Aa" and "BB" share a Java String.hashCode(), the old request code and notification id.
    const aa = deliveryIdentityUri(
      {ownerId: A, reminderId: 'Aa', generation: 1},
      'due',
    );
    const bb = deliveryIdentityUri(
      {ownerId: A, reminderId: 'BB', generation: 1},
      'due',
    );
    expect(aa).not.toBe(bb);
    expect(deliveryNotificationTag('Aa')).not.toBe(
      deliveryNotificationTag('BB'),
    );
  });

  test('shared vector with LafinaDeliveryContractTest.kt', () => {
    expect(
      deliveryIdentityUri(
        {ownerId: 'user@ustp.edu.ph', reminderId: 'rem 1/ü~', generation: 7},
        'due',
      ),
    ).toBe(
      'lafina-capstone://reminder/due/user%40ustp.edu.ph/rem%201%2F%C3%BC%7E/7',
    );
    expect(
      deliveryIdentityUri(
        {ownerId: '', reminderId: 'r', generation: 0},
        'call',
      ),
    ).toBe('lafina-capstone://reminder/call/~/r/0');
    expect(() =>
      deliveryIdentityUri({ownerId: A, reminderId: '', generation: 1}, 'due'),
    ).toThrow();
  });

  test('registration carries the job identity and records a receipt', async () => {
    insert('r1', A, 60_000);
    await scheduleReminderAlarm('r1', 'Synthetic r1', iso(60_000));
    expect(native().scheduleExactAlarm).toHaveBeenCalledWith(
      expect.objectContaining({reminderId: 'r1', ownerId: A, generation: 1}),
    );
    expect(job('r1')).toMatchObject({
      registrationState: 'registered',
      registeredGeneration: 1,
    });
    expect(deliveryStore.listEvents('r1').map(e => e.event)).toEqual([
      'registered',
    ]);
  });

  test('a late receipt for an older generation never covers newer work', () => {
    insert('r1', A, 60_000);
    remindersStore.snoozeReminderAt('r1', iso(120_000));
    deliveryStore.recordRegistration('r1', 1, 'registered');
    expect(job('r1')).toMatchObject({
      generation: 2,
      registrationState: 'unregistered',
      registeredGeneration: 0,
    });
  });
});

describe('captured-identity action fences', () => {
  test('rejects an old generation after another writer moved the reminder', async () => {
    insert('r1', A, -1_000, 'triggered');
    const captured = job('r1').generation;
    remindersStore.snoozeReminderAt('r1', iso(600_000));
    const outbox = outboxCount();
    const result = await acknowledgeReminderAction('r1', A, captured);
    expect(result).toMatchObject({ok: false, fenceReason: 'stale_generation'});
    expect(remindersStore.getReminderById('r1')!.status).toBe('snoozed');
    expect(outboxCount()).toBe(outbox);
    expect(deliveryStore.listEvents('r1').map(e => e.code)).toContain(
      'stale_generation',
    );
  });

  test('acknowledges once; a repeated ACK is inert and never completes a task', async () => {
    tasksStore.insertTask({
      id: 't-ack',
      userId: A,
      title: 'Synthetic r1',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Medium',
      category: 'academic',
      notes: null,
      recurrenceRule: null,
    });
    insert('r1', A, -1_000, 'triggered');
    expect((await acknowledgeReminderAction('r1', A, 1)).ok).toBe(true);
    const repeat = await acknowledgeReminderAction('r1', A, 1);
    expect(repeat).toMatchObject({ok: false, fenceReason: 'not_actionable'});
    expect(tasksStore.getAllTasks(A)[0].isCompleted).toBe(false);
  });

  test('keeps a committed snooze when Android rejects the alarm and retries later', async () => {
    insert('r1', A, -1_000, 'triggered');
    native().scheduleExactAlarm.mockRejectedValueOnce(
      Object.assign(new Error('denied'), {code: 'ALARM_ERROR'}),
    );
    const result = await snoozeReminderAction('r1', A, 5, 1);
    expect(result).toMatchObject({
      ok: true,
      outcome: 'snoozed',
      deliveryPending: true,
    });
    expect(remindersStore.getReminderById('r1')!.status).toBe('snoozed');
    expect(job('r1')).toMatchObject({
      generation: 2,
      registrationState: 'failed',
      registrationError: 'alarm_error',
      registrationAttempts: 1,
    });
    // Foreground fallback may ring it; reconcile retries the registration.
    expect(shouldDispatchInJs('r1')).toBe(true);
    const fake = installFakeRegistry();
    try {
      const summary = await reconcileReminderDelivery(A);
      expect(summary.registered).toBe(1);
      expect(job('r1')).toMatchObject({
        registrationState: 'registered',
        registeredGeneration: 2,
      });
    } finally {
      fake.restore();
    }
  });

  test('a stale auto-snooze or another owner cannot act', async () => {
    insert('r1', A, -1_000, 'triggered');
    remindersStore.updateReminderStatus('r1', 'pending');
    expect((await autoSnoozeReminderAction('r1', A, 1)).ok).toBe(false);
    expect((await snoozeReminderAction('r1', B, 5, 2)).ok).toBe(false);
    expect(remindersStore.getReminderById('r1')!.status).toBe('pending');
  });

  test('generation 0 (adopted legacy registration) is accepted only at the backfill generation', async () => {
    insert('r1', A, -1_000, 'triggered');
    expect((await acknowledgeReminderAction('r1', A, 0)).ok).toBe(true);
    expect((await acknowledgeReminderAction('r1', A, 0)).ok).toBe(false);
  });

  test('generation 0 is stale once the job has moved past its first generation', async () => {
    insert('r1', A, -1_000, 'triggered');
    remindersStore.snoozeReminderAt('r1', iso(60_000));
    expect(job('r1').generation).toBe(2);
    expect(await acknowledgeReminderAction('r1', A, 0)).toMatchObject({
      ok: false,
      fenceReason: 'stale_generation',
    });
    expect(
      admitReminderCall({reminderId: 'r1', ownerId: '', generation: 0}, A),
    ).toMatchObject({admitted: false, reason: 'stale_generation'});
    expect(remindersStore.getReminderById('r1')!.status).toBe('snoozed');
  });

  test('callers without a captured identity keep AGY owner-only behavior', async () => {
    insert('r1', A, -1_000, 'triggered');
    remindersStore.snoozeReminderAt('r1', iso(60_000));
    expect((await acknowledgeReminderAction('r1', A)).ok).toBe(true);
  });

  test('an in-transaction guard failure rolls back the reminder and outbox', () => {
    insert('r1', A, -1_000, 'triggered');
    const outbox = outboxCount();
    expect(() =>
      remindersStore.acknowledgeReminder('r1', tx =>
        deliveryStore.assertFence(tx, 'r1', A, 99),
      ),
    ).toThrow('stale_generation');
    expect(remindersStore.getReminderById('r1')!.status).toBe('triggered');
    expect(outboxCount()).toBe(outbox);
  });
});

describe('single authoritative engine', () => {
  test('reconcile registers, keeps, re-registers a new generation and cancels retired work', async () => {
    const fake = installFakeRegistry();
    try {
      insert('r1', A, 60_000);
      insert('r2', A, 120_000);
      insert('r-past', A, -60_000);
      let summary = await reconcileReminderDelivery(A);
      expect(summary).toMatchObject({registered: 2, kept: 0, cancelled: 0});
      expect(fake.registry.get('r1')).toMatchObject({
        ownerId: A,
        generation: 1,
      });

      summary = await reconcileReminderDelivery(A);
      expect(summary).toMatchObject({registered: 0, kept: 2});

      remindersStore.snoozeReminderAt('r1', iso(300_000));
      remindersStore.acknowledgeReminder('r2');
      summary = await reconcileReminderDelivery(A);
      expect(summary).toMatchObject({registered: 1, kept: 0, cancelled: 1});
      expect(fake.registry.get('r1')).toMatchObject({generation: 2});
      expect(fake.registry.has('r2')).toBe(false);
    } finally {
      fake.restore();
    }
  });

  test('account switch suppresses the other owner and restores on return; logout cancels all', async () => {
    const fake = installFakeRegistry();
    try {
      insert('ra', A, 60_000);
      insert('rb', B, 60_000);
      await reconcileReminderDelivery(A);
      expect([...fake.registry.keys()]).toEqual(['ra']);

      await reconcileReminderDelivery(B);
      expect([...fake.registry.keys()]).toEqual(['rb']);
      expect(job('ra')).toMatchObject({
        state: 'armed',
        registrationState: 'suppressed',
      });
      expect(native().setDeliveryOwner).toHaveBeenLastCalledWith(B);

      await reconcileReminderDelivery(A);
      expect([...fake.registry.keys()]).toEqual(['ra']);
      expect(job('ra')).toMatchObject({registrationState: 'registered'});

      await reconcileReminderDelivery(null);
      expect(fake.registry.size).toBe(0);
      expect(native().setDeliveryOwner).toHaveBeenLastCalledWith('');
      expect(job('ra').state).toBe('armed');
    } finally {
      fake.restore();
    }
  });

  test('a registration Android dropped (force-stop) or adopted from legacy is replaced', async () => {
    const fake = installFakeRegistry();
    try {
      insert('r1', A, 60_000);
      insert('r2', A, 60_000);
      await reconcileReminderDelivery(A);
      fake.registry.get('r1')!.armed = false;
      fake.registry.set('r2', {
        ...fake.registry.get('r2')!,
        ownerId: '',
        generation: 0,
      });
      const summary = await reconcileReminderDelivery(A);
      expect(summary.registered).toBe(2);
      expect(fake.registry.get('r2')).toMatchObject({
        ownerId: A,
        generation: 1,
      });
    } finally {
      fake.restore();
    }
  });

  test('native receipts are drained into redacted events', async () => {
    const fake = installFakeRegistry();
    try {
      insert('r1', A, 60_000);
      fake.receipts.push(
        {
          atMs: Date.now(),
          event: 'fired',
          reminderId: 'r1',
          ownerId: A,
          generation: 1,
        },
        {
          atMs: Date.now(),
          event: 'duplicate_ignored',
          reminderId: 'r1',
          ownerId: A,
          generation: 1,
        },
      );
      const summary = await reconcileReminderDelivery(A);
      expect(summary.receipts).toBe(2);
      expect(
        deliveryStore
          .listEvents('r1')
          .filter(e => e.origin === 'native')
          .map(e => e.event),
      ).toEqual(['fired', 'duplicate_ignored']);
    } finally {
      fake.restore();
    }
  });

  test('concurrent reconcile calls are serialized and do not double-register', async () => {
    const fake = installFakeRegistry();
    try {
      insert('r1', A, 60_000);
      await Promise.all([
        reconcileReminderDelivery(A),
        reconcileReminderDelivery(A),
      ]);
      expect(native().scheduleExactAlarm).toHaveBeenCalledTimes(1);
    } finally {
      fake.restore();
    }
  });

  test('the JS poller leaves natively registered generations to Android', async () => {
    const emit = jest.spyOn(DeviceEventEmitter, 'emit');
    insert('r-native', A, -2_000);
    insert('r-fallback', A, -2_000);
    deliveryStore.recordRegistration('r-native', 1, 'registered');
    deliveryStore.recordRegistration('r-fallback', 1, 'failed', 'denied');
    await checkAndTriggerReminders(A);
    expect(remindersStore.getReminderById('r-native')!.status).toBe('pending');
    expect(remindersStore.getReminderById('r-fallback')!.status).toBe(
      'triggered',
    );
    const calls = emit.mock.calls.filter(
      call => call[0] === EVENT_CALL_TRIGGER,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({
      reminderId: 'r-fallback',
      ownerId: A,
      generation: 1,
    });
  });

  test('without the native module the poller is the engine', async () => {
    const saved = NativeModules.LafinaReminder;
    insert('r1', A, -2_000);
    deliveryStore.recordRegistration('r1', 1, 'registered');
    try {
      NativeModules.LafinaReminder = undefined;
      expect(shouldDispatchInJs('r1')).toBe(true);
      expect((await reconcileReminderDelivery(A)).nativeAvailable).toBe(false);
    } finally {
      NativeModules.LafinaReminder = saved;
    }
  });

  test('lifecycle reschedule reports registrations through reconcile', async () => {
    const fake = installFakeRegistry();
    try {
      insert('r1', A, 60_000);
      insert('r-stale', A, -30 * 60_000);
      const summary = await rescheduleUserReminders(A);
      expect(summary).toMatchObject({rescheduled: 1, missed: 1});
      expect(job('r-stale').state).toBe('retired');
    } finally {
      fake.restore();
    }
  });
});

describe('review follow-up: text refresh and conservative fallback', () => {
  test('a sync text-only update reaches the native registration on the next reconcile', async () => {
    const fake = installFakeRegistry();
    try {
      insert('r1', A, 60_000, 'pending', 'Old title');
      await reconcileReminderDelivery(A);
      expect(native().scheduleExactAlarm).toHaveBeenCalledTimes(1);
      const row = remindersStore.getReminderById('r1')!;
      // Same shape as syncWorker.applyReminder's upsert, only the text differs.
      db.executeSync(
        `INSERT INTO reminders (id, user_id, task, description, scheduled_at, trigger_at, status, snooze_count, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, NULL, ?, ?, 'pending', 0, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET task = excluded.task, scheduled_at = excluded.scheduled_at,
           trigger_at = excluded.trigger_at, status = excluded.status, updated_at = excluded.updated_at, deleted_at = NULL`,
        [
          row.id,
          A,
          'New title from another device',
          row.scheduledAt,
          row.triggerAt,
          row.createdAt,
          iso(0),
        ],
      );
      expect(job('r1')).toMatchObject({
        generation: 1,
        registrationState: 'unregistered',
      });
      const summary = await reconcileReminderDelivery(A);
      expect(summary).toMatchObject({registered: 1, kept: 0});
      expect(native().scheduleExactAlarm).toHaveBeenLastCalledWith(
        expect.objectContaining({
          reminderId: 'r1',
          task: 'New title from another device',
          generation: 1,
        }),
      );
      expect(job('r1').registrationState).toBe('registered');
      expect((await reconcileReminderDelivery(A)).kept).toBe(1);
    } finally {
      fake.restore();
    }
  });

  test('the JS fallback does not ring what native still holds, or when native cannot be read', async () => {
    const emit = jest.spyOn(DeviceEventEmitter, 'emit');
    const fake = installFakeRegistry();
    try {
      insert('r-held', A, -2_000);
      deliveryStore.recordRegistration('r-held', 1, 'failed', 'receipt_lost');
      fake.registry.set('r-held', {
        reminderId: 'r-held',
        ownerId: A,
        generation: 1,
        triggerAtMs: Date.now() - 2_000,
        armed: true,
      });
      await checkAndTriggerReminders(A);
      expect(remindersStore.getReminderById('r-held')!.status).toBe('pending');

      native().listDeliveryRegistrations.mockRejectedValueOnce(
        new Error('bridge down'),
      );
      insert('r-unknown', A, -2_000);
      await checkAndTriggerReminders(A);
      expect(remindersStore.getReminderById('r-unknown')!.status).toBe(
        'pending',
      );

      fake.registry.delete('r-held');
      await checkAndTriggerReminders(A);
      expect(remindersStore.getReminderById('r-held')!.status).toBe(
        'triggered',
      );
      expect(
        emit.mock.calls.filter(call => call[0] === EVENT_CALL_TRIGGER),
      ).toHaveLength(2);
    } finally {
      fake.restore();
    }
  });
});

describe('reconcile failure is contained', () => {
  test('a storage failure is reported, not thrown, and nothing is cancelled', async () => {
    const fake = installFakeRegistry();
    try {
      insert('r1', A, 60_000);
      await reconcileReminderDelivery(A);
      jest.spyOn(deliveryStore, 'listWithTask').mockImplementation(() => {
        throw new Error('storage unavailable');
      });
      const summary = await reconcileReminderDelivery(A);
      expect(summary.error).toBe('storage unavailable');
      expect(fake.registry.has('r1')).toBe(true);
      expect(native().cancelAlarm).not.toHaveBeenCalled();
    } finally {
      fake.restore();
    }
  });
});

describe('call admission and in-call fences', () => {
  test('admits the active owner and captures the generation', () => {
    insert('r1', A, -1_000);
    const admission = admitReminderCall(
      {reminderId: 'r1', ownerId: A, generation: 1},
      A,
    );
    expect(admission).toMatchObject({admitted: true, generation: 1});
  });

  test('another owner, logout or a stale generation is inert and cancels nothing newer', () => {
    insert('r1', A, -1_000);
    expect(admitReminderCall({reminderId: 'r1'}, B)).toMatchObject({
      admitted: false,
      reason: 'owner_mismatch',
    });
    expect(admitReminderCall({reminderId: 'r1'}, null)).toMatchObject({
      admitted: false,
      reason: 'no_active_owner',
    });
    remindersStore.snoozeReminderAt('r1', iso(60_000));
    expect(
      admitReminderCall({reminderId: 'r1', ownerId: A, generation: 1}, A),
    ).toMatchObject({admitted: false, reason: 'stale_generation'});
    expect(native().finishIncomingCall).toHaveBeenCalledWith('r1');
    expect(native().cancelAlarm).not.toHaveBeenCalled();
  });

  test('a retired job dismisses and cancels its own alarm', () => {
    insert('r1', A, -1_000, 'acknowledged');
    expect(
      admitReminderCall({reminderId: 'r1', ownerId: A, generation: 1}, A),
    ).toMatchObject({admitted: false, reason: 'not_actionable'});
    expect(native().cancelAlarm).toHaveBeenCalledWith('r1');
  });

  test('hash-colliding reminders are admitted and dismissed independently', () => {
    insert('Aa', A, -1_000);
    insert('BB', A, -1_000);
    expect(
      admitReminderCall({reminderId: 'Aa', ownerId: A, generation: 1}, A)
        .admitted,
    ).toBe(true);
    remindersStore.acknowledgeReminder('BB');
    admitReminderCall({reminderId: 'BB', ownerId: A, generation: 1}, A);
    expect(native().finishIncomingCall.mock.calls).toEqual([['BB']]);
  });

  test('answering a stale identity starts no call; an edit mid-call makes buttons inert', async () => {
    insert('r1', A, -1_000);
    remindersStore.snoozeReminderAt('r1', iso(60_000));
    await answerCall('r1', A, false, undefined, 1);
    expect(native().startActiveCall).not.toHaveBeenCalled();
    expect(native().finishIncomingCall).toHaveBeenCalledWith('r1');

    insert('r2', A, -1_000);
    await answerCall('r2', A, false, undefined, 1);
    remindersStore.snoozeReminderAt('r2', iso(120_000));
    await manualAcknowledgeCall('r2', A);
    expect(remindersStore.getReminderById('r2')!.status).toBe('snoozed');
  });
});

describe('pre-advance remediation: one engine per generation and no stale registration', () => {
  test('the JS fallback rings only after the native foreground claim succeeds', async () => {
    const emit = jest.spyOn(DeviceEventEmitter, 'emit');
    const fake = installFakeRegistry();
    const module = native();
    try {
      insert('r-gap', A, -2_000);
      // Registration had failed, so the listing does not hold it and JS is the fallback.
      deliveryStore.recordRegistration('r-gap', 1, 'failed', 'receipt_lost');
      fake.registry.delete('r-gap');

      // Native fired in the gap after the listing: its claim wins, JS stays silent.
      module.claimForegroundDelivery = jest.fn(async () => 'already_claimed');
      await checkAndTriggerReminders(A);
      expect(module.claimForegroundDelivery).toHaveBeenCalledWith(
        'r-gap',
        A,
        job('r-gap').generation,
      );
      expect(remindersStore.getReminderById('r-gap')!.status).toBe('pending');

      // The claim cannot be made: native stays the engine.
      module.claimForegroundDelivery = jest.fn(async () => {
        throw new Error('bridge down');
      });
      await checkAndTriggerReminders(A);
      expect(remindersStore.getReminderById('r-gap')!.status).toBe('pending');

      // JS wins the claim: it rings exactly once with the captured generation.
      module.claimForegroundDelivery = jest.fn(async () => 'claimed');
      await checkAndTriggerReminders(A);
      expect(remindersStore.getReminderById('r-gap')!.status).toBe(
        'triggered',
      );
      const rings = emit.mock.calls.filter(
        call => call[0] === EVENT_CALL_TRIGGER,
      );
      expect(rings).toHaveLength(1);
      expect(rings[0][1]).toMatchObject({
        reminderId: 'r-gap',
        generation: job('r-gap').generation,
      });
    } finally {
      delete module.claimForegroundDelivery;
      fake.restore();
    }
  });

  test('a writer that does not cancel its alarm is corrected on the next poll, not at the next start', async () => {
    const fake = installFakeRegistry();
    try {
      insert('r-retire', A, 60 * 60_000);
      await reconcileIfDeliveryChanged(A);
      expect(fake.registry.has('r-retire')).toBe(true);

      // Nothing changed: no extra native traffic.
      native().listDeliveryRegistrations.mockClear();
      expect(await reconcileIfDeliveryChanged(A)).toBeNull();
      expect(native().listDeliveryRegistrations).not.toHaveBeenCalled();

      // A raw write (like a sync upsert) retires the job without touching Android.
      db.executeSync(
        'UPDATE reminders SET deleted_at = ?, updated_at = ? WHERE id = ?',
        [iso(0), iso(0), 'r-retire'],
      );
      expect(fake.registry.has('r-retire')).toBe(true);
      await checkAndTriggerReminders(A);
      expect(fake.registry.has('r-retire')).toBe(false);
      expect(native().cancelAlarm).toHaveBeenCalledWith('r-retire');
    } finally {
      fake.restore();
    }
  });
});
