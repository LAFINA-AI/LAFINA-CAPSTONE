export interface GradeSubject {
  id: string;
  name: string;
  units: number;
  grade: number | null;
}
export function weightedGwa(subjects: readonly GradeSubject[]): number | null {
  let weighted = 0,
    units = 0;
  for (const s of subjects) {
    if (s.grade === null) continue;
    if (
      !Number.isFinite(s.units) ||
      s.units < 0 ||
      !Number.isFinite(s.grade) ||
      s.grade < 1 ||
      s.grade > 5
    )
      throw new Error('Use valid units and a grade from 1.00 to 5.00.');
    weighted += s.units * s.grade;
    units += s.units;
  }
  return units > 0 ? weighted / units : null;
}
export const stepGrade = (grade: number | null, delta: number) =>
  grade === null
    ? 1
    : Math.min(5, Math.max(1, Math.round((grade + delta) * 4) / 4));
export type Rating = 'Again' | 'Hard' | 'Good' | 'Easy';
export interface StudyCard {
  id: string;
  question: string;
  answer: string;
  sourceNoteId?: string;
  intervalDays: number;
  ease: number;
  dueAt: number;
  reviews: number;
}
export interface Deck {
  id: string;
  title: string;
  cards: StudyCard[];
  createdAt: string;
}
/** Small SM-2 inspired scheduler: failed recall returns in a minute, Hard in >=10m. */
export function scheduleCard(
  card: StudyCard,
  rating: Rating,
  now = Date.now(),
): StudyCard {
  const ease = Math.max(
    1.3,
    Math.min(
      3.5,
      card.ease +
        (rating === 'Again'
          ? -0.2
          : rating === 'Hard'
          ? -0.15
          : rating === 'Easy'
          ? 0.15
          : 0),
    ),
  );
  const interval =
    rating === 'Again'
      ? 1 / 1440
      : rating === 'Hard'
      ? Math.max(10 / 1440, card.intervalDays * 1.2)
      : rating === 'Good'
      ? Math.max(1, Math.round(card.intervalDays * ease))
      : Math.max(4, Math.round(card.intervalDays * ease * 1.3));
  return {
    ...card,
    ease,
    intervalDays: interval,
    dueAt: now + Math.round(interval * 86400000),
    reviews: card.reviews + 1,
  };
}
export type PomodoroMode = 'Focus 25' | 'Break 5' | 'Long 15';
export const MODE_SECONDS: Record<PomodoroMode, number> = {
  'Focus 25': 1500,
  'Break 5': 300,
  'Long 15': 900,
};
export interface PomodoroState {
  mode: PomodoroMode;
  remaining: number;
  deadline: number | null;
  cycle: number;
  counts: Record<string, number>;
  taskId: string | null;
  silence: boolean;
}
export const newPomodoro = (): PomodoroState => ({
  mode: 'Focus 25',
  remaining: 1500,
  deadline: null,
  cycle: 0,
  counts: {},
  taskId: null,
  silence: false,
});
export const localDay = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(d.getDate()).padStart(2, '0')}`;
};
export function finishPomodoro(
  state: PomodoroState,
  completed: boolean,
  at: number,
): PomodoroState {
  const cycle = state.cycle + (completed && state.mode === 'Focus 25' ? 1 : 0);
  const counts = {...state.counts};
  if (completed && state.mode === 'Focus 25') {
    const day = localDay(at);
    counts[day] = (counts[day] ?? 0) + 1;
  }
  const mode =
    state.mode === 'Focus 25'
      ? completed && cycle > 0 && cycle % 4 === 0
        ? 'Long 15'
        : 'Break 5'
      : 'Focus 25';
  return {
    ...state,
    cycle,
    counts,
    mode,
    remaining: MODE_SECONDS[mode],
    deadline: null,
  };
}
/** Reconciles once from a persisted deadline. Waiting breaks never auto-start. */
export function reconcilePomodoro(
  state: PomodoroState,
  now: number,
): PomodoroState {
  if (state.deadline === null) return state;
  if (now >= state.deadline) return finishPomodoro(state, true, state.deadline);
  return {...state, remaining: Math.ceil((state.deadline - now) / 1000)};
}
