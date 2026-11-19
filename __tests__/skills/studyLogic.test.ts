import {
  finishPomodoro,
  localDay,
  MODE_SECONDS,
  newPomodoro,
  reconcilePomodoro,
  scheduleCard,
  stepGrade,
  weightedGwa,
} from '../../src/skills/studyLogic';
import type {StudyCard} from '../../src/skills/studyLogic';

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
});
