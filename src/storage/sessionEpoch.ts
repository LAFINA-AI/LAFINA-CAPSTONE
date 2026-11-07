import { db } from './database';
import type { DatabaseTransaction } from './database';

/**
 * Remediation audit P1 (codex-remediation-audit-7b3b183-20261106.md): which
 * sign-in a destructive confirmation belongs to.
 *
 * The epoch combines this process's session generation, bumped on every
 * sign-in, sign-out and session replacement, with the stored session's owner
 * and start time. It differs after an account switch, after sign-out, and
 * after signing back in as the same account, even within one millisecond.
 * A retained callback cannot outlive the process, so an in-process
 * generation is enough; the stored owner and start time also catch a session
 * written by a path that did not bump it.
 */
let generation = 0;

/** Call after any write that replaces or removes the active session. */
export const noteSessionChange = (): void => {
  generation += 1;
};

export interface SessionEpoch {
  userId: string;
  epoch: string;
}

/**
 * The current session, read strictly: a failed read throws (callers refuse),
 * and no session or the test-only volatile adapter is null, never a match.
 */
export const readSessionEpoch = (
  executor: Pick<DatabaseTransaction, 'executeSync'> = db,
): SessionEpoch | null => {
  if (db.isFallback()) return null;
  const row = executor.executeSync(
    'SELECT user_id, created_at FROM active_session LIMIT 1',
  ).rows?.[0];
  if (!row || row.user_id == null) return null;
  const userId = String(row.user_id);
  return {
    userId,
    epoch: `${generation}|${userId}|${row.created_at == null ? '' : String(row.created_at)}`,
  };
};
