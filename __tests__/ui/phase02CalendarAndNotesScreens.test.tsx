import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {CalendarScreen} from '../../src/ui/screens/calendar';
import {DayView} from '../../src/ui/screens/calendar/components/DayView';
import {NotesScreen} from '../../src/ui/screens/notes';
import {
  db,
  initDatabase,
  tasksStore,
  notesStore,
  remindersStore,
  userStore,
} from '../../src/storage';

describe('Phase 02 Calendar & Notes UI Screens', () => {
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

  describe('CalendarScreen', () => {
    test('renders week view, displays scheduled tasks/events, and toggles to Month view', async () => {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(
        now.getMonth() + 1,
      ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      tasksStore.insertTask({
        id: 'task-test-ui-1',
        userId,
        title: 'Complete Software Lab',
        dueDate: todayStr,
        dueTime: '14:00',
        isCompleted: false,
        priority: 'High',
        category: 'Academics',
      });

      tasksStore.insertEvent({
        id: 'event-test-ui-1',
        userId,
        title: 'Capstone Advising',
        date: todayStr,
        startTime: '10:00',
        endTime: '11:00',
        location: 'Building 9 Rm 204',
      });

      const onRefresh = jest.fn();

      const {getByText} = render(
        <ThemeProvider userId={userId}>
          <CalendarScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={onRefresh}
          />
        </ThemeProvider>,
      );

      // Verify task and event are visible
      expect(getByText('Complete Software Lab')).toBeTruthy();
      expect(getByText('Capstone Advising')).toBeTruthy();

      // Switch to Month view
      const monthBtn = getByText('Month');
      fireEvent.press(monthBtn);

      // View toggle updates to 'Week'
      expect(getByText('Week')).toBeTruthy();
    });

    test('switches between Month, Week, and Day views showing Today’s Plan, pastel items, reminders, and hourly slots', async () => {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(
        now.getMonth() + 1,
      ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const triggerAtLocal = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        7,
        30,
        0,
      ).toISOString();

      tasksStore.insertEvent({
        id: 'ev-uniguide-1',
        userId,
        title: 'CS 101 Data Structures',
        date: todayStr,
        startTime: '09:00',
        endTime: '10:30',
        location: 'ICT Bldg · Rm 302',
      });

      tasksStore.insertTask({
        id: 't-uniguide-1',
        userId,
        title: 'Submit CS 101 Lab Report',
        dueDate: todayStr,
        dueTime: '17:00',
        priority: 'High',
        category: 'Academics',
        isCompleted: false,
      });

      remindersStore.insertReminder({
        id: 'rem-uniguide-1',
        userId,
        task: 'Morning class prep',
        description: null,
        scheduledAt: triggerAtLocal,
        triggerAt: triggerAtLocal,
        status: 'pending',
        preCastAudioPath: null,
      });

      const {getByText} = render(
        <ThemeProvider userId={userId}>
          <CalendarScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={jest.fn()}
          />
        </ThemeProvider>,
      );

      // Default Month view displays Today's Plan and all 3 item types
      expect(getByText('Today’s Plan')).toBeTruthy();
      expect(getByText('Morning class prep')).toBeTruthy();
      expect(getByText('CS 101 Data Structures')).toBeTruthy();
      expect(getByText('Submit CS 101 Lab Report')).toBeTruthy();

      // Switch to Week view
      fireEvent.press(getByText('Week'));
      expect(getByText('Reminder · 7:30 AM')).toBeTruthy();
      expect(getByText('ICT Bldg · Rm 302 · 9:00 AM - 10:30 AM')).toBeTruthy();
      expect(getByText('To Do · 5:00 PM')).toBeTruthy();

      // Switch to Day view
      fireEvent.press(getByText('Day'));
      expect(getByText('7 AM')).toBeTruthy();
      expect(getByText('9 AM')).toBeTruthy();
      expect(getByText('5 PM')).toBeTruthy();
      expect(getByText('8 PM')).toBeTruthy();
      expect(getByText('Morning class prep')).toBeTruthy();
      expect(getByText('CS 101 Data Structures')).toBeTruthy();
      expect(getByText('Submit CS 101 Lab Report')).toBeTruthy();
    });

    test('opens FAB actions menu when plus icon is tapped', async () => {
      const {getByLabelText, getByText} = render(
        <ThemeProvider userId={userId}>
          <CalendarScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={jest.fn()}
          />
        </ThemeProvider>,
      );

      // Press the floating Add button
      const fabButton = getByLabelText('Add New Item');
      fireEvent.press(fabButton);

      // Menu actions should now appear
      expect(getByText('Create New')).toBeTruthy();
      expect(getByText('Time Block')).toBeTruthy();
      expect(getByText('Task')).toBeTruthy();
      expect(getByText('Note')).toBeTruthy();
    });

    test('allows adding a time block manually via FAB and persists with correct local date', async () => {
      const onRefresh = jest.fn();
      const {getByLabelText, getByText, getByPlaceholderText} = render(
        <ThemeProvider userId={userId}>
          <CalendarScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={onRefresh}
          />
        </ThemeProvider>,
      );

      // Open FAB menu
      const fabButton = getByLabelText('Add New Item');
      fireEvent.press(fabButton);

      // Choose Time Block
      const timeBlockOption = getByText('Time Block');
      fireEvent.press(timeBlockOption);

      // Verify modal is visible
      expect(getByText('Create Time Block')).toBeTruthy();

      // Enter title
      const titleInput = getByPlaceholderText('Deep Work, Study, Lunch...');
      fireEvent.changeText(titleInput, 'Algorithms Deep Work');

      // Tap Save
      const saveBtn = getByText('Save');
      fireEvent.press(saveBtn);

      // Verify block is persisted in timeBlocksStore with correct local date
      const savedBlocks = db.executeSync(
        'SELECT * FROM time_blocks WHERE user_id = ? AND title = ?',
        [userId, 'Algorithms Deep Work'],
      );
      expect(savedBlocks.rows.length).toBe(1);

      const now = new Date();
      const expectedLocalDate = `${now.getFullYear()}-${String(
        now.getMonth() + 1,
      ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(savedBlocks.rows[0].date).toBe(expectedLocalDate);
      expect(savedBlocks.rows[0].start_time).toBe('09:00');
      expect(savedBlocks.rows[0].end_time).toBe('10:00');

      // Verify calendar reloaded
      expect(onRefresh).toHaveBeenCalled();
    });

    test('renders Overdue section below the calendar views and omits Alarms section', () => {
      tasksStore.insertTask({
        id: 'overdue-task-ui-1',
        userId,
        title: 'Past due lab report',
        dueDate: '2020-01-15',
        isCompleted: false,
        priority: 'Medium',
        category: 'Academics',
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

      expect(screen.queryByTestId('schedule-section-alarms')).toBeNull();
      const serialized = JSON.stringify(screen.toJSON());
      expect(serialized.indexOf('Past due lab report')).toBeGreaterThan(
        serialized.indexOf('Today’s Plan'),
      );
    });

    test('DayView highlights current hour, shows live time line only on today, and auto-scrolls CalendarScreen in Day view', () => {
      const todayAtEarlyMorning = new Date(2026, 10, 16, 2, 36, 0);
      const weekDays = Array.from(
        {length: 7},
        (_, idx) => new Date(2026, 10, 15 + idx),
      );
      const onCurrentTimeLayout = jest.fn();

      const dayScreen = render(
        <ThemeProvider userId={userId}>
          <DayView
            weekDays={weekDays}
            selectedDate={new Date(2026, 10, 16, 12, 0, 0)}
            timeFormat24h={false}
            blocks={[]}
            tasks={[]}
            events={[]}
            onSelectDate={jest.fn()}
            onAddBlock={jest.fn()}
            onPressItem={jest.fn()}
            now={todayAtEarlyMorning}
            onCurrentTimeLayout={onCurrentTimeLayout}
          />
        </ThemeProvider>,
      );

      expect(dayScreen.getByTestId('day-current-hour-row')).toBeTruthy();
      expect(dayScreen.getByTestId('day-current-time-line')).toBeTruthy();
      expect(dayScreen.getByTestId('day-current-time-badge')).toBeTruthy();
      expect(dayScreen.getByText('2 AM')).toBeTruthy();
      expect(dayScreen.getByText('2:36 AM')).toBeTruthy();

      const timelineView = dayScreen.getByTestId('day-timeline');
      fireEvent(timelineView, 'layout', {
        nativeEvent: {layout: {y: 96, height: 800, x: 0, width: 360}},
      });
      fireEvent(dayScreen.getByTestId('day-current-hour-row'), 'layout', {
        nativeEvent: {layout: {y: 290, height: 58, x: 0, width: 320}},
      });
      expect(onCurrentTimeLayout).toHaveBeenCalledWith(386);

      // Viewing another date hides the current-time indicator
      dayScreen.rerender(
        <ThemeProvider userId={userId}>
          <DayView
            weekDays={weekDays}
            selectedDate={new Date(2026, 10, 17, 12, 0, 0)}
            timeFormat24h={false}
            blocks={[]}
            tasks={[]}
            events={[]}
            onSelectDate={jest.fn()}
            onAddBlock={jest.fn()}
            onPressItem={jest.fn()}
            now={todayAtEarlyMorning}
            onCurrentTimeLayout={onCurrentTimeLayout}
          />
        </ThemeProvider>,
      );
      expect(dayScreen.queryByTestId('day-current-time-line')).toBeNull();
      expect(dayScreen.queryByTestId('day-current-time-badge')).toBeNull();

      // Switching CalendarScreen to Day view renders the indicator and scrolls ScrollView
      const scrollSpy = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(() => {});

      try {
        const calScreen = render(
          <ThemeProvider userId={userId}>
            <CalendarScreen
              userId={userId}
              refreshTrigger={0}
              onRefresh={jest.fn()}
            />
          </ThemeProvider>,
        );

        fireEvent.press(calScreen.getByText('Day'));
        expect(calScreen.getByTestId('day-current-time-line')).toBeTruthy();

        fireEvent(calScreen.getByTestId('day-timeline'), 'layout', {
          nativeEvent: {layout: {y: 100, height: 900, x: 0, width: 360}},
        });
        fireEvent(calScreen.getByTestId('day-current-hour-row'), 'layout', {
          nativeEvent: {layout: {y: 420, height: 58, x: 0, width: 320}},
        });

        expect(scrollSpy).toHaveBeenCalledWith({y: 380, animated: false});
      } finally {
        scrollSpy.mockRestore();
      }
    });
  });

  describe('NotesScreen', () => {
    test('renders notes list, filters by category, and shows checklist items', async () => {
      notesStore.insert({
        id: 'note-ui-1',
        userId,
        title: 'Algorithms Lecture Notes',
        body: '# Sorting Algorithms\n- [ ] QuickSort\n- [x] MergeSort',
        category: 'Academics',
        isPinned: true,
        tags: ['cs'],
        isVoiceTranscribed: false,
      });

      notesStore.insert({
        id: 'note-ui-2',
        userId,
        title: 'Dorm Shopping List',
        body: '- [ ] Laundry detergent\n- [ ] Notebooks',
        category: 'Personal',
        isPinned: false,
        tags: ['personal'],
        isVoiceTranscribed: false,
      });

      const onRefresh = jest.fn();

      const {getByText, queryByText} = render(
        <ThemeProvider userId={userId}>
          <NotesScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={onRefresh}
          />
        </ThemeProvider>,
      );

      // Verify both note cards appear
      expect(getByText('Algorithms Lecture Notes')).toBeTruthy();
      expect(getByText('Dorm Shopping List')).toBeTruthy();

      // Check pinned filter
      const pinnedFilter = getByText('Pinned');
      fireEvent.press(pinnedFilter);

      // Pinned note remains, unpinned note is hidden
      expect(getByText('Algorithms Lecture Notes')).toBeTruthy();
      expect(queryByText('Dorm Shopping List')).toBeNull();

      // Switch back to All filter
      const allFilter = getByText('All');
      fireEvent.press(allFilter);
      expect(getByText('Algorithms Lecture Notes')).toBeTruthy();
      expect(getByText('Dorm Shopping List')).toBeTruthy();
    });

    test('allows creating a new note via the NoteEditor modal', async () => {
      const onRefresh = jest.fn();

      const {getAllByLabelText, getByText, getByPlaceholderText} = render(
        <ThemeProvider userId={userId}>
          <NotesScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={onRefresh}
          />
        </ThemeProvider>,
      );

      // The Plus icon in the FAB has accessibilityLabel="Plus"
      const plusIcons = getAllByLabelText('Plus');
      fireEvent.press(plusIcons[plusIcons.length - 1]);

      // Fill in note title and body in the editor modal
      const titleInput = getByPlaceholderText('Title');
      const bodyInput = getByPlaceholderText('Start writing...');

      fireEvent.changeText(titleInput, 'Software Engineering Principles');
      fireEvent.changeText(
        bodyInput,
        'SOLID principles and Clean Architecture',
      );

      // Press Done (save button)
      const doneButton = getByText('Done');
      fireEvent.press(doneButton);

      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
        const notes = notesStore.getAll(userId);
        expect(
          notes.some(n => n.title === 'Software Engineering Principles'),
        ).toBe(true);
      });
    });

    test('renders immediately without empty state flash on initial mount', () => {
      notesStore.insert({
        id: 'note-instant-1',
        userId,
        title: 'Instant Render Note',
        body: 'Should render without showing No notes found even for a millisecond',
        category: 'Personal',
        isPinned: false,
        tags: [],
        isVoiceTranscribed: false,
      });

      const {queryByText, getByText} = render(
        <ThemeProvider userId={userId}>
          <NotesScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={jest.fn()}
          />
        </ThemeProvider>,
      );

      // On the initial synchronous render:
      // 1. The note must be present immediately
      expect(getByText('Instant Render Note')).toBeTruthy();
      // 2. The empty state ("No notes found") must NOT be rendered
      expect(queryByText('No notes found')).toBeNull();
    });

    test('renders Tools header with Alarms | Todo | Notes tabs and opens Alarms view', () => {
      const {getByText, getByTestId} = render(
        <ThemeProvider userId={userId}>
          <NotesScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={jest.fn()}
          />
        </ThemeProvider>,
      );

      expect(getByText('Skills')).toBeTruthy();
      const alarmsTab = getByTestId('notes-subtab-alarms');
      const todoTab = getByTestId('notes-subtab-todo');
      const notesTab = getByTestId('notes-subtab-notes');
      expect(alarmsTab).toBeTruthy();
      expect(todoTab).toBeTruthy();
      expect(notesTab).toBeTruthy();

      fireEvent.press(alarmsTab);
      expect(getByTestId('alarms-view')).toBeTruthy();
      expect(getByTestId('alarms-next')).toBeTruthy();
    });

    test('opens Alarms sub-tab directly when openRequest specifies alarms', () => {
      const {getByTestId} = render(
        <ThemeProvider userId={userId}>
          <NotesScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={jest.fn()}
            openRequest={{
              requestId: 'req-alarms-1',
              ownerId: userId,
              screen: 'notes',
              notesTab: 'alarms',
            }}
          />
        </ThemeProvider>,
      );

      expect(getByTestId('alarms-view')).toBeTruthy();
    });

    test('centers empty state above the floating tab bar without downward top padding', () => {
      const {getByTestId, getByText} = render(
        <ThemeProvider userId={userId}>
          <NotesScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={jest.fn()}
          />
        </ThemeProvider>,
      );

      expect(getByText('No notes found')).toBeTruthy();
      const emptyStyle = StyleSheet.flatten(
        getByTestId('notes-empty-state').props.style,
      );
      expect(emptyStyle.paddingTop).toBeUndefined();
      expect(emptyStyle.paddingBottom).toBeGreaterThanOrEqual(100);
    });

    test('opens existing note in Preview mode by default and switches to Write when tapped', () => {
      notesStore.insert({
        id: 'note-preview-default-1',
        userId,
        title: 'Midterm Study Guide',
        body: '## Week 1\n- [ ] Review notes',
        category: 'Learning',
        isPinned: false,
        tags: [],
        isVoiceTranscribed: false,
      });

      const {
        getByText,
        getByTestId,
        queryByPlaceholderText,
        getByPlaceholderText,
      } = render(
        <ThemeProvider userId={userId}>
          <NotesScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={jest.fn()}
          />
        </ThemeProvider>,
      );

      fireEvent.press(getByText('Midterm Study Guide'));

      expect(getByTestId('note-preview')).toBeTruthy();
      expect(queryByPlaceholderText('Start writing...')).toBeNull();
      expect(
        getByTestId('note-mode-preview').props.accessibilityState.selected,
      ).toBe(true);
      expect(
        getByTestId('note-mode-write').props.accessibilityState.selected,
      ).toBe(false);

      fireEvent.press(getByTestId('note-mode-write'));
      expect(getByPlaceholderText('Start writing...')).toBeTruthy();
    });

    test('renders quick note, checklist, lecture, and record buttons in one equal-width row', () => {
      const {getByTestId, getByText} = render(
        <ThemeProvider userId={userId}>
          <NotesScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={jest.fn()}
            onBackToSkills={jest.fn()}
            onRecordMeeting={jest.fn()}
          />
        </ThemeProvider>,
      );

      const row = getByTestId('notes-quick-actions-row');
      const rowStyle = StyleSheet.flatten(row.props.style);
      expect(rowStyle.flexDirection).toBe('row');
      expect(rowStyle.flexWrap).not.toBe('wrap');

      for (const [testID, label] of [
        ['notes-quick-note-btn', 'Quick note'],
        ['notes-quick-checklist-btn', 'Checklist'],
        ['notes-quick-lecture-btn', 'Lecture'],
        ['notes-quick-record-btn', 'Record'],
      ] as const) {
        expect(getByText(label)).toBeTruthy();
        const btnStyle = StyleSheet.flatten(getByTestId(testID).props.style);
        expect(btnStyle.flex).toBe(1);
      }
    });
  });
});
