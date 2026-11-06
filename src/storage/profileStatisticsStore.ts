import {db} from './database';

/**
 * AGY-PORT 09: Profile statistics counted from actual local records.
 *
 * - Tasks Done: the owner's tasks marked complete (not deleted).
 * - Notes Saved: the owner's notes (not deleted).
 * - On time: reminders acknowledged without a snooze, divided by reminders
 *   that reached an outcome (acknowledged or missed). Pending, snoozed and
 *   ringing reminders are not outcomes yet. No outcomes means "No data".
 *
 * Acknowledging a reminder is not counted as completing a task, and no
 * keyword or flag is counted as a spoken command. Any read failure makes the
 * whole result unavailable rather than partly zero.
 */
export interface ProfileStatistics {
  available: boolean;
  completedTasksCount: number | null;
  notesCount: number | null;
  /** Whole percent; null when there are no outcomes yet or on a read failure. */
  onTimeRate: number | null;
  onTimeCount: number | null;
  /** Denominator of onTimeRate; null only on a read failure. */
  finishedRemindersCount: number | null;
}

export const UNAVAILABLE_STATISTICS: ProfileStatistics = {
  available: false,
  completedTasksCount: null,
  notesCount: null,
  onTimeRate: null,
  onTimeCount: null,
  finishedRemindersCount: null,
};

const count = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Invalid count.');
  return parsed;
};

export const onTimeRate = (onTime: number, finished: number): number | null =>
  finished > 0 ? Math.round((onTime / finished) * 100) : null;

export const profileStatisticsStore = {
  read: (userId: string): ProfileStatistics => {
    try {
      if (!userId) throw new Error('Statistics owner required.');
      const completedTasksCount = count(
        db.executeSync(
          'SELECT COUNT(*) AS count FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND is_completed = 1',
          [userId],
        ).rows?.[0]?.count,
      );
      const notesCount = count(
        db.executeSync(
          'SELECT COUNT(*) AS count FROM notes WHERE user_id = ? AND deleted_at IS NULL',
          [userId],
        ).rows?.[0]?.count,
      );
      const reminders = db.executeSync(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'acknowledged' AND snooze_count = 0 THEN 1 ELSE 0 END), 0) AS on_time,
           COALESCE(SUM(CASE WHEN status IN ('acknowledged', 'missed') THEN 1 ELSE 0 END), 0) AS finished
         FROM reminders WHERE user_id = ? AND deleted_at IS NULL`,
        [userId],
      ).rows?.[0];
      const onTimeCount = count(reminders?.on_time);
      const finishedRemindersCount = count(reminders?.finished);
      return {
        available: true,
        completedTasksCount,
        notesCount,
        onTimeRate: onTimeRate(onTimeCount, finishedRemindersCount),
        onTimeCount,
        finishedRemindersCount,
      };
    } catch (error) {
      console.warn('[ProfileStatistics] Statistics unavailable:', error);
      return {...UNAVAILABLE_STATISTICS};
    }
  },
};
