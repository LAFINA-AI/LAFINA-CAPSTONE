import {DeviceEventEmitter} from 'react-native';
import {cloudClient} from './cloudClient';
import {isGuestAccount} from './entitlements';
import {chatMemoryStore} from '../storage/chatMemoryStore';
import type {ChatMemoryChanges} from '../storage/chatMemoryStore';
import {chatStore} from '../storage/chatStore';
import {db} from '../storage/database';
import type {DatabaseTransaction} from '../storage/database';
import {readSessionEpoch} from '../storage/sessionEpoch';
import {isForgetAllMemoriesRequest} from '../ai/chatMemoryCommands';

/**
 * After an online reply, asks LAFINA's server whether the exchange taught it
 * something worth remembering about the student (or something to forget), and
 * applies the answer on the phone. Runs in the background: the reply is
 * already shown and saved, and any failure here simply changes nothing.
 */

/** Emitted with {userId, messageId, changes} when a reply's memory changes are saved or undone. */
export const CHAT_MEMORY_CHANGED_EVENT = 'LAFINA_CHAT_MEMORY_CHANGED';

export interface ChatMemoryChangedEvent {
  userId: string;
  messageId: string;
  changes: ChatMemoryChanges;
}

const MAX_USER_CHARS = 3_000;
const MAX_REPLY_CHARS = 2_900;

// Set when the server answers 404/405 (a deployment without memory), so later
// replies do not keep asking. Cleared by `resetChatMemorySupport` (tests, server switch).
let extractRouteMissing = false;

export const resetChatMemorySupport = (): void => {
  extractRouteMissing = false;
};

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      )
    : [];

const emit = (event: ChatMemoryChangedEvent): void => {
  DeviceEventEmitter.emit(CHAT_MEMORY_CHANGED_EVENT, event);
};

export const chatMemoryService = {
  /** Whether a reply in this account should be checked for memories at all. */
  isActive: (userId: string): boolean =>
    !extractRouteMissing &&
    !isGuestAccount(userId) &&
    chatMemoryStore.isEnabled(userId),

  /** Explicit privacy command: works on the entire local list, even offline or with memory off. */
  forgetAll: (
    userId: string,
    sessionId: string,
    messageId: string,
    executor?: DatabaseTransaction,
  ): ChatMemoryChanges => {
    const write = (tx: DatabaseTransaction): ChatMemoryChanges => {
      if (
        chatStore.getMemoryChanges(userId, messageId, tx, sessionId) ===
        undefined
      ) {
        throw new Error('The reply is no longer available.');
      }
      const applied = chatMemoryStore.applyChanges(
        userId,
        {add: [], remove: [], clearAll: true},
        sessionId,
        tx,
      );
      if (
        applied.removed.length &&
        !chatStore.setMemoryChanges(userId, messageId, applied, tx)
      ) {
        throw new Error('The memory notice could not be saved.');
      }
      if (applied.removed.length)
        tx.afterCommit?.(() => emit({userId, messageId, changes: applied}));
      return applied;
    };
    return executor ? write(executor) : db.transactionSync(write);
  },

  afterExchange: async (exchange: {
    userId: string;
    sessionId: string;
    assistantMessageId: string;
    userText: string;
    replyText: string;
    memoryRevision?: string;
  }): Promise<ChatMemoryChanges | null> => {
    const {userId, sessionId, assistantMessageId} = exchange;
    try {
      if (isForgetAllMemoriesRequest(exchange.userText)) {
        return chatMemoryService.forgetAll(
          userId,
          sessionId,
          assistantMessageId,
        );
      }
      if (!chatMemoryService.isActive(userId)) return null;
      const revision =
        exchange.memoryRevision ?? chatMemoryStore.revision(userId);
      const epoch = readSessionEpoch();
      if (epoch && epoch.userId !== userId) return null;
      if (
        revision !== chatMemoryStore.revision(userId) ||
        chatStore.getMemoryChanges(
          userId,
          assistantMessageId,
          db,
          sessionId,
        ) !== null
      )
        return null;
      const result = await cloudClient.request<{
        add?: unknown;
        remove?: unknown;
      }>(
        '/v1/ai/memory/extract',
        {
          method: 'POST',
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: exchange.userText.slice(0, MAX_USER_CHARS),
              },
              {
                role: 'assistant',
                content: exchange.replyText.slice(0, MAX_REPLY_CHARS),
              },
            ],
            memories: chatMemoryStore.forPrompt(userId),
          }),
        },
        true,
      );
      if (result.status !== 'success' || !result.data) {
        if (result.httpStatus === 404 || result.httpStatus === 405)
          extractRouteMissing = true;
        return null;
      }
      const add = strings(result.data.add);
      const remove = strings(result.data.remove);
      const changes = db.transactionSync(tx => {
        // A clear, edit, toggle, Undo, account switch or deleted reply retires this result.
        if (
          (!add.length && !remove.length) ||
          !chatMemoryStore.isEnabled(userId, tx) ||
          chatMemoryStore.revision(userId, tx) !== revision ||
          readSessionEpoch(tx)?.epoch !== epoch?.epoch ||
          chatStore.getMemoryChanges(
            userId,
            assistantMessageId,
            tx,
            sessionId,
          ) !== null
        )
          return null;
        const applied = chatMemoryStore.applyChanges(
          userId,
          {add, remove},
          sessionId,
          tx,
        );
        if (!applied.added.length && !applied.removed.length) return null;
        if (
          !chatStore.setMemoryChanges(userId, assistantMessageId, applied, tx)
        ) {
          throw new Error('The memory notice could not be saved.');
        }
        return applied;
      });
      if (changes) emit({userId, messageId: assistantMessageId, changes});
      return changes;
    } catch (error) {
      console.warn('[ChatMemory] Memory update skipped:', error);
      return null;
    }
  },

  /** The Undo under a reply: puts memory back the way it was before that exchange. */
  undo: (
    userId: string,
    messageId: string,
    changes: ChatMemoryChanges,
  ): ChatMemoryChanges => {
    const undone = db.transactionSync(tx => {
      const stored = chatStore.getMemoryChanges(userId, messageId, tx);
      if (!stored || stored.revision !== changes.revision) {
        throw new Error('The memory notice is no longer available.');
      }
      if (stored.undone) return stored;
      chatMemoryStore.undoChanges(userId, stored, tx);
      const reverted: ChatMemoryChanges = {...stored, undone: true};
      if (!chatStore.setMemoryChanges(userId, messageId, reverted, tx)) {
        throw new Error('The memory notice could not be saved.');
      }
      return reverted;
    });
    emit({userId, messageId, changes: undone});
    return undone;
  },
};
