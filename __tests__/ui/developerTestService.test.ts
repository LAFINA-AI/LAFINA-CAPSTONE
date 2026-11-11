import { DeviceEventEmitter } from 'react-native';
import { db, initDatabase, userStore, tasksStore, notesStore, remindersStore, syncOutboxStore, syncStateStore } from '../../src/storage';
import {
  developerTestService,
  DEV_FIXTURE_TAG,
} from '../../src/ui/components/profile/developerTestService';
import { EVENT_CALL_TRIGGER } from '../../src/scheduler';

describe('developerTestService', () => {
  const TEST_USER = 'dev-test-user-01';

  beforeAll(async () => {
    await initDatabase();
    userStore.createGuestUser();
    // Ensure test user exists in users table
    try {
      db.executeSync(
        `INSERT OR IGNORE INTO users (id, username, email, is_new_user, created_at, updated_at)
         VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))`,
        [TEST_USER, 'devtester', 'dev@test.local'],
      );
    } catch {
      // Ignore
    }
  });

  afterEach(async () => {
    await developerTestService.clearSeededStudentData(TEST_USER);
    await developerTestService.cancelAllTestReminders(TEST_USER);
  });

  describe('Developer Mode Toggle', () => {
    it('sets and reads developer mode from local settings', () => {
      developerTestService.setDeveloperModeEnabled(true);
      expect(developerTestService.isDeveloperModeEnabled()).toBe(true);

      developerTestService.setDeveloperModeEnabled(false);
      expect(developerTestService.isDeveloperModeEnabled()).toBe(false);
    });
  });

  describe('Immediate Call Trigger', () => {
    it('creates a test reminder and emits EVENT_CALL_TRIGGER', async () => {
      const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit');

      const result = await developerTestService.triggerImmediateCall(
        TEST_USER,
        'Midterm Defense Call',
      );

      expect(result.success).toBe(true);
      expect(result.reminderId).toBeDefined();

      expect(emitSpy).toHaveBeenCalledWith(
        EVENT_CALL_TRIGGER,
        expect.objectContaining({
          reminderId: result.reminderId,
          ownerId: TEST_USER,
          task: expect.stringContaining('Midterm Defense Call'),
        }),
      );

      emitSpy.mockRestore();
    });
  });

  describe('Schedule Exact Alarm', () => {
    it('creates a future reminder and arms delivery job', async () => {
      const result = await developerTestService.scheduleExactAlarmInSeconds(
        TEST_USER,
        10,
        'Study Reminder',
      );

      expect(result.success).toBe(true);
      expect(result.reminderId).toBeDefined();

      const reminder = remindersStore.getReminderById(result.reminderId!);
      expect(reminder).toBeDefined();
      expect(reminder?.task).toContain('Study Reminder');
      expect(reminder?.status).toBe('pending');
    });
  });

  describe('Cancel Test Reminders', () => {
    it('cancels pending test reminders tagged with DEV_FIXTURE_TAG', async () => {
      await developerTestService.scheduleExactAlarmInSeconds(TEST_USER, 30, 'Test 1');
      await developerTestService.scheduleExactAlarmInSeconds(TEST_USER, 60, 'Test 2');

      const cancelResult = await developerTestService.cancelAllTestReminders(TEST_USER);
      expect(cancelResult.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Student Sample Data Seeding & Cleanup', () => {
    it('seeds courses, tasks, events, time blocks, reminders, and notes', async () => {
      const seedResult = await developerTestService.seedStudentSampleData(TEST_USER);
      expect(seedResult.success).toBe(true);
      expect(seedResult.created.tasks).toBeGreaterThanOrEqual(3);
      expect(seedResult.created.events).toBeGreaterThanOrEqual(3);
      expect(seedResult.created.timeBlocks).toBe(1);
      expect(seedResult.created.reminders).toBe(2);
      expect(seedResult.created.notes).toBe(2);

      // Verify records in stores
      const tasks = tasksStore.getAllTasks(TEST_USER);
      expect(tasks.some(t => t.title.includes(DEV_FIXTURE_TAG))).toBe(true);

      const events = tasksStore.getAllEvents(TEST_USER);
      expect(events.some(e => e.title.includes(DEV_FIXTURE_TAG))).toBe(true);

      const notes = notesStore.getAll(TEST_USER);
      expect(notes.some(n => n.title.includes(DEV_FIXTURE_TAG))).toBe(true);

      // Test diagnostics
      const diag = developerTestService.getDatabaseDiagnostics(TEST_USER);
      expect(diag.counts.tasks).toBeGreaterThanOrEqual(3);
      expect(diag.counts.events).toBeGreaterThanOrEqual(3);
      expect(diag.counts.notes).toBeGreaterThanOrEqual(2);

      // Clean up seeded data
      const cleanResult = await developerTestService.clearSeededStudentData(TEST_USER);
      expect(cleanResult.success).toBe(true);
      expect(cleanResult.removed).toBeGreaterThan(0);

      const remainingTasks = tasksStore.getAllTasks(TEST_USER).filter(t => t.title.includes(DEV_FIXTURE_TAG));
      expect(remainingTasks.length).toBe(0);
    });
  });

  describe('Sync Diagnostics and Outbox Controls', () => {
    it('gathers sync diagnostics and clears outbox', () => {
      syncStateStore.save(TEST_USER, {
        status: 'Synced',
        cursor: 42,
        lastSyncedAt: new Date().toISOString(),
        errorMessage: null,
      });

      // Enqueue a test mutation
      syncOutboxStore.enqueueMutation(
        TEST_USER,
        'task',
        'task-dev-999',
        'create',
        { title: 'Sync test' },
      );

      const diag = developerTestService.getSyncDiagnostics(TEST_USER);
      expect(diag.cursor).toBe(42);
      expect(diag.outboxCount).toBeGreaterThanOrEqual(1);

      // Clear outbox
      const cleared = developerTestService.clearSyncOutbox(TEST_USER);
      expect(cleared).toBeGreaterThanOrEqual(1);

      const afterDiag = developerTestService.getSyncDiagnostics(TEST_USER);
      expect(afterDiag.outboxCount).toBe(0);

      // Reset cursor
      developerTestService.resetSyncCursor(TEST_USER);
      const resetDiag = developerTestService.getSyncDiagnostics(TEST_USER);
      expect(resetDiag.cursor).toBe(0);
    });
  });

  describe('NLU Intent Playground', () => {
    it('parses natural language commands through IntentService', async () => {
      const intent = await developerTestService.testNluIntent(
        'Remind me to study algorithms at 7 PM',
        new Date('2026-11-11T10:00:00Z'),
      );

      expect(intent.intent).toBe('create_reminder');
      expect(intent.title).toBeDefined();
      expect(intent.time).toBeDefined();
    });

    it('executes validated intent and creates record', async () => {
      const intent = await developerTestService.testNluIntent(
        'Add assignment CS402 Capstone due tomorrow 5pm',
        new Date('2026-11-11T10:00:00Z'),
      );

      const result = await developerTestService.executeNluIntent(intent, TEST_USER);
      expect(result.success).toBe(true);
      expect(result.reply).toBeDefined();
    });
  });
});
