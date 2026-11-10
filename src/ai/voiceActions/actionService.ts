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
} from './types';
import {isToolExecutionPermitted} from './actionSecurity';
import {getRegisteredTool} from './actionRegistry';
import {validatePayload} from './actionValidator';
import {readLocalVoiceData} from '../../cloud/voiceConversation/localVoiceData';
import {chatOrchestrator} from '../chatOrchestrator';
import type {SpokenTurnReview} from '../chatOrchestrator';

export interface ActionRecord {
  envelope: ActionEnvelope;
  status: ActionCardStatus;
  createdEpoch: number;
  updatedEpoch: number;
  reviewResult?: SpokenTurnReview;
  result?: string;
  error?: string;
}

export type ActionLifecycleListener = (event: ActionLifecycleEvent) => void;

export interface ExecuteToolOptions {
  sourceTurnId?: string;
  onProposal?: (review: SpokenTurnReview) => void;
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
        toolDef.kind === 'note.search'
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
        }

        envelope.phase = 'done';
        record.status = 'result';
        record.result = resultStr;
        record.updatedEpoch = Date.now();
        this.emit(actionId, toolDef.kind, 'done');
        return resultStr;
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
}

export const actionService = new ActionService();
