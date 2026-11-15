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
  /** "daily", "weekdays" or "weekly:mo,we" (new items only). */
  repeat?: string;
}

/** The `repeat` field as the RRULE subset the planner stores (audit 2, B7). */
export const repeatToRule = (repeat: string | undefined): string | null => {
  const value = (repeat || '').trim().toLowerCase();
  if (value === 'daily') return 'RRULE:FREQ=DAILY';
  if (value === 'weekdays') return 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  const weekly =
    /^weekly:((?:mo|tu|we|th|fr|sa|su)(?:,(?:mo|tu|we|th|fr|sa|su)){0,6})$/.exec(
      value,
    );
  if (!weekly) return null;
  const days = Array.from(new Set(weekly[1].split(',')));
  return `RRULE:FREQ=WEEKLY;BYDAY=${days.join(',').toUpperCase()}`;
};

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

/** Words that only make sense with the conversation before them. */
const POINTER_RE =
  /\b(?:first|second|third|last|that|this|it|those|these|one|option|yung|iyon|yun|yan|una|pangalawa|ikalawa|huli)\b/i;

const CHANGES_EXISTING = new Set([
  'update_task',
  'update_time_block',
  'update_note',
  'reschedule',
]);

/**
 * True when a planner request read from the student's words only points back
 * at the conversation ("book the first one", "move it to 4pm"), so the words
 * alone can't say what to change (audit 2, B2). Deletion is never included:
 * it keeps the device's own clarify card.
 */
export const isReferenceRequest = (
  intent: Pick<ValidatedIntent, 'intent' | 'title' | 'targetTitle'>,
  text: string,
): boolean => {
  if (intent.intent.startsWith('create_')) {
    return intent.title?.trim()
      ? isReferenceTitle(intent.title)
      : POINTER_RE.test(text);
  }
  if (CHANGES_EXISTING.has(intent.intent)) {
    return (
      isReferenceTitle(intent.targetTitle ?? intent.title) &&
      POINTER_RE.test(text)
    );
  }
  return false;
};

/** A short reply that points at something said before ("yung una na lang"). */
export const isShortReferenceFollowUp = (text: string): boolean =>
  text.trim().split(/\s+/).length <= 8 && POINTER_RE.test(text);

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
  const recurrenceRule = existing ? null : repeatToRule(args.repeat);
  return {
    ...intent,
    ...(deliveryStyle ? {deliveryStyle} : {}),
    ...(recurrenceRule ? {recurrenceRule} : {}),
  };
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
