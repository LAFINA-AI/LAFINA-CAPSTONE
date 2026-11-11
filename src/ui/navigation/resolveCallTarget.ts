import {db} from '../../storage/database';
import {mapRowToTask, mapRowToEvent} from '../../storage/tasksStore';
import {mapRowToBlock} from '../../storage/timeBlocksStore';
import {notesEditStore} from '../../storage/notesEditStore';
import {remindersStore} from '../../storage/remindersStore';
import type {CallNavigationTarget} from './callNavigation';

/** Re-read the exact local record under the active owner at navigation time. */
export function resolveCallTarget(
  ownerId: string,
  target: CallNavigationTarget,
) {
  if (target.ownerId !== ownerId || !target.entityId) return null;
  if (target.entityKind === 'note') {
    const note = notesEditStore.getSnapshot(ownerId, target.entityId);
    return note ? {kind: 'note' as const, item: note} : null;
  }
  if (target.entityKind === 'reminder') {
    const reminder = remindersStore.getReminderById(target.entityId);
    return reminder?.userId === ownerId
      ? {kind: 'reminder' as const, item: reminder}
      : null;
  }
  // Table names are selected by this allowlist, never by a provider parameter.
  const table =
    target.entityKind === 'task'
      ? 'tasks'
      : target.entityKind === 'event'
      ? 'events'
      : target.entityKind === 'block'
      ? 'time_blocks'
      : null;
  if (!table) return null;
  const row = db.executeSync(
    `SELECT * FROM ${table} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [target.entityId, ownerId],
  ).rows[0];
  if (!row) return null;
  if (target.entityKind === 'task')
    return {kind: 'task' as const, item: mapRowToTask(row)};
  if (target.entityKind === 'event')
    return {kind: 'event' as const, item: mapRowToEvent(row)};
  return {kind: 'block' as const, item: mapRowToBlock(row)};
}
