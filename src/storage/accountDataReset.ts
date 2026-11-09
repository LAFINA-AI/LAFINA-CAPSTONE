import {db} from './database';
import type {DatabaseTransaction} from './database';
import {readSessionEpoch} from './sessionEpoch';
import {notesStore} from './notesStore';
import {tasksStore} from './tasksStore';
import {timeBlocksStore} from './timeBlocksStore';
import {remindersStore} from './remindersStore';
import {chatStore} from './chatStore';
import {chatMemoryStore} from './chatMemoryStore';
import {personalMemoryStore} from './personalMemoryStore';
import {
  attachmentCleanupTarget,
  pendingAttachmentCleanup,
  recordAttachmentCleanup,
  runAttachmentCleanup,
} from './attachmentCleanup';
import type {AttachmentCleanupResult} from './attachmentCleanup';

/**
 * Profile "Clear All Data" as one owner-bound operation (remediation audit,
 * codex-remediation-audit-7b3b183-20261106.md; ADR-025).
 *
 * P1: the confirmation carries a `DataResetAuthority` captured when it was
 * opened: the owner and the sign-in (session epoch) it belongs to. The reset
 * admits it only while that sign-in is still current and the caller's screen
 * is still alive (`isCurrent`), checked here, not only in the UI, before any
 * write and again inside the planner transaction. A refused reset changes
 * nothing.
 *
 * P2: every step reports what it confirmed. Records are listed with strict
 * reads (a failed read throws, never looks empty) and deleted through the
 * stores' own deletes, so soft-delete tombstones, sync outbox mutations and
 * reminder cleanup are unchanged. The planner step is one transaction and is
 * verified before commit: it either removes all of this owner's planner
 * records or none.
 *
 * Synchronous from authorization to the last write: no other JavaScript can
 * change the session in between. Device settings (offline voice, theme, time
 * format) are not touched.
 *
 * Clear-data audit C1 (ADR-026): chat attachment files are recorded as durable
 * owner-bound cleanup obligations in the same transaction that deletes their
 * messages, then removed by `finishAttachmentCleanup`, which retries every
 * obligation this owner still has, including ones from earlier attempts.
 */

export interface DataResetAuthority {
  readonly userId: string;
  readonly epoch: string;
}

export type DataResetStep = 'cleared' | 'failed';

export type DataResetOutcome =
  | {admitted: false}
  | {
      admitted: true;
      /** Notes, tasks, events, calendar blocks and reminders, all or none. */
      planner: DataResetStep;
      chat: DataResetStep;
      /** Saved event defaults (personalMemoryStore.clearForDataReset). */
      defaults: DataResetStep;
      /**
       * Attachment references of the cleared messages that are not files this
       * app stores (see attachmentCleanupTarget); left untouched, not recorded.
       */
      refusedAttachments: number;
    };

class DataResetRefused extends Error {
  constructor() {
    super('The account or screen changed; nothing was cleared.');
    this.name = 'DataResetRefused';
  }
}

/**
 * Captures the authority for one confirmation. Null when `userId` is not the
 * signed-in owner, nobody is signed in, or the session cannot be read.
 */
export const authorizeDataReset = (
  userId: string,
): DataResetAuthority | null => {
  try {
    const session = readSessionEpoch();
    return session && session.userId === userId
      ? {userId, epoch: session.epoch}
      : null;
  } catch (error) {
    console.warn('[DataReset] Could not read the current session:', error);
    return null;
  }
};

const stillAdmitted = (
  authority: DataResetAuthority,
  isCurrent: () => boolean,
  executor: Pick<DatabaseTransaction, 'executeSync'> = db,
): boolean => {
  try {
    if (!isCurrent()) return false;
    const session = readSessionEpoch(executor);
    return (
      !!session &&
      session.userId === authority.userId &&
      session.epoch === authority.epoch
    );
  } catch {
    return false;
  }
};

const PLANNER_LEFT = [
  'SELECT COUNT(*) AS n FROM notes WHERE user_id = ? AND deleted_at IS NULL',
  'SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND deleted_at IS NULL',
  'SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND deleted_at IS NULL',
  'SELECT COUNT(*) AS n FROM time_blocks WHERE user_id = ? AND deleted_at IS NULL',
  'SELECT COUNT(*) AS n FROM reminders WHERE user_id = ? AND deleted_at IS NULL',
  'SELECT COUNT(*) AS n FROM user_behavior_logs WHERE user_id = ?',
  'SELECT COUNT(*) AS n FROM ml_feature_snapshots WHERE user_id = ?',
];

