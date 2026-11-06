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

/** An item a reminder belongs to. `linked` is false for the evidence rule. */
export interface ReminderSource {
  type: ReminderSourceKind;
  id: string;
  linked: boolean;
}

/**
 * Title comparison key: ignores letter case and spacing (inner runs of
 * whitespace are collapsed). A title match on its own never establishes which
 * item a reminder belongs to; see `inferLegacySource`.
 */
export const legacyTitleKey = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * The local date and minute of an instant, the way the Calendar form stores an
 * item's date and time. Null when the instant is invalid or not on a whole
 * minute (a form-created reminder is always scheduled on the item's minute).
 */
export const localDateAndMinute = (
  iso: unknown,
): {date: string; time: string} | null => {
  const value = new Date(String(iso ?? ''));
  if (Number.isNaN(value.getTime())) return null;
  if (value.getSeconds() !== 0 || value.getMilliseconds() !== 0) return null;
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
      value.getDate(),
    )}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
};

const SOURCE_KINDS: readonly ReminderSourceKind[] = [
  'task',
  'event',
  'time_block',
];

/** Items of one owner due at one local date and minute (seconds optional). */
const ITEMS_AT: Record<ReminderSourceKind, string> = {
  task: `SELECT id, title FROM tasks
          WHERE user_id = ? AND due_date = ? AND due_time IN (?, ?)
            AND (deleted_at IS NULL OR id = ?)`,
  event: `SELECT id, title FROM events
           WHERE user_id = ? AND date = ? AND start_time IN (?, ?)
             AND (deleted_at IS NULL OR id = ?)`,
  time_block: `SELECT id, title FROM time_blocks
                WHERE user_id = ? AND date = ? AND start_time IN (?, ?)
                  AND (deleted_at IS NULL OR id = ?)`,
};

/**
 * Strict evidence rule for a reminder with no exact link (data created before
 * links existed, or synced from another device; links are local metadata).
 *
 * The reminder belongs to an item only when exactly one item of the same owner
 * has the same title (ignoring case and spacing) AND its own due date and time
 * equal the reminder's scheduled instant, which is how AGY's Calendar form and
 * assistant create an item's reminder. No match, or more than one, means the
 * reminder is standalone: it is never deleted, renamed, moved, acknowledged or
 * suppressed because of another item.
 *
 * `subject` is considered even when it was soft-deleted in the same
 * transaction (a delete cascade reads its own item after marking it deleted).
 */
export const inferLegacySource = (
  executor: DatabaseTransaction,
  userId: string,
  reminderText: unknown,
  scheduledAt: unknown,
  subject?: {type: ReminderSourceKind; id: string},
): {type: ReminderSourceKind; id: string} | null => {
  const key = legacyTitleKey(reminderText);
  if (!key) return null;
  const at = localDateAndMinute(scheduledAt);
  if (!at) return null;
  const matches: Array<{type: ReminderSourceKind; id: string}> = [];
  for (const type of SOURCE_KINDS) {
    const rows =
      executor.executeSync(ITEMS_AT[type], [
        userId,
        at.date,
        at.time,
        `${at.time}:00`,
        subject?.type === type ? subject.id : '',
      ]).rows || [];
    for (const row of rows) {
      if (legacyTitleKey(row.title) === key) {
        matches.push({type, id: String(row.id)});
      }
    }
  }
  return matches.length === 1 ? matches[0] : null;
};

/**
 * The item a reminder belongs to: its exact link, otherwise the strict
 * evidence rule, otherwise null (a standalone reminder).
 */
export const resolveReminderSource = (
  executor: DatabaseTransaction,
  reminder: {id: string; userId: string; task: unknown; scheduledAt: unknown},
): ReminderSource | null => {
  const job = executor.executeSync(
    `SELECT source_type, source_id FROM reminder_delivery_jobs
      WHERE reminder_id = ? AND user_id = ?`,
    [reminder.id, reminder.userId],
  ).rows?.[0];
  if (job?.source_type && job?.source_id) {
    return {
      type: String(job.source_type) as ReminderSourceKind,
      id: String(job.source_id),
      linked: true,
    };
  }
  const inferred = inferLegacySource(
    executor,
    reminder.userId,
    reminder.task,
    reminder.scheduledAt,
  );
  return inferred ? {...inferred, linked: false} : null;
};

/** Whether two resolved sources name the same item. */
export const sameSource = (
  left: {type: string; id: string} | null,
  right: {type: string; id: string} | null,
): boolean =>
  !!left && !!right && left.type === right.type && left.id === right.id;

