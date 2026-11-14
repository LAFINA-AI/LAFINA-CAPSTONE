import {parseIntentFastPath} from './fastPathParser';
import {validateIntent} from './types';
import type {ValidatedIntent} from './types';

type GroundedDraft =
  | {kind: 'ready'; intent: ValidatedIntent}
  | {kind: 'clarify'; reply: string};

export const isVoiceScheduleStart = (turn: string): boolean =>
  /\b(?:add|put|create|schedule|plan|set|make|remind|book|block)\b/i.test(
    turn,
  ) &&
  ['create_task', 'create_time_block', 'create_reminder'].includes(
    parseIntentFastPath(turn).intent,
  );

/** Build a draft only from finalized student turns, never provider tool arguments. */
export const groundedVoiceDraft = (
  turns: readonly string[],
  referenceDate: Date,
): GroundedDraft => {
  const recent = turns.slice(-8).map(turn => turn.trim().slice(0, 500));
  let start = -1;
  for (let i = 0; i < recent.length; i += 1) {
    if (isVoiceScheduleStart(recent[i])) start = i;
  }
  if (start < 0)
    return {
      kind: 'clarify',
      reply: 'Please tell me what you want to schedule. Nothing was changed.',
    };
  const text = recent.slice(start).join(' ');
  const intent = validateIntent(parseIntentFastPath(text, referenceDate));
  if (
    !['create_task', 'create_time_block', 'create_reminder'].includes(
      intent.intent,
    )
  ) {
    return {
      kind: 'clarify',
      reply: 'Please repeat the scheduling request. Nothing was changed.',
    };
  }
  if (
    !intent.isValid ||
    !intent.title ||
    /^(?:new\s+)?(?:task|time\s*block|event|reminder)$/i.test(
      intent.title.trim(),
    )
  )
    return {
      kind: 'clarify',
      reply: 'What should I call it? Nothing was changed.',
    };
  // A time without a date is fine: the review card schedules it today, or
  // tomorrow if that time has passed, and says so (audit finding 6).
  if (intent.intent !== 'create_task' && !intent.date && !intent.time)
    return {
      kind: 'clarify',
      reply: 'What date and time should I use? Nothing was changed.',
    };
  if (intent.intent !== 'create_task' && !intent.time)
    return {
      kind: 'clarify',
      reply: 'What time should I use? Nothing was changed.',
    };
  return {kind: 'ready', intent};
};
