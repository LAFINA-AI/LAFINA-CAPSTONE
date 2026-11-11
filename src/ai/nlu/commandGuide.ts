import type {ParsedIntentType} from './types';

/**
 * Examples for the Chat command guide (AGY-PORT 06), adapted from the LAFINA
 * donor `plannerConversation.COMMAND_GUIDE` (blob 1e06bf35 for the sheet).
 *
 * Every command here is pinned by `__tests__/ai/agyPort06CommandGuide.test.ts`
 * against AGY's own parser (`intentService.extractIntent`) and review contract
 * (`prepareReviewedCommand`), so the guide only shows phrasings AGY really
 * understands. Choosing one fills the Chat draft; it never sends, saves or
 * confirms anything.
 */
export interface CommandGuideExample {
  readonly command: string;
  readonly explanation: string;
  /** The intent AGY's parser gives this command (asserted by tests). */
  readonly intent: ParsedIntentType;
}

export const COMMAND_GUIDE: readonly CommandGuideExample[] = Object.freeze([
  {
    command: "What's on my schedule tomorrow?",
    explanation:
      'Lists your saved tasks, events and study blocks for that day. Works offline.',
    intent: 'query_schedule',
  },
  {
    command: 'Add task Submit lab report tomorrow at 5pm',
    explanation: 'Prepares a new task. You review it and tap Confirm to save.',
    intent: 'create_task',
  },
  {
    command: 'Add study block for Physics tomorrow from 2pm to 4pm',
    explanation: 'Prepares a study block with a start and end time.',
    intent: 'create_time_block',
  },
  {
    command: 'Remind me on Friday at 9am to bring my school ID',
    explanation: 'Prepares a reminder that rings at that time.',
    intent: 'create_reminder',
  },
  {
    command: 'Take a note: questions for my thesis adviser',
    explanation: 'Prepares a note with that text.',
    intent: 'create_note',
  },
  {
    command: 'Check my notes about grocery list',
    explanation: 'Finds and reads notes from your Notes tab. Works offline.',
    intent: 'query_notes',
  },
  {
    command: 'Move my task Submit lab report to Friday at 3pm',
    explanation:
      'Prepares a change to a saved task. If several items match, LAFINA asks which one.',
    intent: 'update_task',
  },
  {
    command: 'Delete my task Submit lab report',
    explanation: 'Prepares a removal. Nothing is deleted until you confirm.',
    intent: 'delete_task',
  },
]);
