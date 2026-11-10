/**
 * Action Phase Service & Lifecycle Manager (P06-04, P06-05, P06-07).
 *
 * Coordinates validated action envelopes, lifecycle event feeds, and
 * transaction-safe card confirmations with strict owner isolation and isCurrent guards.
 */

import {generateId} from '../../utils';
import type {
  ActionEnvelope,
  ActionLifecycleEvent,
  ActionCardStatus,
  LafinaActionKind,
  LafinaActionPhase,
  MemoryProposalData,
  MemoryProposalStatus,
  DraftRevisePayload,
  DraftConfirmPayload,
  DraftCancelPayload,
  MultiActionBatchData,
  MultiActionItemData,
} from './types';
import {isToolExecutionPermitted, containsPromptInjection} from './actionSecurity';
import {getRegisteredTool} from './actionRegistry';
import {validatePayload} from './actionValidator';
import {readLocalVoiceData} from '../../cloud/voiceConversation/localVoiceData';
import {chatOrchestrator} from '../chatOrchestrator';
import type {SpokenTurnReview} from '../chatOrchestrator';
import {chatMemoryStore} from '../../storage/chatMemoryStore';
import {draftRegistry} from './draftRegistry';
import {
  parseGroupedRequest,
  createMultiActionBatch,
  proposeFollowUpReminder,
  executeMultiActionBatch,
  formatMultiActionSpokenSummary,
} from './multiActionService';

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
  sourceTurnId?: string;
  onProposal?: (review: SpokenTurnReview) => void;
  onMemoryProposal?: (proposal: MemoryProposalData) => void;
  onMultiActionBatch?: (batch: MultiActionBatchData) => void;
}

class ActionService {
  private actions = new Map<string, ActionRecord>();
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

  getAction(actionId: string): ActionRecord | undefined {
    return this.actions.get(actionId);
  }

  clearSessionActions(sessionId: string): void {
    draftRegistry.clearSessionDrafts(sessionId);
    for (const [id, record] of this.actions.entries()) {
      if (record.envelope.sessionId === sessionId) {
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
    // 1. Authenticated owner security check
    const perm = isToolExecutionPermitted(userId);
    if (!perm.permitted) {
      return `Tool execution not permitted: ${perm.reason || 'Unauthorized'}`;
    }

    // 2. Tool registration check
    const toolDef = getRegisteredTool(name);
    if (!toolDef) {
      return `Tool '${name}' is not supported by LAFINA.`;
    }

    // 3. Payload validation
    const valResult = validatePayload(toolDef.kind, parameters);
    if (!valResult.valid) {
      return `Invalid parameters for '${name}': ${valResult.error}`;
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
    this.actions.set(actionId, record);

    // 4. Execution branching
    try {
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
          this.emit(actionId, toolDef.kind, 'canceled', 'Turn changed or cancelled.');
          return 'Request cancelled because conversational turn updated.';
        }

        let resultStr = '';
        if (toolDef.kind === 'legacy.read_data') {
          const p = envelope.payload as {kind: string; query?: string};
          resultStr = readLocalVoiceData(userId, p.kind, p.query);
        } else if (toolDef.kind === 'calendar.read') {
          const p = envelope.payload as {query?: string; date?: string};
          resultStr = readLocalVoiceData(userId, 'calendar', p.date || p.query);
        } else if (toolDef.kind === 'note.search') {
          const p = envelope.payload as {query: string};
          resultStr = readLocalVoiceData(userId, 'notes', p.query);
        } else if (toolDef.kind === 'memory.read') {
          const p = envelope.payload as {query?: string};
          resultStr = readLocalVoiceData(userId, 'memory', p.query);
        }

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
          this.emit(actionId, toolDef.kind, 'canceled', 'Turn changed or cancelled.');
          return 'Request cancelled because conversational turn updated.';
        }

        if (!chatMemoryStore.isEnabled(userId)) {
          envelope.phase = 'failed';
          record.status = 'failed';
          record.error = 'Memory is turned off in Settings.';
          this.emit(actionId, toolDef.kind, 'failed', 'Memory is turned off in Settings.');
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
        envelope.phase = 'waiting';
        record.status = 'prepare';
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'waiting', 'Memory review card presented to student.');
        options?.onMemoryProposal?.(memProp);
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
          this.emit(actionId, toolDef.kind, 'canceled', 'Turn changed or cancelled.');
          return 'Request cancelled because conversational turn updated.';
        }

        const p = envelope.payload as {request: string};
        const review = await chatOrchestrator.reviewSpokenTurn(userId, p.request);

        if (!isCurrent()) {
          envelope.phase = 'canceled';
          this.emit(actionId, toolDef.kind, 'canceled', 'Turn changed during review.');
          return 'Review prepared but superseded by new turn.';
        }

        record.reviewResult = review;
        record.updatedEpoch = Date.now();
        options?.onProposal?.(review);

        if (review.kind === 'proposal') {
          envelope.phase = 'waiting';
          record.status = 'prepare';
          this.emit(actionId, toolDef.kind, 'waiting', 'Review card presented to student.');
          const pProposal = review.review.status === 'proposal' ? review.review.proposal : null;
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
          return `A review card is shown: ${review.reply} Nothing has been saved. Ask the student to check and confirm the card.`;
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
          this.emit(actionId, toolDef.kind, 'canceled', 'Turn changed or cancelled.');
          return 'Request cancelled because conversational turn updated.';
        }

        const p = envelope.payload as DraftRevisePayload;
        const result = draftRegistry.reviseDraft(userId, p.cardId, p.revision, p.instruction);
        if (result.success) {
          envelope.phase = 'waiting';
          record.status = 'prepare';
          record.result = result.message;
          record.updatedEpoch = Date.now();
          this.emit(actionId, toolDef.kind, 'waiting', result.message);
          return `A review card is shown: ${result.message} Nothing has been saved. Ask the student to check and confirm the card.`;
        }
        envelope.phase = 'failed';
        record.status = 'failed';
        record.error = result.message;
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'failed', result.message);
        return result.message;
      }

