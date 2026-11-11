/**
 * On-device small talk for lafina. Offline it is the whole conversation;
 * online it is only the honest stand-in when DeepSeek cannot reply.
 *
 * Replies are varied (time of day, the student's first name, a glance at
 * today's plan) and never repeat the reply lafina just gave. Nothing here
 * writes data or reaches the network.
 */
import {plannerQueries} from '../storage/plannerQueries';
import {userStore} from '../storage/userStore';
import {GUEST_USERNAME} from '../constants';

export type SmallTalkKind =
  | 'greeting'
  | 'how_are_you'
  | 'identity'
  | 'creator'
  | 'capabilities'
  | 'thanks'
  | 'farewell'
  | 'acknowledgement';

/** Short social messages only; a real question that merely starts with "hi" is not small talk. */
const SHORT = 48;

const PATTERNS: Array<[SmallTalkKind, RegExp, boolean]> = [
  // [kind, pattern, short-only]
  [
    'how_are_you',
    /\b(?:how\s+(?:are|r)\s+(?:you|u|ya)|how(?:'?s|\s+is)\s+(?:it\s+going|your\s+day|everything|life)|how\s+(?:are|have)\s+things|how\s+(?:have|'?ve)\s+you\s+been|kumusta|musta|how\s+do\s+you\s+do)\b/i,
    false,
  ],
  [
    'creator',
    /\bwho\s+(?:made|created|built|developed|designed)\s+(?:you|u|lafina)\b/i,
    false,
  ],
  [
    'identity',
    /\b(?:(?:what|who)\s+(?:are|r|is)\s+(?:you|u|lafina)|what(?:'?s|\s+is)\s+your\s+name|tell\s+me\s+about\s+(?:yourself|lafina)|are\s+you\s+(?:an?\s+)?(?:ai|bot|robot|human|real|person|assistant|chatgpt)|introduce\s+yourself)\b/i,
    false,
  ],
  [
    'capabilities',
    /\b(?:what\s+can\s+(?:you|u)\s+do|how\s+(?:do|can)\s+(?:you|u)\s+help|what\s+do\s+(?:you|u)\s+do|what\s+are\s+your\s+(?:features|skills)|^help(?:\s+me)?[.!?]*$)/i,
    false,
  ],
  [
    'thanks',
    /^(?:(?:ok(?:ay)?|oh)\s+)?(?:thanks?|thank\s*(?:you|u|ya)|thx|tnx|ty(?:sm)?|salamat|appreciate\s+it|much\s+appreciated)\b/i,
    true,
  ],
  [
    'farewell',
    /^(?:bye|byee*|good\s*bye|good\s+night|goodnight|nighty?\s+night|night|see\s+(?:you|ya)|later|talk\s+later|gtg|gotta\s+go|i(?:'?m|\s+am)\s+(?:off|going)|ttyl)\b/i,
    true,
  ],
  [
    'greeting',
    /^(?:hey+|hi+|hii+|hello+|helo|hallo|yo|hiya|howdy|heya|good\s+(?:morning|afternoon|evening|day)|morning|evening|sup|wh?at'?s\s+up|wassup|musta|kumusta)\b/i,
    true,
  ],
  [
    'acknowledgement',
    /^(?:ok(?:ay)?|k+|got\s+it|cool|alright|all\s+right|noted|sure|nice|great|awesome|perfect|sounds\s+good|i\s+see)[\s.!]*$/i,
    true,
  ],
];

export const classifySmallTalk = (text: string): SmallTalkKind | null => {
  const value = text.trim().replace(/\s+/g, ' ');
  if (!value) return null;
  for (const [kind, pattern, shortOnly] of PATTERNS) {
    if (shortOnly && value.length > SHORT) continue;
    if (pattern.test(value)) return kind;
  }
  return null;
};

export interface LocalReplyOptions {
  now?: Date;
  /** 0 <= n < 1; injectable for tests. */
  random?: () => number;
  /** Recent assistant replies, newest last; the next reply avoids them. */
  recentReplies?: readonly string[];
  /** True while Online Mode is on but DeepSeek could not be reached. */
  onlineUnavailable?: boolean;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const localDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const firstName = (userId: string): string | null => {
  if (!userId) return null;
  try {
    const raw = userStore.getUserById(userId)?.username?.trim();
    if (!raw || raw === GUEST_USERNAME || raw.includes('@')) return null;
    const first = raw.split(/[\s._-]+/)[0];
    if (!first || !/^[\p{L}][\p{L}'-]{0,23}$/u.test(first)) return null;
    return first.charAt(0).toUpperCase() + first.slice(1);
  } catch {
    return null;
  }
};

/** 12-hour time, as the rest of the app shows it. */
const formatTime = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(m)} ${suffix}`;
};

interface DayGlance {
  remaining: number;
  next: {title: string; time: string | null} | null;
}

/** What is still ahead today. A storage failure just means "no glance". */
const glanceToday = (userId: string, now: Date): DayGlance | null => {
  try {
    const today = localDate(now);
    const nowHm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const day = plannerQueries.window(userId, today, today);
    const items: Array<{title: string; time: string | null}> = [
      ...day.events
        .filter(e => e.date === today && (!e.startTime || e.startTime >= nowHm))
        .map(e => ({title: e.title, time: e.startTime || null})),
      ...day.blocks
        .filter(b => b.date === today && (!b.startTime || b.startTime >= nowHm))
        .map(b => ({title: b.title, time: b.startTime || null})),
      ...day.tasks
        .filter(
          t =>
            t.dueDate === today &&
            !t.isCompleted &&
            (!t.dueTime || t.dueTime >= nowHm),
        )
        .map(t => ({title: t.title, time: t.dueTime || null})),
    ].filter(item => typeof item.title === 'string' && item.title.trim());
    items.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
    return {remaining: items.length, next: items[0] ?? null};
  } catch {
    return null;
  }
};

const timeOfDay = (
  now: Date,
): 'morning' | 'afternoon' | 'evening' | 'night' => {
  const h = now.getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return h < 22 ? 'evening' : 'night';
};

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Picks a template the student did not just see (recent replies may contain it). */
const pick = (
  options: readonly string[],
  recent: readonly string[],
  random: () => number,
): string => {
  const seen = recent.slice(-3).map(normalize);
  const fresh = options.filter(o => {
    const option = normalize(o);
    return !seen.some(reply => reply.includes(option));
  });
  const pool = fresh.length ? fresh : options;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
};

const glanceLine = (
  glance: DayGlance | null,
  tod: string,
  random: () => number,
): string => {
  if (!glance) return '';
  if (glance.remaining === 0) {
    // An empty day is worth saying sometimes, not on every hello.
    if (random() < 0.5) return '';
    return tod === 'evening' || tod === 'night'
      ? ' Nothing else is on your plan for today.'
      : ' Your plan for today is clear so far.';
  }
  const next = glance.next;
  const when = next?.time ? ` at ${formatTime(next.time)}` : '';
  const what = next ? `"${next.title.trim().slice(0, 60)}"${when}` : '';
  return glance.remaining === 1
    ? ` You have one thing left today: ${what}.`
    : ` You have ${glance.remaining} things left today, starting with ${what}.`;
};

const OFFLINE_EXAMPLES = [
  '"remind me to submit my lab report at 5 PM"',
  '"block 2 hours for thesis writing tomorrow morning"',
  '"show my schedule for tomorrow"',
  '"add a task to review chapter 4 on Friday"',
  '"note: ask the prof about the quiz coverage"',
];

/**
 * A human, varied on-device reply for small talk, or for anything else lafina
 * cannot answer without DeepSeek.
 */
export const buildLocalConversationReply = (
  userId: string,
  text: string,
  options: LocalReplyOptions = {},
): string => {
  const now = options.now ?? new Date();
  const random = options.random ?? Math.random;
  const recent = options.recentReplies ?? [];
  const name = firstName(userId);
  const tod = timeOfDay(now);
  const hey = name ? `, ${name}` : '';
  const example = pick(OFFLINE_EXAMPLES, [], random);
  const kind = classifySmallTalk(text);

  switch (kind) {
    case 'greeting': {
      const opener =
        tod === 'night'
          ? pick(
              [
                `Hey${hey}! Up late?`,
                `Hi${hey}, still awake?`,
                `Hey${hey}! Burning the midnight oil?`,
              ],
              recent,
              random,
            )
          : pick(
              [
                `Good ${tod}${hey}!`,
                `Hey${hey}!`,
                `Hi${hey}! Good to see you.`,
                `Hello${hey}!`,
                `Hey there${hey}!`,
              ],
              recent,
              random,
            );
      const close = pick(
        [
          ' What can I help you with?',
          ' What are we working on?',
          ' Need help planning something?',
          ' What is on your mind?',
        ],
        [],
        random,
      );
      return `${opener}${glanceLine(
        glanceToday(userId, now),
        tod,
        random,
      )}${close}`;
    }
    case 'how_are_you': {
      return pick(
        [
          `I am doing well, thanks for asking${hey}! How about you?`,
          `Pretty good${hey}! Ready to help you stay on top of things. How are you holding up?`,
          `All good on my side${hey}. How is your ${
            tod === 'night' ? 'night' : 'day'
          } going?`,
          `Doing great, thanks! What about you${hey}, busy ${
            tod === 'night' ? 'night' : 'day'
          }?`,
        ],
        recent,
        random,
      );
    }
    case 'identity':
      return pick(
        [
          `I'm lafina, your academic secretary${hey}. I keep track of your classes, tasks, reminders and notes, and I can call you when something is due.`,
          `I'm lafina! Think of me as a study buddy who never forgets a deadline. I plan your schedule, set reminders and keep your notes in one place.`,
          `lafina here, your personal assistant for school. I help you plan study time, remember deadlines and organize notes, even without internet.`,
        ],
        recent,
        random,
      );
    case 'creator':
      return pick(
        [
          'I was built by the lafina team as a capstone project to help students stay organized.',
          'A team of student developers made me for their capstone, so I am here to help students like you keep up with school.',
        ],
        recent,
        random,
      );
    case 'capabilities':
      return pick(
        [
          `I can plan study blocks, set reminders that ring like a call, track tasks and keep notes. Try saying ${example}.`,
          `Quite a lot! I handle your schedule, reminders, tasks and notes. For example: ${example}.`,
          `I am best at keeping your school life organized: schedules, deadlines, reminders and notes. You could try ${example}.`,
        ],
        recent,
        random,
      );
    case 'thanks':
      return pick(
        [
          `You're welcome${hey}!`,
          'Anytime! Let me know if you need anything else.',
          `Happy to help${hey}.`,
          'No problem! I am here whenever you need me.',
          'Of course! Good luck with everything.',
        ],
        recent,
        random,
      );
    case 'farewell':
      return pick(
        tod === 'night' || tod === 'evening'
          ? [
              `Good night${hey}! Rest well.`,
              'Sleep well! I will keep an eye on your reminders.',
              `Night${hey}! Talk tomorrow.`,
            ]
          : [
              `See you later${hey}!`,
              'Bye for now! I will keep your reminders running.',
              `Take care${hey}! Good luck today.`,
            ],
        recent,
        random,
      );
    case 'acknowledgement':
      return pick(
        [
          'Got it!',
          'Alright! Anything else?',
          'Okay! I am here if you need me.',
          'Sounds good.',
        ],
        recent,
        random,
      );
    default:
      if (options.onlineUnavailable) {
        return pick(
          [
            'I could not reach DeepSeek just now, so I cannot answer that one yet. Try sending it again in a moment.',
            'DeepSeek is not responding right now, so I cannot answer that yet. Please try again shortly.',
          ],
          recent,
          random,
        );
      }
      return pick(
        [
          `I can't answer general questions offline. Turn on Online Mode and I will ask DeepSeek for you. Offline, I can still help you plan, like ${example}.`,
          `That one needs Online Mode, where DeepSeek can answer it. While offline, I am great with schedules and reminders. Try ${example}.`,
          `I would need Online Mode to answer that properly. In the meantime I can handle your planning, for example ${example}.`,
        ],
        recent,
        random,
      );
  }
};

/** Shown under an on-device reply when Online Mode is on but DeepSeek failed. */
export const OFFLINE_REPLY_NOTE =
  '(Offline reply: DeepSeek is not available right now.)';

/** Same, when the cloud sign-in ended: renewing failed, so say how to fix it. */
export const SIGNED_OUT_REPLY_NOTE =
  '(Offline reply: sign in again in Profile to use DeepSeek and the online voice.)';
