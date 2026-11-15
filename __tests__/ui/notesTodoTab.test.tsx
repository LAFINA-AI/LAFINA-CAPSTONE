import React from 'react';
import {Alert} from 'react-native';
import {
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {NotesScreen} from '../../src/ui/screens/notes';
import {
  alarmsStore,
  db,
  initDatabase,
  notesStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {toLocalYmd} from '../../src/ui/screens/notes/hooks/useTodoData';

describe('Notes Tab To-Do Integration', () => {
  let userId: string;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM alarms');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM notes_search_index');
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM custom_categories');
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM events');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM users');

    const guest = userStore.createGuestUser();
    userId = guest.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('defaults to Notes tab, shows pending badge, and switches to To-Do sub-tab with quick add & toggles', async () => {
    tasksStore.insertTask({
      id: 'todo-undated-1',
      userId,
      title: 'Return library book',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'High',
      category: 'Personal',
    });

    tasksStore.insertTask({
      id: 'todo-dated-1',
      userId,
      title: 'Submit Physics Lab',
      dueDate: toLocalYmd(),
      dueTime: '17:00',
      isCompleted: false,
      priority: 'Medium',
      category: 'Academics',
    });

    notesStore.insert({
      id: 'note-checklist-1',
      userId,
      title: 'Chem Prep',
      body: '- [ ] Bring goggles\n- [x] Print worksheet',
      category: 'Academics',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });

    const onRefresh = jest.fn();
    const screen = render(
      <ThemeProvider userId={userId}>
        <NotesScreen userId={userId} refreshTrigger={0} onRefresh={onRefresh} />
      </ThemeProvider>,
    );

    // NotesScreen keeps existing behavior by defaulting to the Notes sub-tab
    expect(screen.queryByTestId('notes-todo-view')).toBeNull();
    expect(screen.getByText('Chem Prep')).toBeTruthy();

    // Pending badge counts 2 open tasks + 1 unchecked note checklist = 3
    expect(screen.getByTestId('notes-subtab-todo')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();

    // Switch to To-Do sub-tab
    fireEvent.press(screen.getByTestId('notes-subtab-todo'));
    await waitFor(() => {
      expect(screen.getByTestId('notes-todo-view')).toBeTruthy();
    });

    expect(screen.getByText('Return library book')).toBeTruthy();
    expect(screen.getByText('Submit Physics Lab')).toBeTruthy();
    expect(screen.getByText('Bring goggles')).toBeTruthy();
    expect(screen.queryByText('Print worksheet')).toBeNull();

    // Quick-add a High-priority undated To-Do (cycle Medium -> High once)
    fireEvent.press(screen.getByTestId('todo-quick-priority'));
    fireEvent.changeText(
      screen.getByTestId('todo-quick-add-input'),
      'Buy lab manual',
    );
    fireEvent.press(screen.getByTestId('todo-quick-add-submit'));

    await waitFor(() => {
      expect(screen.getByText('Buy lab manual')).toBeTruthy();
    });

    const added = tasksStore
      .getAllTasks(userId)
      .find(t => t.title === 'Buy lab manual');
    expect(added).toBeDefined();
    expect(added?.dueDate).toBeNull();
    expect(added?.priority).toBe('High');
    expect(onRefresh).toHaveBeenCalled();

    // Toggle task checkbox inline
    fireEvent.press(screen.getByTestId('todo-checkbox-todo-undated-1'));
    const updatedTask = tasksStore
      .getAllTasks(userId)
      .find(t => t.id === 'todo-undated-1');
    expect(updatedTask?.isCompleted).toBe(true);

    // Toggle note checklist item inline -> updates underlying note body
    fireEvent.press(
      screen.getByTestId('todo-note-checklist-note-checklist-1-0'),
    );
    const updatedNote = notesStore
      .getAll(userId)
      .find(n => n.id === 'note-checklist-1');
    expect(updatedNote?.body).toContain('- [x] Bring goggles');
  });

  test('supports To-Do filters, search, full TodoEditorModal creation/edit, and opening parent note', async () => {
    tasksStore.insertTask({
      id: 'todo-u1',
      userId,
      title: 'Wash lab coat',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Low',
      category: 'Personal',
    });
    tasksStore.insertTask({
      id: 'todo-s1',
      userId,
      title: 'Calculus Quiz',
      dueDate: toLocalYmd(),
      dueTime: null,
      isCompleted: false,
      priority: 'High',
      category: 'Academics',
    });
    tasksStore.insertTask({
      id: 'todo-c1',
      userId,
      title: 'Finished old chore',
      dueDate: null,
      dueTime: null,
      isCompleted: true,
      priority: 'Medium',
      category: 'Personal',
    });
    notesStore.insert({
      id: 'note-parent-1',
      userId,
      title: 'Thesis Outline',
      body: '- [ ] Email adviser',
      category: 'Academics',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });

    const screen = render(
      <ThemeProvider userId={userId}>
        <NotesScreen userId={userId} refreshTrigger={0} onRefresh={jest.fn()} />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('notes-subtab-todo'));

    // Filter: Scheduled only
    fireEvent.press(screen.getByTestId('todo-filter-scheduled'));
    expect(screen.getByText('Calculus Quiz')).toBeTruthy();
    expect(screen.queryByText('Wash lab coat')).toBeNull();
    expect(screen.queryByText('Email adviser')).toBeNull();

    // Filter: From Notes only
    fireEvent.press(screen.getByTestId('todo-filter-checklists'));
    expect(screen.getByText('Email adviser')).toBeTruthy();
    expect(screen.queryByText('Calculus Quiz')).toBeNull();

    // Filter: Completed
    fireEvent.press(screen.getByTestId('todo-filter-completed'));
    expect(screen.getByText('Finished old chore')).toBeTruthy();
    expect(screen.queryByText('Calculus Quiz')).toBeNull();

    // Back to All Open & search
    fireEvent.press(screen.getByTestId('todo-filter-open'));
    fireEvent.press(screen.getByTestId('notes-search-button'));
    fireEvent.changeText(
      screen.getByPlaceholderText('Search to-dos...'),
      'lab',
    );
    expect(screen.getByText('Wash lab coat')).toBeTruthy();
    expect(screen.queryByText('Calculus Quiz')).toBeNull();

    // Clear search by closing search bar
    fireEvent.press(screen.getByLabelText('X'));
    expect(screen.getByText('Calculus Quiz')).toBeTruthy();

    // Create a new To-Do via FAB -> TodoEditorModal
    fireEvent.press(screen.getByTestId('todo-fab-add'));
    expect(screen.getByTestId('todo-editor-modal')).toBeTruthy();
    fireEvent.changeText(
      screen.getByTestId('todo-modal-title-input'),
      'Prepare presentation deck',
    );
    fireEvent.press(screen.getByTestId('todo-modal-priority-High'));
    fireEvent.press(
      within(screen.getByTestId('todo-editor-modal')).getByText('Today'),
    );
    fireEvent.press(screen.getByTestId('todo-modal-save'));

    await waitFor(() => {
      expect(screen.queryByTestId('todo-editor-modal')).toBeNull();
    });

    const created = tasksStore
      .getAllTasks(userId)
      .find(t => t.title === 'Prepare presentation deck');
    expect(created).toBeDefined();
    expect(created?.priority).toBe('High');
    expect(created?.dueDate).toBe(toLocalYmd());

    // Delete from TodoEditorModal
    fireEvent.press(screen.getByText('Wash lab coat'));
    expect(screen.getByTestId('todo-editor-modal')).toBeTruthy();
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_t, _m, buttons) => {
        buttons?.find(b => b.text === 'Delete')?.onPress?.();
      });
    fireEvent.press(screen.getByTestId('todo-modal-delete'));
    expect(alertSpy).toHaveBeenCalled();
    expect(
      tasksStore.getAllTasks(userId).find(t => t.id === 'todo-u1'),
    ).toBeUndefined();

    // Open parent note from Note Checklist item switches back to Notes sub-tab & opens editor
    fireEvent.press(screen.getByText(/From: Thesis Outline/));
    await waitFor(() => {
      expect(screen.queryByTestId('notes-todo-view')).toBeNull();
    });
    expect(screen.getByDisplayValue('Thesis Outline')).toBeTruthy();
  });

  test('deep-links directly to Notes To-Do sub-tab via openRequest', async () => {
    tasksStore.insertTask({
      id: 'todo-deep-1',
      userId,
      title: 'Deep linked to-do item',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'High',
      category: 'Personal',
    });

    const onHandled = jest.fn();
    const screen = render(
      <ThemeProvider userId={userId}>
        <NotesScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
          openRequest={{
            requestId: 'req-todo-1',
            ownerId: userId,
            screen: 'notes',
            notesTab: 'todo',
            entityKind: 'task',
            entityId: 'todo-deep-1',
          }}
          onOpenRequestHandled={onHandled}
        />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('notes-todo-view')).toBeTruthy();
    });
    expect(onHandled).toHaveBeenCalledWith('req-todo-1');
    expect(screen.getByText('Deep linked to-do item')).toBeTruthy();
  });

  test('keeps grid toggle on To-Do sub-tab, defaults category to None, and lets user add custom category', async () => {
    const screen = render(
      <ThemeProvider userId={userId}>
        <NotesScreen userId={userId} refreshTrigger={0} onRefresh={jest.fn()} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('notes-view-toggle')).toBeTruthy();
    fireEvent.press(screen.getByTestId('notes-subtab-todo'));
    await waitFor(() => {
      expect(screen.getByTestId('notes-todo-view')).toBeTruthy();
    });

    // Grid toggle remains rendered on To-Do sub-tab and toggles safely
    const gridToggle = screen.getByTestId('notes-view-toggle');
    expect(gridToggle).toBeTruthy();
    expect(screen.getByLabelText('Switch to list view')).toBeTruthy();
    fireEvent.press(gridToggle);
    expect(screen.getByLabelText('Switch to grid view')).toBeTruthy();

    // Quick-add defaults to no category ('')
    fireEvent.changeText(
      screen.getByTestId('todo-quick-add-input'),
      'Buy scantron sheet',
    );
    fireEvent.press(screen.getByTestId('todo-quick-add-submit'));
    await waitFor(() => {
      expect(screen.getByText('Buy scantron sheet')).toBeTruthy();
    });
    const quickTask = tasksStore
      .getAllTasks(userId)
      .find(t => t.title === 'Buy scantron sheet');
    expect(quickTask?.category).toBe('');

    // Modal defaults to None and can create + select a custom category
    fireEvent.press(screen.getByTestId('todo-fab-add'));
    expect(screen.getByTestId('todo-category-none')).toBeTruthy();
    fireEvent.press(screen.getByTestId('todo-category-add-btn'));
    fireEvent.changeText(
      screen.getByTestId('todo-new-category-input'),
      'Lab Prep',
    );
    fireEvent.press(screen.getByTestId('todo-new-category-submit'));
    fireEvent.changeText(
      screen.getByTestId('todo-modal-title-input'),
      'Prepare circuit board',
    );
    fireEvent.press(screen.getByTestId('todo-modal-save'));

    await waitFor(() => {
      expect(screen.queryByTestId('todo-editor-modal')).toBeNull();
    });
    const customTask = tasksStore
      .getAllTasks(userId)
      .find(t => t.title === 'Prepare circuit board');
    expect(customTask?.category).toBe('Lab Prep');
  });

  test('Tools header keeps + and view toggle consistent on Alarms and supports grid/list alarm views', async () => {
    const screen = render(
      <ThemeProvider userId={userId}>
        <NotesScreen userId={userId} refreshTrigger={0} onRefresh={jest.fn()} />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('notes-subtab-alarms'));
    await waitFor(() => {
      expect(screen.getByTestId('alarms-view')).toBeTruthy();
    });

    // Shared header controls remain in Tools header without a duplicate inner "Alarms" header
    expect(screen.getByTestId('notes-view-toggle')).toBeTruthy();
    expect(screen.getByTestId('alarm-add-button')).toBeTruthy();
    expect(screen.queryByTestId('alarm-view-toggle')).toBeNull();
    expect(screen.getAllByText('Alarms')).toHaveLength(1);

    // Header + opens AlarmEditorModal and creates an alarm
    fireEvent.press(screen.getByTestId('alarm-add-button'));
    fireEvent.changeText(screen.getByTestId('alarm-label-input'), 'Morning Lab');
    fireEvent.press(screen.getByTestId('alarm-save-button'));

    const [created] = alarmsStore.list(userId);
    expect(created).toBeDefined();
    expect(created.label).toBe('Morning Lab');

    // Starts in Grid view, toggles cleanly to Long/List view via the shared header toggle
    expect(screen.getByTestId(`alarm-grid-card-${created.id}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId('notes-view-toggle'));
    expect(screen.queryByTestId(`alarm-grid-card-${created.id}`)).toBeNull();
    expect(screen.getByTestId(`alarm-row-${created.id}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId('notes-view-toggle'));
    expect(screen.getByTestId(`alarm-grid-card-${created.id}`)).toBeTruthy();
  });

  test('Notes and To-Do grid views show concise uncluttered previews while list view keeps full details', async () => {
    notesStore.insert({
      id: 'note-grid-concise-1',
      userId,
      title: 'Sample Note',
      body: [
        'Hello, this is a quick note sample.',
        '## Notes',
        '- one',
        '- two',
        '- three',
        '- four',
      ].join('\n'),
      category: 'Personal',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });

    tasksStore.insertTask({
      id: 'todo-grid-concise-1',
      userId,
      title: 'Learn AI Engineering Course',
      dueDate: '2026-11-27',
      dueTime: null,
      isCompleted: false,
      priority: 'High',
      category: 'Academic',
      notes: 'Complete modules 1 through 4 before finals',
    });

    const screen = render(
      <ThemeProvider userId={userId}>
        <NotesScreen userId={userId} refreshTrigger={0} onRefresh={jest.fn()} />
      </ThemeProvider>,
    );

    // Notes Grid View: shows concise 3-block preview without "+N more lines" or trailing overflow items
    expect(screen.getByText('Sample Note')).toBeTruthy();
    expect(screen.getByText('Hello, this is a quick note sample.')).toBeTruthy();
    expect(screen.getByText('one')).toBeTruthy();
    expect(screen.queryByText('two')).toBeNull();
    expect(screen.queryByText(/more line/)).toBeNull();

    // Switch to To-Do Grid View: hides task notes, formats date compactly, omits extra category pill when High + due date exist
    fireEvent.press(screen.getByTestId('notes-subtab-todo'));
    await waitFor(() => {
      expect(screen.getByTestId('notes-todo-view')).toBeTruthy();
    });
    expect(screen.getByText('Learn AI Engineering Course')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('Nov 27')).toBeTruthy();
    expect(screen.queryByText('2026-11-27')).toBeNull();
    expect(
      screen.queryByText('Complete modules 1 through 4 before finals'),
    ).toBeNull();

    // Toggle to List View: full details appear for To-Do and Notes
    fireEvent.press(screen.getByTestId('notes-view-toggle'));
    expect(
      screen.getByText('Complete modules 1 through 4 before finals'),
    ).toBeTruthy();
    expect(screen.getByText('Academic')).toBeTruthy();
    expect(screen.getByText('2026-11-27')).toBeTruthy();

    fireEvent.press(screen.getByTestId('notes-subtab-notes'));
    expect(screen.getByText('two')).toBeTruthy();
    expect(screen.getByText(/\+2 more lines/)).toBeTruthy();
  });
});
