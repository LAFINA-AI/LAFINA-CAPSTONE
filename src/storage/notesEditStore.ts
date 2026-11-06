import {db} from './database';
import type {DatabaseTransaction} from './database';
import {mapRowToNote, notesStore} from './notesStore';
import type {Note} from './notesStore';

/**
 * Owner-bound, revision-checked Note edits (AGY-PORT 07). Adapted from the
 * LAFINA donor `notesEditStore.ts` (blob 98e0b615) onto AGY's schema 20
 * `entity_local_revisions`, where a missing row means revision 0. See ADR-020.
 *
 * An editor, card checklist or delete prompt captures `{id, userId, revision}`
 * when it shows a note. Saving or deleting re-reads the row in one transaction
 * and refuses if the owner changed, the note was deleted, or any writer
 * (another editor, a reviewed assistant command, a sync pull, a guest rekey)
 * moved its revision since. The caller keeps the student's draft.
 */
export interface NoteWriteTarget {
  readonly id: string;
  readonly userId: string;
  readonly revision: number;
}

export interface NoteSnapshot extends Note {
  readonly revision: number;
}

export type NoteEditPatch = Partial<
  Pick<
    Note,
    | 'title'
    | 'body'
    | 'category'
    | 'isPinned'
    | 'tags'
    | 'isVoiceTranscribed'
    | 'imageUri'
  >
>;

export type NoteEditFailure = 'changed' | 'deleted' | 'owner_changed';

/** A refused edit. The message is safe to show and never contains note text. */
export class NoteEditConflictError extends Error {
  readonly reason: NoteEditFailure;

  constructor(reason: NoteEditFailure) {
    super(
      reason === 'owner_changed'
        ? 'The account changed. Your note was not saved.'
        : reason === 'deleted'
        ? 'This note was deleted elsewhere. Your text is still here.'
        : 'This note changed elsewhere. Your text is still here.',
    );
    this.name = 'NoteEditConflictError';
    this.reason = reason;
  }
}

export const isNoteEditConflict = (
  error: unknown,
): error is NoteEditConflictError => error instanceof NoteEditConflictError;

const SNAPSHOT_SQL = `SELECT n.*, COALESCE(r.revision, 0) AS local_revision
  FROM notes n
  LEFT JOIN entity_local_revisions r
    ON r.entity_type = 'note' AND r.entity_id = n.id
  WHERE n.id = ? AND n.user_id = ? AND n.deleted_at IS NULL`;

export const toNoteSnapshot = (row: Record<string, unknown>): NoteSnapshot => ({
  ...mapRowToNote(row),
  revision: Number(row.local_revision ?? 0),
});

const read = (
  userId: string,
  id: string,
  tx: DatabaseTransaction,
): NoteSnapshot | null => {
  const row = tx.executeSync(SNAPSHOT_SQL, [id, userId]).rows?.[0] as
    | Record<string, unknown>
    | undefined;
  return row ? toNoteSnapshot(row) : null;
};

/**
 * A signed-in session that names someone else means the account changed under
 * a retained screen or timer. No session at all (tests, first launch) is not
 * treated as a change: the row's own owner is still checked.
 */
const assertActiveOwner = (userId: string, tx: DatabaseTransaction): void => {
  const active = tx.executeSync('SELECT user_id FROM active_session LIMIT 1')
    .rows?.[0]?.user_id;
  if (!userId || (active != null && String(active) !== userId)) {
    throw new NoteEditConflictError('owner_changed');
  }
};

const requireCurrent = (
  target: NoteWriteTarget,
  tx: DatabaseTransaction,
): NoteSnapshot => {
  if (
    !target.id ||
    !Number.isSafeInteger(target.revision) ||
    target.revision < 0
  ) {
    throw new NoteEditConflictError('changed');
  }
  assertActiveOwner(target.userId, tx);
  const current = read(target.userId, target.id, tx);
  if (!current) {
    const exists = tx.executeSync(
      'SELECT user_id FROM notes WHERE id = ? AND deleted_at IS NULL',
      [target.id],
    ).rows?.[0];
    throw new NoteEditConflictError(
      exists && String(exists.user_id) !== target.userId
        ? 'owner_changed'
        : 'deleted',
    );
  }
  if (current.revision !== target.revision) {
    throw new NoteEditConflictError('changed');
  }
  return current;
};

export const notesEditStore = {
  /** The note as this owner sees it now, with its revision; null if gone. */
  getSnapshot: (
    userId: string,
    id: string,
    executor: DatabaseTransaction = db,
  ): NoteSnapshot | null => read(userId, id, executor),

  /** True while `userId` is still the signed-in account (or no one is). */
  isActiveOwner: (userId: string): boolean => {
    try {
      assertActiveOwner(userId, db);
      return true;
    } catch {
      return false;
    }
  },

  /** Creates a note for an owner that is still active; returns its snapshot. */
  create: (draft: Parameters<typeof notesStore.insert>[0]): NoteSnapshot =>
    db.transactionSync(tx => {
      assertActiveOwner(draft.userId, tx);
      notesStore.insert(draft, tx);
      const created = read(draft.userId, draft.id, tx);
      if (!created) throw new Error('The note could not be read back.');
      return created;
    }),

  /** Saves only over the exact revision the student saw. */
  save: (target: NoteWriteTarget, changes: NoteEditPatch): NoteSnapshot =>
    db.transactionSync(tx => {
      requireCurrent(target, tx);
      notesStore.update({...changes, id: target.id}, tx);
      const saved = read(target.userId, target.id, tx);
      if (!saved) throw new Error('The note could not be read back.');
      return saved;
    }),

  /** Soft-deletes only the revision the student reviewed. */
  remove: (target: NoteWriteTarget): void =>
    db.transactionSync(tx => {
      requireCurrent(target, tx);
      notesStore.delete(target.id, tx);
    }),
};
