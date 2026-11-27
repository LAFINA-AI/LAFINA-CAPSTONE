/**
 * AGY-PORT 09: Profile statistics, the Reminder Health sheet, the Event
 * Defaults sheet and the explicit Apply on a new event draft. Jest fakes
 * only; no Android permission screen, alarm or call is claimed.
 */
import React from 'react';
import {AppState, NativeModules} from 'react-native';
import type {AppStateStatus} from 'react-native';
import {
  act,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import {
  db,
  initDatabase,
  UNAVAILABLE_DETAILED_STATISTICS,
  userStore,
} from '../../src/storage';
import type {DetailedProfileStatistics} from '../../src/storage';
import {personalMemoryStore as memory} from '../../src/storage/personalMemoryStore';
import {ProfileStats} from '../../src/ui/components/profile/ProfileStats';
import {ProfileStatsModal} from '../../src/ui/components/profile/ProfileStatsModal';
import {ReminderHealth} from '../../src/ui/components/profile/ReminderHealth';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {useScheduleItemModal} from '../../src/ui/screens/calendar/hooks/useScheduleItemModal';
import {AddTaskEventModal} from '../../src/ui/screens/calendar/components/AddTaskEventModal';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import * as health from '../../src/scheduler/reminderHealth';

type NativeMock = Record<string, jest.Mock>;
const native = (): NativeMock =>
  NativeModules.LafinaReminder as unknown as NativeMock;

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
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, handler) => {
      listeners.push(handler as (state: AppStateStatus) => void);
      return {remove: jest.fn()} as unknown as ReturnType<
        typeof AppState.addEventListener
      >;
    });
  return listeners;
};

const themed = (node: React.ReactElement) => (
  <ThemeProvider userId={null}>{node}</ThemeProvider>
);

beforeAll(async () => {
  await initDatabase();
});

afterEach(() => {
  jest.restoreAllMocks();
  db.executeSync('DELETE FROM active_session');
});

