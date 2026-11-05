import type {DatabaseTransaction} from './database';

export type ReminderSourceKind = 'task' | 'event' | 'time_block';

export interface SourceReminderRow {
  id: string;
  precast_audio_path: unknown;
  task: string;
  trigger_at: string;
  /** True when the reminder carries an exact source link to this item. */
  linked: boolean;
}

/**
 * AGY's legacy title rule: the same title ignoring letter case and spacing
 * (`r.task.trim().toLowerCase() === title.trim().toLowerCase()` in the base
 * assistant and Calendar paths). Inner runs of whitespace are collapsed too.
 */
export const legacyTitleKey = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

/**
 * Reminders that belong to one task, event or time block (AGY-PORT 04).
 *
 * A reminder with an exact source link (local `reminder_delivery_jobs`
 * metadata written by reviewed assistant creations) belongs only to the item it
 * is linked to. A reminder without any link keeps AGY's legacy rule: same owner
 * and the same title, ignoring case and spacing. So a linked reminder is never
 * touched because another item happens to share its title, and older unlinked
 * reminders behave as before.
 */
export const remindersForSource = (
  executor: DatabaseTransaction,
  userId: string,
  sourceType: ReminderSourceKind,
  sourceId: string,
  title: unknown,
  statuses: readonly string[],
): SourceReminderRow[] => {
  const placeholders = statuses.map(() => '?').join(', ');
  const rows =
    executor.executeSync(
      `SELECT r.id AS id, r.precast_audio_path AS precast_audio_path,
              r.task AS task, r.trigger_at AS trigger_at,
              j.source_type AS source_type, j.source_id AS source_id
         FROM reminders r
         LEFT JOIN reminder_delivery_jobs j ON j.reminder_id = r.id
        WHERE r.user_id = ? AND r.deleted_at IS NULL
          AND r.status IN (${placeholders})
          AND ((j.source_type = ? AND j.source_id = ?)
               OR j.source_type IS NULL)
        ORDER BY r.id`,
      [userId, ...statuses, sourceType, sourceId],
    ).rows || [];
  const key = legacyTitleKey(title);
  return rows
    .filter(
      row =>
        row.source_type != null ||
        (key !== '' && legacyTitleKey(row.task) === key),
    )
    .map(row => ({
      id: String(row.id),
      precast_audio_path: row.precast_audio_path,
      task: String(row.task ?? ''),
      trigger_at: String(row.trigger_at ?? ''),
      linked: row.source_type != null,
    }));
};
