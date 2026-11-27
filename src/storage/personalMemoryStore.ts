import {db} from './database';
import type {DatabaseTransaction} from './database';
import {generateId} from '../utils';
import {GUEST_USER_ID} from '../constants';

/**
 * Device-local default event duration, using the legacy AGY-PORT 09 key so
 * existing duration, account transfer and reset behavior remain compatible.
 *
 * Runtime consumers use getDefaultDuration/saveDefaultDuration. Legacy
 * review/offer APIs below are retained for compatibility and migration tests;
 * their settings sheet has been removed. New preferences have no fixed start
 * time or expiry, and do not rewrite saved events. Writes are owner checked.
 */

export const EVENT_MEMORY_KEY = 'event_memory_v1';
export const REVIEW_TTL_MS = 300000;
export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 480;
export const DEFAULT_EVENT_DURATION_MINUTES = 60;
export const EXPIRY_CHOICES = [0, 30, 90] as const;
const MAX_REVIEWS = 16;
const DAY_MS = 86400000;

export type ExpiryDays = (typeof EXPIRY_CHOICES)[number];

export interface EventMemoryValue {
  startTime: string | null;
  durationMinutes: number | null;
  expiresAt: string | null;
}

export interface EventMemorySnapshot {
  version: 1;
  revision: number;
  enabled: boolean;
  value: EventMemoryValue | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventMemoryOffer {
  userId: string;
  revision: number;
  value: EventMemoryValue;
  issuedAt: number;
}

export interface EventMemoryInput {
  startTime: string | null;
  durationMinutes: number | null;
  expiresDays: ExpiryDays;
}

export type EventMemoryProblem =
  | 'owner_changed'
  | 'stale'
  | 'invalid'
  | 'unreadable'
  | 'review_expired';

export class EventMemoryError extends Error {
  constructor(public readonly problem: EventMemoryProblem, message: string) {
    super(message);
    this.name = 'EventMemoryError';
  }
}

interface Review {
  userId: string;
  revision: number;
  value: EventMemoryValue;
  issuedAt: number;
}

const reviews = new Map<string, Review>();

const WALL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const validValue = (value: EventMemoryValue): boolean =>
  (value.startTime === null || WALL_TIME.test(value.startTime)) &&
  (value.durationMinutes === null ||
    (Number.isInteger(value.durationMinutes) &&
      value.durationMinutes >= MIN_DURATION_MINUTES &&
      value.durationMinutes <= MAX_DURATION_MINUTES)) &&
  (value.expiresAt === null || Number.isFinite(Date.parse(value.expiresAt)));

const EMPTY = (): EventMemorySnapshot => ({
  version: 1,
  revision: 0,
  enabled: false,
  value: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

const parse = (raw: unknown): EventMemorySnapshot => {
  let value: EventMemorySnapshot;
  try {
    value = JSON.parse(String(raw)) as EventMemorySnapshot;
  } catch {
    throw new EventMemoryError('unreadable', 'Saved preferences unavailable.');
  }
  if (
    !value ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.enabled !== 'boolean' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    (value.value !== null &&
      (typeof value.value !== 'object' || !validValue(value.value)))
  ) {
    throw new EventMemoryError('unreadable', 'Saved preferences unavailable.');
  }
  return value;
};

const read = (
  userId: string,
  tx: DatabaseTransaction = db,
): EventMemorySnapshot => {
  if (!userId || userId.length > 256) {
    throw new EventMemoryError('owner_changed', 'Preference owner required.');
  }
  const raw = tx.executeSync(
    'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
    [userId, EVENT_MEMORY_KEY],
  ).rows?.[0]?.value;
  return raw == null ? EMPTY() : parse(raw);
};

/**
 * The AGY-PORT 07 owner rule: a signed-in session that names someone else
 * means the account changed under a retained screen. No session at all is
 * not treated as a change.
 */
const assertActive = (userId: string, tx: DatabaseTransaction = db): void => {
  const owner = tx.executeSync('SELECT user_id FROM active_session LIMIT 1')
    .rows?.[0]?.user_id;
  if (!userId || (owner != null && String(owner) !== userId)) {
    throw new EventMemoryError(
      'owner_changed',
      'Account changed. Reopen preferences.',
    );
  }
};

const write = (
  userId: string,
  expected: number,
  change: (
    before: EventMemorySnapshot,
  ) => Pick<EventMemorySnapshot, 'enabled' | 'value'>,
  executor?: DatabaseTransaction,
): EventMemorySnapshot => {
  const apply = (tx: DatabaseTransaction): EventMemorySnapshot => {
    assertActive(userId, tx);
    const before = read(userId, tx);
    if (before.revision !== expected) {
      throw new EventMemoryError('stale', 'Preferences changed. Review again.');
    }
    const now = new Date().toISOString();
    const next: EventMemorySnapshot = {
      ...before,
      ...change(before),
      revision: before.revision + 1,
      createdAt: before.revision ? before.createdAt : now,
      updatedAt: now,
    };
    tx.executeSync(
      `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [userId, EVENT_MEMORY_KEY, JSON.stringify(next), now],
    );
    return next;
  };
  return executor ? apply(executor) : db.transactionSync(apply);
};

const describe = (value: EventMemoryValue): string => {
  const start = value.startTime ?? 'not saved';
  const duration =
    value.durationMinutes === null
      ? 'not saved'
      : `${value.durationMinutes} minutes`;
  const expiry = value.expiresAt ? value.expiresAt.slice(0, 10) : 'never';
  return `Start ${start}; duration ${duration}; expires ${expiry}.`;
};

export const personalMemoryStore = {
  /** Explicit device-local preferences; never inferred from the student's content. */
  read,

  /** Duration-only Schedule preference. Legacy start times are never reused.
   * Migrate an enabled, unexpired duration once; disabled/expired values reset
   * to 60 minutes. Keep the same owner-scoped key so reset/guest transfer work.
   */
  getDefaultDuration: (userId: string): number => {
    try {
      assertActive(userId);
    } catch {
      return DEFAULT_EVENT_DURATION_MINUTES;
    }
    let saved: EventMemorySnapshot;
    try {
      saved = read(userId);
    } catch {
      return DEFAULT_EVENT_DURATION_MINUTES;
    }
    if (!saved.value) return DEFAULT_EVENT_DURATION_MINUTES;
    if (
      saved.enabled &&
      saved.value.startTime === null &&
      saved.value.expiresAt === null &&
      saved.value.durationMinutes !== null
    )
      return saved.value.durationMinutes;
    const now = Date.now();
    const active =
      saved.enabled &&
      now >= Date.parse(saved.updatedAt) &&
      (saved.value.expiresAt === null ||
        Date.parse(saved.value.expiresAt) > now);
    const duration = active
      ? saved.value.durationMinutes ?? DEFAULT_EVENT_DURATION_MINUTES
      : DEFAULT_EVENT_DURATION_MINUTES;
    if (
      !saved.enabled ||
      saved.value.startTime !== null ||
      saved.value.expiresAt !== null ||
      saved.value.durationMinutes === null
    ) {
      write(userId, saved.revision, () => ({
        enabled: true,
        value: {
          startTime: null,
          durationMinutes: duration,
          expiresAt: null,
        },
      }));
    }
    return duration;
  },

  saveDefaultDuration: (
    userId: string,
    minutes: number,
    executor?: DatabaseTransaction,
  ): void => {
    if (
      !Number.isInteger(minutes) ||
      minutes < MIN_DURATION_MINUTES ||
      minutes > MAX_DURATION_MINUTES
    )
      throw new EventMemoryError(
        'invalid',
        `Enter a whole number from ${MIN_DURATION_MINUTES} to ${MAX_DURATION_MINUTES} minutes.`,
      );
    let before: EventMemorySnapshot;
    try {
      before = read(userId, executor);
    } catch (error) {
      if (
        !(error instanceof EventMemoryError) ||
        error.problem !== 'unreadable'
      )
        throw error;
      // A damaged old defaults record must not block the normal settings Save.
      personalMemoryStore.clearForDataReset(userId, executor);
      before = read(userId, executor);
    }
    write(
      userId,
      before.revision,
      () => ({
        enabled: true,
        value: {
          startTime: null,
          durationMinutes: minutes,
          expiresAt: null,
        },
      }),
      executor,
    );
  },

  describe,

  /** A short-lived private review. Saves nothing and enables nothing. */
  prepare: (
    userId: string,
    input: EventMemoryInput,
  ): {token: string; summary: string} => {
    assertActive(userId);
    if (!(EXPIRY_CHOICES as readonly number[]).includes(input.expiresDays)) {
      throw new EventMemoryError('invalid', 'Choose an expiry.');
    }
    const now = Date.now();
    const value: EventMemoryValue = {
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      expiresAt: input.expiresDays
        ? new Date(now + input.expiresDays * DAY_MS).toISOString()
        : null,
    };
    if (
      !validValue(value) ||
      (value.startTime === null && value.durationMinutes === null)
    ) {
      throw new EventMemoryError(
        'invalid',
        `Enter a start time (HH:MM), a duration of ${MIN_DURATION_MINUTES}–${MAX_DURATION_MINUTES} minutes, or both.`,
      );
    }
    const revision = read(userId).revision;
    for (const [key, item] of reviews) {
      if (now - item.issuedAt > REVIEW_TTL_MS || item.userId === userId)
        reviews.delete(key);
    }
    while (reviews.size >= MAX_REVIEWS) {
      const oldest = reviews.keys().next().value;
      if (oldest === undefined) break;
      reviews.delete(oldest);
    }
    const token = generateId('memory-review');
    reviews.set(token, {userId, revision, value, issuedAt: now});
    return {
      token,
      summary: `${describe(
        value,
      )} Offered on new event drafts on this device; nothing changes until you tap Apply.`,
    };
  },

  /** Saves exactly the reviewed values while account, revision and clock still match. */
  confirm: (token: string, userId: string): EventMemorySnapshot => {
    const review = reviews.get(token);
    const age = Date.now() - (review?.issuedAt ?? 0);
    if (!review || review.userId !== userId || age < 0 || age > REVIEW_TTL_MS) {
      reviews.delete(token);
      throw new EventMemoryError(
        'review_expired',
        'Review expired. Review again.',
      );
    }
    const saved = write(userId, review.revision, () => ({
      enabled: true,
      value: review.value,
    }));
    reviews.delete(token);
    return saved;
  },

  cancel: (token: string): void => {
    reviews.delete(token);
  },

  /** Turns offers on or off. Saved events are never touched. */
  setEnabled: (
    userId: string,
    enabled: boolean,
    expected?: number,
  ): EventMemorySnapshot =>
    write(userId, expected ?? read(userId).revision, before => ({
      enabled: enabled && before.value !== null,
      value: before.value,
    })),

  /** Forgets one field or everything; only a revision fence remains. */
  forget: (
    userId: string,
    field: 'startTime' | 'durationMinutes' | 'all',
    expected?: number,
  ): EventMemorySnapshot => {
    if (!['startTime', 'durationMinutes', 'all'].includes(field)) {
      throw new EventMemoryError('invalid', 'Unknown preference.');
    }
    return write(userId, expected ?? read(userId).revision, before => {
      let value: EventMemoryValue | null =
        field === 'all' || !before.value
          ? null
          : {...before.value, [field]: null};
      if (value && value.startTime === null && value.durationMinutes === null)
        value = null;
      return {enabled: value !== null && before.enabled, value};
    });
  },

  /** An offer only for the active owner with enabled, unexpired preferences. */
  offer: (userId: string): EventMemoryOffer | null => {
    assertActive(userId);
    const current = read(userId);
    const now = Date.now();
    if (
      !current.enabled ||
      !current.value ||
      !Number.isFinite(now) ||
      // A clock set back before the last save cannot be trusted with expiry.
      now < Date.parse(current.updatedAt) ||
      (current.value.expiresAt !== null &&
        Date.parse(current.value.expiresAt) <= now)
    ) {
      return null;
    }
    return {
      userId,
      revision: current.revision,
      value: {...current.value},
      issuedAt: now,
    };
  },

  /** Revalidates an offer just before it edits a draft. Never writes an event. */
  apply: (offer: EventMemoryOffer, userId: string): EventMemoryValue => {
    const current = personalMemoryStore.offer(userId);
    const age = Date.now() - offer.issuedAt;
    if (
      !current ||
      offer.userId !== userId ||
      offer.revision !== current.revision ||
      age < 0 ||
      age > REVIEW_TTL_MS ||
      JSON.stringify(offer.value) !== JSON.stringify(current.value)
    ) {
      throw new EventMemoryError(
        'stale',
        'Saved defaults changed. Reopen the new event.',
      );
    }
    return {...current.value};
  },

  /**
   * Codex audit A3: Profile "Clear All Data" forgets this owner's event
   * defaults, including a value that can no longer be read, and leaves a
   * disabled revision fence so a review or offer issued earlier cannot save or
   * apply them afterwards. Owner-checked; other owners are untouched.
   */
  clearForDataReset: (userId: string, executor?: DatabaseTransaction): void => {
    const apply = (tx: DatabaseTransaction): void => {
      assertActive(userId, tx);
      const raw = tx.executeSync(
        'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
        [userId, EVENT_MEMORY_KEY],
      ).rows?.[0]?.value;
      let revision = 0;
      if (raw != null) {
        try {
          const parsed = JSON.parse(String(raw)) as {revision?: unknown};
          if (Number.isSafeInteger(parsed?.revision))
            revision = Number(parsed.revision);
        } catch {
          // Unreadable: it is replaced by the fence below.
        }
      }
      const now = new Date().toISOString();
      const fence: EventMemorySnapshot = {
        version: 1,
        revision: Math.max(revision, 0) + 1,
        enabled: false,
        value: null,
        createdAt: now,
        updatedAt: now,
      };
      tx.executeSync(
        `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [userId, EVENT_MEMORY_KEY, JSON.stringify(fence), now],
      );
    };
    const clearReviews = (): void => {
      for (const [token, review] of reviews) {
        if (review.userId === userId) reviews.delete(token);
      }
    };
    if (executor) {
      apply(executor);
      executor.afterCommit?.(clearReviews);
    } else {
      db.transactionSync(apply);
      clearReviews();
    }
  },

  /**
   * Guest link (inside the link transaction): an account that already has
   * preferences on this device keeps them; otherwise the guest's move to it.
   * The guest keeps only a disabled revision fence, so an old review cannot
   * bring the values back for a later guest on this device.
   */
  transferFromGuest: (
    tx: DatabaseTransaction,
    cloudUserId: string,
    now: string,
  ): void => {
    if (cloudUserId === GUEST_USER_ID) return;
    const raw = tx.executeSync(
      'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
      [GUEST_USER_ID, EVENT_MEMORY_KEY],
    ).rows?.[0]?.value;
    if (raw == null) return;
    tx.executeSync(
      'INSERT OR IGNORE INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
      [cloudUserId, EVENT_MEMORY_KEY, String(raw), now],
    );
    let revision = 0;
    try {
      const parsed = JSON.parse(String(raw)) as {revision?: unknown};
      if (Number.isSafeInteger(parsed?.revision))
        revision = Number(parsed.revision);
    } catch {
      // A malformed original moved only to an account that had none; the fence still applies.
    }
    const fence: EventMemorySnapshot = {
      version: 1,
      revision: revision + 1,
      enabled: false,
      value: null,
      createdAt: now,
      updatedAt: now,
    };
    tx.executeSync(
      'UPDATE local_settings SET value = ?, updated_at = ? WHERE user_id = ? AND key = ?',
      [JSON.stringify(fence), now, GUEST_USER_ID, EVENT_MEMORY_KEY],
    );
  },
};

/** Draft times for an applied offer. Overnight ends wrap to the next day (AGY-PORT 08). */
export const applyEventMemoryToDraft = (
  value: EventMemoryValue,
  draft: {time: string; endTime: string},
): {time: string; endTime: string} => {
  const toMinutes = (wall: string): number | null => {
    if (!WALL_TIME.test(wall)) return null;
    const [h, m] = wall.split(':').map(Number);
    return h * 60 + m;
  };
  const fromMinutes = (total: number): string => {
    const wrapped = ((total % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(
      wrapped % 60,
    ).padStart(2, '0')}`;
  };
  const start = value.startTime ?? draft.time;
  const startMinutes = toMinutes(start);
  if (startMinutes === null) return draft;
  let duration = value.durationMinutes;
  if (duration === null) {
    const oldStart = toMinutes(draft.time);
    const oldEnd = toMinutes(draft.endTime);
    duration =
      oldStart !== null && oldEnd !== null
        ? (oldEnd - oldStart + 1440) % 1440 || 60
        : 60;
  }
  return {time: start, endTime: fromMinutes(startMinutes + duration)};
};
