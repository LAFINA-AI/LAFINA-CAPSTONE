/**
 * Action Phase Service & Lifecycle Manager (P06-04, P06-05, P06-07).
 *
 * Coordinates validated action envelopes, lifecycle event feeds, and
 * transaction-safe card confirmations with strict owner isolation and isCurrent guards.
 */

import {DeviceEventEmitter} from 'react-native';
import {generateId} from '../../utils';
import {CHAT_MEMORY_CHANGED_EVENT} from '../../cloud/chatMemoryService';
import type {
  ActionEnvelope,
  ActionLifecycleEvent,
  ActionCardStatus,
  LafinaActionKind,
  LafinaActionPhase,
  MemoryProposalData,
  MemoryProposalStatus,
  DraftConfirmPayload,
  DraftRevisePayload,
  DraftCancelPayload,
  MultiActionBatchData,
  MultiActionItemData,
  MultiPreparePayload,
} from './types';
import {
  isToolExecutionPermitted,
  containsPromptInjection,
  containsSensitiveSecret,
} from './actionSecurity';
import {getRegisteredTool} from './actionRegistry';
import {validatePayload} from './actionValidator';
import {
  readLocalVoiceResult,
  type LocalVoiceResult,
} from '../../cloud/voiceConversation/localVoiceData';
import {chatOrchestrator} from '../chatOrchestrator';
import type {SpokenTurnReview} from '../chatOrchestrator';
import {chatMemoryStore} from '../../storage/chatMemoryStore';
import {
  reconcileDeletedMemory,
  reconcileRestoredMemories,
  syncChatUpdatedOnboardingSlot,
} from '../../storage/onboardingMemory';
import {draftRegistry} from './draftRegistry';
import {
  appliedReviewReply,
  cancelReviewedCommand,
  confirmReviewedCommand,
  reviseReviewedCommand,
} from '../nlu/commandReview';
import {
  extractExplicitMemory,
  type ExplicitMemoryMatch,
} from '../explicitMemory';
import {
  answerFreeTime,
  hasStructuredAction,
  prepareStructuredReview,
  SUGGESTED_CARD_NOTE,
  isReferenceTitle,
} from './structuredAction';
import type {StructuredActionArgs} from './structuredAction';

/** What the model hears when it tries to confirm a card it suggested. */
export const SUGGESTED_CONFIRM_REFUSAL =
  'Not saved: this card was suggested from the conversation, so the student must confirm it themselves. Ask them to say yes or tap Confirm.';
import {addMinutesToTime} from '../nlu/actionExecutor';
import {isWallTime} from '../../storage/eventTime';
import {personalMemoryStore} from '../../storage/personalMemoryStore';
import {
  parseGroupedRequest,
  createMultiActionBatch,
  proposeFollowUpReminder,
  executeMultiActionBatch,
  formatMultiActionSpokenSummary,
} from './multiActionService';
import {
  formatVoiceUstpToolResult,
  searchUstpSourcesForVoice,
  type UstpSearchCollection,
} from '../../handbook';
import {clearCallUstpSources, recordCallUstpSources} from './callUstpCitations';

export interface ActionRecord {
  envelope: ActionEnvelope;
  status: ActionCardStatus;
  createdEpoch: number;
  updatedEpoch: number;
  reviewResult?: SpokenTurnReview;
  memoryProposal?: MemoryProposalData;
  multiActionBatch?: MultiActionBatchData;
  result?: string;
  error?: string;
}

export type ActionLifecycleListener = (event: ActionLifecycleEvent) => void;

export interface ExecuteToolOptions {
  onError?: (message: string) => void;
  onReadResult?: (result: LocalVoiceResult) => void;
  onDraftCanceled?: () => void;
  onConfirmDraft?: (
    cardId: string,
    revision: number,
  ) =>
    | Promise<{saved: boolean; message: string}>
    | {saved: boolean; message: string};
  sourceTurnId?: string;
  onProposal?: (review: SpokenTurnReview) => void;
  onMemoryProposal?: (proposal: MemoryProposalData, actionId: string) => void;
  onMultiActionBatch?: (batch: MultiActionBatchData) => void;
  /** Present only during a reminder call: snoozes that reminder. */
  onSnoozeReminder?: (minutes: number) => Promise<string>;
}

class ActionService {
  private retiredSessions = new Set<string>();
  private actions = new Map<string, ActionRecord>();
  private lastUstpQueryBySession = new Map<string, string>();
  private listeners = new Set<ActionLifecycleListener>();

  subscribe(listener: ActionLifecycleListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(
    actionId: string,
    kind: LafinaActionKind,
    phase: LafinaActionPhase,
    details?: string,
  ): void {
    const event: ActionLifecycleEvent = {
      actionId,
      kind,
      phase,
      timestamp: Date.now(),
      details,
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Safe dispatch: listeners must not break execution
      }
    }
  }

  /**
   * Cards built from the model's own fields (not the student's words). Only
   * the student confirms these: by voice, through the device's own reading of
   * "yes", or with the card's button. confirm_draft from the model is refused.
   */
  private suggestedCards = new Set<string>();

