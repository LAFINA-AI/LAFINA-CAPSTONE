/**
 * Alarm plan A4: old "Alarm" reminders become real alarms (owner decision 3),
 * and the optional morning briefing reads today's schedule offline after a
 * dismissed alarm. No network; speech is the mocked react-native-tts.
 */
import {NativeModules, Platform} from 'react-native';
import {
  db,
  initDatabase,
  alarmsStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {
  confirmReviewedCommand,
  endReviewSession,
  prepareReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import {validateIntent} from '../../src/ai/nlu/types';
import type {ExtractedIntent} from '../../src/ai/nlu/types';
import {migrateAlarmReminders} from '../../src/scheduler/alarmMigration';
import {syncAlarmEvents} from '../../src/scheduler/alarmService';
import {WEEKDAYS} from '../../src/scheduler/alarmSchedule';
import * as tts from '../../src/ai/tts/ttsService';
import {
  buildMorningBriefing,
  startMorningBriefing,
} from '../../src/ai/briefing/morningBriefing';

/** Friday 13 Nov 2026, 10:00 local. */
const REF = new Date(2026, 10, 13, 10, 0, 0);
let n = 0;
const owner = (): string => `alarm-a4-${++n}`;

/** An "Alarm" reminder the way the pre-alarm build made it (task + reminder). */
const oldAlarmReminder = (
  userId: string,
  fields: Partial<ExtractedIntent> = {},
): string => {
  const prepared = prepareReviewedCommand(
    userId,
    validateIntent({
      intent: 'create_reminder',
      title: 'Alarm',
      date: '2026-11-14',
      time: '06:00',
      endTime: null,
      durationMinutes: null,
      category: 'Personal',
      details: null,
      snoozeMinutes: null,
      confidence: 1,
      source: 'fast_path',
      rawTranscript: 'set an alarm for 6',
      ...fields,
    }),
    {referenceDate: REF},
  );
  if (prepared.status !== 'proposal') throw new Error(prepared.reply);
  const done = confirmReviewedCommand(userId, prepared.proposal.operationId);
  if (done.status !== 'applied') throw new Error(done.reply);
  return String(done.receipt.reminderId);
};

const liveReminders = (userId: string) =>
  db.executeSync(
    'SELECT id, task FROM reminders WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  ).rows ?? [];

const outboxDeletes = (userId: string) =>
  (
    db.executeSync(
      "SELECT entity_type FROM sync_outbox WHERE user_id = ? AND operation = 'delete' ORDER BY entity_type",
      [userId],
    ).rows ?? []
  ).map(r => r.entity_type);

beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'queueMicrotask',
    ],
  });
  jest.setSystemTime(REF);
});
afterAll(() => {
  jest.useRealTimers();
});
beforeEach(async () => {
  await initDatabase();
  userStore.createGuestUser();
  endReviewSession();
});

describe('converting old "Alarm" reminders', () => {
  test('a waiting "Alarm" reminder becomes a one-shot alarm, once', () => {
    const userId = owner();
    const reminderId = oldAlarmReminder(userId);
    expect(migrateAlarmReminders(userId, REF)).toBe(1);

    const [alarm] = alarmsStore.list(userId);
    expect(alarm).toMatchObject({
      hour: 6,
      minute: 0,
      repeatDays: 0,
      oneShotDate: '2026-11-14',
      sourceReminderId: reminderId,
      enabled: true,
    });
    // The old reminder and its "Alarm" to-do are gone, through the outbox.
    expect(liveReminders(userId)).toHaveLength(0);
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);
    expect(outboxDeletes(userId)).toEqual(['reminder', 'task']);

    expect(migrateAlarmReminders(userId, REF)).toBe(0);
    expect(alarmsStore.list(userId)).toHaveLength(1);
  });

  test('a repeating one keeps its days; "Wake up" keeps its label', () => {
    const userId = owner();
    oldAlarmReminder(userId, {
      title: 'Wake up',
      time: '05:30',
      recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    });
    migrateAlarmReminders(userId, REF);
    expect(alarmsStore.list(userId)[0]).toMatchObject({
      hour: 5,
      minute: 30,
      repeatDays: WEEKDAYS,
      oneShotDate: null,
      label: 'Wake up',
    });
  });

  test('other reminders, and a past one-time alarm, are left alone', () => {
    const userId = owner();
    oldAlarmReminder(userId, {title: 'Alarm system check'});
    expect(migrateAlarmReminders(userId, REF)).toBe(0);
    // An "Alarm" for Sat 06:00, read on Sunday: its time has passed.
    oldAlarmReminder(userId);
    expect(migrateAlarmReminders(userId, new Date(2026, 10, 15))).toBe(0);
    expect(alarmsStore.list(userId)).toHaveLength(0);
    expect(liveReminders(userId)).toHaveLength(2);
  });

  test('only this owner is converted', () => {
    const mine = owner();
    const theirs = owner();
    oldAlarmReminder(theirs);
    expect(migrateAlarmReminders(mine, REF)).toBe(0);
    expect(liveReminders(theirs)).toHaveLength(1);
  });
});

