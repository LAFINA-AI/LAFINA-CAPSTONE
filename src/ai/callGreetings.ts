/**
 * Call Lafina's opening line. It changes with the student's conversational
 * tone (Preferences: Default, Casual, Professional), the time of day and
 * their name, and never repeats the previous call's line back to back.
 *
 * Offline lines also say she is offline, so the student knows what she can
 * do. Online lines are sent to the voice agent as its first message only
 * when the server allows it (see `VoiceCapabilities.openingLine`).
 */
import {studentSetupStore} from '../storage/studentSetupStore';
import {studentFirstName} from './localConversation';

export type GreetingTone = 'default' | 'casual' | 'professional';
export type GreetingMode = 'online' | 'offline';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'late';

interface GreetingContext {
  /** " Ana" or "" — after a word, no comma ("Hi Ana!"). */
  n: string;
  /** ", Ana" or "" — after a phrase ("Good morning, Ana."). */
  cn: string;
  tod: TimeOfDay;
}

interface Greeting {
  line: (ctx: GreetingContext) => string;
  /** Only at these times of day; any time when absent. */
  when?: readonly TimeOfDay[];
}

const greetingWord = (tod: TimeOfDay): string =>
  tod === 'morning'
    ? 'Good morning'
    : tod === 'afternoon'
    ? 'Good afternoon'
    : 'Good evening';

const DAYTIME: readonly TimeOfDay[] = ['morning', 'afternoon', 'evening'];

const ONLINE: Record<GreetingTone, readonly Greeting[]> = {
  default: [
    {line: ({n}) => `Hi${n}, Lafina here. What's on your mind?`},
    {line: ({n}) => `Hi${n}! What can I help you with?`},
    {line: ({n}) => `Hey${n}! What do you need today?`},
    {line: ({n}) => `Hi${n}, I'm listening. What should we work on?`},
    {line: ({n}) => `Hello${n}! Want to plan something or check what's next?`},
    {
      line: ({cn, tod}) => `${greetingWord(tod)}${cn}! What can I do for you?`,
      when: DAYTIME,
    },
    {
      line: ({n}) => `Hi${n}, working late? What do you need?`,
      when: ['late'],
    },
  ],
  casual: [
    {line: ({n}) => `Hey${n}! What's up?`},
    {line: ({n}) => `Hey${n}! What's the plan?`},
    {line: ({n}) => `Oh hey${n}! Need a hand with something?`},
    {line: ({n}) => `Hi${n}! What are we tackling today?`},
    {line: ({n}) => `Hey${n}, Lafina here. What's going on?`},
    {line: ({n}) => `Hey${n}! What's on your plate?`},
    {line: ({cn}) => `Morning${cn}! What's first today?`, when: ['morning']},
    {
      line: ({n}) => `Hey${n}! How's the afternoon going? What do you need?`,
      when: ['afternoon'],
    },
    {line: ({cn}) => `Still up${cn}? What do you need?`, when: ['late']},
  ],
  professional: [
    {line: ({cn}) => `Hello${cn}. How can I help you today?`},
    {line: ({cn}) => `Hello${cn}, this is Lafina. How may I assist you?`},
    {line: ({cn}) => `Hello${cn}. What would you like to work on?`},
    {
      line: ({cn, tod}) =>
        `${greetingWord(tod)}${cn}. How can I help you today?`,
      when: DAYTIME,
    },
    {
      line: ({cn, tod}) =>
        `${greetingWord(tod)}${cn}. What would you like to schedule or review?`,
      when: DAYTIME,
    },
    {
      line: ({cn}) => `Good evening${cn}. How can I help you this late?`,
      when: ['late'],
    },
  ],
};

