/**
 * Student Context Feature Extraction & Behavioral Data Pipeline
 * Derived from Capstone Section 2.4.8 (Personalized Reminder Timing)
 *
 * Extracts normalized behavioral signals and logs interaction outcomes
 * without blocking critical reminder execution.
 */

import {behaviorStore} from '../../storage/behaviorStore';
import {preferencesStore} from '../../storage/preferencesStore';
import type {StudyPeakHour} from '../../storage/preferencesStore';
import {tasksStore} from '../../storage/tasksStore';
import {stepEwma} from './ewma';
import type {
  ReminderInteractionRecord,
  ReminderOutcomeType,
  StudentFeatures,
} from './types';

// ponytail: direct hour lookup tables avoid regex/parsing overhead
const PEAK_HOUR_HOURS: Record<StudyPeakHour, number[]> = {
  morning: [6, 7, 8, 9],
  late_morning: [10, 11],
  afternoon: [12, 13, 14, 15, 16],
  evening: [17, 18, 19, 20],
  night: [21, 22, 23, 0, 1, 2, 3, 4, 5],
};

const SNOOZE_TENDENCY_SCORES: Record<string, number> = {
  immediate: 0.0,
  snooze_once: 0.33,
  snooze_multiple: 0.66,
  ignore: 1.0,
};

const DEFAULT_LATENCY_SECONDS = 60.0;
const EWMA_ALPHA = 0.3;
const SNAPSHOT_KEY_LATENCY_EWMA = 'adaptive_latency_ewma';

/**
 * Returns whether a given hour (0..23) coincides with the student's study peak hours.
 */
export const isPeakStudyHour = (
  hour: number,
  peakHours: StudyPeakHour[],
): number => {
  if (!peakHours || peakHours.length === 0) return 0;
  for (const peak of peakHours) {
    const hours = PEAK_HOUR_HOURS[peak];
    if (hours && hours.includes(hour)) {
      return 1;
    }
  }
  return 0;
};

/**
 * Retrieves the smoothed EWMA response latency for the user from snapshot storage.
 */
export const getEwmaLatency = (userId: string): number => {
  try {
    const snapshot = behaviorStore.getLatestFeatureSnapshot(
      userId,
      SNAPSHOT_KEY_LATENCY_EWMA,
    );
    if (snapshot && snapshot.featureVector) {
      const parsed = JSON.parse(snapshot.featureVector);
      if (typeof parsed.ewmaValue === 'number' && !isNaN(parsed.ewmaValue)) {
        return parsed.ewmaValue;
      }
    }
  } catch (error) {
    console.warn('[FeatureExtractor] Failed to read EWMA latency:', error);
  }
  return DEFAULT_LATENCY_SECONDS;
};

/**
 * Extracts a normalized feature representation of the student's context.
 */
export const extractStudentFeatures = (
  userId: string,
  options?: {
    targetDate?: string; // YYYY-MM-DD
    targetTime?: string; // HH:MM
    priority?: 'High' | 'Medium' | 'Low';
  },
): StudentFeatures => {
  const now = new Date();
  let targetHour = now.getHours();
  let targetDay = now.getDay();

  if (options?.targetTime) {
    const match = /^(\d{1,2})/.exec(options.targetTime.trim());
    if (match) {
      targetHour = Math.min(23, Math.max(0, parseInt(match[1], 10)));
    }
  }

  if (options?.targetDate) {
    const parsed = new Date(`${options.targetDate}T12:00:00`);
    if (!isNaN(parsed.getTime())) {
      targetDay = parsed.getDay();
    }
  }

  // Calculate academic load: pending tasks due on or before target date
  let academicLoad = 0;
  try {
    const tasks = tasksStore.getAllTasks(userId);
    const dateFilter = options?.targetDate;
    academicLoad = tasks.filter(
      t =>
        !t.isCompleted &&
        (!dateFilter || !t.dueDate || t.dueDate <= dateFilter),
    ).length;
  } catch (error) {
    console.warn(
      '[FeatureExtractor] Failed to calculate academic load:',
      error,
    );
  }

  // Read student preferences
  let peakHours: StudyPeakHour[] = [];
  let snoozeScore = 0.33;
  try {
    const prefs = preferencesStore.get(userId);
    if (prefs) {
      peakHours = prefs.studyPeakHours || [];
      snoozeScore = SNOOZE_TENDENCY_SCORES[prefs.snoozeTendency] ?? snoozeScore;
    }
  } catch (error) {
    console.warn('[FeatureExtractor] Failed to load preferences:', error);
  }

  // Priority score mapping
  let priorityScore = 0.66;
  if (options?.priority === 'High') priorityScore = 1.0;
  else if (options?.priority === 'Low') priorityScore = 0.33;

  const ewmaLatency = getEwmaLatency(userId);

  return {
    hourOfDay: targetHour,
    dayOfWeek: targetDay,
    normalizedHour: Number((targetHour / 23).toFixed(4)),
    normalizedDay: Number((targetDay / 6).toFixed(4)),
    academicLoad,
    normalizedLoad: Number((Math.min(academicLoad, 10) / 10).toFixed(4)),
    isPeakStudyHour: isPeakStudyHour(targetHour, peakHours),
    priorityScore,
    snoozeTendencyScore: snoozeScore,
    ewmaLatencySeconds: Number(ewmaLatency.toFixed(2)),
  };
};

