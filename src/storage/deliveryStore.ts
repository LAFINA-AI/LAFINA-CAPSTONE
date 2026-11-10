import {db} from './database';
import type {DatabaseTransaction} from './database';

/**
 * Device-local reminder delivery jobs (schema 19). Jobs are derived from the
 * authoritative reminders table by triggers; this module only reads them,
 * records registration receipts and redacted events, and evaluates identity
 * fences. Nothing here touches `sync_outbox`.
 */

export type DeliveryJobState = 'armed' | 'ringing' | 'retired';
export type DeliveryRegistrationState =
  | 'unregistered'
  | 'registered'
  | 'failed'
  | 'suppressed'
  | 'idle';
export type ReminderSourceType = 'task' | 'event' | 'time_block';
export type DeliveryOperation = 'due' | 'call' | 'answer' | 'decline';

export interface DeliveryJob {
  reminderId: string;
  userId: string;
  generation: number;
  state: DeliveryJobState;
  triggerAt: string;
  registrationState: DeliveryRegistrationState;
  registeredGeneration: number;
  registrationError: string | null;
  registrationAttempts: number;
  sourceType: ReminderSourceType | null;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryIdentity {
  ownerId: string;
  reminderId: string;
  /** 0 marks a registration adopted from the pre-schema-19 native registry. */
  generation: number;
}

export type DeliveryFenceReason =
  | 'missing'
  | 'owner_mismatch'
  | 'stale_generation'
  | 'not_actionable';

export type DeliveryFenceResult =
  | {ok: true; job: DeliveryJob | null}
  | {ok: false; reason: DeliveryFenceReason; job: DeliveryJob | null};

export class DeliveryFenceError extends Error {
  constructor(public readonly reason: DeliveryFenceReason) {
    super(`Reminder delivery identity rejected: ${reason}.`);
    this.name = 'DeliveryFenceError';
  }
}

export type DeliveryEventName =
  | 'registered'
  | 'registration_failed'
  | 'cancelled'
  | 'suppressed'
  | 'js_dispatched'
  | 'call_admitted'
  | 'call_rejected'
  | 'action_rejected'
  | string;

const MAX_IDENTIFIER_LENGTH = 2048;
const MAX_CODE_LENGTH = 64;

/**
 * Canonical identity encoding shared with LafinaDeliveryContract.kt: keep
 * `A-Z a-z 0-9 - . _`, percent-encode every other UTF-8 byte in upper-case hex,
 * and write an empty owner (adopted legacy registration) as `~`.
 */
export const encodeDeliveryComponent = (value: string): string => {
  if (value.length === 0) return '~';
  return encodeURIComponent(value).replace(
    /[!~*'()]/g,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
};

const isIdentifier = (value: unknown, allowEmpty: boolean): value is string =>
  typeof value === 'string' &&
  value.length <= MAX_IDENTIFIER_LENGTH &&
  (allowEmpty || value.length > 0);

/** Full Intent data URI for one operation of one delivery generation. */
export const deliveryIdentityUri = (
  identity: DeliveryIdentity,
  operation: DeliveryOperation,
): string => {
  if (
    !isIdentifier(identity.ownerId, true) ||
    !isIdentifier(identity.reminderId, false) ||
    !Number.isSafeInteger(identity.generation) ||
    identity.generation < 0 ||
    !['due', 'call', 'answer', 'decline'].includes(operation)
  ) {
    throw new Error('Invalid reminder delivery identity.');
  }
  return `lafina-capstone://reminder/${operation}/${encodeDeliveryComponent(
    identity.ownerId,
  )}/${encodeDeliveryComponent(identity.reminderId)}/${identity.generation}`;
};

/** Notification tag; reminder IDs are unique, so no hash can collide. */
export const deliveryNotificationTag = (reminderId: string): string =>
  `lafina-reminder:${encodeDeliveryComponent(reminderId)}`;

const toJob = (row: Record<string, unknown>): DeliveryJob => ({
  reminderId: String(row.reminder_id),
  userId: String(row.user_id),
  generation: Number(row.generation),
  state: row.state as DeliveryJobState,
  triggerAt: String(row.trigger_at),
  registrationState: row.registration_state as DeliveryRegistrationState,
  registeredGeneration: Number(row.registered_generation ?? 0),
  registrationError:
    row.registration_error == null ? null : String(row.registration_error),
  registrationAttempts: Number(row.registration_attempts ?? 0),
  sourceType:
    row.source_type == null ? null : (row.source_type as ReminderSourceType),
  sourceId: row.source_id == null ? null : String(row.source_id),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const sanitizeCode = (code: string | null | undefined): string | null => {
  if (code == null) return null;
  const cleaned = String(code)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_')
    .slice(0, MAX_CODE_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
};

const sourceTables: Record<ReminderSourceType, string> = {
  task: 'tasks',
  event: 'events',
  time_block: 'time_blocks',
};

export const deliveryStore = {
  get: (
    reminderId: string,
    executor: DatabaseTransaction = db,
  ): DeliveryJob | null => {
    const row = executor.executeSync(
      'SELECT * FROM reminder_delivery_jobs WHERE reminder_id = ?',
      [reminderId],
    ).rows?.[0];
    return row ? toJob(row) : null;
  },

  /** Jobs of every owner, with the reminder text needed for registration. */
  listWithTask: (
    executor: DatabaseTransaction = db,
  ): Array<DeliveryJob & {task: string}> =>
    (
      executor.executeSync(
        `SELECT j.*, r.task AS task FROM reminder_delivery_jobs j
           LEFT JOIN reminders r ON r.id = j.reminder_id
          ORDER BY j.trigger_at ASC, j.reminder_id ASC`,
      ).rows || []
    ).map(row => ({
      ...toJob(row),
      task: row.task == null ? '' : String(row.task),
    })),

  /**
   * Registration receipt for one generation. A receipt for an older generation
   * is ignored, so a slow registration can never mark newer work as covered.
   * A receipt is evidence that Android accepted the alarm, not that it rang.
   */
  recordRegistration: (
    reminderId: string,
    generation: number,
    outcome: 'registered' | 'failed' | 'suppressed' | 'idle',
    code: string | null = null,
  ): void => {
    db.transactionSync(tx => {
      const job = deliveryStore.get(reminderId, tx);
      if (!job || job.generation !== generation) return;
      tx.executeSync(
        `UPDATE reminder_delivery_jobs
            SET registration_state = ?,
                registered_generation = CASE WHEN ? = 'registered' THEN ? ELSE registered_generation END,
                registration_error = ?,
                registration_attempts = CASE WHEN ? = 'failed' THEN registration_attempts + 1
                                             WHEN ? = 'registered' THEN 0
                                             ELSE registration_attempts END,
                updated_at = ?
          WHERE reminder_id = ? AND generation = ?`,
        [
          outcome,
          outcome,
          generation,
          outcome === 'failed' ? sanitizeCode(code) ?? 'failed' : null,
          outcome,
          outcome,
          new Date().toISOString(),
          reminderId,
          generation,
        ],
      );
      if (outcome === 'registered' || outcome === 'failed') {
        deliveryStore.recordEvent(
          {
            reminderId,
            userId: job.userId,
            generation,
            event:
              outcome === 'registered' ? 'registered' : 'registration_failed',
            code,
          },
          tx,
        );
      }
    });
  },

  /** Appends a bounded, redacted event: identifiers and a short code only. */
  recordEvent: (
    event: {
      reminderId: string;
      userId: string;
      generation: number;
      event: DeliveryEventName;
      code?: string | null;
      origin?: 'js' | 'native';
      occurredAt?: string;
    },
    executor: DatabaseTransaction = db,
  ): void => {
    const now = new Date().toISOString();
    executor.executeSync(
      `INSERT INTO reminder_delivery_events
         (reminder_id, user_id, generation, event, code, origin, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.reminderId.slice(0, MAX_IDENTIFIER_LENGTH),
        event.userId.slice(0, MAX_IDENTIFIER_LENGTH),
        Number.isSafeInteger(event.generation) ? event.generation : -1,
        sanitizeCode(event.event) ?? 'unknown',
        sanitizeCode(event.code ?? null),
        event.origin ?? 'js',
        event.occurredAt ?? now,
        now,
      ],
    );
  },

  listEvents: (
    reminderId: string,
  ): Array<{
    event: string;
    code: string | null;
    generation: number;
    origin: string;
  }> =>
    (
      db.executeSync(
        'SELECT event, code, generation, origin FROM reminder_delivery_events WHERE reminder_id = ? ORDER BY id ASC',
        [reminderId],
      ).rows || []
    ).map(row => ({
      event: String(row.event),
      code: row.code == null ? null : String(row.code),
      generation: Number(row.generation),
      origin: String(row.origin),
    })),

  /** Marks another owner's armed jobs as suppressed while they are inactive. */
  markSuppressed: (activeUserId: string | null): void => {
    db.executeSync(
      `UPDATE reminder_delivery_jobs
          SET registration_state = 'suppressed', updated_at = ?
        WHERE state = 'armed' AND registration_state <> 'suppressed'
          AND (? IS NULL OR user_id <> ?)`,
      [new Date().toISOString(), activeUserId, activeUserId],
    );
  },

  /**
   * Captured-identity fence. Without an expected generation (legacy callers
   * such as typed Chat commands) only ownership is enforced, matching AGY's
   * prior behavior. With one, the job must be the same generation and not
   * retired; generation 0 (an adopted legacy registration) checks ownership
   * and retirement only.
   */
  checkFence: (
    reminderId: string,
    ownerId: string,
    expectedGeneration?: number | null,
    executor: DatabaseTransaction = db,
  ): DeliveryFenceResult => {
    const job = deliveryStore.get(reminderId, executor);
    const captured =
      expectedGeneration !== undefined && expectedGeneration !== null;
    if (!job) {
      return captured
        ? {ok: false, reason: 'missing', job: null}
        : {ok: true, job: null};
    }
    if (job.userId !== ownerId) {
      return {ok: false, reason: 'owner_mismatch', job};
    }
    if (!captured) return {ok: true, job};
    // Generation 0 (an adopted legacy alarm) is only meaningful before the job
    // has ever moved: the backfill gives every pre-existing reminder generation
    // 1, so once the job is past 1 the legacy alarm is stale like any other.
    const expected = expectedGeneration === 0 ? 1 : expectedGeneration;
    if (job.generation !== expected) {
      return {ok: false, reason: 'stale_generation', job};
    }
    if (job.state === 'retired') {
      return {ok: false, reason: 'not_actionable', job};
    }
    return {ok: true, job};
  },

  /** Throwing form for use inside a mutation transaction. */
  assertFence: (
    tx: DatabaseTransaction,
    reminderId: string,
    ownerId: string,
    expectedGeneration?: number | null,
  ): void => {
    const result = deliveryStore.checkFence(
      reminderId,
      ownerId,
      expectedGeneration,
      tx,
    );
    if (!result.ok) throw new DeliveryFenceError(result.reason);
  },

  /**
   * Exact-source linkage (local metadata, never synchronized). Verifies both
   * records belong to the same owner. Meant to run in the same transaction
   * that creates the reminder.
   */
  linkSource: (
    reminderId: string,
    sourceType: ReminderSourceType,
    sourceId: string,
    executor: DatabaseTransaction = db,
  ): void => {
    const table = sourceTables[sourceType];
    if (!table) throw new Error('Unsupported reminder source.');
    const job = deliveryStore.get(reminderId, executor);
    const source = executor.executeSync(
      `SELECT user_id FROM ${table} WHERE id = ? AND deleted_at IS NULL`,
      [sourceId],
    ).rows?.[0];
    if (!job || !source || String(source.user_id) !== job.userId) {
      throw new Error('Reminder source ownership does not match.');
    }
    executor.executeSync(
      `UPDATE reminder_delivery_jobs SET source_type = ?, source_id = ?, updated_at = ?
        WHERE reminder_id = ?`,
      [sourceType, sourceId, new Date().toISOString(), reminderId],
    );
  },

  /**
   * Cheap summary that changes whenever one of this owner's jobs is created,
   * bumped, retired or has its registration receipt updated.
   */
  changeFingerprint: (
    userId: string,
    executor: DatabaseTransaction = db,
  ): string => {
    const row = executor.executeSync(
      `SELECT COUNT(*) AS n, COALESCE(SUM(generation), 0) AS g,
              COALESCE(MAX(updated_at), '') AS u,
              COALESCE(SUM(CASE WHEN state = 'armed' THEN 1 ELSE 0 END), 0) AS a,
              COALESCE(SUM(registered_generation), 0) AS r
         FROM reminder_delivery_jobs WHERE user_id = ?`,
      [userId],
    ).rows?.[0];
    return [row?.n, row?.g, row?.u, row?.a, row?.r].map(String).join('|');
  },

  /** Reminder IDs linked to an exact source, for one owner. */
  findBySource: (
    userId: string,
    sourceType: ReminderSourceType,
    sourceId: string,
    executor: DatabaseTransaction = db,
  ): string[] =>
    (
      executor.executeSync(
        `SELECT reminder_id FROM reminder_delivery_jobs
          WHERE user_id = ? AND source_type = ? AND source_id = ?
          ORDER BY reminder_id`,
        [userId, sourceType, sourceId],
      ).rows || []
    ).map(row => String(row.reminder_id)),
};
