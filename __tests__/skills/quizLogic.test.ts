import {
  attributeQuestionsToNotes,
  buildOfflineQuizFromDeck,
  countAnswered,
  deleteQuizFromHistory,
  discardActiveQuiz,
  formatMistakeDeckTitle,
  MAX_SAVED_QUIZZES,
  normalizeQuizSession,
  parseDeckFromQuizSource,
  quizShortfall,
  readQuizStore,
  saveActiveQuiz,
  scoreQuiz,
  shuffleQuestionOptions,
  shuffleQuizForRetake,
  stripQuizSourceForStorage,
} from '../../src/skills/quizLogic';
import type {QuizSession} from '../../src/skills/quizLogic';
import {readSkillState, writeSkillState} from '../../src/skills/skillsState';
import {buildQuizSourceFromDeck} from '../../src/skills/studyDecks';
import type {Deck} from '../../src/skills/studyLogic';
import type {QuizQuestion} from '../../src/skills/studyAi';
import {db, initDatabase, userStore} from '../../src/storage';

let owner: string;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  for (const table of ['active_session', 'local_settings']) {
    db.executeSync(`DELETE FROM ${table}`);
  }
  owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
});

const makeQuestion = (
  idx: number,
  extra?: Partial<QuizQuestion>,
): QuizQuestion => ({
  question: `Question ${idx}?`,
  options: [
    `Right ${idx}`,
    `Wrong A ${idx}`,
    `Wrong B ${idx}`,
    `Wrong C ${idx}`,
  ],
  correct: 0,
  explanation: `Explanation ${idx}.`,
  source: `Supporting quote ${idx} from the note.`,
  ...extra,
});

const makeSession = (
  id: string,
  overrides?: Partial<QuizSession>,
): QuizSession => ({
  id,
  title: `Quiz ${id}`,
  questions: [makeQuestion(1), makeQuestion(2)],
  answers: [],
  index: 0,
  mode: 'practice',
  paused: false,
  source: {label: `Source ${id}`},
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
  attempt: 1,
  bestScorePct: null,
  lastScorePct: null,
  mistakesSavedAttempt: null,
  ...overrides,
});

