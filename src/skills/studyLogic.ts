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
export const MAX_INTERVAL_DAYS = 365;
export interface StudyCard {
  id: string;
  question: string;
  answer: string;
  sourceNoteId?: string;
  sourceLabel?: string;
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
export interface ScheduleOptions {
  practice?: boolean;
  isRetry?: boolean;
}
/** Hard grows a learned card's gap a little (Anki-style), never shrinks it. */
export const HARD_INTERVAL_FACTOR = 1.2;

/**
 * Small SM-2 inspired scheduler: failed recall returns in a minute; Hard
 * returns in 10 minutes while learning, otherwise ~1.2x the last gap.
 * A retry inside the same session (after Again) never changes ease again, so
 * one hard card is not penalised twice in one sitting.
 */
export function scheduleCard(
  card: StudyCard,
  rating: Rating,
  now = Date.now(),
  options?: ScheduleOptions,
): StudyCard {
  if (options?.practice && card.dueAt > now) {
    return {...card};
  }
  const ease = options?.isRetry
    ? card.ease
    : Math.max(
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
      ? card.intervalDays < 1
        ? 10 / 1440
        : Math.min(
            MAX_INTERVAL_DAYS,
            Math.max(
              card.intervalDays,
              Math.round(card.intervalDays * HARD_INTERVAL_FACTOR),
            ),
          )
      : rating === 'Good'
      ? card.intervalDays < 1
        ? 1
        : Math.min(
            MAX_INTERVAL_DAYS,
            Math.max(
              card.intervalDays + 1,
              Math.round(card.intervalDays * ease),
            ),
          )
      : Math.min(
          MAX_INTERVAL_DAYS,
          Math.max(
            4,
            card.intervalDays >= 1 ? card.intervalDays + 2 : 4,
            Math.round(card.intervalDays * ease * 1.3),
          ),
        );
  return {
    ...card,
    ease,
    intervalDays: interval,
    dueAt: now + Math.round(interval * 86400000),
    reviews: options?.isRetry ? card.reviews : card.reviews + 1,
  };
}
export function formatScheduleInterval(days: number): string {
  const minutes = Math.max(1, Math.round(days * 1440));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  if (days >= 365) {
    const years = Math.max(1, Math.round(days / 365));
    return `${years} yr`;
  }
  if (days >= 30) {
    const months = Math.max(1, Math.round(days / 30));
    return `${months} mo`;
  }
  const roundedDays = Math.max(1, Math.round(days));
  return `${roundedDays} ${roundedDays === 1 ? 'day' : 'days'}`;
}
export const previewCardInterval = (
  card: StudyCard,
  rating: Rating,
  options?: {practice?: boolean; isRetry?: boolean; now?: number},
): string => {
  if (options?.practice && card.dueAt > (options.now ?? Date.now())) {
    return 'Practice';
  }
  return formatScheduleInterval(
    scheduleCard(card, rating, 0, {isRetry: options?.isRetry}).intervalDays,
  );
};
export interface DeckStats {
  total: number;
  due: number;
  newCount: number;
  learningCount: number;
  masteredCount: number;
  nextDueAt: number | null;
}
/** Computes card maturity, due count, and earliest upcoming due timestamp for a deck. */
export function getDeckStats(deck: Deck, now = Date.now()): DeckStats {
  let due = 0;
  let newCount = 0;
  let learningCount = 0;
  let masteredCount = 0;
  let nextDueAt: number | null = null;
  for (const card of deck.cards) {
    if (card.dueAt <= now) {
      due += 1;
    } else if (nextDueAt === null || card.dueAt < nextDueAt) {
      nextDueAt = card.dueAt;
    }
    if (card.reviews === 0) {
      newCount += 1;
    } else if (card.intervalDays >= 7) {
      masteredCount += 1;
    } else {
      learningCount += 1;
    }
  }
  return {
    total: deck.cards.length,
    due,
    newCount,
    learningCount,
    masteredCount,
    nextDueAt,
  };
}
/** Formats the countdown until the next non-due card in a deck becomes due. */
export function formatNextDueIn(
  nextDueAt: number | null,
  now = Date.now(),
): string | null {
  if (nextDueAt === null || nextDueAt <= now) return null;
  const diffMs = nextDueAt - now;
  if (diffMs < 60000) return 'Next due in < 1 min';
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `Next due in ${minutes} min`;
  const hours = Math.round(diffMs / 3600000);
  if (hours < 24) return `Next due in ${hours} hr`;
  const days = Math.round(diffMs / 86400000);
  if (days <= 1) return 'Next due tomorrow';
  return `Next due in ${days} days`;
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
  countsMinutes?: Record<string, number>;
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
  let countsMinutes = state.countsMinutes;
  if (completed && state.mode === 'Focus 25') {
    const day = localDay(at);
    const prevCount = counts[day] ?? 0;
    counts[day] = prevCount + 1;
    countsMinutes = {
      ...(countsMinutes ?? {}),
      [day]:
        (countsMinutes?.[day] ?? prevCount * 25) +
        Math.round(MODE_SECONDS[state.mode] / 60),
    };
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
    ...(countsMinutes ? {countsMinutes} : {}),
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