/**
 * Converts student features into a flat 6-dimensional numeric vector for ML models.
 * Dimensions: [normalizedHour, normalizedDay, normalizedLoad, isPeakStudyHour, priorityScore, snoozeTendencyScore]
 */
export const featuresToVector = (features: StudentFeatures): number[] => [
  features.normalizedHour,
  features.normalizedDay,
  features.normalizedLoad,
  features.isPeakStudyHour,
  features.priorityScore,
  features.snoozeTendencyScore,
];

/**
 * Records a reminder interaction event non-blockingly and updates the user's EWMA latency.
 */
export const recordReminderInteraction = (
  userId: string,
  event: {
    reminderId: string;
    outcome: ReminderOutcomeType;
    latencySeconds: number;
    snoozeMinutes?: number;
    channel?: 'call' | 'notification' | 'manual';
  },
): void => {
  try {
    const timestamp = new Date().toISOString();
    const currentFeatures = extractStudentFeatures(userId);
    const featureVector = featuresToVector(currentFeatures);

    const record: ReminderInteractionRecord = {
      ...event,
      features: featureVector,
      timestamp,
    };

    // 1. Log behavior event
    behaviorStore.logBehaviorEvent(
      userId,
      'reminder_interaction',
      event.outcome,
      JSON.stringify(record),
    );

    // 2. Update online EWMA latency snapshot if latency is a valid positive number
    if (
      typeof event.latencySeconds === 'number' &&
      !isNaN(event.latencySeconds) &&
      event.latencySeconds >= 0
    ) {
      let previousEwma = DEFAULT_LATENCY_SECONDS;
      let sampleCount = 0;
      const latestSnapshot = behaviorStore.getLatestFeatureSnapshot(
        userId,
        SNAPSHOT_KEY_LATENCY_EWMA,
      );

      if (latestSnapshot && latestSnapshot.featureVector) {
        try {
          const parsed = JSON.parse(latestSnapshot.featureVector);
          if (typeof parsed.ewmaValue === 'number') {
            previousEwma = parsed.ewmaValue;
            sampleCount = parsed.sampleCount || 0;
          }
        } catch {
          // ignore corrupted snapshot, start fresh
        }
      }

      const nextEwma = stepEwma(previousEwma, event.latencySeconds, EWMA_ALPHA);
      behaviorStore.saveFeatureSnapshot(
        userId,
        SNAPSHOT_KEY_LATENCY_EWMA,
        JSON.stringify({
          ewmaValue: Number(nextEwma.toFixed(2)),
          sampleCount: sampleCount + 1,
          lastLatencySeconds: event.latencySeconds,
          lastUpdatedAt: timestamp,
        }),
      );
    }
  } catch (error) {
    // Non-blocking: never disrupt the user's interaction
    console.error('[FeatureExtractor] Failed to record interaction:', error);
  }
};

/**
 * Retrieves the chronological history of reminder interactions for a user.
 */
export const getInteractionHistory = (
  userId: string,
): ReminderInteractionRecord[] => {
  try {
    const logs = behaviorStore.getBehaviorLogs(userId, 'reminder_interaction');
    return logs
      .map(log => {
        try {
          return JSON.parse(log.eventValue) as ReminderInteractionRecord;
        } catch {
          return null;
        }
      })
      .filter((rec): rec is ReminderInteractionRecord => rec !== null);
  } catch (error) {
    console.warn(
      '[FeatureExtractor] Failed to get interaction history:',
      error,
    );
    return [];
  }
};

/**
 * Calculates aggregate summary statistics from the user's interaction logs.
 */
export const getInteractionSummary = (
  userId: string,
): {
  total: number;
  ackRate: number;
  snoozeRate: number;
  missedRate: number;
  avgLatencySeconds: number;
  ewmaLatencySeconds: number;
} => {
  const history = getInteractionHistory(userId);
  const ewmaLatencySeconds = getEwmaLatency(userId);

  if (history.length === 0) {
    return {
      total: 0,
      ackRate: 0,
      snoozeRate: 0,
      missedRate: 0,
      avgLatencySeconds: 0,
      ewmaLatencySeconds,
    };
  }

  let acks = 0;
  let snoozes = 0;
  let misses = 0;
  let totalLatency = 0;

  for (const item of history) {
    if (item.outcome === 'acknowledged') acks++;
    else if (item.outcome === 'snoozed' || item.outcome === 'auto_snoozed')
      snoozes++;
    else if (item.outcome === 'missed') misses++;

    totalLatency += Math.max(0, item.latencySeconds || 0);
  }

  const total = history.length;
  return {
    total,
    ackRate: Number((acks / total).toFixed(3)),
    snoozeRate: Number((snoozes / total).toFixed(3)),
    missedRate: Number((misses / total).toFixed(3)),
    avgLatencySeconds: Number((totalLatency / total).toFixed(1)),
    ewmaLatencySeconds,
  };
};
