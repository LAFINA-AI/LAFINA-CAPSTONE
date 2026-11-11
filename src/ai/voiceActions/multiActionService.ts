import {checkScheduleConflict} from './conflictChecker';
import {db} from '../../storage/database';
import {assistantOperationStore} from '../../storage/assistantOperationStore';
import {verifyReminderDelivery} from '../../scheduler/verifyReminderDelivery';
/**
 * Call Lafina 2.0 Multi-Action Workflow & Partial Transaction Service (Phase 11, F-043, F-044, F-045, F-068).
 *
 * Handles:
 * - Parsing grouped spoken requests into individually validated structured drafts (P11-01).
 * - Bounded batch size (max 5 items) protecting memory and CPU (P11-09).
 * - Per-item review, individual item removal, and group confirm (P11-02).
 * - Partial transaction semantics with explicit per-item outcomes (P11-03).
 * - No replay/duplication of previously saved items during retry (P11-03, P11-08).
 * - Context-driven follow-up reminder proposals with explicit user confirmation (P11-04).
 * - Truthful spoken summary reflecting authoritative persistence outcomes (P11-06, F-068).
 */

import {generateId} from '../../utils';
import {parseDateAndTime} from '../nlu/fastPathParser';
import {tasksStore} from '../../storage/tasksStore';
import {remindersStore} from '../../storage/remindersStore';
import {isRealDate, isWallTime} from '../../storage/eventTime';
import {notesStore} from '../../storage/notesStore';
import type {
  MultiActionBatchData,
  MultiActionItemData,
  MultiBatchStatus,
} from './types';

export const MAX_MULTI_ITEMS = 5;

/**
 * Splits compound requests into individual clauses.
 * Examples:
 * - "Add meeting with adviser Friday at 2 PM and remind me Thursday 8 PM"
 * - "Schedule math study group tomorrow at 10 AM, and remind me tonight at 8 PM to do pre-reading"
 * - "Task: submit assignment on Friday; reminder: check grades on Monday at 9 AM"
 */
export function splitGroupedClauses(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];

  // Split on semicolons or conjunctions preceded/followed by action markers
  const rawSplits = normalized.split(
    /(?:;\s*|,\s*(?:and|also|plus|then)\s+|\s+(?:and|also|plus|then)\s+(?=(?:remind|schedule|add|create|task|event|note|meeting)\b)|\s+and\s+remind\b)/i,
  );

  const results: string[] = [];
  for (const part of rawSplits) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      results.push(trimmed);
    }
  }

  return results.length > 0 ? results : [normalized];
}

/**
 * Parses grouped spoken requests into structured drafts (P11-01).
 * Preserves quoted titles and individual date/time without guessing missing fields.
 */
