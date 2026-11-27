/**
 * Floating LAFINA Quick Chat (ADR-036): the only caller of the assistant
 * pipeline for the Quick Chat panel.
 *
 * - Every request runs `chatOrchestrator.processMessage` in Temporary Chat
 *   mode with the `'quick'` review surface, so Quick Chat never consumes the
 *   main Chat tab's synced 20-chat quota and Quick Chat's card never replaces
 *   a Chat-tab or Voice card.
 * - Completed Quick Chat sessions are persisted locally per owner in
 *   `local_settings` (capped at `QUICK_CHAT_MAX_HISTORY` threads) so students
 *   can browse, reopen, continue, or delete past floating chats, while also
 *   being able to clear the current floating chat at any time.
 * - After 30 minutes without use (checked lazily; no timers), the active view
 *   starts fresh while the previous conversation stays available in History.
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
import {localSettingsStore} from '../../storage/localSettingsStore';
import {chatMemoryService} from '../../cloud/chatMemoryService';
import {
  cancelReviewedCommand,
  formatResolvedReviewContent,
  latestPendingReview,
  type UndoResult,
} from '../nlu/commandReview';
import {clearPendingClarification} from '../nlu/pendingClarification';

export const QUICK_CHAT_DATA_CHANGED_EVENT = 'LAFINA_QUICK_CHAT_DATA_CHANGED';
export const QUICK_CHAT_MAX_MESSAGES = 20;
export const QUICK_CHAT_MAX_HISTORY = 20;
export const QUICK_CHAT_IDLE_MS = 30 * 60 * 1000;
const QUICK_CHAT_HISTORY_KEY = 'quickChat.history.v1';

export interface QuickChatDataChangedEvent {
  ownerId: string;
  reason: 'confirmed' | 'undone' | 'applied';
}

export interface QuickChatHistorySession {
  id: string;
  title: string;
  preview: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
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
  activeSessionId: string | null;
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
  cardSource: {operationId: string; text: string; messageId?: string} | null;
}

const state: QuickChatState = {
  ownerId: null,
  activeSessionId: null,
  messages: [],
  lastResult: null,
  lastUsedAt: 0,
  busy: false,
  generation: 0,
  cardSource: null,
};

const listeners = new Set<Listener>();
let now = (): number => Date.now();
let activeController: AbortController | null = null;

const abortActive = (): void => {
  const controller = activeController;
  activeController = null;
  controller?.abort();
};

const notify = (): void => {
  listeners.forEach(listener => {
    try {
      listener(state.ownerId);
    } catch (error) {
      console.warn('[quickChatController] Listener failed:', error);
    }
  });
};

const oneLine = (text: string, max: number): string => {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
};

const cap = (messages: ChatMessage[]): ChatMessage[] =>
  messages.length > QUICK_CHAT_MAX_MESSAGES
    ? messages.slice(messages.length - QUICK_CHAT_MAX_MESSAGES)
    : messages;

const newSessionId = (): string =>
  `quick_session_${now()}_${Math.random().toString(36).slice(2, 7)}`;

const readStoredHistory = (userId: string): QuickChatHistorySession[] => {
  if (!userId) return [];
  const raw = localSettingsStore.get(userId, QUICK_CHAT_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is QuickChatHistorySession =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          Array.isArray(item.messages) &&
          item.messages.length > 0,
      )
      .slice(0, QUICK_CHAT_MAX_HISTORY);
  } catch {
    return [];
  }
};

const writeStoredHistory = (
  userId: string,
  sessions: QuickChatHistorySession[],
): void => {
  if (!userId) return;
  try {
    localSettingsStore.set(
      userId,
      QUICK_CHAT_HISTORY_KEY,
      JSON.stringify(sessions.slice(0, QUICK_CHAT_MAX_HISTORY)),
    );
  } catch {
    // Non-fatal: in-memory state still works when local_settings is unavailable.
  }
};

const persistActiveSession = (): void => {
  const userId = state.ownerId;
  if (!userId || state.messages.length === 0) return;
  if (!state.activeSessionId) {
    state.activeSessionId = newSessionId();
  }
  const sessionId = state.activeSessionId;
  const firstUser = state.messages.find(m => m.sender === 'user');
  const lastMsg = state.messages[state.messages.length - 1];
  const at = new Date(now()).toISOString();
  const existing = readStoredHistory(userId);
  const prev = existing.find(s => s.id === sessionId);
  const updated: QuickChatHistorySession = {
    id: sessionId,
    title: firstUser ? oneLine(firstUser.content, 60) : 'Quick chat',
    preview: lastMsg ? oneLine(lastMsg.content, 90) : '',
    messages: cap([...state.messages]),
    createdAt: prev?.createdAt ?? state.messages[0]?.createdAt ?? at,
    updatedAt: at,
  };
  const next = [updated, ...existing.filter(s => s.id !== sessionId)].slice(
    0,
    QUICK_CHAT_MAX_HISTORY,
  );
  writeStoredHistory(userId, next);
};

const cancelPendingQuickState = (ownerId: string | null): void => {
  if (!ownerId) return;
  try {
    const pending = latestPendingReview(ownerId, 'quick');
    if (pending) {
      cancelReviewedCommand(ownerId, pending.operationId);
    }
  } catch {
    // best-effort cleanup
  }
  clearPendingClarification(ownerId, 'quick');
};

const reset = (ownerId: string | null): void => {
  abortActive();
  state.ownerId = ownerId;
  state.activeSessionId = null;
  state.messages = [];
  state.lastResult = null;
  state.busy = false;
  state.generation += 1;
  state.lastUsedAt = now();
  state.cardSource = null;
};

/** Drops the active transcript after an owner change or 30 minutes without use. */
const prepareFor = (ownerId: string): void => {
  const idle = now() - state.lastUsedAt > QUICK_CHAT_IDLE_MS;
  if (state.ownerId !== ownerId || (idle && !state.busy)) {
    if (state.ownerId) {
      cancelPendingQuickState(state.ownerId);
    }
    reset(ownerId);
  }
};

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