describe('AGY-PORT 09 Profile statistics card & modal', () => {
  const sampleStats: DetailedProfileStatistics = {
    available: true,
    completedTasksCount: 4,
    pendingTasksCount: 2,
    totalTasksCount: 6,
    overdueTasksCount: 0,
    dueTodayTasksCount: 1,
    highPriorityPendingCount: 1,
    taskCompletionRate: 67,
    weeklyClassCount: 3,
    weeklyClassMinutes: 270,
    weeklyStudyBlockCount: 2,
    weeklyStudyMinutes: 120,
    weeklyEventCount: 1,
    weeklyEventMinutes: 30,
    weeklyScheduledMinutes: 420,
    enrolledCoursesCount: 6,
    totalCreditUnits: 18,
    notesCount: 5,
    pinnedNotesCount: 2,
    voiceNotesCount: 1,
    lecturesCount: 2,
    transcribedLecturesCount: 2,
    lectureNotesCount: 1,
    totalLectureSeconds: 1800,
    onTimeRate: null,
    onTimeCount: 0,
    snoozedOutcomesCount: 0,
    missedRemindersCount: 0,
    finishedRemindersCount: 0,
    pendingRemindersCount: 1,
    enabledAlarmsCount: 2,
    totalAlarmsCount: 3,
  };

  it('shows relevant student stats, View Stats trigger, and dashes when unavailable', () => {
    const onViewStats = jest.fn();
    const empty = render(
      themed(
        <ProfileStats
          statistics={sampleStats}
          onPressViewStats={onViewStats}
        />,
      ),
    );
    expect(empty.getByText('Study Overview')).toBeTruthy();
    expect(empty.getByText('67%')).toBeTruthy();
    expect(empty.getByText('7h')).toBeTruthy();
    expect(empty.getByText('2')).toBeTruthy();
    expect(empty.queryByText('No data')).toBeNull();
    expect(empty.queryByText('Voice Uses')).toBeNull();
    fireEvent.press(empty.getByTestId('profile-view-stats-btn'));
    expect(onViewStats).toHaveBeenCalledTimes(1);
    empty.unmount();

    const rated = render(
      themed(
        <ProfileStats
          statistics={{
            ...sampleStats,
            onTimeRate: 67,
            onTimeCount: 2,
            finishedRemindersCount: 3,
          }}
        />,
      ),
    );
    expect(rated.getByText('On Time')).toBeTruthy();
    expect(
      rated.getByTestId('stat-alerts-status').props.accessibilityLabel,
    ).toBe('On-time rate: 67 percent across 3 reminders, 2 alarms enabled');
    rated.unmount();

    const failed = render(
      themed(<ProfileStats statistics={UNAVAILABLE_DETAILED_STATISTICS} />),
    );
    expect(failed.getAllByText('—')).toHaveLength(3);
    expect(failed.getByText('Local stats unavailable')).toBeTruthy();
    failed.unmount();

    const modal = render(
      themed(
        <ProfileStatsModal
          visible
          statistics={{
            ...sampleStats,
            onTimeRate: 67,
            onTimeCount: 2,
            snoozedOutcomesCount: 1,
            finishedRemindersCount: 3,
          }}
          onClose={jest.fn()}
        />,
      ),
    );
    expect(modal.getByText('Student Statistics')).toBeTruthy();
    expect(modal.getByTestId('stats-modal-tasks')).toBeTruthy();
    expect(modal.getByTestId('stats-modal-schedule')).toBeTruthy();
    expect(modal.getByTestId('stats-modal-lectures')).toBeTruthy();
    expect(modal.getByTestId('stats-modal-alerts')).toBeTruthy();
    modal.unmount();
  });

  it('keeps every existing Profile control, opens View Stats modal, hides Student Pro & Modern/Classic outside Dev Mode', () => {
    const userId = owner('profile');
    userStore.setCurrentUser(userId);
    const screen = render(
      <ThemeProvider userId={userId}>
        <ProfileScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
          onLogout={jest.fn()}
        />
      </ThemeProvider>,
    );
    for (const text of [
      'Schedule settings',
      'Week starts on Monday',
      'Detailed answers',
      'Play a voice sample',
      'Dark Mode',
      'Clear All Data',
      'Privacy Policy',
      'Sign Out',
      'Check my reminders work',
      'Study Overview',
      'Task Rate',
      'This Week',
      'Alarms On',
      'View Stats',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByTestId('student-pro-tag')).toBeNull();
    expect(screen.queryByText('Student Pro')).toBeNull();
    expect(screen.queryByText('App Interface')).toBeNull();

    fireEvent.press(screen.getByTestId('profile-view-stats-btn'));
    expect(screen.getByText('Student Statistics')).toBeTruthy();
    expect(screen.getByTestId('stats-modal-tasks')).toBeTruthy();
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
    const screen = render(
      themed(<ReminderHealth userId={userId} visible onClose={jest.fn()} />),
    );
    await waitFor(() =>
      expect(screen.getByTestId('health-exact').props.children).toBe(
        'Not allowed',
      ),
    );
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
    await waitFor(() =>
      expect(screen.getByTestId('health-exact').props.children).toBe('Allowed'),
    );
    // The only mention of ringing is the disclaimer that access is not a ring.
    expect(screen.getAllByText(/\brang\b/)).toHaveLength(1);
    expect(screen.getByText(/does not show that one rang/)).toBeTruthy();
  });

  it('shows unavailable access and records instead of guessing', async () => {
    const userId = owner('health-unavailable');
    userStore.setCurrentUser(owner('signed-in-elsewhere'));
    appStateListeners();
    native().getPermissionStatus.mockRejectedValueOnce(new Error('no binder'));
    const screen = render(
      themed(<ReminderHealth userId={userId} visible onClose={jest.fn()} />),
    );
    await waitFor(() =>
      expect(screen.getByTestId('health-local-unavailable')).toBeTruthy(),
    );
    expect(screen.getByTestId('health-local-unavailable').props.children).toBe(
      'Delivery records unavailable.',
    );
    expect(screen.getByTestId('health-notifications').props.children).toBe(
      'Unavailable',
    );
  });

  it('discards a slow result for an earlier owner', async () => {
    const first = owner('health-first');
    const second = owner('health-second');
    userStore.setCurrentUser(first);
    appStateListeners();
    let release: (() => void) | null = null;
    const real = health.readReminderHealth;
    jest
      .spyOn(health, 'readReminderHealth')
      .mockImplementation(async userId => {
        if (userId === first) {
          await new Promise<void>(resolve => {
            release = resolve;
          });
        }
        return {
          ...(await real(userId)),
          local: {
            armed: userId === first ? 99 : 1,
            ringing: 0,
            registered: 0,
            inexact: 0,
            queued: 0,
            blocked: 0,
            suppressed: 0,
            recent: [],
          },
        };
      });
    const screen = render(
      themed(<ReminderHealth userId={first} visible onClose={jest.fn()} />),
    );
    userStore.setCurrentUser(second);
    screen.rerender(
      themed(<ReminderHealth userId={second} visible onClose={jest.fn()} />),
    );
    await waitFor(() =>
      expect(screen.getByTestId('health-armed').props.children).toBe('1'),
    );
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
      message:
        'Registration requested: 0 registered, 0 already in place. This does not confirm that any reminder will ring.',
    });
    const screen = render(
      themed(<ReminderHealth userId={userId} visible onClose={jest.fn()} />),
    );
    await waitFor(() =>
      expect(screen.getByTestId('health-armed')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('health-retry'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('health-message').props.children).toMatch(
        /does not confirm/,
      ),
    );
  });
});

