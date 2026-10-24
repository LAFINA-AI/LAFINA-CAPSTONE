import { NativeModules, DeviceEventEmitter } from 'react-native';
import {
  db,
  initDatabase,
  remindersStore,
  tasksStore,
  preferencesStore,
  getDefaultUserPreferences,
} from '../../src/storage';
import {
  scheduleReminderAlarm,
  cancelReminderAlarm,
  reconcileReminderAlarms,
  getReminderPermissionStatus,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  snoozeReminderAction,
  acknowledgeReminderAction,
  autoSnoozeReminderAction,
  checkAndTriggerReminders,
  startReminderPoller,
  stopReminderPoller,
  rescheduleUserReminders,
  EVENT_CALL_TRIGGER,
} from '../../src/scheduler';

describe('Phase 03 Reminder Alarms, Lifecycle Recovery & Actions', () => {
  const userId = 'student-scheduler-test';

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    stopReminderPoller();

    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM users');

    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, 'Scheduler Student', 'student@ustp.edu.ph', 'student', 0, 0, 0, 0, now, now],
    );

    preferencesStore.save(userId, {
      ...getDefaultUserPreferences(),
      reminderLeadMinutes: 10,
      snoozeTendency: 'snooze_multiple',
    });
  });

  afterEach(() => {
    stopReminderPoller();
  });

  describe('Native Alarm Scheduling (reminderAlarm.ts)', () => {
    test('schedules exact alarm with valid future timestamp', async () => {
      const futureTrigger = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await scheduleReminderAlarm('rem-1', 'Study Computer Architecture', futureTrigger);

      expect(NativeModules.LafinaReminder.scheduleExactAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          reminderId: 'rem-1',
          task: 'Study Computer Architecture',
        }),
      );
    });

    test('rejects alarm scheduling for past or invalid timestamps', async () => {
      const pastTrigger = new Date(Date.now() - 60 * 1000).toISOString();
      await expect(
        scheduleReminderAlarm('rem-past', 'Past Task', pastTrigger),
      ).rejects.toThrow('Reminder trigger must be a valid future time.');

      await expect(
        scheduleReminderAlarm('rem-inv', 'Invalid Task', 'not-a-date'),
      ).rejects.toThrow('Reminder trigger must be a valid future time.');
    });

    test('cancels scheduled alarm via native module', async () => {
      await cancelReminderAlarm('rem-1');
      expect(NativeModules.LafinaReminder.cancelAlarm).toHaveBeenCalledWith('rem-1');
    });

    test('reconciles only future pending and snoozed reminders', async () => {
      const now = Date.now();
      const futureIso1 = new Date(now + 10 * 60 * 1000).toISOString();
      const futureIso2 = new Date(now + 20 * 60 * 1000).toISOString();
      const pastIso = new Date(now - 10 * 60 * 1000).toISOString();

      remindersStore.insertReminder({
        id: 'rem-future-pending',
        userId,
        task: 'Future Pending',
        description: null,
        scheduledAt: futureIso1,
        triggerAt: futureIso1,
        status: 'pending',
        preCastAudioPath: null,
      });

      remindersStore.insertReminder({
        id: 'rem-future-snoozed',
        userId,
        task: 'Future Snoozed',
        description: null,
        scheduledAt: futureIso2,
        triggerAt: futureIso2,
        status: 'snoozed',
        preCastAudioPath: null,
      });

      remindersStore.insertReminder({
        id: 'rem-past',
        userId,
        task: 'Past Reminder',
        description: null,
        scheduledAt: pastIso,
        triggerAt: pastIso,
        status: 'pending',
        preCastAudioPath: null,
      });

      remindersStore.insertReminder({
        id: 'rem-ack',
        userId,
        task: 'Already Acknowledged',
        description: null,
        scheduledAt: futureIso1,
        triggerAt: futureIso1,
        status: 'acknowledged',
        preCastAudioPath: null,
      });

      const pending = remindersStore.getPendingReminders(userId);
      await reconcileReminderAlarms(pending);

      // Only the two future reminders (pending and snoozed) should be scheduled
      expect(NativeModules.LafinaReminder.scheduleExactAlarm).toHaveBeenCalledTimes(2);
      expect(NativeModules.LafinaReminder.scheduleExactAlarm).toHaveBeenCalledWith(
        expect.objectContaining({ reminderId: 'rem-future-pending' }),
      );
      expect(NativeModules.LafinaReminder.scheduleExactAlarm).toHaveBeenCalledWith(
        expect.objectContaining({ reminderId: 'rem-future-snoozed' }),
      );
    });

    test('queries permission status and opens settings', async () => {
      const perms = await getReminderPermissionStatus();
      expect(perms).toEqual({
        canScheduleExactAlarms: true,
        canUseFullScreenIntent: true,
        notificationsEnabled: true,
      });

      await openExactAlarmSettings();
      expect(NativeModules.LafinaReminder.openExactAlarmSettings).toHaveBeenCalled();

      await openFullScreenIntentSettings();
      expect(NativeModules.LafinaReminder.openFullScreenIntentSettings).toHaveBeenCalled();
    });
  });

  describe('Reminder User Actions (reminderActions.ts)', () => {
    test('snoozes a reminder within limit and updates SQLite triggerAt and snoozeCount', async () => {
      const now = Date.now();
      const initialTrigger = new Date(now + 10 * 60 * 1000).toISOString();

      remindersStore.insertReminder({
        id: 'rem-snooze-test',
        userId,
        task: 'Read Chemistry Chapter 3',
        description: null,
        scheduledAt: initialTrigger,
        triggerAt: initialTrigger,
        status: 'pending',
        preCastAudioPath: null,
      });

      const result = await snoozeReminderAction('rem-snooze-test', userId, 10);
      expect(result.ok).toBe(true);
      expect(result.outcome).toBe('snoozed');
      expect(result.triggerAt).toBeDefined();

      const updated = remindersStore.getReminderById('rem-snooze-test');
      expect(updated?.status).toBe('snoozed');
      expect(updated?.snoozeCount).toBe(1);
      expect(NativeModules.LafinaReminder.scheduleExactAlarm).toHaveBeenCalled();
      expect(NativeModules.LafinaReminder.finishIncomingCall).toHaveBeenCalledWith('rem-snooze-test');
    });

    test('rejects snooze when max snooze count is reached', async () => {
      const now = Date.now();
      const trigger = new Date(now + 10 * 60 * 1000).toISOString();

      remindersStore.insertReminder({
        id: 'rem-snooze-limit',
        userId,
        task: 'Read Chemistry Chapter 4',
        description: null,
        scheduledAt: trigger,
        triggerAt: trigger,
        status: 'snoozed',
        preCastAudioPath: null,
      });

      // Max snooze count is set to 3 for snooze_multiple
      db.executeSync('UPDATE reminders SET snooze_count = 3 WHERE id = ?', ['rem-snooze-limit']);

      const result = await snoozeReminderAction('rem-snooze-limit', userId, 10);
      expect(result.ok).toBe(false);
      expect(result.outcome).toBe('rejected');
      expect(result.message).toContain('limit of 3 snoozes');
    });

    test('acknowledging reminder updates reminder status WITHOUT completing the underlying task', async () => {
      // 1. Create a task in tasksStore
      const taskId = 'task-linked-1';
      tasksStore.insertTask({
        id: taskId,
        userId,
        title: 'Submit Operating Systems Lab',
        dueDate: '2026-10-31',
        dueTime: '23:59',
        isCompleted: false,
        priority: 'High',
        category: 'Academics',
      });

      // 2. Create corresponding reminder
      const reminderId = 'rem-linked-1';
      remindersStore.insertReminder({
        id: reminderId,
        userId,
        task: 'Submit Operating Systems Lab',
        description: null,
        scheduledAt: '2026-10-31T23:45:00Z',
        triggerAt: '2026-10-31T23:45:00Z',
        status: 'pending',
        preCastAudioPath: null,
      });

      // 3. Perform Acknowledge Action
      const result = await acknowledgeReminderAction(reminderId, userId);
      expect(result.ok).toBe(true);
      expect(result.outcome).toBe('acknowledged');

      // 4. Verify reminder status is updated to acknowledged
      const reminder = remindersStore.getReminderById(reminderId);
      expect(reminder?.status).toBe('acknowledged');

      // 5. CRITICAL SEMANTIC INVARIANT:
      // Acknowledging a reminder means the student received the alert, NOT that the task is finished!
      const allTasks = tasksStore.getAllTasks(userId);
      const underlyingTask = allTasks.find((t) => t.id === taskId);
      expect(underlyingTask).toBeDefined();
      expect(underlyingTask?.isCompleted).toBe(false);

      // Verify native alarm was cancelled and incoming call cleaned up
      expect(NativeModules.LafinaReminder.cancelAlarm).toHaveBeenCalledWith(reminderId);
      expect(NativeModules.LafinaReminder.finishIncomingCall).toHaveBeenCalledWith(reminderId);
    });

    test('auto-snooze marks reminder as missed when limit is exceeded', async () => {
      const now = Date.now();
      const trigger = new Date(now - 1000).toISOString();

      remindersStore.insertReminder({
        id: 'rem-auto-snooze',
        userId,
        task: 'Review Discrete Math',
        description: null,
        scheduledAt: trigger,
        triggerAt: trigger,
        status: 'snoozed',
        preCastAudioPath: null,
      });

      db.executeSync('UPDATE reminders SET snooze_count = 3 WHERE id = ?', ['rem-auto-snooze']);

      const result = await autoSnoozeReminderAction('rem-auto-snooze', userId);
      expect(result.ok).toBe(true);
      expect(result.outcome).toBe('missed');

      const reminder = remindersStore.getReminderById('rem-auto-snooze');
      expect(reminder?.status).toBe('missed');
    });
  });

  describe('Foreground Poller (reminderPoller.ts)', () => {
    test('triggers due reminder and emits LAFINA_CALL_TRIGGER event', async () => {
      const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit');
      const now = Date.now();
      const dueTrigger = new Date(now - 5000).toISOString();

      remindersStore.insertReminder({
        id: 'rem-poll-due',
        userId,
        task: 'Data Structures Quiz',
        description: null,
        scheduledAt: dueTrigger,
        triggerAt: dueTrigger,
        status: 'pending',
        preCastAudioPath: null,
      });

      await checkAndTriggerReminders(userId);

      const reminder = remindersStore.getReminderById('rem-poll-due');
      expect(reminder?.status).toBe('triggered');

      expect(emitSpy).toHaveBeenCalledWith(
        EVENT_CALL_TRIGGER,
        expect.objectContaining({
          reminderId: 'rem-poll-due',
          task: 'Data Structures Quiz',
        }),
      );

      emitSpy.mockRestore();
    });

    test('starts and stops foreground poller cleanly', () => {
      startReminderPoller(userId, 5000);
      stopReminderPoller();
      // Should not throw and clean up interval
    });
  });

  describe('Lifecycle Recovery & Rescheduler (reminderRescheduler.ts)', () => {
    test('reschedules future alarms, triggers near-due, and marks stale past (>15m) as missed', async () => {
      const now = Date.now();
      const futureTrigger = new Date(now + 30 * 60 * 1000).toISOString();
      const nearDueTrigger = new Date(now - 5 * 60 * 1000).toISOString(); // 5m ago (within 15m threshold)
      const staleTrigger = new Date(now - 25 * 60 * 1000).toISOString(); // 25m ago (> 15m threshold)

      remindersStore.insertReminder({
        id: 'rem-resched-future',
        userId,
        task: 'Future Lecture',
        description: null,
        scheduledAt: futureTrigger,
        triggerAt: futureTrigger,
        status: 'pending',
        preCastAudioPath: null,
      });

      remindersStore.insertReminder({
        id: 'rem-resched-near',
        userId,
        task: 'Near Due Class',
        description: null,
        scheduledAt: nearDueTrigger,
        triggerAt: nearDueTrigger,
        status: 'pending',
        preCastAudioPath: null,
      });

      remindersStore.insertReminder({
        id: 'rem-resched-stale',
        userId,
        task: 'Stale Missed Event',
        description: null,
        scheduledAt: staleTrigger,
        triggerAt: staleTrigger,
        status: 'pending',
        preCastAudioPath: null,
      });

      const summary = await rescheduleUserReminders(userId);

      expect(summary.checked).toBe(3);
      expect(summary.rescheduled).toBe(1);
      expect(summary.triggered).toBe(1);
      expect(summary.missed).toBe(1);

      // Verify future reminder was scheduled with native alarm
      expect(NativeModules.LafinaReminder.scheduleExactAlarm).toHaveBeenCalledWith(
        expect.objectContaining({ reminderId: 'rem-resched-future' }),
      );

      // Verify stale reminder status changed to missed
      const stale = remindersStore.getReminderById('rem-resched-stale');
      expect(stale?.status).toBe('missed');

      // Verify near due was marked triggered
      const near = remindersStore.getReminderById('rem-resched-near');
      expect(near?.status).toBe('triggered');
    });
  });
});
