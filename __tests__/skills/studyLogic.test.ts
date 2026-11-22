import {
  finishPomodoro,
  formatNextDueIn,
  formatScheduleInterval,
  getDeckStats,
  localDay,
  MAX_INTERVAL_DAYS,
  MODE_SECONDS,
  newPomodoro,
  previewCardInterval,
  reconcilePomodoro,
  scheduleCard,
  stepGrade,
  weightedGwa,
} from '../../src/skills/studyLogic';
import type {Deck, StudyCard} from '../../src/skills/studyLogic';

describe('Skills GWA math', () => {
  test('uses credit-unit weights and keeps full precision until display', () => {
    expect(
      weightedGwa([
        {id: 'a', name: 'A', units: 3, grade: 1.5},
        {id: 'b', name: 'B', units: 1, grade: 2},
      ]),
    ).toBe(1.625);
  });
  test('excludes ungraded and zero-credit subjects; empty never divides by zero', () => {
    expect(weightedGwa([])).toBeNull();
    expect(
      weightedGwa([
        {id: 'a', name: 'A', units: 3, grade: null},
        {id: 'b', name: 'B', units: 0, grade: 5},
      ]),
    ).toBeNull();
    expect(
      weightedGwa([
        {id: 'a', name: 'A', units: 3, grade: 3},
        {id: 'b', name: 'B', units: 0, grade: 5},
      ]),
    ).toBe(3);
  });
  test('rejects invalid units and grades', () => {
    for (const pair of [
      [-1, 1],
      [3, 0],
      [3, 5.25],
      [NaN, 2],
      [3, Infinity],
    ])
      expect(() =>
        weightedGwa([{id: 'a', name: 'A', units: pair[0], grade: pair[1]}]),
      ).toThrow();
  });
  test('quarter steps clamp to 1–5', () => {
    expect(stepGrade(1, -0.25)).toBe(1);
    expect(stepGrade(5, 0.25)).toBe(5);
    expect(stepGrade(2, 0.25)).toBe(2.25);
  });
});
describe('Pomodoro deadline lifecycle', () => {
  const at = new Date(2026, 10, 20, 14).getTime();
  test('restores elapsed background time without crediting an unfinished focus', () => {
    const state = {...newPomodoro(), deadline: at + 1500000};
    expect(reconcilePomodoro(state, at + 120000).remaining).toBe(1380);
    expect(reconcilePomodoro(state, at + 120000).counts).toEqual({});
  });
  test('credits once at the deadline and starts a paused break', () => {
    const end = at + 1500000;
    const state = reconcilePomodoro({...newPomodoro(), deadline: end}, end);
    expect(state).toMatchObject({
      mode: 'Break 5',
      remaining: 300,
      deadline: null,
      cycle: 1,
    });
    expect(state.counts[localDay(end)]).toBe(1);
    expect(reconcilePomodoro(state, end + 86400000)).toEqual(state);
  });
  test('four completed focus sessions produce a long break', () => {
    let state = newPomodoro();
    for (let i = 1; i <= 4; i++) {
      state = finishPomodoro(state, true, at);
      expect(state.mode).toBe(i === 4 ? 'Long 15' : 'Break 5');
      if (i < 4) state = finishPomodoro(state, true, at);
    }
    expect(state.counts[localDay(at)]).toBe(4);
    expect(state.countsMinutes?.[localDay(at)]).toBe(100);
    expect(state.remaining).toBe(MODE_SECONDS['Long 15']);
  });
  test('skip never credits focus time and midnight credits the completion date', () => {
    expect(finishPomodoro(newPomodoro(), false, at).counts).toEqual({});
    const end = new Date(2026, 10, 21, 0, 1).getTime();
    const s = reconcilePomodoro({...newPomodoro(), deadline: end}, end + 10000);
    expect(s.counts[localDay(end)]).toBe(1);
  });
});
describe('Spaced repetition', () => {
  const card: StudyCard = {
    id: 'c',
    question: 'Q',
    answer: 'A',
    intervalDays: 0,
    ease: 2.5,
    dueAt: 0,
    reviews: 0,
  };
  test('new cards schedule Again/Hard/Good/Easy at distinct real deadlines', () => {
    expect(scheduleCard(card, 'Again', 0).dueAt).toBe(60000);
    expect(scheduleCard(card, 'Hard', 0).dueAt).toBe(600000);
    expect(scheduleCard(card, 'Good', 0).dueAt).toBe(86400000);
    expect(scheduleCard(card, 'Easy', 0).dueAt).toBe(4 * 86400000);
  });
  test('successful reviews grow intervals and repeated failures have an ease floor', () => {
    const next = scheduleCard(
      {...card, intervalDays: 4, reviews: 3},
      'Good',
      1000,
    );
    expect(next.intervalDays).toBe(10);
    expect(next.reviews).toBe(4);
    expect(next.dueAt).toBe(1000 + 10 * 86400000);
    let failed = card;
    for (let i = 0; i < 20; i++) failed = scheduleCard(failed, 'Again', 0);
    expect(failed.ease).toBe(1.3);
  });
  test('does not mutate the persisted input', () => {
    const copy = {...card};
    scheduleCard(card, 'Easy', 100);
    expect(card).toEqual(copy);
  });
  test('Hard on a reviewed card grows the gap a little (about 1.2x), less than Good', () => {
    const reviewed: StudyCard = {
      ...card,
      intervalDays: 10,
      ease: 2.5,
      reviews: 3,
    };
    const next = scheduleCard(reviewed, 'Hard', 0);
    expect(next.intervalDays).toBe(12);
    expect(next.ease).toBeCloseTo(2.35);
    expect(next.intervalDays).toBeLessThan(
      scheduleCard(reviewed, 'Good', 0).intervalDays,
    );
    // A well-known card rated Hard is not sent back to half its gap.
    expect(scheduleCard({...reviewed, intervalDays: 30}, 'Hard', 0).intervalDays).toBe(36);
  });
  test('interval formatter and preview helper display real intervals', () => {
    expect(formatScheduleInterval(1 / 1440)).toBe('1 min');
    expect(formatScheduleInterval(10 / 1440)).toBe('10 min');
    expect(formatScheduleInterval(1)).toBe('1 day');
    expect(formatScheduleInterval(4)).toBe('4 days');
    expect(previewCardInterval(card, 'Easy')).toBe('4 days');
    expect(previewCardInterval({...card, intervalDays: 10}, 'Hard')).toBe(
      '12 days',
    );
    expect(formatScheduleInterval(45)).toBe('2 mo');
    expect(formatScheduleInterval(365)).toBe('1 yr');
    expect(
      previewCardInterval({...card, intervalDays: 10, dueAt: 5000}, 'Good', {
        practice: true,
        now: 1000,
      }),
    ).toBe('Practice');
  });
  test('Good escapes the 1-day loop at low ease, Hard never shrinks a learned gap, and intervals cap at MAX_INTERVAL_DAYS', () => {
    const lowEaseOneDay: StudyCard = {
      ...card,
      intervalDays: 1,
      ease: 1.3,
      reviews: 2,
    };
    const afterGood = scheduleCard(lowEaseOneDay, 'Good', 0);
    expect(afterGood.intervalDays).toBe(2);

    const afterHard1 = scheduleCard(lowEaseOneDay, 'Hard', 0);
    expect(afterHard1.intervalDays).toBe(1);
    const afterHard2 = scheduleCard(afterHard1, 'Hard', 0);
    expect(afterHard2.intervalDays).toBe(1);
    expect(scheduleCard({...card, intervalDays: 320}, 'Hard', 0).intervalDays).toBe(
      MAX_INTERVAL_DAYS,
    );

    const maxCard: StudyCard = {
      ...card,
      intervalDays: 300,
      ease: 3.0,
      reviews: 8,
    };
    expect(scheduleCard(maxCard, 'Good', 0).intervalDays).toBe(
      MAX_INTERVAL_DAYS,
    );
    expect(scheduleCard(maxCard, 'Easy', 0).intervalDays).toBe(
      MAX_INTERVAL_DAYS,
    );
  });
  test('practice mode protects future-due cards while scheduling due cards, and retries do not double-penalize', () => {
    const futureCard: StudyCard = {
      ...card,
      intervalDays: 10,
      ease: 2.5,
      dueAt: 50000,
      reviews: 4,
    };
    expect(scheduleCard(futureCard, 'Easy', 1000, {practice: true})).toEqual(
      futureCard,
    );
    const dueCard: StudyCard = {...futureCard, dueAt: 500};
    expect(
      scheduleCard(dueCard, 'Good', 1000, {practice: true}).intervalDays,
    ).toBe(25);

    const retryCard: StudyCard = {
      ...card,
      intervalDays: 1 / 1440,
      ease: 2.3,
      reviews: 1,
    };
    const retryAgain = scheduleCard(retryCard, 'Again', 1000, {isRetry: true});
    expect(retryAgain.ease).toBe(2.3);
    expect(retryAgain.reviews).toBe(1);
    const retryGood = scheduleCard(retryCard, 'Good', 1000, {isRetry: true});
    expect(retryGood.reviews).toBe(1);
    expect(retryGood.intervalDays).toBe(1);
    // Again then Hard in one session costs ease once, not twice.
    const retryHard = scheduleCard(retryCard, 'Hard', 1000, {isRetry: true});
    expect(retryHard.ease).toBe(2.3);
    expect(retryHard.intervalDays).toBe(10 / 1440);
  });
  test('getDeckStats and formatNextDueIn report accurate breakdowns and countdowns', () => {
    const deck: Deck = {
      id: 'd1',
      title: 'Stats',
      createdAt: '2026-01-01T00:00:00.000Z',
      cards: [
        {...card, id: 'new1', dueAt: 1000, reviews: 0, intervalDays: 0},
        {...card, id: 'learn1', dueAt: 5000, reviews: 1, intervalDays: 1},
        {...card, id: 'mast1', dueAt: 90000000, reviews: 3, intervalDays: 10},
      ],
    };
    const stats = getDeckStats(deck, 2000);
    expect(stats).toEqual({
      total: 3,
      due: 1,
      newCount: 1,
      learningCount: 1,
      masteredCount: 1,
      nextDueAt: 5000,
    });
    expect(formatNextDueIn(null, 2000)).toBeNull();
    expect(formatNextDueIn(2000, 2000)).toBeNull();
    expect(formatNextDueIn(2000 + 30000, 2000)).toBe('Next due in < 1 min');
    expect(formatNextDueIn(2000 + 10 * 60000, 2000)).toBe('Next due in 10 min');
    expect(formatNextDueIn(2000 + 3 * 3600000, 2000)).toBe('Next due in 3 hr');
    expect(formatNextDueIn(2000 + 86400000, 2000)).toBe('Next due tomorrow');
    expect(formatNextDueIn(2000 + 3 * 86400000, 2000)).toBe(
      'Next due in 3 days',
    );
  });
});
