import {getConfirmedAcademicProfile} from './ustpEligibility';
import {db} from './database';
import {createPlannerQueries} from './plannerQueries';
import {userStore} from './userStore';

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

export interface DetailedProfileStatistics extends ProfileStatistics {
  pendingTasksCount: number | null;
  totalTasksCount: number | null;
  overdueTasksCount: number | null;
  dueTodayTasksCount: number | null;
  highPriorityPendingCount: number | null;
  /** Whole percent 0-100; null when there are no tasks yet or on a read failure. */
  taskCompletionRate: number | null;
  /** Class sessions (blocks) this week, not distinct subjects. */
  weeklyClassCount: number | null;
  weeklyClassMinutes: number | null;
  weeklyStudyBlockCount: number | null;
  weeklyStudyMinutes: number | null;
  weeklyEventCount: number | null;
  weeklyEventMinutes: number | null;
  weeklyScheduledMinutes: number | null;
  enrolledCoursesCount: number | null;
  totalCreditUnits: number | null;
  pinnedNotesCount: number | null;
  voiceNotesCount: number | null;
  lecturesCount: number | null;
  transcribedLecturesCount: number | null;
  lectureNotesCount: number | null;
  totalLectureSeconds: number | null;
  pendingRemindersCount: number | null;
  snoozedOutcomesCount: number | null;
  missedRemindersCount: number | null;
  enabledAlarmsCount: number | null;
  totalAlarmsCount: number | null;
}

export const UNAVAILABLE_STATISTICS: ProfileStatistics = {
  available: false,
  completedTasksCount: null,
  notesCount: null,
  onTimeRate: null,
  onTimeCount: null,
  finishedRemindersCount: null,
};

export const UNAVAILABLE_DETAILED_STATISTICS: DetailedProfileStatistics = {
  ...UNAVAILABLE_STATISTICS,
  pendingTasksCount: null,
  totalTasksCount: null,
  overdueTasksCount: null,
  dueTodayTasksCount: null,
  highPriorityPendingCount: null,
  taskCompletionRate: null,
  weeklyClassCount: null,
  weeklyClassMinutes: null,
  weeklyStudyBlockCount: null,
  weeklyStudyMinutes: null,
  weeklyEventCount: null,
  weeklyEventMinutes: null,
  weeklyScheduledMinutes: null,
  enrolledCoursesCount: null,
  totalCreditUnits: null,
  pinnedNotesCount: null,
  voiceNotesCount: null,
  lecturesCount: null,
  transcribedLecturesCount: null,
  lectureNotesCount: null,
  totalLectureSeconds: null,
  pendingRemindersCount: null,
  snoozedOutcomesCount: null,
  missedRemindersCount: null,
  enabledAlarmsCount: null,
  totalAlarmsCount: null,
};

const count = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Invalid count.');
  return parsed;
};

const formatLocalDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addLocalDays = (date: Date, days: number): Date => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
};

const parseTimeMinutes = (
  hhmm: string | null | undefined,
  treatMidnightAsEnd = false,
): number | null => {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const h = Number.parseInt(match[1], 10);
  const m = Number.parseInt(match[2], 10);
  if (!Number.isInteger(h) || !Number.isInteger(m) || m < 0 || m > 59) {
    return null;
  }
  if (h === 24 && m === 0) return 1440;
  if (h < 0 || h > 23) return null;
  const total = h * 60 + m;
  if (treatMidnightAsEnd && total === 0) return 1440;
  return total;
};

