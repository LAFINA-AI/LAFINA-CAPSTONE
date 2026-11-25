/**
 * Floating LAFINA Quick Chat (ADR-036): the only caller of the assistant
 * pipeline for the Quick Chat panel.
 *
 * - Every request runs `chatOrchestrator.processMessage` in Temporary Chat
 *   mode with the `'quick'` review surface, so nothing is written to chat
 *   history and Quick Chat's card never replaces a Chat-tab or Voice card.
 * - The transcript lives in memory only, per owner, capped, and is dropped
 *   after an owner change or 30 minutes without use (checked lazily; no timers).
 * - Planner writes still happen only through the review card's Confirm (or
 *   the pipeline's existing low-risk actions with Undo).
 * - After a change is applied it emits `QUICK_CHAT_DATA_CHANGED_EVENT` so the
 *   main app can refresh its screens.
 */
import {DeviceEventEmitter} from 'react-native';
import {
  chatOrchestrator,
  type ChatOrchestratorResult,
  type ReviewDecisionResult,
} from '../chatOrchestrator';
import type {ChatMessage} from '../../storage/chatStore';
import type {ChatMemoryChanges} from '../../storage/chatMemoryStore';
import {chatMemoryService} from '../../cloud/chatMemoryService';
import type {UndoResult} from '../nlu/commandReview';

export const QUICK_CHAT_DATA_CHANGED_EVENT = 'LAFINA_QUICK_CHAT_DATA_CHANGED';
export const QUICK_CHAT_MAX_MESSAGES = 20;
export const QUICK_CHAT_IDLE_MS = 30 * 60 * 1000;

export interface QuickChatDataChangedEvent {
  ownerId: string;
  reason: 'confirmed' | 'undone' | 'applied';
}

export interface QuickChatSendOptions {
  onlineMode?: boolean;
  onReplyText?: (replySoFar: string) => void;
  referenceDate?: Date;
}

export type QuickChatSendResult =
  | {status: 'done'; result: ChatOrchestratorResult}
  /** Empty text: nothing was sent. */
  | {status: 'empty'}
  /** A request is already running: nothing was sent. */
  | {status: 'busy'}
  /** Stop, an owner change or a newer request made this reply stale. */
  | {status: 'stopped'}
  /** The pipeline threw. The typed text should go back into the composer. */
  | {status: 'error'; error: unknown};

type Listener = (ownerId: string | null) => void;

interface QuickChatState {
  ownerId: string | null;
  messages: ChatMessage[];
  /** The last completed reply: its review card, Undo offer and text. */
  lastResult: ChatOrchestratorResult | null;
  lastUsedAt: number;
  busy: boolean;
  /** Increases on every send, stop, clear and owner change. */
  generation: number;
  /**
   * The words that produced the open review card, given back on Cancel.
   * Kept here (not in the panel) so it survives closing and reopening.
   */
  cardSource: {operationId: string; text: string} | null;
}

const state: QuickChatState = {
  ownerId: null,
  messages: [],
  lastResult: null,
  lastUsedAt: 0,
  busy: false,
  generation: 0,
  cardSource: null,
};

const listeners = new Set<Listener>();
let now = (): number => Date.now();

const notify = (): void => {
  listeners.forEach(listener => {
    try {
      listener(state.ownerId);
    } catch (error) {
      console.warn('[quickChatController] Listener failed:', error);
    }
  });
};

const reset = (ownerId: string | null): void => {
  state.ownerId = ownerId;
  state.messages = [];
  state.lastResult = null;
  state.busy = false;
  state.generation += 1;
  state.lastUsedAt = now();
  state.cardSource = null;
};

/** Drops the transcript after an owner change or 30 minutes without use. */
const prepareFor = (ownerId: string): void => {
  const idle = now() - state.lastUsedAt > QUICK_CHAT_IDLE_MS;
  if (state.ownerId !== ownerId || (idle && !state.busy)) {
    reset(ownerId);
  }
};

