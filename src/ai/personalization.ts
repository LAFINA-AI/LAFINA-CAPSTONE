import {studentSetupStore} from '../storage/studentSetupStore';
import type {MainGoal} from '../storage/studentSetupStore';
import {isUstpSchoolEnabled} from '../storage/ustpEligibility';

/**
 * Consumers for the onboarding personalization answers (onboarding
 * redesign). Only explicit choices are applied: a skipped or default value
 * is unknown, not a confirmed preference.
 */

const LENGTH_TEXT = {
  short: 'keep answers short and direct, essentials first',
  balanced: 'give a clear answer with some helpful context',
  detailed: 'explain step by step when a topic needs it',
} as const;

/**
 * A short reply-settings note for online AI replies. Tone and answer length
 * are settings the student chose (Profile can change them); they are sent
 * whether or not conversational memory is on, and contain no personal facts.
 */
export const replyPreferenceInstruction = (userId: string): string => {
  const setup = studentSetupStore.get(userId);
  const parts: string[] = [];
  if (setup.tone && setup.explicit.includes('tone')) {
    parts.push(`use a ${setup.tone} tone`);
  }
  if (setup.responseStyle && setup.explicit.includes('response')) {
    parts.push(LENGTH_TEXT[setup.responseStyle]);
  }
  return parts.length
    ? `[Reply settings chosen by the student (formatting preference only): ${parts.join(
        '; ',
      )}.]`
    : '';
};

/** The goal, never a handbook goal unless school features are on. */
export const effectiveGoal = (userId: string): MainGoal | null => {
  const goal = studentSetupStore.get(userId).goal;
  if (goal === 'handbook' && !isUstpSchoolEnabled(userId)) return null;
  return goal;
};

const SCHEDULING_PROMPTS: Record<
  'deadlines' | 'schedule' | 'default',
  string[]
> = {
  deadlines: [
    'Remind me about my assignment tomorrow at 6 PM',
    'What tasks are due this week?',
    "What's overdue?",
  ],
  schedule: [
    "What's on my schedule today?",
    'When am I free tomorrow?',
    'Block 2 to 4 PM tomorrow for focused work',
  ],
  default: [
    "What's on my schedule today?",
    'Remind me about my assignment tomorrow at 6 PM',
    'When am I free tomorrow?',
  ],
};

/** Starter prompts for the assistant, ordered by the chosen goal. */
export const goalStarterPrompts = (userId: string): string[] => {
  const goal = effectiveGoal(userId);
  if (goal === 'deadlines') return SCHEDULING_PROMPTS.deadlines;
  if (goal === 'schedule') return SCHEDULING_PROMPTS.schedule;
  return SCHEDULING_PROMPTS.default;
};
