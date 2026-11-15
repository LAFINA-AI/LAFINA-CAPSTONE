import {db} from '../storage/database';
import {alarmsStore} from '../storage/alarmsStore';
import {remindersStore} from '../storage/remindersStore';
import {tasksStore} from '../storage/tasksStore';
import {cancelReminderAlarm} from './reminderAlarm';
import {localDateKey, repeatDaysFromRule} from './alarmSchedule';

/**
 * Alarm plan A4 (owner decision 3): before alarms existed, "set an alarm for
 * 6" and "wake me up at 6" made a reminder (and a companion task) titled
 * "Alarm". Each such reminder that is still waiting to ring becomes a real
 * alarm, in one transaction with the removal of the old reminder, so the
 * student never gets both a reminder call and an alarm.
 *
 * The removal goes through the normal sync outbox (other devices drop the old
 * reminder too). Only the companion task the old alarm path created is
 * removed: same owner, exact source link, the same alarm title, not done.
 * Idempotent: a converted reminder is gone, and an alarm already made from a
 * reminder is never made twice.
 */

const ALARM_TITLES = ['alarm', 'wake up', 'wake-up', 'wakeup'];

interface Row {
  id: string;
  task: string;
  description: string | null;
  scheduled_at: string;
}

const isAlarmTitle = (value: unknown): boolean =>
  ALARM_TITLES.includes(
    String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase(),
  );

export const migrateAlarmReminders = (
  userId: string,
  now: Date = new Date(),
): number => {
  let rows: Row[] = [];
  try {
    rows = (db.executeSync(
      `SELECT id, task, description, scheduled_at FROM reminders
        WHERE user_id = ? AND deleted_at IS NULL AND status IN ('pending', 'snoozed')`,
      [userId],
    ).rows ?? []) as unknown as Row[];
  } catch (error) {
    console.warn('[alarmMigration] Could not read reminders:', error);
    return 0;
  }
  let converted = 0;
  for (const row of rows) {
    if (!isAlarmTitle(row.task)) continue;
    const at = new Date(row.scheduled_at);
    if (Number.isNaN(at.getTime())) continue;
    const rule = /\[RRULE:([^\]]+)\]/i.exec(row.description ?? '')?.[1] ?? null;
    const repeatDays = rule ? repeatDaysFromRule(rule) : 0;
    // A one-time "alarm" whose time has passed is left to the reminder's own
    // missed handling; there is nothing left to ring.
    if (!repeatDays && at.getTime() <= now.getTime()) continue;
    try {
      db.transactionSync(tx => {
        const already = tx.executeSync(
          'SELECT id FROM alarms WHERE user_id = ? AND source_reminder_id = ?',
          [userId, row.id],
        ).rows?.[0];
        if (!already) {
          alarmsStore.create(
            userId,
            {
              hour: at.getHours(),
              minute: at.getMinutes(),
              repeatDays,
              oneShotDate: repeatDays ? null : localDateKey(at),
              label: /wake/i.test(row.task) ? 'Wake up' : '',
              sourceReminderId: row.id,
            },
            tx,
          );
        }
        const source = tx.executeSync(
          `SELECT j.source_id AS task_id FROM reminder_delivery_jobs j
             JOIN tasks t ON t.id = j.source_id
            WHERE j.reminder_id = ? AND j.source_type = 'task'
              AND t.user_id = ? AND t.deleted_at IS NULL AND t.is_completed = 0`,
          [row.id, userId],
        ).rows?.[0];
        const companion = source
          ? tx.executeSync('SELECT title FROM tasks WHERE id = ?', [
              source.task_id,
            ]).rows?.[0]
          : null;
        if (source && companion && isAlarmTitle(companion.title)) {
          // The cascade removes the reminder and cancels its booking too.
          tasksStore.deleteTask(String(source.task_id), tx);
        } else {
          remindersStore.deleteReminder(row.id, tx);
          tx.afterCommit?.(() => {
            cancelReminderAlarm(row.id).catch(() => undefined);
          });
        }
      });
      converted++;
    } catch (error) {
      // One reminder that can't convert (for example the 50-alarm limit)
      // keeps working as a reminder; the rest still convert.
      console.warn('[alarmMigration] Could not convert a reminder:', error);
    }
  }
  return converted;
};
