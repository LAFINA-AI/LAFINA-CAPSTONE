/**
 * Codex audit A2 (codex-audit-20261106-phase11.md): a Calendar read failure
 * is shown as a recoverable, owner-bound error, never as an empty schedule.
 * Real SQLite (node:sqlite mock) and the real CalendarScreen; failures are
 * injected into plannerQueries only.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { CalendarScreen } from '../../src/ui/screens/calendar';
import { db, initDatabase, tasksStore, userStore } from '../../src/storage';
import { plannerQueries } from '../../src/storage/plannerQueries';

const today = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `a2-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const addTask = (userId: string, title: string) =>
  tasksStore.insertTask({
    id: `${userId}-task`,
    userId,
    title,
    dueDate: today(),
    dueTime: '14:00',
    isCompleted: false,
    priority: 'High',
    category: 'Academics',
  });

const screen = (userId: string, refreshTrigger = 0) => (
  <ThemeProvider userId={userId}>
    <CalendarScreen userId={userId} refreshTrigger={refreshTrigger} onRefresh={jest.fn()} />
  </ThemeProvider>
);

const failWindow = () =>
  jest.spyOn(plannerQueries, 'window').mockImplementation(() => {
    throw new Error('database is locked');
  });

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  db.executeSync('DELETE FROM active_session');
});

describe('codex audit A2: Calendar read failures', () => {
  it('a genuinely empty calendar shows no error', () => {
    const a = owner('empty');
    userStore.setCurrentUser(a);
    const view = render(screen(a));
    expect(view.queryByTestId('calendar-read-error')).toBeNull();
  });

  it('a first read that fails says it is not an empty calendar, and Retry recovers', () => {
    const a = owner('first');
    userStore.setCurrentUser(a);
    addTask(a, 'Thesis Draft Due');
    const spy = failWindow();
    const view = render(screen(a));
    expect(view.getByTestId('calendar-read-error')).toBeTruthy();
    expect(view.getByText(/does not mean your calendar is empty/)).toBeTruthy();
    expect(view.queryByText('Thesis Draft Due')).toBeNull();

    spy.mockRestore();
    act(() => {
      fireEvent.press(view.getByTestId('calendar-read-retry'));
    });
    expect(view.queryByTestId('calendar-read-error')).toBeNull();
    expect(view.getByText('Thesis Draft Due')).toBeTruthy();
  });

  it('a later failure keeps the last good view for the same account and says it may be out of date', () => {
    const a = owner('later');
    userStore.setCurrentUser(a);
    addTask(a, 'Lab Report');
    const view = render(screen(a, 0));
    expect(view.getByText('Lab Report')).toBeTruthy();

    failWindow();
    view.rerender(screen(a, 1));
    expect(view.getByText(/last successful read/)).toBeTruthy();
    expect(view.getByText('Lab Report')).toBeTruthy();
  });

  it('after an account switch a failed read never shows the previous account’s schedule', () => {
    const a = owner('switch-a');
    const b = owner('switch-b');
    userStore.setCurrentUser(a);
    addTask(a, 'Private Task Of A');
    const view = render(screen(a));
    expect(view.getByText('Private Task Of A')).toBeTruthy();

    userStore.setCurrentUser(b);
    failWindow();
    view.rerender(screen(b));
    expect(view.queryByText('Private Task Of A')).toBeNull();
    expect(view.getByText(/does not mean your calendar is empty/)).toBeTruthy();
  });

  it('a tasks-and-events-only failure is reported even when blocks read fine', () => {
    const a = owner('schedule-only');
    userStore.setCurrentUser(a);
    addTask(a, 'Quiz Review');
    // Each load reads blocks first, then tasks/events: fail only the second.
    const real = plannerQueries.window.bind(plannerQueries);
    let calls = 0;
    jest.spyOn(plannerQueries, 'window').mockImplementation((...args) => {
      calls += 1;
      if (calls % 2 === 0) throw new Error('database is locked');
      return real(...args);
    });
    const view = render(screen(a));
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(view.getByTestId('calendar-read-error')).toBeTruthy();
    expect(view.queryByText('Quiz Review')).toBeNull();
  });

  it('an overdue-only failure is still reported', () => {
    const a = owner('overdue');
    userStore.setCurrentUser(a);
    jest.spyOn(plannerQueries, 'overdueTasks').mockImplementation(() => {
      throw new Error('disk I/O error');
    });
    const view = render(screen(a));
    expect(view.getByTestId('calendar-read-error')).toBeTruthy();
  });
});
