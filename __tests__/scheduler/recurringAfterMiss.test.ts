/**
 * Audit 2, B1: a repeating reminder keeps repeating after a miss, both when
 * auto-snooze runs out and when the start-up sweep finds it long overdue.
 */
import {NativeModules} from 'react-native';
import {db, initDatabase, remindersStore} from '../../src/storage';
import {
  autoSnoozeReminderAction,
  rescheduleUserReminders,
} from '../../src/scheduler';
import {createNextRecurringReminder} from '../../src/scheduler/reminderActions';

const userId = 'student-recurring-miss';
const DAILY = 'Stretch [RRULE:FREQ=DAILY]';

const at = (daysFromToday: number, hour: number, minute = 0): Date => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const insert = (id: string, when: Date, status = 'pending') =>
  remindersStore.insertReminder({
    id,
    userId,
    task: 'Stretch',
    description: DAILY,
    scheduledAt: when.toISOString(),
    triggerAt: when.toISOString(),
    status: status as 'pending',
    preCastAudioPath: null,
  });

const futureOccurrences = () =>
  remindersStore
    .getPendingReminders(userId)
    .filter(r => new Date(r.triggerAt).getTime() > Date.now());

describe('recurring reminders after a miss (audit 2, B1)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM reminders');
  });

  test('auto-snooze running out marks missed and creates the next occurrence', async () => {
    const trigger = new Date(Date.now() - 60 * 1000);
    insert('rem-miss', trigger, 'snoozed');
    db.executeSync('UPDATE reminders SET snooze_count = 99 WHERE id = ?', [
      'rem-miss',
    ]);

    const result = await autoSnoozeReminderAction('rem-miss', userId);

    expect(result.outcome).toBe('missed');
    expect(remindersStore.getReminderById('rem-miss')?.status).toBe('missed');
    const next = futureOccurrences();
    expect(next).toHaveLength(1);
    expect(next[0].description).toBe(DAILY);
    expect(NativeModules.LafinaReminder.scheduleExactAlarm).toHaveBeenCalledWith(
      expect.objectContaining({reminderId: next[0].id, task: 'Stretch'}),
    );
  });

  test('the start-up sweep continues a long-overdue series once, in the future', async () => {
    // The phone was off for a week: one stale occurrence, 7 days ago.
    insert('rem-week-old', at(-7, 7, 0));

    const summary = await rescheduleUserReminders(userId);

    expect(summary.missed).toBe(1);
    expect(remindersStore.getReminderById('rem-week-old')?.status).toBe(
      'missed',
    );
    const next = futureOccurrences();
    expect(next).toHaveLength(1);
    const nextAt = new Date(next[0].triggerAt);
    expect(nextAt.getHours()).toBe(7);
    expect(nextAt.getTime()).toBeGreaterThan(Date.now());
    expect(nextAt.getTime() - Date.now()).toBeLessThanOrEqual(
      24 * 60 * 60 * 1000,
    );
  });

  test('the same occurrence is never created twice', () => {
    const missed = at(-1, 7, 0);
    insert('rem-dup', missed);
    const reminder = remindersStore.getReminderById('rem-dup')!;

    const first = createNextRecurringReminder(
      reminder,
      userId,
      undefined,
      new Date(),
    );
    const second = createNextRecurringReminder(
      reminder,
      userId,
      undefined,
      new Date(),
    );

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  test('a reminder without a repeat rule just ends', async () => {
    remindersStore.insertReminder({
      id: 'rem-once',
      userId,
      task: 'Submit form',
      description: null,
      scheduledAt: at(-2, 9).toISOString(),
      triggerAt: at(-2, 9).toISOString(),
      status: 'pending',
      preCastAudioPath: null,
    });

    await rescheduleUserReminders(userId);

    expect(remindersStore.getReminderById('rem-once')?.status).toBe('missed');
    expect(futureOccurrences()).toHaveLength(0);
  });
});
