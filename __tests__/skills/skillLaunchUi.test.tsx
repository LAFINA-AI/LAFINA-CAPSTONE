/**
 * Skill handoff arrival (ADR-041, SKILL-01/05): a launch request from the call
 * or Chat opens the right page once. Pomodoro "start" starts the timer; the
 * makers open ready for material and generate nothing by themselves.
 * Rendered in Jest with the node:sqlite mock; not a phone.
 */
import React from 'react';
jest.mock('../../src/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));
import {render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {SkillsScreen} from '../../src/ui/screens/skills/SkillsScreen';
import {readSkillState} from '../../src/skills/skillsState';
import {resetStudyJobsForTests} from '../../src/skills/studyJobs';
import type {PomodoroState} from '../../src/skills/studyLogic';
import type {CallNavigationRequest} from '../../src/ui/navigation/callNavigation';
import type {SkillLaunch} from '../../src/skills/skillLaunch';
import {db, initDatabase, userStore} from '../../src/storage';
import {
  matchMaterial,
  skillControlLine,
  skillStatusLine,
} from '../../src/ai/skills/skillHandoff';
import {writeSkillState} from '../../src/skills/skillsState';
import {newPomodoro} from '../../src/skills/studyLogic';

let owner: string;
beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  resetStudyJobsForTests();
  for (const table of ['active_session', 'local_settings', 'user_materials'])
    db.executeSync(`DELETE FROM ${table}`);
  owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
});
afterEach(() => {
  jest.restoreAllMocks();
});

let serial = 0;
const request = (skill: SkillLaunch): CallNavigationRequest => ({
  requestId: `launch-${++serial}`,
  ownerId: owner,
  screen: 'notes',
  skill,
});
const open = (skill: SkillLaunch) => {
  const handled = jest.fn();
  const view = render(
    <ThemeProvider userId={owner}>
      <SkillsScreen
        userId={owner}
        refreshTrigger={0}
        onRefresh={jest.fn()}
        openRequest={request(skill)}
        onOpenRequestHandled={handled}
      />
    </ThemeProvider>,
  );
  return {view, handled};
};

test('"start a pomodoro" opens Pomodoro and starts a 25-minute focus session once', async () => {
  const {view, handled} = open({skill: 'pomodoro', action: 'start'});
  await waitFor(() =>
    expect(
      view.getByText('LAFINA started your focus session. Tap Pause any time.'),
    ).toBeTruthy(),
  );
  const timer = readSkillState<PomodoroState>(owner, 'pomodoro', newPomodoro());
  expect(timer.mode).toBe('Focus 25');
  expect(timer.deadline).toBeGreaterThan(Date.now() + 24 * 60_000);
  expect(handled).toHaveBeenCalledTimes(1);
});

test('a running session is left alone', async () => {
  const deadline = Date.now() + 7 * 60_000;
  writeSkillState(owner, 'pomodoro', {...newPomodoro(), deadline});
  const {view} = open({skill: 'pomodoro', action: 'start'});
  await waitFor(() =>
    expect(
      view.getByText('Your focus session is already running.'),
    ).toBeTruthy(),
  );
  expect(
    readSkillState<PomodoroState>(owner, 'pomodoro', newPomodoro()).deadline,
  ).toBe(deadline);
});

test('"take a long break" starts a 15-minute break', async () => {
  open({skill: 'pomodoro', action: 'break', breakKind: 'long'});
  await waitFor(() =>
    expect(
      readSkillState<PomodoroState>(owner, 'pomodoro', newPomodoro()).mode,
    ).toBe('Long 15'),
  );
});

test('"make flashcards" opens the AI maker with the material picker and generates nothing', async () => {
  const {view} = open({skill: 'flashcards', action: 'create'});
  await waitFor(() =>
    expect(view.getAllByText(/Generate/).length).toBeGreaterThan(0),
  );
  expect(readSkillState<unknown[]>(owner, 'decks', [])).toEqual([]);
});

test('"make a reaction paper about climate change" pre-fills the prompt only', async () => {
  const {view} = open({
    skill: 'docgen',
    action: 'create',
    topic: 'climate change',
  });
  await waitFor(() =>
    expect(view.getByDisplayValue('climate change')).toBeTruthy(),
  );
});

test('status lines and Pomodoro pause read the student’s own data', async () => {
  expect(skillStatusLine(owner, 'pomodoro')).toBe(
    "You don't have a focus session running.",
  );
  expect(skillStatusLine(owner, 'flashcards')).toBe(
    "You don't have any flashcards yet.",
  );
  expect(skillStatusLine(owner, 'gwa')).toMatch(/haven't saved any grades/);
  expect(skillStatusLine(owner, 'quiz')).toBe("You haven't taken a quiz yet.");
  writeSkillState(owner, 'pomodoro', {
    ...newPomodoro(),
    deadline: Date.now() + 5 * 60_000,
  });
  await expect(skillControlLine(owner, 'pause')).resolves.toBe(
    'Paused. 5 minutes left when you resume.',
  );
  expect(skillStatusLine(owner, 'pomodoro')).toBe(
    'Your timer is paused with 5 minutes left.',
  );
  await expect(skillControlLine(owner, 'resume')).resolves.toBe(
    'Resumed your session.',
  );
});

test('a lesson named in the request is matched only when exactly one fits', () => {
  const now = new Date().toISOString();
  for (const [id, title] of [
    ['mat-1', 'CHEM 101 Module 3'],
    ['mat-2', 'Physics Lab Notes'],
    ['mat-3', 'Physics Lecture'],
  ])
    db.executeSync(
      `INSERT INTO user_materials (id, user_id, title, file_name, file_kind, mime_type, size_bytes, sha256, page_count, pages_read, ocr_pages, chunk_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pdf', 'application/pdf', 1, ?, 1, 1, 0, 1, ?, ?)`,
      [id, owner, title, `${id}.pdf`, id, now, now],
    );
  expect(matchMaterial(owner, 'chem 101')).toBe('mat-1');
  expect(matchMaterial(owner, 'physics')).toBeUndefined();
  expect(matchMaterial(owner, 'biology')).toBeUndefined();
});
