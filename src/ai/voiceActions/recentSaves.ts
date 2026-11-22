/**
 * What one call has already saved, so the assistant cannot put the same item
 * back on screen as a new card (2026-11-20 device report: "save it" saved the
 * meeting, then LAFINA prepared it again and the new card warned that it
 * overlapped the meeting just saved: itself).
 */
import type {CommandProposal} from '../nlu/commandReview';
import {intentFromToolArguments} from './structuredAction';
import type {StructuredActionArgs} from './structuredAction';

/** How long a save counts as "just saved" for a repeated card. */
export const RECENT_SAVE_WINDOW_MS = 10 * 60 * 1000;

export interface SavedCard {
  /** The card's operation id (revise/cancel/confirm may still name it). */
  operationId: string;
  intent: string;
  title: string;
  date: string | null;
  time: string | null;
  endTime: string | null;
  /** The app's save receipt, said back to the assistant. */
  receipt: string;
  at: number;
}

/** "Capstone  Meeting!" and "capstone meeting" are the same title. */
export const normalizeTitle = (title: string | null | undefined): string =>
  (title || '')
    .toLowerCase()
    .replace(/[‘’'"`.,!?;:()[\]-]/g, ' ')
    .replace(/\b(?:the|a|an|my)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hhmm = (value: string | null | undefined): string | null => {
  const match = /^(\d{1,2}):(\d{2})/.exec((value || '').trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
};

/** Events and time blocks are both "something on the calendar". */
const family = (intent: string): string =>
  intent === 'create_event' || intent === 'create_time_block'
    ? 'calendar'
    : intent;

/** The record of a saved create card, or null for cards that change things. */
export const savedCardFromProposal = (
  proposal: CommandProposal,
  receipt: string,
  at: number,
): SavedCard | null => {
  if (!proposal.intent.startsWith('create_')) return null;
  const fields = proposal.draftFields;
  return {
    operationId: proposal.operationId,
    intent: proposal.intent,
    title: fields?.title || proposal.title,
    date: fields?.date ?? null,
    time: hhmm(fields?.time),
    endTime: hhmm(fields?.endTime),
    receipt,
    at,
  };
};

/**
 * The saved card these tool fields describe again, or null. A field the
 * assistant left out (no date, no end time) does not make it different; a
 * field it gave that differs does.
 */
export const findRepeatOfSaved = (
  args: StructuredActionArgs,
  saved: readonly SavedCard[],
  now: number,
): SavedCard | null => {
  if (!args.action?.startsWith('create_')) return null;
  const intent = intentFromToolArguments(args);
  if (!intent) return null;
  const title = normalizeTitle(intent.title || args.title);
  if (!title) return null;
  const time = hhmm(intent.time ?? args.time);
  const endTime = hhmm(intent.endTime ?? args.endTime);
  const date = intent.date ?? args.date ?? null;
  for (let i = saved.length - 1; i >= 0; i -= 1) {
    const item = saved[i];
    if (now - item.at > RECENT_SAVE_WINDOW_MS) continue;
    if (family(item.intent) !== family(intent.intent)) continue;
    if (normalizeTitle(item.title) !== title) continue;
    if (date && item.date && date !== item.date) continue;
    if (time && time !== item.time) continue;
    if (endTime && item.endTime && endTime !== item.endTime) continue;
    return item;
  }
  return null;
};

/** The saved card an assistant names by its old card ID, or null. */
export const savedCardById = (
  cardId: unknown,
  saved: readonly SavedCard[],
  now: number,
): SavedCard | null => {
  if (typeof cardId !== 'string' || !cardId) return null;
  return (
    saved.find(
      item =>
        item.operationId === cardId && now - item.at <= RECENT_SAVE_WINDOW_MS,
    ) ?? null
  );
};
