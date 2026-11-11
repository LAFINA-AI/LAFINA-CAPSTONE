import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {validatePayload} from '../../src/ai/voiceActions/actionValidator';
import {
  buildStudentVoiceContext,
  readLocalVoiceResult,
} from '../../src/cloud/voiceConversation/localVoiceData';
import {getToolWorkingPhrase} from '../../src/cloud/voiceConversation/personaPolicy';
import {
  db,
  initDatabase,
  notesStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {CallReadResults} from '../../src/ui/components/callLafina/CallReadResults';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {resolveCallTarget} from '../../src/ui/navigation/resolveCallTarget';

describe('Call Lafina To-Do Awareness & Read Card Integration', () => {
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

  test('buildStudentVoiceContext includes undated To-Dos, scheduled tasks, and unchecked Note checklists', () => {
    tasksStore.insertTask({
      id: 'call-todo-1',
      userId,
      title: 'Buy bluebook',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'High',
      category: 'Personal',
    });
    tasksStore.insertTask({
      id: 'call-task-2',
      userId,
      title: 'Finish Lab 5',
      dueDate: '2026-11-14',
      dueTime: '10:00',
      isCompleted: false,
      priority: 'Medium',
      category: 'Academics',
    });
    notesStore.insert({
      id: 'call-note-1',
      userId,
      title: 'Org Errands',
      body: '- [ ] Sign clearance slip\n- [x] Pay org fee',
      category: 'Personal',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });

    const ctx = buildStudentVoiceContext(userId);
    expect(ctx).toContain('To-Do List in Notes tab:');
    expect(ctx).toContain('[To-Do] "Buy bluebook"');
    expect(ctx).toContain('[Scheduled Task] "Finish Lab 5"');
    expect(ctx).toContain('[Note Checklist] "Sign clearance slip"');
    const todoSection =
      ctx
        .split('To-Do List in Notes tab:')[1]
        ?.split('Saved Notes in Notes tab:')[0] ?? '';
    expect(todoSection).not.toContain('Pay org fee');
  });

  test('readLocalVoiceResult("todos"), actionValidator, and persona working phrase support todos', () => {
    tasksStore.insertTask({
      id: 'call-read-todo-1',
      userId,
      title: 'Pick up lab goggles',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'High',
      category: 'Academics',
    });
    notesStore.insert({
      id: 'call-read-note-1',
      userId,
      title: 'Checklist Note',
      body: '- [ ] Bring goggles case',
      category: 'Academics',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });

    const validation = validatePayload('legacy.read_data', {
      kind: 'todos',
      query: 'goggles',
    });
    expect(validation.valid).toBe(true);
    expect(getToolWorkingPhrase('read_lafina_data', 'todos')).toBe(
      'Checking your to-do list...',
    );

    const read = readLocalVoiceResult(userId, 'todos', 'goggles');
    expect(typeof read).not.toBe('string');
    if (typeof read === 'string') return;
    expect('todos' in read).toBe(true);
    if (!('todos' in read) || !read.todos || !read.noteChecklists) return;
    expect(read.todos.map(t => t.title)).toEqual(['Pick up lab goggles']);
    expect(read.noteChecklists.map(c => c.text)).toEqual([
      'Bring goggles case',
    ]);
  });

  test('CallReadResults renders todos card and routes Open Notes To-Do button to Notes -> To-Do tab', () => {
    const onDismiss = jest.fn();
    const onNavigate = jest.fn();

    const screen = render(
      <ThemeProvider userId={userId}>
        <CallReadResults
          ownerId={userId}
          result={{
            todos: [
              {
                id: 't1',
                title: 'Submit clearance',
                dueDate: null,
                dueTime: null,
                priority: 'High',
                category: 'Personal',
                completed: false,
              },
            ],
            noteChecklists: [
              {
                noteId: 'n1',
                noteTitle: 'Registrar',
                text: 'Bring valid ID',
              },
            ],
            partial: false,
            dataIsUntrusted: true,
          }}
          onDismiss={onDismiss}
          onNavigate={onNavigate}
        />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('call-todo-results')).toBeTruthy();
    expect(screen.getByText(/Submit clearance/)).toBeTruthy();
    expect(screen.getByText(/Bring valid ID/)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Open Notes To-Do'));
    expect(onNavigate).toHaveBeenCalledWith({
      ownerId: userId,
      screen: 'notes',
      notesTab: 'todo',
    });
  });

  test('resolveCallTarget resolves an undated task under Notes openRequest', () => {
    tasksStore.insertTask({
      id: 'todo-target-1',
      userId,
      title: 'Order graphing paper',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Low',
      category: 'Personal',
    });

    const resolved = resolveCallTarget(userId, {
      ownerId: userId,
      screen: 'notes',
      notesTab: 'todo',
      entityKind: 'task',
      entityId: 'todo-target-1',
    });
    expect(resolved?.kind).toBe('task');
    if (resolved?.kind === 'task') {
      expect(resolved.item.title).toBe('Order graphing paper');
    }
  });
});