  markSuggestedCard(cardId: string): void {
    this.suggestedCards.add(cardId);
    if (this.suggestedCards.size > 50) {
      const oldest = this.suggestedCards.values().next().value;
      if (oldest !== undefined) this.suggestedCards.delete(oldest);
    }
  }

  isSuggestedCard(cardId: string): boolean {
    return this.suggestedCards.has(cardId);
  }

  getAction(actionId: string): ActionRecord | undefined {
    return this.actions.get(actionId);
  }

  clearSessionActions(sessionId: string): void {
    this.retiredSessions.add(sessionId);
    while (this.retiredSessions.size > 100) {
      const oldest = this.retiredSessions.values().next().value;
      if (oldest === undefined) break;
      this.retiredSessions.delete(oldest);
    }
    draftRegistry.clearSessionDrafts(sessionId);
    this.lastUstpQueryBySession.delete(sessionId);
    for (const [id, record] of this.actions.entries()) {
      if (record.envelope.sessionId === sessionId) {
        if (
          record.reviewResult?.kind === 'proposal' &&
          record.reviewResult.review.status === 'proposal'
        )
          cancelReviewedCommand(
            record.envelope.ownerId,
            record.reviewResult.review.proposal.operationId,
          );
        if (record.multiActionBatch)
          this.cancelMultiActionBatch(
            record.envelope.ownerId,
            record.multiActionBatch,
          );
        this.actions.delete(id);
      }
    }
  }

  /**
   * Dispatches an incoming tool call from ElevenAgents/DeepSeek.
   * Validates security, schema, and concurrency guards before running.
   */
  async executeTool(
    userId: string,
    sessionId: string,
    name: string,
    parameters: Record<string, unknown>,
    isCurrent: () => boolean,
    options?: ExecuteToolOptions,
  ): Promise<string> {
    const fail = (message: string) => {
      options?.onError?.(message);
      return message;
    };
    // 1. Authenticated owner security check
    const perm = isToolExecutionPermitted(userId);
    if (!isCurrent() || this.retiredSessions.has(sessionId))
      return fail('Request cancelled. Nothing was changed.');
    if (!perm.permitted) {
      return fail(
        `Tool execution not permitted: ${perm.reason || 'Unauthorized'}`,
      );
    }

    // 2. Tool registration check
    const toolDef = getRegisteredTool(name);
    if (!toolDef) {
      return fail(`Tool '${name}' is not supported by LAFINA.`);
    }

    if (
      Object.keys(parameters).some(
        key =>
          !Object.prototype.hasOwnProperty.call(
            toolDef.parameters.properties || {},
            key,
          ),
      )
    )
      return fail(`Invalid parameters for '${name}': Unknown tool parameter.`);

    // 3. Payload validation
    const valResult = validatePayload(toolDef.kind, parameters);
    if (!valResult.valid) {
      return fail(`Invalid parameters for '${name}': ${valResult.error}`);
    }

    const actionId = generateId('act');
    const sourceTurnId = options?.sourceTurnId ?? `turn-${Date.now()}`;
    const envelope: ActionEnvelope = {
      schemaVersion: 1,
      actionId,
      sessionId,
      ownerId: userId,
      sourceTurnId,
      kind: toolDef.kind,
      phase: 'requested',
      payload: valResult.data,
    };

    const record: ActionRecord = {
      envelope,
      status: 'prepare',
      createdEpoch: Date.now(),
      updatedEpoch: Date.now(),
    };
    while (this.actions.size >= 200) {
      const oldest = this.actions.keys().next().value;
      if (oldest === undefined) break;
      this.actions.delete(oldest);
    }
    this.actions.set(actionId, record);

    // 4. Execution branching
    try {
      if (toolDef.kind === 'ustp.search') {
        envelope.phase = 'checking';
        this.emit(actionId, toolDef.kind, 'checking');

        if (!isCurrent()) {
          envelope.phase = 'canceled';
          this.emit(
            actionId,
            toolDef.kind,
            'canceled',
            'Turn changed or cancelled.',
          );
          return 'Request cancelled because conversational turn updated.';
        }

        const p = envelope.payload as {
          query: string;
          collection?: UstpSearchCollection;
        };
        const previousUserQuery =
          this.lastUstpQueryBySession.get(sessionId) ?? null;
        const result = await searchUstpSourcesForVoice(userId, p.query, {
          collection: p.collection,
          previousUserQuery,
        });

        if (!isCurrent()) {
          envelope.phase = 'canceled';
          this.emit(
            actionId,
            toolDef.kind,
            'canceled',
            'Turn changed or cancelled.',
          );
          return 'Request cancelled because conversational turn updated.';
        }

        if (result.status === 'ok') {
          this.lastUstpQueryBySession.set(sessionId, p.query);
          if (this.lastUstpQueryBySession.size > 50) {
            const oldest = this.lastUstpQueryBySession.keys().next().value;
            if (oldest !== undefined)
              this.lastUstpQueryBySession.delete(oldest);
          }
          recordCallUstpSources(userId, result.sources);
        } else {
          clearCallUstpSources(userId);
        }
        options?.onReadResult?.(result);

        const resultStr = formatVoiceUstpToolResult(result);
        envelope.phase = 'done';
        record.status = 'result';
        record.result = resultStr;
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'done');
        return resultStr;
      }

      if (
        toolDef.kind === 'legacy.read_data' ||
        toolDef.kind === 'calendar.read' ||
        toolDef.kind === 'note.search' ||
        toolDef.kind === 'memory.read'
      ) {
        envelope.phase = 'checking';
        this.emit(actionId, toolDef.kind, 'checking');

        if (!isCurrent()) {
          envelope.phase = 'canceled';
          this.emit(
            actionId,
            toolDef.kind,
            'canceled',
            'Turn changed or cancelled.',
          );
          return 'Request cancelled because conversational turn updated.';
        }

        let result: LocalVoiceResult =
          'Memory is turned off. No saved memories are available.';
        if (toolDef.kind === 'legacy.read_data') {
          const p = envelope.payload as {kind: string; query?: string};
          result = readLocalVoiceResult(userId, p.kind, p.query);
        } else if (toolDef.kind === 'calendar.read') {
          const p = envelope.payload as {
            query?: string;
            date?: string;
            start?: string;
            end?: string;
          };
          result = readLocalVoiceResult(
            userId,
            'calendar',
            p.date || p.query,
            p,
          );
        } else if (toolDef.kind === 'note.search') {
          const p = envelope.payload as {query: string; limit?: number};
          result = readLocalVoiceResult(userId, 'notes', p.query, p);
        } else if (toolDef.kind === 'memory.read') {
          const p = envelope.payload as {query?: string};
          result = readLocalVoiceResult(userId, 'memory', p.query);
        }

        if (!isCurrent()) return 'Request canceled. Nothing was changed.';
        options?.onReadResult?.(result);
        const resultStr =
          typeof result === 'string' ? result : JSON.stringify(result);
        envelope.phase = 'done';
        record.status = 'result';
        record.result = resultStr;
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'done');
        return resultStr;
      }

