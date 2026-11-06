import { db, DatabaseTransaction } from './database';
import { syncOutboxStore } from './syncOutboxStore';
import { remindersForSource } from './sourceReminders';
import { eventTimeStore, zoneTimingFromRow } from './eventTimeStore';
import type { EventFolds, FoldChoice } from './eventTime';

export interface Task {
  id: string;
  userId: string;
  title: string;
  dueDate?: string | null; // YYYY-MM-DD
  dueTime?: string | null; // HH:MM
  isCompleted: boolean;
  priority: 'High' | 'Medium' | 'Low';
  category: string;
  notes?: string | null;
  recurrenceRule?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Event {
  id: string;
  userId: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  location?: string | null;
  linkedCalendarBlock?: string | null;
  recurrenceRule?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  /**
   * Device-local timezone metadata (AGY-PORT 08), present only on reads that
   * join `event_time_local` and only while it still matches the wall time.
   * Never synced. A recurring occurrence keeps the zone but not the instants.
   */
  timeZone?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  startFold?: FoldChoice | null;
  endFold?: FoldChoice | null;
}

export const mapRowToTask = (row: any): Task => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  dueDate: row.due_date,
  dueTime: row.due_time,
  isCompleted: row.is_completed === 1,
  priority: row.priority as Task['priority'],
  category: row.category,
  notes: row.notes,
  recurrenceRule: row.recurrence_rule,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
});

export const mapRowToEvent = (row: any): Event => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  date: row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  location: row.location,
  linkedCalendarBlock: row.linked_calendar_block,
  recurrenceRule: row.recurrence_rule,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  ...zoneFields(row),
});

const zoneFields = (row: any): Partial<Event> => {
  const timing = row && typeof row === 'object' ? zoneTimingFromRow(row) : null;
  return timing ? { ...timing } : {};
};

type StoredSyncRow = Record<string, unknown>;

interface ReminderCleanupRow {
  id: string;
  preCastAudioPath: string | null;
}

const scheduleReminderCleanup = (
  executor: DatabaseTransaction,
  reminders: ReminderCleanupRow[],
  source: 'deleteTask' | 'deleteEvent' | 'updateTaskCompleted',
): void => {
  if (reminders.length === 0) return;
  const cleanupRows = [...reminders];
  const cleanup = (): void => {
    for (const reminder of cleanupRows) {
      try {
        const { cancelReminderAlarm, finishNativeIncomingCall } = require('../scheduler/reminderAlarm');
        const { deletePreCachedReminderAudio } = require('../ai/tts/ttsService');
        cancelReminderAlarm(reminder.id).catch((error: unknown) =>
          console.error(`[${source}] Failed to cancel alarm for reminder ${reminder.id}:`, error),
        );
        finishNativeIncomingCall(reminder.id).catch((error: unknown) =>
          console.error(`[${source}] Failed to finish incoming call for reminder ${reminder.id}:`, error),
        );
        if (reminder.preCastAudioPath) {
          deletePreCachedReminderAudio(reminder.preCastAudioPath).catch((error: unknown) =>
            console.error(`[${source}] Failed to delete audio for reminder ${reminder.id}:`, error),
          );
        }
      } catch (error) {
        console.error(`[${source}] Failed to import modules for reminder cleanup:`, error);
      }
    }
  };

  if (executor.afterCommit) executor.afterCommit(cleanup);
  else cleanup();
};

const taskPayload = (row: StoredSyncRow): Record<string, unknown> => ({
  title: row.title,
  due_date: row.due_date,
  due_time: row.due_time,
  is_completed: row.is_completed === 1,
  priority: row.priority,
  category: row.category,
  notes: row.notes,
  recurrence_rule: row.recurrence_rule,
});

const eventPayload = (row: StoredSyncRow): Record<string, unknown> => ({
  title: row.title,
  date: row.date,
  start_time: row.start_time,
  end_time: row.end_time,
  location: row.location,
  linked_calendar_block: row.linked_calendar_block,
  recurrence_rule: row.recurrence_rule,
});

