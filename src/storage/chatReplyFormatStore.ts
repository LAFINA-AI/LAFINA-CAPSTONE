import {localSettingsStore} from './localSettingsStore';

/**
 * How assistant replies are drawn in Chat and voice mode.
 * `markdown`: headings, bold, lists, tables and code are formatted.
 * `plain`: the same words with the markup symbols removed.
 * The stored reply is never changed, so switching applies to old replies too.
 */
export type ChatReplyFormat = 'markdown' | 'plain';

export const CHAT_REPLY_FORMAT_KEY = 'chat.replyFormat.v1';
export const DEFAULT_CHAT_REPLY_FORMAT: ChatReplyFormat = 'markdown';

type Listener = (userId: string, format: ChatReplyFormat) => void;
const listeners = new Set<Listener>();

export const chatReplyFormatStore = {
  read(userId: string): ChatReplyFormat {
    const raw = localSettingsStore.get(userId, CHAT_REPLY_FORMAT_KEY);
    return raw === 'plain' || raw === 'markdown' ? raw : DEFAULT_CHAT_REPLY_FORMAT;
  },

  /** Returns false when the choice could not be saved. */
  save(userId: string, format: ChatReplyFormat): boolean {
    if (!localSettingsStore.set(userId, CHAT_REPLY_FORMAT_KEY, format)) return false;
    for (const listener of listeners) listener(userId, format);
    return true;
  },

  /** Screens that are already open follow a change made in Profile. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
