import {db} from './database';
import type {DatabaseTransaction} from './database';
import {EVENT_TIME_TABLE} from './eventTimeSchema';
import {deviceTimeZone, resolveEventZoneTiming} from './eventTime';
import type {EventFolds, EventZoneTiming, FoldChoice} from './eventTime';

/**
 * Device-local event timezone metadata (AGY-PORT 08, schema 22). See
 * `eventTimeSchema.ts` and ADR-021. Nothing here is synced.
 */

/** Join that yields a metadata row only while it still describes the event. */
export const VALID_EVENT_TIME_JOIN = (eventAlias: string): string =>
  `LEFT JOIN ${EVENT_TIME_TABLE} m
     ON m.event_id = ${eventAlias}.id AND m.user_id = ${eventAlias}.user_id
    AND m.base_date = ${eventAlias}.date
    AND m.base_start_time = ${eventAlias}.start_time
    AND m.base_end_time = ${eventAlias}.end_time`;

export const EVENT_TIME_COLUMNS = `m.time_zone AS meta_time_zone,
  m.start_at AS meta_start_at, m.end_at AS meta_end_at,
  m.start_fold AS meta_start_fold, m.end_fold AS meta_end_fold`;

const fold = (value: unknown): FoldChoice | null =>
  value === 'earlier' || value === 'later' ? value : null;

/** Metadata selected with EVENT_TIME_COLUMNS, or null for a floating event. */
export const zoneTimingFromRow = (
  row: Record<string, unknown>,
): EventZoneTiming | null =>
  typeof row.meta_time_zone === 'string' &&
  typeof row.meta_start_at === 'string' &&
  typeof row.meta_end_at === 'string'
    ? {
        timeZone: row.meta_time_zone,
        startAt: row.meta_start_at,
        endAt: row.meta_end_at,
        startFold: fold(row.meta_start_fold),
        endFold: fold(row.meta_end_fold),
      }
    : null;

interface EventWallRow {
  id: unknown;
  user_id: unknown;
  date: unknown;
  start_time: unknown;
  end_time: unknown;
}

export const eventTimeStore = {
  /**
   * Records this device's timezone for an event saved here, inside the
   * caller's transaction. When the timezone is unknown or the wall time is not
   * exact in it (a gap, or a repeated time with no choice), no row is kept and
   * the event stays floating, exactly as before this phase. Only a database
   * error is thrown (and rolls the caller's write back).
   */
  recordLocal(
    tx: DatabaseTransaction,
    row: EventWallRow,
    folds: EventFolds = {},
  ): EventZoneTiming | null {
    const id = String(row.id);
    tx.executeSync(`DELETE FROM ${EVENT_TIME_TABLE} WHERE event_id = ?`, [id]);
    const zone = deviceTimeZone();
    if (!zone) return null;
    const wall = {
      date: String(row.date),
      startTime: String(row.start_time),
      endTime: String(row.end_time),
    };
    let timing: EventZoneTiming;
    try {
      timing = resolveEventZoneTiming(wall, zone, folds);
    } catch {
      // Metadata is optional: a gap, an unchosen repeated time or an engine
      // failure leaves the event floating and never blocks its write.
      return null;
    }
    tx.executeSync(
      `INSERT INTO ${EVENT_TIME_TABLE}
         (event_id, user_id, time_zone, start_at, end_at, start_fold, end_fold,
          base_date, base_start_time, base_end_time, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        String(row.user_id),
        timing.timeZone,
        timing.startAt,
        timing.endAt,
        timing.startFold,
        timing.endFold,
        wall.date,
        wall.startTime,
        wall.endTime,
        new Date().toISOString(),
      ],
    );
    return timing;
  },

  /** The still-valid metadata of one owned event, or null. */
  get(
    userId: string,
    eventId: string,
    executor: DatabaseTransaction = db,
  ): EventZoneTiming | null {
    const row = executor.executeSync(
      `SELECT ${EVENT_TIME_COLUMNS} FROM events e ${VALID_EVENT_TIME_JOIN('e')}
        WHERE e.id = ? AND e.user_id = ? AND e.deleted_at IS NULL`,
      [eventId, userId],
    ).rows?.[0] as Record<string, unknown> | undefined;
    return row ? zoneTimingFromRow(row) : null;
  },
};
