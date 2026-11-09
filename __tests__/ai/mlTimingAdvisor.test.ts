import {
  getAdaptiveScheduleRecommendation,
  isAdaptiveTimingEnabled,
  MIN_LEAD_OFFSET_MINUTES,
  MAX_LEAD_OFFSET_MINUTES,
  SETTING_KEY_ADAPTIVE_TIMING,
} from '../../src/ai/ml/timingAdvisor';
import {recordReminderInteraction} from '../../src/ai/ml/featureExtractor';
import {db, initDatabase} from '../../src/storage';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {preferencesStore} from '../../src/storage/preferencesStore';
import {remindersStore} from '../../src/storage/remindersStore';
import {tasksStore} from '../../src/storage/tasksStore';
import {executeNluAction} from '../../src/ai/nlu/actionExecutor';

jest.mock('../../src/scheduler/reminderAlarm', () => ({
  scheduleReminderAlarm: jest.fn().mockResolvedValue(undefined),
  cancelReminderAlarm: jest.fn().mockResolvedValue(undefined),
  finishNativeIncomingCall: jest.fn().mockResolvedValue(undefined),
  startActiveCallSession: jest.fn().mockResolvedValue(undefined),
  stopActiveCallSession: jest.fn().mockResolvedValue(undefined),
}));

