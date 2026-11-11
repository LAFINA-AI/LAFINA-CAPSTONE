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
});
