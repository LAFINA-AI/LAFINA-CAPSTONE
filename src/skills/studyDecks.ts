import {readSkillState, writeSkillState} from './skillsState';
import type {Deck} from './studyLogic';

const MAX_QUIZ_SOURCE_CHARS = 12000;
const deckListeners = new Map<string, Set<() => void>>();

function notifyDeckListeners(userId: string): void {
  const listeners = deckListeners.get(userId);
  if (!listeners) return;
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

/** Reads persisted flashcard decks for an owner, guarding against non-array data. */
export function readDecks(userId: string): Deck[] {
  const raw = readSkillState<unknown>(userId, 'decks', []);
  return Array.isArray(raw) ? (raw as Deck[]) : [];
}

/** Performs an atomic read-modify-write against persisted decks and notifies subscribers. */
export function mutateDecks(
  userId: string,
  updater: (latest: Deck[]) => Deck[],
): Deck[] {
  const latest = readDecks(userId);
  const next = updater(latest);
  writeSkillState(userId, 'decks', next);
  notifyDeckListeners(userId);
  return next;
}

/** Prepends a newly created deck so recent decks appear first without overwriting concurrent writes. */
export function addDeck(userId: string, deck: Deck): Deck[] {
  return mutateDecks(userId, latest => [deck, ...latest]);
}

/** Subscribes to deck changes for a specific owner and returns an unsubscribe callback. */
export function subscribeDecks(
  userId: string,
  listener: () => void,
): () => void {
  let set = deckListeners.get(userId);
  if (!set) {
    set = new Set();
    deckListeners.set(userId, set);
  }
  set.add(listener);
  return () => {
    const current = deckListeners.get(userId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      deckListeners.delete(userId);
    }
  };
}

/** Formats a flashcard deck into a SkillSource for QuizSkill generation. */
export function buildQuizSourceFromDeck(deck: Deck): {
  text: string;
  label: string;
  noteId?: string;
} {
  const header = `## ${deck.title.trim() || 'Flashcards'}\n\n`;
  let text = header;
  for (let i = 0; i < deck.cards.length; i += 1) {
    const card = deck.cards[i];
    const block = `${i > 0 ? '\n\n' : ''}Q: ${card.question}\nA: ${
      card.answer
    }`;
    if (text.length + block.length > MAX_QUIZ_SOURCE_CHARS) {
      if (i === 0) {
        text = `${text}${block}`.slice(0, MAX_QUIZ_SOURCE_CHARS);
      }
      break;
    }
    text += block;
  }
  const noteIds = Array.from(
    new Set(
      deck.cards
        .map(c => c.sourceNoteId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  return {
    text: text.trim(),
    label: deck.title.trim() || 'Flashcards',
    ...(noteIds.length === 1 ? {noteId: noteIds[0]} : {}),
  };
}