      if (toolDef.kind === 'memory.prepare') {
        envelope.phase = 'preparing';
        this.emit(actionId, toolDef.kind, 'preparing');

        if (!isCurrent()) {
          envelope.phase = 'canceled';
          this.emit(
            actionId,
            toolDef.kind,
            'canceled',
            'Turn changed or cancelled.',
          );
          return 'Request cancelled because conversational turn updated.';
        }

        if (!chatMemoryStore.isEnabled(userId)) {
          envelope.phase = 'failed';
          record.status = 'failed';
          record.error = 'Memory is turned off in Settings.';
          this.emit(
            actionId,
            toolDef.kind,
            'failed',
            'Memory is turned off in Settings.',
          );
          return 'Memory is turned off in Settings. No memories can be saved.';
        }

        const p = envelope.payload as {text: string};
        const memProp: MemoryProposalData = {
          id: generateId('mem_prop'),
          text: p.text.trim(),
          status: 'draft',
          revision: 1,
        };
        record.memoryProposal = memProp;
        // The model wrote this text, so only the student confirms it (audit 2, B6).
        this.markSuggestedCard(actionId);
        envelope.phase = 'waiting';
        record.status = 'prepare';
        record.updatedEpoch = Date.now();
        this.emit(
          actionId,
          toolDef.kind,
          'waiting',
          'Memory review card presented to student.',
        );
        options?.onMemoryProposal?.(memProp, actionId);
        return `A memory card is shown with fact: "${memProp.text}". Nothing has been saved yet. Ask the student to check and confirm the card.`;
      }