export const tasksStore = {
  // --- Task Methods ---

  getAllTasks: (userId: string): Task[] => {
    try {
      const result = db.executeSync(
        `SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_completed ASC, due_date ASC, due_time ASC`,
        [userId],
      );
      return result.rows.map(mapRowToTask);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
  },

  /**
   * One page of open tasks that have no due date (AGY-PORT 04), oldest first.
   * Keyset-paged on (created_at, id) so long lists stay bounded. Throws on a
   * read failure so the screen can say so instead of showing an empty list.
   */
  getUndatedTasksPage: (
    userId: string,
    options: { limit?: number; after?: string | null } = {},
  ): { items: Task[]; nextCursor: string | null } => {
    const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 20)));
    let afterCreated: string | null = null;
    let afterId: string | null = null;
    if (options.after) {
      const split = options.after.indexOf('|');
      if (split <= 0) throw new Error('Invalid undated task cursor.');
      afterCreated = options.after.slice(0, split);
      afterId = options.after.slice(split + 1);
    }
    const rows =
      db.executeSync(
        `SELECT * FROM tasks
          WHERE user_id = ? AND deleted_at IS NULL AND is_completed = 0
            AND (due_date IS NULL OR due_date = '')
            AND (? IS NULL OR created_at > ? OR (created_at = ? AND id > ?))
          ORDER BY created_at ASC, id ASC
          LIMIT ?`,
        [userId, afterCreated, afterCreated, afterCreated, afterId, limit + 1],
      ).rows || [];
    const items = rows.slice(0, limit).map(mapRowToTask);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  },

  insertTask: (
    task: Omit<Task, 'createdAt' | 'updatedAt' | 'deletedAt'>,
    executor?: DatabaseTransaction,
  ): void => {
    const now = new Date().toISOString();
    const applyInsert = (tx: DatabaseTransaction): void => {
      tx.executeSync(
        `INSERT INTO tasks (id, user_id, title, due_date, due_time, is_completed, priority, category, notes, recurrence_rule, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id,
          task.userId,
          task.title,
          task.dueDate || null,
          task.dueTime || null,
          task.isCompleted ? 1 : 0,
          task.priority,
          task.category,
          task.notes || null,
          task.recurrenceRule || null,
          now,
          now,
        ],
      );
      syncOutboxStore.enqueueMutation(
        task.userId,
        'task',
        task.id,
        'create',
        {
          title: task.title,
          due_date: task.dueDate || null,
          due_time: task.dueTime || null,
          is_completed: task.isCompleted,
          priority: task.priority,
          category: task.category,
          notes: task.notes || null,
          recurrence_rule: task.recurrenceRule || null,
        },
        'account',
        task.userId,
        tx,
      );
    };
    try {
      if (executor) applyInsert(executor);
      else db.transactionSync(applyInsert);
    } catch (error) {
      console.error('Error inserting task:', error);
      throw error;
    }
  },

  updateTask: (task: Partial<Task> & { id: string }, executor?: DatabaseTransaction): void => {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: any[] = [];

    const fields: { key: keyof Task; col: string; type?: string }[] = [
      { key: 'title', col: 'title' },
      { key: 'dueDate', col: 'due_date' },
      { key: 'dueTime', col: 'due_time' },
      { key: 'isCompleted', col: 'is_completed', type: 'boolean' },
      { key: 'priority', col: 'priority' },
      { key: 'category', col: 'category' },
      { key: 'notes', col: 'notes' },
      { key: 'recurrenceRule', col: 'recurrence_rule' },
    ];

    fields.forEach(({ key, col, type }) => {
      if (task[key] !== undefined) {
        sets.push(`${col} = ?`);
        if (type === 'boolean') {
          params.push(task[key] ? 1 : 0);
        } else {
          params.push(task[key] === null ? null : task[key]);
        }
      }
    });

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    params.push(now);
    params.push(task.id);

    const cleanupRows: ReminderCleanupRow[] = [];
    const applyUpdate = (tx: DatabaseTransaction): void => {
      tx.executeSync(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params);
      const row = tx.executeSync('SELECT * FROM tasks WHERE id = ?', [task.id]).rows?.[0] as
        | StoredSyncRow
        | undefined;
      if (row) {
        const userId = String(row.user_id);
        syncOutboxStore.enqueueMutation(
          userId,
          'task',
          task.id,
          'update',
          taskPayload(row),
          'account',
          userId,
          tx,
        );

        if (row.is_completed === 1) {
          const reminders = remindersForSource(tx, userId, 'task', task.id, row.title, [
            'pending',
            'snoozed',
            'triggered',
          ]);
          for (const rem of reminders) {
            tx.executeSync(
              `UPDATE reminders SET status = 'acknowledged', updated_at = ? WHERE id = ?`,
              [now, rem.id],
            );
            syncOutboxStore.enqueueMutation(
              userId,
              'reminder',
              String(rem.id),
              'update',
              { status: 'acknowledged' },
              'account',
              userId,
              tx,
            );
            cleanupRows.push({
              id: String(rem.id),
              preCastAudioPath:
                typeof rem.precast_audio_path === 'string' ? rem.precast_audio_path : null,
            });
          }
        }
      }
      scheduleReminderCleanup(tx, cleanupRows, 'updateTaskCompleted');
    };
    try {
      if (executor) applyUpdate(executor);
      else db.transactionSync(applyUpdate);
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  },

  deleteTask: (id: string, tx?: DatabaseTransaction): void => {
    const now = new Date().toISOString();
    const cleanupRows: ReminderCleanupRow[] = [];
    const applyDelete = (executor: DatabaseTransaction): void => {
      const taskRowResult = executor.executeSync(
        `SELECT user_id, title FROM tasks WHERE id = ?`,
        [id],
      );
      const taskRow = taskRowResult.rows?.[0];
      if (!taskRow) return;

      executor.executeSync(
        `UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, id],
      );
      const userId = String(taskRow.user_id);
      syncOutboxStore.enqueueMutation(userId, 'task', id, 'delete', {}, 'account', userId, executor);

      const reminders = remindersForSource(executor, userId, 'task', id, taskRow.title, [
        'pending',
        'snoozed',
      ]);

      for (const reminder of reminders) {
        executor.executeSync(
          `UPDATE reminders SET deleted_at = ?, updated_at = ? WHERE id = ?`,
          [now, now, reminder.id],
        );
        syncOutboxStore.enqueueMutation(
          userId,
          'reminder',
          String(reminder.id),
          'delete',
          {},
          'account',
          userId,
          executor,
        );
        cleanupRows.push({
          id: String(reminder.id),
          preCastAudioPath:
            typeof reminder.precast_audio_path === 'string' ? reminder.precast_audio_path : null,
        });
      }
      scheduleReminderCleanup(executor, cleanupRows, 'deleteTask');
    };
    try {
      if (tx) applyDelete(tx);
      else db.transactionSync(applyDelete);
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  },

  // --- Event Methods ---

  getAllEvents: (userId: string): Event[] => {
    try {
      const result = db.executeSync(
        `SELECT * FROM events WHERE user_id = ? AND deleted_at IS NULL ORDER BY date ASC, start_time ASC`,
        [userId],
      );
      return result.rows.map(mapRowToEvent);
    } catch (error) {
      console.error('Error fetching events:', error);
      return [];
    }
  },

  /**
   * `folds` chooses between the two instants of a repeated wall time when the
   * device timezone has one; the event's wire payload is unchanged.
   */
  insertEvent: (
    event: Omit<Event, 'createdAt' | 'updatedAt' | 'deletedAt'>,
    executor?: DatabaseTransaction,
    folds?: EventFolds,
  ): void => {
    const now = new Date().toISOString();
    const applyInsert = (tx: DatabaseTransaction): void => {
      tx.executeSync(
        `INSERT INTO events (id, user_id, title, date, start_time, end_time, location, linked_calendar_block, recurrence_rule, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.userId,
          event.title,
          event.date,
          event.startTime,
          event.endTime,
          event.location || null,
          event.linkedCalendarBlock || null,
          event.recurrenceRule || null,
          now,
          now,
        ],
      );
      syncOutboxStore.enqueueMutation(
        event.userId,
        'event',
        event.id,
        'create',
        {
          title: event.title,
          date: event.date,
          start_time: event.startTime,
          end_time: event.endTime,
          location: event.location || null,
          linked_calendar_block: event.linkedCalendarBlock || null,
          recurrence_rule: event.recurrenceRule || null,
        },
        'account',
        event.userId,
        tx,
      );
      eventTimeStore.recordLocal(
        tx,
        {
          id: event.id,
          user_id: event.userId,
          date: event.date,
          start_time: event.startTime,
          end_time: event.endTime,
        },
        folds,
      );
    };
    try {
      if (executor) applyInsert(executor);
      else db.transactionSync(applyInsert);
    } catch (error) {
      console.error('Error inserting event:', error);
      throw error;
    }
  },

  /**
   * When the date, start or end actually changes, this device's timezone is
   * recorded again for the new wall time (`folds` as for insertEvent); a
   * title-only edit keeps the existing metadata.
   */
  updateEvent: (
    event: Partial<Event> & { id: string },
    executor?: DatabaseTransaction,
    folds?: EventFolds,
  ): void => {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: any[] = [];

    const fields: { key: keyof Event; col: string }[] = [
      { key: 'title', col: 'title' },
      { key: 'date', col: 'date' },
      { key: 'startTime', col: 'start_time' },
      { key: 'endTime', col: 'end_time' },
      { key: 'location', col: 'location' },
      { key: 'linkedCalendarBlock', col: 'linked_calendar_block' },
      { key: 'recurrenceRule', col: 'recurrence_rule' },
    ];

    fields.forEach(({ key, col }) => {
      if (event[key] !== undefined) {
        sets.push(`${col} = ?`);
        params.push(event[key] === null ? null : event[key]);
      }
    });

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    params.push(now);
    params.push(event.id);

    const applyUpdate = (tx: DatabaseTransaction): void => {
      const before = tx.executeSync(
        'SELECT date, start_time, end_time FROM events WHERE id = ?',
        [event.id],
      ).rows?.[0] as StoredSyncRow | undefined;
      tx.executeSync(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`, params);
      const row = tx.executeSync('SELECT * FROM events WHERE id = ?', [event.id]).rows?.[0] as
        | StoredSyncRow
        | undefined;
      if (
        row &&
        before &&
        row.deleted_at == null &&
        (before.date !== row.date ||
          before.start_time !== row.start_time ||
          before.end_time !== row.end_time)
      ) {
        eventTimeStore.recordLocal(tx, row as never, folds);
      }
      if (row) {
        syncOutboxStore.enqueueMutation(
          String(row.user_id),
          'event',
          event.id,
          'update',
          eventPayload(row),
          'account',
          String(row.user_id),
          tx,
        );
      }
    };
    try {
      if (executor) applyUpdate(executor);
      else db.transactionSync(applyUpdate);
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  },

  deleteEvent: (id: string, tx?: DatabaseTransaction): void => {
    const now = new Date().toISOString();
    const cleanupRows: ReminderCleanupRow[] = [];
    const applyDelete = (executor: DatabaseTransaction): void => {
      const eventRowResult = executor.executeSync(
        `SELECT user_id, title FROM events WHERE id = ?`,
        [id],
      );
      const eventRow = eventRowResult.rows?.[0];
      if (!eventRow) return;

      executor.executeSync(
        `UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, id],
      );
      const userId = String(eventRow.user_id);
      syncOutboxStore.enqueueMutation(userId, 'event', id, 'delete', {}, 'account', userId, executor);
      const reminders = remindersForSource(executor, userId, 'event', id, eventRow.title, [
        'pending',
        'snoozed',
      ]);
      for (const reminder of reminders) {
        executor.executeSync(
          `UPDATE reminders SET deleted_at = ?, updated_at = ? WHERE id = ?`,
          [now, now, reminder.id],
        );
        syncOutboxStore.enqueueMutation(
          userId,
          'reminder',
          String(reminder.id),
          'delete',
          {},
          'account',
          userId,
          executor,
        );
        cleanupRows.push({
          id: String(reminder.id),
          preCastAudioPath:
            typeof reminder.precast_audio_path === 'string' ? reminder.precast_audio_path : null,
        });
      }
      scheduleReminderCleanup(executor, cleanupRows, 'deleteEvent');
    };
    try {
      if (tx) applyDelete(tx);
      else db.transactionSync(applyDelete);
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  },
};
