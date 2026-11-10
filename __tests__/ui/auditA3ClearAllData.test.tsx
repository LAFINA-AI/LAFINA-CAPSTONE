/**
 * Codex audit A3 (codex-audit-20261106-phase11.md): Profile "Clear All Data"
 * forgets this owner's saved event defaults (AGY-PORT 09), fences reviews and
 * offers issued before it, leaves other owners alone, and states that device
 * settings such as the offline voice are kept. Real SQLite; Alert is mocked.
 */
import React from 'react';
import {Alert} from 'react-native';
import type {AlertButton} from 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import {db, initDatabase, userStore} from '../../src/storage';
import {
  EVENT_MEMORY_KEY,
  personalMemoryStore as memory,
} from '../../src/storage/personalMemoryStore';
import {speechSettingsStore as speech} from '../../src/storage/speechSettingsStore';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `a3-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const remember = (userId: string, startTime = '18:30') =>
  memory.confirm(memory.prepare(userId, {startTime, durationMinutes: 90, expiresDays: 0}).token, userId);

beforeAll(async () => {
  await initDatabase();
});

afterEach(() => {
  jest.restoreAllMocks();
  db.executeSync('DELETE FROM active_session');
});

describe('codex audit A3: Clear All Data and saved event defaults', () => {
  it('the Profile action forgets event defaults, keeps the voice choice and says so', () => {
    const a = owner('profile');
    userStore.setCurrentUser(a);
    remember(a);
    speech.save(a, {voiceId: null, rate: 1.5, pitch: 1}, 0);
    const alerts: Array<{title: string; message?: string; buttons?: AlertButton[]}> = [];
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      alerts.push({title, message, buttons});
    });

    const view = render(
      <ThemeProvider userId={a}>
        <ProfileScreen userId={a} refreshTrigger={0} onRefresh={jest.fn()} onLogout={jest.fn()} />
      </ThemeProvider>,
    );
    fireEvent.press(view.getByText('Clear All Data'));
    const confirm = alerts.find(entry => entry.title === 'Clear All Data');
    expect(confirm?.message).toMatch(/saved event defaults/);
    expect(confirm?.message).toMatch(/offline voice.*kept/);
    act(() => {
      confirm?.buttons?.find(button => button.text === 'Delete Everything')?.onPress?.();
    });

    expect(memory.read(a)).toMatchObject({enabled: false, value: null});
    expect(memory.offer(a)).toBeNull();
    expect(speech.read(a)).toMatchObject({explicit: true, rate: 1.5});
    expect(alerts.find(entry => entry.title === 'Data Cleared')?.message).toMatch(/event defaults have been deleted\.$/);
  });

  it('a review or offer issued before the reset cannot save or apply the old values', () => {
    const a = owner('fence');
    userStore.setCurrentUser(a);
    remember(a);
    const offer = memory.offer(a)!;
    const pending = memory.prepare(a, {startTime: '07:00', durationMinutes: 30, expiresDays: 0}).token;
    // An Event Defaults sheet opened before the reset holds this revision.
    const sheetRevision = memory.read(a).revision;
    memory.clearForDataReset(a);
    expect(() => memory.apply(offer, a)).toThrow();
    expect(() => memory.confirm(pending, a)).toThrow();
    expect(() => memory.setEnabled(a, true, sheetRevision)).toThrow(/changed/);
    expect(() => memory.forget(a, 'all', sheetRevision)).toThrow(/changed/);
    expect(memory.read(a).value).toBeNull();
  });

  it('a review prepared before anything was saved is also fenced', () => {
    const a = owner('fresh');
    userStore.setCurrentUser(a);
    const pending = memory.prepare(a, {startTime: '07:00', durationMinutes: 30, expiresDays: 0}).token;
    memory.clearForDataReset(a);
    expect(() => memory.confirm(pending, a)).toThrow();
    expect(memory.read(a)).toMatchObject({enabled: false, value: null});
  });

  it('forgets an unreadable stored value instead of failing', () => {
    const a = owner('corrupt');
    userStore.setCurrentUser(a);
    db.executeSync(
      'INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
      [a, EVENT_MEMORY_KEY, '{not json', 'x'],
    );
    expect(() => memory.read(a)).toThrow();
    memory.clearForDataReset(a);
    expect(memory.read(a)).toMatchObject({enabled: false, value: null});
  });

  it('only the signed-in owner, and only that owner’s defaults', () => {
    const a = owner('mine');
    const b = owner('other');
    userStore.setCurrentUser(b);
    remember(b, '09:00');
    userStore.setCurrentUser(a);
    remember(a);
    memory.clearForDataReset(a);
    expect(memory.read(b).value).toMatchObject({startTime: '09:00'});

    // A retained screen for a after the account changed refuses.
    remember(a);
    userStore.setCurrentUser(b);
    expect(() => memory.clearForDataReset(a)).toThrow(/Account changed/);
    expect(memory.read(a).value).toMatchObject({startTime: '18:30'});
  });
});