      if (
        toolDef.kind === 'legacy.prepare_action' ||
        toolDef.kind === 'legacy.save_memory'
      ) {
        envelope.phase = 'preparing';
        this.emit(actionId, toolDef.kind, 'preparing');

        if (!isCurrent()) {
          envelope.phase = 'canceled';
          this.emit(
            actionId,
            toolDef.kind,
            'canceled',
            'Turn changed or cancelled.',
          );
          return 'Request cancelled because conversational turn updated.';
        }

        const p = envelope.payload as {request: string};
        const rawReq = typeof p.request === 'string' ? p.request.trim() : '';
        const explicitMatch = extractExplicitMemory(rawReq);
        const sanitizedDirectFact =
          !explicitMatch &&
          toolDef.kind === 'legacy.save_memory' &&
          rawReq.length >= 3 &&
          rawReq.length <= 200 &&
          !containsPromptInjection(rawReq) &&
          !containsSensitiveSecret(rawReq)
            ? rawReq
                .replace(
                  /^(?:please\s+)?(?:remember|keep\s+in\s+mind|note)\s+(?:that\s+)?/i,
                  '',
                )
                .trim()
            : null;
        const fact =
          explicitMatch?.text ||
          (sanitizedDirectFact && sanitizedDirectFact.length >= 2
            ? sanitizedDirectFact
            : null);
        if (fact) {
          const prepared = this.createMemoryProposal(
            userId,
            sessionId,
            fact,
            p.request,
            explicitMatch ?? undefined,
          );
          options?.onMemoryProposal?.(prepared.proposal, prepared.actionId);
          return 'A memory review card is shown. Nothing has been saved. Please tap Save to confirm.';
        }
        if (toolDef.kind === 'legacy.save_memory') {
          return 'No valid memory statement was found. Ask the student what personal preference or fact they want remembered.';
        }
        const structured = envelope.payload as StructuredActionArgs;
        let review = await chatOrchestrator.reviewSpokenTurn(
          userId,
          p.request,
          {onlineMode: true, isCurrent},
        );
        // The request text gave nothing to act on, or a card about something
        // else ("book the first one" reads as a task "First one"): use the
        // fields the model filled in. That card always waits for the student.
        let suggested = false;
        const grounded =
          review.kind === 'proposal' && review.review.status === 'proposal'
            ? review.review.proposal
            : null;
        if (
          isCurrent() &&
          hasStructuredAction(structured) &&
          (review.kind === 'none' ||
            review.kind === 'note' ||
            (grounded !== null && isReferenceTitle(grounded.title)))
        ) {
          const prepared = prepareStructuredReview(userId, structured, 'voice');
          if (prepared?.status === 'proposal') {
            if (grounded) cancelReviewedCommand(userId, grounded.operationId);
            review = {
              kind: 'proposal',
              review: prepared,
              reply: prepared.reply,
            };
            suggested = true;
          } else if (prepared && !grounded) {
            review = {kind: 'note', reply: prepared.reply};
          }
        }

        if (!isCurrent()) {
          envelope.phase = 'canceled';
          this.emit(
            actionId,
            toolDef.kind,
            'canceled',
            'Turn changed during review.',
          );
          if (review.kind === 'proposal' && review.review.status === 'proposal')
            cancelReviewedCommand(userId, review.review.proposal.operationId);
          return fail('Review prepared but superseded by new turn.');
        }

        record.reviewResult = review;
        record.updatedEpoch = Date.now();
        options?.onProposal?.(review);

        if (review.kind === 'proposal') {
          envelope.phase = 'waiting';
          record.status = 'prepare';
          this.emit(
            actionId,
            toolDef.kind,
            'waiting',
            'Review card presented to student.',
          );
          const pProposal =
            review.review.status === 'proposal' ? review.review.proposal : null;
          if (pProposal) {
            draftRegistry.registerDraft({
              cardId: pProposal.operationId,
              sessionId,
              ownerId: userId,
              revision: 1,
              kind:
                pProposal.intent === 'create_task'
                  ? 'task'
                  : pProposal.intent === 'create_reminder'
                  ? 'reminder'
                  : pProposal.intent === 'create_time_block'
                  ? 'time_block'
                  : pProposal.intent === 'create_note'
                  ? 'note'
                  : 'task',
              title: pProposal.title,
              details: [...pProposal.details],
              assumptions: [...pProposal.assumptions],
              warnings: [...pProposal.warnings],
            });
          }
          if (suggested && pProposal)
            this.markSuggestedCard(pProposal.operationId);
          return suggested
            ? `A review card is shown: ${review.reply} Card ID: ${pProposal?.operationId}; revision: 1. Nothing has been saved yet. ${SUGGESTED_CARD_NOTE}`
            : `A review card is shown: ${review.reply} Card ID: ${pProposal?.operationId}; revision: 1. Nothing has been saved yet. Ask if they want changes or call confirm_draft to save it.`;
        }

        if (review.kind !== 'none') {
          envelope.phase = 'done';
          record.status = 'result';
          record.result = review.reply;
          this.emit(actionId, toolDef.kind, 'done');
          return review.reply;
        }

        envelope.phase = 'done';
        record.status = 'result';
        return 'No action was prepared.';
      }

