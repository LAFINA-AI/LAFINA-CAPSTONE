/**
 * Remediation audit (codex-remediation-audit-7b3b183-20261106.md), Profile
 * "Clear All Data":
 *
 * - P1: a retained confirmation must not run after the account or session it
 *   was opened for has changed (account switch, sign-out, sign-in again as the
 *   same account) or after the Profile screen that opened it unmounted.
 *   Nothing may be deleted then: planner records, chat history, attachment
 *   files and event defaults all stay.
 * - P2: a read that fails must not look like "nothing left to delete". The
 *   result names only what was really deleted; records whose read or write
 *   failed stay, and the message says so.
 *
 * Synthetic owners and records on the Jest SQLite adapter; Alert, the native
 * reminder module and react-native-fs are Jest fakes. No real user data.
 */
import React from 'react';
import {Alert, NativeModules} from 'react-native';
import type {AlertButton} from 'react-native';
import RNFS from 'react-native-fs';
import {act, fireEvent, render} from '@testing-library/react-native';
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
import {EVENT_MEMORY_KEY, personalMemoryStore as memory} from '../../src/storage/personalMemoryStore';
import {SPEECH_SETTINGS_KEY, speechSettingsStore as speech} from '../../src/storage/speechSettingsStore';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

type Mock = jest.Mock;
type AlertCall = {title: string; message?: string; buttons?: AlertButton[]};

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `rca-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

/** One of every personal record type the reset covers, plus device settings. */
const seed = (userId: string, startTime = '18:30') => {
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
  // Same title and minute as the task: the task's own reminder (evidence rule).
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
  const standalone = new Date(2030, 0, 16, 7, 30, 0, 0).toISOString();
  remindersStore.insertReminder({
    id: `${userId}-reminder`,
    userId,
    task: 'Standalone reminder',
    description: null,
    scheduledAt: standalone,
    triggerAt: standalone,
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
  chatStore.addMessage(userId, 'assistant', 'Synthetic document', {
    uri: `file:///documents/${userId}.pdf`,
    fileName: `${userId}.pdf`,
    format: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: 10,
  });
  memory.confirm(memory.prepare(userId, {startTime, durationMinutes: 90, expiresDays: 0}).token, userId);
  speech.save(userId, {voiceId: null, rate: 1.5, pitch: 1}, speech.read(userId).revision);
};

/** Live (not soft-deleted) rows per table, read directly and strictly. */
const live = (userId: string) => {
  const count = (sql: string) => Number(db.executeSync(sql, [userId]).rows[0]?.n ?? 0);
  return {
    notes: count('SELECT COUNT(*) AS n FROM notes WHERE user_id = ? AND deleted_at IS NULL'),
    tasks: count('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND deleted_at IS NULL'),
    events: count('SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND deleted_at IS NULL'),
    blocks: count('SELECT COUNT(*) AS n FROM time_blocks WHERE user_id = ? AND deleted_at IS NULL'),
    reminders: count('SELECT COUNT(*) AS n FROM reminders WHERE user_id = ? AND deleted_at IS NULL'),
    messages: count(
      'SELECT COUNT(*) AS n FROM messages m JOIN chat_sessions s ON s.id = m.session_id WHERE s.user_id = ?',
    ),
  };
};
const FULL = {notes: 1, tasks: 1, events: 1, blocks: 1, reminders: 2, messages: 2};
const EMPTY = {notes: 0, tasks: 0, events: 0, blocks: 0, reminders: 0, messages: 0};

const outboxDeletes = (userId: string): string[] =>
  db
    .executeSync(
      "SELECT entity_type || ':' || entity_id AS k FROM sync_outbox WHERE user_id = ? AND operation = 'delete' ORDER BY k",
      [userId],
    )
    .rows.map(row => String(row.k));

/** A stored device-local setting, read directly (no owner check). */
const setting = (userId: string, key: string): string | null => {
  const value = db.executeSync('SELECT value FROM local_settings WHERE user_id = ? AND key = ?', [userId, key]).rows[0]
    ?.value;
  return value == null ? null : String(value);
};
const memoryValue = (userId: string) => setting(userId, EVENT_MEMORY_KEY);
const speechRate = (userId: string): unknown => JSON.parse(setting(userId, SPEECH_SETTINGS_KEY) ?? '{}').rate;

const recordAlerts = (): AlertCall[] => {
  const alerts: AlertCall[] = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    alerts.push({title, message, buttons});
  });
  return alerts;
};

const profile = (userId: string) =>
  render(
    <ThemeProvider userId={userId}>
      <ProfileScreen userId={userId} refreshTrigger={0} onRefresh={jest.fn()} onLogout={jest.fn()} />
    </ThemeProvider>,
  );

