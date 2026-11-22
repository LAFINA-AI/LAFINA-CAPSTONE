import {db} from './database';
import type {DatabaseTransaction} from './database';

/**
 * How a reminder reaches the student when it is due (audit finding 16):
 * `call` rings the full-screen reminder call; `notify` posts an ordinary
 * notification with Acknowledge and Snooze. Device-local, never synced.
 */
export type ReminderDeliveryStyle = 'call' | 'notify';

export const DEFAULT_REMINDER_DELIVERY_STYLE: ReminderDeliveryStyle = 'call';

export const isReminderDeliveryStyle = (
  value: unknown,
): value is ReminderDeliveryStyle => value === 'call' || value === 'notify';

type Executor = Pick<DatabaseTransaction, 'executeSync'>;

const getExplicit = (
  reminderId: string,
  executor: Executor = db,
): ReminderDeliveryStyle | null => {
  try {
    const value = executor.executeSync(
      'SELECT style FROM reminder_delivery_styles WHERE reminder_id = ?',
      [reminderId],
    ).rows?.[0]?.style;
    return isReminderDeliveryStyle(value) ? value : null;
  } catch (error) {
    console.warn('[ReminderDeliveryStyle] Could not read style:', error);
    return null;
  }
};

export const reminderDeliveryStyleStore = {
  /** Explicit per-reminder override, or null when no override row is saved. */
  getExplicit,

  /**
   * The saved style, or `fallback` (default `call`) when no override row is
   * saved or storage cannot be read.
   */
  get: (
    reminderId: string,
    executor: Executor = db,
    fallback: ReminderDeliveryStyle = DEFAULT_REMINDER_DELIVERY_STYLE,
  ): ReminderDeliveryStyle => getExplicit(reminderId, executor) ?? fallback,

  /**
   * Saves the style inside the caller's transaction (so it commits with the
   * reminder). Removes the row when it matches `defaultStyle` (default `call`).
   */
  set: (
    reminderId: string,
    style: ReminderDeliveryStyle,
    executor: Executor = db,
    defaultStyle: ReminderDeliveryStyle = DEFAULT_REMINDER_DELIVERY_STYLE,
  ): void => {
    if (!isReminderDeliveryStyle(style)) {
      throw new Error('Invalid reminder delivery style.');
    }
    if (style === defaultStyle) {
      executor.executeSync(
        'DELETE FROM reminder_delivery_styles WHERE reminder_id = ?',
        [reminderId],
      );
      return;
    }
    executor.executeSync(
      `INSERT INTO reminder_delivery_styles (reminder_id, style, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(reminder_id) DO UPDATE SET style = excluded.style, updated_at = excluded.updated_at`,
      [reminderId, style, new Date().toISOString()],
    );
  },
};