/**
 * Reminders that belong to one task, event or time block.
 *
 * A reminder with an exact source link (local `reminder_delivery_jobs`
 * metadata) belongs only to the item it is linked to. A reminder without a
 * link belongs to this item only under the strict evidence rule of
 * `inferLegacySource` (same owner, same title and the item's exact due
 * instant, with no other item qualifying). A shared title alone is never
 * enough, so another item's or a standalone reminder is never touched.
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
              r.scheduled_at AS scheduled_at,
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
  const subject = {type: sourceType, id: sourceId};
  return rows
    .filter(
      row =>
        row.source_type != null ||
        (key !== '' &&
          legacyTitleKey(row.task) === key &&
          sameSource(
            inferLegacySource(
              executor,
              userId,
              row.task,
              row.scheduled_at,
              subject,
            ),
            subject,
          )),
    )
    .map(row => ({
      id: String(row.id),
      precast_audio_path: row.precast_audio_path,
      task: String(row.task ?? ''),
      trigger_at: String(row.trigger_at ?? ''),
      linked: row.source_type != null,
    }));
};

const sameInstant = (left: unknown, right: unknown): boolean => {
  const a = new Date(String(left ?? '')).getTime();
  const b = new Date(String(right ?? '')).getTime();
  return Number.isFinite(a) && a === b;
};

export interface ReminderIdentity {
  id: string;
  userId: string;
  task: unknown;
  scheduledAt: unknown;
}

/**
 * Whether `other` is the same alert as `reminder`: same owner and the same
 * resolved item (exact link or strict evidence), or, when neither belongs to
 * an item, the same text at the same scheduled instant (an exact duplicate).
 * Reminders that only share a title are different alerts.
 */
export const isSameAlert = (
  executor: DatabaseTransaction,
  reminder: ReminderIdentity,
  other: ReminderIdentity,
  reminderSource: ReminderSource | null = resolveReminderSource(
    executor,
    reminder,
  ),
): boolean => {
  if (other.id === reminder.id || other.userId !== reminder.userId) {
    return false;
  }
  const otherSource = resolveReminderSource(executor, other);
  if (reminderSource || otherSource) {
    return sameSource(reminderSource, otherSource);
  }
  const key = legacyTitleKey(reminder.task);
  return (
    key !== '' &&
    legacyTitleKey(other.task) === key &&
    sameInstant(reminder.scheduledAt, other.scheduledAt)
  );
};

/**
 * Why a due reminder should be quietly acknowledged instead of ringing, or
 * null. `task_completed`: the task it belongs to is completed.
 * `already_acknowledged`: the same alert (see `isSameAlert`) was already
 * acknowledged. A completed task or acknowledged reminder that merely shares
 * the title no longer silences a different reminder.
 */
export const alertSuppression = (
  executor: DatabaseTransaction,
  reminder: ReminderIdentity,
): 'task_completed' | 'already_acknowledged' | null => {
  const source = resolveReminderSource(executor, reminder);
  if (source?.type === 'task') {
    const task = executor.executeSync(
      `SELECT is_completed FROM tasks
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [source.id, reminder.userId],
    ).rows?.[0];
    if (task && Number(task.is_completed) === 1) return 'task_completed';
  }
  const key = legacyTitleKey(reminder.task);
  const acknowledged =
    executor.executeSync(
      `SELECT r.id AS id, r.task AS task, r.scheduled_at AS scheduled_at,
              j.source_type AS source_type, j.source_id AS source_id
         FROM reminders r
         LEFT JOIN reminder_delivery_jobs j ON j.reminder_id = r.id
        WHERE r.user_id = ? AND r.id <> ? AND r.status = 'acknowledged'
          AND r.deleted_at IS NULL`,
      [reminder.userId, reminder.id],
    ).rows || [];
  for (const row of acknowledged) {
    const linkedHere =
      !!source &&
      row.source_type === source.type &&
      String(row.source_id ?? '') === source.id;
    if (!linkedHere && (key === '' || legacyTitleKey(row.task) !== key)) {
      continue;
    }
    if (
      isSameAlert(
        executor,
        reminder,
        {
          id: String(row.id),
          userId: reminder.userId,
          task: row.task,
          scheduledAt: row.scheduled_at,
        },
        source,
      )
    ) {
      return 'already_acknowledged';
    }
  }
  return null;
};
