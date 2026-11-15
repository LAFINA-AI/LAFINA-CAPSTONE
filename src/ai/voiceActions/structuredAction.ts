/**
 * Agent tool arguments → planner intents (agent capability follow-up, ADR-033).
 *
 * The device still reads the student's own words first. These helpers are the
 * fallback for details that came from the conversation instead ("book the
 * first free slot"): the model's fields become a review card that the student
 * must confirm themselves. Deletion is never accepted from fields.
 */

import {answerPlannerLookup} from '../nlu/actionExecutor';
import {prepareReviewedCommand} from '../nlu/commandReview';
import type {PrepareResult, ReviewSurface} from '../nlu/commandReview';
import {formatLocalDate} from '../nlu/fastPathParser';
import type {ValidatedIntent} from '../nlu/types';
import {parseExtractedIntentObject} from '../onlineIntentExtractor';
import {STRUCTURED_ACTIONS} from './actionRegistry';

export interface StructuredActionArgs {
  request?: string;
  action?: string;
  title?: string;
  date?: string;
  time?: string;
  endTime?: string;
  durationMinutes?: number;
  priority?: string;
  newTitle?: string;
  details?: string;
  deliveryStyle?: string;
}

/** Changes to an existing item name it by `title`. */
const TARGETS_EXISTING = new Set([
  'update_task',
  'update_time_block',
  'update_note',
  'complete_task',
  'reopen_task',
]);

/** Words that point at something instead of naming it ("the first one"). */
const REFERENCE_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'for',
  'one',
  'ones',
  'first',
  'second',
  'third',
  'last',
  'next',
  'other',
  'that',
  'this',
  'these',
  'those',
  'it',
  'them',
  'my',
  'slot',
  'slots',
  'time',
  'times',
  'window',
  'option',
  'choice',
  'book',
  'schedule',
  'please',
  'yung',
  'ang',
  'sa',
  'ng',
  'iyon',
  'yan',
  'yun',
  'ito',
  'una',
  'pangalawa',
  'ikalawa',
  'huli',
  'am',
  'pm',
]);

/**
 * True when a card read from the student's words has a title that only
 * points at something ("book the first one" reads as a task "First one").
 * Then the model's fields, which know what "the first one" was, describe the
 * card instead. A title with real content ("Review chemistry") always wins.
 */
export const isReferenceTitle = (title: string | null | undefined): boolean =>
  (title || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word && !REFERENCE_WORDS.has(word) && !/^\d/.test(word))
    .length === 0;

/** True when the model filled in an action, not only free text. */
export const hasStructuredAction = (args: StructuredActionArgs): boolean =>
  typeof args.action === 'string' && STRUCTURED_ACTIONS.includes(args.action);

/**
 * The validated intent the fields describe, or null when they don't describe
 * a complete, allowed planner change.
 */
export const intentFromToolArguments = (
  args: StructuredActionArgs,
): ValidatedIntent | null => {
  if (!hasStructuredAction(args)) return null;
  const action = args.action as string;
  const title = args.title?.trim() || null;
  const existing = TARGETS_EXISTING.has(action);
  const intent = parseExtractedIntentObject(
    {
      intent: action,
      title: existing ? null : title,
      targetTitle: existing ? title : null,
      newTitle: args.newTitle ?? null,
      date: args.date ?? null,
      time: args.time ?? null,
      endTime: args.endTime ?? null,
      durationMinutes: args.durationMinutes ?? null,
      priority: args.priority ?? null,
      details: args.details ?? null,
      ...(action === 'update_task' ||
      action === 'complete_task' ||
      action === 'reopen_task'
        ? {targetEntityType: 'task'}
        : action === 'update_note'
        ? {targetEntityType: 'note'}
        : {}),
    },
    (args.request || title || action).trim(),
  );
  if (!intent || intent.intent === 'chat') return null;
  if (intent.intent.startsWith('delete_')) return null;
  // A change to an existing item must say which one.
  if (existing && !intent.targetTitle) return null;
  const deliveryStyle =
    args.deliveryStyle === 'notify' || args.deliveryStyle === 'call'
      ? args.deliveryStyle
      : null;
  return deliveryStyle ? {...intent, deliveryStyle} : intent;
};

/**
 * A review card built from the model's fields. Always a card, never an
 * immediate change, even for a low-risk edit, because the words were not the
 * student's. Null when the fields don't describe an allowed change.
 */
export const prepareStructuredReview = (
  userId: string,
  args: StructuredActionArgs,
  surface: ReviewSurface,
  referenceDate: Date = new Date(),
): PrepareResult | null => {
  const intent = intentFromToolArguments(args);
  if (!intent) return null;
  return prepareReviewedCommand(userId, intent, {referenceDate, surface});
};

/** What the agent is told when a card it described is on screen. */
export const SUGGESTED_CARD_NOTE =
  'The card was prepared from our conversation, so the student must confirm it themselves (by saying yes or tapping Confirm). Do not call confirm_draft for it.';

/** Free windows on one day, answered from the local calendar. Read-only. */
export const answerFreeTime = (
  userId: string,
  args: {date?: string; durationMinutes?: number},
  referenceDate: Date = new Date(),
): string => {
  const intent: ValidatedIntent = {
    intent: 'query_schedule',
    title: null,
    date: args.date || formatLocalDate(referenceDate),
    time: null,
    endTime: null,
    durationMinutes: args.durationMinutes ?? 60,
    category: 'Academic',
    details: 'free_slots',
    snoozeMinutes: null,
    confidence: 1,
    source: 'cloud',
    rawTranscript: 'find free time',
    isValid: true,
  };
  const reply = answerPlannerLookup(userId, intent, referenceDate);
  // The on-device answer ends with a "Say …" hint meant for Chat; the agent
  // gets only the facts.
  return reply.replace(/\n\nSay "[\s\S]*$/, '');
};
