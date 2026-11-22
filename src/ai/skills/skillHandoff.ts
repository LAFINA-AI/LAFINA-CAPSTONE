/**
 * What LAFINA says and does about the Skills during a call (ADR-041):
 * - `prepareSkillLaunch`: a validated launch with the student's lesson
 *   matched by name, and the one line she says before the call ends;
 * - `skillStatusLine`: answers "how long is left on my pomodoro?" and the like
 *   from the student's own stored data (read only);
 * - `skillControlLine`: pauses or resumes a running Pomodoro.
 *
 * Everything here is local and owner-scoped. Nothing is generated, recorded
 * or saved by a launch; the student taps to do that on the skill's page.
 */
import {materialStore} from '../../storage/materialStore';
import {readSkillState} from '../../skills/skillsState';
import {readDecks} from '../../skills/studyDecks';
import {getDeckStats, MODE_SECONDS, weightedGwa} from '../../skills/studyLogic';
import type {GradeSubject} from '../../skills/studyLogic';
import {readQuizStore, scoreQuiz} from '../../skills/quizLogic';
import {
  pausePomodoro,
  pomodoroMinutesLeft,
  readPomodoro,
  resumePomodoro,
} from '../../skills/pomodoroService';
import {handoffLine, validateSkillLaunch} from '../../skills/skillLaunch';
import type {SkillLaunch} from '../../skills/skillLaunch';
import type {SkillStatusTopic} from './skillIntent';

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 || /^\d+$/.test(w));

/**
 * Finds the one saved lesson whose title has every word of the hint
 * ("chem 101" → "CHEM 101 Module 3"). Two or more matches pick none: the
 * student chooses on the page.
 */
export const matchMaterial = (
  owner: string,
  hint: string | undefined,
): string | undefined => {
  if (!hint) return undefined;
  const want = words(hint);
  if (!want.length) return undefined;
  let list: ReturnType<typeof materialStore.listMaterials>;
  try {
    list = materialStore.listMaterials(owner);
  } catch {
    return undefined;
  }
  const hits = list.filter(material => {
    const have = words(`${material.title} ${material.fileName}`);
    return want.every(w => have.includes(w));
  });
  return hits.length === 1 ? hits[0].id : undefined;
};

export interface PreparedLaunch {
  launch: SkillLaunch;
  line: string;
}

/** A launch ready to hand off: validated, lesson matched, line written. */
export const prepareSkillLaunch = (
  owner: string,
  raw: Partial<Record<keyof SkillLaunch, unknown>>,
  options: {online: boolean; materialHint?: string},
): PreparedLaunch | null => {
  const materialId =
    typeof raw.materialId === 'string'
      ? raw.materialId
      : matchMaterial(owner, options.materialHint);
  const launch = validateSkillLaunch({...raw, materialId});
  if (!launch) return null;
  if (
    launch.materialId &&
    !safely(() => materialStore.getMaterial(owner, launch.materialId!))
  )
    delete launch.materialId;
  let pomodoroRunning = false;
  if (launch.skill === 'pomodoro' && launch.action !== 'open')
    pomodoroRunning =
      safely(() => readPomodoro(owner).deadline !== null) ?? false;
  return {
    launch,
    line: handoffLine(launch, {online: options.online, pomodoroRunning}),
  };
};

function safely<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** One spoken answer about a skill, from the student's stored data. */
export const skillStatusLine = (
  owner: string,
  topic: SkillStatusTopic,
  now = Date.now(),
): string => {
  switch (topic) {
    case 'pomodoro': {
      const state = safely(() => readPomodoro(owner, now));
      const left = state ? pomodoroMinutesLeft(state, now) : null;
      if (!state || left === null)
        return state &&
          state.remaining > 0 &&
          state.remaining < MODE_SECONDS[state.mode]
          ? `Your timer is paused with ${plural(
              Math.ceil(state.remaining / 60),
              'minute',
            )} left.`
          : "You don't have a focus session running.";
      const what = state.mode === 'Focus 25' ? 'focus session' : 'break';
      return left <= 1
        ? `Less than a minute left in your ${what}.`
        : `${plural(left, 'minute')} left in your ${what}.`;
    }
    case 'flashcards': {
      const decks = safely(() => readDecks(owner)) ?? [];
      if (!decks.length) return "You don't have any flashcards yet.";
      const due = decks.reduce(
        (sum, deck) => sum + getDeckStats(deck, now).due,
        0,
      );
      return due === 0
        ? 'No cards are due right now. Nice work.'
        : `${plural(due, 'card')} ${due === 1 ? 'is' : 'are'} due for review.`;
    }
    case 'gwa': {
      const term = safely(() =>
        readSkillState<string>(owner, 'gwa.lastSemester', ''),
      );
      if (!term)
        return "You haven't saved any grades in the GWA calculator yet.";
      const subjects =
        safely(() =>
          readSkillState<GradeSubject[]>(
            owner,
            `gwa.${encodeURIComponent(term)}`,
            [],
          ),
        ) ?? [];
      const gwa = safely(() => weightedGwa(subjects));
      return typeof gwa === 'number'
        ? `Your GWA for ${term} is ${gwa.toFixed(2)}.`
        : `You haven't entered grades for ${term} yet.`;
    }
    case 'quiz': {
      const store = safely(() => readQuizStore(owner));
      const last = store?.history.find(
        session => scoreQuiz(session).answered > 0,
      );
      if (!last) return "You haven't taken a quiz yet.";
      const score = scoreQuiz(last);
      return `On "${last.title}" you got ${score.correct} out of ${score.total}.`;
    }
  }
};

/** Pauses or resumes the Pomodoro and says what happened. */
export const skillControlLine = async (
  owner: string,
  control: 'pause' | 'resume',
): Promise<string> => {
  try {
    if (control === 'pause') {
      const paused = await pausePomodoro(owner);
      return paused
        ? `Paused. ${plural(
            Math.max(1, Math.ceil(paused.remaining / 60)),
            'minute',
          )} left when you resume.`
        : "You don't have a focus session running.";
    }
    const resumed = await resumePomodoro(owner);
    return resumed
      ? 'Resumed your session.'
      : 'Your focus session is already running.';
  } catch {
    return "I couldn't change the timer. You can use Pomodoro in Skills.";
  }
};