describe('Simplified default duration in new-event drafts', () => {
  it('uses only a migrated duration, preserves start-time edits and existing events', () => {
    const userId = owner('duration-draft');
    userStore.setCurrentUser(userId);
    memory.confirm(
      memory.prepare(userId, {
        startTime: '18:30',
        durationMinutes: 90,
        expiresDays: 30,
      }).token,
      userId,
    );
    const {result} = renderHook(() =>
      useScheduleItemModal({
        userId,
        selectedDate: new Date(2026, 10, 6),
        onSaved: jest.fn(),
        onRefresh: jest.fn(),
      }),
    );
    act(() => result.current.openNew('event'));
    expect(result.current.form).toMatchObject({
      time: '12:00',
      endTime: '13:30',
    });
    expect(memory.read(userId).value).toMatchObject({
      startTime: null,
      durationMinutes: 90,
      expiresAt: null,
    });
    const modal = render(
      themed(
        <AddTaskEventModal state={result.current} timeFormat24h={false} />,
      ),
    );
    expect(modal.queryByTestId('event-memory-offer')).toBeNull();
    modal.unmount();
    act(() => result.current.updateField('time', '15:00'));
    expect(result.current.form.endTime).toBe('16:30');
    act(() => result.current.updateField('endTime', '17:00'));
    act(() => result.current.updateField('time', '16:00'));
    expect(result.current.form.endTime).toBe('18:00');
    act(() =>
      result.current.openEdit(
        {
          id: 'existing-duration-event',
          userId,
          title: 'Saved',
          date: '2026-11-06',
          startTime: '08:00',
          endTime: '08:45',
          createdAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
        'event',
      ),
    );
    expect(result.current.form).toMatchObject({
      time: '08:00',
      endTime: '08:45',
    });
    act(() => result.current.openNew('task'));
    expect(result.current.form).toMatchObject({
      time: '12:00',
      endTime: '13:00',
    });
  });

  it('changing the preference does not rewrite an open draft; the next new event uses it', () => {
    const userId = owner('duration-next-draft');
    userStore.setCurrentUser(userId);
    memory.saveDefaultDuration(userId, 30);
    const {result} = renderHook(() =>
      useScheduleItemModal({
        userId,
        selectedDate: new Date(2026, 10, 6),
        onSaved: jest.fn(),
        onRefresh: jest.fn(),
      }),
    );
    act(() => result.current.openNew('event'));
    expect(result.current.form.endTime).toBe('12:30');
    memory.saveDefaultDuration(userId, 90);
    expect(result.current.form.endTime).toBe('12:30');
    act(() => result.current.openNew('event'));
    expect(result.current.form.endTime).toBe('13:30');
  });
});
