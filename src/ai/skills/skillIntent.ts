/**
 * Reads a student's request to use a Skill (ADR-041), on the device, with no
 * model. It is the "student's own words" check: the call opens a skill by
 * itself only when these words ask for it.
 *
 * Three kinds:
 * - `launch`: open a skill (and, for Pomodoro, start it): "start a pomodoro",
 *   "make flashcards", "quiz me", "make a reaction paper about climate change".
 * - `status`: a question about a skill: "how long is left on my pomodoro?",
 *   "how many cards are due?", "what's my GWA?".
 * - `control`: pause or stop a running Pomodoro.
 *
 * It needs an action word and a skill word together: "I have a quiz
 * tomorrow" or "study for my quiz" opens nothing.
 */
import type {SkillLaunch} from '../../skills/skillLaunch';

export type SkillStatusTopic = 'pomodoro' | 'flashcards' | 'gwa' | 'quiz';

export type SkillIntent =
  | {kind: 'launch'; launch: SkillLaunch; materialHint?: string}
  | {kind: 'status'; topic: SkillStatusTopic}
  | {kind: 'control'; control: 'pause' | 'resume'};

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9'&\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "please", "lafina", "can you" and the like around the request. */
const LEAD =
  /^(?:(?:ok(?:ay)?|hey|hi|so|um+|uh+|lafina|please|can you|could you|would you|will you|i want (?:you )?to|i'd like (?:you )?to|i would like (?:you )?to|i need you to|let's|lets|let us|help me|pwede|paki|pa)\s+)+/;

const START_VERB =
  '(?:start|begin|run|launch|kick off|set(?: up)?|turn on|do|i start|i-start|simulan|umpisahan|pa start|pastart)';
const OPEN_VERB =
  '(?:open|show|go to|take me to|bring up|pull up|buksan|ipakita)';
const MAKE_VERB =
  '(?:make|create|generate|build|write|draft|prepare|give me|set up|gawa(?: ng| ako ng)?|gumawa(?: ng)?|gawan mo ako ng|i make|i-make)';
const ART = '(?:a|an|the|some|my|me|ng|isang|new|another)';

const POMODORO =
  '(?:pomodoro|focus timer|study timer|focus session|study session|focus mode|pomodoro timer)';
const FLASHCARDS =
  '(?:flash ?cards?|flashcard deck|study cards|reviewer cards|cards for (?:my|the) \\w+)';
const QUIZ =
  '(?:quiz(?:zes)?|practice (?:test|exam|quiz)|mock (?:test|exam|quiz)|reviewer quiz)';
const DOC =
  '(?:essay|reaction paper|reflection paper|position paper|research paper|term paper|report|document|doc|docx|word (?:doc|document|file)|presentation|slides?|slide deck|powerpoint|ppt|pptx|spreadsheet|excel(?: file| sheet)?|xlsx|handout|pdf|outline|letter)';

const re = (source: string) => new RegExp(source);

const WORD_NUMBERS: Record<string, number> = {
  five: 5,
  six: 6,
  eight: 8,
  ten: 10,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
};

const countIn = (t: string): number | undefined => {
  const m = t.match(
    /\b(\d{1,2}|five|six|eight|ten|twelve|fifteen|twenty|thirty)\s+(?:item|question|card|flash ?card)s?\b/,
  );
  if (!m) return undefined;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUMBERS[m[1]];
  return n && n > 0 ? n : undefined;
};

/** "…about climate change", "…on the French revolution". */
const topicIn = (original: string): string | undefined => {
  const m = original.match(
    /\b(?:about|on|regarding|tungkol sa)\s+(.{2,200}?)[.!?]*$/i,
  );
  const topic = m?.[1]?.trim();
  if (!topic) return undefined;
  if (
    /^(?:it|this|that|my notes?|my lesson|my material|my reading)$/i.test(topic)
  )
    return undefined;
  return topic;
};

