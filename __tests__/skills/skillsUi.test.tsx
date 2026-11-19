import React from 'react';
jest.mock('../../src/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {SkillsScreen} from '../../src/ui/screens/skills/SkillsScreen';
import {FlashcardsSkill} from '../../src/ui/screens/skills/FlashcardsSkill';
import {GwaSkill} from '../../src/ui/screens/skills/GwaSkill';
import {QuizSkill} from '../../src/ui/screens/skills/QuizSkill';
import {readSkillState, writeSkillState} from '../../src/skills/skillsState';
import type {Deck, GradeSubject} from '../../src/skills/studyLogic';
import {
  db,
  initDatabase,
  notesStore,
  tasksStore,
  userStore,
} from '../../src/storage';

let owner: string;
beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  for (const table of [
    'active_session',
    'local_settings',
    'alarms',
    'notes',
    'tasks',
    'recorded_meetings',
    'notes_search_index',
  ])
    db.executeSync(`DELETE FROM ${table}`);
  owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
});
const wrap = (children: React.ReactNode) => (
  <ThemeProvider userId={owner}>{children}</ThemeProvider>
);
test('Skills hub opens existing notes and returns to the retained hub with real data', async () => {
  notesStore.insert({
    id: 'skill-real-note',
    userId: owner,
    title: 'My saved chemistry note',
    body: 'My own material',
    category: 'Learning',
    isPinned: true,
    tags: [],
    isVoiceTranscribed: false,
  });
  tasksStore.insertTask({
    id: 'skill-real-task',
    userId: owner,
    title: 'My open assignment',
    isCompleted: false,
    priority: 'High',
    category: 'Learning',
  });
  const view = render(
    wrap(
      <SkillsScreen userId={owner} refreshTrigger={0} onRefresh={jest.fn()} />,
    ),
  );
  expect(view.getByText('1 notes')).toBeTruthy();
  expect(view.getByText('1 open')).toBeTruthy();
  const hub = view.getByTestId('skills-hub');
  fireEvent.press(view.getByTestId('skills-open-notes'));
  await waitFor(() =>
    expect(view.getByText('My saved chemistry note')).toBeTruthy(),
  );
  expect(view.queryByTestId('notes-subtab-todo')).toBeNull();
  fireEvent.press(view.getByLabelText('Back to Skills'));
  expect(view.getByTestId('skills-hub')).toBe(hub);
  fireEvent.changeText(
    view.getByLabelText('Search skills, notes, to-dos'),
    'assignment',
  );
  await waitFor(() =>
    expect(view.getByText('My open assignment')).toBeTruthy(),
  );
  fireEvent.press(view.getByLabelText('Open task: My open assignment'));
  await waitFor(() =>
    expect(view.getByTestId('todo-row-skill-real-task')).toBeTruthy(),
  );
});
test('a manually created flashcard studies offline and persists its rating', async () => {
  const view = render(
    wrap(<FlashcardsSkill userId={owner} onQuiz={jest.fn()} />),
  );
  fireEvent.press(view.getByText('Create a deck'));
  fireEvent.changeText(view.getByLabelText('Deck name'), 'My deck');
  fireEvent.changeText(view.getByLabelText('Question'), 'My question');
  fireEvent.changeText(view.getByLabelText('Answer'), 'My answer');
  fireEvent.press(view.getByText('Save card'));
  await waitFor(() => expect(view.getByText('Study deck')).toBeTruthy());
  fireEvent.press(view.getByText('Study deck'));
  fireEvent.press(view.getByText('Reveal answer'));
  fireEvent.press(view.getByText('Easy'));
  await waitFor(() => expect(view.getByText('Session complete')).toBeTruthy());
  const decks = readSkillState<Deck[]>(owner, 'decks', []);
  expect(decks[0].title).toBe('My deck');
  expect(decks[0].cards[0].reviews).toBe(1);
  expect(decks[0].cards[0].intervalDays).toBe(4);
});
test('GWA subjects are restored per semester and quarter-step changes persist', async () => {
  writeSkillState(owner, 'gwa.lastSemester', 'My semester');
  writeSkillState<GradeSubject[]>(owner, 'gwa.My%20semester', [
    {id: 'a', name: 'My subject', units: 3, grade: 2},
  ]);
  const view = render(wrap(<GwaSkill userId={owner} />));
  expect(view.getAllByText('2.00').length).toBeGreaterThan(0);
  fireEvent.press(view.getByLabelText('Better grade for My subject'));
  await waitFor(() =>
    expect(
      readSkillState<GradeSubject[]>(owner, 'gwa.My%20semester', [])[0].grade,
    ).toBe(1.75),
  );
  view.unmount();
  const reopened = render(wrap(<GwaSkill userId={owner} />));
  expect(reopened.getByText('My subject')).toBeTruthy();
  expect(reopened.getAllByText('1.75').length).toBeGreaterThan(0);
});
test('a saved quiz gives feedback, a real score, and makes cards from mistakes without AI', async () => {
  writeSkillState(owner, 'quiz', {
    id: 'q',
    questions: [
      {
        question: 'My question',
        options: ['Correct', 'Incorrect'],
        correct: 0,
        explanation: 'My explanation',
        source: 'My source',
      },
    ],
    answers: [],
    index: 0,
    source: {text: 'My source', label: 'My note'},
  });
  const view = render(
    wrap(
      <QuizSkill userId={owner} onFlashcards={jest.fn()} onNote={jest.fn()} />,
    ),
  );
  fireEvent.press(view.getByLabelText('Incorrect'));
  expect(view.getByText('Not quite')).toBeTruthy();
  expect(view.getByText('My explanation')).toBeTruthy();
  fireEvent.press(view.getByText('See score'));
  expect(view.getByText('0%')).toBeTruthy();
  fireEvent.press(view.getByText('Make flashcards from mistakes'));
  expect(
    readSkillState<Deck[]>(owner, 'decks', [])[0].cards[0].answer,
  ).toContain('Correct');
});
