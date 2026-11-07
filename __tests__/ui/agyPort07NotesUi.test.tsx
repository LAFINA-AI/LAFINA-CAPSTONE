/**
 * AGY-PORT 07: the Notes screen keeps the student's draft on stale or failed
 * saves, retires late actions, pages and searches through SQLite, and keeps
 * meeting-generated notes editable. Synthetic notes only.
 */
import React from 'react';
import {Alert} from 'react-native';
import type {AlertButton} from 'react-native';
import {
  act,
  fireEvent,
  render,
  renderHook,
} from '@testing-library/react-native';
import {
  db,
  initDatabase,
  notesStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {GUEST_USER_ID} from '../../src/constants';
import {useNotesData} from '../../src/ui/screens/notes/hooks/useNotesData';
import {NotesScreen} from '../../src/ui/screens/notes';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

type AlertCall = {title: string; message?: string; buttons?: AlertButton[]};

const captureAlerts = (): AlertCall[] => {
  const calls: AlertCall[] = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    calls.push({title, message, buttons: buttons as AlertButton[] | undefined});
  });
  return calls;
};

const press = (call: AlertCall | undefined, label: string): void => {
  const button = call?.buttons?.find(b => b.text === label);
  if (!button?.onPress) throw new Error(`no "${label}" button`);
  act(() => {
    button.onPress?.();
  });
};

let serial = 0;
const seed = (
  userId: string,
  fields: {title?: string; body?: string; sortOrder?: number} = {},
): string => {
  serial += 1;
  const id = `p07ui-${String(serial).padStart(5, '0')}`;
  notesStore.insert({
    id,
    userId,
    title: fields.title ?? `Note ${serial}`,
    body: fields.body ?? `Body ${serial}`,
    category: 'Personal',
    isPinned: false,
    tags: [],
    isVoiceTranscribed: false,
    sortOrder: fields.sortOrder,
  });
  return id;
};

const row = (id: string) =>
  db.executeSync('SELECT title, body, deleted_at FROM notes WHERE id = ?', [id])
    .rows[0];

const renderNotesHook = (initialUser: string = GUEST_USER_ID) =>
  renderHook(
    ({userId}: {userId: string}) =>
      useNotesData({userId, refreshTrigger: 0, onRefresh: jest.fn()}),
    {initialProps: {userId: initialUser}},
  );

