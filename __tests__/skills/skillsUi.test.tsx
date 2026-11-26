import React from 'react';
let mockReducedMotion = true;
jest.mock('../../src/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion,
}));
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {Alert} from 'react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {SkillsScreen} from '../../src/ui/screens/skills/SkillsScreen';
import {SkillsHub} from '../../src/ui/screens/skills/SkillsHub';
import {FlashcardsSkill} from '../../src/ui/screens/skills/FlashcardsSkill';
import {GwaSkill} from '../../src/ui/screens/skills/GwaSkill';
import {QuizSkill} from '../../src/ui/screens/skills/QuizSkill';
import {SourcePicker} from '../../src/ui/screens/skills/SourcePicker';
import type {SkillSource} from '../../src/ui/screens/skills/SourcePicker';
import {readSkillState, writeSkillState} from '../../src/skills/skillsState';
import {addDeck, buildQuizSourceFromDeck} from '../../src/skills/studyDecks';
import {resetStudyJobsForTests} from '../../src/skills/studyJobs';
import type {Deck, GradeSubject} from '../../src/skills/studyLogic';
import {
  db,
  initDatabase,
  materialStore,
  notesStore,
  tasksStore,
  userStore,
} from '../../src/storage';

let owner: string;
beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  mockReducedMotion = true;
  resetStudyJobsForTests();
  for (const table of [
    'active_session',
    'local_settings',
    'alarms',
    'notes',
    'tasks',
    'recorded_meetings',
    'notes_search_index',
    'user_material_chunks',
    'user_material_qa_messages',
    'user_materials',
  ])
    db.executeSync(`DELETE FROM ${table}`);
  owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
});
afterEach(() => {
  jest.restoreAllMocks();
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

test('deleting a GWA semester removes its grades permanently without touching another semester', async () => {
  writeSkillState(owner, 'gwa.lastSemester', 'Term A');
  writeSkillState(owner, 'gwa.semesters', ['Term A', 'Term B']);
  writeSkillState<GradeSubject[]>(owner, 'gwa.Term%20A', [
    {id: 'a', name: 'Deleted subject', units: 3, grade: 2},
  ]);
  writeSkillState<GradeSubject[]>(owner, 'gwa.Term%20B', [
    {id: 'b', name: 'Kept subject', units: 3, grade: 1.5},
  ]);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = render(wrap(<GwaSkill userId={owner} />));
  fireEvent.press(view.getByLabelText('Change semester'));
  fireEvent.press(view.getByLabelText('Delete semester Term A'));
  const confirm = alert.mock.calls
    .at(-1)?.[2]
    ?.find(button => button.text === 'Remove');
  expect(confirm?.onPress).toBeDefined();
  act(() => confirm!.onPress!());
  expect(readSkillState<GradeSubject[]>(owner, 'gwa.Term%20A', [])).toEqual([]);
  expect(
    readSkillState<GradeSubject[]>(owner, 'gwa.Term%20B', [])[0].name,
  ).toBe('Kept subject');
  view.unmount();
  const reopened = render(wrap(<GwaSkill userId={owner} />));
  expect(reopened.queryByText('Deleted subject')).toBeNull();
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
  expect(view.getAllByText('0%').length).toBeGreaterThan(0);
  fireEvent.press(view.getByText('Make flashcards from mistakes'));
  expect(
    readSkillState<Deck[]>(owner, 'decks', [])[0].cards[0].answer,
  ).toContain('Correct');
  // Tapping again is disabled and must not duplicate the mistake deck.
  fireEvent.press(view.getByText('Flashcards saved'));
  expect(readSkillState<Deck[]>(owner, 'decks', [])).toHaveLength(1);
});
test('flashcards rated Again are requeued in the active session and cards can be deleted', async () => {
  writeSkillState<Deck[]>(owner, 'decks', [
    {
      id: 'd1',
      title: 'Bio',
      createdAt: new Date().toISOString(),
      cards: [
        {
          id: 'c1',
          question: 'What carries oxygen?',
          answer: 'Hemoglobin',
          intervalDays: 0,
          ease: 2.5,
          dueAt: 0,
          reviews: 0,
        },
        {
          id: 'c2',
          question: 'Extra Q',
          answer: 'Extra A',
          intervalDays: 0,
          ease: 2.5,
          dueAt: 0,
          reviews: 0,
        },
      ],
    },
  ]);
  const view = render(
    wrap(<FlashcardsSkill userId={owner} onQuiz={jest.fn()} />),
  );
  // Delete second card via Manage cards with confirmation prompt
  const alertSpy = jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_title, _msg, buttons) => {
      buttons?.find(b => b.style === 'cancel')?.onPress?.();
    });
  fireEvent.press(view.getByText('Manage cards'));
  fireEvent.press(view.getByLabelText('Delete card 2'));
  expect(alertSpy).toHaveBeenCalledWith(
    'Delete card?',
    'Remove this card from the deck?',
    expect.any(Array),
  );
  expect(readSkillState<Deck[]>(owner, 'decks', [])[0].cards).toHaveLength(2);

  alertSpy.mockImplementation((_title, _msg, buttons) => {
    buttons?.find(b => b.style === 'destructive')?.onPress?.();
  });
  fireEvent.press(view.getByLabelText('Delete card 2'));
  expect(readSkillState<Deck[]>(owner, 'decks', [])[0].cards).toHaveLength(1);
  fireEvent.press(view.getByText('Hide cards'));

  // Study remaining card: Again requeues before completing
  fireEvent.press(view.getByText('Study deck'));
  fireEvent.press(view.getByText('Reveal answer'));
  fireEvent.press(view.getByText('Again'));
  expect(view.queryByText('Session complete')).toBeNull();
  expect(view.getByText('What carries oxygen?')).toBeTruthy();
  fireEvent.press(view.getByText('Reveal answer'));
  fireEvent.press(view.getByText('Good'));
  await waitFor(() => expect(view.getByText('Session complete')).toBeTruthy());
});
test('quiz Finish later pauses at current index and Resume quiz continues from it', () => {
  writeSkillState(owner, 'quiz', {
    id: 'q2',
    questions: [
      {
        question: 'First Q',
        options: ['A', 'B'],
        correct: 0,
        explanation: 'Exp 1',
        source: 'Src 1',
      },
      {
        question: 'Second Q',
        options: ['C', 'D'],
        correct: 1,
        explanation: 'Exp 2',
        source: 'Src 2',
      },
    ],
    answers: [0],
    index: 1,
    source: {text: 'Src', label: 'Note'},
  });
  const view = render(
    wrap(
      <QuizSkill userId={owner} onFlashcards={jest.fn()} onNote={jest.fn()} />,
    ),
  );
  expect(view.getByText('Second Q')).toBeTruthy();
  fireEvent.press(view.getByText('Finish later'));
  expect(view.getByText('Resume quiz')).toBeTruthy();
  fireEvent.press(view.getByText('Resume quiz'));
  expect(view.getByText('Second Q')).toBeTruthy();
});
test('Skills hub ignores whitespace search and keeps all 6 study skills visible when docgen is pinned', () => {
  writeSkillState(owner, 'pins', ['docgen']);
  const view = render(
    wrap(
      <SkillsHub
        userId={owner}
        refreshTrigger={0}
        onOpen={jest.fn()}
        onEntity={jest.fn()}
      />,
    ),
  );
  fireEvent.changeText(
    view.getByLabelText('Search skills, notes, to-dos'),
    '   ',
  );
  expect(view.getByText('Study skills')).toBeTruthy();
  expect(view.queryByText('No notes or to-dos match this search.')).toBeNull();
  expect(view.getByText('Meetings')).toBeTruthy();
  expect(view.getByText('Create with LAFINA')).toBeTruthy();
});
test('flashcard reveal renders visible answer without backface culling and supports undo, edit, rename, and save-and-add-another', async () => {
  mockReducedMotion = false;
  const view = render(
    wrap(<FlashcardsSkill userId={owner} onQuiz={jest.fn()} />),
  );
  // Create deck with Save & add another
  fireEvent.press(view.getByText('Create a deck'));
  fireEvent.changeText(view.getByLabelText('Deck name'), 'Chem 101');
  fireEvent.changeText(view.getByLabelText('Question'), 'Symbol for Gold');
  fireEvent.changeText(view.getByLabelText('Answer'), 'Au');
  fireEvent.press(view.getByText('Save & add another'));
  expect(view.getByText('Card saved! 1 card in deck.')).toBeTruthy();
  expect(view.getByText('Add cards · Chem 101')).toBeTruthy();

  fireEvent.changeText(view.getByLabelText('Question'), 'Symbol for Silver');
  fireEvent.changeText(view.getByLabelText('Answer'), 'Ag');
  fireEvent.press(view.getByText('Save card'));
  await waitFor(() => expect(view.getByText('Study deck')).toBeTruthy());

  // Rename deck and edit card 2 in Manage cards
  fireEvent.press(view.getByText('Manage cards'));
  fireEvent.press(view.getByLabelText('Rename deck Chem 101'));
  fireEvent.changeText(view.getByLabelText('Rename deck'), 'Chemistry 101');
  fireEvent.press(view.getByText('Save name'));
  expect(view.getByText('Chemistry 101')).toBeTruthy();

  fireEvent.press(view.getByLabelText('Edit card 2'));
  fireEvent.changeText(view.getByLabelText('Edit answer 2'), 'Ag (Argentum)');
  fireEvent.press(view.getByText('Save changes'));
  expect(view.getByText('Ag (Argentum)')).toBeTruthy();
  fireEvent.press(view.getByText('Hide cards'));

  // Study deck: reveal answer, verify no backfaceVisibility: 'hidden', then undo & review missed
  fireEvent.press(view.getByText('Study deck'));
  expect(view.getByText('1 / 2')).toBeTruthy();
  fireEvent.press(view.getByText('Reveal answer'));
  const answerText = view.getByText('Au');
  expect(answerText).toBeTruthy();
  expect(view.getByText('Q: Symbol for Gold')).toBeTruthy();
  const serializedTree = JSON.stringify(view.toJSON());
  expect(serializedTree).not.toContain('backfaceVisibility');

  // Rate Hard on card 1, then Undo last to re-rate Easy
  fireEvent.press(view.getByLabelText('Hard'));
  expect(view.getByText('2 / 2')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Undo last rating'));
  expect(view.getByText('1 / 2')).toBeTruthy();
  expect(view.getByText('Au')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Easy'));

  // Rate Hard on card 2 -> Session complete offers Review missed (1)
  expect(view.getByText('2 / 2')).toBeTruthy();
  fireEvent.press(view.getByText('Reveal answer'));
  expect(view.getByText('Ag (Argentum)')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Hard'));
  await waitFor(() => expect(view.getByText('Session complete')).toBeTruthy());
  expect(view.getByText('Review missed (1)')).toBeTruthy();

  // Back to decks: 0 due today shows Study all cards directly
  fireEvent.press(view.getByText('Back to decks'));
  expect(view.getByText('All caught up today')).toBeTruthy();
  fireEvent.press(view.getByText('Study all cards'));
  expect(view.getByText('1 / 2')).toBeTruthy();
});

test('flashcards support Undo last from Session complete, deleting the last card without trapping Manage cards, and renaming an empty deck', async () => {
  writeSkillState<Deck[]>(owner, 'decks', [
    {
      id: 'd-undo',
      title: 'Empty Check',
      createdAt: new Date().toISOString(),
      cards: [
        {
          id: 'c1',
          question: 'Only Q',
          answer: 'Only A',
          intervalDays: 0,
          ease: 2.5,
          dueAt: 0,
          reviews: 0,
        },
      ],
    },
  ]);
  const view = render(
    wrap(<FlashcardsSkill userId={owner} onQuiz={jest.fn()} />),
  );

  fireEvent.press(view.getByText('Study deck'));
  fireEvent.press(view.getByText('Reveal answer'));
  fireEvent.press(view.getByLabelText('Good'));
  await waitFor(() => expect(view.getByText('Session complete')).toBeTruthy());

  // Undo last from Session complete brings the final card back
  fireEvent.press(view.getByText('Undo last'));
  expect(view.getByText('1 / 1')).toBeTruthy();
  expect(view.getByText('Only A')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Easy'));
  await waitFor(() => expect(view.getByText('Session complete')).toBeTruthy());
  fireEvent.press(view.getByText('Back to decks'));

  // Deleting the last card keeps Manage cards / Hide cards usable and allows renaming the empty deck
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find(b => b.style === 'destructive')?.onPress?.();
  });
  fireEvent.press(view.getByText('Manage cards'));
  fireEvent.press(view.getByLabelText('Delete card 1'));
  expect(view.getByText('No cards in this deck yet.')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Rename deck Empty Check'));
  fireEvent.changeText(view.getByLabelText('Rename deck'), 'Renamed Empty');
  fireEvent.press(view.getByText('Save name'));
  expect(view.getAllByText('Renamed Empty').length).toBeGreaterThan(0);
  fireEvent.press(view.getByText('Hide cards'));
  expect(view.getByText('No cards yet')).toBeTruthy();
});

test('flashcards support Shuffle, Swap Q/A, in-session Edit, sourceLabel attribution, live deck sync, and quiz handoff', async () => {
  const onQuiz = jest.fn();
  writeSkillState<Deck[]>(owner, 'decks', [
    {
      id: 'd-study',
      title: 'Physics',
      createdAt: '2026-11-20T00:00:00.000Z',
      cards: [
        {
          id: 'p1',
          question: 'Unit of Force',
          answer: 'Newton',
          sourceLabel: 'Mechanics Notes',
          intervalDays: 0,
          ease: 2.5,
          dueAt: 0,
          reviews: 0,
        },
        {
          id: 'p2',
          question: 'Unit of Energy',
          answer: 'Joule',
          sourceLabel: 'Mechanics Notes',
          intervalDays: 0,
          ease: 2.5,
          dueAt: 0,
          reviews: 0,
        },
      ],
    },
  ]);

  const view = render(wrap(<FlashcardsSkill userId={owner} onQuiz={onQuiz} />));

  // Live subscription from another tool (e.g., Summarizer/Quiz) never gets clobbered by editing another deck
  act(() => {
    addDeck(owner, {
      id: 'd-summary',
      title: 'Summary · Optics',
      createdAt: '2026-11-21T00:00:00.000Z',
      cards: [
        {
          id: 'o1',
          question: 'Speed of light?',
          answer: '3e8 m/s',
          intervalDays: 0,
          ease: 2.5,
          dueAt: 0,
          reviews: 0,
        },
      ],
    });
  });
  expect(view.getByText('Summary · Optics')).toBeTruthy();

  // Open Physics deck to test study controls
  const studyButtons = view.getAllByText('Study deck');
  fireEvent.press(studyButtons[1]);

  // Swap Q/A switches front to answer
  fireEvent.press(view.getByLabelText('Swap question and answer'));
  expect(view.getByText('ANSWER')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Swap question and answer'));
  expect(view.getByText('QUESTION')).toBeTruthy();

  // Shuffle keeps queue length intact
  fireEvent.press(view.getByLabelText('Shuffle remaining cards'));
  expect(view.getByText('1 / 2')).toBeTruthy();

  // In-session edit updates active card & persisted deck without clobbering d-summary
  fireEvent.press(view.getByLabelText('Edit active card'));
  fireEvent.changeText(view.getByLabelText('Edit active question'), 'Edited Q');
  fireEvent.changeText(view.getByLabelText('Edit active answer'), 'Edited A');
  fireEvent.press(view.getByText('Save changes'));
  expect(view.getByText('Edited Q')).toBeTruthy();
  expect(readSkillState<Deck[]>(owner, 'decks', [])).toHaveLength(2);

  // Reveal answer verifies sourceLabel attribution
  fireEvent.press(view.getByText('Reveal answer'));
  expect(view.getByText('Edited A')).toBeTruthy();
  expect(view.getByText('From: Mechanics Notes')).toBeTruthy();

  fireEvent.press(view.getByLabelText('Easy'));
  fireEvent.press(view.getByText('Reveal answer'));
  fireEvent.press(view.getByLabelText('Easy'));
  await waitFor(() => expect(view.getByText('Session complete')).toBeTruthy());

  fireEvent.press(view.getByText('Test yourself with a quiz'));
  expect(onQuiz).toHaveBeenCalledWith(
    expect.objectContaining({
      deck: expect.objectContaining({id: 'd-study'}),
      source: expect.objectContaining({label: 'Physics'}),
    }),
  );
});

test('SkillsHub displays due flashcard counts and finds matching deck titles in search', async () => {
  writeSkillState<Deck[]>(owner, 'decks', [
    {
      id: 'd-hub',
      title: 'Thermodynamics Deck',
      createdAt: new Date().toISOString(),
      cards: [
        {
          id: 't1',
          question: 'First law?',
          answer: 'Conservation of energy',
          intervalDays: 0,
          ease: 2.5,
          dueAt: 0,
          reviews: 0,
        },
      ],
    },
  ]);
  const onOpenDeck = jest.fn();
  const view = render(
    wrap(
      <SkillsHub
        userId={owner}
        refreshTrigger={0}
        onOpen={jest.fn()}
        onEntity={jest.fn()}
        onOpenDeck={onOpenDeck}
      />,
    ),
  );
  expect(view.getByText('1 due today')).toBeTruthy();
  fireEvent.changeText(
    view.getByLabelText('Search skills, notes, to-dos'),
    'Thermodynamics',
  );
  await waitFor(() =>
    expect(view.getByLabelText('Open deck Thermodynamics Deck')).toBeTruthy(),
  );
  fireEvent.press(view.getByLabelText('Open deck Thermodynamics Deck'));
  expect(onOpenDeck).toHaveBeenCalledWith('d-hub');
});

test('quiz paused state and mistakesSavedAttempt persist across unmount/remount, Practice missed drills mistakes, and 100% hides mistake flashcards', () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  writeSkillState(owner, 'quiz', {
    id: 'q-persist',
    questions: [
      {
        question: 'First persisted Q?',
        options: ['Right 1', 'Wrong 1'],
        correct: 0,
        explanation: 'Exp 1.',
        source: 'Source 1.',
      },
      {
        question: 'Second persisted Q?',
        options: ['Wrong 2', 'Right 2'],
        correct: 1,
        explanation: 'Exp 2.',
        source: 'Source 2.',
      },
    ],
    answers: [],
    index: 0,
    source: {text: 'Source 1. Source 2.', label: 'Biology'},
  });

  const first = render(
    wrap(
      <QuizSkill userId={owner} onFlashcards={jest.fn()} onNote={jest.fn()} />,
    ),
  );
  // Answer Q1 wrongly -> move to Q2 -> Finish later -> unmount
  fireEvent.press(first.getByLabelText('Wrong 1'));
  fireEvent.press(first.getByText('Next question'));
  fireEvent.press(first.getByText('Finish later'));
  expect(first.getByText('Resume quiz')).toBeTruthy();
  first.unmount();

  // Remounting stays paused on Setup and resumes at Q2
  const resumedView = render(
    wrap(
      <QuizSkill userId={owner} onFlashcards={jest.fn()} onNote={jest.fn()} />,
    ),
  );
  expect(resumedView.getByText('Saved quiz in progress')).toBeTruthy();
  fireEvent.press(resumedView.getByText('Resume quiz'));
  expect(resumedView.getByText('Second persisted Q?')).toBeTruthy();

  // Answer Q2 correctly -> See score -> 50% + Review answers breakdown
  fireEvent.press(resumedView.getByLabelText('Right 2'));
  fireEvent.press(resumedView.getByText('See score'));
  expect(resumedView.getAllByText('50%').length).toBeGreaterThanOrEqual(1);
  expect(resumedView.getByText('1 of 2 correct')).toBeTruthy();
  expect(resumedView.getByText('Review answers')).toBeTruthy();
  expect(resumedView.getByText('Your answer: Wrong 1')).toBeTruthy();
  expect(resumedView.getByText('Correct answer: Right 1')).toBeTruthy();

  // Export mistakes -> unmount -> remount keeps Flashcards saved disabled
  fireEvent.press(resumedView.getByText('Make flashcards from mistakes'));
  expect(readSkillState<Deck[]>(owner, 'decks', [])).toHaveLength(1);
  resumedView.unmount();

  const resultsAgain = render(
    wrap(
      <QuizSkill userId={owner} onFlashcards={jest.fn()} onNote={jest.fn()} />,
    ),
  );
  expect(resultsAgain.getByText('Flashcards saved')).toBeTruthy();
  expect(resultsAgain.getByText('Open Flashcards')).toBeTruthy();
  fireEvent.press(resultsAgain.getByText('Flashcards saved'));
  expect(readSkillState<Deck[]>(owner, 'decks', [])).toHaveLength(1);

  // Practice missed (1) drills only the missed question and hides mistake flashcards at 100%
  fireEvent.press(resultsAgain.getByText('Practice missed (1)'));
  expect(resultsAgain.getByText('First persisted Q?')).toBeTruthy();
  expect(resultsAgain.queryByText('Second persisted Q?')).toBeNull();
  fireEvent.press(resultsAgain.getByLabelText('Right 1'));
  fireEvent.press(resultsAgain.getByText('See score'));
  expect(resultsAgain.getByText('100%')).toBeTruthy();
  expect(resultsAgain.getByText('Perfect score!')).toBeTruthy();
  expect(resultsAgain.queryByText('Make flashcards from mistakes')).toBeNull();

  // Retake resets attempt & allows saving mistakes on the new attempt
  fireEvent.press(resultsAgain.getByText('Retake'));
  fireEvent.press(resultsAgain.getByLabelText('Wrong 1'));
  fireEvent.press(resultsAgain.getByText('See score'));
  expect(resultsAgain.getByText('Make flashcards from mistakes')).toBeTruthy();
});

test('quiz supports Previous question inspection and Exam mode deferred feedback', () => {
  writeSkillState(owner, 'quiz', {
    id: 'q-exam',
    title: 'Cloud Exam',
    questions: [
      {
        question: 'Exam Q1?',
        options: ['IaaS', 'SaaS'],
        correct: 0,
        explanation: 'Exp 1.',
        source: 'Src 1.',
      },
      {
        question: 'Exam Q2?',
        options: ['True', 'False'],
        correct: 1,
        explanation: 'Exp 2.',
        source: 'Src 2.',
      },
    ],
    answers: [],
    index: 0,
    mode: 'exam',
    paused: false,
    source: {label: 'Cloud'},
  });

  const view = render(
    wrap(
      <QuizSkill userId={owner} onFlashcards={jest.fn()} onNote={jest.fn()} />,
    ),
  );
  expect(view.getByText('· Exam mode')).toBeTruthy();
  fireEvent.press(view.getByLabelText('SaaS'));
  expect(view.queryByText('Correct')).toBeNull();
  expect(view.queryByText('Not quite')).toBeNull();
  fireEvent.press(view.getByText('Next question'));

  // Inspect Q1 via Previous question button and jump back to Q2
  expect(view.getByText('Exam Q2?')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Previous question'));
  expect(view.getByText('Exam Q1?')).toBeTruthy();
  fireEvent.press(view.getByText('Jump to current (Q2)'));
  expect(view.getByText('Exam Q2?')).toBeTruthy();

  // Finish exam -> reveals score and review breakdown
  fireEvent.press(view.getByLabelText('False'));
  fireEvent.press(view.getByText('Submit quiz'));
  expect(view.getAllByText('50%').length).toBeGreaterThanOrEqual(1);
  expect(view.getByText('1 of 2 correct')).toBeTruthy();
  expect(view.getByText('Review answers')).toBeTruthy();
  expect(view.getByText('Your answer: SaaS')).toBeTruthy();
});

test('SkillsScreen returns directly to Quiz after opening a source note', async () => {
  notesStore.insert({
    id: 'note-quiz-src',
    userId: owner,
    title: 'Cytology Notes',
    body: 'Mitochondria produce ATP.',
    category: 'Learning',
    isPinned: false,
    tags: [],
    isVoiceTranscribed: false,
  });
  writeSkillState(owner, 'quiz', {
    id: 'q-note-back',
    questions: [
      {
        question: 'What produces ATP?',
        options: ['Mitochondria', 'Golgi'],
        correct: 0,
        explanation: 'From Cytology Notes.',
        source: 'Mitochondria produce ATP',
        sourceNoteId: 'note-quiz-src',
        sourceLabel: 'Cytology Notes',
      },
    ],
    answers: [0],
    index: 0,
    source: {label: 'Cytology Notes', noteId: 'note-quiz-src'},
  });

  const view = render(
    wrap(
      <SkillsScreen userId={owner} refreshTrigger={0} onRefresh={jest.fn()} />,
    ),
  );
  fireEvent.press(view.getByLabelText('Open Quiz maker'));
  await waitFor(() =>
    expect(view.getByText('What produces ATP?')).toBeTruthy(),
  );
  fireEvent.press(view.getByLabelText('Open source note'));
  await waitFor(() => expect(view.getByText('Cytology Notes')).toBeTruthy());
  fireEvent.press(view.getByLabelText('Back to Skills'));
  await waitFor(() =>
    expect(view.getByText('What produces ATP?')).toBeTruthy(),
  );
});

test('QuizSkill supports instant offline quizzes via initialHandoff and initialSource', () => {
  const deck: Deck = {
    id: 'd-offline',
    title: 'Chem Symbols',
    createdAt: '2026-11-20T00:00:00.000Z',
    cards: [
      {
        id: 'c1',
        question: 'Symbol for Gold?',
        answer: 'Au',
        intervalDays: 0,
        ease: 2.5,
        dueAt: 0,
        reviews: 0,
      },
      {
        id: 'c2',
        question: 'Symbol for Silver?',
        answer: 'Ag',
        intervalDays: 0,
        ease: 2.5,
        dueAt: 0,
        reviews: 0,
      },
    ],
  };

  const handoffView = render(
    wrap(
      <QuizSkill
        userId={owner}
        onFlashcards={jest.fn()}
        onNote={jest.fn()}
        initialHandoff={{nonce: 'n-1', deck}}
        onHandoffConsumed={jest.fn()}
      />,
    ),
  );
  expect(handoffView.getByText('Question 1 of 2')).toBeTruthy();
  handoffView.unmount();

  writeSkillState(owner, 'quiz', null);
  const prefillView = render(
    wrap(
      <QuizSkill
        userId={owner}
        onFlashcards={jest.fn()}
        onNote={jest.fn()}
        initialSource={buildQuizSourceFromDeck(deck)}
        onInitialSourceConsumed={jest.fn()}
      />,
    ),
  );
  expect(prefillView.getByText('Start instant offline quiz')).toBeTruthy();
  fireEvent.press(prefillView.getByText('Start instant offline quiz'));
  expect(prefillView.getByText('Question 1 of 2')).toBeTruthy();
});

test('SourcePicker auto-loads notes, truncates oversized single notes, and highlights library items by materialId', () => {
  notesStore.insert({
    id: 'note-long',
    userId: owner,
    title: 'Oversized Lecture',
    body: 'A'.repeat(12500),
    category: 'Learning',
    isPinned: false,
    tags: [],
    isVoiceTranscribed: false,
  });

  const mat1 = materialStore.saveMaterialWithChunks(
    owner,
    {
      title: 'Duplicate Lesson Title',
      fileName: 'lesson1.txt',
      fileKind: 'txt',
      mimeType: 'text/plain',
      sizeBytes: 120,
      sha256: 'hash-1',
      pageCount: 1,
      pagesRead: 1,
      ocrPages: 0,
      totalChars: 40,
      outline: [],
      updatedAt: '2026-11-22T00:00:02.000Z',
    },
    [
      {
        seq: 1,
        heading: 'Intro',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'p. 1',
        keywords: 'one',
        content: 'First material unique content.',
      },
    ],
  );
  materialStore.saveMaterialWithChunks(
    owner,
    {
      title: 'Duplicate Lesson Title',
      fileName: 'lesson2.txt',
      fileKind: 'txt',
      mimeType: 'text/plain',
      sizeBytes: 120,
      sha256: 'hash-2',
      pageCount: 1,
      pagesRead: 1,
      ocrPages: 0,
      totalChars: 40,
      outline: [],
      updatedAt: '2026-11-22T00:00:01.000Z',
    },
    [
      {
        seq: 1,
        heading: 'Intro',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'p. 1',
        keywords: 'two',
        content: 'Second material unique content.',
      },
    ],
  );

  let latest: SkillSource = {text: '', label: ''};
  const onChange = jest.fn((next: SkillSource) => {
    latest = next;
  });

  const view = render(
    wrap(<SourcePicker userId={owner} source={latest} onChange={onChange} />),
  );
  // Notes are auto-loaded on mount without pressing a button
  expect(view.getByText('Oversized Lecture')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Oversized Lecture'));
  expect(latest.text.length).toBe(12000);
  expect(
    view.getByText('Using the first 12,000 characters from this note.'),
  ).toBeTruthy();

  // Switch to Library and verify selection highlights by materialId
  fireEvent.press(view.getByLabelText('From library'));
  const cards = view.getAllByLabelText('Select lesson Duplicate Lesson Title');
  expect(cards).toHaveLength(2);
  fireEvent.press(cards[0]);
  expect(latest.materialId).toBe(mat1.id);
  expect(latest.kind).toBe('library');

  view.rerender(
    wrap(<SourcePicker userId={owner} source={latest} onChange={onChange} />),
  );
  const rerenderedCards = view.getAllByLabelText(
    'Select lesson Duplicate Lesson Title',
  );
  const hasBorderWidth = (
    node: (typeof rerenderedCards)[number],
    expected: number,
  ) =>
    node.findAll(
      child =>
        Array.isArray(child.props?.style) &&
        child.props.style.some((s: unknown) =>
          Boolean(
            s &&
              typeof s === 'object' &&
              'borderWidth' in s &&
              (s as {borderWidth?: number}).borderWidth === expected,
          ),
        ),
    ).length > 0;
  expect(hasBorderWidth(rerenderedCards[0], 2)).toBe(true);
  expect(hasBorderWidth(rerenderedCards[1], 1)).toBe(true);
});

test('Quiz Maker says so when LAFINA writes fewer questions than asked for', async () => {
  const studyAi = require('../../src/skills/studyAi');
  const genSpy = jest.spyOn(studyAi, 'quizFromSource').mockResolvedValue([
    {
      question: 'What do mitochondria produce?',
      options: ['ATP', 'DNA', 'Glucose', 'Oxygen'],
      correct: 0,
      explanation: 'Mitochondria make ATP.',
      source: 'Mitochondria produce ATP',
    },
  ]);
  const view = render(
    wrap(
      <QuizSkill userId={owner} onFlashcards={jest.fn()} onNote={jest.fn()} />,
    ),
  );
  fireEvent.press(view.getByText('Paste text'));
  fireEvent.changeText(
    view.getByLabelText('Text to work with'),
    'Mitochondria produce ATP through cellular respiration in eukaryotic cells.',
  );
  await act(async () => {
    fireEvent.press(view.getByLabelText('Make quiz'));
  });
  await waitFor(() =>
    expect(view.getByText('What do mitochondria produce?')).toBeTruthy(),
  );
  expect(genSpy).toHaveBeenCalledWith(
    owner,
    expect.any(String),
    10,
    'Multiple choice',
    expect.objectContaining({signal: expect.anything()}),
  );
  expect(view.getByTestId('quiz-shortfall-notice')).toBeTruthy();
  expect(view.getByText(/could write 1 of the 10 questions/)).toBeTruthy();
  const saved = readSkillState<{requestedCount?: number}>(owner, 'quiz', {});
  expect(saved.requestedCount).toBe(10);
});

test('All skills screen renders categorized skill cards with descriptions and opens selected skill', async () => {
  const view = render(
    wrap(
      <SkillsScreen userId={owner} refreshTrigger={0} onRefresh={jest.fn()} />,
    ),
  );
  fireEvent.press(view.getByLabelText('All skills'));
  await waitFor(() =>
    expect(view.getByTestId('all-skills-view')).toBeTruthy(),
  );
  expect(view.getByText('STUDY & REVIEW')).toBeTruthy();
  expect(view.getByText('FOCUS & TOOLS')).toBeTruthy();
  expect(view.getByText('AI CREATION')).toBeTruthy();
  expect(view.getByTestId('all-skills-item-materials')).toBeTruthy();
  expect(view.getByTestId('all-skills-item-pomodoro')).toBeTruthy();
  expect(view.getByTestId('all-skills-item-flashcards')).toBeTruthy();
  expect(view.getByTestId('all-skills-item-quiz')).toBeTruthy();
  expect(view.getByTestId('all-skills-item-gwa')).toBeTruthy();
  expect(view.getByTestId('all-skills-item-summarizer')).toBeTruthy();
  expect(view.getByTestId('all-skills-item-meetings')).toBeTruthy();
  expect(view.getByTestId('all-skills-item-docgen')).toBeTruthy();
  expect(view.getByText('Slides, docs, PDF & sheets')).toBeTruthy();

  fireEvent.press(view.getByTestId('all-skills-item-gwa'));
  await waitFor(() =>
    expect(view.queryByTestId('all-skills-view')).toBeNull(),
  );
  expect(view.getByText('GWA calculator')).toBeTruthy();
});
