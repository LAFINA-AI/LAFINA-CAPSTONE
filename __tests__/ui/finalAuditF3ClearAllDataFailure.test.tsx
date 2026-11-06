/**
 * Final audit F3 (codex-final-audit-940802c-20261106.md): when Profile "Clear
 * All Data" cannot forget the saved event defaults, the result says exactly
 * what was and was not cleared, never that the defaults were deleted, and
 * gives a recovery step. Other owners and device settings stay untouched.
 * The successful reset stays covered by auditA3ClearAllData.test.tsx.
 * Real SQLite; Alert is mocked.
 */
import React from 'react';
import {Alert} from 'react-native';
import type {AlertButton} from 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import {db, initDatabase, notesStore, tasksStore, userStore} from '../../src/storage';
import {personalMemoryStore as memory} from '../../src/storage/personalMemoryStore';
import {speechSettingsStore as speech} from '../../src/storage/speechSettingsStore';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `f3-${label}-${serial}`;
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

describe('final audit F3: Clear All Data when forgetting event defaults fails', () => {
  it('reports planner data cleared, defaults kept, with a recovery step; nothing else touched', () => {
    const b = owner('other');
    userStore.setCurrentUser(b);
    remember(b, '09:00');
    speech.save(b, {voiceId: null, rate: 0.75, pitch: 1}, 0);

    const a = owner('mine');
    userStore.setCurrentUser(a);
    remember(a);
    speech.save(a, {voiceId: null, rate: 1.5, pitch: 1}, 0);
    notesStore.insert({
      id: `${a}-note`,
      userId: a,
      title: 'F3 note',
      body: 'synthetic',
      isPinned: false,
      tags: [],
      category: 'General',
      isVoiceTranscribed: false,
    });
    tasksStore.insertTask({
      id: `${a}-task`,
      userId: a,
      title: 'F3 task',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Medium',
      category: 'Academic',
      notes: null,
      recurrenceRule: null,
    });
    expect(notesStore.getAll(a)).toHaveLength(1);
    expect(tasksStore.getAllTasks(a)).toHaveLength(1);
    const revisionBefore = memory.read(a).revision;

    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(memory, 'clearForDataReset').mockImplementation(() => {
      throw new Error('storage busy');
    });
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
    expect(confirm?.message).toMatch(/offline voice.*kept/);
    act(() => {
      confirm?.buttons?.find(button => button.text === 'Delete Everything')?.onPress?.();
    });

    // The planner data really is gone ...
    expect(notesStore.getAll(a)).toHaveLength(0);
    expect(tasksStore.getAllTasks(a)).toHaveLength(0);
    // ... the defaults really remain, with no fence written ...
    expect(memory.read(a)).toMatchObject({enabled: true, revision: revisionBefore});
    expect(memory.read(a).value).toMatchObject({startTime: '18:30'});
    // ... and the message says exactly that.
    const result = alerts.find(entry => entry.title !== 'Clear All Data');
    expect(result).toBeDefined();
    expect(result?.message).not.toMatch(/event defaults have been deleted/);
    expect(result?.message).not.toMatch(/saved event defaults have been/);
    expect(result?.message).toMatch(/notes, tasks, events, reminders.*cleared/i);
    expect(result?.message).toMatch(/event defaults (were not|could not be) (deleted|forgotten)/i);
    expect(result?.message).toMatch(/Event Defaults/);
    expect(result?.message).toMatch(/offline voice.*kept/i);

    // Other owner and device settings untouched.
    expect(speech.read(a)).toMatchObject({explicit: true, rate: 1.5});
    userStore.setCurrentUser(b);
    expect(memory.read(b).value).toMatchObject({startTime: '09:00'});
    expect(speech.read(b)).toMatchObject({explicit: true, rate: 0.75});
  });
});
