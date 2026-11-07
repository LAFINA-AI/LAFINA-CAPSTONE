import RNFS from 'react-native-fs';
import { db } from './database';
import type { DatabaseTransaction } from './database';
import { ATTACHMENT_CLEANUP_QUEUE_COLUMN, ATTACHMENT_CLEANUP_TABLE } from './attachmentCleanupSchema';

/**
 * Owner-bound chat attachment cleanup (clear-data audit C1; ADR-026).
 *
 * `recordAttachmentCleanup` runs inside the transaction that deletes the
 * owning chat messages. `runAttachmentCleanup` makes one bounded pass over an
 * owner's saved obligations: a row is retired only after its file is removed
 * or confirmed absent, so a failed removal, a crash or a restart leaves it to
 * be retried by the next Clear All Data. Nothing here loops, polls or runs in
 * the background, and every write is keyed by the owner it was recorded for.
 *
 * Fairness (attachment-cleanup audit C2): obligations wait in a durable
 * per-owner queue (`queue_order`, schema 24). A new obligation joins the back;
 * a pass takes the lowest turns and, before it touches a file, saves the
 * attempt and moves that obligation to the back. Obligations that keep
 * failing, refused saved paths and directories therefore take their turn and
 * yield it, instead of holding the front of the queue on every pass.
 */

type Executor = Pick<DatabaseTransaction, 'executeSync'>;

/** Where `saveGeneratedFile` writes chat documents, under app document storage. */
export const CHAT_FILES_SUBDIR = 'chat_files';

/** Files of other features directly in app document storage; never chat attachments. */
const RESERVED_TOP_LEVEL_FILES = new Set(['calendar_visibility.json', 'imported_batches.json']);

/** A plain file name with an extension; no hidden files, no separators. */
const FILE_NAME = /^[^/.][^/]*\.[A-Za-z0-9]{1,10}$/;

/** One Clear All Data removes at most this many files; the rest stay saved for the next one. */
export const MAX_CLEANUP_PER_RUN = 50;

const QUEUE = ATTACHMENT_CLEANUP_QUEUE_COLUMN;

/** The owner's next turn: behind every obligation the owner already has saved. */
const NEXT_TURN = `(SELECT COALESCE(MAX(${QUEUE}), 0) + 1 FROM ${ATTACHMENT_CLEANUP_TABLE} WHERE user_id = ?)`;

/** Queue order. Ties (equal turns, equal timestamps) fall back to the unique path. */
const IN_TURN = `ORDER BY ${QUEUE} ASC, recorded_at ASC, path ASC`;

/**
 * The local path a chat attachment URI may be cleaned up at, or null when it
 * is refused. Accepted: a regular file name in `chat_files/` (where the app
 * stores generated documents) or directly in the app's private document
 * storage, which the reference-based ownership rule (`chatStore.hasAttachment`)
 * has always treated as the owner's attachment location. Refused: other
 * schemes, relative paths, `.`/`..` or empty segments, control characters,
 * anything outside app document storage, other features' directories (offline
 * models, meeting recordings, avatars and every other nested directory) and
 * their top-level state files. Never a directory.
 */
export const attachmentCleanupTarget = (uri: unknown): string | null => {
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > 1024) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(uri)) return null;
  const path = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  if (!path.startsWith('/')) return null;
  const root = String(RNFS.DocumentDirectoryPath ?? '').replace(/\/+$/, '');
  if (!root.startsWith('/') || !path.startsWith(`${root}/`)) return null;
  const segments = path.slice(root.length + 1).split('/');
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) return null;
  const name = segments[segments.length - 1];
  if (!FILE_NAME.test(name)) return null;
  if (segments.length === 1) return RESERVED_TOP_LEVEL_FILES.has(name) ? null : path;
  return segments.length === 2 && segments[0] === CHAT_FILES_SUBDIR ? path : null;
};

/**
 * Saves obligations in the caller's transaction, each at the back of the
 * owner's queue. Duplicates are ignored: an obligation already saved keeps
 * its place and its attempts.
 */
export const recordAttachmentCleanup = (tx: Executor, userId: string, paths: Iterable<string>): void => {
  const now = new Date().toISOString();
  for (const path of paths) {
    tx.executeSync(
      `INSERT OR IGNORE INTO ${ATTACHMENT_CLEANUP_TABLE} (user_id, path, recorded_at, ${QUEUE}) VALUES (?, ?, ?, ${NEXT_TURN})`,
      [userId, path, now, userId],
    );
  }
};

/** This owner's saved obligations, in queue order. A failed read throws. */
export const pendingAttachmentCleanup = (userId: string, executor: Executor = db): string[] =>
  (
    executor.executeSync(
      `SELECT path FROM ${ATTACHMENT_CLEANUP_TABLE} WHERE user_id = ? ${IN_TURN}`,
      [userId],
    ).rows ?? []
  ).map(row => String(row.path));

/** The first `limit` obligations in this owner's queue. A failed read throws. */
const nextTurns = (userId: string, limit: number): string[] =>
  (
    db.executeSync(
      `SELECT path FROM ${ATTACHMENT_CLEANUP_TABLE} WHERE user_id = ? ${IN_TURN} LIMIT ?`,
      [userId, limit],
    ).rows ?? []
  ).map(row => String(row.path));

