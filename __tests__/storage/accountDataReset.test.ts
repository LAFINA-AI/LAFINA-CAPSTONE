/**
 * Remediation audit (codex-remediation-audit-7b3b183-20261106.md; ADR-025):
 * the owner-bound reset operation itself, independent of the Profile UI.
 *
 * P1: `resetPersonalData` admits an authority only for the sign-in that
 * created it and only while the caller says it is current; otherwise it
 * changes nothing. P2: a failed strict read or write is reported as a failed
 * step and rolls the planner step back; it never looks like "nothing left".
 *
 * Synthetic owners and records on the Jest SQLite adapter. No real user data.
 */
import { NativeModules } from 'react-native';
import {
  chatStore,
  db,
  initDatabase,
  notesStore,
  remindersStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import { GUEST_USER_ID } from '../../src/constants';
import { guestMigration } from '../../src/storage/guestMigration';
import { authorizeDataReset, resetPersonalData } from '../../src/storage/accountDataReset';
import { readSessionEpoch } from '../../src/storage/sessionEpoch';
import { EVENT_MEMORY_KEY, personalMemoryStore as memory } from '../../src/storage/personalMemoryStore';

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `adr-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

/** Seeds as the signed-in owner (event defaults are owner-checked). */
const seed = (userId: string) => {
  userStore.setCurrentUser(userId);
  notesStore.insert({
    id: `${userId}-note`,
    userId,
    title: 'Synthetic note',
    body: 'synthetic',
    isPinned: false,
    tags: [],
    category: 'General',
    isVoiceTranscribed: false,
  });
  tasksStore.insertTask({
    id: `${userId}-task`,
    userId,
    title: 'Synthetic task',
    dueDate: '2030-01-15',
    dueTime: '09:00',
    isCompleted: false,
    priority: 'Medium',
    category: 'Academic',
    notes: null,
    recurrenceRule: null,
  });
  const at = new Date(2030, 0, 15, 9, 0, 0, 0).toISOString();
  remindersStore.insertReminder({
    id: `${userId}-task-reminder`,
    userId,
    task: 'Synthetic task',
    description: null,
    scheduledAt: at,
    triggerAt: at,
    status: 'pending',
    preCastAudioPath: null,
  });
  tasksStore.insertEvent({
    id: `${userId}-event`,
    userId,
    title: 'Synthetic event',
    date: '2030-01-17',
    startTime: '10:00',
    endTime: '11:00',
    location: null,
  });
  timeBlocksStore.insert({
    id: `${userId}-block`,
    userId,
    title: 'Synthetic block',
    date: '2030-01-18',
    startTime: '13:00',
    endTime: '14:00',
    color: '#336699',
    category: 'Study',
  });
  chatStore.addMessage(userId, 'user', 'Synthetic question');
  memory.confirm(
    memory.prepare(userId, { startTime: '18:30', durationMinutes: 90, expiresDays: 0 }).token,
    userId,
  );
};

const live = (userId: string): number[] => {
  const count = (sql: string) => Number(db.executeSync(sql, [userId]).rows[0]?.n ?? 0);
  return [
    count('SELECT COUNT(*) AS n FROM notes WHERE user_id = ? AND deleted_at IS NULL'),
    count('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND deleted_at IS NULL'),
    count('SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND deleted_at IS NULL'),
    count('SELECT COUNT(*) AS n FROM time_blocks WHERE user_id = ? AND deleted_at IS NULL'),
    count('SELECT COUNT(*) AS n FROM reminders WHERE user_id = ? AND deleted_at IS NULL'),
    count(
      'SELECT COUNT(*) AS n FROM messages m JOIN chat_sessions s ON s.id = m.session_id WHERE s.user_id = ?',
    ),
  ];
};
const FULL = [1, 1, 1, 1, 1, 1];
const EMPTY = [0, 0, 0, 0, 0, 0];

const outboxDeletes = (userId: string): number =>
  Number(
    db.executeSync("SELECT COUNT(*) AS n FROM sync_outbox WHERE user_id = ? AND operation = 'delete'", [userId])
      .rows[0]?.n ?? 0,
  );
const savedDefaults = (userId: string): unknown =>
  db.executeSync('SELECT value FROM local_settings WHERE user_id = ? AND key = ?', [userId, EVENT_MEMORY_KEY])
    .rows[0]?.value ?? null;

const cancelAlarm = (NativeModules.LafinaReminder as Record<string, jest.Mock>).cancelAlarm;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  cancelAlarm.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  db.setFallbackForTesting(false);
});

/** Asserts a refused reset left everything as it was. */
const expectUntouched = (userId: string, defaults: unknown) => {
  expect(live(userId)).toEqual(FULL);
  expect(outboxDeletes(userId)).toBe(0);
  expect(savedDefaults(userId)).toBe(defaults);
  expect(cancelAlarm).not.toHaveBeenCalled();
};

describe('authorizeDataReset', () => {
  it('captures the signed-in owner only', () => {
    const a = owner('a');
    const b = owner('b');
    userStore.setCurrentUser(a);
    expect(authorizeDataReset(a)).toEqual({ userId: a, epoch: readSessionEpoch()?.epoch });
    expect(authorizeDataReset(b)).toBeNull();
    userStore.logout();
    expect(authorizeDataReset(a)).toBeNull();
  });

  it('gives no authority when the session cannot be read', () => {
    const a = owner('a');
    userStore.setCurrentUser(a);
    const real = db.executeSync.bind(db);
    jest.spyOn(db, 'executeSync').mockImplementation((sql: string, params?: unknown[]) => {
      if (/FROM active_session/.test(sql)) throw new Error('synthetic session read failure');
      return real(sql, params as never);
    });
    expect(authorizeDataReset(a)).toBeNull();
  });

  it('gives no authority on the volatile test-only adapter', () => {
    const a = owner('a');
    userStore.setCurrentUser(a);
    db.setFallbackForTesting(true);
    expect(authorizeDataReset(a)).toBeNull();
  });
});

describe('resetPersonalData admission (P1)', () => {
  it('refuses a null authority', () => {
    expect(resetPersonalData(null)).toEqual({ admitted: false });
  });

  it('refuses after an account switch and changes neither account', () => {
    const a = owner('a');
    const b = owner('b');
    seed(a);
    seed(b);
    userStore.setCurrentUser(a);
    const authority = authorizeDataReset(a);
    userStore.setCurrentUser(b);
    const defaults = savedDefaults(a);
    expect(resetPersonalData(authority)).toEqual({ admitted: false });
    expectUntouched(a, defaults);
    expect(live(b)).toEqual(FULL);
  });

  it('refuses after sign-out and sign-in again as the same account', () => {
    const a = owner('a');
    seed(a);
    userStore.setCurrentUser(a);
    const authority = authorizeDataReset(a);
    userStore.logout();
    userStore.setCurrentUser(a);
    const defaults = savedDefaults(a);
    expect(resetPersonalData(authority)).toEqual({ admitted: false });
    expectUntouched(a, defaults);
  });

  it('refuses when the same owner is set as current again (session replaced)', () => {
    const a = owner('a');
    seed(a);
    userStore.setCurrentUser(a);
    const authority = authorizeDataReset(a);
    userStore.setCurrentUser(a);
    expect(resetPersonalData(authority)).toEqual({ admitted: false });
    expectUntouched(a, savedDefaults(a));
  });

  it("refuses a guest's confirmation after the guest is linked to an account", async () => {
    const cloud = owner('cloud');
    userStore.setCurrentUser(GUEST_USER_ID);
    const authority = authorizeDataReset(GUEST_USER_ID);
    expect(authority).not.toBeNull();
    seed(GUEST_USER_ID);
    await guestMigration.linkGuestToCloudAccount(cloud, `${cloud}@example.invalid`);
    expect(live(cloud)).toEqual(FULL);
    expect(resetPersonalData(authority)).toEqual({ admitted: false });
    expect(live(cloud)).toEqual(FULL);
    expect(outboxDeletes(cloud)).toBe(0);
  });

  it('refuses when the confirming screen is gone, before any write', () => {
    const a = owner('a');
    seed(a);
    userStore.setCurrentUser(a);
    const authority = authorizeDataReset(a);
    const defaults = savedDefaults(a);
    expect(resetPersonalData(authority, () => false)).toEqual({ admitted: false });
    expectUntouched(a, defaults);
  });

  it('stops before chat and defaults if the screen goes away mid-reset, and says so', () => {
    const a = owner('a');
    seed(a);
    userStore.setCurrentUser(a);
    const authority = authorizeDataReset(a);
    const defaults = savedDefaults(a);
    let checks = 0;
    // Check 1: entry. Check 2: inside the planner transaction. Then gone.
    const outcome = resetPersonalData(authority, () => {
      checks += 1;
      return checks <= 2;
    });
    expect(outcome).toMatchObject({ admitted: true, planner: 'cleared', chat: 'failed', defaults: 'failed' });
    expect(live(a)).toEqual([0, 0, 0, 0, 0, 1]);
    expect(savedDefaults(a)).toBe(defaults);
  });
});

describe('resetPersonalData failures are reported, not inferred (P2)', () => {
  // Only the listing read fails (SELECT *); the verification count still works,
  // so each table's strict read is what has to report the failure.
  it.each(['notes', 'tasks', 'events', 'time_blocks', 'reminders'])(
    'a failed %s listing read fails the planner step and changes no planner record',
    table => {
      const a = owner('a');
      seed(a);
      userStore.setCurrentUser(a);
      const authority = authorizeDataReset(a);
      const real = db.executeSync.bind(db);
      const listing = (sql: string) => sql.trim().startsWith(`SELECT * FROM ${table} WHERE user_id = ?`);
      jest.spyOn(db, 'executeSync').mockImplementation((sql: string, params?: unknown[]) => {
        if (listing(sql)) throw new Error(`synthetic ${table} read failure`);
        return real(sql, params as never);
      });
      const outcome = resetPersonalData(authority);
      jest.restoreAllMocks();
      expect(outcome).toMatchObject({ admitted: true, planner: 'failed', chat: 'cleared', defaults: 'cleared' });
      expect(live(a)).toEqual([1, 1, 1, 1, 1, 0]);
      expect(outboxDeletes(a)).toBe(0);
      expect(cancelAlarm).not.toHaveBeenCalled();
    },
  );

  it('a failed chat clear is reported and leaves the conversation', () => {
    const a = owner('a');
    seed(a);
    userStore.setCurrentUser(a);
    const authority = authorizeDataReset(a);
    jest.spyOn(chatStore, 'clearHistory').mockImplementation(() => {
      throw new Error('synthetic chat failure');
    });
    const outcome = resetPersonalData(authority);
    expect(outcome).toEqual({
      admitted: true,
      planner: 'cleared',
      chat: 'failed',
      defaults: 'cleared',
      refusedAttachments: 0,
    });
    expect(live(a)).toEqual([0, 0, 0, 0, 0, 1]);
  });
});

describe('resetPersonalData success', () => {
  it("clears only this owner's records, with tombstones, outbox deletes and alarm cancels", () => {
    const a = owner('a');
    const b = owner('b');
    seed(a);
    seed(b);
    userStore.setCurrentUser(a);
    const authority = authorizeDataReset(a);
    const outcome = resetPersonalData(authority);
    expect(outcome).toEqual({
      admitted: true,
      planner: 'cleared',
      chat: 'cleared',
      defaults: 'cleared',
      refusedAttachments: 0,
    });
    expect(live(a)).toEqual(EMPTY);
    const tombstones = Number(
      db.executeSync('SELECT COUNT(*) AS n FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL', [a]).rows[0]
        ?.n,
    );
    expect(tombstones).toBe(1);
    expect(outboxDeletes(a)).toBe(5);
    expect(cancelAlarm).toHaveBeenCalledWith(`${a}-task-reminder`);
    expect(live(b)).toEqual(FULL);
    expect(outboxDeletes(b)).toBe(0);
  });

  it('runs repeatedly within the same sign-in', () => {
    const a = owner('a');
    seed(a);
    userStore.setCurrentUser(a);
    const authority = authorizeDataReset(a);
    expect(resetPersonalData(authority)).toMatchObject({ admitted: true, planner: 'cleared' });
    notesStore.insert({
      id: `${a}-note-later`,
      userId: a,
      title: 'Later note',
      body: 'synthetic',
      isPinned: false,
      tags: [],
      category: 'General',
      isVoiceTranscribed: false,
    });
    // Same sign-in, no session change: the same authority is still admitted.
    expect(resetPersonalData(authority)).toMatchObject({ admitted: true, planner: 'cleared' });
    expect(live(a)).toEqual(EMPTY);
  });
});