export function parseGroupedRequest(
  text: string,
  referenceDate: Date = new Date(),
): {items: MultiActionItemData[]; truncated: boolean; rawSegments: string[]} {
  const clauses = splitGroupedClauses(text);
  const truncated = clauses.length > MAX_MULTI_ITEMS;
  const targetClauses = clauses.slice(0, MAX_MULTI_ITEMS);

  const items: MultiActionItemData[] = targetClauses.map((clause, index) => {
    // 1. Check for quoted title: e.g. "Meeting with Adviser" or 'Study Session'
    let title = '';
    const quoteMatch = clause.match(/["']([^"']+)["']/);
    if (quoteMatch) {
      title = quoteMatch[1].trim();
    }

    // 2. Determine kind based on keywords
    let kind: MultiActionItemData['kind'] = 'task';
    const lower = clause.toLowerCase();
    if (
      lower.startsWith('remind') ||
      lower.includes('remind me') ||
      lower.includes('reminder:')
    ) {
      kind = 'reminder';
    } else if (
      lower.includes('event') ||
      lower.includes('meeting') ||
      lower.includes('lecture') ||
      lower.includes('class') ||
      lower.includes('schedule')
    ) {
      kind = 'event';
    } else if (
      lower.includes('note') ||
      lower.includes('write down') ||
      lower.includes('jot down')
    ) {
      kind = 'note';
    }

    // 3. Extract date & time
    const parsedDt = parseDateAndTime(clause, referenceDate);
    const date = parsedDt.date || undefined;
    const time = parsedDt.time || undefined;
    const endTime = parsedDt.endTime || undefined;

    // 4. Extract title if not explicitly quoted
    if (!title) {
      let cleaned = clause
        // Remove leading action verbs
        .replace(
          /^(?:please\s+)?(?:add|schedule|create|remind\s+me(?:\s+to)?|make\s+a|task:|event:|reminder:|note:)\s*/i,
          '',
        )
        // Remove date/time phrases
        .replace(
          /\b(?:on|at|by|this|next|tomorrow|today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*$/i,
          '',
        )
        .trim();

      // Clean trailing punctuation
      cleaned = cleaned.replace(/[.,;]+$/, '').trim();
      title = cleaned.length > 0 ? cleaned : `Action ${index + 1}`;
      // Capitalize first letter
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    return {
      id: `item-${index + 1}-${generateId().slice(0, 6)}`,
      kind,
      title,
      date,
      time,
      endTime,
      priority: 'medium',
      body: kind === 'note' ? clause : undefined,
      status: 'draft',
      savedEntityId: null,
      error: null,
    };
  });

  return {
    items,
    truncated,
    rawSegments: targetClauses,
  };
}

/** Ground calendar warnings before the student approves a grouped item. */
export function refreshMultiItemConflict(
  ownerId: string,
  item: MultiActionItemData,
): void {
  item.scheduleWarning = undefined;
  if (
    item.kind !== 'event' ||
    !item.date ||
    !isRealDate(item.date) ||
    !item.time ||
    !isWallTime(item.time) ||
    !item.endTime ||
    !isWallTime(item.endTime)
  )
    return;
  try {
    const result = checkScheduleConflict(
      ownerId,
      item.date,
      item.time,
      item.endTime,
    );
    item.scheduleWarning = result.warningMessage;
  } catch {
    item.scheduleWarning =
      'Schedule could not be checked. Try again before saving.';
  }
}

/**
 * Creates a new multi-action batch container.
 */
export function createMultiActionBatch(
  sessionId: string,
  ownerId: string,
  items: MultiActionItemData[],
  truncated = false,
): MultiActionBatchData {
  const cappedItems = items.slice(0, MAX_MULTI_ITEMS);
  cappedItems.forEach(item => refreshMultiItemConflict(ownerId, item));
  return {
    id: `batch-${generateId()}`,
    sessionId,
    ownerId,
    revision: 1,
    items: cappedItems,
    status: 'draft',
    truncated: truncated || items.length > MAX_MULTI_ITEMS,
  };
}

/**
 * Proposes a context-driven follow-up reminder for an event or task (P11-04).
 * Explicit user confirmation is strictly required before saving.
 */
export function proposeFollowUpReminder(
  parentItem: {title: string; date?: string; time?: string},
  minutesBefore = 15,
): MultiActionItemData {
  let triggerDate = parentItem.date;
  let triggerTime = parentItem.time;

  if (parentItem.date && parentItem.time) {
    try {
      const dt = new Date(`${parentItem.date}T${parentItem.time}:00`);
      if (!isNaN(dt.getTime())) {
        dt.setMinutes(dt.getMinutes() - minutesBefore);
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        const hh = String(dt.getHours()).padStart(2, '0');
        const min = String(dt.getMinutes()).padStart(2, '0');
        triggerDate = `${yyyy}-${mm}-${dd}`;
        triggerTime = `${hh}:${min}`;
      }
    } catch {
      // fallback to parent date/time
    }
  }

  return {
    id: `followup-${generateId().slice(0, 8)}`,
    kind: 'reminder',
    title: `Reminder: ${parentItem.title}`,
    date: triggerDate,
    time: triggerTime,
    followUp: true,
    status: 'draft',
    savedEntityId: null,
    error: null,
  };
}

/**
 * Formulates a truthful spoken summary reflecting authoritative outcomes (P11-06, F-068).
 */
export function formatMultiActionSpokenSummary(
  batch: MultiActionBatchData,
): string {
  const saved = batch.items.filter(i => i.status === 'saved');
  const failed = batch.items.filter(i => i.status === 'failed');

  if (batch.status === 'saved') {
    const unregistered = saved.filter(
      item => item.kind === 'reminder' && item.deliveryStatus !== 'registered',
    ).length;
    return `All ${saved.length} items saved successfully.${
      unregistered
        ? ` ${unregistered} reminder alarm registration(s) are not verified. Check reminder delivery settings.`
        : ''
    }`;
  }

  if (batch.status === 'partial') {
    const pending = batch.items.filter(
      i => i.status === 'draft' || i.status === 'saving',
    ).length;
    if (pending && !failed.length)
      return `${saved.length} item(s) saved. ${pending} item(s) were not saved because the call stopped.`;
    const failedNames = failed.map(f => `"${f.title}"`).join(', ');
    return `${saved.length} item${saved.length === 1 ? '' : 's'} saved, ${
      failed.length
    } failed: ${failedNames}. You can review and retry the failed items.`;
  }

  if (batch.status === 'failed') {
    const errorDetails = failed[0]?.error ? ` Error: ${failed[0].error}.` : '';
    return `Failed to save ${failed.length} items.${errorDetails}`;
  }

  if (batch.status === 'cancelled') {
    return saved.length
      ? `${saved.length} item(s) remain saved. The remaining items were cancelled.`
      : 'All items in the batch were cancelled.';
  }

  return `${batch.items.length} items prepared for review: ${batch.items
    .map(i => i.title)
    .join(', ')}.`;
}

/**
 * Executes persistence for a multi-action batch with partial transactional semantics (P11-03).
 * If targetItemId is provided, only executes/retries that single item.
 * Never replays or duplicates already-saved items.
 */
export async function executeMultiActionBatch(
  batch: MultiActionBatchData,
  ownerId: string,
  targetItemId?: string,
  isCurrent: () => boolean = () => true,
): Promise<{batch: MultiActionBatchData; spokenSummary: string}> {
  if (batch.ownerId !== ownerId) {
    throw new Error('Unauthorized: batch does not belong to requesting user');
  }

  const itemsToProcess = targetItemId
    ? batch.items.filter(i => i.id === targetItemId && i.status === 'failed')
    : batch.items.filter(i => i.status !== 'saved' && i.status !== 'cancelled');

  for (const item of itemsToProcess) {
    if (!isCurrent()) break;
    if (item.status === 'saved' || item.status === 'cancelled') continue;
    item.status = 'saving';
    const operationId = `call-batch:${batch.id}:${item.id}`;
    try {
      if (!['task', 'event', 'reminder', 'note'].includes(item.kind))
        throw new Error('Unsupported item kind.');
      if (!item.title.trim() || item.title.length > 200)
        throw new Error('Please provide a valid title.');
      if (item.date && !isRealDate(item.date))
        throw new Error('Please provide a valid date.');
      if (item.time && !isWallTime(item.time))
        throw new Error('Please provide a valid time.');
      if (
        (item.kind === 'event' || item.kind === 'reminder') &&
        (!item.date || !item.time)
      )
        throw new Error('Please specify the date and time before saving.');
      if (item.kind === 'event' && (!item.endTime || !isWallTime(item.endTime)))
        throw new Error('Please specify a valid end time.');
      if (item.kind === 'event') {
        const reviewedWarning = item.scheduleWarning;
        refreshMultiItemConflict(ownerId, item);
        if (
          item.scheduleWarning?.startsWith('Schedule could not') ||
          item.scheduleWarning !== reviewedWarning
        )
          throw new Error(
            'Schedule changed or could not be checked. Review the warning before retrying.',
          );
      }
      db.transactionSync(tx => {
        const receipt = assistantOperationStore.getReceipt(operationId, tx);
        if (receipt) {
          if (receipt.userId !== ownerId)
            throw new Error('Saved operation owner mismatch.');
          item.status = 'saved';
          item.savedEntityId = receipt.entityId;
          item.error = null;
          return;
        }
        if (item.kind === 'task') {
          const taskId = generateId();
          tasksStore.insertTask(
            {
              id: taskId,
              userId: ownerId,
              title: item.title,
              dueDate: item.date || null,
              dueTime: item.time || null,
              isCompleted: false,
              priority:
                item.priority === 'high'
                  ? 'High'
                  : item.priority === 'low'
                  ? 'Low'
                  : 'Medium',
              category: 'Personal',
              notes: item.body || null,
              recurrenceRule: null,
            },
            tx,
          );
          item.status = 'saved';
          item.savedEntityId = taskId;
          item.error = null;
        } else if (item.kind === 'event') {
          const eventId = generateId();
          const eventDate = item.date!;
          tasksStore.insertEvent(
            {
              id: eventId,
              userId: ownerId,
              title: item.title,
              date: eventDate,
              startTime: item.time!,
              endTime: item.endTime!,
              location: item.body || null,
              recurrenceRule: null,
            },
            tx,
          );
          item.status = 'saved';
          item.savedEntityId = eventId;
          item.error = null;
        } else if (item.kind === 'reminder') {
          const reminderId = generateId();
          const triggerDate = item.date!;
          const triggerTime = item.time!;
          remindersStore.insertReminder(
            {
              id: reminderId,
              userId: ownerId,
              task: item.title,
              description: item.body || null,
              scheduledAt: `${triggerDate}T${triggerTime}:00`,
              triggerAt: `${triggerDate}T${triggerTime}:00`,
              status: 'pending',
              preCastAudioPath: null,
            },
            tx,
          );
          item.status = 'saved';
          item.savedEntityId = reminderId;
          item.error = null;
        } else if (item.kind === 'note') {
          const noteId = generateId();
          notesStore.insert(
            {
              id: noteId,
              userId: ownerId,
              title: item.title,
              body: item.body || item.title,
              isPinned: false,
              tags: ['voice'],
              category: 'Personal',
              isVoiceTranscribed: true,
              imageUri: null,
              sortOrder: 0,
            },
            tx,
          );
          item.status = 'saved';
          item.savedEntityId = noteId;
          item.error = null;
        }
        assistantOperationStore.insertReceipt(
          {
            operationId,
            userId: ownerId,
            intent: `create_${item.kind}`,
            operation: 'create',
            entityType: item.kind,
            entityId: item.savedEntityId || null,
            reminderId:
              item.kind === 'reminder' ? item.savedEntityId || null : null,
            reply: 'Saved locally.',
          },
          tx,
        );
      });
      if (item.kind === 'reminder' && item.savedEntityId) {
        const delivery = await verifyReminderDelivery(
          ownerId,
          item.savedEntityId,
        );
        item.deliveryStatus = delivery.status;
        item.deliveryMessage = delivery.message;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      item.status = 'failed';
      item.savedEntityId = null;
      item.error = message;
    }
  }

  // Update overall batch status
  const savedCount = batch.items.filter(i => i.status === 'saved').length;
  const failedCount = batch.items.filter(i => i.status === 'failed').length;
  const cancelledCount = batch.items.filter(
    i => i.status === 'cancelled',
  ).length;
  const totalActive = batch.items.length - cancelledCount;

  let newStatus: MultiBatchStatus = 'draft';
  if (savedCount === totalActive && totalActive > 0) {
    newStatus = 'saved';
  } else if (savedCount > 0) {
    newStatus = 'partial';
  } else if (failedCount === totalActive && totalActive > 0) {
    newStatus = 'failed';
  } else if (cancelledCount === batch.items.length) {
    newStatus = 'cancelled';
  }

  batch.status = newStatus;
  batch.spokenSummary = formatMultiActionSpokenSummary(batch);

  return {
    batch: {...batch},
    spokenSummary: batch.spokenSummary,
  };
}

/**
 * Revises a specific item inside the multi-action batch (P11-07).
 */
export function reviseMultiItem(
  batch: MultiActionBatchData,
  itemId: string,
  patch: Partial<MultiActionItemData>,
): MultiActionBatchData {
  const target = batch.items.find(i => i.id === itemId);
  if (!target || ['saved', 'saving', 'cancelled'].includes(target.status))
    return batch;

  for (const key of Object.keys(patch))
    if (!['title', 'date', 'time', 'endTime', 'body', 'priority'].includes(key))
      throw new Error('Unsupported grouped edit.');
  Object.assign(target, patch);
  refreshMultiItemConflict(batch.ownerId, target);
  batch.revision += 1;
  return {...batch};
}

/**
 * Cancels a specific item from the batch without cancelling the remaining items.
 */
export function cancelMultiItem(
  batch: MultiActionBatchData,
  itemId: string,
): MultiActionBatchData {
  const target = batch.items.find(i => i.id === itemId);
  if (!target) return batch;

  if (target.status === 'saved' || target.status === 'saving') return batch;
  target.status = 'cancelled';
  batch.revision += 1;

  const nonCancelled = batch.items.filter(i => i.status !== 'cancelled');
  if (nonCancelled.length === 0) {
    batch.status = 'cancelled';
  }

  return {...batch};
}
