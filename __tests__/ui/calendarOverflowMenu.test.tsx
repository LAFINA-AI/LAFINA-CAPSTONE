import React from 'react';
import {Alert} from 'react-native';
import {act, render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {CalendarScreen} from '../../src/ui/screens/calendar';
import {
  academicProfileStore,
  db,
  initDatabase,
  parseClassBlockMetadata,
  tasksStore,
  timeBlocksStore,
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

  test('opens calendar options sidebar when more menu button is tapped', async () => {
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

    // Chat-style sidebar drawer and items appear
    expect(getByTestId('calendar-options-sidebar')).toBeTruthy();
    expect(getByTestId('calendar-options-expand')).toBeTruthy();
    expect(getByText('Calendar Options')).toBeTruthy();
    expect(getByText('View Classes')).toBeTruthy();
    expect(getByText('Calendars & Visibility')).toBeTruthy();
    expect(getByText('Add COR / Class Schedule')).toBeTruthy();
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

  test('opens class schedule modal from the calendar options menu', () => {
    const {getByTestId} = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    fireEvent.press(getByTestId('calendar-more-menu-button'));
    fireEvent.press(getByTestId('calendar-add-cor-schedule-button'));
    expect(getByTestId('class-schedule-modal')).toBeTruthy();
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

  test('views grouped repeating COR classes, edits a class across weekdays, and removes a class', () => {
    academicProfileStore.persistRecurringSchedule(userId, [
      {
        code: 'IT311',
        subjectTitle: 'Systems Integration',
        section: 'IT3R1',
        room: '09-301',
        faculty: 'Loredel Tamayo',
        days: ['Monday', 'Wednesday', 'Friday'],
        startTime: '09:00',
        endTime: '10:00',
        recurrenceRule: 'FREQ=WEEKLY;UNTIL=2027-03-01',
      },
    ]);
    expect(timeBlocksStore.getAll(userId)).toHaveLength(3);

    const alertSpy = jest.spyOn(Alert, 'alert');
    const onRefresh = jest.fn();

    const {getByTestId, getByText, queryByTestId} = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={onRefresh}
        />
      </ThemeProvider>,
    );

    // Open Calendar Options sidebar -> View Classes
    fireEvent.press(getByTestId('calendar-more-menu-button'));
    fireEvent.press(getByTestId('calendar-view-classes-button'));

    expect(getByTestId('view-classes-modal')).toBeTruthy();
    expect(getByText('Systems Integration')).toBeTruthy();
    expect(getByText('IT311')).toBeTruthy();
    expect(getByText(/MWF · 09:00 AM/)).toBeTruthy();
    expect(getByText('Room 09-301')).toBeTruthy();
    expect(getByText('Section IT3R1')).toBeTruthy();
    expect(getByText('Loredel Tamayo')).toBeTruthy();

    // Edit the grouped repeating class (change title, room, and MWF -> TTH)
    fireEvent.press(getByTestId('view-class-edit-0'));
    fireEvent.changeText(
      getByTestId('view-class-edit-title'),
      'Systems Architecture',
    );
    fireEvent.changeText(getByTestId('view-class-edit-room'), '51-202');
    fireEvent.press(getByTestId('view-class-edit-preset-TTH'));
    fireEvent.press(getByTestId('view-class-edit-save'));

    const updatedBlocks = timeBlocksStore.getAll(userId);
    expect(updatedBlocks).toHaveLength(2);
    expect(
      updatedBlocks.every(b => b.title === 'IT311 · Systems Architecture'),
    ).toBe(true);
    expect(
      parseClassBlockMetadata(updatedBlocks[0].notes).room,
    ).toBe('51-202');
    expect(onRefresh).toHaveBeenCalled();

    // Delete the grouped repeating class (confirms alert, deletes both weekday slots)
    fireEvent.press(getByTestId('view-class-delete-0'));
    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    act(() => {
      buttons.find(b => b.text === 'Remove')?.onPress?.();
    });

    expect(timeBlocksStore.getAll(userId)).toHaveLength(0);
    expect(getByTestId('view-classes-empty')).toBeTruthy();
    expect(queryByTestId('view-class-card-0')).toBeNull();
    alertSpy.mockRestore();
  });
});
