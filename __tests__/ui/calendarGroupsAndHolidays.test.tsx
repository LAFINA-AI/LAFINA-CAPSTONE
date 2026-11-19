import React from 'react';
import {Alert} from 'react-native';
import RNFS from 'react-native-fs';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {CalendarScreen} from '../../src/ui/screens/calendar';
import {buildDayScheduleItems} from '../../src/ui/screens/dashboard/dashboardCalculations';
import {
  BIRTHDAYS_GROUP_ID,
  formatBirthdayDisplayTitle,
  getBirthdays,
  getCustomScheduleGroups,
  saveBirthday,
  updateCustomScheduleGroup,
} from '../../src/ui/screens/calendar/utils/calendarGroups';
import {
  db,
  initDatabase,
  notesStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {plannerQueries} from '../../src/storage/plannerQueries';

const toLocalYmd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

describe('Calendar Google-style Groups & Philippine Holidays', () => {
  let userId: string;
  const mockFs = new Map<string, string>();
  let origExists: typeof RNFS.exists;
  let origReadFile: typeof RNFS.readFile;
  let origWriteFile: typeof RNFS.writeFile;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    mockFs.clear();
    origExists = RNFS.exists;
    origReadFile = RNFS.readFile;
    origWriteFile = RNFS.writeFile;

    (RNFS as unknown as Record<string, unknown>).exists = jest.fn(
      async (p: string) => mockFs.has(p),
    );
    (RNFS as unknown as Record<string, unknown>).readFile = jest.fn(
      async (p: string) => mockFs.get(p) ?? '',
    );
    (RNFS as unknown as Record<string, unknown>).writeFile = jest.fn(
      async (p: string, content: string) => {
        mockFs.set(p, content);
      },
    );

    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM custom_categories');
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM events');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM users');

    const guest = userStore.createGuestUser();
    userId = guest.id;
  });

  afterEach(() => {
    (RNFS as unknown as Record<string, unknown>).exists = origExists;
    (RNFS as unknown as Record<string, unknown>).readFile = origReadFile;
    (RNFS as unknown as Record<string, unknown>).writeFile = origWriteFile;
    jest.restoreAllMocks();
  });

  test('renders Philippine Holidays across Month, Week, and Day All-Day banner, opens holiday details, and toggles layer visibility', async () => {
    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Open Sidebar -> Philippine Holidays modal
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    expect(screen.getByTestId('calendar-holidays-group-button')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-holidays-group-button'));
    });
    expect(screen.getByTestId('holidays-group-modal')).toBeTruthy();

    // Tap Christmas Day to jump to Dec 25 of the current year
    await act(async () => {
      fireEvent.press(screen.getByText('Christmas Day'));
    });

    // MonthView Plan card displays Christmas Day
    expect(screen.getByText('Christmas Day')).toBeTruthy();
    expect(screen.getByText('Philippine Holiday')).toBeTruthy();

    // Header "Today" quick-jump pill appears when not on today
    const now = new Date();
    if (!(now.getMonth() === 11 && now.getDate() === 25)) {
      expect(screen.getByTestId('calendar-header-today-button')).toBeTruthy();
    }

    // Switch to Week view
    await act(async () => {
      fireEvent.press(screen.getByText('Week'));
    });
    expect(screen.getByText('Christmas Day')).toBeTruthy();
    expect(screen.getByText('Regular Holiday · All day')).toBeTruthy();

    // Switch to Day view -> All-Day banner shows holiday without shifting hourly axis to 12 AM
    await act(async () => {
      fireEvent.press(screen.getByText('Day'));
    });
    expect(screen.getByTestId('day-all-day-banner')).toBeTruthy();
    expect(screen.getByTestId('holiday-chip')).toBeTruthy();
    expect(screen.getByText('7 AM')).toBeTruthy();
    expect(screen.queryByText('12 AM')).toBeNull();

    // Tapping the holiday chip opens ScheduleItemDetailModal with holiday details
    await act(async () => {
      fireEvent.press(screen.getByTestId('holiday-chip'));
    });
    expect(screen.getByTestId('schedule-item-detail-modal')).toBeTruthy();
    expect(screen.getByText('Regular holiday')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('schedule-detail-close-button'));
    });

    // Toggle Philippine Holidays layer off from sidebar -> disappears immediately
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('sidebar-layer-toggle-holidays'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Done'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('holiday-chip')).toBeNull();
    });

    // Toggle back on -> reappears
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('sidebar-layer-toggle-holidays'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Done'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('holiday-chip')).toBeTruthy();
    });

    // Header "Today" button jumps back to today
    if (!(now.getMonth() === 11 && now.getDate() === 25)) {
      await act(async () => {
        fireEvent.press(screen.getByTestId('calendar-header-today-button'));
      });
      await waitFor(() => {
        expect(screen.queryByTestId('calendar-header-today-button')).toBeNull();
      });
    }
  });

  test('adds, edits, recurs yearly, toggles layer, and deletes a Birthday in BirthdaysGroupModal', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const today = new Date();
    const currentYear = today.getFullYear();
    const todayStr = toLocalYmd(today);
    const nextYearStr = `${currentYear + 1}-${String(
      today.getMonth() + 1,
    ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Open Birthdays group from Sidebar
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-birthdays-group-button'));
    });
    expect(screen.getByTestId('birthdays-group-modal')).toBeTruthy();

    // Add Maria Santos's birthday on today's month/day, born 2004
    fireEvent.changeText(
      screen.getByTestId('birthday-name-input'),
      'Maria Santos',
    );
    fireEvent.press(
      screen.getByTestId(`birthday-month-${today.getMonth() + 1}`),
    );
    fireEvent.changeText(
      screen.getByTestId('birthday-day-input'),
      String(today.getDate()),
    );
    fireEvent.changeText(screen.getByTestId('birthday-year-input'), '2004');
    await act(async () => {
      fireEvent.press(screen.getByTestId('birthday-save-button'));
    });

    // Persisted in events with FREQ=YEARLY & linkedCalendarBlock
    const events = tasksStore.getAllEvents(userId);
    expect(events).toHaveLength(1);
    expect(events[0].recurrenceRule).toBe('FREQ=YEARLY');
    expect(events[0].linkedCalendarBlock).toBe(BIRTHDAYS_GROUP_ID);
    expect(getBirthdays(userId)).toHaveLength(1);

    // Expands in future years cleanly
    const nextYearWindow = plannerQueries.window(
      userId,
      nextYearStr,
      nextYearStr,
    );
    expect(nextYearWindow.events).toHaveLength(1);
    expect(nextYearWindow.events[0].date).toBe(nextYearStr);

    // All-day birthday does NOT block timed Free Study Blocks on Home Dashboard
    expect(buildDayScheduleItems(todayStr, [], events)).toHaveLength(0);

    // Edit Maria Santos -> Maria Cruz
    fireEvent.press(screen.getByTestId('birthday-edit-0'));
    fireEvent.changeText(
      screen.getByTestId('birthday-name-input'),
      'Maria Cruz',
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('birthday-save-button'));
    });
    expect(getBirthdays(userId)[0].personName).toBe('Maria Cruz');

    // Close modal -> visible on calendar with age
    await act(async () => {
      fireEvent.press(screen.getByTestId('birthdays-close-button'));
    });
    expect(screen.getByText("🎂 Maria Cruz's Birthday")).toBeTruthy();
    expect(screen.getByText('Birthday')).toBeTruthy();

    // Switch to Week view to verify age turns label
    await act(async () => {
      fireEvent.press(screen.getByText('Week'));
    });
    const expectedAge = currentYear - 2004;
    expect(
      screen.getByText(`Turns ${expectedAge} · Friend · All day`),
    ).toBeTruthy();

    // Toggle Birthdays layer off from sidebar -> hidden
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('sidebar-layer-toggle-birthdays'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Done'));
    });
    await waitFor(() => {
      expect(screen.queryByText("🎂 Maria Cruz's Birthday")).toBeNull();
    });

    // Re-open Birthdays modal and delete
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-birthdays-group-button'));
    });
    fireEvent.press(screen.getByTestId('birthday-delete-0'));
    expect(alertSpy).toHaveBeenCalled();
    const deleteButtons = alertSpy.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    await act(async () => {
      deleteButtons.find(b => b.text === 'Remove')?.onPress?.();
    });
    expect(getBirthdays(userId)).toHaveLength(0);
  });

  test('creates a custom schedule group, displays & toggles its layer, and deletes the group cleanly', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Open CustomGroupModal from Sidebar -> + Add Schedule Group
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-add-custom-group-button'));
    });
    expect(screen.getByTestId('custom-group-modal')).toBeTruthy();

    // Create group "USTP Org Events" with color & a single-date item today
    fireEvent.changeText(
      screen.getByTestId('custom-group-name-input'),
      'USTP Org Events',
    );
    fireEvent.press(screen.getByTestId('custom-group-swatch-#9B59B6'));
    fireEvent.changeText(
      screen.getByTestId('custom-group-item-title-input'),
      'General Assembly',
    );
    fireEvent.press(screen.getByTestId('custom-group-mode-once'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('custom-group-save-button'));
    });

    expect(notesStore.getCustomCategories(userId)).toHaveLength(1);
    expect(timeBlocksStore.getAll(userId)).toHaveLength(1);
    expect(getCustomScheduleGroups(userId)[0].name).toBe('USTP Org Events');

    // Close modal -> item appears on today's schedule
    await act(async () => {
      fireEvent.press(screen.getByTestId('custom-group-close-button'));
    });
    expect(screen.getByText('General Assembly')).toBeTruthy();
    expect(screen.getByText('USTP Org Events')).toBeTruthy();

    // Open Sidebar -> custom group appears with its own visibility toggle
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    expect(
      screen.getByTestId('calendar-custom-group-USTP Org Events'),
    ).toBeTruthy();

    // Toggle custom group layer off -> item disappears from Calendar
    await act(async () => {
      fireEvent.press(
        screen.getByTestId('sidebar-layer-toggle-custom-USTP Org Events'),
      );
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Done'));
    });
    await waitFor(() => {
      expect(screen.queryByText('General Assembly')).toBeNull();
    });

    // Re-open custom group -> Delete entire group
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(
        screen.getByTestId('calendar-custom-group-USTP Org Events'),
      );
    });
    fireEvent.press(screen.getByTestId('custom-group-delete-button'));
    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    await act(async () => {
      buttons.find(b => b.text === 'Delete Group')?.onPress?.();
    });

    expect(notesStore.getCustomCategories(userId)).toHaveLength(0);
    expect(timeBlocksStore.getAll(userId)).toHaveLength(0);
    expect(getCustomScheduleGroups(userId)).toHaveLength(0);
  });

  test('saveBirthday preserves Feb 29 leap-day birthdays even when birth year is omitted', () => {
    saveBirthday({
      userId,
      personName: 'Leap Baby',
      month: 2,
      day: 29,
      relation: 'Family',
    });
    const saved = getBirthdays(userId);
    expect(saved).toHaveLength(1);
    expect(saved[0].month).toBe(2);
    expect(saved[0].day).toBe(29);
    expect(saved[0].birthYear).toBeNull();
    const feb29Occurrences = plannerQueries.window(
      userId,
      '2028-02-29',
      '2028-02-29',
    );
    expect(feb29Occurrences.events).toHaveLength(1);
  });

  test('sanitizes pipe characters and duplicate birthday suffixes, and rejects non-leap Feb 29', async () => {
    saveBirthday({
      userId,
      personName: "🎂 Ana's Birthday",
      month: 5,
      day: 12,
      relation: 'Org|Mate',
      notes: 'Choco|Cake',
    });

    const entries = getBirthdays(userId);
    expect(entries).toHaveLength(1);
    expect(entries[0].personName).toBe('Ana');
    expect(entries[0].relation).toBe('Org·Mate');
    expect(entries[0].notes).toBe('Choco·Cake');
    expect(formatBirthdayDisplayTitle(entries[0])).toBe("🎂 Ana's Birthday");

    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-birthdays-group-button'));
    });

    fireEvent.changeText(screen.getByTestId('birthday-name-input'), 'Non Leap');
    fireEvent.press(screen.getByTestId('birthday-month-2'));
    fireEvent.changeText(screen.getByTestId('birthday-day-input'), '29');
    fireEvent.changeText(screen.getByTestId('birthday-year-input'), '2003');
    await act(async () => {
      fireEvent.press(screen.getByTestId('birthday-save-button'));
    });

    expect(screen.getByText('Feb 2003 only has 28 days.')).toBeTruthy();
    expect(getBirthdays(userId)).toHaveLength(1);
  });

  test('tapping a recurring birthday item on the calendar opens BirthdaysGroupModal in edit mode', async () => {
    const today = new Date();
    saveBirthday({
      userId,
      personName: 'Ken Rivera',
      month: today.getMonth() + 1,
      day: today.getDate(),
      birthYear: 2004,
      relation: 'Friend',
    });

    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    const bdayCard = await screen.findByText("🎂 Ken Rivera's Birthday");
    await act(async () => {
      fireEvent.press(bdayCard);
    });
    expect(screen.getByTestId('schedule-item-detail-modal')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('schedule-detail-edit-button'));
    });

    expect(screen.getByTestId('birthdays-group-modal')).toBeTruthy();
    expect(screen.getByTestId('birthday-name-input').props.value).toBe(
      'Ken Rivera',
    );

    // Closing resets edit highlight so opening via Sidebar starts in Add mode
    await act(async () => {
      fireEvent.press(screen.getByTestId('birthdays-close-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-birthdays-group-button'));
    });
    expect(screen.getByTestId('birthday-name-input').props.value).toBe('');
  });

  test('renaming and recoloring a custom group updates its blocks and rejects name collisions', async () => {
    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-add-custom-group-button'));
    });

    fireEvent.changeText(
      screen.getByTestId('custom-group-name-input'),
      'Workouts',
    );
    fireEvent.press(screen.getByTestId('custom-group-swatch-#3498DB'));
    fireEvent.changeText(
      screen.getByTestId('custom-group-item-title-input'),
      'Leg Day',
    );
    fireEvent.press(screen.getByTestId('custom-group-mode-once'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('custom-group-save-button'));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('custom-group-close-button'));
    });

    // Open Workouts group from Sidebar -> rename & recolor without adding a second item
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-custom-group-Workouts'));
    });

    fireEvent.changeText(
      screen.getByTestId('custom-group-name-input'),
      'Gym Sessions',
    );
    fireEvent.press(screen.getByTestId('custom-group-swatch-#9B59B6'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('custom-group-save-button'));
    });

    const groups = getCustomScheduleGroups(userId);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Gym Sessions');
    expect(groups[0].color).toBe('#9B59B6');
    const blocks = timeBlocksStore.getAll(userId);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].category).toBe('Gym Sessions');
    expect(blocks[0].color).toBe('#9B59B6');

    // Also verify collision rejection when another custom group exists
    notesStore.addCustomCategory(userId, 'Other Org', '#10B981');
    expect(() =>
      updateCustomScheduleGroup({
        userId,
        oldName: 'Gym Sessions',
        newName: 'Other Org',
        newColor: '#10B981',
      }),
    ).toThrow(/already exists/i);
  });

  test('toggling Primary Schedule (main) off keeps Tasks and Birthdays layers independently visible', async () => {
    const todayStr = toLocalYmd(new Date());
    const today = new Date();

    tasksStore.insertEvent({
      id: 'evt-main-1',
      userId,
      title: 'Primary Seminar',
      date: todayStr,
      startTime: '14:00',
      endTime: '15:00',
    });
    tasksStore.insertTask({
      id: 'task-indep-1',
      userId,
      title: 'Independent Task',
      dueDate: todayStr,
      isCompleted: false,
      priority: 'Medium',
      category: 'personal',
    });
    saveBirthday({
      userId,
      personName: 'Ben',
      month: today.getMonth() + 1,
      day: today.getDate(),
    });

    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(await screen.findByText('Primary Seminar')).toBeTruthy();
    expect(screen.getByText('Independent Task')).toBeTruthy();
    expect(screen.getByText("🎂 Ben's Birthday")).toBeTruthy();

    // Open My Calendars modal via Sidebar -> toggle Primary Schedule off
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText('Manage calendars and visibility'),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Primary Schedule'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText('Primary Seminar')).toBeNull();
    });
    expect(screen.getByText('Independent Task')).toBeTruthy();
    expect(screen.getByText("🎂 Ben's Birthday")).toBeTruthy();

    // Now toggle Tasks layer off -> Independent Task hides while Birthday remains
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Tasks'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText('Independent Task')).toBeNull();
    });
    expect(screen.getByText("🎂 Ben's Birthday")).toBeTruthy();
  });
});
