import RNFS from 'react-native-fs';
import { db } from './database';
import type { DatabaseTransaction } from './database';
import { ATTACHMENT_CLEANUP_TABLE } from './attachmentCleanupSchema';

/**
 * Owner-bound chat attachment cleanup (clear-data audit C1; ADR-026).
 *
 * `recordAttachmentCleanup` runs inside the transaction that deletes the
 * owning chat messages. `runAttachmentCleanup` makes one bounded pass over an
 * owner's saved obligations: a row is retired only after its file is removed
 * or confirmed absent, so a failed removal, a crash or a restart leaves it to
 * be retried by the next Clear All Data. Nothing here loops, polls or runs in
 * the background, and every write is keyed by the owner it was recorded for.
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

/** Saves obligations in the caller's transaction. Duplicates are ignored. */
export const recordAttachmentCleanup = (tx: Executor, userId: string, paths: Iterable<string>): void => {
  const now = new Date().toISOString();
  for (const path of paths) {
    tx.executeSync(
      `INSERT OR IGNORE INTO ${ATTACHMENT_CLEANUP_TABLE} (user_id, path, recorded_at) VALUES (?, ?, ?)`,
      [userId, path, now],
    );
  }
};

/** This owner's saved obligations, oldest first. A failed read throws. */
export const pendingAttachmentCleanup = (userId: string, executor: Executor = db): string[] =>
  (
    executor.executeSync(
      `SELECT path FROM ${ATTACHMENT_CLEANUP_TABLE} WHERE user_id = ? ORDER BY recorded_at ASC, path ASC`,
      [userId],
    ).rows ?? []
  ).map(row => String(row.path));

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
}

/**
 * One bounded pass over `userId`'s saved obligations. `stillCurrent` is
 * checked before each file: once it is false the pass stops, and the rest stay
 * saved for that owner's next Clear All Data.
 */
export const runAttachmentCleanup = async (
  userId: string,
  stillCurrent: () => boolean = () => true,
  limit: number = MAX_CLEANUP_PER_RUN,
): Promise<AttachmentCleanupResult> => {
  let paths: string[];
  try {
    paths = pendingAttachmentCleanup(userId).slice(0, Math.max(0, limit));
  } catch (error) {
    console.warn('[AttachmentCleanup] Saved cleanup could not be read:', error);
    return { removed: 0, pending: null, interrupted: false };
  }
  let removed = 0;
  let interrupted = false;
  for (const path of paths) {
    if (!stillCurrent()) {
      interrupted = true;
      break;
    }
    if (attachmentCleanupTarget(path) !== path) continue; // refused: kept, never touched
    let gone = false;
    try {
      gone = await removeFile(path);
    } catch (error) {
      console.warn('[AttachmentCleanup] An attachment file could not be removed:', error);
    }
    try {
      if (gone) {
        db.executeSync(`DELETE FROM ${ATTACHMENT_CLEANUP_TABLE} WHERE user_id = ? AND path = ?`, [userId, path]);
        removed += 1;
      } else {
        db.executeSync(
          `UPDATE ${ATTACHMENT_CLEANUP_TABLE} SET attempts = attempts + 1, last_attempt_at = ? WHERE user_id = ? AND path = ?`,
          [new Date().toISOString(), userId, path],
        );
      }
    } catch (error) {
      // The row stays; the next pass finds the file absent and retires it.
      console.warn('[AttachmentCleanup] Cleanup state could not be updated:', error);
    }
  }
  let pending: number | null = null;
  try {
    pending = countPending(userId);
  } catch (error) {
    console.warn('[AttachmentCleanup] Remaining cleanup could not be counted:', error);
  }
  return { removed, pending, interrupted };
};