      if (toolDef.kind === 'draft.confirm') {
        envelope.phase = 'confirming';
        this.emit(actionId, toolDef.kind, 'confirming');

        const p = envelope.payload as DraftConfirmPayload;
        const result = draftRegistry.confirmDraft(userId, p.cardId, p.revision);
        if (result.success) {
          envelope.phase = 'done';
          record.status = 'result';
          record.updatedEpoch = Date.now();
          this.emit(actionId, toolDef.kind, 'done', 'Draft confirmed successfully.');
          return `The draft for "${result.draft.title}" was confirmed and saved.`;
        }
        envelope.phase = 'failed';
        record.status = 'failed';
        record.error = result.message;
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'failed', result.message);
        return result.message;
      }

      if (toolDef.kind === 'draft.cancel') {
        envelope.phase = 'canceled';
        const p = envelope.payload as DraftCancelPayload;
        const result = draftRegistry.cancelDraft(userId, p.cardId);
        if (result.success) {
          record.status = 'cancel';
          record.updatedEpoch = Date.now();
          this.emit(actionId, toolDef.kind, 'canceled', result.message);
          return result.message;
        }
        envelope.phase = 'failed';
        record.status = 'failed';
        record.error = result.message;
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'failed', result.message);
        return result.message;
      }

      if (toolDef.kind === 'multi.prepare') {
        envelope.phase = 'preparing';
        this.emit(actionId, toolDef.kind, 'preparing');

        const rawPayload = envelope.payload as {text?: string; items?: Array<Record<string, unknown>>};
        let items: MultiActionItemData[] = [];
        let truncated = false;

        if (Array.isArray(rawPayload.items) && rawPayload.items.length > 0) {
          items = rawPayload.items.map((it, idx) => ({
            id: `item-${idx + 1}-${generateId().slice(0, 6)}`,
            kind: (it.kind as MultiActionItemData['kind']) || 'task',
            title: String(it.title || `Action ${idx + 1}`),
            date: it.date ? String(it.date) : undefined,
            time: it.time ? String(it.time) : undefined,
            endTime: it.endTime ? String(it.endTime) : undefined,
            priority: (it.priority as MultiActionItemData['priority']) || 'medium',
            body: it.body ? String(it.body) : undefined,
            status: 'draft',
            savedEntityId: null,
            error: null,
          }));
          if (items.length > 5) {
            items = items.slice(0, 5);
            truncated = true;
          }
        } else if (rawPayload.text) {
          const parsed = parseGroupedRequest(rawPayload.text);
          items = parsed.items;
          truncated = parsed.truncated;
        }

        const batch = createMultiActionBatch(sessionId, userId, items, truncated);
        envelope.phase = 'waiting';
        record.status = 'prepare';
        record.multiActionBatch = batch;
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'waiting', 'Multi-action review card presented to student.');
        options?.onMultiActionBatch?.(batch);

        return `A grouped review card with ${batch.items.length} items is shown: ${batch.items.map(i => i.title).join(', ')}. Nothing has been saved yet. Ask the student to check and confirm the card.`;
      }

      if (toolDef.name === 'propose_follow_up_reminder') {
        envelope.phase = 'preparing';
        this.emit(actionId, toolDef.kind, 'preparing');

        const rawP = envelope.payload as Record<string, unknown>;
        const parentTitle = String(parameters.parentTitle || rawP.title || 'Event');
        const eventDate = String(parameters.date || rawP.triggerDate || rawP.date || '');
        const eventTime = String(parameters.time || rawP.triggerTime || rawP.time || '');
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
        envelope.phase = 'waiting';
        record.status = 'prepare';
        record.multiActionBatch = batch;
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'waiting', 'Follow-up reminder proposal card presented.');
        options?.onMultiActionBatch?.(batch);

        return `A follow-up reminder card is proposed: "${reminderItem.title}" on ${reminderItem.date || 'today'} at ${reminderItem.time || 'scheduled time'}. Nothing has been saved yet. Ask the student if they would like to set this reminder.`;
      }

      return 'Action completed.';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown execution failure';
      envelope.phase = 'failed';
      record.status = 'failed';
      record.error = msg;
      record.updatedEpoch = Date.now();
      this.emit(actionId, toolDef.kind, 'failed', msg);
      return `Failed to execute ${name}: ${msg}`;
    }
  }

  createMemoryProposal(
    userId: string,
    sessionId: string,
    text: string,
    sourceUtterance?: string,
  ): {actionId: string; proposal: MemoryProposalData} {
    const actionId = generateId('act');
    const memProp: MemoryProposalData = {
      id: generateId('mem_prop'),
      text: text.trim(),
      sourceUtterance,
      status: chatMemoryStore.isEnabled(userId) ? 'draft' : 'disabled',
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
  ): {success: boolean; status: MemoryProposalStatus; memoryId?: string; error?: string} {
    const record = this.actions.get(actionId);
    if (!record) {
      return {success: false, status: 'failed', error: 'Action not found'};
    }
    if (record.envelope.ownerId !== userId) {
      return {success: false, status: 'failed', error: 'Unauthorized: owner mismatch'};
    }
    if (!record.memoryProposal) {
      return {success: false, status: 'failed', error: 'No memory proposal attached to action'};
    }
    if (!chatMemoryStore.isEnabled(userId)) {
      record.memoryProposal.status = 'disabled';
      record.envelope.phase = 'failed';
      this.emit(actionId, record.envelope.kind, 'failed', 'Memory is disabled');
      return {success: false, status: 'disabled', error: 'Memory is turned off in Settings.'};
    }

    const textToSave = (editedText ?? record.memoryProposal.text).trim();
    if (textToSave.length < 2 || textToSave.length > 200 || containsPromptInjection(textToSave)) {
      record.memoryProposal.status = 'failed';
      record.envelope.phase = 'failed';
      this.emit(actionId, record.envelope.kind, 'failed', 'Invalid memory text');
      return {success: false, status: 'failed', error: 'Invalid or rejected memory text.'};
    }

    try {
      const saved = chatMemoryStore.add(userId, textToSave);
      if (!saved) {
        record.memoryProposal.status = 'duplicate';
        record.envelope.phase = 'done';
        this.emit(actionId, record.envelope.kind, 'done', 'Duplicate memory');
        return {success: false, status: 'duplicate', error: 'That fact is already in your memory.'};
      }
      record.memoryProposal.status = 'saved';
      record.memoryProposal.savedMemoryId = saved.id;
      record.memoryProposal.text = textToSave;
      record.envelope.phase = 'done';
      record.status = 'result';
      this.emit(actionId, record.envelope.kind, 'done', 'Memory saved successfully');
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
      return {success: false, status: 'failed', error: 'Unauthorized: owner mismatch'};
    }
    if (!record.memoryProposal?.savedMemoryId) {
      return {success: false, status: 'failed', error: 'No saved memory found to undo'};
    }

    try {
      chatMemoryStore.remove(userId, record.memoryProposal.savedMemoryId);
      record.memoryProposal.status = 'undone';
      record.memoryProposal.savedMemoryId = null;
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
    this.emit(actionId, record.envelope.kind, 'canceled', 'User canceled memory proposal');
    return {success: true, status: 'canceled'};
  }

  async confirmMultiActionBatch(
    userId: string,
    batch: MultiActionBatchData,
    targetItemId?: string,
  ): Promise<{batch: MultiActionBatchData; spokenSummary: string}> {
    if (batch.ownerId !== userId) {
      throw new Error('Unauthorized: batch does not belong to user');
    }
    return executeMultiActionBatch(batch, userId, targetItemId);
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
  ): Promise<{batch: MultiActionBatchData; spokenSummary: string}> {
    return this.confirmMultiActionBatch(userId, batch, itemId);
  }
}

export const actionService = new ActionService();