describe('AGY-PORT 07 Notes UI', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM notes_search_index');
    db.executeSync('DELETE FROM active_session');
    userStore.createGuestUser();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('a stale editor save keeps the draft open and "Save as a copy" never overwrites the newer note', () => {
    const id = seed(GUEST_USER_ID, {title: 'Lab', body: 'original'});
    const alerts = captureAlerts();
    const {result} = renderNotesHook();
    act(() => result.current.openEditNote(result.current.notes[0]));
    act(() => result.current.setNoteBody('my phone draft'));

    // Another writer (sync, assistant, second editor) saves first.
    notesStore.update({id, body: 'newer from the laptop'});
    act(() => result.current.saveNote());

    expect(alerts.at(-1)?.title).toBe('Note changed elsewhere');
    expect(result.current.editorVisible).toBe(true);
    expect(result.current.noteBody).toBe('my phone draft');
    expect(row(id)?.body).toBe('newer from the laptop');

    press(alerts.at(-1), 'Save as a copy');
    expect(result.current.editorVisible).toBe(false);
    expect(row(id)?.body).toBe('newer from the laptop');
    const copies = db.executeSync(
      'SELECT title, body FROM notes WHERE id <> ? AND deleted_at IS NULL',
      [id],
    ).rows;
    expect(copies).toEqual([{title: 'Lab (copy)', body: 'my phone draft'}]);
  });

  test('a delete confirmed after the note changed is refused and the note stays', () => {
    const id = seed(GUEST_USER_ID, {body: 'v1'});
    const alerts = captureAlerts();
    const {result} = renderNotesHook();
    act(() => result.current.openEditNote(result.current.notes[0]));
    act(() => result.current.deleteNote(id));
    notesStore.update({id, body: 'v2 from sync'});
    press(alerts.at(-1), 'Delete');

    expect(alerts.at(-1)?.title).toBe('Note not deleted');
    expect(row(id)?.deleted_at).toBeNull();
    expect(row(id)?.body).toBe('v2 from sync');
    expect(result.current.editorVisible).toBe(true);
  });

  test('a card checklist tap over a stale card is refused and the list refreshes', () => {
    const id = seed(GUEST_USER_ID, {body: '- [ ] read chapter'});
    const alerts = captureAlerts();
    const {result} = renderNotesHook();
    const card = result.current.notes[0];
    notesStore.update({
      id,
      body: '- [ ] read chapter\n- [ ] new item from sync',
    });

    act(() => result.current.toggleNoteChecklist(card, 0));
    expect(alerts.at(-1)?.title).toBe('Note changed elsewhere');
    expect(row(id)?.body).toBe('- [ ] read chapter\n- [ ] new item from sync');
    expect(result.current.notes[0].body).toContain('new item from sync');

    // On the fresh card the same tap works.
    act(() => result.current.toggleNoteChecklist(result.current.notes[0], 0));
    expect(row(id)?.body).toBe('- [x] read chapter\n- [ ] new item from sync');
  });

  test('an account change closes the editor and retires a pending AI action', () => {
    jest.useFakeTimers();
    const id = seed(GUEST_USER_ID, {
      title: 'Plan',
      body: 'Write the introduction section',
    });
    const {result, rerender} = renderNotesHook();
    act(() => result.current.openEditNote(result.current.notes[0]));
    act(() => result.current.triggerAiAction('tasks'));

    rerender({userId: 'p07ui-other-account'});
    expect(result.current.editorVisible).toBe(false);
    expect(result.current.noteBody).toBe('');
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(tasksStore.getAllTasks(GUEST_USER_ID)).toHaveLength(0);
    expect(tasksStore.getAllTasks('p07ui-other-account')).toHaveLength(0);
    expect(row(id)?.body).toBe('Write the introduction section');
  });

  test('closing the editor before the AI timer fires retires it', () => {
    jest.useFakeTimers();
    seed(GUEST_USER_ID, {body: 'Line that is long enough to extract'});
    const {result} = renderNotesHook();
    act(() => result.current.openEditNote(result.current.notes[0]));
    act(() => result.current.triggerAiAction('tasks'));
    act(() => result.current.closeEditor());
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(tasksStore.getAllTasks(GUEST_USER_ID)).toHaveLength(0);
  });

  test('pages load on request; reorder waits for the complete collection', () => {
    for (let i = 0; i < 60; i += 1) seed(GUEST_USER_ID, {sortOrder: i});
    const {result} = renderNotesHook();
    expect(result.current.notes).toHaveLength(50);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.canReorder).toBe(false);

    act(() => result.current.loadMoreNotes());
    expect(result.current.notes).toHaveLength(60);
    expect(new Set(result.current.notes.map(n => n.id)).size).toBe(60);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.canReorder).toBe(true);
  });

  test('the screen searches through SQLite, shows indexing progress and a "Show more" button', async () => {
    for (let i = 0; i < 70; i += 1) {
      seed(GUEST_USER_ID, {
        title: `Entry ${i}`,
        body: i % 2 ? 'calculus' : 'history',
      });
    }
    const screen = render(
      <ThemeProvider userId={GUEST_USER_ID}>
        <NotesScreen
          userId={GUEST_USER_ID}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('notes-load-more')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Search'));
    fireEvent.changeText(
      screen.getByPlaceholderText('Search notes...'),
      'calculus',
    );
    expect(screen.getByTestId('notes-indexing')).toBeTruthy();
    // The screen asks again on a short timer until the cache is complete.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
    });
    expect(screen.queryByTestId('notes-indexing')).toBeNull();
    expect(screen.getAllByText('calculus')).toHaveLength(35);
    expect(screen.queryByText('history')).toBeNull();
  });

  test('a meeting-generated note is searchable and editable like any other', () => {
    // Same insert MeetingDetail.saveToNotes performs.
    notesStore.insert({
      id: 'p07ui-meeting',
      userId: GUEST_USER_ID,
      title: 'Lecture 4',
      body: '## Summary\nEntropy always increases.\n\n## Action items\n- [ ] Review slides',
      category: 'Academic',
      isPinned: false,
      tags: ['Lecture', 'Transcript'],
      isVoiceTranscribed: true,
    });
    const {result} = renderNotesHook();
    act(() => result.current.setSearchQuery('entropy'));
    for (let i = 0; i < 3 && result.current.indexing; i += 1) {
      act(() => result.current.loadNotes());
    }
    expect(result.current.notes.map(n => n.id)).toEqual(['p07ui-meeting']);

    act(() => result.current.openEditNote(result.current.notes[0]));
    act(() => result.current.setNoteTitle('Lecture 4 (reviewed)'));
    act(() => result.current.saveNote());
    expect(row('p07ui-meeting')?.title).toBe('Lecture 4 (reviewed)');
    expect(row('p07ui-meeting')?.body).toContain('- [ ] Review slides');
  });
});
