/**
 * Returning Home (2026-11-22): Home is shown and hidden with `isActive`.
 * That flip must not redraw its content when nothing changed; a data change
 * still does.
 */
import React from 'react';
import {act, render} from '@testing-library/react-native';
import {db, initDatabase, tasksStore} from '../../src/storage';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {DashboardScreen} from '../../src/ui/screens/dashboard';

let mockHomeRenders = 0;
jest.mock('../../src/ui/screens/dashboard/components/ModernHomeContent', () => {
  const {Text} = jest.requireActual('react-native');
  const ReactActual = jest.requireActual('react');
  return {
    ModernHomeContent: () => {
      mockHomeRenders += 1;
      return ReactActual.createElement(Text, {testID: 'home-probe'}, 'home');
    },
  };
});

const makeUser = (): string => {
  const id = `dash-activation-${Date.now()}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, 'Juan', `${id}@example.invalid`, now, now],
  );
  return id;
};

beforeAll(async () => {
  await initDatabase();
});

test('showing and hiding Home does not redraw its content; a data change does', async () => {
  const uid = makeUser();
  const handlers = {
    onRefresh: jest.fn(),
    onOpenCalendarTab: jest.fn(),
    onOpenNotesTab: jest.fn(),
    onOpenChatTab: jest.fn(),
  };
  const ui = (isActive: boolean) => (
    <ThemeProvider userId={uid}>
      <DashboardScreen
        userId={uid}
        refreshTrigger={0}
        isActive={isActive}
        {...handlers}
      />
    </ThemeProvider>
  );
  const utils = render(ui(true));
  // Let startup work (theme, layer visibility) settle first.
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 50));
  });
  expect(utils.getByTestId('home-probe')).toBeTruthy();
  const settled = mockHomeRenders;

  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      utils.rerender(ui(false));
    });
    await act(async () => {
      utils.rerender(ui(true));
    });
  }
  expect(mockHomeRenders).toBe(settled);

  await act(async () => {
    tasksStore.insertTask({
      id: `task-${uid}`,
      userId: uid,
      title: 'Read chapter 4',
      dueDate: new Date().toISOString().slice(0, 10),
      isCompleted: false,
      priority: 'Medium',
      category: 'Learning',
    } as never);
    await Promise.resolve();
  });
  expect(mockHomeRenders).toBeGreaterThan(settled);
});