const clearPlanner = (tx: DatabaseTransaction, userId: string): void => {
  for (const note of notesStore.getAllOrThrow(userId, tx))
    notesStore.delete(note.id, tx);
  // Task, event and block deletes also retire their own reminders and cancel
  // them natively after the commit, exactly as a single delete does.
  for (const task of tasksStore.getAllTasksOrThrow(userId, tx))
    tasksStore.deleteTask(task.id, tx);
  for (const event of tasksStore.getAllEventsOrThrow(userId, tx))
    tasksStore.deleteEvent(event.id, tx);
  for (const block of timeBlocksStore.getAllOrThrow(userId, tx))
    timeBlocksStore.delete(block.id, tx);
  for (const reminder of remindersStore.getAllRemindersOrThrow(userId, tx)) {
    remindersStore.deleteReminder(reminder.id, tx);
  }
  // The new ML history is personal derived data, not a device preference.
  tx.executeSync('DELETE FROM user_behavior_logs WHERE user_id = ?', [userId]);
  tx.executeSync('DELETE FROM ml_feature_snapshots WHERE user_id = ?', [
    userId,
  ]);
  // Confirmed, not inferred: anything still live rolls the whole step back.
  for (const sql of PLANNER_LEFT) {
    const left = Number(
      tx.executeSync(sql, [userId]).rows?.[0]?.n ?? Number.NaN,
    );
    if (left !== 0)
      throw new Error('Clear All Data left planner records behind.');
  }
};

/**
 * Runs the reset for an authority from `authorizeDataReset`. `isCurrent` is
 * the confirming screen's liveness (false once it unmounted). Returns
 * `{admitted: false}` (nothing changed) for a stale or absent authority.
 */
export const resetPersonalData = (
  authority: DataResetAuthority | null,
  isCurrent: () => boolean = () => true,
): DataResetOutcome => {
  if (!authority || !stillAdmitted(authority, isCurrent))
    return {admitted: false};
  const {userId} = authority;

  let planner: DataResetStep;
  try {
    db.transactionSync(tx => {
      if (!stillAdmitted(authority, isCurrent, tx))
        throw new DataResetRefused();
      clearPlanner(tx, userId);
    });
    planner = 'cleared';
  } catch (error) {
    if (error instanceof DataResetRefused) return {admitted: false};
    console.warn(
      '[DataReset] Planner data was not cleared (rolled back):',
      error,
    );
    planner = 'failed';
  }

  let chat: DataResetStep = 'failed';
  let refusedAttachments = 0;
  if (stillAdmitted(authority, isCurrent)) {
    try {
      refusedAttachments = db.transactionSync(tx => {
        if (!stillAdmitted(authority, isCurrent, tx))
          throw new DataResetRefused();
        // Only this owner's own conversation and generated files.
        const targets = new Set<string>();
        const refused = new Set<string>();
        for (const uri of chatStore.getAttachmentUris(userId, tx)) {
          const target = attachmentCleanupTarget(uri);
          if (target) targets.add(target);
          else refused.add(uri);
        }
        // Saved with the delete: the only reference to a file is never lost
        // before the obligation to remove it is durable (ADR-026).
        recordAttachmentCleanup(tx, userId, targets);
        chatStore.clearHistory(userId, tx);
        // What LAFINA remembered from those chats goes with them.
        chatMemoryStore.clear(userId, tx);
        return refused.size;
      });
      chat = 'cleared';
    } catch (error) {
      if (!(error instanceof DataResetRefused)) {
        console.warn(
          '[DataReset] Chat history was not cleared (rolled back):',
          error,
        );
      }
    }
  }

  let defaults: DataResetStep = 'failed';
  if (stillAdmitted(authority, isCurrent)) {
    try {
      // Codex audit A3: saved event defaults are personal scheduling memory.
      personalMemoryStore.clearForDataReset(userId);
      defaults = 'cleared';
    } catch (error) {
      console.warn(
        '[DataReset] Saved event defaults were not forgotten:',
        error,
      );
    }
  }

  return {admitted: true, planner, chat, defaults, refusedAttachments};
};

/**
 * True when `authority`'s owner has saved attachment cleanup (or it cannot be
 * read), so the caller only waits for files when there are files to remove.
 */
export const hasAttachmentCleanup = (
  authority: DataResetAuthority,
): boolean => {
  try {
    return pendingAttachmentCleanup(authority.userId).length > 0;
  } catch {
    return true; // unknown: the pass runs and reports what it can confirm
  }
};

/**
 * After an admitted reset: one bounded pass over every attachment cleanup
 * obligation `authority`'s owner still has, including ones left by earlier
 * attempts. It stops as soon as that sign-in is no longer current, leaving the
 * rest saved for the owner's next Clear All Data; it never touches another
 * owner's obligations or files.
 */
export const finishAttachmentCleanup = (
  authority: DataResetAuthority,
): Promise<AttachmentCleanupResult> =>
  runAttachmentCleanup(authority.userId, () =>
    stillAdmitted(authority, () => true),
  );
