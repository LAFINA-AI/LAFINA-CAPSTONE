import { db } from './database';
import { behaviorStore } from './behaviorStore';
import { preferencesStore } from './preferencesStore';
import type { UserPreferences } from './preferencesStore';
import { userStore } from './userStore';

const getAcademicLoadScore = (classCount: UserPreferences['weeklyClassCount']): number => {
  if (classCount === '1-3') return 1;
  if (classCount === '4-6') return 2;
  return 3;
};

const getFreeTimeGapHours = (gap: UserPreferences['longestClassGap']): number => {
  if (gap === 'None') return 0;
  if (gap === '30 min') return 0.5;
  if (gap === '1 hour') return 1;
  return 2;
};

export const completeUserOnboarding = (
  userId: string,
  preferences: UserPreferences,
): void => {
  db.transactionSync(tx => {
    preferencesStore.save(userId, preferences, tx);

    behaviorStore.logBehaviorEvent(
      userId,
      'onboarding_response',
      'typical_wake_time',
      preferences.wakeTime,
      tx,
    );
    behaviorStore.logBehaviorEvent(
      userId,
      'onboarding_response',
      'typical_sleep_time',
      preferences.sleepTime,
      tx,
    );
    behaviorStore.logBehaviorEvent(
      userId,
      'onboarding_response',
      'study_peak_hours',
      JSON.stringify(preferences.studyPeakHours),
      tx,
    );
    behaviorStore.logBehaviorEvent(
      userId,
      'onboarding_response',
      'busiest_day',
      preferences.busiestDay,
      tx,
    );
    behaviorStore.logBehaviorEvent(
      userId,
      'onboarding_response',
      'preferred_reminder_lead_time',
      String(preferences.reminderLeadMinutes),
      tx,
    );
    behaviorStore.logBehaviorEvent(
      userId,
      'onboarding_response',
      'reminder_response_tendency',
      preferences.snoozeTendency,
      tx,
    );
    behaviorStore.logBehaviorEvent(
      userId,
      'onboarding_response',
      'weekly_class_count',
      preferences.weeklyClassCount,
      tx,
    );
    behaviorStore.logBehaviorEvent(
      userId,
      'onboarding_response',
      'longest_class_gap',
      preferences.longestClassGap,
      tx,
    );

    behaviorStore.saveFeatureSnapshot(
      userId,
      'schedule_preference',
      JSON.stringify({
        preferredStudyTimes: preferences.studyPeakHours,
        busiestDay: preferences.busiestDay,
        typicalWakeTime: preferences.wakeTime,
        typicalSleepTime: preferences.sleepTime,
        reminderLeadMinutes: preferences.reminderLeadMinutes,
        reminderSnoozeBehavior: preferences.snoozeTendency,
        academicLoadScore: getAcademicLoadScore(preferences.weeklyClassCount),
        freeTimeGapsHours: getFreeTimeGapHours(preferences.longestClassGap),
      }),
      tx,
    );

    userStore.markOnboardingComplete(userId, tx);
  });
};
