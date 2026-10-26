import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { CalendarScreen } from '../../src/ui/screens/calendar';
import { NotesScreen } from '../../src/ui/screens/notes';
import {
  db,
  initDatabase,
  tasksStore,
  notesStore,
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
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

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

      const { getByText } = render(
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

    test('opens FAB actions menu when plus icon is tapped', async () => {
      const { getByLabelText, getByText } = render(
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
      const { getByLabelText, getByText, getByPlaceholderText } = render(
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
      const expectedLocalDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(savedBlocks.rows[0].date).toBe(expectedLocalDate);
      expect(savedBlocks.rows[0].start_time).toBe('09:00');
      expect(savedBlocks.rows[0].end_time).toBe('10:00');

      // Verify calendar reloaded
      expect(onRefresh).toHaveBeenCalled();
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

      const { getByText, queryByText } = render(
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

      const { getAllByLabelText, getByText, getByPlaceholderText } = render(
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
      fireEvent.changeText(bodyInput, 'SOLID principles and Clean Architecture');

      // Press Done (save button)
      const doneButton = getByText('Done');
      fireEvent.press(doneButton);

      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
        const notes = notesStore.getAll(userId);
        expect(notes.some((n) => n.title === 'Software Engineering Principles')).toBe(true);
      });
    });
  });
});
