import type {DatabaseTransaction} from './database';

/**
 * Schema 22 (AGY-PORT 08): device-local event timezone metadata. See ADR-021.
 *
 * The donor (LAFINA `eventTimeSchema.ts`) adds columns to `events` and syncs
 * them. AGY's cloud event contract is frozen (seven wire fields) and no server
 * here is known to accept more, so the metadata lives in a side table that the
 * sync worker never reads or writes:
 *
 * - `event_time_local` keeps the IANA timezone and the exact UTC start and end
 *   instants recorded when the event was saved on this device, plus the wall
 *   time they were computed from (`base_*`).
 * - A row counts only while its owner and base wall time still equal the
 *   event's. Triggers delete it when the event's date, start or end changes
 *   (whoever wrote it: a sync pull, an import, another screen) or when the
 *   event is deleted, so a stale UTC instant is never kept. A title-only change
 *   leaves it in place: a field the server omits is not a clear.
 * - When an event changes owner (guest data linked to an account), its row
 *   moves with it.
 *
 * Existing events get no row and keep their floating wall-time meaning.
 */
export const EVENT_TIME_TABLE = 'event_time_local';

export const EVENT_TIME_TRIGGERS = [
  'event_time_local_wall_change',
  'event_time_local_owner_change',
  'event_time_local_delete',
] as const;

export const migrateEventTime = (tx: DatabaseTransaction): void => {
  tx.executeSync(`CREATE TABLE IF NOT EXISTS ${EVENT_TIME_TABLE} (
    event_id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    time_zone TEXT NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 100),
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    start_fold TEXT CHECK (start_fold IS NULL OR start_fold IN ('earlier', 'later')),
    end_fold TEXT CHECK (end_fold IS NULL OR end_fold IN ('earlier', 'later')),
    base_date TEXT NOT NULL,
    base_start_time TEXT NOT NULL,
    base_end_time TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  )`);
  tx.executeSync(
    `CREATE INDEX IF NOT EXISTS idx_event_time_local_owner ON ${EVENT_TIME_TABLE}(user_id, event_id)`,
  );
  const [onWallChange, onOwnerChange, onDelete] = EVENT_TIME_TRIGGERS;
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS ${onWallChange}
    AFTER UPDATE OF date, start_time, end_time, deleted_at ON events
    WHEN OLD.date IS NOT NEW.date
      OR OLD.start_time IS NOT NEW.start_time
      OR OLD.end_time IS NOT NEW.end_time
      OR NEW.deleted_at IS NOT NULL
    BEGIN
      DELETE FROM ${EVENT_TIME_TABLE} WHERE event_id = OLD.id;
    END`);
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS ${onOwnerChange}
    AFTER UPDATE OF user_id ON events
    WHEN OLD.user_id IS NOT NEW.user_id
    BEGIN
      UPDATE ${EVENT_TIME_TABLE} SET user_id = NEW.user_id WHERE event_id = OLD.id;
    END`);
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS ${onDelete}
    AFTER DELETE ON events BEGIN
      DELETE FROM ${EVENT_TIME_TABLE} WHERE event_id = OLD.id;
    END`);
};
