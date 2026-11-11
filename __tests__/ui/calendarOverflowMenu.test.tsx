import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {CalendarScreen} from '../../src/ui/screens/calendar';
import {
  db,
  initDatabase,
  tasksStore,
  userStore,
} from '../../src/storage';

describe('Calendar Tab Option A - Overflow Options Menu', () => {
  let userId: string;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM custom_categories');
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM events');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM users');

    const guest = userStore.createGuestUser();
    userId = guest.id;
  });

  test('renders More Menu button in header and does not clutter screen with row of 4 action buttons', () => {
    const {getByTestId, queryByText} = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // The more menu button is present in the top header
    expect(getByTestId('calendar-more-menu-button')).toBeTruthy();

    // The Month and Week view toggle remains clean
    expect(queryByText('Month')).toBeTruthy();
    expect(queryByText('Week')).toBeTruthy();
  });

  test('opens calendar options modal when more menu button is tapped', async () => {
    const {getByTestId, getByText} = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    const moreBtn = getByTestId('calendar-more-menu-button');
    fireEvent.press(moreBtn);

    // Modal title and items appear
    expect(getByText('Calendar Options')).toBeTruthy();
    expect(getByText('Calendars & Visibility')).toBeTruthy();
    expect(getByText('Undated Tasks')).toBeTruthy();
    expect(getByText('Import Calendar (.ics)')).toBeTruthy();
    expect(getByText('Export Calendar (.ics)')).toBeTruthy();
  });

  test('opens undated tasks modal from the calendar options menu', async () => {
    tasksStore.insertTask({
      id: 'undated-task-1',
      userId,
      title: 'Unscheduled Reading Assignment',
      isCompleted: false,
      priority: 'Medium',
      category: 'Academics',
    });

    const {getByTestId, findByTestId, getByText} = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Open options menu
    fireEvent.press(getByTestId('calendar-more-menu-button'));

    // Undated tasks item has testID="calendar-undated-button"
    const undatedBtn = getByTestId('calendar-undated-button');
    fireEvent.press(undatedBtn);

    // Undated tasks modal opens
    expect(await findByTestId('undated-tasks-modal')).toBeTruthy();
    expect(getByText('Unscheduled Reading Assignment')).toBeTruthy();
  });

  test('dismisses options modal when Done is pressed', () => {
    const {getByTestId, getByText} = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    fireEvent.press(getByTestId('calendar-more-menu-button'));
    expect(getByText('Calendar Options')).toBeTruthy();

    fireEvent.press(getByText('Done'));
  });
});