      if (toolDef.kind === 'draft.revise') {
        envelope.phase = 'preparing';
        this.emit(actionId, toolDef.kind, 'preparing');

        if (!isCurrent()) {
          envelope.phase = 'canceled';
          this.emit(
            actionId,
            toolDef.kind,
            'canceled',
            'Turn changed or cancelled.',
          );
          return 'Request cancelled because conversational turn updated.';
        }

        const p = envelope.payload as DraftRevisePayload;
        const result =
          p.revision === 1
            ? reviseReviewedCommand(userId, p.cardId, p.instruction)
            : {
                status: 'invalid' as const,
                reply: 'Stale draft revision. Please review the current card.',
              };
        if (result.status === 'proposal') {
          // A revised suggestion is still a suggestion.
          if (this.isSuggestedCard(p.cardId))
            this.markSuggestedCard(result.proposal.operationId);
          envelope.phase = 'waiting';
          record.status = 'prepare';
          record.result = result.reply;
          record.updatedEpoch = Date.now();
          this.emit(actionId, toolDef.kind, 'waiting', result.reply);
          options?.onProposal?.({
            kind: 'proposal',
            review: result,
            reply: result.reply,
          });
          return `A review card is shown: ${result.reply} Card ID: ${
            result.proposal.operationId
          }; revision: 1. Nothing has been saved yet. ${
            this.isSuggestedCard(result.proposal.operationId)
              ? SUGGESTED_CARD_NOTE
              : 'Call confirm_draft to save it if the student confirms or asks you to save it.'
          }`;
        }
        envelope.phase = 'failed';
        record.status = 'failed';
        record.error = result.reply;
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'failed', result.reply);
        return result.reply;
      }

      if (toolDef.kind === 'draft.confirm') {
        envelope.phase = 'confirming';
        this.emit(actionId, toolDef.kind, 'confirming');
        if (!isCurrent()) {
          envelope.phase = 'canceled';
          this.emit(
            actionId,
            toolDef.kind,
            'canceled',
            'Turn changed or cancelled.',
          );
          return 'Request cancelled. Nothing was saved.';
        }
        const p = envelope.payload as DraftConfirmPayload;
        if (options?.onConfirmDraft) {
          const outcome = await options.onConfirmDraft(p.cardId, p.revision);
          if (outcome.saved) {
            envelope.phase = 'done';
            record.status = 'confirm';
            record.result = outcome.message;
            record.updatedEpoch = Date.now();
            this.emit(actionId, toolDef.kind, 'done', outcome.message);
            return outcome.message;
          }
          envelope.phase = 'failed';
          record.status = 'failed';
          record.error = outcome.message;
          record.updatedEpoch = Date.now();
          this.emit(actionId, toolDef.kind, 'failed', outcome.message);
          return outcome.message;
        }
        if (this.isSuggestedCard(p.cardId)) {
          const saved = appliedReviewReply(userId, p.cardId);
          if (saved) {
            envelope.phase = 'done';
            record.status = 'confirm';
            record.result = saved;
            this.emit(actionId, toolDef.kind, 'done', saved);
            return 'The student already confirmed it: ' + saved;
          }
          envelope.phase = 'failed';
          record.status = 'failed';
          record.error = SUGGESTED_CONFIRM_REFUSAL;
          this.emit(actionId, toolDef.kind, 'failed', record.error);
          return record.error;
        }
        if (p.revision !== 1) {
          envelope.phase = 'failed';
          record.status = 'failed';
          record.error =
            'Stale draft revision. Nothing has been saved. Please review the current card.';
          this.emit(actionId, toolDef.kind, 'failed', record.error);
          return record.error;
        }
        const decision = confirmReviewedCommand(userId, p.cardId);
        if (decision.status === 'applied') {
          envelope.phase = 'done';
          record.status = 'confirm';
          record.result = decision.reply;
          record.updatedEpoch = Date.now();
          this.emit(actionId, toolDef.kind, 'done', decision.reply);
          return 'Confirmed and saved: ' + decision.reply;
        }
        const memRecord = this.actions.get(p.cardId);
        if (
          memRecord?.memoryProposal &&
          memRecord.envelope.ownerId === userId
        ) {
          const memOutcome = this.confirmMemoryProposal(userId, p.cardId);
          if (memOutcome.success) {
            envelope.phase = 'done';
            record.status = 'confirm';
            record.result = 'Saved to personal memory.';
            record.updatedEpoch = Date.now();
            this.emit(actionId, toolDef.kind, 'done', record.result);
            return 'Confirmed and saved to personal memory.';
          }
        }
        envelope.phase = 'failed';
        record.status = 'failed';
        record.error = decision.reply + ' Nothing has been saved.';
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'failed', record.error);
        return record.error;
      }

      if (toolDef.kind === 'draft.cancel') {
        envelope.phase = 'canceled';
        const p = envelope.payload as DraftCancelPayload;
        const canceled =
          p.revision === 1 && cancelReviewedCommand(userId, p.cardId);
        if (canceled) {
          record.status = 'cancel';
          record.updatedEpoch = Date.now();
          options?.onDraftCanceled?.();
          this.emit(
            actionId,
            toolDef.kind,
            'canceled',
            'Draft canceled. Nothing was saved.',
          );
          return 'Draft canceled. Nothing was saved.';
        }
        envelope.phase = 'failed';
        record.status = 'failed';
        record.error = 'That draft is no longer available.';
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'failed', record.error);
        return record.error;
      }

      if (toolDef.kind === 'calendar.free_time') {
        envelope.phase = 'checking';
        this.emit(actionId, toolDef.kind, 'checking');
        const p = envelope.payload as {date?: string; durationMinutes?: number};
        const answer = await answerFreeTime(userId, p);
        if (!isCurrent()) return 'Request canceled. Nothing was changed.';
        envelope.phase = 'done';
        record.status = 'result';
        record.result = answer;
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'done');
        return answer;
      }

      if (toolDef.kind === 'reminder.snooze') {
        const p = envelope.payload as {minutes: number};
        if (!options?.onSnoozeReminder) {
          envelope.phase = 'failed';
          record.status = 'failed';
          record.error = 'No reminder call is active.';
          this.emit(actionId, toolDef.kind, 'failed', record.error);
          return 'No reminder call is active, so nothing was snoozed. To move a reminder, prepare a change card with prepare_lafina_action.';
        }
        envelope.phase = 'saving';
        this.emit(actionId, toolDef.kind, 'saving');
        const answer = await options.onSnoozeReminder(p.minutes);
        envelope.phase = 'done';
        record.status = 'result';
        record.result = answer;
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'done', answer);
        return answer;
      }

      if (toolDef.kind === 'multi.prepare') {
        envelope.phase = 'preparing';
        this.emit(actionId, toolDef.kind, 'preparing');

        const rawPayload = envelope.payload as MultiPreparePayload;
        let items: MultiActionItemData[] = [];
        let truncated = false;

        if (Array.isArray(rawPayload.items) && rawPayload.items.length > 0) {
          items = rawPayload.items.map((it, idx) => {
            const kind = it.kind;
            const time = it.time ? String(it.time) : undefined;
            const endTime = it.endTime
              ? String(it.endTime)
              : kind === 'event' && time && isWallTime(time)
              ? addMinutesToTime(
                  time,
                  personalMemoryStore.getDefaultDuration(userId),
                )
              : undefined;
            return {
              id: `item-${idx + 1}-${generateId().slice(0, 6)}`,
              kind,
              title: String(it.title || `Action ${idx + 1}`),
              date: it.date ? String(it.date) : undefined,
              time,
              endTime,
              priority:
                (it.priority as MultiActionItemData['priority']) || 'medium',
              body: it.body ? String(it.body) : undefined,
              status: 'draft',
              savedEntityId: null,
              error: null,
            };
          });
          if (items.length > 5) {
            items = items.slice(0, 5);
            truncated = true;
          }
        } else if (rawPayload.text) {
          const parsed = parseGroupedRequest(
            rawPayload.text,
            new Date(),
            personalMemoryStore.getDefaultDuration(userId),
          );
          items = parsed.items;
          truncated = parsed.truncated;
        }

        const batch = createMultiActionBatch(
          sessionId,
          userId,
          items,
          truncated,
        );
        // Items described by the model: only the student confirms them (B6).
        this.markSuggestedCard(batch.id);
        envelope.phase = 'waiting';
        record.status = 'prepare';
        record.multiActionBatch = batch;
        record.updatedEpoch = Date.now();
        this.emit(
          actionId,
          toolDef.kind,
          'waiting',
          'Multi-action review card presented to student.',
        );
        options?.onMultiActionBatch?.(batch);

        return `A grouped review card with ${
          batch.items.length
        } items is shown: ${batch.items
          .map(i => i.title)
          .join(
            ', ',
          )}. Nothing has been saved yet. Ask the student to check and confirm the card.`;
      }

      if (toolDef.name === 'propose_follow_up_reminder') {
        envelope.phase = 'preparing';
        this.emit(actionId, toolDef.kind, 'preparing');

        const rawP = envelope.payload as Record<string, unknown>;
        const parentTitle = String(
          parameters.parentTitle || rawP.title || 'Event',
        );
        const eventDate = String(
          parameters.date || rawP.triggerDate || rawP.date || '',
        );
        const eventTime = String(
          parameters.time || rawP.triggerTime || rawP.time || '',
        );
        const minutesBefore =
          typeof parameters.minutesBefore === 'number'
            ? parameters.minutesBefore
            : typeof rawP.minutesBefore === 'number'
            ? rawP.minutesBefore
            : 15;

        const reminderItem = proposeFollowUpReminder(
          {
            title: parentTitle,
            date: eventDate || undefined,
            time: eventTime || undefined,
          },
          minutesBefore,
        );
        if (typeof parameters.title === 'string' && parameters.title.trim()) {
          reminderItem.title = parameters.title.trim();
        }

        const batch = createMultiActionBatch(sessionId, userId, [reminderItem]);
        this.markSuggestedCard(batch.id);
        envelope.phase = 'waiting';
        record.status = 'prepare';
        record.multiActionBatch = batch;
        record.updatedEpoch = Date.now();
        this.emit(
          actionId,
          toolDef.kind,
          'waiting',
          'Follow-up reminder proposal card presented.',
        );
        options?.onMultiActionBatch?.(batch);

        return `A follow-up reminder card is proposed: "${
          reminderItem.title
        }" on ${reminderItem.date || 'today'} at ${
          reminderItem.time || 'scheduled time'
        }. Nothing has been saved yet. Ask the student if they would like to set this reminder.`;
      }

      return 'Action completed.';
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unknown execution failure';
      envelope.phase = 'failed';
      record.status = 'failed';
      record.error = msg;
      record.updatedEpoch = Date.now();
      this.emit(actionId, toolDef.kind, 'failed', msg);
      return fail(
        `Failed to execute ${name}. Nothing was changed. Please try again.`,
      );
    }
  }

  createMemoryProposal(
    userId: string,
    sessionId: string,
    text: string,
    sourceUtterance?: string,
    matchMeta?: ExplicitMemoryMatch,
  ): {actionId: string; proposal: MemoryProposalData} {
    const actionId = generateId('act');
    const inferredMeta =
      matchMeta ??
      extractExplicitMemory(sourceUtterance || text) ??
      extractExplicitMemory(text);
    const memProp: MemoryProposalData = {
      id: generateId('mem_prop'),
      text: text.trim(),
      sourceUtterance,
      status: chatMemoryStore.isEnabled(userId) ? 'draft' : 'disabled',
      ...(inferredMeta
        ? {
            tier: inferredMeta.tier,
            category: inferredMeta.category,
            slotKey: inferredMeta.slotKey ?? null,
            isPinned: inferredMeta.isPinned,
          }
        : {}),
      revision: 1,
    };
    const envelope: ActionEnvelope = {
      schemaVersion: 1,
      actionId,
      sessionId,
      ownerId: userId,
      sourceTurnId: `turn-${Date.now()}`,
      kind: 'memory.prepare',
      phase: memProp.status === 'draft' ? 'waiting' : 'failed',
      payload: {text: memProp.text},
    };
    const record: ActionRecord = {
      envelope,
      status: memProp.status === 'draft' ? 'prepare' : 'failed',
      createdEpoch: Date.now(),
      updatedEpoch: Date.now(),
      memoryProposal: memProp,
    };
    this.actions.set(actionId, record);
    this.emit(
      actionId,
      'memory.prepare',
      envelope.phase,
      memProp.status === 'draft'
        ? 'Memory review card presented to student.'
        : 'Memory is turned off in Settings.',
    );
    return {actionId, proposal: memProp};
  }

  confirmMemoryProposal(
    userId: string,
    actionId: string,
    editedText?: string,
  ): {
    success: boolean;
    status: MemoryProposalStatus;
    memoryId?: string;
    error?: string;
  } {
    if (!isToolExecutionPermitted(userId).permitted)
      return {
        success: false,
        status: 'failed',
        error: 'Unauthorized: active owner and consent required.',
      };
    const record = this.actions.get(actionId);
    if (!record) {
      return {success: false, status: 'failed', error: 'Action not found'};
    }
    if (record.envelope.ownerId !== userId) {
      return {
        success: false,
        status: 'failed',
        error: 'Unauthorized: owner mismatch',
      };
    }
    if (!record.memoryProposal) {
      return {
        success: false,
        status: 'failed',
        error: 'No memory proposal attached to action',
      };
    }
    if (
      Date.now() - record.createdEpoch >= 5 * 60 * 1000 ||
      ['canceled', 'expired', 'undone'].includes(record.memoryProposal.status)
    ) {
      return {
        success: false,
        status: 'expired',
        error: 'This memory proposal is no longer available.',
      };
    }
    if (record.memoryProposal.status === 'saved') {
      return {
        success: false,
        status: 'duplicate',
        error: 'That fact is already in your memory.',
      };
    }
    if (!chatMemoryStore.isEnabled(userId)) {
      record.memoryProposal.status = 'disabled';
      record.envelope.phase = 'failed';
      this.emit(actionId, record.envelope.kind, 'failed', 'Memory is disabled');
      return {
        success: false,
        status: 'disabled',
        error: 'Memory is turned off in Settings.',
      };
    }

    const textToSave = (editedText ?? record.memoryProposal.text).trim();
    if (
      textToSave.length < 2 ||
      textToSave.length > 200 ||
      containsPromptInjection(textToSave) ||
      containsSensitiveSecret(textToSave)
    ) {
      record.memoryProposal.status = 'failed';
      record.envelope.phase = 'failed';
      this.emit(
        actionId,
        record.envelope.kind,
        'failed',
        'Invalid memory text',
      );
      return {
        success: false,
        status: 'failed',
        error: 'Invalid or rejected memory text.',
      };
    }

    try {
      const wasEdited =
        editedText !== undefined &&
        editedText.trim() !== record.memoryProposal.text.trim();
      const parsedMeta = extractExplicitMemory(textToSave);
      const isCanonicalStudyPref =
        parsedMeta?.isStudyPreference ||
        /^prefers\s+studying\b/i.test(textToSave);
      const isCanonicalNamePref = /^prefers\s+to\s+be\s+called\s+.+\.$/i.test(
        textToSave,
      );
      const addOptions = isCanonicalStudyPref
        ? {
            tier: 'preference' as const,
            category: 'study' as const,
            slotKey: 'onboarding:study',
          }
        : isCanonicalNamePref
        ? {
            tier: 'core' as const,
            category: 'identity' as const,
            slotKey: 'onboarding:name',
            isPinned: true,
          }
        : parsedMeta
        ? {
            tier: parsedMeta.tier,
            category: parsedMeta.category,
            ...(parsedMeta.slotKey ? {slotKey: parsedMeta.slotKey} : {}),
            ...(parsedMeta.isPinned ? {isPinned: true} : {}),
          }
        : !wasEdited &&
          (record.memoryProposal.tier ||
            record.memoryProposal.category ||
            record.memoryProposal.slotKey)
        ? {
            ...(record.memoryProposal.tier
              ? {tier: record.memoryProposal.tier}
              : {}),
            ...(record.memoryProposal.category
              ? {category: record.memoryProposal.category}
              : {}),
            ...(record.memoryProposal.slotKey
              ? {slotKey: record.memoryProposal.slotKey}
              : {}),
            ...(record.memoryProposal.isPinned ? {isPinned: true} : {}),
          }
        : {};
      const applied = chatMemoryStore.applyChanges(
        userId,
        {add: [{text: textToSave, ...addOptions}], remove: []},
        null,
      );
      const saved = applied.added[0] ?? null;
      if (!saved) {
        record.memoryProposal.status = 'duplicate';
        record.envelope.phase = 'done';
        this.emit(actionId, record.envelope.kind, 'done', 'Duplicate memory');
        return {
          success: false,
          status: 'duplicate',
          error: 'That fact is already in your memory.',
        };
      }
      if (addOptions.slotKey) {
        syncChatUpdatedOnboardingSlot(
          userId,
          saved.id,
          addOptions.slotKey,
          saved.text,
        );
      }
      record.memoryProposal.status = 'saved';
      record.memoryProposal.savedMemoryId = saved.id;
      record.memoryProposal.text = saved.text;
      record.memoryProposal.appliedChanges = applied;
      record.envelope.phase = 'done';
      record.status = 'result';
      DeviceEventEmitter.emit(CHAT_MEMORY_CHANGED_EVENT, {
        userId,
        messageId: actionId,
        changes: applied,
      });
      this.emit(
        actionId,
        record.envelope.kind,
        'done',
        'Memory saved successfully',
      );
      return {success: true, status: 'saved', memoryId: saved.id};
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      record.memoryProposal.status = 'failed';
      record.envelope.phase = 'failed';
      this.emit(actionId, record.envelope.kind, 'failed', msg);
      return {success: false, status: 'failed', error: msg};
    }
  }

  undoMemoryProposal(
    userId: string,
    actionId: string,
  ): {success: boolean; status: MemoryProposalStatus; error?: string} {
    const record = this.actions.get(actionId);
    if (!record) {
      return {success: false, status: 'failed', error: 'Action not found'};
    }
    if (record.envelope.ownerId !== userId) {
      return {
        success: false,
        status: 'failed',
        error: 'Unauthorized: owner mismatch',
      };
    }
    if (!record.memoryProposal?.savedMemoryId) {
      return {
        success: false,
        status: 'failed',
        error: 'No saved memory found to undo',
      };
    }

    try {
      const removedId = record.memoryProposal.savedMemoryId;
      const removedText = record.memoryProposal.text;
      const appliedChanges = record.memoryProposal.appliedChanges ?? null;
      if (appliedChanges) {
        chatMemoryStore.undoChanges(userId, appliedChanges);
        for (const added of appliedChanges.added) {
          reconcileDeletedMemory(userId, added.id);
        }
        reconcileRestoredMemories(userId, appliedChanges.removed);
      } else {
        chatMemoryStore.remove(userId, removedId);
        reconcileDeletedMemory(userId, removedId);
      }
      record.memoryProposal.status = 'undone';
      record.memoryProposal.savedMemoryId = null;
      record.memoryProposal.appliedChanges = null;
      DeviceEventEmitter.emit(CHAT_MEMORY_CHANGED_EVENT, {
        userId,
        messageId: actionId,
        changes: {
          added: [],
          removed: [{id: removedId, text: removedText}],
          revision: chatMemoryStore.revision(userId),
          undone: true,
        },
      });
      this.emit(actionId, record.envelope.kind, 'done', 'Memory save undone');
      return {success: true, status: 'undone'};
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return {success: false, status: 'failed', error: msg};
    }
  }

  cancelMemoryProposal(
    userId: string,
    actionId: string,
  ): {success: boolean; status: MemoryProposalStatus} {
    const record = this.actions.get(actionId);
    if (!record || record.envelope.ownerId !== userId) {
      return {success: false, status: 'failed'};
    }
    if (record.memoryProposal) {
      record.memoryProposal.status = 'canceled';
    }
    record.envelope.phase = 'canceled';
    this.emit(
      actionId,
      record.envelope.kind,
      'canceled',
      'User canceled memory proposal',
    );
    return {success: true, status: 'canceled'};
  }

  async confirmMultiActionBatch(
    userId: string,
    batch: MultiActionBatchData,
    targetItemId?: string,
    isCurrent: () => boolean = () => true,
    options: {onDevice?: boolean} = {},
  ): Promise<{batch: MultiActionBatchData; spokenSummary: string}> {
    if (batch.ownerId !== userId) {
      throw new Error('Unauthorized: batch does not belong to user');
    }
    // The cloud-tool check guards cards an online model described. A card the
    // device built from the student's own words (the offline call) needs only
    // the owner and a live session; the student's confirmation is the gate.
    const permitted = () =>
      isCurrent() &&
      !this.retiredSessions.has(batch.sessionId) &&
      (options.onDevice === true || isToolExecutionPermitted(userId).permitted);
    if (!permitted())
      throw new Error('This call action is no longer available.');
    return executeMultiActionBatch(batch, userId, targetItemId, permitted);
  }

  cancelMultiActionBatch(
    userId: string,
    batch: MultiActionBatchData,
  ): {batch: MultiActionBatchData; spokenSummary: string} {
    if (batch.ownerId !== userId) {
      throw new Error('Unauthorized: batch does not belong to user');
    }
    for (const item of batch.items) {
      if (item.status === 'draft' || item.status === 'failed') {
        item.status = 'cancelled';
      }
    }
    batch.status = 'cancelled';
    batch.revision += 1;
    batch.spokenSummary = formatMultiActionSpokenSummary(batch);
    return {batch: {...batch}, spokenSummary: batch.spokenSummary};
  }

  async retryMultiActionItem(
    userId: string,
    batch: MultiActionBatchData,
    itemId: string,
    options: {onDevice?: boolean} = {},
  ): Promise<{batch: MultiActionBatchData; spokenSummary: string}> {
    return this.confirmMultiActionBatch(
      userId,
      batch,
      itemId,
      () => true,
      options,
    );
  }
}

export const actionService = new ActionService();
