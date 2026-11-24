import {GUEST_USER_ID} from '../constants';
import {db, type DatabaseTransaction} from './database';
import {
  buildProfileSyncPayload,
  normalizeAvatarSeed,
} from './profileSyncPayload';
import {syncOutboxStore} from './syncOutboxStore';

/** Legacy local_settings key retained only for cleanup during migration. */
export const PROFILE_AVATAR_SEED_KEY = 'profile.avatarSeed.v1';

export {normalizeAvatarSeed};

let seedCounter = 0;

/** Generates a random character avatar seed token (never a file path or URL). */
export const generateAvatarSeed = (previousSeed?: string | null): string => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    seedCounter = (seedCounter + 1) % 1_000_000;
    const randomPart = Math.floor(Math.random() * 0xffffffff)
      .toString(36)
      .padStart(6, '0');
    const timePart = Date.now().toString(36);
    const candidate = `char-${timePart}-${seedCounter.toString(
      36,
    )}-${randomPart}`;
    if (candidate !== previousSeed) {
      return candidate;
    }
  }
  return `char-${Date.now().toString(36)}-${(seedCounter + 1).toString(36)}`;
};

export const avatarSeedStore = {
  /**
   * Returns the user's chosen character avatar seed, or `null` when using the
   * default neutral profile person silhouette.
   */
  get: (
    userId: string,
    executor: Pick<DatabaseTransaction, 'executeSync'> = db,
  ): string | null => {
    if (!userId) return null;
    try {
      const row = executor.executeSync(
        'SELECT avatar_seed FROM users WHERE id = ?',
        [userId],
      ).rows?.[0];
      return normalizeAvatarSeed(row?.avatar_seed);
    } catch {
      return null;
    }
  },

  /**
   * Saves a character avatar seed (or `null` to reset to the default neutral
   * profile person) on `users.avatar_seed` and queues a cloud profile sync
   * mutation for signed-in accounts.
   */
  set: (userId: string, seed: string | null): boolean => {
    if (!userId) return false;
    const clean = seed === null ? null : normalizeAvatarSeed(seed);
    if (seed !== null && !clean) return false;
    const now = new Date().toISOString();
    let updated = false;
    try {
      db.transactionSync(tx => {
        const res = tx.executeSync(
          'UPDATE users SET avatar_seed = ?, updated_at = ? WHERE id = ?',
          [clean, now, userId],
        );
        updated = (res.rowsAffected ?? 0) > 0;
        if (updated && userId !== GUEST_USER_ID) {
          syncOutboxStore.enqueueMutation(
            userId,
            'profile',
            'profile',
            'update',
            buildProfileSyncPayload(userId, tx),
            'account',
            userId,
            tx,
          );
        }
      });
    } catch (error) {
      console.error('Error saving character avatar seed:', error);
      return false;
    }
    return updated;
  },

  /** Resets the user's character avatar back to the default neutral person. */
  clear: (userId: string): boolean => avatarSeedStore.set(userId, null),

  /** Picks and persists a new random avatar seed distinct from the current one. */
  randomize: (userId: string, currentSeed?: string | null): string => {
    const existing = currentSeed ?? avatarSeedStore.get(userId);
    const next = generateAvatarSeed(existing);
    if (userId) {
      avatarSeedStore.set(userId, next);
    }
    return next;
  },

  /**
   * Preserves a guest user's explicitly chosen character avatar seed when
   * linking to a cloud account (never overwrites an existing cloud seed).
   * Returns `true` if `toUserId` received the guest's seed.
   */
  transferFromGuest: (
    tx: Pick<DatabaseTransaction, 'executeSync'>,
    fromUserId: string,
    toUserId: string,
  ): boolean => {
    if (!fromUserId || !toUserId || fromUserId === toUserId) return false;
    const guestSeed = avatarSeedStore.get(fromUserId, tx);
    const targetSeed = avatarSeedStore.get(toUserId, tx);
    let transferred = false;
    if (guestSeed && !targetSeed) {
      const res = tx.executeSync(
        'UPDATE users SET avatar_seed = ?, updated_at = ? WHERE id = ? AND avatar_seed IS NULL',
        [guestSeed, new Date().toISOString(), toUserId],
      );
      transferred = (res.rowsAffected ?? 0) > 0;
    }
    tx.executeSync('UPDATE users SET avatar_seed = NULL WHERE id = ?', [
      fromUserId,
    ]);
    tx.executeSync('DELETE FROM local_settings WHERE user_id = ? AND key = ?', [
      fromUserId,
      PROFILE_AVATAR_SEED_KEY,
    ]);
    return transferred;
  },
};
