import {readSkillState, writeSkillState} from './skillsState';
import {verifyQuoteAgainstSource} from './studyAi';
import type {QuizQuestion} from './studyAi';
import type {Deck} from './studyLogic';
import {generateId} from '../utils';

export type QuizMode = 'practice' | 'exam';
export type QuizQuestionType = 'Multiple choice' | 'True / False' | 'Mixed';

export interface QuizSourceMeta {
  label: string;
  noteId?: string;
  materialId?: string;
  text?: string;
  notes?: Array<{id: string; title: string; text: string}>;
}

export interface QuizSession {
  id: string;
  title: string;
  questions: QuizQuestion[];
  answers: Array<number | null>;
  index: number;
  mode: QuizMode;
  paused: boolean;
  source: QuizSourceMeta;
  createdAt: string;
  updatedAt: string;
  attempt: number;
  bestScorePct: number | null;
  lastScorePct: number | null;
  mistakesSavedAttempt: number | null;
  isMissedDrill?: boolean;
  parentQuizId?: string;
  /** How many questions the student asked for, when LAFINA wrote fewer. */
  requestedCount?: number;
}

export interface QuizMistake {
  index: number;
  question: QuizQuestion;
  picked: number | null;
}

export const MAX_SAVED_QUIZZES = 12;

function sanitizeQuestion(raw: unknown): QuizQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  if (
    typeof q.question !== 'string' ||
    !Array.isArray(q.options) ||
    q.options.some(o => typeof o !== 'string') ||
    typeof q.correct !== 'number' ||
    !Number.isInteger(q.correct) ||
    typeof q.explanation !== 'string' ||
    typeof q.source !== 'string'
  ) {
    return null;
  }
  return {
    question: q.question,
    options: [...(q.options as string[])],
    correct: q.correct,
    explanation: q.explanation,
    source: q.source,
    ...(typeof q.sourceNoteId === 'string' && q.sourceNoteId
      ? {sourceNoteId: q.sourceNoteId}
      : {}),
    ...(typeof q.sourceLabel === 'string' && q.sourceLabel
      ? {sourceLabel: q.sourceLabel}
      : {}),
  };
}

export function normalizeQuizSession(raw: unknown): QuizSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id || !Array.isArray(obj.questions)) {
    return null;
  }
  const questions = obj.questions
    .map(sanitizeQuestion)
    .filter((q): q is QuizQuestion => q !== null);
  const rawAnswers = Array.isArray(obj.answers) ? obj.answers : [];
  const answers: Array<number | null> = rawAnswers
    .slice(0, questions.length)
    .map(a =>
      typeof a === 'number' && Number.isInteger(a) && a >= 0 ? a : null,
    );
  const index =
    typeof obj.index === 'number' &&
    Number.isInteger(obj.index) &&
    obj.index >= 0
      ? Math.min(obj.index, questions.length)
      : 0;
  const rawSource =
    obj.source && typeof obj.source === 'object'
      ? (obj.source as Record<string, unknown>)
      : {};
  const label =
    typeof rawSource.label === 'string' && rawSource.label.trim()
      ? rawSource.label.trim()
      : 'Quiz';
  const source: QuizSourceMeta = {
    label,
    ...(typeof rawSource.noteId === 'string' && rawSource.noteId
      ? {noteId: rawSource.noteId}
      : {}),
    ...(typeof rawSource.materialId === 'string' && rawSource.materialId
      ? {materialId: rawSource.materialId}
      : {}),
  };
  const nowIso = new Date().toISOString();
  const createdAt =
    typeof obj.createdAt === 'string' && obj.createdAt ? obj.createdAt : nowIso;
  const updatedAt =
    typeof obj.updatedAt === 'string' && obj.updatedAt
      ? obj.updatedAt
      : createdAt;
  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? obj.title.trim()
      : label || 'Quiz';

  return {
    id: obj.id,
    title,
    questions,
    answers,
    index,
    mode: obj.mode === 'exam' ? 'exam' : 'practice',
    paused: Boolean(obj.paused),
    source,
    createdAt,
    updatedAt,
    attempt:
      typeof obj.attempt === 'number' &&
      Number.isInteger(obj.attempt) &&
      obj.attempt >= 1
        ? obj.attempt
        : 1,
    bestScorePct:
      typeof obj.bestScorePct === 'number' && Number.isFinite(obj.bestScorePct)
        ? obj.bestScorePct
        : null,
    lastScorePct:
      typeof obj.lastScorePct === 'number' && Number.isFinite(obj.lastScorePct)
        ? obj.lastScorePct
        : null,
    mistakesSavedAttempt:
      typeof obj.mistakesSavedAttempt === 'number' &&
      Number.isInteger(obj.mistakesSavedAttempt)
        ? obj.mistakesSavedAttempt
        : null,
    ...(obj.isMissedDrill === true ? {isMissedDrill: true} : {}),
    ...(typeof obj.parentQuizId === 'string' && obj.parentQuizId
      ? {parentQuizId: obj.parentQuizId}
      : {}),
    ...(typeof obj.requestedCount === 'number' &&
    Number.isInteger(obj.requestedCount) &&
    obj.requestedCount > questions.length
      ? {requestedCount: obj.requestedCount}
      : {}),
  };
}