/**
 * Saves one attempt before the file is touched: counts it and moves the
 * obligation to the back of the owner's queue. False when the owner no longer
 * holds it (retired, or moved by guest linking, since it was read); a failed
 * write throws, and the obligation keeps its place.
 */
const claimTurn = (userId: string, path: string): boolean =>
  (db.executeSync(
    `UPDATE ${ATTACHMENT_CLEANUP_TABLE} SET attempts = attempts + 1, last_attempt_at = ?, ${QUEUE} = ${NEXT_TURN} WHERE user_id = ? AND path = ?`,
    [new Date().toISOString(), userId, userId, path],
  ).rowsAffected ?? 0) === 1;

const countPending = (userId: string): number => {
  const value = Number(
    db.executeSync(`SELECT COUNT(*) AS n FROM ${ATTACHMENT_CLEANUP_TABLE} WHERE user_id = ?`, [userId])
      .rows?.[0]?.n,
  );
  if (!Number.isInteger(value) || value < 0) throw new Error('Unreadable attachment cleanup count.');
  return value;
};

/** True once the file is gone: removed now, or already absent. */
const removeFile = async (path: string): Promise<boolean> => {
  if (!(await RNFS.exists(path))) return true;
  // RNFS unlink deletes directories recursively; only a regular file is removed.
  const info = await RNFS.stat(path);
  if (!info.isFile()) return false;
  await RNFS.unlink(path);
  return true;
};

export interface AttachmentCleanupResult {
  /** Obligations retired in this pass (file removed or confirmed absent). */
  removed: number;
  /** This owner's obligations still saved after the pass; null if it could not be read. */
  pending: number | null;
  /** True when the pass stopped early because the sign-in changed. */
  interrupted: boolean;
  /**
   * Obligations whose progress this pass could not save: the attempt could not
   * be recorded (the file was left untouched and keeps its place), or the file
   * was removed but its obligation could not be retired. All stay saved.
   */
  unsaved: number;
}

const cleanupPass = async (
  userId: string,
  stillCurrent: () => boolean,
  limit: number,
): Promise<AttachmentCleanupResult> => {
  let turns: string[];
  try {
    turns = nextTurns(userId, Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0);
  } catch (error) {
    console.warn('[AttachmentCleanup] Saved cleanup could not be read:', error);
    return { removed: 0, pending: null, interrupted: false, unsaved: 0 };
  }
  let removed = 0;
  let interrupted = false;
  let unsaved = 0;
  for (const path of turns) {
    if (!stillCurrent()) {
      interrupted = true;
      break;
    }
    // The attempt is saved first, so this obligation yields its turn even if
    // the removal fails, is refused, or the app stops during it.
    let claimed = false;
    try {
      claimed = claimTurn(userId, path);
    } catch (error) {
      console.warn('[AttachmentCleanup] A cleanup attempt could not be saved:', error);
      unsaved += 1;
      continue; // not attempted: no file work whose outcome could not be recorded
    }
    if (!claimed) continue; // no longer this owner's: retired or moved since it was read
    if (attachmentCleanupTarget(path) !== path) continue; // refused: kept, never touched
    let gone = false;
    try {
      gone = await removeFile(path);
    } catch (error) {
      console.warn('[AttachmentCleanup] An attachment file could not be removed:', error);
    }
    if (!gone) continue; // kept; its attempt is saved and it waits at the back
    try {
      const retired = db.executeSync(`DELETE FROM ${ATTACHMENT_CLEANUP_TABLE} WHERE user_id = ? AND path = ?`, [
        userId,
        path,
      ]);
      if ((retired.rowsAffected ?? 0) > 0) removed += 1;
    } catch (error) {
      // The row stays; the next pass finds the file absent and retires it.
      console.warn('[AttachmentCleanup] A finished cleanup could not be retired:', error);
      unsaved += 1;
    }
  }
  let pending: number | null = null;
  try {
    pending = countPending(userId);
  } catch (error) {
    console.warn('[AttachmentCleanup] Remaining cleanup could not be counted:', error);
  }
  return { removed, pending, interrupted, unsaved };
};

/** The pass in progress for each owner in this process, so passes never overlap. */
const passInProgress = new Map<string, Promise<unknown>>();

/**
 * One bounded pass over `userId`'s saved obligations: at most `limit`, in
 * queue order. `stillCurrent` is checked before each file: once it is false
 * the pass stops, and the rest stay saved for that owner's next Clear All
 * Data. A pass requested while another runs for the same owner starts after
 * it, so two passes never work on the same obligations or report each other's
 * files as still pending.
 */
export const runAttachmentCleanup = (
  userId: string,
  stillCurrent: () => boolean = () => true,
  limit: number = MAX_CLEANUP_PER_RUN,
): Promise<AttachmentCleanupResult> => {
  const previous = passInProgress.get(userId);
  const pass = previous
    ? previous.then(() => cleanupPass(userId, stillCurrent, limit))
    : cleanupPass(userId, stillCurrent, limit);
  const settled = pass.then(
    () => undefined,
    () => undefined,
  );
  passInProgress.set(userId, settled);
  void settled.then(() => {
    if (passInProgress.get(userId) === settled) passInProgress.delete(userId);
  });
  return pass;
};
