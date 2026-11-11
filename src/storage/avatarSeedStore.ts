import type {DatabaseTransaction} from './database';
import {localSettingsStore} from './localSettingsStore';

export const PROFILE_AVATAR_SEED_KEY = 'profile.avatarSeed.v1';

let seedCounter = 0;

/** Generates a random, offline-only character avatar seed. */
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
  get: (userId: string): string | null => {
    if (!userId) return null;
    const saved = localSettingsStore.get(userId, PROFILE_AVATAR_SEED_KEY, null);
    return saved && saved.trim().length > 0 ? saved.trim() : null;
  },

  set: (userId: string, seed: string): boolean => {
    const clean = seed.trim();
    if (!userId || !clean) return false;
    return localSettingsStore.set(userId, PROFILE_AVATAR_SEED_KEY, clean);
  },

  /** Returns the saved seed for this user, or persists a fresh random seed once. */
  getOrCreate: (userId: string): string => {
    const existing = avatarSeedStore.get(userId);
    if (existing) return existing;
    const created = generateAvatarSeed();
    if (userId) {
      avatarSeedStore.set(userId, created);
    }
    return created;
  },

  /** Picks and persists a new random avatar seed distinct from the current one. */
  randomize: (userId: string, currentSeed?: string | null): string => {
    const existing = currentSeed ?? avatarSeedStore.get(userId);
    const next = generateAvatarSeed(existing);
    if (userId) {
      avatarSeedStore.set(userId, next);
    }
    return next;
  },

  /** Preserves a guest user's avatar seed when linking to a cloud account. */
  transferFromGuest: (
    tx: Pick<DatabaseTransaction, 'executeSync'>,
    fromUserId: string,
    toUserId: string,
  ): void => {
    if (!fromUserId || !toUserId || fromUserId === toUserId) return;
    tx.executeSync(
      `UPDATE OR IGNORE local_settings SET user_id = ? WHERE user_id = ? AND key = ?`,
      [toUserId, fromUserId, PROFILE_AVATAR_SEED_KEY],
    );
    tx.executeSync(`DELETE FROM local_settings WHERE user_id = ? AND key = ?`, [
      fromUserId,
      PROFILE_AVATAR_SEED_KEY,
    ]);
  },
};