const durationMinutesBetween = (
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number => {
  const start = parseTimeMinutes(startTime, false);
  const end = parseTimeMinutes(endTime, true);
  if (start === null || end === null || end === start) return 0;
  // 22:00–01:00 crosses midnight, as the Calendar draws it (audit L3).
  return end > start ? end - start : end + 1440 - start;
};

export const onTimeRate = (onTime: number, finished: number): number | null =>
  finished > 0 ? Math.round((onTime / finished) * 100) : null;

export const completionRate = (
  completed: number,
  total: number,
): number | null => (total > 0 ? Math.round((completed / total) * 100) : null);

const detailedCache = new Map<string, DetailedProfileStatistics>();
const DETAILED_CACHE_LIMIT = 4;

const DETAILED_TABLES = [
  'tasks',
  'notes',
  'reminders',
  'alarms',
  'recorded_meetings',
  'events',
  'event_time_local',
  'time_blocks',
  'users',
  'local_settings:academic',
  'local_settings:student',
] as const;

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

  readDetailed: (
    userId: string,
    referenceDate: Date = new Date(),
  ): DetailedProfileStatistics => {
    try {
      if (!userId) throw new Error('Statistics owner required.');
      const cacheKey = `${userId}:${referenceDate.getTimezoneOffset()}:${Math.floor(
        referenceDate.getTime() / 60000,
      )}:${db.getDataRevision(DETAILED_TABLES)}`;
      const cached = detailedCache.get(cacheKey);
      if (cached) {
        // A cached summary must not conceal a storage outage.
        db.executeSync('SELECT 1');
        return cached;
      }
      const todayStr = formatLocalDate(referenceDate);
      const nowHhmm = `${String(referenceDate.getHours()).padStart(
        2,
        '0',
      )}:${String(referenceDate.getMinutes()).padStart(2, '0')}`;
      const weekStartsMonday = userStore.getWeekStartsMonday(userId);
      const dayOfWeek = referenceDate.getDay();
      const startOffset = weekStartsMonday ? (dayOfWeek + 6) % 7 : dayOfWeek;
      const weekStart = addLocalDays(referenceDate, -startOffset);
      const weekEnd = addLocalDays(weekStart, 6);
      const weekStartStr = formatLocalDate(weekStart);
      const weekEndStr = formatLocalDate(weekEnd);

      const tasksRow = db.executeSync(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END), 0) AS completed,
           COALESCE(SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END), 0) AS pending,
           COALESCE(SUM(CASE WHEN is_completed = 0 AND due_date IS NOT NULL AND due_date <> '' AND (due_date < ? OR (due_date = ? AND due_time IS NOT NULL AND due_time <> '' AND due_time < ?)) THEN 1 ELSE 0 END), 0) AS overdue,
           COALESCE(SUM(CASE WHEN is_completed = 0 AND due_date = ? AND NOT (due_time IS NOT NULL AND due_time <> '' AND due_time < ?) THEN 1 ELSE 0 END), 0) AS due_today,
           COALESCE(SUM(CASE WHEN is_completed = 0 AND priority = 'High' THEN 1 ELSE 0 END), 0) AS high_pending
         FROM tasks
         WHERE user_id = ? AND deleted_at IS NULL`,
        // A task due earlier today at a set time is overdue, not "due today".
        [todayStr, todayStr, nowHhmm, todayStr, nowHhmm, userId],
      ).rows?.[0];
      const totalTasksCount = count(tasksRow?.total);
      const completedTasksCount = count(tasksRow?.completed);
      const pendingTasksCount = count(tasksRow?.pending);
      const overdueTasksCount = count(tasksRow?.overdue);
      const dueTodayTasksCount = count(tasksRow?.due_today);
      const highPriorityPendingCount = count(tasksRow?.high_pending);

      const notesRow = db.executeSync(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN is_pinned = 1 THEN 1 ELSE 0 END), 0) AS pinned,
           COALESCE(SUM(CASE WHEN is_voice_transcribed = 1 THEN 1 ELSE 0 END), 0) AS voice
         FROM notes
         WHERE user_id = ? AND deleted_at IS NULL`,
        [userId],
      ).rows?.[0];
      const notesCount = count(notesRow?.total);
      const pinnedNotesCount = count(notesRow?.pinned);
      const voiceNotesCount = count(notesRow?.voice);

      const remindersRow = db.executeSync(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'acknowledged' AND snooze_count = 0 THEN 1 ELSE 0 END), 0) AS on_time,
           COALESCE(SUM(CASE WHEN status = 'acknowledged' AND snooze_count > 0 THEN 1 ELSE 0 END), 0) AS snoozed_outcomes,
           COALESCE(SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END), 0) AS missed,
           COALESCE(SUM(CASE WHEN status IN ('acknowledged', 'missed') THEN 1 ELSE 0 END), 0) AS finished,
           COALESCE(SUM(CASE WHEN status IN ('pending', 'snoozed', 'triggered') THEN 1 ELSE 0 END), 0) AS pending_active
         FROM reminders
         WHERE user_id = ? AND deleted_at IS NULL`,
        [userId],
      ).rows?.[0];
      const onTimeCount = count(remindersRow?.on_time);
      const snoozedOutcomesCount = count(remindersRow?.snoozed_outcomes);
      const missedRemindersCount = count(remindersRow?.missed);
      const finishedRemindersCount = count(remindersRow?.finished);
      const pendingRemindersCount = count(remindersRow?.pending_active);

      const alarmsRow = db.executeSync(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END), 0) AS enabled_count
         FROM alarms
         WHERE user_id = ?`,
        [userId],
      ).rows?.[0];
      const totalAlarmsCount = count(alarmsRow?.total);
      const enabledAlarmsCount = count(alarmsRow?.enabled_count);

      const lecturesRow = db.executeSync(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN transcript_json IS NOT NULL AND transcript_json <> '' AND transcript_json <> '[]' THEN 1 ELSE 0 END), 0) AS transcribed,
           COALESCE(SUM(CASE WHEN notes_json IS NOT NULL AND notes_json <> '' THEN 1 ELSE 0 END), 0) AS with_notes,
           COALESCE(SUM(CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE 0 END), 0) AS total_seconds
         FROM recorded_meetings
         WHERE user_id = ? AND deleted_at IS NULL`,
        [userId],
      ).rows?.[0];
      const lecturesCount = count(lecturesRow?.total);
      const transcribedLecturesCount = count(lecturesRow?.transcribed);
      const lectureNotesCount = count(lecturesRow?.with_notes);
      const totalLectureSeconds = count(lecturesRow?.total_seconds);

      const plannerWindow = createPlannerQueries(db).window(
        userId,
        weekStartStr,
        weekEndStr,
        {includeTasks: false},
      );
      let weeklyClassCount = 0;
      let weeklyClassMinutes = 0;
      let weeklyStudyBlockCount = 0;
      let weeklyStudyMinutes = 0;
      for (const block of plannerWindow.blocks) {
        const mins = durationMinutesBetween(block.startTime, block.endTime);
        if (block.category?.trim().toLowerCase() === 'class') {
          weeklyClassCount += 1;
          weeklyClassMinutes += mins;
        } else {
          weeklyStudyBlockCount += 1;
          weeklyStudyMinutes += mins;
        }
      }
      const weeklyEventCount = plannerWindow.events.length;
      const weeklyEventMinutes = plannerWindow.events.reduce(
        (sum, ev) => sum + durationMinutesBetween(ev.startTime, ev.endTime),
        0,
      );
      const weeklyScheduledMinutes =
        weeklyClassMinutes + weeklyStudyMinutes + weeklyEventMinutes;

      // Enrolled subjects count only from a reviewed COR (USTP mode).
      const academicProfile = getConfirmedAcademicProfile(userId);
      const enrolledCoursesCount = academicProfile?.courses?.length ?? 0;
      const totalCreditUnits = academicProfile?.totalCreditUnits ?? 0;

      const value: DetailedProfileStatistics = {
        available: true,
        completedTasksCount,
        pendingTasksCount,
        totalTasksCount,
        overdueTasksCount,
        dueTodayTasksCount,
        highPriorityPendingCount,
        taskCompletionRate: completionRate(
          completedTasksCount,
          totalTasksCount,
        ),
        weeklyClassCount,
        weeklyClassMinutes,
        weeklyStudyBlockCount,
        weeklyStudyMinutes,
        weeklyEventCount,
        weeklyEventMinutes,
        weeklyScheduledMinutes,
        enrolledCoursesCount,
        totalCreditUnits,
        notesCount,
        pinnedNotesCount,
        voiceNotesCount,
        lecturesCount,
        transcribedLecturesCount,
        lectureNotesCount,
        totalLectureSeconds,
        onTimeRate: onTimeRate(onTimeCount, finishedRemindersCount),
        onTimeCount,
        snoozedOutcomesCount,
        missedRemindersCount,
        finishedRemindersCount,
        pendingRemindersCount,
        enabledAlarmsCount,
        totalAlarmsCount,
      };
      if (detailedCache.size >= DETAILED_CACHE_LIMIT) {
        const oldest = detailedCache.keys().next().value;
        if (oldest !== undefined) detailedCache.delete(oldest);
      }
      detailedCache.set(cacheKey, value);
      return value;
    } catch (error) {
      console.warn(
        '[ProfileStatistics] Detailed statistics unavailable:',
        error,
      );
      return {...UNAVAILABLE_DETAILED_STATISTICS};
    }
  },
};
