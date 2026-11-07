/**
 * AGY-PORT 09: Profile statistics, the Reminder Health sheet, the Event
 * Defaults sheet and the explicit Apply on a new event draft. Jest fakes
 * only; no Android permission screen, alarm or call is claimed.
 */
import React from 'react';
import {Alert, AppState, NativeModules} from 'react-native';
import type {AppStateStatus} from 'react-native';
import {act, fireEvent, render, renderHook, waitFor} from '@testing-library/react-native';
import {db, initDatabase, userStore} from '../../src/storage';
import {personalMemoryStore as memory} from '../../src/storage/personalMemoryStore';
import {ProfileStats} from '../../src/ui/components/profile/ProfileStats';
import {ReminderHealth} from '../../src/ui/components/profile/ReminderHealth';
import {PersonalMemory} from '../../src/ui/components/profile/PersonalMemory';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {useScheduleItemModal} from '../../src/ui/screens/calendar/hooks/useScheduleItemModal';
import {AddTaskEventModal} from '../../src/ui/screens/calendar/components/AddTaskEventModal';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import * as health from '../../src/scheduler/reminderHealth';

type NativeMock = Record<string, jest.Mock>;
const native = (): NativeMock => NativeModules.LafinaReminder as unknown as NativeMock;

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `p09ui-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const appStateListeners = (): Array<(state: AppStateStatus) => void> => {
  const listeners: Array<(state: AppStateStatus) => void> = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    listeners.push(handler as (state: AppStateStatus) => void);
    return {remove: jest.fn()} as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  return listeners;
};

const themed = (node: React.ReactElement) => <ThemeProvider userId={null}>{node}</ThemeProvider>;

beforeAll(async () => {
  await initDatabase();
});

afterEach(() => {
  jest.restoreAllMocks();
  db.executeSync('DELETE FROM active_session');
});

describe('AGY-PORT 09 Profile statistics card', () => {
  it('shows counts, No data before outcomes and a dash when unavailable', () => {
    const base = {available: true, completedTasksCount: 4, notesCount: 2, onTimeCount: 0};
    const empty = render(
      themed(<ProfileStats statistics={{...base, onTimeRate: null, finishedRemindersCount: 0}} />),
    );
    expect(empty.getByText('4')).toBeTruthy();
    expect(empty.getByText('No data')).toBeTruthy();
    expect(empty.queryByText('Voice Uses')).toBeNull();
    empty.unmount();

    const rated = render(
      themed(
        <ProfileStats
          statistics={{...base, onTimeRate: 67, onTimeCount: 2, finishedRemindersCount: 3}}
        />,
      ),
    );
    expect(rated.getByText('67%')).toBeTruthy();
    expect(rated.getByTestId('stat-on-time').props.accessibilityLabel).toBe(
      'On-time reminders: 2 of 3 acknowledged without snoozing',
    );
    rated.unmount();

    const failed = render(
      themed(
        <ProfileStats
          statistics={{
            available: false,
            completedTasksCount: null,
            notesCount: null,
            onTimeRate: null,
            onTimeCount: null,
            finishedRemindersCount: null,
          }}
        />,
      ),
    );
    expect(failed.getAllByText('—')).toHaveLength(3);
  });

  it('keeps every existing Profile control and adds the two new rows', () => {
    const userId = owner('profile');
    userStore.setCurrentUser(userId);
    const screen = render(
      <ThemeProvider userId={userId}>
        <ProfileScreen userId={userId} refreshTrigger={0} onRefresh={jest.fn()} onLogout={jest.fn()} />
      </ThemeProvider>,
    );
    for (const text of [
      'Scheduling & Reminder Preferences',
      'Week Starts on Monday',
      'Detailed AI Summaries',
      'Test TTS Voice',
      'Daily Morning Briefing',
      'Dark Mode',
      'Clear All Data',
      'Privacy Policy',
      'Sign Out',
      'Event Defaults',
      'Reminder Health',
      'Tasks Done',
      'Notes Saved',
      'On Time',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getByText('No data')).toBeTruthy();
  });
});

describe('AGY-PORT 09 Reminder Health sheet', () => {
  it('refreshes when the app returns from settings and never says a reminder rang', async () => {
    const userId = owner('health');
    userStore.setCurrentUser(userId);
    const listeners = appStateListeners();
    native().getPermissionStatus.mockResolvedValueOnce({
      canScheduleExactAlarms: false,
      canUseFullScreenIntent: true,
      notificationsEnabled: true,
    });
    const screen = render(themed(<ReminderHealth userId={userId} visible onClose={jest.fn()} />));
    await waitFor(() => expect(screen.getByTestId('health-exact').props.children).toBe('Not allowed'));
    expect(screen.getByTestId('health-armed').props.children).toBe('0');

    // The student grants exact alarms in Android settings and comes back.
    native().getPermissionStatus.mockResolvedValueOnce({
      canScheduleExactAlarms: true,
      canUseFullScreenIntent: true,
      notificationsEnabled: true,
    });
    await act(async () => {
      listeners.forEach(listener => listener('active'));
    });
    await waitFor(() => expect(screen.getByTestId('health-exact').props.children).toBe('Allowed'));
    // The only mention of ringing is the disclaimer that access is not a ring.
    expect(screen.getAllByText(/\brang\b/)).toHaveLength(1);
    expect(screen.getByText(/does not show that one rang/)).toBeTruthy();
  });

  it('shows unavailable access and records instead of guessing', async () => {
    const userId = owner('health-unavailable');
    userStore.setCurrentUser(owner('signed-in-elsewhere'));
    appStateListeners();
    native().getPermissionStatus.mockRejectedValueOnce(new Error('no binder'));
    const screen = render(themed(<ReminderHealth userId={userId} visible onClose={jest.fn()} />));
    await waitFor(() => expect(screen.getByTestId('health-local-unavailable')).toBeTruthy());
    expect(screen.getByTestId('health-local-unavailable').props.children).toBe(
      'Delivery records unavailable.',
    );
    expect(screen.getByTestId('health-notifications').props.children).toBe('Unavailable');
  });

  it('discards a slow result for an earlier owner', async () => {
    const first = owner('health-first');
    const second = owner('health-second');
    userStore.setCurrentUser(first);
    appStateListeners();
    let release: (() => void) | null = null;
    const real = health.readReminderHealth;
    jest.spyOn(health, 'readReminderHealth').mockImplementation(async userId => {
      if (userId === first) {
        await new Promise<void>(resolve => {
          release = resolve;
        });
      }
      return {...(await real(userId)), local: {
        armed: userId === first ? 99 : 1,
        ringing: 0, registered: 0, inexact: 0, queued: 0, blocked: 0, suppressed: 0, recent: [],
      }};
    });
    const screen = render(themed(<ReminderHealth userId={first} visible onClose={jest.fn()} />));
    userStore.setCurrentUser(second);
    screen.rerender(themed(<ReminderHealth userId={second} visible onClose={jest.fn()} />));
    await waitFor(() => expect(screen.getByTestId('health-armed').props.children).toBe('1'));
    await act(async () => {
      release?.();
    });
    expect(screen.getByTestId('health-armed').props.children).toBe('1');
  });

  it('retry reports the request result honestly', async () => {
    const userId = owner('health-retry');
    userStore.setCurrentUser(userId);
    appStateListeners();
    jest.spyOn(health, 'recoverReminderHealth').mockResolvedValueOnce({
      ok: true,
      message: 'Registration requested: 0 registered, 0 already in place. This does not confirm that any reminder will ring.',
    });
    const screen = render(themed(<ReminderHealth userId={userId} visible onClose={jest.fn()} />));
    await waitFor(() => expect(screen.getByTestId('health-armed')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('health-retry'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('health-message').props.children).toMatch(/does not confirm/),
    );
  });
});

describe('AGY-PORT 09 Event Defaults sheet and the new-event draft', () => {
  it('saves only after review, then Forget clears it', () => {
    const userId = owner('defaults');
    userStore.setCurrentUser(userId);
    appStateListeners();
    const screen = render(themed(<PersonalMemory userId={userId} visible onClose={jest.fn()} />));
    expect(screen.getByTestId('memory-saved').props.children).toBe('Nothing saved.');
    fireEvent.changeText(screen.getByTestId('memory-start'), '09:30');
    fireEvent.changeText(screen.getByTestId('memory-duration'), '50');
    fireEvent.press(screen.getByTestId('memory-review'));
    expect(screen.getByTestId('memory-review-summary')).toBeTruthy();
    expect(memory.read(userId).value).toBeNull();
    fireEvent.press(screen.getByTestId('memory-confirm'));
    expect(memory.read(userId)).toMatchObject({
      enabled: true,
      value: {startTime: '09:30', durationMinutes: 50},
    });
    fireEvent.press(screen.getByTestId('memory-forget-all'));
    expect(memory.read(userId)).toMatchObject({enabled: false, value: null});
    expect(screen.getByTestId('memory-saved').props.children).toBe('Nothing saved.');
  });

  it('rejects bad values without saving', () => {
    const userId = owner('defaults-bad');
    userStore.setCurrentUser(userId);
    appStateListeners();
    const screen = render(themed(<PersonalMemory userId={userId} visible onClose={jest.fn()} />));
    fireEvent.changeText(screen.getByTestId('memory-duration'), '5');
    fireEvent.press(screen.getByTestId('memory-review'));
    expect(screen.queryByTestId('memory-review-summary')).toBeNull();
    expect(screen.getByTestId('memory-notice').props.children).toMatch(/15–480/);
    expect(memory.read(userId).revision).toBe(0);
  });

  it('offers saved defaults on a new event draft and changes it only on Apply', () => {
    const userId = owner('draft');
    userStore.setCurrentUser(userId);
    memory.confirm(
      memory.prepare(userId, {startTime: '18:30', durationMinutes: 90, expiresDays: 30}).token,
      userId,
    );
    const events = () =>
      Number(db.executeSync('SELECT COUNT(*) AS n FROM events WHERE user_id = ?', [userId]).rows[0].n);
    const {result} = renderHook(() =>
      useScheduleItemModal({
        userId,
        selectedDate: new Date(2026, 10, 6),
        onSaved: () => undefined,
        onRefresh: () => undefined,
      }),
    );
    act(() => result.current.openNew('task'));
    expect(result.current.memoryOffer).toBeNull();

    act(() => result.current.openNew('event'));
    expect(result.current.memoryOffer?.value).toMatchObject({startTime: '18:30', durationMinutes: 90});
    expect(result.current.form).toMatchObject({time: '12:00', endTime: '13:00'});

    const modal = render(themed(<AddTaskEventModal state={result.current} timeFormat24h={false} />));
    expect(modal.getByTestId('event-memory-offer')).toBeTruthy();
    modal.unmount();

    act(() => result.current.applyMemoryOffer?.());
    expect(result.current.form).toMatchObject({time: '18:30', endTime: '20:00'});
    expect(result.current.memoryOffer).toBeNull();
    expect(events()).toBe(0);

    act(() =>
      result.current.openEdit(
        {
          id: 'x', userId, title: 'Saved', date: '2026-11-06', startTime: '08:00', endTime: '09:00',
          createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
        },
        'event',
      ),
    );
    expect(result.current.memoryOffer).toBeNull();
  });

  it('refuses a stale offer and leaves the draft as it was', () => {
    const userId = owner('draft-stale');
    userStore.setCurrentUser(userId);
    memory.confirm(
      memory.prepare(userId, {startTime: '07:00', durationMinutes: 30, expiresDays: 0}).token,
      userId,
    );
    const alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const {result} = renderHook(() =>
      useScheduleItemModal({
        userId,
        selectedDate: new Date(2026, 10, 6),
        onSaved: () => undefined,
        onRefresh: () => undefined,
      }),
    );
    act(() => result.current.openNew('event'));
    expect(result.current.memoryOffer).not.toBeNull();
    memory.forget(userId, 'all');
    act(() => result.current.applyMemoryOffer?.());
    expect(alerts).toHaveBeenCalledWith('Saved defaults changed', expect.any(String));
    expect(result.current.form).toMatchObject({time: '12:00', endTime: '13:00'});
    expect(result.current.memoryOffer).toBeNull();
  });
});