const applyReviewResolutionInPlace = (
  status: 'confirmed' | 'cancelled',
  messageId?: string,
): boolean => {
  let targetIndex = -1;
  if (messageId) {
    targetIndex = state.messages.findIndex(m => m.id === messageId);
  }
  if (targetIndex === -1) {
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      const msg = state.messages[i];
      if (
        msg.sender === 'assistant' &&
        !msg.reviewResolution &&
        /^(?:\*\*)?Please review:/i.test(msg.content.trim())
      ) {
        targetIndex = i;
        break;
      }
    }
  }
  if (targetIndex === -1) return false;
  const target = state.messages[targetIndex];
  const updated: ChatMessage = {
    ...target,
    content: formatResolvedReviewContent(target.content),
    reviewResolution: {
      status,
      resolvedAt: new Date(now()).toISOString(),
    },
  };
  state.messages = state.messages.map((msg, idx) =>
    idx === targetIndex ? updated : msg,
  );
  return true;
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
    abortActive();
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    activeController = controller;

    let result: ChatOrchestratorResult;
    try {
      result = await chatOrchestrator.processMessage(userId, trimmed, {
        temporaryChat: true,
        temporaryHistory: history,
        reviewSurface: 'quick',
        onlineMode: options.onlineMode === true,
        ...(controller ? {signal: controller.signal} : {}),
        ...(options.referenceDate
          ? {referenceDate: options.referenceDate}
          : {}),
        onReplyText: replySoFar => {
          if (isCurrent()) options.onReplyText?.(replySoFar);
        },
        isCurrent,
      });
    } catch (error) {
      if (activeController === controller) activeController = null;
      if (isCurrent()) {
        state.messages = state.messages.filter(m => m.id !== userMessage.id);
        state.busy = false;
        notify();
        return {status: 'error', error};
      }
      return {status: 'stopped'};
    }
    if (activeController === controller) activeController = null;

    // A change the pipeline already applied (low-risk action with Undo, or
    // conversational confirmation of an open review card) is real data even
    // when the reply is stale, so the main app still refreshes.
    if (result.undo && result.actionResult?.success) {
      emitDataChanged(userId, 'applied');
    } else if (result.resolvedReview?.status === 'applied') {
      emitDataChanged(userId, 'confirmed');
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

    if (
      result.resolvedReview?.status === 'applied' ||
      result.resolvedReview?.status === 'cancelled'
    ) {
      applyReviewResolutionInPlace(
        result.resolvedReview.status === 'applied' ? 'confirmed' : 'cancelled',
        state.cardSource?.messageId,
      );
      state.cardSource = null;
    }

    state.messages = cap([...state.messages, result.assistantMessage]);
    state.lastResult = result;
    state.busy = false;
    state.lastUsedAt = now();
    persistActiveSession();
    notify();
    return {status: 'done', result};
  },

  /** Abandons the running request. Its reply is discarded when it arrives. */
  stop(): void {
    if (!state.busy) return;
    const pending = state.messages[state.messages.length - 1];
    state.generation += 1;
    state.busy = false;
    abortActive();
    if (pending?.sender === 'user') {
      state.messages = state.messages.slice(0, -1);
    }
    notify();
  },

  /**
   * Records Confirm or Cancel from the review card (the card itself calls
   * `chatOrchestrator.confirmReview` / `cancelReview` through
   * `useCommandReview`). Updates the proposal bubble, adds the outcome to the
   * transcript, persists to history, and announces an applied change.
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
    if (applied) {
      applyReviewResolutionInPlace('confirmed', state.cardSource?.messageId);
    } else if (decision.cancelled) {
      applyReviewResolutionInPlace('cancelled', state.cardSource?.messageId);
    }
    state.messages = cap([
      ...state.messages,
      tempMessage('assistant', decision.reply),
    ]);
    state.lastUsedAt = now();
    persistActiveSession();
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
        persistActiveSession();
        notify();
      }
    }
    return result;
  },

  /** Remembers the words behind the review card `operationId` (null forgets). */
  setCardSource(
    userId: string,
    source: {operationId: string; text: string; messageId?: string} | null,
  ): void {
    if (!userId || state.ownerId !== userId) return;
    state.cardSource = source;
  },

  /**
   * Rebinds the stored card source after an inline edit on the review card,
   * preserving `messageId` and updating the proposal bubble in place.
   */
  updateCardSourceOnEdit(
    userId: string,
    previousOperationId: string,
    nextOperationId: string,
    nextReply?: string,
  ): void {
    if (!userId || state.ownerId !== userId) return;
    const source = state.cardSource;
    if (source && source.operationId === previousOperationId) {
      state.cardSource = {
        ...source,
        operationId: nextOperationId,
      };
      if (nextReply && source.messageId) {
        let changed = false;
        state.messages = state.messages.map(msg => {
          if (msg.id !== source.messageId) return msg;
          changed = true;
          return {...msg, content: nextReply};
        });
        if (changed) {
          persistActiveSession();
          notify();
        }
      }
    }
  },

  /** The words behind the card `operationId` for this owner, or null. */
  getCardSource(userId: string, operationId: string): string | null {
    if (!userId || state.ownerId !== userId) return null;
    if (!state.busy && now() - state.lastUsedAt > QUICK_CHAT_IDLE_MS) {
      cancelPendingQuickState(userId);
      reset(userId);
      return null;
    }
    const source = state.cardSource;
    return source && source.operationId === operationId ? source.text : null;
  },

  /** This owner's active transcript, or [] after an owner change or idle expiry. */
  getTranscript(userId: string): ChatMessage[] {
    if (!userId || state.ownerId !== userId) return [];
    if (!state.busy && now() - state.lastUsedAt > QUICK_CHAT_IDLE_MS) {
      cancelPendingQuickState(userId);
      reset(userId);
      return [];
    }
    return [...state.messages];
  },

  /** The active Quick Chat session id for this owner, or null when empty. */
  getActiveSessionId(userId: string): string | null {
    if (!userId || state.ownerId !== userId) return null;
    if (!state.busy && now() - state.lastUsedAt > QUICK_CHAT_IDLE_MS) {
      cancelPendingQuickState(userId);
      reset(userId);
      return null;
    }
    return state.activeSessionId;
  },

  /** Saved Quick Chat conversations for this owner, newest first. */
  getHistory(userId: string): QuickChatHistorySession[] {
    return readStoredHistory(userId);
  },

  /** Loads a saved Quick Chat conversation into the panel so it can be read or continued. */
  openHistorySession(userId: string, sessionId: string): boolean {
    if (!userId || !sessionId) return false;
    const target = readStoredHistory(userId).find(s => s.id === sessionId);
    if (!target) return false;
    cancelPendingQuickState(state.ownerId);
    cancelPendingQuickState(userId);
    abortActive();
    state.ownerId = userId;
    state.activeSessionId = target.id;
    state.messages = cap([...target.messages]);
    state.lastResult = null;
    state.busy = false;
    state.generation += 1;
    state.lastUsedAt = now();
    state.cardSource = null;
    notify();
    return true;
  },

  /** Removes one saved Quick Chat conversation from history. */
  deleteHistorySession(userId: string, sessionId: string): void {
    if (!userId || !sessionId) return;
    const next = readStoredHistory(userId).filter(s => s.id !== sessionId);
    writeStoredHistory(userId, next);
    if (state.ownerId === userId && state.activeSessionId === sessionId) {
      cancelPendingQuickState(userId);
      reset(userId);
    }
    notify();
  },

  /** Removes all saved Quick Chat conversations for this owner and clears the panel. */
  clearHistory(userId: string): void {
    if (!userId) return;
    writeStoredHistory(userId, []);
    if (state.ownerId === userId) {
      cancelPendingQuickState(userId);
      reset(userId);
    }
    notify();
  },

  /** The last completed reply for this owner (review card, Undo, text), or null. */
  getLastResult(userId: string): ChatOrchestratorResult | null {
    if (!userId || state.ownerId !== userId) return null;
    if (!state.busy && now() - state.lastUsedAt > QUICK_CHAT_IDLE_MS) {
      cancelPendingQuickState(userId);
      reset(userId);
      return null;
    }
    return state.lastResult;
  },

  isBusy(userId: string): boolean {
    return state.ownerId === userId && state.busy;
  },

  /**
   * Clears the current floating chat back to a clean slate, cancelling any
   * pending review card or clarification on the `'quick'` surface. Past
   * completed conversations remain available in Quick Chat History.
   */
  clear(userId?: string | null): void {
    if (userId && state.ownerId && state.ownerId !== userId) return;
    const targetOwner = userId ?? state.ownerId;
    cancelPendingQuickState(targetOwner);
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
    if (changed) {
      persistActiveSession();
      notify();
    }
  },

  /** Keeps only this owner's transcript (account switch or sign-out). */
  retainOnly(userId: string | null): void {
    if (state.ownerId !== userId) {
      cancelPendingQuickState(state.ownerId);
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
    abortActive();
    clearPendingClarification();
    now = clock ?? ((): number => Date.now());
    state.ownerId = null;
    state.activeSessionId = null;
    state.messages = [];
    state.lastResult = null;
    state.busy = false;
    state.generation = 0;
    state.lastUsedAt = 0;
    state.cardSource = null;
    listeners.clear();
  },
};