/** The shortfall to tell the student about, or null when the quiz is complete. */
export function quizShortfall(
  session: Pick<QuizSession, 'questions' | 'requestedCount'>,
): {written: number; requested: number} | null {
  const written = session.questions.length;
  return session.requestedCount && session.requestedCount > written
    ? {written, requested: session.requestedCount}
    : null;
}

export function stripQuizSourceForStorage(session: QuizSession): QuizSession {
  return {
    ...session,
    source: {
      label: session.source.label,
      ...(session.source.noteId ? {noteId: session.source.noteId} : {}),
      ...(session.source.materialId
        ? {materialId: session.source.materialId}
        : {}),
    },
  };
}

export function shuffleQuestionOptions(
  q: QuizQuestion,
  rng: () => number = Math.random,
): QuizQuestion {
  if (q.options.length <= 2) {
    return {...q, options: [...q.options]};
  }
  const indexed = q.options.map((text, idx) => ({
    text,
    isCorrect: idx === q.correct,
  }));
  for (let i = indexed.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }
  return {
    ...q,
    options: indexed.map(item => item.text),
    correct: Math.max(
      0,
      indexed.findIndex(item => item.isCorrect),
    ),
  };
}

export function shuffleQuizForRetake(
  questions: readonly QuizQuestion[],
  rng: () => number = Math.random,
): QuizQuestion[] {
  const copy = questions.map(q => shuffleQuestionOptions(q, rng));
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function attributeQuestionsToNotes(
  questions: readonly QuizQuestion[],
  notes?: ReadonlyArray<{id: string; title: string; text: string}>,
): QuizQuestion[] {
  if (!notes?.length) return [...questions];
  return questions.map(q => {
    const note =
      notes.find(n => verifyQuoteAgainstSource(n.text, q.source)) ??
      notes.find(n =>
        verifyQuoteAgainstSource(`## ${n.title}\n${n.text}`, q.source),
      );
    return note ? {...q, sourceNoteId: note.id, sourceLabel: note.title} : q;
  });
}

export function countAnswered(
  answers: ReadonlyArray<number | null | undefined>,
  total: number,
): number {
  let n = 0;
  for (let i = 0; i < total; i += 1) {
    const val = answers[i];
    if (typeof val === 'number' && Number.isInteger(val) && val >= 0) {
      n += 1;
    }
  }
  return n;
}

export function scoreQuiz(session: QuizSession): {
  correct: number;
  answered: number;
  total: number;
  pct: number;
  mistakes: QuizMistake[];
} {
  const total = session.questions.length;
  let correct = 0;
  let answered = 0;
  const mistakes: QuizMistake[] = [];
  for (let i = 0; i < total; i += 1) {
    const question = session.questions[i];
    const rawPicked = session.answers[i];
    const picked =
      typeof rawPicked === 'number' &&
      Number.isInteger(rawPicked) &&
      rawPicked >= 0
        ? rawPicked
        : null;
    if (picked !== null) answered += 1;
    if (picked === question.correct) {
      correct += 1;
    } else {
      mistakes.push({index: i, question, picked});
    }
  }
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return {correct, answered, total, pct, mistakes};
}

export function formatMistakeDeckTitle(label: string): string {
  const clean = label.trim();
  if (!clean) return 'Quiz mistakes · Review';
  const parts = clean
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  const prefix = 'Quiz mistakes · ';
  const maxLen = 52;
  if (parts.length > 1) {
    const first = parts[0];
    const suffix = ` + ${parts.length - 1} more`;
    const budget = Math.max(12, maxLen - prefix.length - suffix.length);
    const head =
      first.length > budget
        ? `${first.slice(0, budget - 1).trimEnd()}…`
        : first;
    return `${prefix}${head}${suffix}`;
  }
  const budget = maxLen - prefix.length;
  const body =
    clean.length > budget ? `${clean.slice(0, budget - 1).trimEnd()}…` : clean;
  return `${prefix}${body}`;
}

export function buildOfflineQuizFromDeck(
  deck: Deck,
  maxQuestions = 20,
  rng: () => number = Math.random,
): QuizSession | null {
  const seenQuestions = new Set<string>();
  const validCards = deck.cards.filter(card => {
    const q = card.question.trim();
    const a = card.answer.trim();
    if (!q || !a) return false;
    const key = q.toLowerCase().replace(/\s+/g, ' ');
    if (seenQuestions.has(key)) return false;
    seenQuestions.add(key);
    return true;
  });

  const distinctAnswers: string[] = [];
  const seenAnswers = new Set<string>();
  for (const card of validCards) {
    const a = card.answer.trim();
    const key = a.toLowerCase().replace(/\s+/g, ' ');
    if (!seenAnswers.has(key)) {
      seenAnswers.add(key);
      distinctAnswers.push(a);
    }
  }
  if (distinctAnswers.length < 2) return null;

  const pickedCards = [...validCards];
  for (let i = pickedCards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pickedCards[i], pickedCards[j]] = [pickedCards[j], pickedCards[i]];
  }
  const selected = pickedCards.slice(0, Math.max(1, maxQuestions));

  const questions: QuizQuestion[] = selected.map(card => {
    const answerText = card.answer.trim();
    const answerKey = answerText.toLowerCase().replace(/\s+/g, ' ');
    const distractorPool = distinctAnswers.filter(
      opt => opt.toLowerCase().replace(/\s+/g, ' ') !== answerKey,
    );
    for (let i = distractorPool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [distractorPool[i], distractorPool[j]] = [
        distractorPool[j],
        distractorPool[i],
      ];
    }
    const distractors = distractorPool.slice(0, 3);
    const rawQuestion: QuizQuestion = {
      question: card.question.trim(),
      options: [answerText, ...distractors],
      correct: 0,
      explanation: `From flashcard deck: ${deck.title}`,
      source: answerText,
      sourceLabel: deck.title,
      ...(card.sourceNoteId ? {sourceNoteId: card.sourceNoteId} : {}),
    };
    // shuffleQuestionOptions keeps two-option questions in order (so True /
    // False stays readable), but here the answer is always written first:
    // place it at random so a two-answer deck is not always "A".
    if (rawQuestion.options.length === 2) {
      return rng() < 0.5
        ? rawQuestion
        : {
            ...rawQuestion,
            options: [rawQuestion.options[1], rawQuestion.options[0]],
            correct: 1,
          };
    }
    return shuffleQuestionOptions(rawQuestion, rng);
  });

  const noteIds = Array.from(
    new Set(
      validCards
        .map(c => c.sourceNoteId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const now = new Date().toISOString();
  return {
    id: generateId('quiz'),
    title: deck.title.trim() || 'Flashcard quiz',
    questions,
    answers: [],
    index: 0,
    mode: 'practice',
    paused: false,
    source: {
      label: deck.title.trim() || 'Flashcards',
      ...(noteIds.length === 1 ? {noteId: noteIds[0]} : {}),
    },
    createdAt: now,
    updatedAt: now,
    attempt: 1,
    bestScorePct: null,
    lastScorePct: null,
    mistakesSavedAttempt: null,
  };
}

export function parseDeckFromQuizSource(source: {
  text?: string;
  label?: string;
  noteId?: string;
}): Deck | null {
  const raw = source.text?.trim();
  if (!raw) return null;
  const headingMatch = raw.match(/^##\s+(.+)/);
  const title =
    source.label?.trim() || headingMatch?.[1]?.trim() || 'Flashcards';
  const cards: Deck['cards'] = [];
  const pattern = /(?:^|\n)Q:\s*([\s\S]*?)\nA:\s*([\s\S]*?)(?=\n+Q:\s*|$)/g;
  let match: RegExpExecArray | null = pattern.exec(raw);
  while (match) {
    const question = match[1].trim();
    const answer = match[2].trim();
    if (question && answer) {
      cards.push({
        id: `parsed_card_${cards.length}`,
        question,
        answer,
        ...(source.noteId ? {sourceNoteId: source.noteId} : {}),
        intervalDays: 0,
        ease: 2.5,
        dueAt: 0,
        reviews: 0,
      });
    }
    match = pattern.exec(raw);
  }
  if (cards.length < 2) return null;
  return {
    id: 'quiz-handoff-deck',
    title,
    cards,
    createdAt: new Date().toISOString(),
  };
}

export function readQuizStore(userId: string): {
  active: QuizSession | null;
  history: QuizSession[];
} {
  const active = normalizeQuizSession(
    readSkillState<unknown>(userId, 'quiz', null),
  );
  const rawHistory = readSkillState<unknown[]>(userId, 'quizzes', []);
  const seen = new Set<string>();
  let history: QuizSession[] = [];
  if (Array.isArray(rawHistory)) {
    for (const item of rawHistory) {
      const normalized = normalizeQuizSession(item);
      if (
        normalized &&
        !normalized.isMissedDrill &&
        normalized.questions.length > 0 &&
        !seen.has(normalized.id)
      ) {
        seen.add(normalized.id);
        history.push(normalized);
      }
    }
  }
  if (active && !active.isMissedDrill && active.questions.length > 0) {
    history = [active, ...history.filter(item => item.id !== active.id)].slice(
      0,
      MAX_SAVED_QUIZZES,
    );
  }
  return {active, history};
}

export function saveActiveQuiz(
  userId: string,
  nextActive: QuizSession | null,
  currentHistory: readonly QuizSession[],
): {active: QuizSession | null; history: QuizSession[]} {
  const cleanedActive = nextActive
    ? stripQuizSourceForStorage(nextActive)
    : null;
  let nextHistory = currentHistory.map(stripQuizSourceForStorage);
  if (
    cleanedActive &&
    !cleanedActive.isMissedDrill &&
    cleanedActive.questions.length > 0
  ) {
    nextHistory = [
      cleanedActive,
      ...nextHistory.filter(item => item.id !== cleanedActive.id),
    ].slice(0, MAX_SAVED_QUIZZES);
  }
  writeSkillState(userId, 'quizzes', nextHistory);
  writeSkillState(userId, 'quiz', cleanedActive);
  return {active: cleanedActive, history: nextHistory};
}

export function discardActiveQuiz(
  userId: string,
  active: QuizSession | null,
  currentHistory: readonly QuizSession[],
): {active: null; history: QuizSession[]} {
  let nextHistory = currentHistory.map(stripQuizSourceForStorage);
  if (active) {
    if (active.lastScorePct === null) {
      nextHistory = nextHistory.filter(item => item.id !== active.id);
    } else {
      const restored: QuizSession = stripQuizSourceForStorage({
        ...active,
        paused: false,
        index: active.questions.length,
        updatedAt: new Date().toISOString(),
      });
      nextHistory = [
        restored,
        ...nextHistory.filter(item => item.id !== active.id),
      ].slice(0, MAX_SAVED_QUIZZES);
    }
  }
  writeSkillState(userId, 'quizzes', nextHistory);
  writeSkillState(userId, 'quiz', null);
  return {active: null, history: nextHistory};
}

export function deleteQuizFromHistory(
  userId: string,
  quizId: string,
  active: QuizSession | null,
  currentHistory: readonly QuizSession[],
): {active: QuizSession | null; history: QuizSession[]} {
  const nextHistory = currentHistory
    .filter(item => item.id !== quizId)
    .map(stripQuizSourceForStorage);
  const nextActive = active?.id === quizId ? null : active;
  writeSkillState(userId, 'quizzes', nextHistory);
  if (active?.id === quizId) {
    writeSkillState(userId, 'quiz', null);
  }
  return {active: nextActive, history: nextHistory};
}
