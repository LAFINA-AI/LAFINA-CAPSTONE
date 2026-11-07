import type {ChatMessage, ChatPage} from '../../../storage/chatStore';

/** Timestamp, then durable insertion order: the same order the store pages in. */
export const compareChatMessages = (a: ChatMessage, b: ChatMessage): number => {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return (a.sequence ?? 0) - (b.sequence ?? 0);
};

export interface MergedChatPage {
  items: ChatMessage[];
  /** True when earlier messages already on screen were kept below the new page. */
  keptEarlier: boolean;
}

/**
 * Combines a freshly read newest page with what is on screen. Earlier messages
 * the student already loaded stay, the newest reply is never duplicated, and a
 * page that holds the whole conversation replaces the list (so a clear shows).
 */
export const mergeChatPages = (
  current: ChatMessage[],
  newest: ChatPage,
): MergedChatPage => {
  if (newest.nextCursor === null || newest.items.length === 0) {
    return {items: [...newest.items], keptEarlier: false};
  }
  const first = newest.items[0];
  const pageIds = new Set(newest.items.map(item => item.id));
  // Without overlap there may be unseen messages between the two; starting
  // again from the newest page is the only way to avoid a silent gap.
  if (!current.some(item => pageIds.has(item.id))) {
    return {items: [...newest.items], keptEarlier: false};
  }
  const earlier = current.filter(
    item => !pageIds.has(item.id) && compareChatMessages(item, first) < 0,
  );
  return {
    items: [...earlier.sort(compareChatMessages), ...newest.items],
    keptEarlier: earlier.length > 0,
  };
};
