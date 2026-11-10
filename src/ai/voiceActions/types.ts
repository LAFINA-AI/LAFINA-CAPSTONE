/**
 * Call Lafina 2.0 Action Engine: Types and Envelopes (SPEC/ARCHITECTURE_AND_TOOLS.md).
 *
 * Replaces unstructured text parsing with strictly validated, discriminated action
 * envelopes and lifecycle events.
 */

export type LafinaActionKind =
  | 'calendar.read'
  | 'calendar.prepare'
  | 'task.prepare'
  | 'reminder.prepare'
  | 'note.search'
  | 'note.prepare'
  | 'memory.read'
  | 'memory.prepare'
  | 'draft.revise'
  | 'draft.cancel'
  | 'draft.confirm'
  | 'multi.prepare'
  | 'legacy.read_data'
  | 'legacy.prepare_action'
  | 'legacy.save_memory';

export type LafinaActionPhase =
  | 'requested'
  | 'checking'
  | 'preparing'
  | 'waiting'
  | 'confirming'
  | 'saving'
  | 'done'
  | 'canceled'
  | 'failed'
  | 'expired'
  | 'partial';

export type ActionCardStatus =
  | 'prepare'
  | 'edit'
  | 'cancel'
  | 'confirm'
  | 'result'
  | 'failed'
  | 'expired';

export interface ActionLifecycleEvent {
  actionId: string;
  kind: LafinaActionKind;
  phase: LafinaActionPhase;
  timestamp: number;
  details?: string;
}

export interface ActionEnvelope<T = unknown> {
  schemaVersion: 1;
  actionId: string;
  sessionId: string;
  ownerId: string;
  sourceTurnId: string;
  kind: LafinaActionKind;
  phase: LafinaActionPhase;
  cardId?: string;
  cardRevision?: number;
  payload: T;
  details?: Record<string, unknown>;
}

export interface CalendarReadPayload {
  query?: string;
  date?: string;
  start?: string;
  end?: string;
}

export interface CalendarPreparePayload {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  location?: string;
}

export interface TaskPreparePayload {
  title: string;
  dueDate?: string;
  dueTime?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface ReminderPreparePayload {
  title: string;
  triggerDate: string;
  triggerTime: string;
  repeatInterval?: string;
}

export interface NoteSearchPayload {
  query: string;
  limit?: number;
}

export interface NotePreparePayload {
  title: string;
  body: string;
}

export interface MemoryReadPayload {
  query?: string;
}

export interface MemoryPreparePayload {
  text: string;
}

export interface DraftRevisePayload {
  cardId: string;
  revision: number;
  instruction: string;
}

export interface DraftConfirmPayload {
  cardId: string;
  revision: number;
}

export interface DraftCancelPayload {
  cardId: string;
  revision: number;
}

export interface MultiPrepareItem {
  kind: LafinaActionKind;
  payload: Record<string, unknown>;
}

export interface MultiPreparePayload {
  items: MultiPrepareItem[];
}

