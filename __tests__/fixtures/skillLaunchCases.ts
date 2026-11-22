/**
 * Skill handoff eval set (ADR-041, SKILL-00). English and Taglish requests a
 * student says in a call or types in Chat, with the expected reading.
 */
import type {SkillIntent} from '../../src/ai/skills/skillIntent';

type Expect =
  | {kind: 'launch'; skill: string; action: string; extra?: object}
  | {kind: 'status'; topic: string}
  | {kind: 'control'; control: string};

export const SKILL_CASES: ReadonlyArray<[string, Expect]> = [
  // Pomodoro
  ['start a pomodoro', {kind: 'launch', skill: 'pomodoro', action: 'start'}],
  [
    'Lafina, can you start a pomodoro?',
    {kind: 'launch', skill: 'pomodoro', action: 'start'},
  ],
  [
    'start my focus timer',
    {kind: 'launch', skill: 'pomodoro', action: 'start'},
  ],
  [
    'begin a study session',
    {kind: 'launch', skill: 'pomodoro', action: 'start'},
  ],
  [
    'pa-start ng pomodoro',
    {kind: 'launch', skill: 'pomodoro', action: 'start'},
  ],
  ['pomodoro please', {kind: 'launch', skill: 'pomodoro', action: 'start'}],
  ['open pomodoro', {kind: 'launch', skill: 'pomodoro', action: 'open'}],
  [
    'take a short break',
    {
      kind: 'launch',
      skill: 'pomodoro',
      action: 'break',
      extra: {breakKind: 'short'},
    },
  ],
  [
    'start a long break',
    {
      kind: 'launch',
      skill: 'pomodoro',
      action: 'break',
      extra: {breakKind: 'long'},
    },
  ],
  // Flashcards
  ['make flashcards', {kind: 'launch', skill: 'flashcards', action: 'create'}],
  [
    'create some flashcards for me',
    {kind: 'launch', skill: 'flashcards', action: 'create'},
  ],
  [
    'gawa ng flashcards',
    {kind: 'launch', skill: 'flashcards', action: 'create'},
  ],
  [
    'make 20 flashcards',
    {kind: 'launch', skill: 'flashcards', action: 'create', extra: {count: 20}},
  ],
  [
    'review my flashcards',
    {kind: 'launch', skill: 'flashcards', action: 'review'},
  ],
  [
    'study my due cards',
    {kind: 'launch', skill: 'flashcards', action: 'review'},
  ],
  ['open flashcards', {kind: 'launch', skill: 'flashcards', action: 'open'}],
  // Quiz
  ['quiz me', {kind: 'launch', skill: 'quiz', action: 'create'}],
  ['make a quiz', {kind: 'launch', skill: 'quiz', action: 'create'}],
  [
    'generate a 10 item quiz',
    {kind: 'launch', skill: 'quiz', action: 'create', extra: {count: 10}},
  ],
  ['create a practice test', {kind: 'launch', skill: 'quiz', action: 'create'}],
  ['gumawa ng quiz', {kind: 'launch', skill: 'quiz', action: 'create'}],
  ['open the quiz maker', {kind: 'launch', skill: 'quiz', action: 'open'}],
  // Summarizer, Lesson Q&A
  [
    'summarize my reading',
    {kind: 'launch', skill: 'summarizer', action: 'create'},
  ],
  [
    'give me a summary',
    {kind: 'launch', skill: 'summarizer', action: 'create'},
  ],
  ['upload a lesson', {kind: 'launch', skill: 'materials', action: 'open'}],
  ['open lesson q&a', {kind: 'launch', skill: 'materials', action: 'open'}],
  // Documents
  [
    'make a reaction paper about climate change',
    {
      kind: 'launch',
      skill: 'docgen',
      action: 'create',
      extra: {topic: 'climate change'},
    },
  ],
  [
    'create a presentation on the French Revolution',
    {
      kind: 'launch',
      skill: 'docgen',
      action: 'create',
      extra: {topic: 'the French Revolution'},
    },
  ],
  ['write an essay', {kind: 'launch', skill: 'docgen', action: 'create'}],
  // Meetings, GWA, tab
  ['record my class', {kind: 'launch', skill: 'meetings', action: 'open'}],
  ['start recording', {kind: 'launch', skill: 'meetings', action: 'open'}],
  ['compute my GWA', {kind: 'launch', skill: 'gwa', action: 'open'}],
  ['open the skills tab', {kind: 'launch', skill: 'hub', action: 'open'}],
  ['open my alarms', {kind: 'launch', skill: 'alarms', action: 'open'}],
  // Status and control
  ['how long is left on my pomodoro?', {kind: 'status', topic: 'pomodoro'}],
  [
    'how much time is left in my focus session',
    {kind: 'status', topic: 'pomodoro'},
  ],
  ['how many cards are due?', {kind: 'status', topic: 'flashcards'}],
  ["what's my GWA?", {kind: 'status', topic: 'gwa'}],
  ['what was my last quiz score', {kind: 'status', topic: 'quiz'}],
  ['pause my pomodoro', {kind: 'control', control: 'pause'}],
  ['stop the timer', {kind: 'control', control: 'pause'}],
  ['resume my pomodoro', {kind: 'control', control: 'resume'}],
];

/** Never a skill: planner requests, statements and questions. */
export const NOT_SKILL: readonly string[] = [
  'I have a quiz tomorrow',
  'remind me to study for my quiz at 7pm',
  'add a task to review flashcards tomorrow',
  'summarize my day',
  "what's on my schedule tomorrow",
  'create a note about photosynthesis',
  'set an alarm for 6am',
  'schedule a meeting at 3pm',
  'take a note',
  'yes save it',
  'bye',
  'record that I finished my essay',
  'my report is due friday',
];

/** Shape check used by the eval test. */
export const matches = (
  intent: SkillIntent | null,
  expected: Expect,
): boolean => {
  if (!intent || intent.kind !== expected.kind) return false;
  if (intent.kind === 'launch' && expected.kind === 'launch') {
    if (intent.launch.skill !== expected.skill) return false;
    if (intent.launch.action !== expected.action) return false;
    return Object.entries(expected.extra ?? {}).every(
      ([key, value]) =>
        (intent.launch as unknown as Record<string, unknown>)[key] === value,
    );
  }
  if (intent.kind === 'status' && expected.kind === 'status')
    return intent.topic === expected.topic;
  if (intent.kind === 'control' && expected.kind === 'control')
    return intent.control === expected.control;
  return false;
};