describe('morning briefing', () => {
  const MORNING = new Date(2026, 10, 13, 6, 5, 0);

  test('reads today’s schedule in time order, offline', () => {
    const userId = owner();
    timeBlocksStore.insert({
      id: `blk-${n}`,
      userId,
      title: 'Physics review',
      date: '2026-11-13',
      startTime: '14:00',
      endTime: '15:00',
      color: '#3498DB',
      category: 'Academic',
      recurrenceRule: null,
    });
    tasksStore.insertTask({
      id: `tsk-${n}`,
      userId,
      title: 'Submit lab report',
      dueDate: '2026-11-13',
      dueTime: '09:00',
      isCompleted: false,
      priority: 'High',
      category: 'Academic',
      notes: null,
      recurrenceRule: null,
    });
    tasksStore.insertTask({
      id: `tsk2-${n}`,
      userId,
      title: 'Buy notebook',
      dueDate: '2026-11-13',
      dueTime: null,
      isCompleted: false,
      priority: 'Low',
      category: 'Personal',
      notes: null,
      recurrenceRule: null,
    });
    expect(buildMorningBriefing(userId, MORNING)).toBe(
      "Good morning. It's 6:05 AM, Friday, November 13. You have 2 things scheduled: Submit lab report at 9:00 AM and Physics review at 2:00 PM. Due today: Buy notebook.",
    );
  });

  test('a clear day says so', () => {
    expect(buildMorningBriefing(owner(), MORNING)).toBe(
      "Good morning. It's 6:05 AM, Friday, November 13. Your schedule is clear today.",
    );
  });

  test('plays after a dismissed briefing alarm, not after other alarms', async () => {
    const originalOs = Platform.OS;
    Platform.OS = 'android';
    const speak = jest
      .spyOn(tts, 'speakTextWithTts')
      .mockResolvedValue(undefined);
    const stop = startMorningBriefing();
    try {
      const userId = owner();
      const withBriefing = alarmsStore.create(userId, {
        hour: 6,
        minute: 0,
        briefing: true,
      });
      const plain = alarmsStore.create(userId, {hour: 7, minute: 0});
      const now = Date.now();
      (
        NativeModules.LafinaAlarm.drainEvents as jest.Mock
      ).mockResolvedValueOnce([
        {alarmId: plain.id, kind: 'dismissed', atMs: now - 1000, generation: 1},
        {
          alarmId: withBriefing.id,
          kind: 'dismissed',
          atMs: now - 60_000,
          generation: 1,
        },
      ]);
      await syncAlarmEvents(userId, now);
      expect(speak).toHaveBeenCalledTimes(1);
      expect(speak.mock.calls[0][0]).toMatch(/^Good morning\./);

      // Opened long after Dismiss: no briefing.
      speak.mockClear();
      (
        NativeModules.LafinaAlarm.drainEvents as jest.Mock
      ).mockResolvedValueOnce([
        {
          alarmId: withBriefing.id,
          kind: 'dismissed',
          atMs: now - 30 * 60_000,
          generation: 1,
        },
      ]);
      await syncAlarmEvents(userId, now);
      expect(speak).not.toHaveBeenCalled();
    } finally {
      stop();
      speak.mockRestore();
      Platform.OS = originalOs;
    }
  });
});
