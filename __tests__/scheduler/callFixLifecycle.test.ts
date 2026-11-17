import {db, initDatabase, remindersStore} from '../../src/storage';
import {deliveryStore} from '../../src/storage/deliveryStore';
import {callLifecycle} from '../../src/scheduler/callLifecycle';
import {recoverNativeCall} from '../../src/scheduler/nativeCallRecovery';
import {detectCallKeyword} from '../../src/scheduler/callCommand';
import {DeviceEventEmitter} from 'react-native';
import {checkAndTriggerReminders} from '../../src/scheduler/reminderPoller';

const owner = 'call-fix-owner';
const add = (id: string, due = Date.now()) => {
  const at = new Date(due).toISOString();
  remindersStore.insertReminder({
    id,
    userId: owner,
    task: 'Academic reminder',
    description: null,
    scheduledAt: at,
    triggerAt: at,
    status: 'pending',
    preCastAudioPath: null,
  });
  return {
    reminderId: id,
    ownerId: owner,
    generation: deliveryStore.get(id)!.generation,
    action: 'call' as const,
  };
};
beforeAll(() => initDatabase());
beforeEach(() => {
  db.executeSync('DELETE FROM reminders');
  db.executeSync('DELETE FROM local_settings');
  db.executeSync('DELETE FROM sync_outbox');
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
    VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [owner, owner, 'callfix@example.invalid', now, now],
  );
});

it('persists both arrivals, deduplicates and presents due order across a reload', () => {
  const b = add('b', Date.now() + 1000);
  const a = add('a');
  callLifecycle.put(owner, b);
  callLifecycle.put(owner, a);
  callLifecycle.put(owner, b);
  expect(
    callLifecycle.list(owner).map(entry => entry.request.reminderId),
  ).toEqual(['a', 'b']);
  callLifecycle.remove(owner, a);
  expect(callLifecycle.list(owner)[0].request).toMatchObject(b);
  expect(callLifecycle.list('another-owner')).toEqual([]);
});

it('serializes overlapping polls and durably queues every due reminder', async () => {
  add('poll-A');
  add('poll-B');
  const shown: string[] = [];
  const listener = DeviceEventEmitter.addListener(
    'LAFINA_CALL_TRIGGER',
    request => shown.push(request.reminderId),
  );
  try {
    await Promise.all([
      checkAndTriggerReminders(owner),
      checkAndTriggerReminders(owner),
    ]);
    expect(shown).toEqual(['poll-A', 'poll-B']);
    expect(
      callLifecycle.list(owner).map(entry => entry.request.reminderId),
    ).toEqual(['poll-A', 'poll-B']);
  } finally {
    listener.remove();
  }
});

it('rolls back trigger, queue acceptance and outbox together', () => {
  const request = add('rollback-call');
  db.executeSync('DELETE FROM sync_outbox');
  expect(() =>
    db.transactionSync(tx => {
      remindersStore.updateReminderStatus(
        request.reminderId,
        'triggered',
        undefined,
        tx,
      );
      callLifecycle.put(owner, request, 'queued', tx);
      throw new Error('Simulated interrupted acceptance');
    }),
  ).toThrow('Simulated interrupted acceptance');
  expect(remindersStore.getReminderById(request.reminderId)?.status).toBe(
    'pending',
  );
  expect(callLifecycle.list(owner)).toEqual([]);
  expect(db.executeSync('SELECT * FROM sync_outbox').rows).toEqual([]);
});

it('an active lease survives overdue reconciliation; old generations are unprotected', () => {
  const a = add('active', Date.now() - 16 * 60_000);
  callLifecycle.put(owner, a, 'answered');
  expect(callLifecycle.protects(owner, a.reminderId, a.generation)).toBe(true);
  expect(callLifecycle.protects(owner, a.reminderId, a.generation + 1)).toBe(
    false,
  );
});

it('adopts a native timeout only once, with the reminder and outbox committed together', () => {
  const a = add('timeout');
  const snapshot = {
    ...a,
    action: 'timeout' as const,
    timeoutCount: 1,
    retryAtMs: Date.now() + 300_000,
  };
  recoverNativeCall(snapshot, owner);
  expect(remindersStore.getReminderById(a.reminderId)).toMatchObject({
    status: 'snoozed',
    snoozeCount: 1,
  });
  const mutations = db.executeSync(
    'SELECT * FROM sync_outbox WHERE entity_id = ?',
    [a.reminderId],
  ).rows.length;
  recoverNativeCall(snapshot, owner);
  expect(remindersStore.getReminderById(a.reminderId)?.snoozeCount).toBe(1);
  expect(
    db.executeSync('SELECT * FROM sync_outbox WHERE entity_id = ?', [
      a.reminderId,
    ]).rows.length,
  ).toBe(mutations);
});

it('expires queued work as missed without completing its underlying task', () => {
  const a = add('expired');
  callLifecycle.put(owner, a);
  callLifecycle.expire(owner, a);
  expect(remindersStore.getReminderById(a.reminderId)?.status).toBe('missed');
  expect(callLifecycle.list(owner)).toEqual([]);
});

it.each([
  "don't remind me again",
  'do not call me back',
  'sneeze',
  'snore',
  'I got it from the library',
  'should I snooze?',
  'snooze for twenty five bananas',
  'snooze for 121 minutes',
])('never resolves an ambiguous or invalid command: %s', text =>
  expect(detectCallKeyword(text)).toBeNull(),
);
it.each([
  ['snooze for twenty five minutes', 25],
  ['snooze for an hour', 60],
  ['call me back in two hours', 120],
])('parses a complete duration: %s', (text, minutes) =>
  expect(detectCallKeyword(text)).toEqual({intent: 'snooze', minutes}),
);
it('accepts noted online, and keeps casual answers specific to the offline prompt', () => {
  expect(detectCallKeyword('noted')?.intent).toBe('acknowledge');
  expect(detectCallKeyword('okay')).toBeNull();
  expect(detectCallKeyword('okay', {casual: true})?.intent).toBe('acknowledge');
});