const OFFLINE: Record<GreetingTone, readonly Greeting[]> = {
  default: [
    {
      line: ({n}) =>
        `Hi${n}, Lafina here. I'm working offline. What do you want to plan?`,
    },
    {
      line: ({n}) =>
        `Hi${n}! I'm offline right now, but I can still handle your planner. What do you need?`,
    },
    {
      line: ({n}) =>
        `Hello${n}. We're offline, but I can add tasks, reminders and events. What should I do?`,
    },
    {
      line: ({n}) =>
        `Hey${n}, Lafina here, working offline. Want to plan something or check what's coming up?`,
    },
    {
      line: ({cn, tod}) =>
        `${greetingWord(
          tod,
        )}${cn}. I'm offline, but your schedule is right here. What do you need?`,
      when: DAYTIME,
    },
  ],
  casual: [
    {
      line: ({n}) =>
        `Hey${n}! No internet, but I can still sort your planner. What's up?`,
    },
    {
      line: ({n}) =>
        `Hey${n}, I'm offline for now. Want to add something or check what's next?`,
    },
    {
      line: ({n}) =>
        `Hi${n}! Offline mode, but I've got your schedule. What do you need?`,
    },
    {
      line: ({n}) => `Hey${n}! I'm running offline. What are we planning?`,
    },
    {
      line: ({cn}) =>
        `Morning${cn}! I'm offline, but I can still help. What's first today?`,
      when: ['morning'],
    },
    {
      line: ({cn}) =>
        `Still up${cn}? I'm offline, but I can still help with your planner. What do you need?`,
      when: ['late'],
    },
  ],
  professional: [
    {
      line: ({cn}) =>
        `Hello${cn}. I'm working offline. I can manage your planner and reminders. How can I help?`,
    },
    {
      line: ({cn}) =>
        `Hello${cn}, this is Lafina. I'm offline at the moment, but your schedule is available. What would you like to do?`,
    },
    {
      line: ({cn}) =>
        `Hello${cn}. I'm offline, but I can still add tasks, events and reminders. What do you need?`,
    },
    {
      line: ({cn}) =>
        `Good evening${cn}. I'm working offline. How can I help you this late?`,
      when: ['late'],
    },
    {
      line: ({cn, tod}) =>
        `${greetingWord(
          tod,
        )}${cn}. I'm working offline. What would you like to schedule or review?`,
      when: DAYTIME,
    },
  ],
};

export const timeOfDay = (date: Date): TimeOfDay => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'late';
};

/** The last line per mode, so two calls in a row open differently. */
const lastLine = new Map<GreetingMode, string>();

export interface PickGreetingInput {
  mode: GreetingMode;
  tone?: GreetingTone | null;
  name?: string | null;
  now?: Date;
  /** 0 ≤ value < 1; Math.random by default. */
  random?: () => number;
}

/** Every line this tone and time of day can open with (tests, previews). */
export const greetingOptions = (input: PickGreetingInput): string[] => {
  const tone = input.tone ?? 'default';
  const name = input.name?.trim() || '';
  const ctx: GreetingContext = {
    n: name ? ` ${name}` : '',
    cn: name ? `, ${name}` : '',
    tod: timeOfDay(input.now ?? new Date()),
  };
  const pool = (input.mode === 'offline' ? OFFLINE : ONLINE)[tone];
  return pool
    .filter(entry => !entry.when || entry.when.includes(ctx.tod))
    .map(entry => entry.line(ctx));
};

export const pickCallGreeting = (input: PickGreetingInput): string => {
  const options = greetingOptions(input);
  const previous = lastLine.get(input.mode);
  const fresh =
    options.length > 1 ? options.filter(line => line !== previous) : options;
  const random = input.random ?? Math.random;
  const index = Math.min(
    fresh.length - 1,
    Math.max(0, Math.floor(random() * fresh.length)),
  );
  const line = fresh[index];
  lastLine.set(input.mode, line);
  return line;
};

/** The student's chosen tone; "Default" when none was picked. */
export const greetingToneFor = (userId: string): GreetingTone => {
  try {
    const tone = studentSetupStore.get(userId).tone;
    return tone === 'casual' || tone === 'professional' ? tone : 'default';
  } catch {
    return 'default';
  }
};

/** This account's opening line for a call starting now. */
export const callGreetingFor = (userId: string, mode: GreetingMode): string =>
  pickCallGreeting({
    mode,
    tone: greetingToneFor(userId),
    name: studentFirstName(userId),
  });

/** Test helper: forget the previous lines. */
export const resetCallGreetingHistory = (): void => lastLine.clear();