/** "…from my Chem 101 notes", "…using my biology lesson". */
const materialHintIn = (t: string): string | undefined => {
  const cleaned = t.replace(/\s+(?:please|po|na|now|for me|thanks?)$/i, '').trim();
  const m = cleaned.match(
    /\b(?:from|using|based on|out of|with)\s+(?:my|the)\s+(.{2,60}?)\s*(?:notes?|lessons?|materials?|reading|readings|pdf|module|handout|file)?$/,
  );
  const hint = m?.[1]?.trim();
  if (
    !hint ||
    /^(?:notes?|lessons?|materials?|reading|pdf|module|file)$/.test(hint)
  )
    return undefined;
  return hint;
};

const PLANNER_OBJECT =
  /\b(?:day|today|tomorrow|schedule|calendar|week|agenda|tasks?|to ?dos?|reminders?|alarms?|events?|plans?|notes?)\b/;

/** Future date/time anchors indicate a planner scheduling request rather than an immediate skill launch. */
const HAS_FUTURE_SCHEDULE_TIME =
  /\b(?:tomorrow|tonight|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|by\s+(?:tomorrow|tonight|next\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|o'?clock)?)\b/;

/** Study-material nouns that clearly target the Summarizer tool rather than inline Q&A. */
const SUMMARIZER_TARGET =
  /\b(?:reading|readings|lesson|lessons|material|materials|module|modules|pdf|handout|handouts|document|documents|doc|file|files|chapter|chapters|lecture|lectures|article|articles|paper|papers|textbook|slides?|transcript|recording)\b/;

/** Reads one turn. Returns null when it is not about a Skill. */
export const detectSkillIntent = (text: string): SkillIntent | null => {
  const full = normalize(text);
  if (!full) return null;
  const t = full.replace(LEAD, '').trim();
  const hasFutureSchedule = HAS_FUTURE_SCHEDULE_TIME.test(full);

  // ── Questions about a skill ────────────────────────────────────────────
  if (
    /\b(?:how (?:much|long)|how many minutes|time)\b.*\b(?:left|remaining)\b/.test(
      t,
    ) &&
    re(`\\b(?:${POMODORO}|timer|focus|session)\\b`).test(t)
  )
    return {kind: 'status', topic: 'pomodoro'};
  if (
    /\bhow many\b.*\b(?:flash ?)?cards?\b.*\bdue\b/.test(t) ||
    /\b(?:cards?|flashcards?) (?:are )?due\b/.test(t)
  )
    return {kind: 'status', topic: 'flashcards'};
  if (
    /^(?:what(?:'s| is)|what was|tell me|check)\s+(?:my\s+(?:current\s+|latest\s+|saved\s+)?(?:gwa|general weighted average)|the\s+(?:gwa|general weighted average)\s+(?:i\s+saved|in\s+my\s+calculator))\b/.test(
      t,
    )
  )
    return {kind: 'status', topic: 'gwa'};
  if (
    !/^how\s+(?:do|to|can|should)\b/.test(t) &&
    /\b(?:last|latest|recent) quiz\b.*\b(?:score|result|grade)\b|\bmy quiz score\b|\bquiz score\b/.test(
      t,
    ) &&
    /^(?:what|how|tell|check)/.test(t)
  )
    return {kind: 'status', topic: 'quiz'};

  // ── Pause / stop / resume a Pomodoro ───────────────────────────────────
  if (
    re(
      `^(?:pause|stop|end|cancel|halt|i pause|ihinto|itigil)\\s+(?:${ART}\\s+)?(?:${POMODORO}|timer|focus)\\b`,
    ).test(t)
  )
    return {kind: 'control', control: 'pause'};
  if (
    re(
      `^(?:resume|continue|unpause)\\s+(?:${ART}\\s+)?(?:${POMODORO}|timer|focus)\\b`,
    ).test(t)
  )
    return {kind: 'control', control: 'resume'};

  // ── Pomodoro ───────────────────────────────────────────────────────────
  if (
    !hasFutureSchedule &&
    re(
      `^(?:take|start|have|begin)\\s+(?:${ART}\\s+)?(?:(short|long|5 minute|five minute|15 minute|fifteen minute)\\s+)?break\\b`,
    ).test(t)
  ) {
    const long = /\b(?:long|15 minute|fifteen minute)\b/.test(t);
    return {
      kind: 'launch',
      launch: {
        skill: 'pomodoro',
        action: 'break',
        breakKind: long ? 'long' : 'short',
      },
    };
  }
  if (
    !hasFutureSchedule &&
    (re(
      `^${START_VERB}\\s+(?:${ART}\\s+)?(?:\\d+ minute |25 minute |twenty five minute )?${POMODORO}\\b`,
    ).test(t) ||
      re(`^(?:let's|lets)?\\s*(?:focus|study) (?:mode|session|timer)\\b`).test(
        t,
      ) ||
      re(`^${POMODORO}(?: please| na| now)?$`).test(t))
  )
    return {kind: 'launch', launch: {skill: 'pomodoro', action: 'start'}};
  if (re(`^${OPEN_VERB}\\s+(?:${ART}\\s+)?${POMODORO}\\b`).test(t))
    return {kind: 'launch', launch: {skill: 'pomodoro', action: 'open'}};

  // ── Flashcards ─────────────────────────────────────────────────────────
  if (
    re(
      `^(?:review|study|practice|drill|go over)\\s+(?:${ART}\\s+)?(?:due\\s+)?(?:${FLASHCARDS}|cards)\\b`,
    ).test(t)
  )
    return {kind: 'launch', launch: {skill: 'flashcards', action: 'review'}};
  if (
    re(`^${MAKE_VERB}\\s+(?:${ART}\\s+)?(?:\\w+\\s+){0,3}?${FLASHCARDS}`).test(
      t,
    ) ||
    re(`^(?:turn|convert)\\b.*\\binto\\s+${FLASHCARDS}`).test(t)
  ) {
    const count = countIn(t);
    const hint = materialHintIn(t);
    return {
      kind: 'launch',
      launch: {
        skill: 'flashcards',
        action: 'create',
        ...(count ? {count} : {}),
      },
      ...(hint ? {materialHint: hint} : {}),
    };
  }
  if (re(`^${OPEN_VERB}\\s+(?:${ART}\\s+)?${FLASHCARDS}`).test(t))
    return {kind: 'launch', launch: {skill: 'flashcards', action: 'open'}};

  // ── Quiz ───────────────────────────────────────────────────────────────
  if (
    /^quiz me\b/.test(t) ||
    re(`^${MAKE_VERB}\\s+(?:${ART}\\s+)?(?:\\w+\\s+){0,3}?${QUIZ}\\b`).test(
      t,
    ) ||
    re(`^(?:test me|start (?:${ART}\\s+)?${QUIZ})\\b`).test(t)
  ) {
    const count = countIn(t);
    const hint = materialHintIn(t);
    const topic = hint ? undefined : topicIn(text);
    return {
      kind: 'launch',
      launch: {
        skill: 'quiz',
        action: 'create',
        ...(count ? {count} : {}),
        ...(topic ? {topic} : {}),
      },
      ...(hint ? {materialHint: hint} : {}),
    };
  }
  if (re(`^${OPEN_VERB}\\s+(?:${ART}\\s+)?(?:${QUIZ}|quiz maker)\\b`).test(t))
    return {kind: 'launch', launch: {skill: 'quiz', action: 'open'}};

  // ── Summarizer ─────────────────────────────────────────────────────────
  if (
    /^(?:summari[sz]e|i summari[sz]e|make (?:a |me a )?summary|give me (?:a )?summary|summary of)\b/.test(
      t,
    ) &&
    !PLANNER_OBJECT.test(t) &&
    (/^(?:summari[sz]e|i summari[sz]e|make (?:a |me a )?summary|give me (?:a )?summary)(?:\s+(?:please|po|for me))?$/.test(
      t,
    ) ||
      SUMMARIZER_TARGET.test(t) ||
      Boolean(materialHintIn(t)))
  ) {
    const hint = materialHintIn(t);
    return {
      kind: 'launch',
      launch: {skill: 'summarizer', action: 'create'},
      ...(hint ? {materialHint: hint} : {}),
    };
  }
  if (re(`^${OPEN_VERB}\\s+(?:the\\s+)?summari[sz]er\\b`).test(t))
    return {kind: 'launch', launch: {skill: 'summarizer', action: 'open'}};

  // ── Lesson Q&A ─────────────────────────────────────────────────────────
  if (
    /^(?:upload|add|import)\s+(?:a |my |the |new )?(?:lesson|material|module|pdf|handout|reading)s?\b/.test(
      t,
    ) ||
    re(
      `^${OPEN_VERB}\\s+(?:my |the )?(?:lesson q ?& ?a|lesson qa|lesson q and a|lessons|materials|study materials)\\b`,
    ).test(t) ||
    /^(?:ask|question) (?:about )?(?:my )?(?:lesson|module|pdf|material|reading)s?\b/.test(
      t,
    )
  )
    return {kind: 'launch', launch: {skill: 'materials', action: 'open'}};

  // ── Create with LAFINA (documents) ─────────────────────────────────────
  if (
    !hasFutureSchedule &&
    !/\bprepare\s+for\b/.test(t) &&
    re(`^${MAKE_VERB}\\s+(?:${ART}\\s+)?(?:\\w+\\s+){0,2}?${DOC}\\b`).test(t)
  ) {
    const topic = topicIn(text);
    return {
      kind: 'launch',
      launch: {skill: 'docgen', action: 'create', ...(topic ? {topic} : {})},
    };
  }
  if (
    re(
      `^${OPEN_VERB}\\s+(?:the\\s+)?(?:document generator|docgen|create with lafina|documents)\\b`,
    ).test(t)
  )
    return {kind: 'launch', launch: {skill: 'docgen', action: 'open'}};

  // ── Meetings (opens the recorder; never records by itself) ─────────────
  if (
    !hasFutureSchedule &&
    (/^(?:record|i record|irecord)\s+(?:my |the |this |our |a )?(?:class|meeting|lecture|discussion|session|talk)\b/.test(
      t,
    ) ||
      /^start recording\b/.test(t) ||
      re(
        `^${OPEN_VERB}\\s+(?:the\\s+)?(?:meetings?|meeting recorder|recorder)\\b`,
      ).test(t))
  )
    return {kind: 'launch', launch: {skill: 'meetings', action: 'open'}};

  // ── GWA ────────────────────────────────────────────────────────────────
  if (
    /^(?:compute|calculate|solve|open|check|update)\s+(?:my |the )?(?:gwa|general weighted average|grades?|grade calculator)\b/.test(
      t,
    )
  )
    return {kind: 'launch', launch: {skill: 'gwa', action: 'open'}};

  // ── The Skills tab and its essentials ──────────────────────────────────
  const TAB_OPEN_VERB = '(?:open|go to|take me to|bring up|pull up|buksan)';
  if (
    re(
      `^${OPEN_VERB}\\s+(?:the\\s+|my\\s+)?(?:skills?(?: tab| page)?|study tools)$`,
    ).test(t)
  )
    return {kind: 'launch', launch: {skill: 'hub', action: 'open'}};
  if (
    re(
      `^${TAB_OPEN_VERB}\\s+(?:the\\s+|my\\s+)?alarms?(?: tab| page| list)?$`,
    ).test(t)
  )
    return {kind: 'launch', launch: {skill: 'alarms', action: 'open'}};
  if (
    re(
      `^${TAB_OPEN_VERB}\\s+(?:the\\s+|my\\s+)?to ?do(?: list)?s?(?: tab| page)?$`,
    ).test(t)
  )
    return {kind: 'launch', launch: {skill: 'todo', action: 'open'}};
  if (
    re(`^${TAB_OPEN_VERB}\\s+(?:the\\s+|my\\s+)?notes?(?: tab| page)?$`).test(t)
  )
    return {kind: 'launch', launch: {skill: 'notes', action: 'open'}};

  return null;
};
