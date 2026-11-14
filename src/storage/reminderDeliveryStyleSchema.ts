import type {DatabaseTransaction} from './database';

/**
 * Schema 26: per-reminder "Call me / Notify only" choice (audit finding 16).
 *
 * Device-local and never synchronized: the seven wire payloads are unchanged,
 * and another device rings its own copy of the reminder as a call. A missing
 * row means "call", so every existing reminder keeps ringing as before. Rows
 * go away with their reminder (hard delete or soft-delete tombstone), so
 * Clear All Data leaves nothing behind.
 */
export const REMINDER_DELIVERY_STYLE_TABLE = 'reminder_delivery_styles';

export const migrateReminderDeliveryStyles = (
  tx: Pick<DatabaseTransaction, 'executeSync'>,
): void => {
  tx.executeSync(`CREATE TABLE IF NOT EXISTS reminder_delivery_styles (
    reminder_id TEXT PRIMARY KEY NOT NULL,
    style TEXT NOT NULL CHECK (style IN ('call','notify')),
    updated_at TEXT NOT NULL
  )`);
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS reminder_delivery_style_after_delete
    AFTER DELETE ON reminders
    BEGIN
      DELETE FROM reminder_delivery_styles WHERE reminder_id = OLD.id;
    END`);
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS reminder_delivery_style_after_tombstone
    AFTER UPDATE OF deleted_at ON reminders
    WHEN NEW.deleted_at IS NOT NULL
    BEGIN
      DELETE FROM reminder_delivery_styles WHERE reminder_id = NEW.id;
    END`);
};
