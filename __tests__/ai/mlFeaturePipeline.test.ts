import {
  extractStudentFeatures,
  featuresToVector,
  getEwmaLatency,
  getInteractionHistory,
  getInteractionSummary,
  isPeakStudyHour,
  recordReminderInteraction,
} from '../../src/ai/ml/featureExtractor';
import {db, initDatabase} from '../../src/storage';
import {preferencesStore} from '../../src/storage/preferencesStore';
import {remindersStore} from '../../src/storage/remindersStore';
import {tasksStore} from '../../src/storage/tasksStore';
import {
  acknowledgeReminderAction,
  snoozeReminderAction,
} from '../../src/scheduler/reminderActions';

// Mock native alarm and call modules to isolate pure logic in Jest
jest.mock('../../src/scheduler/reminderAlarm', () => ({
  scheduleReminderAlarm: jest.fn().mockResolvedValue(undefined),
  cancelReminderAlarm: jest.fn().mockResolvedValue(undefined),
  finishNativeIncomingCall: jest.fn().mockResolvedValue(undefined),
  startActiveCallSession: jest.fn().mockResolvedValue(undefined),
  stopActiveCallSession: jest.fn().mockResolvedValue(undefined),
}));

describe('Phase ML-2: Student Feature Extraction & Data Pipeline', () => {
  const testUserId = 'test-student-ml-01';

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    // Clean tables before each test
    try {
      db.executeSync('DELETE FROM user_behavior_logs WHERE user_id = ?', [
        testUserId,
      ]);
      db.executeSync('DELETE FROM ml_feature_snapshots WHERE user_id = ?', [
        testUserId,
      ]);
      db.executeSync('DELETE FROM tasks WHERE user_id = ?', [testUserId]);
      db.executeSync('DELETE FROM reminders WHERE user_id = ?', [testUserId]);
      db.executeSync('DELETE FROM user_preferences WHERE user_id = ?', [
        testUserId,
      ]);
      db.executeSync('DELETE FROM users WHERE id = ?', [testUserId]);

      const now = new Date().toISOString();
      db.executeSync(
        `INSERT INTO users (
           id, username, email, role, is_new_user, time_format_24h,
           week_starts_monday, dark_mode, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          testUserId,
          'teststudent',
          'test@student.edu',
          'student',
          0,
          0,
          0,
          0,
          now,
          now,
        ],
      );
    } catch {
      // In-memory sqlite reset
    }
  });

  describe('Peak Study Hours Mapping', () => {
    it('correctly detects study peak hours based on student preference ranges', () => {
      // Morning peak: 6..9
      expect(isPeakStudyHour(7, ['morning'])).toBe(1);
      expect(isPeakStudyHour(11, ['morning'])).toBe(0);

      // Late morning: 10..11
      expect(isPeakStudyHour(10, ['late_morning'])).toBe(1);

      // Afternoon: 12..16
      expect(isPeakStudyHour(14, ['afternoon'])).toBe(1);
      expect(isPeakStudyHour(18, ['afternoon'])).toBe(0);

      // Evening: 17..20
      expect(isPeakStudyHour(19, ['evening'])).toBe(1);

      // Night: 21..23, 0..5
      expect(isPeakStudyHour(22, ['night'])).toBe(1);
      expect(isPeakStudyHour(2, ['night'])).toBe(1);

      // Multiple configured peaks
      expect(isPeakStudyHour(8, ['morning', 'evening'])).toBe(1);
      expect(isPeakStudyHour(19, ['morning', 'evening'])).toBe(1);
      expect(isPeakStudyHour(14, ['morning', 'evening'])).toBe(0);

      // Empty or invalid peaks
      expect(isPeakStudyHour(10, [])).toBe(0);
    });
  });

  describe('extractStudentFeatures & featuresToVector', () => {
    it('extracts bounded normalized features matching student state', () => {
      // Setup student preferences
      preferencesStore.save(testUserId, {
        wakeTime: '06:00',
        sleepTime: '23:00',
        studyPeakHours: ['morning', 'evening'],
        busiestDay: 'Monday',
        reminderLeadMinutes: 15,
        snoozeTendency: 'immediate',
        weeklyClassCount: '4-6',
        longestClassGap: '1 hour',
      });

      // Insert 3 pending tasks for tomorrow
      const tomorrowStr = '2026-11-08';
      tasksStore.insertTask({
        id: 'task-test-1',
        userId: testUserId,
        title: 'Submit Machine Learning Assignment',
        dueDate: tomorrowStr,
        isCompleted: false,
        priority: 'High',
        category: 'Academic',
      });
      tasksStore.insertTask({
        id: 'task-test-2',
        userId: testUserId,
        title: 'Review Chapter 4',
        dueDate: tomorrowStr,
        isCompleted: false,
        priority: 'Medium',
        category: 'Academic',
      });

      const features = extractStudentFeatures(testUserId, {
        targetDate: tomorrowStr,
        targetTime: '08:30',
        priority: 'High',
      });

      expect(features.hourOfDay).toBe(8);
      expect(features.normalizedHour).toBeCloseTo(8 / 23, 2);
      expect(features.normalizedDay).toBeGreaterThanOrEqual(0);
      expect(features.normalizedDay).toBeLessThanOrEqual(1);
      expect(features.academicLoad).toBe(2);
      expect(features.normalizedLoad).toBeCloseTo(0.2, 2);
      expect(features.isPeakStudyHour).toBe(1); // 8 is morning peak
      expect(features.priorityScore).toBe(1.0); // High priority
      expect(features.snoozeTendencyScore).toBe(0.0); // immediate

      const vector = featuresToVector(features);
      expect(vector).toHaveLength(6);
      vector.forEach(val => {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      });
    });

    it('gracefully handles missing preferences and defaults safely', () => {
      const features = extractStudentFeatures('unregistered-user-123', {
        targetTime: '15:00',
        priority: 'Low',
      });

      expect(features.hourOfDay).toBe(15);
      expect(features.academicLoad).toBe(0);
      expect(features.isPeakStudyHour).toBe(0);
      expect(features.priorityScore).toBe(0.33);
      expect(features.snoozeTendencyScore).toBe(0.33);
      expect(features.ewmaLatencySeconds).toBe(60);

      const vector = featuresToVector(features);
      expect(vector).toHaveLength(6);
    });
  });

  describe('recordReminderInteraction & EWMA Online Updates', () => {
    it('records interaction event and updates online EWMA latency snapshot', () => {
      // 1. Initial snapshot should not exist, getEwmaLatency returns default 60s
      expect(getEwmaLatency(testUserId)).toBe(60.0);

      // 2. User responds with latency = 30s
      recordReminderInteraction(testUserId, {
        reminderId: 'rem-101',
        outcome: 'acknowledged',
        latencySeconds: 30,
        channel: 'call',
      });

      // EWMA calculation: S_1 = alpha * 30 + (1 - alpha) * 60
      // 0.3 * 30 + 0.7 * 60 = 9 + 42 = 51.0
      const ewma1 = getEwmaLatency(testUserId);
      expect(ewma1).toBeCloseTo(51.0, 1);

      // 3. User responds second time with latency = 20s
      recordReminderInteraction(testUserId, {
        reminderId: 'rem-102',
        outcome: 'acknowledged',
        latencySeconds: 20,
        channel: 'call',
      });

      // S_2 = 0.3 * 20 + 0.7 * 51.0 = 6 + 35.7 = 41.7
      const ewma2 = getEwmaLatency(testUserId);
      expect(ewma2).toBeCloseTo(41.7, 1);

      // 4. Verify interaction history retrieval
      const history = getInteractionHistory(testUserId);
      expect(history).toHaveLength(2);
      expect(history[0].reminderId).toBe('rem-101');
      expect(history[0].outcome).toBe('acknowledged');
      expect(history[0].features).toHaveLength(6);
      expect(history[1].reminderId).toBe('rem-102');

      // 5. Verify interaction summary
      const summary = getInteractionSummary(testUserId);
      expect(summary.total).toBe(2);
      expect(summary.ackRate).toBe(1.0);
      expect(summary.snoozeRate).toBe(0.0);
      expect(summary.missedRate).toBe(0.0);
      expect(summary.avgLatencySeconds).toBe(25.0); // (30 + 20) / 2
      expect(summary.ewmaLatencySeconds).toBeCloseTo(41.7, 1);
    });

    it('accurately tallies snoozed and missed interactions in summary', () => {
      recordReminderInteraction(testUserId, {
        reminderId: 'rem-201',
        outcome: 'acknowledged',
        latencySeconds: 10,
      });
      recordReminderInteraction(testUserId, {
        reminderId: 'rem-202',
        outcome: 'snoozed',
        latencySeconds: 40,
        snoozeMinutes: 10,
      });
      recordReminderInteraction(testUserId, {
        reminderId: 'rem-203',
        outcome: 'missed',
        latencySeconds: 120,
      });

      const summary = getInteractionSummary(testUserId);
      expect(summary.total).toBe(3);
      expect(summary.ackRate).toBeCloseTo(1 / 3, 2);
      expect(summary.snoozeRate).toBeCloseTo(1 / 3, 2);
      expect(summary.missedRate).toBeCloseTo(1 / 3, 2);
      expect(summary.avgLatencySeconds).toBeCloseTo((10 + 40 + 120) / 3, 1);
    });
  });

  describe('Integration with Reminder Actions', () => {
    it('automatically records behavioral interaction when user acknowledges or snoozes a reminder', async () => {
      const nowMs = Date.now();
      const triggerAt = new Date(nowMs - 15000).toISOString(); // triggered 15s ago

      remindersStore.insertReminder({
        id: 'rem-act-1',
        userId: testUserId,
        task: 'Study Data Structures',
        description: null,
        scheduledAt: triggerAt,
        triggerAt,
        status: 'pending',
        preCastAudioPath: null,
      });

      // Acknowledge reminder
      const result = await acknowledgeReminderAction('rem-act-1', testUserId);
      expect(result.ok).toBe(true);
      expect(result.outcome).toBe('acknowledged');

      // Verify that behavior interaction was logged
      const history = getInteractionHistory(testUserId);
      expect(history.length).toBeGreaterThanOrEqual(1);
      const last = history[history.length - 1];
      expect(last.reminderId).toBe('rem-act-1');
      expect(last.outcome).toBe('acknowledged');
      expect(last.latencySeconds).toBeGreaterThanOrEqual(14); // ~15 seconds
    });

    it('records snooze interaction with duration when snoozing a reminder', async () => {
      const triggerAt = new Date(Date.now() - 25000).toISOString(); // 25s ago

      remindersStore.insertReminder({
        id: 'rem-act-2',
        userId: testUserId,
        task: 'Work on Capstone Documentation',
        description: null,
        scheduledAt: triggerAt,
        triggerAt,
        status: 'pending',
        preCastAudioPath: null,
      });

      const result = await snoozeReminderAction('rem-act-2', testUserId, 15);
      expect(result.ok).toBe(true);
      expect(result.outcome).toBe('snoozed');

      const history = getInteractionHistory(testUserId);
      const snoozeRecord = history.find(h => h.reminderId === 'rem-act-2');
      expect(snoozeRecord).toBeDefined();
      expect(snoozeRecord?.outcome).toBe('snoozed');
      expect(snoozeRecord?.snoozeMinutes).toBe(15);
      expect(snoozeRecord?.latencySeconds).toBeGreaterThanOrEqual(24);
    });
  });
});