describe('quizLogic', () => {
  test('normalizeQuizSession migrates legacy quizzes and stripQuizSourceForStorage drops bloated text', () => {
    expect(normalizeQuizSession(null)).toBeNull();
    expect(normalizeQuizSession({id: 'bad'})).toBeNull();

    const migrated = normalizeQuizSession({
      id: 'legacy-1',
      questions: [makeQuestion(1)],
      answers: [0, null],
      index: 1,
      source: {
        label: 'Lecture 4',
        noteId: 'n-4',
        text: 'A'.repeat(12000),
        notes: [{id: 'n-4', title: 'Lecture 4', text: 'A'.repeat(12000)}],
      },
    });
    expect(migrated).not.toBeNull();
    expect(migrated).toMatchObject({
      id: 'legacy-1',
      title: 'Lecture 4',
      mode: 'practice',
      paused: false,
      attempt: 1,
      bestScorePct: null,
      lastScorePct: null,
      mistakesSavedAttempt: null,
      source: {label: 'Lecture 4', noteId: 'n-4'},
    });
    expect(migrated?.answers).toEqual([0]);

    const bloated = makeSession('s-bloat', {
      source: {
        label: 'Bio',
        noteId: 'n1',
        materialId: 'm1',
        text: 'Giant source text',
        notes: [{id: 'n1', title: 'Bio', text: 'Giant source text'}],
      },
    });
    const stripped = stripQuizSourceForStorage(bloated);
    expect(stripped.source).toEqual({
      label: 'Bio',
      noteId: 'n1',
      materialId: 'm1',
    });
  });

  test('readQuizStore, saveActiveQuiz, discardActiveQuiz, and deleteQuizFromHistory manage history and 12-item cap', () => {
    writeSkillState(owner, 'quiz', {
      id: 'legacy-active',
      questions: [makeQuestion(1)],
      answers: [],
      index: 0,
      source: {label: 'Legacy Note'},
    });
    const initial = readQuizStore(owner);
    expect(initial.active?.id).toBe('legacy-active');
    expect(initial.history).toHaveLength(1);

    let state = initial;
    for (let i = 1; i <= MAX_SAVED_QUIZZES + 3; i += 1) {
      state = saveActiveQuiz(
        owner,
        makeSession(`q-${i}`, {
          source: {label: `Note ${i}`, text: 'Huge raw text'},
        }),
        state.history,
      );
    }
    expect(state.history).toHaveLength(MAX_SAVED_QUIZZES);
    expect(state.history[0].id).toBe(`q-${MAX_SAVED_QUIZZES + 3}`);
    expect(state.history[0].source.text).toBeUndefined();

    // Unfinished active quiz is removed completely when discarded
    const afterDiscardUnfinished = discardActiveQuiz(
      owner,
      state.active,
      state.history,
    );
    expect(afterDiscardUnfinished.active).toBeNull();
    expect(
      afterDiscardUnfinished.history.some(q => q.id === state.active?.id),
    ).toBe(false);

    // Previously completed quiz being retaken stays in history with completed index when retake is discarded
    const retakingCompleted = makeSession('q-completed', {
      index: 0,
      paused: true,
      lastScorePct: 100,
      bestScorePct: 100,
    });
    const savedRetake = saveActiveQuiz(
      owner,
      retakingCompleted,
      afterDiscardUnfinished.history,
    );
    const afterDiscardRetake = discardActiveQuiz(
      owner,
      savedRetake.active,
      savedRetake.history,
    );
    const restored = afterDiscardRetake.history.find(
      q => q.id === 'q-completed',
    );
    expect(restored).toMatchObject({
      paused: false,
      index: 2,
      lastScorePct: 100,
    });

    // Deleting a quiz removes it from history and clears active if matching
    const activeTarget = makeSession('q-del-active');
    const withActive = saveActiveQuiz(
      owner,
      activeTarget,
      afterDiscardRetake.history,
    );
    const afterDelete = deleteQuizFromHistory(
      owner,
      'q-del-active',
      withActive.active,
      withActive.history,
    );
    expect(afterDelete.active).toBeNull();
    expect(afterDelete.history.some(q => q.id === 'q-del-active')).toBe(false);
    expect(readSkillState(owner, 'quiz', null)).toBeNull();
  });

  test('shuffleQuestionOptions preserves correct answer mapping and keeps True/False untouched', () => {
    const tf: QuizQuestion = {
      question: 'Earth orbits the Sun.',
      options: ['True', 'False'],
      correct: 0,
      explanation: 'Basic astronomy.',
      source: 'Earth orbits the Sun.',
    };
    expect(shuffleQuestionOptions(tf, () => 0.1).options).toEqual([
      'True',
      'False',
    ]);

    const mc = makeQuestion(1);
    const shuffled = shuffleQuestionOptions(mc, () => 0.25);
    expect(shuffled.options).toHaveLength(4);
    expect(shuffled.options.slice().sort()).toEqual(mc.options.slice().sort());
    expect(shuffled.options[shuffled.correct]).toBe(mc.options[mc.correct]);

    const retake = shuffleQuizForRetake(
      [makeQuestion(1), makeQuestion(2), makeQuestion(3)],
      () => 0.2,
    );
    expect(retake).toHaveLength(3);
    for (const q of retake) {
      expect(q.options[q.correct]).toMatch(/^Right \d$/);
    }
  });

  test('attributeQuestionsToNotes matches Markdown, smart punctuation, and elided quotes across notes', () => {
    const notes = [
      {
        id: 'n1',
        title: 'Fluid Dynamics',
        text: 'In **physics**, “energy stays conserved” — even under heavy load.',
      },
      {
        id: 'n2',
        title: 'Cellular Biology',
        text: 'Mitochondria convert nutrients into usable ATP molecules for cellular energy.',
      },
    ];
    const questions = [
      makeQuestion(1, {
        source: 'energy stays conserved - even under heavy load',
      }),
      makeQuestion(2, {
        source: 'Mitochondria convert nutrients ... usable ATP molecules',
      }),
      makeQuestion(3, {
        source: 'Fluid Dynamics In physics',
      }),
    ];
    const attributed = attributeQuestionsToNotes(questions, notes);
    expect(attributed[0]).toMatchObject({
      sourceNoteId: 'n1',
      sourceLabel: 'Fluid Dynamics',
    });
    expect(attributed[1]).toMatchObject({
      sourceNoteId: 'n2',
      sourceLabel: 'Cellular Biology',
    });
    expect(attributed[2]).toMatchObject({
      sourceNoteId: 'n1',
      sourceLabel: 'Fluid Dynamics',
    });
  });

  test('countAnswered and scoreQuiz tolerate sparse and null entries', () => {
    const s = makeSession('s-sparse', {
      questions: [makeQuestion(1), makeQuestion(2), makeQuestion(3)],
      answers: [0, null, 2],
    });
    expect(countAnswered(s.answers, 3)).toBe(2);
    const result = scoreQuiz(s);
    expect(result).toMatchObject({
      correct: 1,
      answered: 2,
      total: 3,
      pct: 33,
    });
    expect(result.mistakes.map(m => m.index)).toEqual([1, 2]);
  });

  test('parseDeckFromQuizSource round-trips buildQuizSourceFromDeck and buildOfflineQuizFromDeck creates valid MC questions', () => {
    const deck: Deck = {
      id: 'd-bio',
      title: 'Cell Organelles',
      createdAt: '2026-11-20T00:00:00.000Z',
      cards: [
        {
          id: 'c1',
          question: 'Powerhouse of the cell?',
          answer: 'Mitochondria',
          sourceNoteId: 'note-cell',
          intervalDays: 0,
          ease: 2.5,
          dueAt: 0,
          reviews: 0,
        },
        {
          id: 'c2',
          question: 'Synthesizes proteins?',
          answer: 'Ribosome',
          sourceNoteId: 'note-cell',
          intervalDays: 0,
          ease: 2.5,
          dueAt: 0,
          reviews: 0,
        },
        {
          id: 'c3',
          question: 'Contains genetic DNA?',
          answer: 'Nucleus',
          sourceNoteId: 'note-cell',
          intervalDays: 0,
          ease: 2.5,
          dueAt: 0,
          reviews: 0,
        },
        {
          id: 'c4',
          question: 'Packages proteins?',
          answer: 'Golgi apparatus',
          sourceNoteId: 'note-cell',
          intervalDays: 0,
          ease: 2.5,
          dueAt: 0,
          reviews: 0,
        },
      ],
    };

    const handoffSource = buildQuizSourceFromDeck(deck);
    const parsed = parseDeckFromQuizSource(handoffSource);
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe('Cell Organelles');
    expect(parsed?.cards).toHaveLength(4);
    expect(parsed?.cards[0].sourceNoteId).toBe('note-cell');

    const quiz = buildOfflineQuizFromDeck(parsed!, 10, () => 0.3);
    expect(quiz).not.toBeNull();
    expect(quiz?.questions).toHaveLength(4);
    expect(quiz?.source.noteId).toBe('note-cell');
    for (const q of quiz?.questions ?? []) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.correct]).toBeTruthy();
    }

    expect(
      parseDeckFromQuizSource({text: 'Just a regular paragraph.'}),
    ).toBeNull();
    expect(
      buildOfflineQuizFromDeck({
        ...deck,
        cards: [
          {...deck.cards[0], answer: 'Same'},
          {...deck.cards[1], answer: 'Same'},
        ],
      }),
    ).toBeNull();
  });

  test('formatMistakeDeckTitle formats single, multi-note, and overly long titles cleanly', () => {
    expect(formatMistakeDeckTitle('')).toBe('Quiz mistakes · Review');
    expect(formatMistakeDeckTitle('Lecture 4')).toBe(
      'Quiz mistakes · Lecture 4',
    );
    expect(formatMistakeDeckTitle('Lecture 4, Lecture 5, Lecture 6')).toBe(
      'Quiz mistakes · Lecture 4 + 2 more',
    );
    const veryLong = formatMistakeDeckTitle(
      'Very Long Course Title Covering Distributed Cloud Architecture Systems',
    );
    expect(veryLong.length).toBeLessThanOrEqual(52);
    expect(veryLong.endsWith('…')).toBe(true);
  });
});