/** Opens the confirmation and returns its retained "Delete Everything" callback. */
const openConfirmation = (view: ReturnType<typeof profile>, alerts: AlertCall[]) => {
  fireEvent.press(view.getByText('Clear All Data'));
  const confirm = alerts.find(entry => entry.title === 'Clear All Data');
  const button = confirm?.buttons?.find(entry => entry.text === 'Delete Everything');
  expect(button?.onPress).toBeDefined();
  return () => button!.onPress!();
};

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise(resolve => setImmediate(resolve));
};

const result = (alerts: AlertCall[]) => alerts.filter(entry => entry.title !== 'Clear All Data').pop();

const unlink = RNFS.unlink as unknown as Mock;
const exists = RNFS.exists as unknown as Mock;
const cancelAlarm = (NativeModules.LafinaReminder as Record<string, Mock>).cancelAlarm;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  unlink.mockClear();
  cancelAlarm.mockClear();
  exists.mockImplementation(() => Promise.resolve(true));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  exists.mockImplementation(() => Promise.resolve(false));
  unlink.mockImplementation(() => Promise.resolve());
  db.executeSync('DELETE FROM active_session');
});

describe('remediation audit P1: a stale Clear All Data confirmation deletes nothing', () => {
  const refusedCleanly = async (a: string, b: string, alerts: AlertCall[], memoryBefore: unknown) => {
    await settle();
    expect(live(a)).toEqual(FULL);
    expect(outboxDeletes(a)).toEqual([]);
    expect(memoryValue(a)).toBe(memoryBefore);
    expect(unlink).not.toHaveBeenCalled();
    expect(cancelAlarm).not.toHaveBeenCalled();
    expect(alerts.some(entry => entry.title === 'Data Cleared' || entry.title === 'Data Partly Cleared')).toBe(false);
    // The other owner is untouched as well.
    expect(live(b)).toEqual(FULL);
    expect(speechRate(a)).toBe(1.5);
  };

  it('account switch after the confirmation opened (screen still mounted)', async () => {
    const b = owner('switch-b');
    seed(b, '09:00');
    const a = owner('switch-a');
    seed(a);
    const memoryBefore = memoryValue(a);
    const alerts = recordAlerts();
    const view = profile(a);
    const confirm = openConfirmation(view, alerts);

    act(() => userStore.setCurrentUser(b));
    await act(async () => {
      confirm();
      await settle();
    });
    await refusedCleanly(a, b, alerts, memoryBefore);
    expect(result(alerts)?.title).toBe('Not Cleared');
  });

  it('the Profile screen unmounted before the confirmation ran (same session)', async () => {
    const b = owner('unmount-b');
    seed(b, '09:00');
    const a = owner('unmount-a');
    seed(a);
    const memoryBefore = memoryValue(a);
    const alerts = recordAlerts();
    const view = profile(a);
    const confirm = openConfirmation(view, alerts);

    view.unmount();
    await act(async () => {
      confirm();
      await settle();
    });
    await refusedCleanly(a, b, alerts, memoryBefore);
  });

  it('account switch and unmount together (the independent audit sequence)', async () => {
    const a = owner('both-a');
    seed(a);
    const b = owner('both-b');
    seed(b, '09:00');
    userStore.setCurrentUser(a);
    const memoryBefore = memoryValue(a);
    const alerts = recordAlerts();
    const view = profile(a);
    const confirm = openConfirmation(view, alerts);

    act(() => userStore.setCurrentUser(b));
    view.unmount();
    await act(async () => {
      confirm();
      await settle();
    });
    await refusedCleanly(a, b, alerts, memoryBefore);
  });

  it('sign-out, then sign-in again as the same account before confirming', async () => {
    const b = owner('relogin-b');
    seed(b, '09:00');
    const a = owner('relogin-a');
    seed(a);
    const memoryBefore = memoryValue(a);
    const alerts = recordAlerts();
    const view = profile(a);
    const confirm = openConfirmation(view, alerts);

    act(() => {
      userStore.logout();
      userStore.setCurrentUser(a);
    });
    await act(async () => {
      confirm();
      await settle();
    });
    await refusedCleanly(a, b, alerts, memoryBefore);
    expect(result(alerts)?.title).toBe('Not Cleared');
  });

  it('signed out (no session) before confirming', async () => {
    const b = owner('logout-b');
    seed(b, '09:00');
    const a = owner('logout-a');
    seed(a);
    const memoryBefore = memoryValue(a);
    const alerts = recordAlerts();
    const view = profile(a);
    const confirm = openConfirmation(view, alerts);

    act(() => userStore.logout());
    await act(async () => {
      confirm();
      await settle();
    });
    await refusedCleanly(a, b, alerts, memoryBefore);
  });
});

