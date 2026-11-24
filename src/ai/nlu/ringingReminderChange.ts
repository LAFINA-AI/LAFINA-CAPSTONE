/**
 * Reads "move it to 7 PM", "call me back at 8", "reschedule this reminder to
 * tomorrow" said during a ringing reminder call as a change to THAT reminder.
 *
 * In a reminder call, "it", "this" and "the reminder" mean the reminder that
 * is ringing. The general parser cannot know that: it read "move it to 7 PM"
 * as "update a task called It" (nothing found), and "push it to 8 PM" or
 * "call me back at 8" as new tasks named "Push It" and "Call Me Back".
 *
 * Pure: no storage, no clock other than `now`.
 */
import {formatLocalDate, parseDateAndTime} from './fastPathParser';

export type RingingReminderChange =
  /** Ring again in this many minutes (1–120): the call ends, like a snooze. */
  | {kind: 'snooze'; minutes: number}
  /** Move the reminder; shown as a review card first. `time` null keeps its time. */
  | {kind: 'reschedule'; date: string; time: string | null}
  /** Clearly about moving this reminder, but no usable time yet: ask for it. */
  | {kind: 'ask_time'};

/** Longest call-back that is a snooze rather than a moved reminder. */
export const MAX_CALLBACK_SNOOZE_MINUTES = 120;

const LEAD_IN =
  /^(?:(?:hey|hi|okay|ok|um+|uh+|so|well|actually|yes|yeah|no|please|lafina)[,.!\s]+)*/i;

/** "call me back at 8", "remind me again at 9", "ring me later tonight". */
const CALLBACK_RE =
  /\b(?:call|ring|remind)\s+me\s+(?:back|again|later)\b|\b(?:call|ring)\s+(?:back|again)\b/i;

const MOVE_VERB =
  /\b(?:move|moving|reschedule|postpone|push|shift|delay|bump|change|set|put|make)\b/i;

/** This reminder (or the call itself), not some other item. */
const THIS_REMINDER =
  /\b(?:it|this|that|(?:the|this|my|that)\s+(?:reminder|call|alarm))\b/i;

/** Names another kind of item: that is a planner request, not this reminder. */
const OTHER_ITEM =
  /\b(?:task|todo|to-?do|event|class|block|study\s+block|note|meeting|exam|quiz|assignment)s?\b/i;

/** Creating something new is never a change to the ringing reminder. */
const CREATE_RE =
  /\b(?:add|create|new|make\s+(?:a|an)|schedule\s+(?:a|an)|another)\b/i;

/** Verbs that only mean moving something; enough to ask for a missing time. */
const STRONG_MOVE =
  /\b(?:move|reschedule|postpone|push|shift|delay|bump)\b(?!\s+on\b)/i;

const RELATIVE_LATER = /\b(?:later|from\s+now|after)\b/i;

const minutesUntil = (target: Date, now: Date): number =>
  Math.round((target.getTime() - now.getTime()) / 60000);

const atLocal = (date: string, time: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !timeMatch) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const hh = Number(timeMatch[1]);
  const mm = Number(timeMatch[2]);
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  // Reject impossible calendar dates like "2026-11-31" instead of rolling over.
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null;
  }
  return dt;
};

const isValidLocalDate = (date: string): boolean =>
  atLocal(date, '00:00') !== null;

export const parseRingingReminderChange = (
  text: string,
  now: Date = new Date(),
): RingingReminderChange | null => {
  const t = text.trim().replace(LEAD_IN, '').trim();
  if (!t) return null;
  // A question about it ("can I move it?") stays talk; "can you move it…" is a request.
  if (
    /\?$/.test(t) &&
    !/^(?:can|could|would|will)\s+you\b/i.test(t) &&
    !/^(?:can|could)\s+(?:we|i)\s+(?:move|push|reschedule|change)\b/i.test(t)
  )
    return null;
  if (
    /\b(?:don'?t|do\s+not|never)\s+(?:move|reschedule|postpone|push|shift|delay|bump|change|call|remind)\b/i.test(
      t,
    )
  )
    return null;

  const callback = CALLBACK_RE.test(t);
  const mentionsReminder = /\breminder\b/i.test(t);
  const move =
    MOVE_VERB.test(t) && THIS_REMINDER.test(t) && !/\bmove\s+on\b/i.test(t);
  if (!callback && !move) return null;
  if (!mentionsReminder && (OTHER_ITEM.test(t) || CREATE_RE.test(t)))
    return null;

  const parsed = parseDateAndTime(t, now);
  const today = formatLocalDate(now);

  let target: Date | null = null;
  let date: string | null = parsed.date;
  let time: string | null = parsed.time;
  if (date && !isValidLocalDate(date)) {
    return {kind: 'ask_time'};
  }
  if (time) {
    target = atLocal(date ?? today, time);
    if (!target) return {kind: 'ask_time'};
    // "Move it to 7" said at 8 PM means tomorrow at 7, not a time already past.
    if (!date && target.getTime() <= now.getTime()) {
      const next = new Date(target);
      next.setDate(next.getDate() + 1);
      target = next;
    }
    date = formatLocalDate(target);
  } else if (parsed.durationMinutes && RELATIVE_LATER.test(t)) {
    target = new Date(now.getTime() + parsed.durationMinutes * 60000);
    date = formatLocalDate(target);
    time = `${String(target.getHours()).padStart(2, '0')}:${String(
      target.getMinutes(),
    ).padStart(2, '0')}`;
  } else if (date) {
    // A day without a time keeps the reminder's own time; reject today or past days.
    return date <= today
      ? {kind: 'ask_time'}
      : {kind: 'reschedule', date, time: null};
  } else {
    // "Call me back later" is a plain snooze (handled before this); "move it" needs a time.
    return move && STRONG_MOVE.test(t) ? {kind: 'ask_time'} : null;
  }

  if (!target || target.getTime() <= now.getTime()) return {kind: 'ask_time'};
  const minutes = minutesUntil(target, now);
  if (callback && minutes >= 1 && minutes <= MAX_CALLBACK_SNOOZE_MINUTES)
    return {kind: 'snooze', minutes};
  return {kind: 'reschedule', date: date as string, time};
};