describe('quiz audit fixes (2026-11-22)', () => {
  const twoCardDeck = (): Deck => ({
    id: 'two',
    title: 'Bio',
    createdAt: '2026-11-22T00:00:00.000Z',
    cards: [
      {
        id: 'a',
        question: 'Powerhouse of the cell?',
        answer: 'Mitochondria',
        intervalDays: 0,
        ease: 2.5,
        dueAt: 0,
        reviews: 0,
      },
      {
        id: 'b',
        question: 'Site of photosynthesis?',
        answer: 'Chloroplast',
        intervalDays: 0,
        ease: 2.5,
        dueAt: 0,
        reviews: 0,
      },
    ],
  });

  test('a two-answer deck quiz does not always put the right answer first', () => {
    const positions = new Set<number>();
    for (let run = 0; run < 40; run += 1) {
      const quiz = buildOfflineQuizFromDeck(twoCardDeck());
      for (const q of quiz!.questions) {
        expect(q.options).toHaveLength(2);
        // The correct index still points at the card's own answer.
        const card = twoCardDeck().cards.find(c => c.question === q.question);
        expect(q.options[q.correct]).toBe(card!.answer);
        positions.add(q.correct);
      }
    }
    expect(Array.from(positions).sort()).toEqual([0, 1]);
  });

  test('both positions are produced deterministically by the random source', () => {
    const first = buildOfflineQuizFromDeck(twoCardDeck(), 20, () => 0.1);
    const second = buildOfflineQuizFromDeck(twoCardDeck(), 20, () => 0.9);
    expect(first!.questions.every(q => q.correct === 0)).toBe(true);
    expect(second!.questions.every(q => q.correct === 1)).toBe(true);
  });

  test('a quiz shorter than asked keeps the requested count; a complete one does not', () => {
    const base = {
      id: 'quiz-short',
      title: 'Short',
      questions: [
        {
          question: 'Q1?',
          options: ['True', 'False'],
          correct: 0,
          explanation: 'E',
          source: 'S',
        },
      ],
      answers: [],
      index: 0,
    };
    const short = normalizeQuizSession({...base, requestedCount: 10});
    expect(short?.requestedCount).toBe(10);
    expect(quizShortfall(short!)).toEqual({written: 1, requested: 10});
    // A stored count that is not larger than the quiz is dropped.
    const full = normalizeQuizSession({...base, requestedCount: 1});
    expect(full?.requestedCount).toBeUndefined();
    expect(quizShortfall(full!)).toBeNull();
  });
});