const cap = (messages: ChatMessage[]): ChatMessage[] =>
  messages.length > QUICK_CHAT_MAX_MESSAGES
    ? messages.slice(messages.length - QUICK_CHAT_MAX_MESSAGES)
    : messages;

const tempMessage = (
  sender: 'user' | 'assistant',
  content: string,
): ChatMessage => {
  const at = new Date(now()).toISOString();
  return {
    id: `quick_${sender}_${now()}_${Math.random().toString(36).slice(2, 7)}`,
    sessionId: 'temp_chat',
    sender,
    content,
    ...(sender === 'assistant' ? {localReply: true} : {}),
    createdAt: at,
    updatedAt: at,
  };
};

const emitDataChanged = (
  ownerId: string,
  reason: QuickChatDataChangedEvent['reason'],
): void => {
  const event: QuickChatDataChangedEvent = {ownerId, reason};
  DeviceEventEmitter.emit(QUICK_CHAT_DATA_CHANGED_EVENT, event);
};

export const quickChatController = {
  /**
   * Sends one request through the existing assistant pipeline. One request
   * at a time; a second send while busy is refused.
   */
  async send(
    userId: string,
    text: string,
    options: QuickChatSendOptions = {},
  ): Promise<QuickChatSendResult> {
    const trimmed = (text || '').trim();
    if (!userId || !trimmed) return {status: 'empty'};
    prepareFor(userId);
    if (state.busy) return {status: 'busy'};

    state.generation += 1;
    const generation = state.generation;
    const userMessage = tempMessage('user', trimmed);
    const history = cap([...state.messages, userMessage]);
    state.messages = history;
    state.busy = true;
    state.lastUsedAt = now();
    notify();

    const isCurrent = (): boolean =>
      state.generation === generation && state.ownerId === userId;

    let result: ChatOrchestratorResult;
    try {
      result = await chatOrchestrator.processMessage(userId, trimmed, {
        temporaryChat: true,
        temporaryHistory: history,
        reviewSurface: 'quick',
        onlineMode: options.onlineMode === true,
        ...(options.referenceDate
          ? {referenceDate: options.referenceDate}
          : {}),
        onReplyText: replySoFar => {
          if (isCurrent()) options.onReplyText?.(replySoFar);
        },
        isCurrent,
      });
    } catch (error) {
      if (isCurrent()) {
        state.messages = state.messages.filter(m => m.id !== userMessage.id);
        state.busy = false;
        notify();
        return {status: 'error', error};
      }
      return {status: 'stopped'};
    }

    // A change the pipeline already applied (low-risk action with Undo) is
    // real data even when the reply is stale, so the main app still refreshes.
    if (result.undo && result.actionResult?.success) {
      emitDataChanged(userId, 'applied');
    }

    if (!isCurrent()) {
      // Nothing prepared after Stop may wait for a later Confirm, and any
      // embedded memory from a stopped turn must be rolled back.
      if (result.review?.status === 'proposal') {
        chatOrchestrator.cancelReview(
          userId,
          result.review.proposal.operationId,
          {temporaryChat: true},
        );
      }
      if (
        result.assistantMessage.memoryChanges &&
        !result.assistantMessage.memoryChanges.undone
      ) {
        try {
          chatMemoryService.undoTemporary(
            userId,
            result.assistantMessage.id,
            result.assistantMessage.memoryChanges,
          );
        } catch {
          // best-effort rollback for stopped quick chat turn
        }
      }
      return {status: 'stopped'};
    }

    state.messages = cap([...state.messages, result.assistantMessage]);
    state.lastResult = result;
    state.busy = false;
    state.lastUsedAt = now();
    notify();
    return {status: 'done', result};
  },

  /** Abandons the running request. Its reply is discarded when it arrives. */
  stop(): void {
    if (!state.busy) return;
    const pending = state.messages[state.messages.length - 1];
    state.generation += 1;
    state.busy = false;
    if (pending?.sender === 'user') {
      state.messages = state.messages.slice(0, -1);
    }
    notify();
  },

  /**
   * Records Confirm or Cancel from the review card (the card itself calls
   * `chatOrchestrator.confirmReview` / `cancelReview` through
   * `useCommandReview`). Adds the outcome to the transcript and announces an
   * applied change.
   */
  recordDecision(
    userId: string,
    decision: ReviewDecisionResult | null | undefined,
  ): void {
    if (!decision || !userId) return;
    const applied =
      decision.outcome?.status === 'applied' && !decision.outcome.repeated;
    if (applied) emitDataChanged(userId, 'confirmed');
    if (state.ownerId !== userId || !decision.reply) return;
    state.messages = cap([
      ...state.messages,
      tempMessage('assistant', decision.reply),
    ]);
    state.lastUsedAt = now();
    notify();
  },

  /** Reverses a low-risk action. Writes nothing to chat history. */
  undo(userId: string, token: string): UndoResult {
    const result = chatOrchestrator.undoAction(userId, token, {
      recordInChat: false,
    });
    if (result.status === 'undone') {
      emitDataChanged(userId, 'undone');
      if (state.ownerId === userId) {
        state.messages = cap([
          ...state.messages,
          tempMessage('assistant', result.reply),
        ]);
        state.lastUsedAt = now();
        notify();
      }
    }
    return result;
  },

  /** Remembers the words behind the review card `operationId` (null forgets). */
  setCardSource(
    userId: string,
    source: {operationId: string; text: string} | null,
  ): void {
    if (!userId || state.ownerId !== userId) return;
    state.cardSource = source;
  },

  /** The words behind the card `operationId` for this owner, or null. */
  getCardSource(userId: string, operationId: string): string | null {
    if (!userId || state.ownerId !== userId) return null;
    const source = state.cardSource;
    return source && source.operationId === operationId ? source.text : null;
  },

  /** This owner's transcript, or [] after an owner change or idle expiry. */
  getTranscript(userId: string): ChatMessage[] {
    if (!userId || state.ownerId !== userId) return [];
    if (!state.busy && now() - state.lastUsedAt > QUICK_CHAT_IDLE_MS) {
      reset(userId);
      return [];
    }
    return [...state.messages];
  },

  /** The last completed reply for this owner (review card, Undo, text), or null. */
  getLastResult(userId: string): ChatOrchestratorResult | null {
    if (!userId || state.ownerId !== userId) return null;
    return state.lastResult;
  },

  isBusy(userId: string): boolean {
    return state.ownerId === userId && state.busy;
  },

  /** Drops the transcript. Without an owner, or for the current one, all of it. */
  clear(userId?: string | null): void {
    if (userId && state.ownerId && state.ownerId !== userId) return;
    reset(userId ?? null);
    notify();
  },

  /** Updates a quick-chat message's memory notice (e.g. after Undo). */
  patchMemoryChanges(
    userId: string,
    messageId: string,
    changes: ChatMemoryChanges,
  ): void {
    if (!userId || state.ownerId !== userId) return;
    let changed = false;
    state.messages = state.messages.map(msg => {
      if (msg.id !== messageId) return msg;
      changed = true;
      return {...msg, memoryChanges: changes};
    });
    if (changed) notify();
  },

  /** Keeps only this owner's transcript (account switch or sign-out). */
  retainOnly(userId: string | null): void {
    if (state.ownerId !== userId) {
      reset(userId);
      notify();
    }
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Test-only reset; `clock` replaces Date.now for idle-expiry tests. */
  resetForTests(clock?: () => number): void {
    now = clock ?? ((): number => Date.now());
    state.ownerId = null;
    state.messages = [];
    state.lastResult = null;
    state.busy = false;
    state.generation = 0;
    state.lastUsedAt = 0;
    state.cardSource = null;
    listeners.clear();
  },
};