describe('remediation audit P2: only confirmed deletions are reported', () => {
  it('a failed notes read keeps the planner records and says they were not deleted', async () => {
    const b = owner('read-b');
    seed(b, '09:00');
    const a = owner('read-a');
    seed(a);
    const alerts = recordAlerts();
    const view = profile(a);
    const confirm = openConfirmation(view, alerts);
    const execute = db.executeSync.bind(db);
    jest.spyOn(db, 'executeSync').mockImplementation((sql: string, params?: unknown[]) => {
      if (/FROM notes WHERE user_id = \?/i.test(sql) && /^\s*SELECT/i.test(sql)) {
        throw new Error('synthetic notes read failure');
      }
      return execute(sql, params);
    });

    await act(async () => {
      confirm();
      await settle();
    });
    jest.restoreAllMocks();

    expect(live(a).notes).toBe(1);
    const shown = result(alerts);
    expect(shown?.title).toBe('Data Partly Cleared');
    expect(shown?.message).not.toMatch(/All personal scheduling data/);
    expect(shown?.message).toMatch(/notes, tasks, events, reminders and calendar blocks were not deleted/);
    expect(live(b)).toEqual(FULL);
  });

  it('a write failure part-way changes no planner record (all or nothing) and says so', async () => {
    const a = owner('write-a');
    seed(a);
    const alerts = recordAlerts();
    const view = profile(a);
    const confirm = openConfirmation(view, alerts);
    const execute = db.executeSync.bind(db);
    jest.spyOn(db, 'executeSync').mockImplementation((sql: string, params?: unknown[]) => {
      if (/^\s*UPDATE events SET deleted_at/i.test(sql)) throw new Error('synthetic events write failure');
      return execute(sql, params);
    });

    await act(async () => {
      confirm();
      await settle();
    });
    jest.restoreAllMocks();

    // Nothing in the planner changed, including the notes and tasks before the failure.
    expect(live(a)).toMatchObject({notes: 1, tasks: 1, events: 1, blocks: 1, reminders: 2});
    expect(outboxDeletes(a).filter(key => !key.startsWith('message'))).toEqual([]);
    expect(cancelAlarm).not.toHaveBeenCalled();
    const shown = result(alerts);
    expect(shown?.title).toBe('Data Partly Cleared');
    expect(shown?.message).toMatch(/were not deleted/);
    expect(shown?.message).not.toMatch(/All personal scheduling data/);
    expect(shown?.message).toMatch(/Try Clear All Data again/);
    // The steps that did succeed are reported as such.
    expect(live(a).messages).toBe(0);
    expect(shown?.message).toMatch(/chat history.*were cleared/);
  });

  it('an attachment file that cannot be removed is reported, not hidden', async () => {
    const a = owner('file-a');
    seed(a);
    const alerts = recordAlerts();
    unlink.mockImplementation(() => Promise.reject(new Error('synthetic unlink failure')));
    const view = profile(a);
    const confirm = openConfirmation(view, alerts);

    await act(async () => {
      confirm();
      await settle();
    });

    expect(live(a)).toEqual(EMPTY);
    expect(unlink).toHaveBeenCalledWith(`/documents/${a}.pdf`);
    const shown = result(alerts);
    expect(shown?.title).toBe('Data Partly Cleared');
    expect(shown?.message).toMatch(/attachment file/i);
    expect(shown?.message).not.toMatch(/All personal scheduling data/);
  });
});

describe('remediation audit: the ordinary same-session reset still works', () => {
  it('deletes this owner’s records with sync tombstones and reminder cleanup; others untouched', async () => {
    const b = owner('ok-b');
    seed(b, '09:00');
    const a = owner('ok-a');
    seed(a);
    const alerts = recordAlerts();
    const view = profile(a);
    const confirm = openConfirmation(view, alerts);

    await act(async () => {
      confirm();
      await settle();
    });

    expect(live(a)).toEqual(EMPTY);
    // Existing soft-delete + outbox semantics: one delete mutation per record.
    expect(outboxDeletes(a)).toEqual(
      [
        `event:${a}-event`,
        `note:${a}-note`,
        `reminder:${a}-reminder`,
        `reminder:${a}-task-reminder`,
        `task:${a}-task`,
        `time_block:${a}-block`,
      ].sort(),
    );
    // The task's own reminder is cancelled natively after the commit, as before.
    expect(cancelAlarm).toHaveBeenCalledWith(`${a}-task-reminder`);
    // Only this owner's attachment file.
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(unlink).toHaveBeenCalledWith(`/documents/${a}.pdf`);
    // Event defaults forgotten (fenced), device settings kept.
    expect(memory.read(a)).toMatchObject({enabled: false, value: null});
    expect(speechRate(a)).toBe(1.5);
    expect(result(alerts)).toMatchObject({
      title: 'Data Cleared',
      message: 'All personal scheduling data and saved event defaults have been deleted.',
    });
    // The other owner keeps everything.
    expect(live(b)).toEqual(FULL);
    expect(outboxDeletes(b)).toEqual([]);
    userStore.setCurrentUser(b);
    expect(memory.read(b).value).toMatchObject({startTime: '09:00'});
    expect(speechRate(b)).toBe(1.5);
  });
});
