/**
 * AGY-PORT 09: owner-scoped reminder health, explicit event defaults and
 * record-based Profile statistics, on real SQLite (node:sqlite). The native
 * reminder module is the Jest fake from jest.setup.js; nothing here claims
 * that an Android alarm, notification or call happened.
 */
import {NativeModules} from 'react-native';
import {
  db,
  deliveryStore,
  guestMigration,
  initDatabase,
  remindersStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {reminderHealthStore, RECENT_LIMIT} from '../../src/storage/reminderHealthStore';
import {
  applyEventMemoryToDraft,
  EVENT_MEMORY_KEY,
  personalMemoryStore as memory,
} from '../../src/storage/personalMemoryStore';
import {onTimeRate, profileStatisticsStore} from '../../src/storage/profileStatisticsStore';
import {
  PERMISSION_READ_TIMEOUT_MS,
  readReminderHealth,
  recoverReminderHealth,
  RECOVERY_TIMEOUT_MS,
} from '../../src/scheduler/reminderHealth';
import * as reconciler from '../../src/scheduler/deliveryReconciler';

const GUEST = 'local_guest_user';
type NativeMock = Record<string, jest.Mock>;
const native = (): NativeMock => NativeModules.LafinaReminder as unknown as NativeMock;

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `p09-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const reminder = (
  id: string,
  userId: string,
  offsetMs: number,
  status: 'pending' | 'snoozed' | 'triggered' | 'acknowledged' | 'missed' = 'pending',
): void => {
  const at = new Date(Date.now() + offsetMs).toISOString();
  remindersStore.insertReminder({
    id,
    userId,
    task: `Synthetic ${id}`,
    description: null,
    scheduledAt: at,
    triggerAt: at,
    status,
    preCastAudioPath: null,
  });
};

const nativeReceipt = (reminderId: string, event: string): void => {
  const job = deliveryStore.get(reminderId)!;
  deliveryStore.recordEvent({
    reminderId,
    userId: job.userId,
    generation: job.generation,
    event,
    origin: 'native',
  });
};

beforeAll(async () => {
  await initDatabase();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  db.executeSync('DELETE FROM active_session');
});

describe('AGY-PORT 09 reminder health (local evidence)', () => {
  it('separates queued, accepted, inexact, failed, held-back and ringing, for one owner only', () => {
    const a = owner('health');
    const b = owner('other');
    userStore.setCurrentUser(a);
    reminder(`${a}-queued`, a, 3600000);
    reminder(`${a}-exact`, a, 3600000);
    reminder(`${a}-inexact`, a, 3600000);
    reminder(`${a}-failed`, a, 3600000);
    reminder(`${a}-held`, a, 3600000);
    reminder(`${a}-ringing`, a, -60000, 'triggered');
    reminder(`${a}-done`, a, -60000, 'acknowledged');
    reminder(`${b}-exact`, b, 3600000);

    for (const id of [`${a}-exact`, `${a}-inexact`, `${b}-exact`]) {
      deliveryStore.recordRegistration(id, deliveryStore.get(id)!.generation, 'registered');
    }
    nativeReceipt(`${a}-exact`, 'registered');
    nativeReceipt(`${a}-inexact`, 'registered_inexact');
    deliveryStore.recordRegistration(
      `${a}-failed`,
      deliveryStore.get(`${a}-failed`)!.generation,
      'failed',
      'SecurityException',
    );
    deliveryStore.recordRegistration(
      `${a}-held`,
      deliveryStore.get(`${a}-held`)!.generation,
      'suppressed',
    );

    const health = reminderHealthStore.read(a);
    expect(health).toMatchObject({
      armed: 5,
      registered: 2,
      inexact: 1,
      queued: 1,
      blocked: 1,
      suppressed: 1,
      ringing: 1,
    });
    // An accepted registration is never described as a ring.
    expect(health.recent.map(item => item.label)).toEqual(
      expect.arrayContaining(['Alarm accepted by Android', 'Alarm accepted as inexact (may be late)']),
    );
    expect(health.recent.every(item => !/rang/i.test(item.label))).toBe(true);
    expect(JSON.stringify(health)).not.toContain('Synthetic');
    // Another signed-in account cannot read this owner's evidence...
    expect(() => reminderHealthStore.read(b)).toThrow(/Account changed/);
    // ...and each owner sees only its own jobs.
    userStore.setCurrentUser(b);
    expect(reminderHealthStore.read(b)).toMatchObject({armed: 1, registered: 1, inexact: 0});
  });

  it('counts a time change as waiting again and keeps the recent list bounded', () => {
    const a = owner('moved');
    reminder(`${a}-r`, a, 3600000);
    const job = deliveryStore.get(`${a}-r`)!;
    deliveryStore.recordRegistration(job.reminderId, job.generation, 'registered');
    nativeReceipt(job.reminderId, 'registered_inexact');
    expect(reminderHealthStore.read(a)).toMatchObject({registered: 1, inexact: 1, queued: 0});

    db.executeSync('UPDATE reminders SET trigger_at = ? WHERE id = ?', [
      new Date(Date.now() + 7300000).toISOString(),
      job.reminderId,
    ]);
    // The old generation's inexact receipt no longer describes the alarm.
    expect(reminderHealthStore.read(a)).toMatchObject({registered: 0, inexact: 0, queued: 1});

    // Re-registered for the new time, with no native receipt for it yet: the
    // old time's inexact receipt must not describe the new alarm.
    const moved = deliveryStore.get(job.reminderId)!;
    expect(moved.generation).toBeGreaterThan(job.generation);
    deliveryStore.recordRegistration(moved.reminderId, moved.generation, 'registered');
    expect(reminderHealthStore.read(a)).toMatchObject({registered: 1, inexact: 0, queued: 0});
    nativeReceipt(moved.reminderId, 'registered_inexact');
    expect(reminderHealthStore.read(a)).toMatchObject({registered: 1, inexact: 1});
    nativeReceipt(moved.reminderId, 'registered');
    expect(reminderHealthStore.read(a)).toMatchObject({registered: 1, inexact: 0});

    for (let i = 0; i < RECENT_LIMIT + 5; i += 1) nativeReceipt(job.reminderId, 'fired');
    expect(reminderHealthStore.read(a).recent).toHaveLength(RECENT_LIMIT);
  });

  it('refuses a read for an owner another signed-in account replaced', async () => {
    const a = owner('stale');
    const b = owner('signed-in');
    userStore.setCurrentUser(b);
    expect(() => reminderHealthStore.read(a)).toThrow(/Account changed/);
    const snapshot = await readReminderHealth(a);
    expect(snapshot.local).toBeNull();
    expect(snapshot.userId).toBe(a);
  });
});

describe('AGY-PORT 09 reminder health (Android access)', () => {
  it('passes a complete permission answer through unchanged', async () => {
    const a = owner('perm');
    native().getPermissionStatus.mockResolvedValueOnce({
      canScheduleExactAlarms: false,
      canUseFullScreenIntent: true,
      notificationsEnabled: true,
    });
    const snapshot = await readReminderHealth(a);
    expect(snapshot.permissions).toEqual({
      canScheduleExactAlarms: false,
      canUseFullScreenIntent: true,
      notificationsEnabled: true,
    });
    expect(snapshot.local).not.toBeNull();
  });

  it('treats a malformed, failed or hung permission read as unavailable', async () => {
    const a = owner('perm-bad');
    native().getPermissionStatus.mockResolvedValueOnce({notificationsEnabled: true});
    expect((await readReminderHealth(a)).permissions).toBeNull();

    native().getPermissionStatus.mockRejectedValueOnce(new Error('binder died'));
    expect((await readReminderHealth(a)).permissions).toBeNull();

    jest.useFakeTimers();
    native().getPermissionStatus.mockReturnValueOnce(new Promise(() => undefined));
    const pending = readReminderHealth(a);
    await jest.advanceTimersByTimeAsync(PERMISSION_READ_TIMEOUT_MS + 1);
    const snapshot = await pending;
    expect(snapshot.permissions).toBeNull();
    expect(snapshot.local).not.toBeNull();
  });
});

describe('AGY-PORT 09 reminder health (recovery)', () => {
  it('runs the existing reconciler only for the signed-in owner and never claims a ring', async () => {
    const a = owner('recover');
    const spy = jest.spyOn(reconciler, 'reconcileReminderDelivery');

    // No session row: recovery is refused (it would change native alarms).
    expect((await recoverReminderHealth(a)).ok).toBe(false);
    userStore.setCurrentUser(owner('someone-else'));
    expect((await recoverReminderHealth(a)).ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();

    userStore.setCurrentUser(a);
    reminder(`${a}-r`, a, 3600000);
    const result = await recoverReminderHealth(a);
    expect(spy).toHaveBeenCalledWith(a);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/^Registration requested: 1 registered/);
    expect(result.message).toMatch(/does not confirm that any reminder will ring/);
    expect(deliveryStore.get(`${a}-r`)!.registrationState).toBe('registered');
  });

  it('reports a failed registration, an account switch, a missing engine and a timeout', async () => {
    const a = owner('recover-states');
    userStore.setCurrentUser(a);
    const spy = jest.spyOn(reconciler, 'reconcileReminderDelivery');

    spy.mockResolvedValueOnce({
      nativeAvailable: true, registered: 0, kept: 1, cancelled: 0, failed: 2, receipts: 0,
    });
    const failed = await recoverReminderHealth(a);
    expect(failed.ok).toBe(false);
    expect(failed.message).toMatch(/2 could not be registered/);

    spy.mockImplementationOnce(async () => {
      userStore.setCurrentUser(owner('switched'));
      return {nativeAvailable: true, registered: 1, kept: 0, cancelled: 0, failed: 0, receipts: 0};
    });
    expect(await recoverReminderHealth(a)).toEqual({
      ok: false,
      message: 'Account changed. Reopen reminder health.',
    });

    userStore.setCurrentUser(a);
    spy.mockResolvedValueOnce({
      nativeAvailable: false, registered: 0, kept: 0, cancelled: 0, failed: 0, receipts: 0,
    });
    expect((await recoverReminderHealth(a)).message).toMatch(/not available in this app build/);

    spy.mockResolvedValueOnce({
      nativeAvailable: true, registered: 0, kept: 0, cancelled: 0, failed: 0, receipts: 0, error: 'x',
    });
    expect((await recoverReminderHealth(a)).message).toMatch(/could not complete/);

    jest.useFakeTimers();
    spy.mockReturnValueOnce(new Promise(() => undefined));
    const pending = recoverReminderHealth(a);
    await jest.advanceTimersByTimeAsync(RECOVERY_TIMEOUT_MS + 1);
    expect((await pending).message).toMatch(/Still working/);
  });
});

describe('AGY-PORT 09 explicit event defaults', () => {
  beforeEach(() => {
    jest.useFakeTimers({doNotFake: ['nextTick', 'setImmediate']});
    jest.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  });

  const prepare = (userId: string) =>
    memory.prepare(userId, {startTime: '09:30', durationMinutes: 60, expiresDays: 30});

  it('saves only after review, keeps accounts apart and refuses stale Save/Apply after Forget', () => {
    const a = owner('mem');
    const b = owner('mem-other');
    userStore.setCurrentUser(a);
    const review = prepare(a);
    expect(memory.read(a).value).toBeNull();
    expect(memory.offer(a)).toBeNull();
    memory.confirm(review.token, a);
    const offer = memory.offer(a)!;
    expect(offer.value).toMatchObject({startTime: '09:30', durationMinutes: 60});
    expect(memory.read(b).value).toBeNull();

    const stale = prepare(a);
    memory.forget(a, 'all');
    expect(() => memory.confirm(stale.token, a)).toThrow();
    expect(() => memory.apply(offer, a)).toThrow(/changed/);
    expect(memory.read(a)).toMatchObject({enabled: false, value: null});
  });

  it('supports correction, disable, single-field Forget and expiry without touching events', () => {
    const a = owner('mem-edit');
    userStore.setCurrentUser(a);
    memory.confirm(prepare(a).token, a);
    memory.setEnabled(a, false);
    expect(memory.offer(a)).toBeNull();
    memory.setEnabled(a, true);
    memory.forget(a, 'startTime');
    expect(memory.offer(a)?.value).toMatchObject({startTime: null, durationMinutes: 60});
    memory.confirm(
      memory.prepare(a, {startTime: '10:00', durationMinutes: 90, expiresDays: 30}).token,
      a,
    );
    expect(memory.offer(a)?.value.durationMinutes).toBe(90);

    tasksStore.insertEvent({
      id: `${a}-event`, userId: a, title: 'Independent', date: '2026-11-03',
      startTime: '08:00', endTime: '08:30',
    });
    jest.advanceTimersByTime(31 * 86400000);
    expect(memory.offer(a)).toBeNull();
    memory.forget(a, 'all');
    expect(tasksStore.getAllEvents(a).find(e => e.id === `${a}-event`)).toMatchObject({
      startTime: '08:00', endTime: '08:30',
    });
  });

  it('fences account switches, bad values, expired reviews, revisions and failed writes', () => {
    const a = owner('mem-fence');
    userStore.setCurrentUser(a);
    const cancelled = prepare(a);
    memory.cancel(cancelled.token);
    expect(() => memory.confirm(cancelled.token, a)).toThrow();
    expect(() => memory.prepare(a, {startTime: '25:00', durationMinutes: null, expiresDays: 30})).toThrow();
    expect(() => memory.prepare(a, {startTime: null, durationMinutes: 10, expiresDays: 30})).toThrow();
    expect(() => memory.prepare(a, {startTime: null, durationMinutes: null, expiresDays: 30})).toThrow();

    const review = prepare(a);
    userStore.setCurrentUser(owner('mem-intruder'));
    expect(() => memory.confirm(review.token, a)).toThrow(/Account changed/);
    expect(() => memory.offer(a)).toThrow(/Account changed/);
    userStore.setCurrentUser(a);

    const expired = prepare(a);
    jest.advanceTimersByTime(300001);
    expect(() => memory.confirm(expired.token, a)).toThrow(/expired/);

    const fresh = prepare(a);
    const tx = jest.spyOn(db, 'transactionSync').mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    expect(() => memory.confirm(fresh.token, a)).toThrow('disk full');
    tx.mockRestore();
    expect(memory.read(a).value).toBeNull();
    const saved = memory.confirm(fresh.token, a);

    // A sheet holding an older revision cannot overwrite a newer save.
    expect(() => memory.setEnabled(a, false, saved.revision - 1)).toThrow(/changed/);
    expect(memory.read(a).enabled).toBe(true);

    const offer = memory.offer(a)!;
    expect(memory.apply(offer, a).durationMinutes).toBe(60);
    jest.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    expect(memory.offer(a)).toBeNull();
  });

  it('treats malformed stored preferences as unavailable, not as defaults', () => {
    const a = owner('mem-bad');
    db.executeSync(
      'INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
      [a, EVENT_MEMORY_KEY, '{"version":1,"revision":2,"enabled":true,"value":{"startTime":"99:00","durationMinutes":60,"expiresAt":null},"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z"}', 'x'],
    );
    expect(() => memory.read(a)).toThrow(/unavailable/);
    expect(() => memory.offer(a)).toThrow(/unavailable/);
  });

  it('guest link keeps the account’s own defaults, moves the guest’s otherwise, and fences the guest', async () => {
    const established = owner('mem-dest');
    userStore.setCurrentUser(established);
    memory.confirm(
      memory.prepare(established, {startTime: '07:00', durationMinutes: 45, expiresDays: 0}).token,
      established,
    );
    db.executeSync('DELETE FROM local_settings WHERE user_id = ?', [GUEST]);
    userStore.setCurrentUser(GUEST);
    memory.confirm(prepare(GUEST).token, GUEST);
    const guestReview = prepare(GUEST);

    await guestMigration.linkGuestToCloudAccount(established, `${established}@example.invalid`);
    expect(memory.read(established).value).toMatchObject({startTime: '07:00', durationMinutes: 45});
    expect(memory.read(GUEST)).toMatchObject({enabled: false, value: null});
    userStore.setCurrentUser(GUEST);
    expect(() => memory.confirm(guestReview.token, GUEST)).toThrow();
    expect(memory.read(GUEST).value).toBeNull();

    const fresh = owner('mem-new');
    memory.confirm(prepare(GUEST).token, GUEST);
    await guestMigration.linkGuestToCloudAccount(fresh, `${fresh}@example.invalid`);
    expect(memory.read(fresh).value).toMatchObject({startTime: '09:30', durationMinutes: 60});
    expect(memory.read(GUEST).value).toBeNull();
  });

  it('applies saved values to a draft only, wrapping an overnight end', () => {
    const draft = {time: '12:00', endTime: '13:30'};
    expect(applyEventMemoryToDraft({startTime: '09:30', durationMinutes: 60, expiresAt: null}, draft))
      .toEqual({time: '09:30', endTime: '10:30'});
    expect(applyEventMemoryToDraft({startTime: '23:30', durationMinutes: 90, expiresAt: null}, draft))
      .toEqual({time: '23:30', endTime: '01:00'});
    expect(applyEventMemoryToDraft({startTime: null, durationMinutes: 45, expiresAt: null}, draft))
      .toEqual({time: '12:00', endTime: '12:45'});
    expect(applyEventMemoryToDraft({startTime: '08:00', durationMinutes: null, expiresAt: null}, draft))
      .toEqual({time: '08:00', endTime: '09:30'});
  });
});

describe('AGY-PORT 09 Profile statistics', () => {
  it('says No data before any reminder outcome', () => {
    const a = owner('stats-empty');
    reminder(`${a}-pending`, a, 3600000);
    expect(profileStatisticsStore.read(a)).toEqual({
      available: true,
      completedTasksCount: 0,
      notesCount: 0,
      onTimeRate: null,
      onTimeCount: 0,
      finishedRemindersCount: 0,
    });
  });

  it('counts actual records with the stated denominator, per owner, excluding deleted rows', () => {
    const a = owner('stats');
    const b = owner('stats-other');
    tasksStore.insertTask({id: `${a}-t1`, userId: a, title: 'Done', isCompleted: true, priority: 'Medium', category: 'General'});
    tasksStore.insertTask({id: `${a}-t2`, userId: a, title: 'Open', isCompleted: false, priority: 'Medium', category: 'General'});
    tasksStore.insertTask({id: `${a}-t3`, userId: a, title: 'Gone', isCompleted: true, priority: 'Medium', category: 'General'});
    tasksStore.deleteTask(`${a}-t3`);
    tasksStore.insertTask({id: `${b}-t1`, userId: b, title: 'Other', isCompleted: true, priority: 'Medium', category: 'General'});
    const stamp = new Date().toISOString();
    for (const [id, voice, deleted] of [
      [`${a}-n1`, 0, null],
      [`${a}-n2`, 1, null],
      [`${a}-n3`, 0, stamp],
      [`${b}-n1`, 0, null],
    ] as const) {
      db.executeSync(
        `INSERT INTO notes (id, user_id, title, body, is_voice_transcribed, created_at, updated_at, deleted_at)
         VALUES (?, ?, 'Synthetic note', 'voice voice voice', ?, ?, ?, ?)`,
        [id, id.startsWith(a) ? a : b, voice, stamp, stamp, deleted],
      );
    }

    reminder(`${a}-ok`, a, -3600000, 'acknowledged');
    reminder(`${a}-snoozed-ok`, a, -3600000, 'acknowledged');
    db.executeSync('UPDATE reminders SET snooze_count = 2 WHERE id = ?', [`${a}-snoozed-ok`]);
    reminder(`${a}-missed`, a, -3600000, 'missed');
    reminder(`${a}-pending`, a, 3600000);
    reminder(`${a}-ringing`, a, -60000, 'triggered');
    reminder(`${a}-deleted`, a, -3600000, 'missed');
    remindersStore.deleteReminder(`${a}-deleted`);
    reminder(`${b}-ok`, b, -3600000, 'acknowledged');

    expect(profileStatisticsStore.read(a)).toEqual({
      available: true,
      completedTasksCount: 1,
      notesCount: 2,
      onTimeRate: 33,
      onTimeCount: 1,
      finishedRemindersCount: 3,
    });
    expect(onTimeRate(0, 0)).toBeNull();
    expect(onTimeRate(2, 3)).toBe(67);
  });

  it('does not count an acknowledged reminder as a completed task', () => {
    const a = owner('stats-ack');
    tasksStore.insertTask({id: `${a}-t`, userId: a, title: 'Essay', isCompleted: false, priority: 'Medium', category: 'General'});
    reminder(`${a}-r`, a, -3600000, 'acknowledged');
    expect(profileStatisticsStore.read(a)).toMatchObject({
      completedTasksCount: 0,
      onTimeRate: 100,
    });
  });

  it('reports a read failure as unavailable, never as zero', () => {
    const a = owner('stats-fail');
    jest.spyOn(db, 'executeSync').mockImplementation(() => {
      throw new Error('database locked');
    });
    expect(profileStatisticsStore.read(a)).toEqual({
      available: false,
      completedTasksCount: null,
      notesCount: null,
      onTimeRate: null,
      onTimeCount: null,
      finishedRemindersCount: null,
    });
    expect(profileStatisticsStore.read('').available).toBe(false);
  });
});