describe('Phase ML-3: Machine Learning Adaptive Timing Advisor', () => {
  const testUserId = 'student-advisor-001';

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
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
      db.executeSync('DELETE FROM local_settings WHERE user_id = ?', [
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
          'advisorstudent',
          'adv@student.edu',
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

  describe('Adaptive Timing Setting & Cold-Start Guardrails', () => {
    it('defaults to enabled and toggles properly via local settings', () => {
      expect(isAdaptiveTimingEnabled(testUserId)).toBe(true);

      localSettingsStore.set(testUserId, SETTING_KEY_ADAPTIVE_TIMING, 'false');
      expect(isAdaptiveTimingEnabled(testUserId)).toBe(false);

      localSettingsStore.set(testUserId, SETTING_KEY_ADAPTIVE_TIMING, 'true');
      expect(isAdaptiveTimingEnabled(testUserId)).toBe(true);
    });

    it('returns rule fallback during cold-start (history < 5)', () => {
      // Log only 3 interactions (under the minimum threshold of 5)
      for (let i = 1; i <= 3; i++) {
        recordReminderInteraction(testUserId, {
          reminderId: `rem-cold-${i}`,
          outcome: 'acknowledged',
          latencySeconds: 15,
        });
      }

      const originalTime = '2026-11-09T09:00:00.000Z';
      const recommendation = getAdaptiveScheduleRecommendation(testUserId, {
        scheduledAtIso: originalTime,
        priority: 'High',
      });

      expect(recommendation.source).toBe('rule_fallback');
      expect(recommendation.offsetMinutes).toBe(0);
      expect(recommendation.recommendedTriggerAt).toBe(originalTime);
      expect(recommendation.confidence).toBe(0.5);
      expect(recommendation.reason).toContain('Cold start');
    });

    it('returns rule fallback when student explicitly disables adaptive timing', () => {
      // Seed 6 samples so cold-start passes
      for (let i = 1; i <= 6; i++) {
        recordReminderInteraction(testUserId, {
          reminderId: `rem-seeded-${i}`,
          outcome: 'acknowledged',
          latencySeconds: 20,
        });
      }

      // Explicitly disable
      localSettingsStore.set(testUserId, SETTING_KEY_ADAPTIVE_TIMING, 'false');

      const originalTime = '2026-11-09T09:00:00.000Z';
      const rec = getAdaptiveScheduleRecommendation(testUserId, {
        scheduledAtIso: originalTime,
      });

      expect(rec.source).toBe('rule_fallback');
      expect(rec.offsetMinutes).toBe(0);
      expect(rec.recommendedTriggerAt).toBe(originalTime);
      expect(rec.reason).toContain('disabled by user preference');
    });
  });

  describe('Active Multi-Model Ensemble Prediction', () => {
    it('uses EWMA, KNN, and Random Forest ensemble when student interaction history >= 5', () => {
      preferencesStore.save(testUserId, {
        wakeTime: '06:30',
        sleepTime: '23:00',
        studyPeakHours: ['morning'],
        busiestDay: 'Monday',
        reminderLeadMinutes: 15,
        snoozeTendency: 'snooze_multiple',
        weeklyClassCount: '7+',
        longestClassGap: '30 min',
      });

      // Insert multiple pending tasks to create academic workload
      for (let i = 1; i <= 5; i++) {
        tasksStore.insertTask({
          id: `task-load-${i}`,
          userId: testUserId,
          title: `Study Session ${i}`,
          dueDate: '2026-11-09',
          isCompleted: false,
          priority: 'High',
          category: 'Academic',
        });
      }

      // Seed 6 interaction samples where student frequently snoozed or had high latency
      for (let i = 1; i <= 6; i++) {
        recordReminderInteraction(testUserId, {
          reminderId: `rem-hist-${i}`,
          outcome: i % 2 === 0 ? 'snoozed' : 'acknowledged',
          latencySeconds: 110, // high latency
          snoozeMinutes: 10,
          channel: 'call',
        });
      }

      const scheduledAtIso = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      const rec = getAdaptiveScheduleRecommendation(testUserId, {
        scheduledAtIso,
        priority: 'High',
      });

      // Verified: source is ml_ensemble
      expect(rec.source).toBe('ml_ensemble');
      expect(rec.confidence).toBeGreaterThan(0.3);
      expect(rec.confidence).toBeLessThanOrEqual(1.0);

      // Verified: under heavy workload and snooze tendency, Random Forest recommends earlier alert (negative offset)
      expect(rec.offsetMinutes).toBeLessThan(0);
      expect(rec.offsetMinutes).toBeGreaterThanOrEqual(MIN_LEAD_OFFSET_MINUTES);
      expect(rec.offsetMinutes).toBeLessThanOrEqual(MAX_LEAD_OFFSET_MINUTES);

      // Verified: KNN recommends high-salience 'call' channel because of past snoozes and high latency
      expect(rec.channelRecommendation).toBe('call');

      // Verified: trigger timestamp shifted earlier than original
      const origMs = new Date(scheduledAtIso).getTime();
      const recMs = new Date(rec.recommendedTriggerAt).getTime();
      expect(recMs).toBeLessThan(origMs);
    });

    it('enforces strict clamping boundaries [-30, +15] minutes', () => {
      // Seed samples with extreme latency
      for (let i = 1; i <= 8; i++) {
        recordReminderInteraction(testUserId, {
          reminderId: `rem-extreme-${i}`,
          outcome: 'missed',
          latencySeconds: 600, // 10 minutes latency
          channel: 'call',
        });
      }

      const originalIso = '2026-11-09T14:00:00.000Z';
      const rec = getAdaptiveScheduleRecommendation(testUserId, {
        scheduledAtIso: originalIso,
        priority: 'High',
      });

      expect(rec.offsetMinutes).toBeGreaterThanOrEqual(-30);
      expect(rec.offsetMinutes).toBeLessThanOrEqual(15);
    });

    it('gracefully survives corrupted/invalid timestamps by returning fallback', () => {
      const rec = getAdaptiveScheduleRecommendation(testUserId, {
        scheduledAtIso: 'not-a-valid-date-string',
      });

      expect(rec.source).toBe('rule_fallback');
      expect(rec.offsetMinutes).toBe(0);
    });
  });

  describe('End-to-End Scheduling Integration via Action Executor', () => {
    it('applies adaptive trigger computation when user creates reminder through NLU', async () => {
      // Seed 6 baseline interactions
      for (let i = 1; i <= 6; i++) {
        recordReminderInteraction(testUserId, {
          reminderId: `rem-nlu-${i}`,
          outcome: 'acknowledged',
          latencySeconds: 30,
        });
      }

      const result = await executeNluAction(testUserId, {
        intent: 'create_reminder',
        isValid: true,
        confidence: 1.0,
        source: 'fast_path',
        rawTranscript: 'create reminder for chapter 3',
        category: 'Academic',
        title: 'Submit Capstone Chapter 3',
        date: '2026-11-10',
        time: '14:00',
        endTime: null,
        durationMinutes: null,
        details: null,
        snoozeMinutes: null,
        priority: 'High',
      });

      expect(result.success).toBe(true);
      expect(result.intent).toBe('create_reminder');

      // Check stored reminder in remindersStore
      const reminders = remindersStore.getPendingReminders(testUserId);
      const created = reminders.find(
        r => r.task === 'Submit Capstone Chapter 3',
      );
      expect(created).toBeDefined();

      // scheduledAt retains the exact requested time (14:00 local time)
      expect(created?.scheduledAt).toBeDefined();
      expect(new Date(created!.scheduledAt).getTime()).toBe(
        new Date('2026-11-10T14:00:00').getTime(),
      );

      // triggerAt is a valid ISO timestamp
      expect(created?.triggerAt).toBeDefined();
      const triggerDate = new Date(created!.triggerAt);
      expect(isNaN(triggerDate.getTime())).toBe(false);
    });
  });
});
